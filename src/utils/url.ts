/**
 * Utility to generate public store URLs supporting the hybrid architecture:
 * 
 * 1. Current production format (default when no custom base domain is configured):
 *    "https://minisitenovo.vercel.app/p/{slug}"
 * 
 * 2. Future custom domain format (when APP_BASE_DOMAIN is set with a verified domain, e.g., "meudominio.com.br"):
 *    "https://{slug}.{baseDomain}/p/"
 * 
 * Does NOT use or hardcode fictitious domains. If APP_BASE_DOMAIN is not set
 * or contains platform hosts (vercel.app, run.app, localhost), it safely preserves
 * the existing "/p/{slug}" URL format.
 */

export function getPublicStoreUrl(tenantSlug: string): string {
  if (!tenantSlug) return '';

  let baseDomain = '';
  if (typeof window !== 'undefined') {
    baseDomain =
      (import.meta as any).env?.VITE_APP_BASE_DOMAIN ||
      (window as any).__APP_BASE_DOMAIN ||
      localStorage.getItem('localhub_base_domain') ||
      '';
  } else {
    baseDomain = process.env.APP_BASE_DOMAIN || '';
  }

  const cleanBase = baseDomain
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .trim()
    .toLowerCase();

  // Infrastructure domains where 4th-level wildcard TLS is not supported
  const RESERVED_HOSTS = ['vercel.app', 'run.app', 'localhost', '127.0.0.1', '0.0.0.0'];
  const isExcluded =
    !cleanBase ||
    cleanBase === 'meudominio.com' ||
    RESERVED_HOSTS.some((h) => cleanBase.includes(h));

  // If a real custom domain is configured, generate dynamic subdomain: https://{slug}.{baseDomain}/p/
  if (!isExcluded) {
    return `https://${tenantSlug}.${cleanBase}/p/`;
  }

  // Default: preserve existing production URL structure (https://minisitenovo.vercel.app/p/{slug})
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/p/${tenantSlug}`;
  }
  return `/p/${tenantSlug}`;
}
