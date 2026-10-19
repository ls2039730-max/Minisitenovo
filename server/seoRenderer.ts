import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import { siteRepo } from './db/siteRepository.js';
import { resolveSlugFromHost } from './tenantResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const RESERVED_SLUGS = new Set([
  'api',
  'uploads',
  'assets',
  'login',
  'admin',
  'superadmin',
  'dashboard',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'index.html',
  '@vite',
  '@fs',
  'node_modules',
  'm',
  'mesa',
]);

const SEGMENT_DEFAULT_IMAGES: Record<string, string> = {
  barbearia: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1200&q=80',
  salao: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80',
  beleza: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80',
  restaurante: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
  hamburgueria: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=80',
  otica: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1200&q=80',
  clinica: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1200&q=80',
  padaria: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80',
  pizzaria: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
  moda: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80',
  loja: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1200&q=80',
};
const DEFAULT_BUSINESS_IMAGE = 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80';

export function extractSlugFromUrl(req: Request): string {
  // 1. Check query parameters first (?slug=..., ?p=..., ?site=...)
  if (req.query) {
    const qSlug = (req.query.slug || req.query.p || req.query.site) as string;
    if (qSlug && typeof qSlug === 'string' && qSlug.trim()) {
      return qSlug.trim().toLowerCase();
    }
  }

  // 2. Check various URL / header candidates
  const candidates: string[] = [
    req.originalUrl || '',
    req.url || '',
    (req.headers['x-matched-path'] as string) || '',
    (req.headers['x-invoke-path'] as string) || '',
    (req.headers['x-forwarded-uri'] as string) || '',
    (req.headers['x-vercel-matched-path'] as string) || '',
    (req.headers['x-original-url'] as string) || '',
  ];

  for (const rawUrl of candidates) {
    if (!rawUrl) continue;
    const cleanPath = rawUrl.split('?')[0].split('#')[0];

    // Check /p/:slug
    const matchP = cleanPath.match(/\/p\/([a-zA-Z0-9_-]+)/i);
    if (matchP && matchP[1]) {
      return matchP[1].toLowerCase();
    }

    // Check /site/:slug
    const matchSite = cleanPath.match(/\/site\/([a-zA-Z0-9_-]+)/i);
    if (matchSite && matchSite[1]) {
      return matchSite[1].toLowerCase();
    }

    // Check direct /:slug (single segment)
    const stripped = cleanPath.replace(/^\/+|\/+$/g, '');
    const parts = stripped.split('/');
    if (parts.length === 1 && parts[0] && !parts[0].includes('.')) {
      const seg = parts[0].toLowerCase();
      if (!RESERVED_SLUGS.has(seg)) {
        return seg;
      }
    }
  }

  return '';
}

export function buildTenantMetaTags(
  tenant: any,
  site: any,
  baseUrl: string,
  slug: string,
  isSubdomain = false
): string {
  const tenantName = tenant?.name || 'LocalHub';
  // PRIORITY: The company's real registered logo!
  const tenantLogo =
    tenant?.appearance?.logoUrl ||
    tenant?.logoUrl ||
    tenant?.logo ||
    site?.appearance?.logoUrl ||
    '';

  const siteSeo = site?.seo;
  const heroSection = site?.sections?.find((s: any) => s.type === 'hero');

  // Title: ogTitle > title > Name - Segment > Name
  const rawTitle =
    siteSeo?.ogTitle ||
    siteSeo?.title ||
    (tenant?.segment ? `${tenantName} | ${tenant.segment}` : `${tenantName} — Site Oficial & Atendimento`);
  const title = escapeHtml(rawTitle);

  // Description: ogDescription > description > tagline > hero subtitle > fallback
  const rawDescription =
    siteSeo?.ogDescription ||
    siteSeo?.description ||
    tenant?.appearance?.tagline ||
    heroSection?.settings?.subtitle ||
    heroSection?.settings?.headline ||
    `Conheça ${tenantName}. Atendimento de excelência, qualidade e confiança. Faça seu pedido online ou fale conosco no WhatsApp!`;
  const description = escapeHtml(rawDescription);

  // Logo / Image: For social sharing (og:image / twitter:image), prioritize high-res cover image, seo ogImage, or segment fallback image (1200x630) to prevent Meta "image too small" errors (< 200px) and guarantee WhatsApp mobile/desktop preview success.
  const segmentKey = (tenant?.segment || '').toLowerCase();
  const segmentFallback = Object.keys(SEGMENT_DEFAULT_IMAGES).find(k => segmentKey.includes(k));
  const fallbackImage = segmentFallback ? SEGMENT_DEFAULT_IMAGES[segmentFallback] : DEFAULT_BUSINESS_IMAGE;

  let rawSocialImage = siteSeo?.ogImage || heroSection?.settings?.coverImage || fallbackImage || tenantLogo;
  if (rawSocialImage && rawSocialImage.startsWith('/')) {
    rawSocialImage = `${baseUrl}${rawSocialImage}`;
  }
  if (rawSocialImage && rawSocialImage.startsWith('http://') && !rawSocialImage.includes('localhost')) {
    rawSocialImage = rawSocialImage.replace('http://', 'https://');
  }
  const imageUrl = escapeHtml(rawSocialImage);

  // Favicon uses tenant logo specifically
  let rawFavicon = tenantLogo || rawSocialImage;
  if (rawFavicon && rawFavicon.startsWith('/')) {
    rawFavicon = `${baseUrl}${rawFavicon}`;
  }
  if (rawFavicon && rawFavicon.startsWith('http://') && !rawFavicon.includes('localhost')) {
    rawFavicon = rawFavicon.replace('http://', 'https://');
  }
  const faviconUrl = escapeHtml(rawFavicon);

  // Canonical and og:url: on subdomain https://{slug}.DOMINIO/p/, on standard host https://minisitenovo.vercel.app/p/{slug}
  const targetPath = isSubdomain ? '/p/' : `/p/${slug}`;
  const canonicalUrl = escapeHtml(`${baseUrl}${targetPath}`);
  const escapedTenantName = escapeHtml(tenantName);

  // Determine image MIME type
  let imageType = 'image/jpeg';
  const lowerImg = rawSocialImage.toLowerCase();
  if (lowerImg.includes('.png')) imageType = 'image/png';
  else if (lowerImg.includes('.webp')) imageType = 'image/webp';
  else if (lowerImg.includes('.svg')) imageType = 'image/svg+xml';
  else if (lowerImg.includes('.jpg') || lowerImg.includes('.jpeg')) imageType = 'image/jpeg';

  const schemaJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: tenantName,
    image: rawSocialImage || undefined,
    description: rawDescription,
    telephone: tenant?.whatsapp || tenant?.phone || undefined,
    email: tenant?.email || undefined,
    url: `${baseUrl}${targetPath}`,
  });

  return `
    <!-- Dynamic Tenant SEO & Social Sharing (WhatsApp, Meta / Facebook, Instagram, Twitter/X, Google) -->
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${canonicalUrl}" />

    <!-- OpenGraph (WhatsApp, Facebook, LinkedIn, Telegram, Discord, iMessage) -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:site_name" content="${escapedTenantName}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:locale" content="pt_BR" />
    ${
      imageUrl
        ? `
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:secure_url" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapedTenantName}" />
    <meta property="og:image:type" content="${imageType}" />
    <link rel="image_src" href="${imageUrl}" />
    `
        : ''
    }

    <!-- Twitter / X Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${canonicalUrl}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    ${
      imageUrl
        ? `
    <meta name="twitter:image" content="${imageUrl}" />
    <meta name="twitter:image:src" content="${imageUrl}" />
    <meta name="twitter:image:alt" content="${escapedTenantName}" />
    `
        : ''
    }

    <!-- Favicon & Touch Icon with store logo -->
    ${
      faviconUrl
        ? `
    <link rel="icon" href="${faviconUrl}" />
    <link rel="apple-touch-icon" href="${faviconUrl}" />
    `
        : ''
    }

    <!-- Schema.org JSON-LD LocalBusiness -->
    <script type="application/ld+json">
    ${schemaJson}
    </script>
  `;
}

export function injectMetaIntoHtml(html: string, metaTags: string): string {
  // Remove existing static title, description, og:*, twitter:*, canonical, favicon tags from head
  let cleaned = html
    .replace(/<title[\s\S]*?<\/title>/gi, '')
    .replace(/<meta[^>]+(?:name|property)=["'](?:description|keywords|canonical|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, '')
    .replace(/<link[^>]+rel=["'](?:canonical|icon|apple-touch-icon|image_src)["'][^>]*>/gi, '');

  if (cleaned.includes('</head>')) {
    return cleaned.replace('</head>', `${metaTags}\n  </head>`);
  }
  if (cleaned.includes('<head>')) {
    return cleaned.replace('<head>', `<head>\n${metaTags}`);
  }
  return `${metaTags}\n${cleaned}`;
}

export function getBaseHtml(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), 'dist', 'index.html'),
    path.resolve(process.cwd(), 'index.html'),
    path.resolve(__dirname, '..', 'dist', 'index.html'),
    path.resolve(__dirname, '..', 'index.html'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        return fs.readFileSync(p, 'utf-8');
      } catch (e) {}
    }
  }

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
}

export async function handlePublicSiteHtml(
  req: Request,
  res: Response,
  slugParam?: string,
  transformHtml?: (url: string, html: string) => Promise<string>
): Promise<void> {
  try {
    const forwardedHost = (req.headers['x-forwarded-host'] as string) || '';
    const hostHeader = forwardedHost.split(',')[0].trim() || req.get('host') || '';
    const baseDomain = process.env.APP_BASE_DOMAIN || '';
    const simHeader = (req.headers['x-tenant-slug'] || req.headers['x-simulate-tenant']) as string | undefined;
    const simQuery = req.query?.simulate_subdomain as string | undefined;
    const subdomainSlug = resolveSlugFromHost(hostHeader, baseDomain, simHeader || simQuery);

    const baseHtml = getBaseHtml();

    let slug = (slugParam || '').trim().toLowerCase();

    // If path did not specify a slug (e.g. /p, /p/, or / on subdomain), use subdomainSlug or query/url
    if (!slug) {
      if (subdomainSlug) {
        slug = subdomainSlug;
      } else {
        slug = extractSlugFromUrl(req);
      }
    }

    // Security & Tenant Isolation:
    // If request arrives on a tenant subdomain (e.g. una-otica.dominio.com),
    // and an explicit different slug is passed in the path (e.g. /p/outra-loja),
    // block cross-tenant leakage immediately!
    if (subdomainSlug && slug && subdomainSlug.toLowerCase() !== slug.toLowerCase()) {
      const notFoundHtml = injectMetaIntoHtml(
        baseHtml,
        `<title>Estabelecimento não encontrado</title><meta name="description" content="O endereço solicitado não pertence a este domínio." />`
      );
      if (transformHtml) {
        try {
          const transformed = await transformHtml(req.originalUrl || `/p/`, notFoundHtml);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.status(404).send(transformed);
          return;
        } catch (e) {}
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(404).send(notFoundHtml);
      return;
    }

    if (!slug) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(baseHtml);
      return;
    }

    // Determine Base URL: always prioritize https in cloud/production
    const forwardedProto = (req.headers['x-forwarded-proto'] as string) || '';
    const host = hostHeader || 'minisitenovo.vercel.app';
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const proto = isLocal ? 'http' : (forwardedProto.split(',')[0].trim() || 'https');
    const baseUrl = `${proto}://${host}`;

    // Fetch tenant & site data
    const result = await siteRepo.getPublicSiteBySlug(slug);

    if (result && result.tenant) {
      const isSubdomain = Boolean(subdomainSlug && subdomainSlug.toLowerCase() === slug.toLowerCase());
      const metaTags = buildTenantMetaTags(result.tenant, result.site, baseUrl, slug, isSubdomain);
      let finalHtml = injectMetaIntoHtml(baseHtml, metaTags);

      if (transformHtml) {
        try {
          finalHtml = await transformHtml(req.originalUrl || (isSubdomain ? '/p/' : `/p/${slug}`), finalHtml);
        } catch (e) {}
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      res.status(200).send(finalHtml);
      return;
    }

    let notFoundHtml = injectMetaIntoHtml(
      baseHtml,
      `<title>Página não encontrada</title><meta name="description" content="O estabelecimento solicitado não foi encontrado ou mudou de endereço." />`
    );
    if (transformHtml) {
      try {
        notFoundHtml = await transformHtml(req.originalUrl || `/p/${slug}`, notFoundHtml);
      } catch (e) {}
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(404).send(notFoundHtml);
  } catch (err: any) {
    console.error('[SEO RENDERER] Error rendering public site HTML:', err);
    const baseHtml = getBaseHtml();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(baseHtml);
  }
}
