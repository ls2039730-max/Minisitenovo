/**
 * Frontend Google Maps Configuration & Security Utility
 *
 * Security & Separation of Concerns:
 * - `VITE_GOOGLE_MAPS_API_KEY`: Public key intended for browser rendering (must be restricted by HTTP Referrer).
 * - `GOOGLE_MAPS_API_KEY`: Private server-side key used exclusively by backend Web Services
 *   (Geocoding API, Distance Matrix API, Directions API). Its value is NEVER exposed in the browser bundle
 *   or returned by `/api/config` — only a boolean `googleMapsBackendConfigured` is reported.
 */

export interface ResolvedGoogleMapsConfig {
  configured: boolean;
  backendConfigured: boolean;
  apiKey: string | null;
  source: 'vite_env' | 'runtime_api_config' | 'backend_only' | 'none';
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
 * Synchronously checks the public build-time Vite environment variable (`VITE_GOOGLE_MAPS_API_KEY`).
 * Never reads or exposes private backend variables.
 */
export function getBuildTimeGoogleMapsKey(): string | null {
  try {
    const env = (import.meta as any)?.env;
    const candidate = env?.VITE_GOOGLE_MAPS_API_KEY;
    if (isValidGoogleMapsKeyString(candidate)) {
      return candidate.trim();
    }
  } catch {
    // Ignore if import.meta is unavailable in non-Vite Node context
  }
  return null;
}

/**
 * Resolves the Google Maps configuration from build-time `VITE_GOOGLE_MAPS_API_KEY`
 * and runtime `/api/config` (which exposes only the public key + a boolean for backend routing).
 */
export async function resolveFrontendGoogleMapsConfig(): Promise<ResolvedGoogleMapsConfig> {
  const buildKey = getBuildTimeGoogleMapsKey();

  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      const publicKey = isValidGoogleMapsKeyString(data?.googleMapsApiKey)
        ? data.googleMapsApiKey.trim()
        : buildKey;
      const backendConfigured = Boolean(data?.googleMapsBackendConfigured);

      if (publicKey) {
        return {
          configured: true,
          backendConfigured,
          apiKey: publicKey,
          source: buildKey ? 'vite_env' : 'runtime_api_config',
        };
      }

      if (backendConfigured || Boolean(data?.googleMapsConfigured)) {
        return {
          configured: true,
          backendConfigured: true,
          apiKey: null,
          source: 'backend_only',
        };
      }
    }
  } catch {
    // Network or offline fallback
  }

  if (buildKey) {
    return {
      configured: true,
      backendConfigured: false,
      apiKey: buildKey,
      source: 'vite_env',
    };
  }

  return {
    configured: false,
    backendConfigured: false,
    apiKey: null,
    source: 'none',
  };
}
