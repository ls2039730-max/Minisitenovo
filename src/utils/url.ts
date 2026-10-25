/**
 * Centralized URL and Subdomain Utility for LocalHub Multi-Tenant SaaS.
 *
 * Official Custom Base Domain: "minihub.tech"
 *
 * 1. Canonical Tenant Subdomain URL format:
 *    "https://{slug}.minihub.tech" (e.g., "https://una-otica.minihub.tech")
 *    Note: Does NOT append "/p/{slug}" or "/p/" to the subdomain URL.
 *
 * 2. Legacy / Compatibility URL format (preserved for backward compatibility):
 *    "https://minisitenovo.vercel.app/p/{slug}" or "{origin}/p/{slug}"
 */

export const DEFAULT_BASE_DOMAIN = 'minihub.tech';

export const RESERVED_PLATFORM_HOSTS = [
  'vercel.app',
  'run.app',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
];

export const RESERVED_SUBDOMAIN_SLUGS = new Set([
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
  'painel',
  'superadmin',
  'sistema',
  'config',
  'settings',
]);

/**
 * Cleans a raw domain string (strips protocol, paths, ports, and whitespace).
 */
export function cleanDomainString(rawDomain?: string | null): string {
  if (!rawDomain) return '';
  return String(rawDomain)
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split(':')[0]
    .trim()
    .toLowerCase();
}

/**
 * Checks whether a domain is a valid custom base domain (not a placeholder or internal platform host).
 */
export function isValidCustomBaseDomain(domain?: string | null): boolean {
  const clean = cleanDomainString(domain);
  if (!clean || clean === 'meudominio.com' || clean === 'meudominio.com.br') {
    return false;
  }
  if (RESERVED_PLATFORM_HOSTS.some((h) => clean === h || clean.endsWith(`.${h}`) || clean.includes(h))) {
    return false;
  }
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean);
}

/**
 * Returns the active base domain for tenant subdomains, defaulting to "minihub.tech".
 */
export function getConfiguredBaseDomain(overrideDomain?: string | null): string {
  if (overrideDomain && isValidCustomBaseDomain(overrideDomain)) {
    return cleanDomainString(overrideDomain);
  }

  if (typeof window !== 'undefined') {
    const envDomain = (import.meta as any).env?.VITE_APP_BASE_DOMAIN;
    if (isValidCustomBaseDomain(envDomain)) {
      return cleanDomainString(envDomain);
    }

    const winDomain = (window as any).__APP_BASE_DOMAIN;
    if (isValidCustomBaseDomain(winDomain)) {
      return cleanDomainString(winDomain);
    }

    try {
      const saved = localStorage.getItem('localhub_base_domain');
      if (isValidCustomBaseDomain(saved)) {
        return cleanDomainString(saved);
      }
    } catch {
      // ignore storage errors
    }
  } else if (typeof process !== 'undefined' && process.env) {
    const serverDomain = process.env.APP_BASE_DOMAIN || process.env.VITE_APP_BASE_DOMAIN;
    if (isValidCustomBaseDomain(serverDomain)) {
      return cleanDomainString(serverDomain);
    }
  }

  return DEFAULT_BASE_DOMAIN;
}

/**
 * Returns the tenant subdomain hostname: "{slug}.minihub.tech"
 * Example: "una-otica.minihub.tech"
 */
export function getTenantSubdomain(tenantSlug: string, baseDomain?: string): string {
  const cleanSlug = (tenantSlug || '').trim().toLowerCase();
  if (!cleanSlug) return '';
  const effectiveBase = getConfiguredBaseDomain(baseDomain);
  return `${cleanSlug}.${effectiveBase}`;
}

/**
 * Returns the canonical public URL for a tenant: "https://{slug}.minihub.tech"
 * Example: "https://una-otica.minihub.tech"
 *
 * Does NOT append "/p/{slug}" or "/p/" to the subdomain URL unless an explicit subPath is provided.
 */
export function getPublicStoreUrl(
  tenantSlug: string,
  options?: { baseDomain?: string; subPath?: string }
): string {
  const cleanSlug = (tenantSlug || '').trim().toLowerCase();
  if (!cleanSlug) return '';

  const rawOverride = options?.baseDomain;
  const cleanOverride = cleanDomainString(rawOverride);

  // If caller explicitly passed a reserved/internal host (e.g. for legacy fallback tests), use /p/{slug}
  if (
    cleanOverride &&
    (cleanOverride === 'meudominio.com' ||
      RESERVED_PLATFORM_HOSTS.some((h) => cleanOverride.includes(h)))
  ) {
    const proto =
      cleanOverride.includes('localhost') || cleanOverride.includes('127.0.0.1') ? 'http' : 'https';
    return `${proto}://${cleanOverride}/p/${cleanSlug}`;
  }

  const effectiveBase = getConfiguredBaseDomain(rawOverride);
  const normalizedSubPath = options?.subPath
    ? options.subPath.startsWith('/')
      ? options.subPath
      : `/${options.subPath}`
    : '';

  return `https://${cleanSlug}.${effectiveBase}${normalizedSubPath}`;
}

/**
 * Returns the legacy compatibility URL format: "{origin}/p/{slug}"
 * Example: "https://minisitenovo.vercel.app/p/una-otica"
 */
export function getLegacyPublicStoreUrl(tenantSlug: string, origin?: string): string {
  const cleanSlug = (tenantSlug || '').trim().toLowerCase();
  if (!cleanSlug) return '';

  if (origin) {
    return `${origin.replace(/\/$/, '')}/p/${cleanSlug}`;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/p/${cleanSlug}`;
  }
  return `/p/${cleanSlug}`;
}

/**
 * Resolves a tenant slug from a browser or request hostname.
 * Returns null for:
 * - "minihub.tech" (root domain)
 * - "www.minihub.tech"
 * - "*.vercel.app", "*.run.app", "localhost", "127.0.0.1"
 * - Reserved system subdomains (admin, api, app, login, etc.)
 */
export function resolveSlugFromHostname(
  hostname: string | undefined | null,
  baseDomain?: string | null
): string | null {
  if (!hostname) return null;

  const host = hostname.split(',')[0].trim().split(':')[0].toLowerCase();
  if (!host) return null;

  // Never treat internal platform domains or localhost as tenant subdomains
  if (RESERVED_PLATFORM_HOSTS.some((h) => host === h || host.endsWith(`.${h}`) || host.includes(h))) {
    return null;
  }

  const cleanBase = getConfiguredBaseDomain(baseDomain);
  if (!cleanBase) return null;

  // Root domain and www are the SaaS portal, NOT a tenant
  if (host === cleanBase || host === `www.${cleanBase}`) {
    return null;
  }

  // Check if host is a direct subdomain of cleanBase: {slug}.{baseDomain}
  if (host.endsWith(`.${cleanBase}`)) {
    const sub = host.slice(0, -(cleanBase.length + 1));
    // Must be single-level subdomain, not reserved, and valid slug characters
    if (sub && !sub.includes('.') && !RESERVED_SUBDOMAIN_SLUGS.has(sub)) {
      if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sub)) {
        return sub;
      }
    }
  }

  return null;
}
