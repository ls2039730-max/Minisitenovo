import jwt from 'jsonwebtoken';
import { User } from '../../src/types/saas.js';

const JWT_SECRET = process.env.AUTH_SECRET || 'localhub-saas-production-auth-secret-key-32chars';
const TOKEN_EXPIRY = '8h';

export interface JwtSessionPayload {
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

export function generateSessionToken(
  user: User,
  impersonationContext?: {
    impersonatedTenantId: string;
    originalAdmin: User;
  }
): string {
  const payload: JwtSessionPayload = {
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

  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifySessionToken(token: string): JwtSessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtSessionPayload;
  } catch (err) {
    return null;
  }
}
