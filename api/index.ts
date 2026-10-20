import { createRequire } from 'module';
const require = createRequire(import.meta.url);
if (typeof (globalThis as any).require === 'undefined') {
  (globalThis as any).require = require;
}

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { apiRouter } from '../server/routes.js';
import { bootstrapDatabaseIfNeeded } from '../server/db/bootstrap.js';
import { handlePublicSiteHtml, extractSlugFromUrl, getBaseHtml } from '../server/seoRenderer.js';
import { repo } from '../server/db/repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Static uploads directory fallback
const uploadsDir = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME ? '/tmp/uploads' : path.resolve(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (e) {}
}
app.use('/uploads', express.static(uploadsDir));

// Allow CORS in serverless environment
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Trigger bootstrap on cold start safely without blocking request flow
setTimeout(() => {
  bootstrapDatabaseIfNeeded().catch((e) => console.error('[BOOTSTRAP] Startup error on Vercel:', e));
}, 0);

// 1. Dynamic Tenant OpenGraph / Social Sharing routes:
app.get(['/p/:slug', '/p/:slug/*', '/site/:slug', '/site/:slug/*'], (req, res, next) => {
  if (req.path.includes('.') && !req.path.endsWith('.html')) {
    return next();
  }
  return handlePublicSiteHtml(req, res, req.params.slug);
});

// 2. Direct slug / query interception (e.g. /costela-mania or ?slug=costela-mania)
app.use(async (req, res, next) => {
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/uploads') ||
    req.path.startsWith('/m/') ||
    req.path.startsWith('/mesa/')
  ) {
    return next();
  }
  const slug = extractSlugFromUrl(req);
  if (slug) {
    try {
      const tenant = await repo.getTenantBySlug(slug);
      if (tenant) {
        return handlePublicSiteHtml(req, res, slug);
      }
    } catch (e) {}
  }
  next();
});

// Mount API routes
app.use('/api', apiRouter);
app.use('/', apiRouter);

// Catch-all: check if it's a tenant link, otherwise return index.html
app.get('*', async (req, res) => {
  const slug = extractSlugFromUrl(req);
  if (slug) {
    try {
      const tenant = await repo.getTenantBySlug(slug);
      if (tenant) {
        return handlePublicSiteHtml(req, res, slug);
      }
    } catch (e) {}
  }
  const possiblePaths = [
    path.resolve(process.cwd(), 'dist', 'index.html'),
    path.resolve(__dirname, '..', 'dist', 'index.html'),
    path.resolve(__dirname, 'dist', 'index.html'),
    path.resolve(process.cwd(), 'index.html'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return res.sendFile(p);
    }
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(getBaseHtml());
});

export default app;
