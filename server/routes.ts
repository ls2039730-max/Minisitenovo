import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { supabaseAdmin, isRealSupabaseConfigured } from './supabaseAdmin.js';
import { repo } from './db/repository.js';
import { siteRepo } from './db/siteRepository.js';
import { productRepo } from './db/productRepository.js';
import { orderRepo } from './db/orderRepository.js';
import { serviceRepo } from './db/serviceRepository.js';
import { appointmentRepo } from './db/appointmentRepository.js';
import { restaurantRepo } from './db/restaurantRepository.js';
import { generateSessionToken, verifySessionToken, JwtSessionPayload } from './auth/tokenService.js';
import { SYSTEM_FEATURES } from '../src/utils/features.js';
import { User, Tenant, TenantStatus, FeatureKey } from '../src/types/saas.js';
import { Professional, ProfessionalPayload } from '../src/types/service.js';
import { canTenantOperate, resolveSlugFromHost, validateSlug, getServerBaseDomain } from './tenantResolver.js';
import { storageService } from './storage/storageService.js';
import { handlePublicSiteHtml } from './seoRenderer.js';
import { geocodeAddressServer, lookupPostalCodeServer } from './services/routingService.js';
import { restaurantAnalyticsService } from './services/restaurantAnalyticsService.js';

export const apiRouter = Router();

// Extend Request interface
export interface AuthenticatedRequest extends Request {
  user?: User;
  sessionPayload?: JwtSessionPayload;
}

// ==========================================
// MIDDLEWARE: AUTHENTICATION & SESSION
// ==========================================
export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  let token: string | undefined;

  // 1. Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // 2. Check HttpOnly cookie
  if (!token && req.cookies && req.cookies.saas_auth_token) {
    token = req.cookies.saas_auth_token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Token de autenticação não fornecido ou sessão expirada.',
    });
  }

  const decoded = verifySessionToken(token);
  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: 'Sessão inválida ou expirada. Por favor, autentique-se novamente.',
    });
  }

  const user = await repo.findUserById(decoded.userId, decoded);
  if (!user || user.status === 'inactive') {
    return res.status(401).json({
      success: false,
      error: 'Usuário não encontrado ou desativado pelo administrador.',
    });
  }

  req.user = user;
  req.sessionPayload = decoded;
  next();
}

function getAuthCookieOptions(req: Request, maxAgeMs = 8 * 60 * 60 * 1000) {
  const forwardedProto = (req.headers['x-forwarded-proto'] as string) || '';
  const isSecure =
    req.secure ||
    forwardedProto.includes('https') ||
    process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: (isSecure ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

// Helper: get effective tenant ID strictly verified
export function getEffectiveTenantId(req: AuthenticatedRequest): string {
  if (req.sessionPayload?.isImpersonating && req.sessionPayload.impersonatedTenantId) {
    return req.sessionPayload.impersonatedTenantId;
  }
  // Super Admin can switch or manage any tenant
  if (req.user?.role === 'SUPER_ADMIN') {
    if (req.body?.tenantId && typeof req.body.tenantId === 'string') {
      return req.body.tenantId;
    }
    if (req.query?.tenantId && typeof req.query.tenantId === 'string') {
      return req.query.tenantId as string;
    }
    if (req.headers['x-tenant-id'] && typeof req.headers['x-tenant-id'] === 'string') {
      return req.headers['x-tenant-id'] as string;
    }
    return req.user?.tenantId || 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  }
  // Regular tenant users: strictly locked to their authenticated tenantId!
  if (req.user?.tenantId) {
    const attemptedTenantId =
      (req.body?.tenantId && typeof req.body.tenantId === 'string' ? req.body.tenantId : null) ||
      (req.query?.tenantId && typeof req.query.tenantId === 'string' ? (req.query.tenantId as string) : null) ||
      (req.headers['x-tenant-id'] && typeof req.headers['x-tenant-id'] === 'string' ? (req.headers['x-tenant-id'] as string) : null);
    if (attemptedTenantId && attemptedTenantId !== req.user.tenantId) {
      throw new Error('Acesso negado: você não tem permissão para visualizar ou alterar dados de outro estabelecimento.');
    }
    return req.user.tenantId;
  }
  throw new Error('Tenant não especificado ou usuário sem tenant vinculado.');
}

// Middleware: Blocks users with PROFESSIONAL role from administrative operations
export function requireNonProfessional(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Não autenticado.' });
  }
  if (req.user.role === 'PROFESSIONAL') {
    return res.status(403).json({
      success: false,
      code: 'FORBIDDEN_PROFESSIONAL_ROLE',
      error: 'Acesso negado: usuários com perfil Profissional possuem acesso restrito exclusivamente à própria Agenda.',
    });
  }
  next();
}

// Helper: Get linked professional for authenticated user with role PROFESSIONAL
export async function getLinkedProfessionalForUser(req: AuthenticatedRequest): Promise<Professional | null> {
  if (!req.user || req.user.role !== 'PROFESSIONAL') return null;
  const tenantId = getEffectiveTenantId(req);
  if (!tenantId) return null;
  return await serviceRepo.getProfessionalByUserId(req.user.id, tenantId);
}

// Middleware: Super Admin only
export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado: requer privilégios de Super Admin.',
    });
  }
  next();
}

// Middleware: Strict Multi-Tenant Isolation
export function requireTenantAccess(paramKey: string = 'id') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Não autenticado.' });
    }

    const requestedTenantId = req.params[paramKey] || req.body?.tenantId;

    // 1. Super Admin without active impersonation has universal access
    if (req.user.role === 'SUPER_ADMIN' && !req.sessionPayload?.isImpersonating) {
      return next();
    }

    // 2. Active Impersonation mode
    if (req.sessionPayload?.isImpersonating) {
      const allowedTenantId = req.sessionPayload.impersonatedTenantId;
      if (
        (req.params[paramKey] && req.params[paramKey] !== allowedTenantId) ||
        (req.body?.tenantId && req.body.tenantId !== allowedTenantId) ||
        (req.query?.tenantId && req.query.tenantId !== allowedTenantId)
      ) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: em modo de visualização administrativa você só pode acessar o tenant selecionado.',
        });
      }
      return next();
    }

    // 3. Normal Client Admin: MUST match authenticated user tenantId in params, body and query
    const authedTenantId = req.user.tenantId;
    if (
      !authedTenantId ||
      (req.params[paramKey] && req.params[paramKey] !== authedTenantId) ||
      (req.body?.tenantId && req.body.tenantId !== authedTenantId) ||
      (req.query?.tenantId && req.query.tenantId !== authedTenantId)
    ) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado: você não tem permissão para visualizar ou alterar dados de outro estabelecimento.',
      });
    }

    next();
  };
}

// Middleware: Feature Gate enforcement directly in backend
export function requireFeature(featureKey: FeatureKey) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Não autenticado.' });
    }

    // Role PROFESSIONAL is restricted strictly to agenda/appointments, own professional profile, and reading services
    if (req.user.role === 'PROFESSIONAL') {
      const allowedFeaturesForProfessional: FeatureKey[] = ['appointments', 'professionals', 'services'];
      if (!allowedFeaturesForProfessional.includes(featureKey)) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_PROFESSIONAL_ROLE',
          error: `Acesso negado: usuários com perfil Profissional têm acesso exclusivo à Agenda e não podem acessar o módulo "${featureKey}".`,
        });
      }
    }

    // Super Admin has universal access
    if (req.user.role === 'SUPER_ADMIN' && !req.sessionPayload?.isImpersonating) {
      return next();
    }

    const tenantId = req.sessionPayload?.isImpersonating
      ? req.sessionPayload.impersonatedTenantId
      : req.user.tenantId;

    if (!tenantId) {
      return res.status(403).json({ success: false, error: 'Usuário não vinculado a um tenant.' });
    }

    const resolved = await repo.resolveTenantFeatures(tenantId);
    if (!resolved[featureKey]) {
      return res.status(403).json({
        success: false,
        error: `O recurso "${featureKey}" está desativado para a sua empresa pelo administrador da plataforma.`,
      });
    }

    next();
  };
}

// ==========================================
// 1. RUNTIME CONFIG & TENANT RESOLVER
// ==========================================

apiRouter.get('/config', (_req: Request, res: Response) => {
  return res.json({
    success: true,
    isDevelopment: process.env.NODE_ENV !== 'production',
    baseDomain: getServerBaseDomain(),
  });
});

apiRouter.get('/resolve-tenant', async (req: Request, res: Response) => {
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  const simHeader = (req.headers['x-tenant-slug'] || req.headers['x-simulate-tenant']) as string | undefined;
  const simQuery = req.query.simulate_subdomain as string | undefined;

  const slug = resolveSlugFromHost(host, getServerBaseDomain(), simHeader || simQuery);
  if (!slug) {
    return res.json({ success: true, isTenantHost: false, tenant: null });
  }

  const tenant = await repo.getTenantBySlug(slug);
  if (!tenant) {
    return res.status(404).json({ success: false, error: `Nenhum estabelecimento encontrado para o slug "${slug}".` });
  }

  const op = canTenantOperate(tenant.status);
  return res.json({
    success: true,
    isTenantHost: true,
    tenant,
    operationStatus: op,
  });
});

// ==========================================
// 2. AUTHENTICATION ROUTES
// ==========================================

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios.' });
    }

    const user = await repo.authenticateUser(email, password);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({ success: false, error: 'Este usuário está inativo no sistema. Contate o suporte.' });
    }

    let tenant: Tenant | null = null;
    if (user.tenantId) {
      tenant = await repo.getTenantById(user.tenantId, user);
      if (tenant) {
        const op = canTenantOperate(tenant.status);
        if (!op.canOperate) {
          return res.status(403).json({ success: false, error: op.blockedReason || 'Empresa suspensa no sistema.' });
        }
      }
    }

    let resolvedFeatures: Record<FeatureKey, boolean> | null = null;
    if (user.tenantId) {
      try {
        resolvedFeatures = await repo.resolveTenantFeatures(user.tenantId);
      } catch {
        resolvedFeatures = null;
      }
    }

    const token = generateSessionToken(user);

    // If role is PROFESSIONAL, lookup linked professional
    let linkedProfessional: Professional | null = null;
    if (user.role === 'PROFESSIONAL' && user.tenantId) {
      linkedProfessional = await serviceRepo.getProfessionalByUserId(user.id, user.tenantId);
    }

    // Set secure cookie compatible with both standalone domains and embedded iframes
    res.cookie('saas_auth_token', token, getAuthCookieOptions(req, 8 * 60 * 60 * 1000));

    return res.json({
      success: true,
      token,
      user,
      tenant,
      resolvedFeatures,
      linkedProfessional,
    });
  } catch (err: any) {
    console.error('[API] Login error:', err);
    return res.status(500).json({ success: false, error: 'Erro interno ao realizar autenticação.' });
  }
});

apiRouter.get('/auth/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  let tenant: Tenant | null = null;
  const isImpersonating = !!req.sessionPayload?.isImpersonating;

  const targetTenantId = isImpersonating
    ? req.sessionPayload!.impersonatedTenantId
    : user.tenantId;

  if (targetTenantId) {
    try {
      tenant = await repo.getTenantById(targetTenantId, user);
    } catch {
      tenant = null;
    }
  }

  let resolvedFeatures: Record<FeatureKey, boolean> | null = null;
  if (targetTenantId) {
    try {
      resolvedFeatures = await repo.resolveTenantFeatures(targetTenantId);
    } catch {
      resolvedFeatures = null;
    }
  }

  let linkedProfessional: Professional | null = null;
  if (user.role === 'PROFESSIONAL' && targetTenantId) {
    linkedProfessional = await serviceRepo.getProfessionalByUserId(user.id, targetTenantId);
  }

  return res.json({
    success: true,
    user,
    tenant,
    isImpersonating,
    originalAdminUserName: req.sessionPayload?.originalAdminUserName,
    resolvedFeatures,
    linkedProfessional,
  });
});

apiRouter.post('/auth/logout', (req: Request, res: Response) => {
  res.clearCookie('saas_auth_token', getAuthCookieOptions(req, 0));
  res.clearCookie('saas_auth_token', { path: '/' });
  return res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
});

apiRouter.post('/auth/self-assign-tenant', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const emailLower = user.email.toLowerCase().trim();
    const isSuperAdminEmail =
      emailLower === 'admin@localhub.com' ||
      emailLower === 'ls2039730@gmail.com' ||
      emailLower.includes('superadmin') ||
      emailLower.includes('admin');

    const targetRole = isSuperAdminEmail ? 'SUPER_ADMIN' : 'CLIENT_ADMIN';
    let targetTenantId: string | null = null;

    if (!isSuperAdminEmail) {
      const { data: activeTenants } = await supabaseAdmin
        .from('tenants')
        .select('id')
        .is('deleted_at', null)
        .limit(1);

      if (activeTenants && activeTenants.length > 0) {
        targetTenantId = activeTenants[0].id;
      }
    }

    await repo.linkUserTenant(user.id, targetTenantId, targetRole);
    const updatedUser = await repo.findUserById(user.id);
    let updatedTenant = null;
    if (updatedUser?.tenantId) {
      updatedTenant = await repo.getTenantById(updatedUser.tenantId, updatedUser);
    }

    return res.json({
      success: true,
      user: updatedUser,
      tenant: updatedTenant,
      message: 'Estabelecimento vinculado com sucesso.',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Erro ao vincular estabelecimento.' });
  }
});

apiRouter.post('/auth/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'E-mail é obrigatório.' });
  }

  const user = await repo.findUserByEmail(email);
  if (user) {
    await repo.logAudit({
      actorUserId: user.id,
      actorUserName: user.name,
      tenantId: user.tenantId,
      action: 'PASSWORD_RESET_REQUEST',
      entity: 'users',
      entityId: user.id,
    });
  }

  return res.json({
    success: true,
    message: `Se o e-mail estiver cadastrado em nossa base, as instruções de recuperação serão enviadas para ${email}.`,
  });
});

// Exit Impersonation (MUST be registered before /auth/impersonate/:tenantId)
apiRouter.post('/auth/impersonate/exit', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.sessionPayload?.isImpersonating) {
    return res.status(400).json({ success: false, error: 'Não há sessão de impersonation ativa.' });
  }

  const originalAdminId = req.sessionPayload.originalAdminUserId!;
  const originalAdmin = await repo.findUserById(originalAdminId);
  if (!originalAdmin || originalAdmin.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Não foi possível restaurar sessão do Super Admin.' });
  }

  await repo.logAudit({
    actorUserId: originalAdmin.id,
    actorUserName: originalAdmin.name,
    tenantId: req.sessionPayload.impersonatedTenantId,
    action: 'IMPERSONATION_END',
    entity: 'tenants',
    entityId: req.sessionPayload.impersonatedTenantId,
  });

  const token = generateSessionToken(originalAdmin);
  res.cookie('saas_auth_token', token, getAuthCookieOptions(req, 8 * 60 * 60 * 1000));

  return res.json({
    success: true,
    token,
    user: originalAdmin,
    tenant: null,
    message: 'Visualização encerrada. Retornado ao Super Admin com sucesso.',
  });
});

// Impersonation for Super Admin
apiRouter.post('/auth/impersonate/:tenantId', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { tenantId } = req.params;
  const tenant = await repo.getTenantById(tenantId, req.user!);
  if (!tenant) {
    return res.status(404).json({ success: false, error: 'Empresa não encontrada.' });
  }

  // Issue impersonation token
  const token = generateSessionToken(req.user!, {
    impersonatedTenantId: tenantId,
    originalAdmin: req.user!,
  });

  res.cookie('saas_auth_token', token, getAuthCookieOptions(req, 4 * 60 * 60 * 1000));

  await repo.logAudit({
    actorUserId: req.user!.id,
    actorUserName: req.user!.name,
    tenantId,
    action: 'IMPERSONATION_START',
    entity: 'tenants',
    entityId: tenantId,
    metadata: { tenantName: tenant.name },
  });

  return res.json({
    success: true,
    token,
    user: req.user!,
    tenant,
    message: `Visualizando como administrador de ${tenant.name}.`,
  });
});

// ==========================================
// 3. SUPER ADMIN STATS & AUDIT LOGS
// ==========================================

apiRouter.get('/stats/superadmin', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const allTenants = await repo.getAllTenants(req.user!);
  const allUsers = await repo.getAllUsers(req.user!);

  const activeTenants = allTenants.filter((t) => t.status === 'ativo').length;
  const suspendedTenants = allTenants.filter((t) => t.status === 'suspenso').length;
  const trialTenants = allTenants.filter((t) => t.status === 'teste').length;
  const pendingTenants = allTenants.filter((t) => t.status === 'pagamento_pendente').length;
  const overdueTenants = allTenants.filter((t) => t.status === 'atrasado').length;
  const clientUsersCount = allUsers.filter((u) => u.role === 'CLIENT_ADMIN').length;

  const recentTenants = [...allTenants]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return res.json({
    success: true,
    totalTenants: allTenants.length,
    activeTenants,
    suspendedTenants,
    trialTenants,
    pendingTenants,
    overdueTenants,
    totalClientUsers: clientUsersCount,
    recentTenants,
  });
});

apiRouter.get('/audit-logs', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const logs = await repo.getAuditLogs(req.user!);
  return res.json({ success: true, logs });
});

// ==========================================
// 4. TENANTS MANAGEMENT
// ==========================================

apiRouter.get('/tenants/check-slug/:slug', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { slug } = req.params;
  const excludeId = req.query.exclude as string | undefined;
  const check = await repo.isSlugAvailable(slug, excludeId);
  return res.json({ success: true, slug, available: check.available, error: check.error });
});

apiRouter.get('/tenants', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const tenants = await repo.getAllTenants(req.user!);
  return res.json({ success: true, data: tenants });
});

apiRouter.post('/tenants', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      name,
      slug,
      segment,
      cnpj,
      phone,
      whatsapp,
      email,
      ownerName,
      ownerEmail,
      ownerPhone,
      planId,
      status,
      logoUrl,
      primaryColor,
      secondaryColor,
      accentColor,
      fontFamily,
    } = req.body;

    const trimmedName = name?.trim();
    const trimmedSlug = slug?.trim();
    const trimmedEmail = email?.toLowerCase()?.trim();
    const trimmedOwnerName = ownerName?.trim();
    const trimmedOwnerEmail = ownerEmail?.toLowerCase()?.trim();

    if (!trimmedName || !trimmedSlug || !trimmedEmail || !trimmedOwnerName || !trimmedOwnerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Preencha os campos obrigatórios marcados com * (Nome da Empresa, Slug/Subdomínio, E-mail, Responsável e E-mail do Responsável).',
      });
    }

    const effectivePhone = (phone || whatsapp || '(11) 99999-0000').trim();
    const effectiveWhatsapp = (whatsapp || phone || effectivePhone).trim();
    const effectiveOwnerPhone = (ownerPhone || effectivePhone).trim();
    const effectiveSegment = (segment || 'Comércio & Serviços Locais').trim();

    const result = await repo.createTenant(
      {
        name: trimmedName,
        slug: trimmedSlug,
        segment: effectiveSegment,
        cnpj: cnpj?.trim() || '',
        phone: effectivePhone,
        whatsapp: effectiveWhatsapp,
        email: trimmedEmail,
        ownerName: trimmedOwnerName,
        ownerEmail: trimmedOwnerEmail,
        ownerPhone: effectiveOwnerPhone,
        planId: planId || '11111111-1111-4111-8111-111111111111',
        status: status || 'teste',
        logoUrl,
        primaryColor,
        secondaryColor,
        accentColor,
        fontFamily,
      },
      req.user!
    );

    return res.status(201).json({ success: true, ...result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || 'Erro ao criar empresa.' });
  }
});

apiRouter.get('/tenants/:id', authenticate, requireTenantAccess('id'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant = await repo.getTenantById(req.params.id, req.user!);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Empresa não encontrada.' });
    }
    return res.json({ success: true, data: tenant });
  } catch (err: any) {
    return res.status(403).json({ success: false, error: err.message });
  }
});

apiRouter.put('/tenants/:id', authenticate, requireTenantAccess('id'), requireNonProfessional, async (req: AuthenticatedRequest, res: Response) => {
  const correlationId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  try {
    console.log(`[${correlationId}] [STAGE:ROUTE] [ROUTE:PUT /tenants/:id] Received update request for tenant_id=${req.params.id}. HasAppearance=${!!req.body?.appearance}`);
    const updated = await repo.updateTenant(req.params.id, req.body, req.user!, correlationId);
    console.log(`[${correlationId}] [STAGE:RESPONSE] Success response (HTTP 200) dispatched after persistence confirmation for tenant_id=${req.params.id}`);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    console.error(`[${correlationId}] [STAGE:ROUTE:ERROR] Error updating tenant id=${req.params.id}:`, err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.patch('/tenants/:id/status', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: 'Novo status é obrigatório.' });
    }
    const updated = await repo.updateTenantStatus(req.params.id, status as TenantStatus, req.user!);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Feature overrides
apiRouter.get('/tenants/:id/resolved-features', authenticate, requireTenantAccess('id'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const resolved = await repo.resolveTenantFeatures(req.params.id);
    return res.json({ success: true, features: resolved });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.put('/tenants/:id/features', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { overrides } = req.body;
    if (!overrides || typeof overrides !== 'object') {
      return res.status(400).json({ success: false, error: 'Overrides inválidos.' });
    }
    await repo.updateTenantFeatureOverrides(req.params.id, overrides, req.user!);
    const tenant = await repo.getTenantById(req.params.id, req.user!);
    return res.json({ success: true, data: tenant });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.delete('/tenants/:id/features/:featureKey', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { featureKey } = req.params;
    await repo.resetTenantFeatureOverride(req.params.id, featureKey as FeatureKey, req.user!);
    const tenant = await repo.getTenantById(req.params.id, req.user!);
    return res.json({ success: true, data: tenant });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Soft Delete Tenant
apiRouter.delete('/tenants/:id', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await repo.softDeleteTenant(req.params.id, req.user!);
    return res.json({ success: true, message: 'Empresa desativada com soft delete com sucesso.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// 5. TENANT USERS MANAGEMENT
// ==========================================

apiRouter.get('/tenants/:id/users', authenticate, requireTenantAccess('id'), requireNonProfessional, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await repo.getTenantUsers(req.params.id, req.user!);
    return res.json({ success: true, data: users });
  } catch (err: any) {
    return res.status(403).json({ success: false, error: err.message });
  }
});

apiRouter.post('/tenants/:id/users', authenticate, requireTenantAccess('id'), requireNonProfessional, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, email, phone, role, password } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, error: 'Nome e e-mail são obrigatórios.' });
    }
    const user = await repo.createTenantUser(
      req.params.id,
      { name, email, phone, role, password },
      req.user!
    );
    return res.status(201).json({ success: true, data: user });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.put('/tenants/:id/users/:userId', authenticate, requireTenantAccess('id'), requireNonProfessional, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await repo.updateTenantUser(
      req.params.id,
      req.params.userId,
      req.body,
      req.user!
    );
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.delete('/tenants/:id/users/:userId', authenticate, requireTenantAccess('id'), requireNonProfessional, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const success = await repo.deleteTenantUser(req.params.id, req.params.userId, req.user!);
    return res.json({ success });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/tenants/:id/users/:userId/resend-invite', authenticate, requireTenantAccess('id'), requireNonProfessional, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await repo.getTenantUsers(req.params.id, req.user!);
    const user = users.find((u) => u.id === req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }
    const message = await repo.resendInvite(req.params.id, user.id, req.user!);
    return res.json({
      success: true,
      message,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// 6. GLOBAL USERS (SUPER ADMIN)
// ==========================================

apiRouter.get('/users', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await repo.getAllUsers(req.user!);
    return res.json({ success: true, data: users });
  } catch (err: any) {
    return res.status(403).json({ success: false, error: err.message });
  }
});

// ==========================================
// 7. PLANS & FEATURES CATALOG
// ==========================================

apiRouter.get('/plans', authenticate, async (_req: Request, res: Response) => {
  const plans = await repo.getPlans();
  return res.json({ success: true, data: plans });
});

apiRouter.put('/plans/:id', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await repo.updatePlan(req.params.id, req.body, req.user!);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.get('/features', (_req: Request, res: Response) => {
  return res.json({ success: true, data: SYSTEM_FEATURES });
});

// ==========================================
// 8. STORAGE & MEDIA UPLOADS
// ==========================================

apiRouter.post('/upload', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { fileBase64, fileName, mimeType, tenantId } = req.body;
    if (!fileBase64 || !fileName) {
      return res.status(400).json({ success: false, error: 'Arquivo base64 e nome são obrigatórios.' });
    }

    // Clean base64 header if present
    const base64Data = fileBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const effectiveTenantId = tenantId || req.user?.tenantId || 'global';
    const fileUrl = await storageService.uploadFile(buffer, fileName, mimeType || 'image/png', effectiveTenantId);
    return res.json({ success: true, url: fileUrl });
  } catch (err: any) {
    console.error('[STORAGE] Upload error:', err);
    return res.status(500).json({ success: false, error: 'Falha ao processar upload de arquivo.' });
  }
});

// ==========================================
// 9. MINI-SITE BUILDER & PUBLIC PAGE
// ==========================================


// Get current tenant's site (Draft & sections)
apiRouter.get('/site', authenticate, requireFeature('site_editor'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const site = await siteRepo.getTenantSite(tenantId, req.user!);
    return res.json({ success: true, data: site });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar dados do site.' });
  }
});

// Save draft alterations
apiRouter.put('/site/draft', authenticate, requireFeature('site_editor'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const updated = await siteRepo.saveDraft(tenantId, req.body, req.user!);
    return res.json({ success: true, data: updated, message: 'Rascunho salvo com sucesso.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao salvar rascunho.' });
  }
});

// Publish site
apiRouter.post('/site/publish', authenticate, requireFeature('site_editor'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const published = await siteRepo.publishSite(tenantId, req.user!);
    return res.json({ success: true, data: published, message: 'Site publicado com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao publicar site.' });
  }
});

// Public site visitor endpoint (No auth required)
apiRouter.get('/site/public/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const forwardedHost = (req.headers['x-forwarded-host'] as string) || '';
    const hostHeader = forwardedHost.split(',')[0].trim() || req.get('host') || '';
    const simHeader = (req.headers['x-tenant-slug'] || req.headers['x-simulate-tenant']) as string | undefined;
    const simQuery = req.query.simulate_subdomain as string | undefined;
    const subdomainSlug = resolveSlugFromHost(hostHeader, getServerBaseDomain(), simHeader || simQuery);

    if (subdomainSlug && slug && subdomainSlug.toLowerCase() !== slug.trim().toLowerCase()) {
      return res.status(404).json({
        success: false,
        isPublished: false,
        tenant: null,
        site: null,
        error: 'O endereço solicitado não pertence a este domínio.',
      });
    }

    const result = await siteRepo.getPublicSiteBySlug(slug);
    if (!result.success) {
      return res.status(404).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Erro ao carregar página pública.' });
  }
});

// Public SSR HTML with dynamic OpenGraph meta tags for WhatsApp / Social Media
apiRouter.get('/site/public/:slug/html', async (req: Request, res: Response) => {
  return handlePublicSiteHtml(req, res, req.params.slug);
});
apiRouter.get(['/p', '/p/:slug'], async (req: Request, res: Response) => {
  return handlePublicSiteHtml(req, res, req.params.slug);
});

// Private draft preview endpoint (Requires auth & feature)
apiRouter.get('/site/preview/:slug', authenticate, requireFeature('site_editor'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { slug } = req.params;
    const result = await siteRepo.getPublicSiteBySlug(slug, { isDraftPreview: true, requester: req.user! });
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar visualização de rascunho.' });
  }
});

// Upload media for site blocks (Gallery, Hero, Team, Logo, etc.)
apiRouter.post('/site/upload-media', authenticate, requireFeature('site_editor'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { fileBase64, fileName, mimeType, subfolder } = req.body;
    if (!fileBase64 || !fileName) {
      return res.status(400).json({ success: false, error: 'Arquivo base64 e nome são obrigatórios.' });
    }

    const tenantId = getEffectiveTenantId(req);
    const base64Data = fileBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const cleanFolder = subfolder || 'general';
    const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '.png';
    const uniqueName = `site/${cleanFolder}/${crypto.randomUUID()}${ext}`;

    const fileUrl = await storageService.uploadFile(buffer, uniqueName, mimeType || 'image/png', tenantId);
    return res.json({ success: true, url: fileUrl });
  } catch (err: any) {
    console.error('[STORAGE] Site upload error:', err);
    return res.status(500).json({ success: false, error: 'Falha ao processar upload de arquivo do site.' });
  }
});

// Get signed upload URL for direct client-side upload (bypassing Vercel body limits)
apiRouter.post('/site/get-signed-upload-url', authenticate, requireFeature('site_editor'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { fileName, mimeType, subfolder } = req.body;
    if (!fileName) {
      return res.status(400).json({ success: false, error: 'Nome do arquivo é obrigatório.' });
    }

    const tenantId = getEffectiveTenantId(req);
    const cleanFolder = subfolder || 'general';
    const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '.mp4';
    const uniqueName = `site/${cleanFolder}/${crypto.randomUUID()}${ext}`;
    const storagePath = `${tenantId}/${uniqueName}`;

    if (!isRealSupabaseConfigured) {
      return res.status(400).json({ success: false, error: 'Supabase Storage não está configurado.' });
    }

    try {
      if (typeof supabaseAdmin.storage.createBucket === 'function') {
        await supabaseAdmin.storage.createBucket('tenant-media', { public: true });
      }
    } catch (e) {}

    const { data, error } = await supabaseAdmin.storage
      .from('tenant-media')
      .createSignedUploadUrl(storagePath, { upsert: true });

    if (error || !data) {
      throw new Error(error?.message || 'Falha ao gerar URL de upload assinada.');
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('tenant-media')
      .getPublicUrl(storagePath);

    return res.json({
      success: true,
      signedUrl: data.signedUrl,
      token: data.token,
      path: storagePath,
      publicUrl: publicUrlData.publicUrl,
    });
  } catch (err: any) {
    console.error('[STORAGE] Signed URL error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Falha ao gerar URL de upload.' });
  }
});


// ==========================================
// PRODUCTS & CATEGORIES MODULE (Feature: products)
// ==========================================

// 1. List Products
apiRouter.get('/products', authenticate, requireFeature('products'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { search, category_id, is_active, is_featured, stock_status, sort } = req.query;

    const parsedIsActive: boolean | 'all' =
      is_active === undefined || is_active === 'all'
        ? 'all'
        : String(is_active) === 'true';

    const products = await productRepo.listProducts(tenantId, {
      search: search ? String(search) : undefined,
      categoryId: category_id ? String(category_id) : undefined,
      isActive: parsedIsActive,
      isFeatured: is_featured === 'true' ? true : undefined,
      stockStatus: (stock_status as any) || 'all',
      sort: (sort as any) || 'manual',
    });

    return res.json({ success: true, data: products });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao listar produtos.' });
  }
});

// 2. Get Single Product
apiRouter.get('/products/:id', authenticate, requireFeature('products'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const product = await productRepo.getProductById(req.params.id, tenantId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Produto não encontrado.' });
    }
    return res.json({ success: true, data: product });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar produto.' });
  }
});

// 3. Create Product
apiRouter.post('/products', authenticate, requireFeature('products'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const created = await productRepo.createProduct(tenantId, req.body, req.user!);
    return res.status(201).json({ success: true, data: created, message: 'Produto cadastrado com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao criar produto.' });
  }
});

// 4. Update Product
apiRouter.put('/products/:id', authenticate, requireFeature('products'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const updated = await productRepo.updateProduct(req.params.id, tenantId, req.body, req.user!);
    return res.json({ success: true, data: updated, message: 'Produto atualizado com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao atualizar produto.' });
  }
});

// 5. Delete Product
apiRouter.delete('/products/:id', authenticate, requireFeature('products'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    await productRepo.deleteProduct(req.params.id, tenantId, req.user!);
    return res.json({ success: true, message: 'Produto excluído com sucesso.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao excluir produto.' });
  }
});

// 6. Duplicate Product
apiRouter.post('/products/:id/duplicate', authenticate, requireFeature('products'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const duplicated = await productRepo.duplicateProduct(req.params.id, tenantId, req.user!);
    return res.status(201).json({ success: true, data: duplicated, message: 'Produto duplicado com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao duplicar produto.' });
  }
});

// 7. Toggle Product Status
apiRouter.patch('/products/:id/status', authenticate, requireFeature('products'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { isActive } = req.body;
    const updated = await productRepo.toggleProductStatus(req.params.id, tenantId, !!isActive, req.user!);
    return res.json({ success: true, data: updated, message: `Produto ${isActive ? 'ativado' : 'desativado'} com sucesso!` });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao alterar status do produto.' });
  }
});

// 8. Upload Product Image
apiRouter.post('/products/:id/images', authenticate, requireFeature('products'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { fileBase64, fileName, mimeType, isPrimary } = req.body;
    if (!fileBase64 || !fileName) {
      return res.status(400).json({ success: false, error: 'Arquivo base64 e nome são obrigatórios.' });
    }

    const base64Data = fileBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const image = await productRepo.addProductImage(
      req.params.id,
      tenantId,
      buffer,
      fileName,
      mimeType || 'image/jpeg',
      !!isPrimary,
      req.user!
    );

    return res.status(201).json({ success: true, data: image, message: 'Imagem adicionada com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao fazer upload da imagem do produto.' });
  }
});

// 9. Set Primary Image
apiRouter.patch('/products/:id/images/:imageId/primary', authenticate, requireFeature('products'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    await productRepo.setPrimaryImage(req.params.id, req.params.imageId, tenantId);
    return res.json({ success: true, message: 'Foto principal atualizada.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao definir foto principal.' });
  }
});

// 10. Delete Product Image
apiRouter.delete('/products/:id/images/:imageId', authenticate, requireFeature('products'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    await productRepo.deleteProductImage(req.params.id, req.params.imageId, tenantId);
    return res.json({ success: true, message: 'Imagem excluída com sucesso.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao excluir imagem.' });
  }
});

// 11. List Categories
apiRouter.get('/product-categories', authenticate, requireFeature('products'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const categories = await productRepo.listCategories(tenantId);
    return res.json({ success: true, data: categories });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao listar categorias.' });
  }
});

// 12. Create Category
apiRouter.post('/product-categories', authenticate, requireFeature('products'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const category = await productRepo.createCategory(tenantId, req.body, req.user!);
    return res.status(201).json({ success: true, data: category, message: 'Categoria criada com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao criar categoria.' });
  }
});

// 13. Update Category
apiRouter.put('/product-categories/:id', authenticate, requireFeature('products'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const updated = await productRepo.updateCategory(req.params.id, tenantId, req.body, req.user!);
    return res.json({ success: true, data: updated, message: 'Categoria atualizada com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao atualizar categoria.' });
  }
});

// 14. Delete Category
apiRouter.delete('/product-categories/:id', authenticate, requireFeature('products'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    await productRepo.deleteCategory(req.params.id, tenantId, req.user!);
    return res.json({ success: true, message: 'Categoria excluída com sucesso.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao excluir categoria.' });
  }
});

// 15. Reorder Categories
apiRouter.put('/product-categories/reorder', authenticate, requireFeature('products'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: 'orderedIds deve ser um array de IDs.' });
    }
    await productRepo.reorderCategories(tenantId, orderedIds, req.user!);
    return res.json({ success: true, message: 'Ordem das categorias atualizada!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao reordenar categorias.' });
  }
});

// 16. PUBLIC LIVE CATALOG (No auth required, resolves tenant from slug, checks products feature & operational status)
apiRouter.get('/site/public/:slug/products', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { category_id, search, featured, sort, limit } = req.query;

    const catalog = await productRepo.getPublicCatalog(slug, {
      categoryId: category_id ? String(category_id) : undefined,
      search: search ? String(search) : undefined,
      featuredOnly: String(featured) === 'true',
      sort: sort ? String(sort) : undefined,
      limit: limit ? Number(limit) : undefined,
      channel: (req.query.channel as any) || 'delivery',
      dayOfWeek: req.query.dayOfWeek !== undefined ? (Number(req.query.dayOfWeek) as any) : undefined,
    });

    return res.json(catalog);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar catálogo de produtos.' });
  }
});

// 17. Super Admin: Products Summary
apiRouter.get('/tenants/:id/products-summary', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const summary = await productRepo.getTenantProductsSummary(req.params.id);
    return res.json({ success: true, data: summary });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar resumo de produtos.' });
  }
});

// ==========================================
// 18. PUBLIC SHOPPING CART & CHECKOUT (ETAPA 3B)
// ==========================================

// Validate Cart Items and Sync Prices
apiRouter.post('/site/public/:slug/cart/validate', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const items = req.body?.items || [];
    const validated = await orderRepo.validateCart(slug, items);
    return res.json({ success: true, data: validated });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao validar carrinho.' });
  }
});

// Create Order (Transactional, Server Recalculation, Stock Decrement)
apiRouter.post('/site/public/:slug/orders', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    const result = await orderRepo.createOrder(slug, req.body, clientIp);
    return res.json({
      success: true,
      data: result.order,
      whatsappUrl: result.whatsappUrl,
      message: result.message,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao criar pedido.' });
  }
});

// Mark WhatsApp sent timestamp
apiRouter.patch('/site/public/:slug/orders/:id/whatsapp-sent', async (req: Request, res: Response) => {
  try {
    const { slug, id } = req.params;
    const tenant = await repo.getTenantBySlug(slug);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant não encontrado.' });
    await orderRepo.recordWhatsAppSent(tenant.id, id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Public CEP Lookup Proxy (ViaCEP + BrasilAPI fallback)
apiRouter.get('/site/public/:slug/cep/:cep', async (req: Request, res: Response) => {
  try {
    const data = await lookupPostalCodeServer(req.params.cep);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao consultar CEP.' });
  }
});

// Public Delivery Quote Calculation (Cart & Checkout)
apiRouter.post('/site/public/:slug/delivery/quote', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const tenant = await repo.getTenantBySlug(slug);
    if (!tenant) {
      return res.status(404).json({ success: false, error: `Estabelecimento "${slug}" não encontrado.` });
    }

    const features = await repo.resolveTenantFeatures(tenant.id);
    if (!features.delivery) {
      return res.json({
        success: true,
        data: {
          isCovered: false,
          fee: 0,
          pricingMode: 'neighborhood',
          errorCode: 'DELIVERY_DISABLED',
          reason: 'A opção de entrega não está habilitada para este estabelecimento.',
        },
      });
    }

    // Protect against serverless timeout (e.g. Vercel 10s limit) by capping quote evaluation to 7s
    const quotePromise = orderRepo.evaluateDeliveryQuote(tenant.id, req.body);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Tempo limite de cálculo de frete excedido. Tente novamente.')), 7000)
    );

    const quote = (await Promise.race([quotePromise, timeoutPromise])) as any;
    return res.json({ success: true, data: quote });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Erro ao calcular taxa de entrega.',
    });
  }
});

// ==========================================
// 19. CLIENT ADMIN: ORDERS MANAGEMENT (ETAPA 3B)
// ==========================================

// List Orders
apiRouter.get('/orders', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { status, fulfillment_type, search, start_date, end_date, page, limit } = req.query;

    const result = await orderRepo.listOrders(tenantId, {
      status: status as any,
      fulfillmentType: fulfillment_type as any,
      search: search ? String(search) : undefined,
      startDate: start_date ? String(start_date) : undefined,
      endDate: end_date ? String(end_date) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    return res.json({ success: true, data: result.orders, total: result.total });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao listar pedidos.' });
  }
});

// Orders Summary (Today's metrics)
apiRouter.get('/orders/summary', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const summary = await orderRepo.getOrdersSummary(tenantId);
    return res.json({ success: true, data: summary });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar resumo de pedidos.' });
  }
});

// Get Single Order Details
apiRouter.get('/orders/:id', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const order = await orderRepo.getOrderById(tenantId, req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Pedido não encontrado.' });
    }
    return res.json({ success: true, data: order });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar detalhes do pedido.' });
  }
});

// Update Order Status
apiRouter.patch('/orders/:id/status', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: 'Status é obrigatório.' });
    }

    const updated = await orderRepo.updateOrderStatus(tenantId, req.params.id, status, req.user!);
    return res.json({ success: true, data: updated, message: `Status alterado para ${status}.` });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao alterar status do pedido.' });
  }
});

// Update Order (Full Edit)
apiRouter.put('/orders/:id', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const updated = await orderRepo.updateOrder(tenantId, req.params.id, req.body, req.user!);
    return res.json({ success: true, data: updated, message: 'Pedido atualizado com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao atualizar pedido.' });
  }
});

// Delete Order
apiRouter.delete('/orders/:id', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    await orderRepo.deleteOrder(tenantId, req.params.id, req.user!);
    return res.json({ success: true, message: 'Pedido excluído com sucesso.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao excluir pedido.' });
  }
});

// ==========================================
// 20. CLIENT ADMIN: DELIVERY CONFIGURATION (ETAPA 3B)
// ==========================================

// Get Delivery Settings
apiRouter.get('/delivery/settings', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const settings = await orderRepo.getDeliverySettings(tenantId);
    return res.json({ success: true, data: settings });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao buscar configurações de entrega.' });
  }
});

// Update Delivery Settings
apiRouter.put('/delivery/settings', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const updated = await orderRepo.updateDeliverySettings(tenantId, req.body, req.user!);
    return res.json({ success: true, data: updated, message: 'Configurações de entrega salvas com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao salvar configurações de entrega.' });
  }
});

// List Delivery Rules
apiRouter.get('/delivery/rules', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const rules = await orderRepo.listDeliveryRules(tenantId);
    return res.json({ success: true, data: rules });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao listar regras de entrega.' });
  }
});

// Create Delivery Rule
apiRouter.post('/delivery/rules', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const rule = await orderRepo.createDeliveryRule(tenantId, req.body, req.user!);
    return res.json({ success: true, data: rule, message: 'Regra de entrega adicionada com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao criar regra de entrega.' });
  }
});

// Update Delivery Rule
apiRouter.put('/delivery/rules/:id', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const rule = await orderRepo.updateDeliveryRule(tenantId, req.params.id, req.body, req.user!);
    return res.json({ success: true, data: rule, message: 'Regra de entrega atualizada!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao atualizar regra de entrega.' });
  }
});

// Delete Delivery Rule
apiRouter.delete('/delivery/rules/:id', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    await orderRepo.deleteDeliveryRule(tenantId, req.params.id, req.user!);
    return res.json({ success: true, message: 'Regra de entrega excluída.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao excluir regra de entrega.' });
  }
});

// Reorder Delivery Rules
apiRouter.put('/delivery/rules/reorder', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { ruleIds } = req.body;
    if (!Array.isArray(ruleIds)) {
      return res.status(400).json({ success: false, error: 'ruleIds deve ser um array.' });
    }
    await orderRepo.reorderDeliveryRules(tenantId, ruleIds, req.user!);
    return res.json({ success: true, message: 'Ordem das regras atualizada.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao reordenar regras.' });
  }
});

// Admin CEP Lookup
apiRouter.get('/delivery/cep/:cep', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await lookupPostalCodeServer(req.params.cep);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao consultar CEP.' });
  }
});

// Admin Geocode Origin Address
apiRouter.post('/delivery/geocode-origin', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const addressInput = req.body?.address || req.body || {};
    // Force fresh geocoding without using stale coordinates
    const result = await geocodeAddressServer({
      ...addressInput,
      latitude: null,
      longitude: null,
    });

    if (!result.success || typeof result.latitude !== 'number' || typeof result.longitude !== 'number') {
      return res.status(400).json({
        success: false,
        error:
          result.error ||
          'Não foi possível geocodificar o endereço informado. Verifique o CEP, logradouro, número, bairro, cidade e UF.',
      });
    }

    return res.json({
      success: true,
      data: {
        latitude: result.latitude,
        longitude: result.longitude,
        formattedAddress: result.formattedAddress,
        precision: result.precision,
        provider: result.provider,
      },
      message: 'Coordenadas geográficas obtidas com sucesso!',
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Falha ao geocodificar endereço de origem.',
    });
  }
});

// Admin Delivery Freight Simulator
apiRouter.post('/delivery/simulate', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { address, subtotal, selectedRuleId, overrideSettings } = req.body || {};
    const quote = await orderRepo.evaluateDeliveryQuote(
      tenantId,
      {
        address: address || {},
        subtotal: Number(subtotal || 0),
        selectedRuleId: selectedRuleId || null,
      },
      overrideSettings
    );
    return res.json({ success: true, data: quote });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Erro ao simular cálculo de entrega.',
    });
  }
});

// ==========================================
// 21. CLIENT ADMIN: PAYMENT METHODS (ETAPA 3B)
// ==========================================

// List Payment Methods
apiRouter.get('/payment-methods', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const methods = await orderRepo.listPaymentMethods(tenantId);
    return res.json({ success: true, data: methods });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao listar formas de pagamento.' });
  }
});

// Update Payment Method (Toggle active / label)
apiRouter.put('/payment-methods/:id', authenticate, requireFeature('shopping_cart'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const updated = await orderRepo.updatePaymentMethod(tenantId, req.params.id, req.body, req.user!);
    return res.json({ success: true, data: updated, message: 'Forma de pagamento atualizada!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao atualizar forma de pagamento.' });
  }
});

// Super Admin: Orders Summary
apiRouter.get('/tenants/:id/orders-summary', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const summary = await orderRepo.getOrdersSummary(req.params.id);
    return res.json({ success: true, data: summary });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar resumo de pedidos.' });
  }
});

// ==========================================
// 22. CLIENT ADMIN: SERVICES MODULE (ETAPA 4A)
// ==========================================

// 1. List Services
apiRouter.get('/services', authenticate, requireFeature('services'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { search, category_id, active, featured, pricing_type, sort } = req.query;

    const services = await serviceRepo.listServices(tenantId, {
      search: search ? String(search) : undefined,
      categoryId: category_id ? String(category_id) : undefined,
      active: active === undefined || active === 'all' ? 'all' : String(active) === 'true',
      featured: featured !== undefined ? String(featured) === 'true' : undefined,
      pricingType: (pricing_type as any) || undefined,
      sort: (sort as any) || 'order',
    });

    return res.json({ success: true, data: services });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao listar serviços.' });
  }
});

// 2. Get Single Service
apiRouter.get('/services/:id', authenticate, requireFeature('services'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const service = await serviceRepo.getServiceById(req.params.id, tenantId);
    if (!service) {
      return res.status(404).json({ success: false, error: 'Serviço não encontrado.' });
    }
    return res.json({ success: true, data: service });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar serviço.' });
  }
});

// 3. Create Service
apiRouter.post('/services', authenticate, requireNonProfessional, requireFeature('services'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const created = await serviceRepo.createService(tenantId, req.body, req.user!);
    return res.status(201).json({ success: true, data: created, message: 'Serviço cadastrado com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao cadastrar serviço.' });
  }
});

// 4. Update Service
apiRouter.put('/services/:id', authenticate, requireNonProfessional, requireFeature('services'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const updated = await serviceRepo.updateService(req.params.id, tenantId, req.body, req.user!);
    return res.json({ success: true, data: updated, message: 'Serviço atualizado com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao atualizar serviço.' });
  }
});

// 5. Delete Service
apiRouter.delete('/services/:id', authenticate, requireNonProfessional, requireFeature('services'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    await serviceRepo.deleteService(req.params.id, tenantId, req.user!);
    return res.json({ success: true, message: 'Serviço excluído com sucesso.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao excluir serviço.' });
  }
});

// 6. Duplicate Service
apiRouter.post('/services/:id/duplicate', authenticate, requireNonProfessional, requireFeature('services'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const duplicated = await serviceRepo.duplicateService(req.params.id, tenantId, req.user!);
    return res.status(201).json({ success: true, data: duplicated, message: 'Serviço duplicado com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao duplicar serviço.' });
  }
});

// 7. Toggle Service Status
apiRouter.patch('/services/:id/status', authenticate, requireNonProfessional, requireFeature('services'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { active } = req.body;
    const updated = await serviceRepo.toggleServiceStatus(req.params.id, tenantId, !!active, req.user!);
    return res.json({ success: true, data: updated, message: `Serviço ${active ? 'ativado' : 'desativado'} com sucesso!` });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao alterar status do serviço.' });
  }
});

// 8. Reorder Services
apiRouter.put('/services/reorder', authenticate, requireNonProfessional, requireFeature('services'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: 'orderedIds deve ser um array de IDs.' });
    }
    await serviceRepo.reorderServices(tenantId, orderedIds, req.user!);
    return res.json({ success: true, message: 'Ordem dos serviços atualizada com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao reordenar serviços.' });
  }
});

// ==========================================
// 23. CLIENT ADMIN: SERVICE CATEGORIES
// ==========================================

// List Service Categories
apiRouter.get('/service-categories', authenticate, requireFeature('services'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const categories = await serviceRepo.listCategories(tenantId);
    return res.json({ success: true, data: categories });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao listar categorias.' });
  }
});

// Create Service Category
apiRouter.post('/service-categories', authenticate, requireNonProfessional, requireFeature('services'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const created = await serviceRepo.createCategory(tenantId, req.body, req.user!);
    return res.status(201).json({ success: true, data: created, message: 'Categoria criada com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao criar categoria.' });
  }
});

// Update Service Category
apiRouter.put('/service-categories/:id', authenticate, requireNonProfessional, requireFeature('services'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const updated = await serviceRepo.updateCategory(req.params.id, tenantId, req.body, req.user!);
    return res.json({ success: true, data: updated, message: 'Categoria atualizada com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao atualizar categoria.' });
  }
});

// Delete Service Category
apiRouter.delete('/service-categories/:id', authenticate, requireNonProfessional, requireFeature('services'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    await serviceRepo.deleteCategory(req.params.id, tenantId, req.user!);
    return res.json({ success: true, message: 'Categoria excluída com sucesso.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao excluir categoria.' });
  }
});

// Reorder Service Categories
apiRouter.put('/service-categories/reorder', authenticate, requireNonProfessional, requireFeature('services'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: 'orderedIds deve ser um array de IDs.' });
    }
    await serviceRepo.reorderCategories(tenantId, orderedIds, req.user!);
    return res.json({ success: true, message: 'Ordem das categorias atualizada!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao reordenar categorias.' });
  }
});

// ==========================================
// 24. CLIENT ADMIN: PROFESSIONALS MODULE
// ==========================================

// List Professionals
apiRouter.get('/professionals', authenticate, requireFeature('professionals'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);

    // If role is PROFESSIONAL: only return their own profile!
    if (req.user?.role === 'PROFESSIONAL') {
      const linked = await getLinkedProfessionalForUser(req);
      if (!linked) {
        return res.status(403).json({
          success: false,
          code: 'UNLINKED_PROFESSIONAL',
          error: 'Usuário com perfil Profissional sem cadastro vinculado no estabelecimento. Solicite ao administrador que configure o vínculo.',
        });
      }
      return res.json({ success: true, data: [linked] });
    }

    const { search, active, service_id } = req.query;

    const professionals = await serviceRepo.listProfessionals(tenantId, {
      search: search ? String(search) : undefined,
      active: active === undefined || active === 'all' ? 'all' : String(active) === 'true',
      serviceId: service_id ? String(service_id) : undefined,
    });

    return res.json({ success: true, data: professionals });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao listar profissionais.' });
  }
});

// Get Single Professional
apiRouter.get('/professionals/:id', authenticate, requireFeature('professionals'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);

    // If role is PROFESSIONAL: only allow fetching their own profile!
    if (req.user?.role === 'PROFESSIONAL') {
      const linked = await getLinkedProfessionalForUser(req);
      if (!linked) {
        return res.status(403).json({
          success: false,
          code: 'UNLINKED_PROFESSIONAL',
          error: 'Usuário com perfil Profissional sem cadastro vinculado no estabelecimento. Solicite ao administrador que configure o vínculo.',
        });
      }
      if (linked.id !== req.params.id) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: profissionais só podem consultar seus próprios dados.',
        });
      }
      return res.json({ success: true, data: linked });
    }

    const professional = await serviceRepo.getProfessionalById(req.params.id, tenantId);
    if (!professional) {
      return res.status(404).json({ success: false, error: 'Profissional não encontrado.' });
    }
    return res.json({ success: true, data: professional });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar profissional.' });
  }
});

// Create Professional (Admin only)
apiRouter.post('/professionals', authenticate, requireNonProfessional, requireFeature('professionals'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const created = await serviceRepo.createProfessional(tenantId, req.body, req.user!);
    return res.status(201).json({ success: true, data: created, message: 'Profissional cadastrado com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao cadastrar profissional.' });
  }
});

// Update Professional
apiRouter.put('/professionals/:id', authenticate, requireFeature('professionals'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);

    // If role is PROFESSIONAL: only allow updating their own profile & services list
    if (req.user?.role === 'PROFESSIONAL') {
      const linked = await getLinkedProfessionalForUser(req);
      if (!linked) {
        return res.status(403).json({
          success: false,
          code: 'UNLINKED_PROFESSIONAL',
          error: 'Usuário com perfil Profissional sem cadastro vinculado no estabelecimento. Solicite ao administrador que configure o vínculo.',
        });
      }
      if (linked.id !== req.params.id) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: profissionais só podem alterar seus próprios dados de atendimento e serviços.',
        });
      }
      const allowedPatch: Partial<ProfessionalPayload> = {};
      if (req.body.serviceIds !== undefined) allowedPatch.serviceIds = req.body.serviceIds;
      if (req.body.bio !== undefined) allowedPatch.bio = req.body.bio;
      if (req.body.specialties !== undefined) allowedPatch.specialties = req.body.specialties;
      if (req.body.photoUrl !== undefined) allowedPatch.photoUrl = req.body.photoUrl;
      if (req.body.phone !== undefined) allowedPatch.phone = req.body.phone;
      if (req.body.showContactPublicly !== undefined) allowedPatch.showContactPublicly = req.body.showContactPublicly;

      const updated = await serviceRepo.updateProfessional(linked.id, tenantId, allowedPatch, req.user!);
      return res.json({ success: true, data: updated, message: 'Dados e serviços atualizados com sucesso!' });
    }

    const updated = await serviceRepo.updateProfessional(req.params.id, tenantId, req.body, req.user!);
    return res.json({ success: true, data: updated, message: 'Profissional atualizado com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao atualizar profissional.' });
  }
});

// Delete Professional (Admin only)
apiRouter.delete('/professionals/:id', authenticate, requireNonProfessional, requireFeature('professionals'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    await serviceRepo.deleteProfessional(req.params.id, tenantId, req.user!);
    return res.json({ success: true, message: 'Profissional excluído com sucesso.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao excluir profissional.' });
  }
});

// Toggle Professional Status (Admin only)
apiRouter.patch('/professionals/:id/status', authenticate, requireNonProfessional, requireFeature('professionals'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { active } = req.body;
    const updated = await serviceRepo.toggleProfessionalStatus(req.params.id, tenantId, !!active, req.user!);
    return res.json({ success: true, data: updated, message: `Profissional ${active ? 'ativado' : 'desativado'} com sucesso!` });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao alterar status do profissional.' });
  }
});

// Reorder Professionals (Admin only)
apiRouter.put('/professionals/reorder', authenticate, requireNonProfessional, requireFeature('professionals'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: 'orderedIds deve ser um array de IDs.' });
    }
    await serviceRepo.reorderProfessionals(tenantId, orderedIds, req.user!);
    return res.json({ success: true, message: 'Ordem dos profissionais atualizada!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao reordenar profissionais.' });
  }
});

// ==========================================
// 25. PUBLIC LIVE SERVICES & PROFESSIONALS
// ==========================================

// Public Live Services Catalog
apiRouter.get('/site/public/:slug/services', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { category_id, search, featured, limit } = req.query;

    const data = await serviceRepo.getPublicServices(slug, {
      categoryId: category_id ? String(category_id) : undefined,
      search: search ? String(search) : undefined,
      featuredOnly: String(featured) === 'true',
      limit: limit ? Number(limit) : undefined,
    });

    return res.json(data);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar serviços públicos.' });
  }
});

// Public Live Professionals List
apiRouter.get('/site/public/:slug/professionals', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const data = await serviceRepo.getPublicProfessionals(slug);
    return res.json(data);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar profissionais.' });
  }
});

// ==========================================
// 26. APPOINTMENTS & SCHEDULING (ETAPA 4B)
// ==========================================

// Get Appointment Settings
apiRouter.get('/appointment-settings', authenticate, requireFeature('appointments'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const settings = await appointmentRepo.getSettings(tenantId);
    return res.json({ success: true, data: settings });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar configurações de agenda.' });
  }
});

// Update Appointment Settings (Admin only)
apiRouter.put('/appointment-settings', authenticate, requireNonProfessional, requireFeature('appointments'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const updated = await appointmentRepo.updateSettings(tenantId, req.body, req.user!);
    return res.json({ success: true, data: updated, message: 'Configurações de agenda atualizadas com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao salvar configurações de agenda.' });
  }
});

// List Professional Schedules
apiRouter.get('/professional-schedules', authenticate, requireFeature('appointments'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (req.user?.role === 'PROFESSIONAL') {
      const linked = await getLinkedProfessionalForUser(req);
      if (!linked) {
        return res.status(403).json({
          success: false,
          code: 'UNLINKED_PROFESSIONAL',
          error: 'Usuário com perfil Profissional sem cadastro vinculado no estabelecimento. Solicite ao administrador que configure o vínculo.',
        });
      }
      const schedules = await appointmentRepo.listProfessionalSchedules(tenantId);
      const mySchedule = schedules.filter((s) => s.professionalId === linked.id);
      return res.json({ success: true, data: mySchedule });
    }

    const schedules = await appointmentRepo.listProfessionalSchedules(tenantId);
    return res.json({ success: true, data: schedules });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar horários dos profissionais.' });
  }
});

// Save Professional Schedule
apiRouter.post('/professional-schedules', authenticate, requireFeature('appointments'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (req.user?.role === 'PROFESSIONAL') {
      const linked = await getLinkedProfessionalForUser(req);
      if (!linked) {
        return res.status(403).json({
          success: false,
          code: 'UNLINKED_PROFESSIONAL',
          error: 'Usuário com perfil Profissional sem cadastro vinculado no estabelecimento. Solicite ao administrador que configure o vínculo.',
        });
      }
      req.body.professionalId = linked.id;
    }

    const saved = await appointmentRepo.saveProfessionalSchedule(tenantId, req.body, req.user!);
    return res.json({ success: true, data: saved, message: 'Horários do profissional salvos com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao salvar horários do profissional.' });
  }
});

// List Schedule Blocks
apiRouter.get('/schedule-blocks', authenticate, requireFeature('appointments'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    let targetProfId: string | undefined = req.query.professional_id ? String(req.query.professional_id) : undefined;

    if (req.user?.role === 'PROFESSIONAL') {
      const linked = await getLinkedProfessionalForUser(req);
      if (!linked) {
        return res.status(403).json({
          success: false,
          code: 'UNLINKED_PROFESSIONAL',
          error: 'Usuário com perfil Profissional sem cadastro vinculado no estabelecimento. Solicite ao administrador que configure o vínculo.',
        });
      }
      targetProfId = linked.id;
    }

    const blocks = await appointmentRepo.listScheduleBlocks(tenantId, {
      professionalId: targetProfId,
    });
    return res.json({ success: true, data: blocks });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar bloqueios de horário.' });
  }
});

// Create Schedule Block
apiRouter.post('/schedule-blocks', authenticate, requireFeature('appointments'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (req.user?.role === 'PROFESSIONAL') {
      const linked = await getLinkedProfessionalForUser(req);
      if (!linked) {
        return res.status(403).json({
          success: false,
          code: 'UNLINKED_PROFESSIONAL',
          error: 'Usuário com perfil Profissional sem cadastro vinculado no estabelecimento. Solicite ao administrador que configure o vínculo.',
        });
      }
      req.body.professionalId = linked.id;
    }

    const block = await appointmentRepo.createScheduleBlock(tenantId, req.body, req.user!);
    return res.status(201).json({ success: true, data: block, message: 'Bloqueio de horário registrado com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao criar bloqueio de horário.' });
  }
});

// Delete Schedule Block
apiRouter.delete('/schedule-blocks/:id', authenticate, requireFeature('appointments'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { id } = req.params;

    if (req.user?.role === 'PROFESSIONAL') {
      const linked = await getLinkedProfessionalForUser(req);
      if (!linked) {
        return res.status(403).json({
          success: false,
          code: 'UNLINKED_PROFESSIONAL',
          error: 'Usuário com perfil Profissional sem cadastro vinculado no estabelecimento. Solicite ao administrador que configure o vínculo.',
        });
      }
      const blocks = await appointmentRepo.listScheduleBlocks(tenantId, {
        professionalId: linked.id,
      });
      const hasBlock = blocks.some((b) => b.id === id);
      if (!hasBlock) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: profissionais só podem remover seus próprios bloqueios de horário.',
        });
      }
    }

    await appointmentRepo.deleteScheduleBlock(id, tenantId, req.user!);
    return res.json({ success: true, message: 'Bloqueio de horário removido com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao remover bloqueio.' });
  }
});

// List Appointments
apiRouter.get('/appointments', authenticate, requireFeature('appointments'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { date, start_date, end_date, professional_id, status, search } = req.query;

    let targetProfId: string | undefined = professional_id ? String(professional_id) : undefined;

    if (req.user?.role === 'PROFESSIONAL') {
      const linked = await getLinkedProfessionalForUser(req);
      if (!linked) {
        return res.status(403).json({
          success: false,
          code: 'UNLINKED_PROFESSIONAL',
          error: 'Usuário com perfil Profissional sem cadastro vinculado no estabelecimento. Solicite ao administrador que configure o vínculo.',
        });
      }
      targetProfId = linked.id;
    }

    const appointments = await appointmentRepo.listAppointments(tenantId, {
      date: date ? String(date) : undefined,
      startDate: start_date ? String(start_date) : undefined,
      endDate: end_date ? String(end_date) : undefined,
      professionalId: targetProfId,
      status: status ? String(status) : undefined,
      search: search ? String(search) : undefined,
    });

    return res.json({ success: true, data: appointments });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao listar agendamentos.' });
  }
});

// Manual Appointment Creation (Admin or Professional)
apiRouter.post('/appointments', authenticate, requireFeature('appointments'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (req.user?.role === 'PROFESSIONAL') {
      const linked = await getLinkedProfessionalForUser(req);
      if (!linked) {
        return res.status(403).json({
          success: false,
          code: 'UNLINKED_PROFESSIONAL',
          error: 'Usuário com perfil Profissional sem cadastro vinculado no estabelecimento. Solicite ao administrador que configure o vínculo.',
        });
      }
      req.body.professionalId = linked.id;
    }

    const appointment = await appointmentRepo.createAppointment(tenantId, req.body, 'admin', req.user!);
    return res.status(201).json({ success: true, data: appointment, message: 'Agendamento registrado com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao criar agendamento.' });
  }
});

// Get Appointment Details
apiRouter.get('/appointments/:id', authenticate, requireFeature('appointments'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { id } = req.params;
    const appointment = await appointmentRepo.getAppointmentById(id, tenantId);
    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Agendamento não encontrado.' });
    }

    if (req.user?.role === 'PROFESSIONAL') {
      const linked = await getLinkedProfessionalForUser(req);
      if (!linked || appointment.professionalId !== linked.id) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: profissionais só podem consultar seus próprios agendamentos.',
        });
      }
    }

    return res.json({ success: true, data: appointment });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao consultar agendamento.' });
  }
});

// Update Appointment Status
apiRouter.patch('/appointments/:id/status', authenticate, requireFeature('appointments'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { id } = req.params;
    const { status, cancellationReason } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: 'Status é obrigatório.' });
    }

    if (req.user?.role === 'PROFESSIONAL') {
      const linked = await getLinkedProfessionalForUser(req);
      if (!linked) {
        return res.status(403).json({
          success: false,
          code: 'UNLINKED_PROFESSIONAL',
          error: 'Usuário com perfil Profissional sem cadastro vinculado no estabelecimento. Solicite ao administrador que configure o vínculo.',
        });
      }
      const existing = await appointmentRepo.getAppointmentById(id, tenantId);
      if (!existing || existing.professionalId !== linked.id) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: profissionais só podem alterar status dos seus próprios agendamentos.',
        });
      }
    }

    const updated = await appointmentRepo.updateAppointmentStatus(id, tenantId, status, cancellationReason, req.user!);
    return res.json({ success: true, data: updated, message: 'Status do agendamento atualizado!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao atualizar status.' });
  }
});

// Reschedule Appointment
apiRouter.patch('/appointments/:id/reschedule', authenticate, requireFeature('appointments'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { id } = req.params;

    if (req.user?.role === 'PROFESSIONAL') {
      const linked = await getLinkedProfessionalForUser(req);
      if (!linked) {
        return res.status(403).json({
          success: false,
          code: 'UNLINKED_PROFESSIONAL',
          error: 'Usuário com perfil Profissional sem cadastro vinculado no estabelecimento. Solicite ao administrador que configure o vínculo.',
        });
      }
      const existing = await appointmentRepo.getAppointmentById(id, tenantId);
      if (!existing || existing.professionalId !== linked.id) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: profissionais só podem remarcar os seus próprios agendamentos.',
        });
      }
      req.body.professionalId = linked.id;
    }

    const updated = await appointmentRepo.rescheduleAppointment(id, tenantId, req.body, req.user!);
    return res.json({ success: true, data: updated, message: 'Agendamento remarcado com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao remarcar agendamento.' });
  }
});

// Update Internal Notes
apiRouter.patch('/appointments/:id/notes', authenticate, requireFeature('appointments'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { id } = req.params;
    const { internalNotes } = req.body;

    if (req.user?.role === 'PROFESSIONAL') {
      const linked = await getLinkedProfessionalForUser(req);
      if (!linked) {
        return res.status(403).json({
          success: false,
          code: 'UNLINKED_PROFESSIONAL',
          error: 'Usuário com perfil Profissional sem cadastro vinculado no estabelecimento. Solicite ao administrador que configure o vínculo.',
        });
      }
      const existing = await appointmentRepo.getAppointmentById(id, tenantId);
      if (!existing || existing.professionalId !== linked.id) {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado: profissionais só podem atualizar anotações dos seus próprios agendamentos.',
        });
      }
    }

    const updated = await appointmentRepo.updateAppointmentNotes(id, tenantId, internalNotes, req.user!);
    return res.json({ success: true, data: updated, message: 'Notas internas atualizadas!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao salvar notas.' });
  }
});

// Get Customer History
apiRouter.get('/appointments/customer/:phone', authenticate, requireFeature('appointments'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { phone } = req.params;
    let history = await appointmentRepo.getCustomerAppointmentsHistory(tenantId, phone);

    if (req.user?.role === 'PROFESSIONAL') {
      const linked = await getLinkedProfessionalForUser(req);
      if (!linked) {
        return res.status(403).json({
          success: false,
          code: 'UNLINKED_PROFESSIONAL',
          error: 'Usuário com perfil Profissional sem cadastro vinculado no estabelecimento. Solicite ao administrador que configure o vínculo.',
        });
      }
      history = history.filter((h) => h.professionalId === linked.id);
    }

    return res.json({ success: true, data: history });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao consultar histórico do cliente.' });
  }
});

// ==========================================
// 27. PUBLIC BOOKING ENDPOINTS (MINI SITES)
// ==========================================

// Public Appointment Settings (read-only)
apiRouter.get('/site/public/:slug/appointments/settings', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const tenant = await repo.getTenantBySlug(slug);
    if (!tenant) return res.status(404).json({ success: false, error: 'Empresa não encontrada.' });

    const op = canTenantOperate(tenant.status);
    if (!op.canOperate) {
      return res.status(403).json({ success: false, error: op.blockedReason || 'Empresa indisponível.' });
    }

    const settings = await appointmentRepo.getSettings(tenant.id);
    return res.json({
      success: true,
      data: {
        publicBookingEnabled: settings.publicBookingEnabled,
        timezone: settings.timezone,
        minBookingNoticeHours: settings.minBookingNoticeHours,
        maxBookingAdvanceDays: settings.maxBookingAdvanceDays,
        allowCustomerCancellation: settings.allowCustomerCancellation,
        cancellationNoticeHours: settings.cancellationNoticeHours,
        notificationInstructions: settings.notificationInstructions,
        businessHours: settings.businessHours,
      },
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao consultar configurações da agenda.' });
  }
});

// Public Available Slots Calculation
apiRouter.get('/site/public/:slug/appointments/available-slots', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { service_id, date, professional_id } = req.query;

    if (!service_id || !date) {
      return res.status(400).json({ success: false, error: 'service_id e date são obrigatórios.' });
    }

    const tenant = await repo.getTenantBySlug(slug);
    if (!tenant) return res.status(404).json({ success: false, error: 'Empresa não encontrada.' });

    const op = canTenantOperate(tenant.status);
    if (!op.canOperate) {
      return res.status(403).json({ success: false, error: op.blockedReason || 'Empresa indisponível.' });
    }

    const slots = await appointmentRepo.getAvailableSlots(
      tenant.id,
      String(service_id),
      String(date),
      professional_id ? String(professional_id) : undefined
    );

    return res.json({ success: true, data: slots });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao calcular horários disponíveis.' });
  }
});

// Public Atomic Appointment Creation
apiRouter.post('/site/public/:slug/appointments/book', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const tenant = await repo.getTenantBySlug(slug);
    if (!tenant) return res.status(404).json({ success: false, error: 'Empresa não encontrada.' });

    const op = canTenantOperate(tenant.status);
    if (!op.canOperate) {
      return res.status(403).json({ success: false, error: op.blockedReason || 'Empresa indisponível.' });
    }

    const appt = await appointmentRepo.createAppointment(tenant.id, req.body, 'public_site');

    // Generate WhatsApp direct text
    const cleanPhone = (tenant.whatsapp || tenant.phone || '').replace(/\D/g, '');
    const dateFormatted = new Date(appt.startAt).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const statusLabel = appt.status === 'confirmed' ? 'Confirmado' : 'Pendente de confirmação';
    const waText = encodeURIComponent(
      `Olá ${tenant.name}! Acabei de solicitar o agendamento [${appt.code}] pelo site.\n\n` +
      `📌 *Serviço:* ${appt.serviceName}\n` +
      (appt.professionalName ? `👤 *Profissional:* ${appt.professionalName}\n` : '') +
      `📅 *Data/Horário:* ${dateFormatted}\n` +
      `🏷️ *Status:* ${statusLabel}\n` +
      `🙋‍♂️ *Cliente:* ${appt.customerName}\n\n` +
      `Gostaria de confirmar minha solicitação!`
    );

    const whatsappDirectUrl = cleanPhone ? `https://wa.me/55${cleanPhone}?text=${waText}` : '';
    const settings = await appointmentRepo.getSettings(tenant.id);

    const resultObj = {
      id: appt.id,
      code: appt.code,
      serviceName: appt.serviceName,
      professionalName: appt.professionalName,
      startAt: appt.startAt,
      endAt: appt.endAt,
      durationMinutes: appt.durationMinutes,
      status: appt.status,
      customerName: appt.customerName,
      customerPhone: appt.customerPhone,
      publicAccessToken: appt.publicAccessToken,
      whatsappDirectUrl,
      instructions: settings.notificationInstructions,
    };

    return res.status(201).json({
      success: true,
      data: resultObj,
      appointment: resultObj,
      message: 'Agendamento solicitado com sucesso!',
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao realizar agendamento.' });
  }
});

// Lookup Appointment by Token (Secure single public view)
apiRouter.get('/site/public/:slug/appointments/lookup/:token', async (req: Request, res: Response) => {
  try {
    const { slug, token } = req.params;
    const tenant = await repo.getTenantBySlug(slug);
    if (!tenant) return res.status(404).json({ success: false, error: 'Empresa não encontrada.' });

    const appt = await appointmentRepo.getAppointmentByToken(token, tenant.id);
    if (!appt) {
      return res.status(404).json({ success: false, error: 'Agendamento não encontrado.' });
    }

    // Sanitize - omit internal notes
    return res.json({
      success: true,
      data: {
        id: appt.id,
        code: appt.code,
        serviceName: appt.serviceName,
        professionalName: appt.professionalName,
        startAt: appt.startAt,
        endAt: appt.endAt,
        durationMinutes: appt.durationMinutes,
        status: appt.status,
        customerName: appt.customerName,
        customerPhone: appt.customerPhone,
        customerEmail: appt.customerEmail,
        createdAt: appt.createdAt,
      },
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao buscar agendamento.' });
  }
});

// Customer Cancellation by Token
apiRouter.post('/site/public/:slug/appointments/cancel/:token', async (req: Request, res: Response) => {
  try {
    const { slug, token } = req.params;
    const { reason } = req.body;
    const tenant = await repo.getTenantBySlug(slug);
    if (!tenant) return res.status(404).json({ success: false, error: 'Empresa não encontrada.' });

    const appt = await appointmentRepo.getAppointmentByToken(token, tenant.id);
    if (!appt) {
      return res.status(404).json({ success: false, error: 'Agendamento não encontrado.' });
    }

    if (appt.status === 'cancelled' || appt.status === 'completed') {
      return res.status(400).json({ success: false, error: `Este agendamento já se encontra ${appt.status}.` });
    }

    const settings = await appointmentRepo.getSettings(tenant.id);
    if (!settings.allowCustomerCancellation) {
      return res.status(403).json({ success: false, error: 'Cancelamento online desativado. Entre em contato por telefone/WhatsApp.' });
    }

    // Check cancellation notice
    const now = new Date();
    const apptStart = new Date(appt.startAt);
    const noticeLimit = new Date(apptStart.getTime() - settings.cancellationNoticeHours * 60 * 60 * 1000);
    if (now > noticeLimit) {
      return res.status(400).json({
        success: false,
        error: `Cancelamentos devem ser feitos com no mínimo ${settings.cancellationNoticeHours}h de antecedência.`,
      });
    }

    const updated = await appointmentRepo.updateAppointmentStatus(
      appt.id,
      tenant.id,
      'cancelled',
      reason || 'Cancelado pelo cliente via link do agendamento'
    );

    return res.json({ success: true, message: 'Agendamento cancelado com sucesso!', data: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao cancelar agendamento.' });
  }
});

// ==========================================
// RESTAURANT DIGITAL CATALOG & TABLES (PUBLIC)
// ==========================================

function handlePublicRestaurantError(res: Response, err: any, fallbackMessage: string) {
  const message = err?.message || fallbackMessage;
  if (typeof message === 'string' && message.includes('restaurant_tables')) {
    return res.status(403).json({
      success: false,
      code: 'FEATURE_DISABLED',
      error: message,
    });
  }
  return res.status(400).json({ success: false, error: message });
}

// 1. Table Info Lookup
apiRouter.get('/public/restaurant/table-info', async (req: Request, res: Response) => {
  try {
    const slug = String(req.query.slug || '').trim();
    const token = String(req.query.token || '').trim();
    if (!slug || !token) {
      return res.status(400).json({ success: false, error: 'Parâmetros slug e token da mesa são obrigatórios.' });
    }
    const info = await restaurantRepo.getPublicTableInfo(slug, token);
    return res.json(info);
  } catch (err: any) {
    return handlePublicRestaurantError(res, err, 'Mesa não encontrada.');
  }
});

// 2. Public Live Catalog for Table (reusing productRepo directly)
apiRouter.get('/public/restaurant/catalog', async (req: Request, res: Response) => {
  try {
    const slug = String(req.query.slug || '').trim();
    const token = String(req.query.token || '').trim();
    if (!slug || !token) {
      return res.status(400).json({ success: false, error: 'Parâmetros slug e token da mesa são obrigatórios.' });
    }
    // Verify table is valid and active (also verifies restaurant_tables feature)
    await restaurantRepo.getPublicTableInfo(slug, token);
    // Fetch live catalog from productRepo for table channel
    const catalog = await productRepo.getPublicCatalog(slug, {
      categoryId: req.query.categoryId as string,
      search: req.query.search as string,
      featuredOnly: req.query.featuredOnly === 'true',
      sort: req.query.sort as string,
      channel: 'table',
      dayOfWeek: req.query.dayOfWeek !== undefined ? (Number(req.query.dayOfWeek) as any) : undefined,
    });
    return res.json(catalog);
  } catch (err: any) {
    return handlePublicRestaurantError(res, err, 'Erro ao carregar cardápio da mesa.');
  }
});

// 3. Submit Order from Table
apiRouter.post('/public/restaurant/orders', async (req: Request, res: Response) => {
  try {
    const { tenantSlug, tableToken, customerName, notes, items, idempotencyKey } = req.body;
    if (!tenantSlug || !tableToken || !items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'Dados do pedido incompletos.' });
    }
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || 'unknown';
    const order = await restaurantRepo.createOrderFromTable(
      {
        tenantSlug,
        tableToken,
        customerName,
        notes,
        items,
        idempotencyKey,
      },
      clientIp
    );
    return res.status(201).json({ success: true, order });
  } catch (err: any) {
    return handlePublicRestaurantError(res, err, 'Falha ao processar pedido na mesa.');
  }
});

// 4. View Active Table Session / Bill (Public for patrons at the table)
apiRouter.get('/public/restaurant/table-session', async (req: Request, res: Response) => {
  try {
    const slug = String(req.query.slug || '').trim();
    const token = String(req.query.token || '').trim();
    if (!slug || !token) {
      return res.status(400).json({ success: false, error: 'Parâmetros slug e token da mesa são obrigatórios.' });
    }
    const tableInfo = await restaurantRepo.getPublicTableInfo(slug, token);
    if (!tableInfo.activeSession) {
      return res.json({ success: true, session: null, orders: [], totalAmount: 0 });
    }
    const sessionDetails = await restaurantRepo.getSessionDetails(tableInfo.tenant.id, tableInfo.activeSession.id);
    return res.json({
      success: true,
      session: sessionDetails,
      orders: sessionDetails?.orders || [],
      totalAmount: sessionDetails?.totalAmount || 0,
    });
  } catch (err: any) {
    return handlePublicRestaurantError(res, err, 'Erro ao consultar conta da mesa.');
  }
});

// 5. Request Bill Closing from Table
apiRouter.post('/public/restaurant/request-closing', async (req: Request, res: Response) => {
  try {
    const slug = String(req.body.tenantSlug || req.body.slug || '').trim();
    const token = String(req.body.tableToken || req.body.token || '').trim();
    if (!slug || !token) {
      return res.status(400).json({ success: false, error: 'Parâmetros slug e token da mesa são obrigatórios.' });
    }
    const session = await restaurantRepo.requestSessionClosingFromTable(slug, token);
    return res.json({
      success: true,
      message: 'Solicitação de fechamento enviada com sucesso! O restaurante já foi avisado.',
      session,
    });
  } catch (err: any) {
    return handlePublicRestaurantError(res, err, 'Falha ao solicitar fechamento da conta.');
  }
});

// ==========================================
// RESTAURANT DIGITAL CATALOG & TABLES (ADMIN)
// ==========================================

// Tables Management
apiRouter.get('/restaurant/tables', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const tables = await restaurantRepo.listTables(tenantId);
    return res.json({ success: true, data: tables });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/restaurant/tables', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const table = await restaurantRepo.createTable(tenantId, req.body, req.user!);
    return res.status(201).json({ success: true, data: table });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/restaurant/tables/batch', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const result = await restaurantRepo.createTablesBatch(tenantId, req.body, req.user!);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.put('/restaurant/tables/:id', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const table = await restaurantRepo.updateTable(req.params.id, tenantId, req.body, req.user!);
    return res.json({ success: true, data: table });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.delete('/restaurant/tables/:id', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    await restaurantRepo.deleteTable(req.params.id, tenantId, req.user!);
    return res.json({ success: true, message: 'Mesa excluída com sucesso.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/restaurant/tables/:id/regenerate-token', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const newToken = await restaurantRepo.regenerateTableQrToken(req.params.id, tenantId, req.user!);
    return res.json({ success: true, qrCodeToken: newToken });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.get('/restaurant/tables/:id/session', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const session = await restaurantRepo.getActiveSessionForTable(tenantId, req.params.id);
    return res.json({ success: true, data: session });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/restaurant/tables/:id/close-session', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const result = await restaurantRepo.closeSession(
      tenantId,
      req.params.id,
      req.user!,
      req.body?.notes,
      req.body?.paymentMethod,
      req.body?.sessionId
    );
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/restaurant/tables/:id/cancel-closing', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const session = await restaurantRepo.cancelSessionClosing(tenantId, req.params.id, req.user!);
    return res.json({ success: true, session, message: 'Solicitação de fechamento cancelada. Mesa retornada para ocupada.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Fee Templates Management
apiRouter.get('/restaurant/fees', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const templates = await restaurantRepo.listFeeTemplates(tenantId);
    return res.json({ success: true, data: templates });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/restaurant/fees', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const template = await restaurantRepo.createFeeTemplate(tenantId, req.body, req.user!);
    return res.status(201).json({ success: true, data: template });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.put('/restaurant/fees/:id', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const template = await restaurantRepo.updateFeeTemplate(req.params.id, tenantId, req.body, req.user!);
    return res.json({ success: true, data: template });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.delete('/restaurant/fees/:id', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    await restaurantRepo.deleteFeeTemplate(req.params.id, tenantId, req.user!);
    return res.json({ success: true, message: 'Taxa excluída com sucesso.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Session Fees Management
apiRouter.get('/restaurant/sessions/:sessionId/fees', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const fees = await restaurantRepo.getSessionFees(tenantId, req.params.sessionId);
    return res.json({ success: true, data: fees });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/restaurant/sessions/:sessionId/fees', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const fee = await restaurantRepo.addFeeToSession(tenantId, req.params.sessionId, req.body, req.user!);
    return res.status(201).json({ success: true, data: fee });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.delete('/restaurant/sessions/:sessionId/fees/:feeId', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    await restaurantRepo.removeFeeFromSession(tenantId, req.params.sessionId, req.params.feeId, req.user!);
    return res.json({ success: true, message: 'Taxa removida da comanda.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Orders Management
apiRouter.get('/restaurant/orders', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const sessionStatusParam = req.query.sessionStatus as string | undefined;
    const validSessionStatus: 'open' | 'closed' | 'all' | undefined =
      sessionStatusParam === 'open' || sessionStatusParam === 'closed' || sessionStatusParam === 'all'
        ? sessionStatusParam
        : undefined;

    const orders = await restaurantRepo.listOrders(tenantId, {
      status: req.query.status as string,
      tableId: req.query.tableId as string,
      sessionId: req.query.sessionId as string,
      sessionStatus: validSessionStatus,
      includeClosedSessions: req.query.includeClosedSessions === 'true',
      date: req.query.date as string,
      search: req.query.search as string,
    });
    return res.json({ success: true, data: orders });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.get('/restaurant/orders/:id', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const order = await restaurantRepo.getOrderById(tenantId, req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Pedido não encontrado.' });
    return res.json({ success: true, data: order });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.put('/restaurant/orders/:id/status', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { status, notes } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'Status é obrigatório.' });
    const updated = await restaurantRepo.updateOrderStatus(tenantId, req.params.id, status, req.user!, notes);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/restaurant/orders/:id/cancel', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { reason } = req.body;
    const updated = await restaurantRepo.cancelOrder(tenantId, req.params.id, req.user!, reason);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.put('/restaurant/orders/:id', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const updated = await restaurantRepo.updateRestaurantOrder(tenantId, req.params.id, req.body, req.user!);
    return res.json({ success: true, data: updated, message: 'Pedido atualizado com sucesso!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao atualizar pedido.' });
  }
});

apiRouter.delete('/restaurant/orders/:id', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    await restaurantRepo.deleteRestaurantOrder(tenantId, req.params.id, req.user!);
    return res.json({ success: true, message: 'Pedido excluído com sucesso.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao excluir pedido.' });
  }
});

apiRouter.get('/restaurant/summary', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const summary = await restaurantRepo.getRestaurantSummary(tenantId);
    return res.json({ success: true, data: summary });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// 26. RESTAURANT ANALYTICS, UNIFIED ORDERS, TABLES OVERVIEW & FINANCIAL DASHBOARD
// ==========================================

// 1. Unified Orders Catalog with Advanced Combinable Filters & Pagination
apiRouter.get('/admin/orders/unified', authenticate, requireNonProfessional, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const q = req.query;
    const result = await restaurantAnalyticsService.queryUnifiedOrders(tenantId, {
      period: q.period as any,
      startDate: q.startDate ? String(q.startDate) : undefined,
      endDate: q.endDate ? String(q.endDate) : undefined,
      operationalStatus: q.operationalStatus ? String(q.operationalStatus) : undefined,
      paymentStatus: q.paymentStatus ? (String(q.paymentStatus) as any) : undefined,
      paymentMethod: q.paymentMethod ? String(q.paymentMethod) : undefined,
      fulfillmentType: q.fulfillmentType ? String(q.fulfillmentType) : undefined,
      tableId: q.tableId ? String(q.tableId) : undefined,
      orderNumber: q.orderNumber ? String(q.orderNumber) : undefined,
      customerName: q.customerName ? String(q.customerName) : undefined,
      customerPhone: q.customerPhone ? String(q.customerPhone) : undefined,
      minAmount: q.minAmount !== undefined && q.minAmount !== '' ? Number(q.minAmount) : undefined,
      maxAmount: q.maxAmount !== undefined && q.maxAmount !== '' ? Number(q.maxAmount) : undefined,
      originChannel: q.originChannel ? String(q.originChannel) : undefined,
      search: q.search ? String(q.search) : undefined,
      sortBy: (q.sortBy as any) || 'date',
      sortDirection: (q.sortDirection as any) || 'desc',
      page: q.page ? Number(q.page) : 1,
      limit: q.limit ? Number(q.limit) : 25,
    });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao filtrar catálogo de pedidos.' });
  }
});

// 2. Single Unified Order Details (with Payment & Operational Audit History)
apiRouter.get('/admin/orders/unified/:id', authenticate, requireNonProfessional, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const order = await restaurantAnalyticsService.getUnifiedOrderById(tenantId, req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Pedido não encontrado neste estabelecimento.' });
    }
    return res.json({ success: true, data: order });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao buscar detalhes do pedido.' });
  }
});

// 3. Update Order Financials & Payment Records (Discounts, Partial/Full Payments, Refunds)
apiRouter.post('/admin/orders/:id/financials', authenticate, requireNonProfessional, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const updated = await restaurantAnalyticsService.updateOrderFinancialsAndPayments(
      tenantId,
      req.params.id,
      req.body || {},
      req.user!
    );
    return res.json({
      success: true,
      data: updated,
      message: 'Dados financeiros do pedido atualizados com sucesso!',
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao atualizar financeiro do pedido.' });
  }
});

// 4. Update Table Session Financials & Partial/Split Payments
apiRouter.post('/restaurant/sessions/:sessionId/financials', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const result = await restaurantAnalyticsService.updateSessionFinancialsAndPayments(
      tenantId,
      req.params.sessionId,
      req.body || {},
      req.user!
    );
    return res.json({
      success: true,
      data: result,
      message: 'Pagamentos e financeiro da mesa atualizados com sucesso!',
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao registrar pagamento na mesa.' });
  }
});

// 5. Enriched Tables Monitoring Overview (5 Operational Visual States + Period Performance)
apiRouter.get('/admin/tables/overview', authenticate, requireNonProfessional, requireFeature('restaurant_tables'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const q = req.query;
    const tables = await restaurantAnalyticsService.getEnrichedTablesOverview(tenantId, {
      visualState: q.visualState ? (String(q.visualState) as any) : undefined,
      search: (q.searchNumber || q.search) ? String(q.searchNumber || q.search) : undefined,
      period: q.period as any,
      startDate: q.startDate ? String(q.startDate) : undefined,
      endDate: q.endDate ? String(q.endDate) : undefined,
    });

    const freeCount = tables.filter((t) => t.visualState === 'free').length;
    const occupiedCount = tables.filter((t) => t.visualState === 'occupied').length;
    const preparingCount = tables.filter((t) => t.visualState === 'preparing').length;
    const awaitingPaymentCount = tables.filter((t) => t.visualState === 'awaiting_payment').length;
    const closingCount = tables.filter((t) => t.visualState === 'closing').length;

    const totalOpenAmount = Number(
      tables.reduce((acc, t) => acc + Number(t.currentSessionTotal || 0), 0).toFixed(2)
    );
    const totalPaidInOpenSessions = Number(
      tables.reduce((acc, t) => acc + Number(t.currentSessionPaidAmount || 0), 0).toFixed(2)
    );
    const totalPendingInOpenSessions = Number(
      tables.reduce((acc, t) => acc + Number(t.currentSessionPendingAmount || 0), 0).toFixed(2)
    );

    return res.json({
      success: true,
      data: {
        tables,
        summary: {
          totalTables: tables.length,
          freeTables: freeCount,
          occupiedTables: occupiedCount,
          preparingTables: preparingCount,
          awaitingPaymentTables: awaitingPaymentCount,
          closingTables: closingCount,
          freeCount,
          occupiedCount,
          preparingCount,
          awaitingPaymentCount,
          closingCount,
          totalOpenAmount,
          totalPaidInOpenSessions,
          totalPendingInOpenSessions,
        },
      },
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar acompanhamento de mesas.' });
  }
});

// 6. Complete Restaurant Financial Dashboard (KPIs, 6 Charts, Top Products, Reports)
apiRouter.get('/admin/financial/dashboard', authenticate, requireNonProfessional, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const q = req.query;
    const dashboard = await restaurantAnalyticsService.getFinancialDashboard(tenantId, {
      period: (q.period as any) || 'this_month',
      startDate: q.startDate ? String(q.startDate) : undefined,
      endDate: q.endDate ? String(q.endDate) : undefined,
    });
    return res.json({ success: true, data: dashboard });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Erro ao carregar dashboard financeiro.' });
  }
});





