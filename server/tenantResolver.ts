import { TenantStatus } from '../src/types/saas.js';
import {
  DEFAULT_BASE_DOMAIN,
  RESERVED_PLATFORM_HOSTS,
  RESERVED_SUBDOMAIN_SLUGS,
  cleanDomainString,
  isValidCustomBaseDomain,
  getPublicStoreUrl,
  getTenantSubdomain,
} from '../src/utils/url.js';

export const RESERVED_SLUGS = RESERVED_SUBDOMAIN_SLUGS;

export { DEFAULT_BASE_DOMAIN, getPublicStoreUrl, getTenantSubdomain };

/**
 * Returns the configured base domain on the server, defaulting to "minihub.tech".
 */
export function getServerBaseDomain(overrideDomain?: string | null): string {
  if (overrideDomain && isValidCustomBaseDomain(overrideDomain)) {
    return cleanDomainString(overrideDomain);
  }
  const envDomain = process.env.APP_BASE_DOMAIN || process.env.VITE_APP_BASE_DOMAIN;
  if (isValidCustomBaseDomain(envDomain)) {
    return cleanDomainString(envDomain);
  }
  return DEFAULT_BASE_DOMAIN;
}

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
 * Resolves tenant slug from the incoming HTTP Host / X-Forwarded-Host header.
 *
 * Security rules:
 * - Does NOT trust arbitrary or reserved hosts.
 * - Does NOT allow subdomains of platform hosts (vercel.app, run.app, localhost) to act as store subdomains.
 * - Treats "minihub.tech" and "www.minihub.tech" as main platform hosts (returns null).
 * - Restricts to a single subdomain level ({slug}.minihub.tech) and verifies valid slug format.
 */
export function resolveSlugFromHost(
  hostHeader: string | undefined,
  baseDomain?: string,
  simulationHeader?: string
): string | null {
  // Allow explicit development simulation header when valid and not reserved
  if (simulationHeader && simulationHeader.trim()) {
    const simSlug = simulationHeader.trim().toLowerCase();
    if (!RESERVED_SLUGS.has(simSlug) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(simSlug)) {
      return simSlug;
    }
  }

  if (!hostHeader) return null;

  // Clean raw host (strip port, take first host if comma-separated from reverse proxies)
  const host = hostHeader.split(',')[0].trim().split(':')[0].toLowerCase();
  if (!host) return null;

  // Never interpret internal Vercel / Cloud Run / localhost domains as tenant slugs
  if (RESERVED_PLATFORM_HOSTS.some((h) => host === h || host.endsWith(`.${h}`) || host.includes(h))) {
    return null;
  }

  // If caller explicitly passed a non-empty baseDomain that is invalid/placeholder, return null
  if (baseDomain !== undefined && baseDomain !== '') {
    const rawClean = cleanDomainString(baseDomain);
    if (
      rawClean === 'meudominio.com' ||
      RESERVED_PLATFORM_HOSTS.some((h) => rawClean.includes(h))
    ) {
      return null;
    }
  }

  const cleanBase = getServerBaseDomain(baseDomain);
  if (!cleanBase) return null;

  // Exact match on root domain (minihub.tech) or www (www.minihub.tech) -> Not a tenant slug
  if (host === cleanBase || host === `www.${cleanBase}`) {
    return null;
  }

  // Check if host ends with .{cleanBase} (e.g., una-otica.minihub.tech)
  if (host.endsWith(`.${cleanBase}`)) {
    const sub = host.slice(0, -(cleanBase.length + 1));
    // Ensure single subdomain level (no nested dots), not reserved, and valid slug format
    if (sub && !sub.includes('.') && !RESERVED_SLUGS.has(sub)) {
      if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sub)) {
        return sub;
      }
    }
  }

  return null;
}

/**
 * Safely extracts tenant slug from any request, checking:
 * 1. Hostname subdomain (e.g., una-otica.minihub.tech)
 * 2. URL path (/p/:slug, /site/:slug, or /:slug)
 * 3. Query string (?p=, ?slug=)
 */
export function extractTenantSlugFromRequest(req: any): {
  slug: string | null;
  source: 'subdomain' | 'path' | 'query';
  isCustomDomainSubdomain: boolean;
} {
  const hostHeader = (req.headers?.['x-forwarded-host'] || req.headers?.host || '').toString();
  const baseDomain = getServerBaseDomain();
  const subSlug = resolveSlugFromHost(
    hostHeader,
    baseDomain,
    (req.headers?.['x-tenant-slug'] || req.headers?.['x-simulate-tenant']) as string
  );

  if (subSlug) {
    return { slug: subSlug, source: 'subdomain', isCustomDomainSubdomain: true };
  }

  // Path check
  const path = req.path || '';
  const matchP = path.match(/\/p\/([a-zA-Z0-9_-]+)/i);
  if (matchP && matchP[1]) {
    return { slug: matchP[1].toLowerCase(), source: 'path', isCustomDomainSubdomain: false };
  }

  const matchSite = path.match(/\/site\/([a-zA-Z0-9_-]+)/i);
  if (matchSite && matchSite[1]) {
    return { slug: matchSite[1].toLowerCase(), source: 'path', isCustomDomainSubdomain: false };
  }

  // Direct slug /:slug (single segment)
  const stripped = path.replace(/^\/+|\/+$/g, '');
  const parts = stripped.split('/');
  if (parts.length === 1 && parts[0] && !parts[0].includes('.')) {
    const seg = parts[0].toLowerCase();
    if (!RESERVED_SLUGS.has(seg)) {
      return { slug: seg, source: 'path', isCustomDomainSubdomain: false };
    }
  }

  // Query check
  if (req.query) {
    const qSlug = (req.query.slug || req.query.p || req.query.site) as string;
    if (qSlug && typeof qSlug === 'string' && qSlug.trim()) {
      return { slug: qSlug.trim().toLowerCase(), source: 'query', isCustomDomainSubdomain: false };
    }
  }

  return { slug: null, source: 'path', isCustomDomainSubdomain: false };
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
