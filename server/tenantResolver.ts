import { TenantStatus } from '../src/types/saas.js';

export const RESERVED_SLUGS = new Set([
  'www',
  'admin',
  'api',
  'app',
  'dashboard',
  'login',
  'signup',
  'suporte',
  'support',
  'mail',
  'auth',
  'billing',
  'cdn',
  'static',
  'assets',
  'help',
  'status',
  'portal',
  'account',
  'webmail',
  'root',
  'sysadmin',
]);

/**
 * Normalizes text to a clean slug:
 * - lowercase
 * - strips accents / diacritics
 * - replaces spaces and special chars with hyphens
 * - trims extra hyphens
 */
export function generateValidSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9]+/g, '-')     // replace non-alphanumeric with hyphen
    .replace(/^-+|-+$/g, '')         // trim leading/trailing hyphens
    .substring(0, 50);
}

/**
 * Validates slug format and reserved word restrictions
 */
export function validateSlug(slug: string): { valid: boolean; error?: string } {
  const clean = slug.trim().toLowerCase();

  if (!clean || clean.length < 2) {
    return { valid: false, error: 'O slug deve conter pelo menos 2 caracteres.' };
  }

  if (clean.length > 50) {
    return { valid: false, error: 'O slug não pode exceder 50 caracteres.' };
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean)) {
    return {
      valid: false,
      error: 'O slug só pode conter letras minúsculas sem acento, números e hífens entre palavras.',
    };
  }

  if (RESERVED_SLUGS.has(clean)) {
    return {
      valid: false,
      error: `O slug "${clean}" é uma palavra reservada do sistema e não pode ser utilizado.`,
    };
  }

  return { valid: true };
}

/**
 * Resolves tenant slug from the incoming HTTP Host / header
 */
export function resolveSlugFromHost(
  hostHeader: string | undefined,
  baseDomain: string = process.env.APP_BASE_DOMAIN || 'meudominio.com',
  simulationHeader?: string
): string | null {
  // Allow explicit development simulation header
  if (simulationHeader && simulationHeader.trim()) {
    const simSlug = simulationHeader.trim().toLowerCase();
    if (!RESERVED_SLUGS.has(simSlug)) {
      return simSlug;
    }
  }

  if (!hostHeader) return null;

  // Remove port if present (e.g., localhost:3000)
  const host = hostHeader.split(':')[0].toLowerCase();
  const cleanBase = baseDomain.toLowerCase();

  // If exact match on baseDomain or localhost, no tenant subdomain
  if (host === cleanBase || host === 'localhost' || host === '127.0.0.1') {
    return null;
  }

  if (host.endsWith(`.${cleanBase}`)) {
    const sub = host.slice(0, -(cleanBase.length + 1));
    if (sub && !RESERVED_SLUGS.has(sub)) {
      return sub;
    }
  }

  return null;
}

/**
 * Central business logic for tenant operational availability
 */
export function canTenantOperate(status: TenantStatus): {
  canOperate: boolean;
  requiresWarning: boolean;
  warningMessage?: string;
  blockedReason?: string;
} {
  switch (status) {
    case 'ativo':
      return { canOperate: true, requiresWarning: false };
    case 'teste':
      return {
        canOperate: true,
        requiresWarning: false,
        warningMessage: 'Empresa em período de testes.',
      };
    case 'pagamento_pendente':
      return {
        canOperate: true,
        requiresWarning: true,
        warningMessage: 'Aviso: Há uma fatura de assinatura pendente de pagamento.',
      };
    case 'atrasado':
      return {
        canOperate: true,
        requiresWarning: true,
        warningMessage: 'Atenção: O pagamento da assinatura está atrasado. Regularize para evitar suspensão.',
      };
    case 'suspenso':
      return {
        canOperate: false,
        requiresWarning: false,
        blockedReason: 'O estabelecimento encontra-se suspenso. Contate o suporte da plataforma.',
      };
    case 'cancelado':
      return {
        canOperate: false,
        requiresWarning: false,
        blockedReason: 'O estabelecimento foi cancelado no sistema.',
      };
    default:
      return { canOperate: false, requiresWarning: false, blockedReason: 'Status desconhecido.' };
  }
}
