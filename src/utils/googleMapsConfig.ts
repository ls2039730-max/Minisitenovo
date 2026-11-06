/**
 * Frontend & Shared Google Maps API Key Resolution Utility
 *
 * Ensures that whether the administrator configures `VITE_GOOGLE_MAPS_API_KEY` (Vite frontend prefix)
 * or `GOOGLE_MAPS_API_KEY` (standard backend/Vercel variable), the frontend map component
 * can always resolve the public browser key without ever displaying "API Key required".
 *
 * Never exposes or reads private credentials (such as SUPABASE_SECRET_KEY or JWT_SECRET).
 */

export interface ResolvedGoogleMapsConfig {
  configured: boolean;
  apiKey: string | null;
  source: 'vite_env' | 'runtime_api_config' | 'none';
}

export function isValidGoogleMapsKeyString(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed === 'YOUR_API_KEY') return false;
  if (trimmed.toLowerCase().includes('your-')) return false;
  return true;
}

/**
 * Synchronously checks build-time Vite environment variables (`VITE_GOOGLE_MAPS_API_KEY`).
 * Note: `vite.config.ts` bridges `GOOGLE_MAPS_API_KEY` into `import.meta.env.VITE_GOOGLE_MAPS_API_KEY`
 * at build time if `VITE_GOOGLE_MAPS_API_KEY` is not explicitly set.
 */
export function getBuildTimeGoogleMapsKey(): string | null {
  try {
    const env = (import.meta as any)?.env;
    const candidate = env?.VITE_GOOGLE_MAPS_API_KEY || env?.GOOGLE_MAPS_API_KEY;
    if (isValidGoogleMapsKeyString(candidate)) {
      return candidate.trim();
    }
  } catch {
    // Ignore if import.meta is unavailable in non-Vite Node context
  }
  return null;
}

/**
 * Resolves the Google Maps API key from either build-time Vite env or runtime `/api/config` endpoint.
 */
export async function resolveFrontendGoogleMapsConfig(): Promise<ResolvedGoogleMapsConfig> {
  const buildKey = getBuildTimeGoogleMapsKey();
  if (buildKey) {
    return {
      configured: true,
      apiKey: buildKey,
      source: 'vite_env',
    };
  }

  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      if (data?.googleMapsConfigured && isValidGoogleMapsKeyString(data?.googleMapsApiKey)) {
        return {
          configured: true,
          apiKey: data.googleMapsApiKey.trim(),
          source: 'runtime_api_config',
        };
      }
    }
  } catch {
    // Network or offline fallback
  }

  return {
    configured: false,
    apiKey: null,
    source: 'none',
  };
}
