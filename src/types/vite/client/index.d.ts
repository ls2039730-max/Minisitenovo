// Type definitions for vite/client and ImportMetaEnv (LocalHub / MiniHub SaaS)
// Ensures TypeScript resolves `types: ["vite/client"]` across all environments,
// including local tsc, Vite bundler, and Vercel (@vercel/node) serverless builds.

interface ViteTypeOptions {
  // strictImportMetaEnv: unknown
}

type ImportMetaEnvFallbackKey =
  'strictImportMetaEnv' extends keyof ViteTypeOptions ? never : string;

interface ImportMetaEnv extends Record<ImportMetaEnvFallbackKey, any> {
  readonly BASE_URL: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_APP_BASE_DOMAIN?: string;
}

interface ImportMeta {
  url: string;
  readonly hot?: any;
  readonly env: ImportMetaEnv;
  glob: Record<string, any>;
}

declare module 'vite/modulepreload-polyfill' {}

type CSSModuleClasses = { readonly [key: string]: string };

declare module '*.module.css' {
  const classes: CSSModuleClasses;
  export default classes;
}
declare module '*.css' {}
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.jpeg' {
  const src: string;
  export default src;
}
declare module '*.gif' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}
declare module '*.ico' {
  const src: string;
  export default src;
}
declare module '*.webp' {
  const src: string;
  export default src;
}
declare module '*.woff' {
  const src: string;
  export default src;
}
declare module '*.woff2' {
  const src: string;
  export default src;
}
declare module '*.ttf' {
  const src: string;
  export default src;
}
