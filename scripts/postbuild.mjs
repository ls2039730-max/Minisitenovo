import fs from 'fs';
import path from 'path';

const distDir = path.resolve(process.cwd(), 'dist');
const indexHtmlPath = path.join(distDir, 'index.html');
const spaHtmlPath = path.join(distDir, '_spa.html');

if (fs.existsSync(indexHtmlPath)) {
  // Always create _spa.html so serverless functions (api/index.ts) can read the compiled Vite template
  fs.copyFileSync(indexHtmlPath, spaHtmlPath);
  console.log('[POSTBUILD] Copied dist/index.html -> dist/_spa.html');

  // When building on Vercel, remove dist/index.html so Vercel's static file handler
  // does not intercept GET / before vercel.json rewrites route it to /api (api/index.ts).
  if (process.env.VERCEL) {
    fs.unlinkSync(indexHtmlPath);
    console.log('[POSTBUILD] Vercel environment detected: removed dist/index.html so GET / routes through api/index.ts');
  }
}
