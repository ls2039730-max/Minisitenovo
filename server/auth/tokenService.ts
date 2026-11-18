import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../../src/types/saas.js';

const JWT_SECRET = process.env.AUTH_SECRET || 'localhub-saas-production-auth-secret-key-32chars';
const TOKEN_EXPIRY = '8h';
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

export interface JwtSessionPayload {
  jti?: string;
  userId: string;
  email?: string;
  name?: string;
  role: string;
  tenantId: string | null;
  // Impersonation metadata
  isImpersonating?: boolean;
  impersonatedTenantId?: string;
  originalAdminUserId?: string;
  originalAdminUserName?: string;
  iat?: number;
  exp?: number;
}

// Server-side token revocation registry (tracks logged-out JTIs and user-wide revocations)
const revokedTokenJtis = new Map<string, number>();
const revokedRawTokens = new Map<string, number>();
const userRevokedBeforeSec = new Map<string, number>();

function pruneRevokedEntries() {
  const now = Date.now();
  for (const [jti, expiresAt] of revokedTokenJtis.entries()) {
    if (expiresAt <= now) {
      revokedTokenJtis.delete(jti);
    }
  }
  for (const [tok, expiresAt] of revokedRawTokens.entries()) {
    if (expiresAt <= now) {
      revokedRawTokens.delete(tok);
    }
  }
}

export function generateSessionToken(
  user: User,
  impersonationContext?: {
    impersonatedTenantId: string;
    originalAdmin: User;
  },
  customExpiresIn?: string | number
): string {
  const payload: JwtSessionPayload = {
    jti: crypto.randomUUID(),
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: impersonationContext ? impersonationContext.impersonatedTenantId : user.tenantId,
    ...(impersonationContext
      ? {
          isImpersonating: true,
          impersonatedTenantId: impersonationContext.impersonatedTenantId,
          originalAdminUserId: impersonationContext.originalAdmin.id,
          originalAdminUserName: impersonationContext.originalAdmin.name,
        }
      : {}),
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: (customExpiresIn ?? TOKEN_EXPIRY) as any,
  });
}

export function revokeSessionToken(token: string): JwtSessionPayload | null {
  if (!token) return null;
  pruneRevokedEntries();
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as JwtSessionPayload;
    const expMs = decoded?.exp ? decoded.exp * 1000 : Date.now() + TOKEN_TTL_MS;
    if (decoded?.jti) {
      revokedTokenJtis.set(decoded.jti, expMs);
    }
    revokedRawTokens.set(token, expMs);
    return decoded;
  } catch {
    revokedRawTokens.set(token, Date.now() + TOKEN_TTL_MS);
    return null;
  }
}

export function revokeAllUserSessions(userId: string): void {
  if (!userId) return;
  userRevokedBeforeSec.set(userId, Math.floor(Date.now() / 1000));
}

export function verifySessionToken(token: string): JwtSessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  pruneRevokedEntries();

  if (revokedRawTokens.has(token)) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtSessionPayload;
    if (!decoded || !decoded.userId) {
      return null;
    }

    if (decoded.jti && revokedTokenJtis.has(decoded.jti)) {
      return null;
    }

    const userRevokedAt = userRevokedBeforeSec.get(decoded.userId);
    if (userRevokedAt && decoded.iat && decoded.iat < userRevokedAt) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}
