/**
 * Frontend Google Maps Configuration, Script Loader & Security Utility
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

export interface GoogleMapsScriptLoadResult {
  loaded: boolean;
  status: 'loaded' | 'auth_error' | 'network_error' | 'no_key';
  errorMessage?: string;
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

let googleMapsScriptPromise: Promise<GoogleMapsScriptLoadResult> | null = null;
let googleMapsLoadedKey: string | null = null;

/**
 * Singleton loader for the official Google Maps JavaScript API (`maps.googleapis.com/maps/api/js`).
 * Ensures the script is loaded at most once, detects authentication / billing / HTTP Referrer errors
 * via `window.gm_authFailure`, and never blocks fallback rendering if unavailable.
 */
export function loadGoogleMapsScript(
  apiKey: string | null | undefined,
  onAuthFailure?: (reason: string) => void
): Promise<GoogleMapsScriptLoadResult> {
  if (!isValidGoogleMapsKeyString(apiKey)) {
    return Promise.resolve({
      loaded: false,
      status: 'no_key',
    });
  }

  const cleanKey = apiKey.trim();

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve({
      loaded: false,
      status: 'no_key',
    });
  }

  // If already loaded with the same key and google.maps is available
  if (
    (window as any).google?.maps &&
    googleMapsLoadedKey === cleanKey
  ) {
    return Promise.resolve({
      loaded: true,
      status: 'loaded',
    });
  }

  if (googleMapsScriptPromise && googleMapsLoadedKey === cleanKey) {
    return googleMapsScriptPromise;
  }

  googleMapsLoadedKey = cleanKey;
  googleMapsScriptPromise = new Promise<GoogleMapsScriptLoadResult>((resolve) => {
    let settled = false;
    const prevAuthFailure = (window as any).gm_authFailure;

    const handleAuthError = () => {
      const msg =
        'Falha de autenticação na Maps JavaScript API (verifique HTTP Referrer, faturamento ou ativação da Maps JavaScript API no Google Cloud). Camada OpenStreetMap / CARTO mantida automaticamente.';
      if (onAuthFailure) {
        onAuthFailure(msg);
      }
      if (!settled) {
        settled = true;
        resolve({
          loaded: false,
          status: 'auth_error',
          errorMessage: msg,
        });
      }
      if (typeof prevAuthFailure === 'function') {
        try {
          prevAuthFailure();
        } catch {}
      }
    };

    (window as any).gm_authFailure = handleAuthError;

    const existingScript = document.querySelector(
      'script[data-google-maps-sdk="true"]'
    ) as HTMLScriptElement | null;

    if (existingScript) {
      if ((window as any).google?.maps) {
        settled = true;
        resolve({ loaded: true, status: 'loaded' });
        return;
      }
      existingScript.remove();
    }

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsSdk = 'true';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      cleanKey
    )}&v=weekly&language=pt-BR&region=BR`;

    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({
          loaded: false,
          status: 'network_error',
          errorMessage:
            'Tempo limite excedido ao carregar o script do Google Maps. Utilizando camada viária OpenStreetMap / CARTO.',
        });
      }
    }, 6000);

    script.onload = () => {
      window.clearTimeout(timeoutId);
      // Wait briefly to allow gm_authFailure to fire if the key is rejected by Google
      window.setTimeout(() => {
        if (settled) return;
        settled = true;
        if ((window as any).google?.maps) {
          resolve({ loaded: true, status: 'loaded' });
        } else {
          resolve({
            loaded: false,
            status: 'auth_error',
            errorMessage:
              'A biblioteca Google Maps não pôde ser inicializada. Camada viária OpenStreetMap / CARTO ativa.',
          });
        }
      }, 250);
    };

    script.onerror = () => {
      window.clearTimeout(timeoutId);
      if (!settled) {
        settled = true;
        googleMapsScriptPromise = null;
        resolve({
          loaded: false,
          status: 'network_error',
          errorMessage:
            'Não foi possível conectar ao servidor do Google Maps. Camada viária OpenStreetMap / CARTO ativa.',
        });
      }
    };

    document.head.appendChild(script);
  });

  return googleMapsScriptPromise;
}
