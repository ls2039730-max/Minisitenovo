import express from 'express';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { apiRouter } from './server/routes.js';
import { bootstrapDatabaseIfNeeded } from './server/db/bootstrap.js';
import { handlePublicSiteHtml } from './server/seoRenderer.js';
import { repo } from './server/db/repository.js';
import { resolveSlugFromHost } from './server/tenantResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // Ensure database has initial bootstrap state
  bootstrapDatabaseIfNeeded().catch((e) => console.error('[BOOTSTRAP] Startup error:', e));

  const app = express();
  // In this environment, NGINX listens on port 8080 and proxies traffic to this server on port 3000.
  // The Node application must always bind to port 3000.
  const portArgIndex = process.argv.indexOf('--port');
  const portArg = portArgIndex !== -1 ? parseInt(process.argv[portArgIndex + 1], 10) : null;
  const PORT = portArg && !isNaN(portArg)
    ? portArg
    : (process.env.DEFAULT_APP_PORT
        ? parseInt(process.env.DEFAULT_APP_PORT, 10)
        : 3000);
  const isProd = process.env.NODE_ENV === 'production';

  console.log('[LOCALHUB] Starting platform backend with Supabase infrastructure.');

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));
  app.use(cookieParser());

  // Static uploads directory
  const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

  // Mount API routes
  app.use('/api', apiRouter);

  let viteInstance: any = null;
  if (!isProd) {
    // Development mode: create Vite dev server instance
    const { createServer: createViteServer } = await import('vite');
    viteInstance = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
  }

  // Intercept all public site paths before Vite / static fallback:
  // 1. Root '/' on custom tenant subdomains (e.g. https://una-otica.DOMINIO/)
  app.get('/', (req, res, next) => {
    const forwardedHost = (req.headers['x-forwarded-host'] as string) || '';
    const hostHeader = forwardedHost.split(',')[0].trim() || req.get('host') || '';
    const baseDomain = process.env.APP_BASE_DOMAIN || '';
    const simHeader = (req.headers['x-tenant-slug'] || req.headers['x-simulate-tenant']) as string | undefined;
    const simQuery = req.query?.simulate_subdomain as string | undefined;
    const subdomainSlug = resolveSlugFromHost(hostHeader, baseDomain, simHeader || simQuery);

    if (subdomainSlug) {
      return handlePublicSiteHtml(
        req,
        res,
        subdomainSlug,
        !isProd && viteInstance ? (url, html) => viteInstance.transformIndexHtml(url, html) : undefined
      );
    }
    next();
  });

  // 2. /p, /p/, /p/:slug and /site/:slug
  // Supports both standard https://minisitenovo.vercel.app/p/:slug and subdomain https://una-otica.DOMINIO/p/
  app.get(['/p', '/p/', '/p/:slug', '/p/:slug/*', '/site', '/site/', '/site/:slug', '/site/:slug/*'], (req, res, next) => {
    if (req.path.includes('.') && !req.path.endsWith('.html')) {
      return next();
    }
    return handlePublicSiteHtml(
      req,
      res,
      req.params.slug,
      !isProd && viteInstance ? (url, html) => viteInstance.transformIndexHtml(url, html) : undefined
    );
  });

  // 3. Direct slug interception (e.g. /costela-mania, /otica-inovence)
  const RESERVED_DIRECT_PATHS = new Set([
    'p',
    'site',
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

  // Handle table QR code routes (/m/:slug/:token and /mesa/:slug/:token)
  app.get(['/m/:slug/:token', '/mesa/:slug/:token'], async (req, res, next) => {
    try {
      let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
      if (!isProd && viteInstance) {
        template = await viteInstance.transformIndexHtml(req.originalUrl, template);
      }
      return res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      next(e);
    }
  });

  app.get('/:slug', async (req, res, next) => {
    const slug = req.params.slug?.toLowerCase();
    if (!slug || slug.includes('.') || RESERVED_DIRECT_PATHS.has(slug)) {
      return next();
    }
    try {
      const tenant = await repo.getTenantBySlug(slug);
      if (tenant) {
        return handlePublicSiteHtml(
          req,
          res,
          slug,
          !isProd && viteInstance ? (url, html) => viteInstance.transformIndexHtml(url, html) : undefined
        );
      }
    } catch (e) {}
    next();
  });

  if (!isProd && viteInstance) {
    app.use(viteInstance.middlewares);
  } else {
    // Production mode: serve built assets from dist
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LocalHub SaaS server running on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
