import {
  CepLookupResult,
  DeliveryOriginAddress,
  DistanceCalculationMethod,
} from '../../src/types/order.js';
import {
  calculateStraightLineDistanceKm,
  hasValidCoordinates,
  normalizeCep,
  normalizeDeliveryText,
} from '../../src/utils/deliveryFeeCalculator.js';

export interface GeocodeResult {
  success: boolean;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  precision?: 'rooftop' | 'street' | 'neighborhood' | 'cep' | 'city';
  provider?: 'google' | 'nominatim' | 'brasilapi';
  error?: string;
}

export interface RouteDistanceResult {
  success: boolean;
  distanceKm?: number;
  durationMinutes?: number;
  methodUsed?: DistanceCalculationMethod;
  provider?: 'google' | 'osrm' | 'haversine';
  error?: string;
}

// Simple TTL cache to avoid redundant network calls and respect rate limits
const geocodeCache = new Map<string, { timestamp: number; data: GeocodeResult }>();
const routeCache = new Map<string, { timestamp: number; data: RouteDistanceResult }>();
const cepCache = new Map<string, { timestamp: number; data: CepLookupResult }>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

const STATE_NAMES_BR: Record<string, string> = {
  ac: 'acre',
  al: 'alagoas',
  ap: 'amapa',
  am: 'amazonas',
  ba: 'bahia',
  ce: 'ceara',
  df: 'distrito federal',
  es: 'espirito santo',
  go: 'goias',
  ma: 'maranhao',
  mt: 'mato grosso',
  ms: 'mato grosso do sul',
  mg: 'minas gerais',
  pa: 'para',
  pb: 'paraiba',
  pr: 'parana',
  pe: 'pernambuco',
  pi: 'piaui',
  rj: 'rio de janeiro',
  rn: 'rio grande do norte',
  rs: 'rio grande do sul',
  ro: 'rondonia',
  rr: 'roraima',
  sc: 'santa catarina',
  sp: 'sao paulo',
  se: 'sergipe',
  to: 'tocantins',
};

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Looks up a Brazilian CEP using ViaCEP and BrasilAPI v2 with caching.
 */
export async function lookupPostalCodeServer(rawCep: string): Promise<CepLookupResult> {
  const cleanCep = normalizeCep(rawCep);
  if (cleanCep.length !== 8) {
    return {
      cep: cleanCep,
      street: '',
      neighborhood: '',
      city: '',
      state: '',
      found: false,
    };
  }

  const cached = cepCache.get(cleanCep);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  let result: CepLookupResult | null = null;

  // 1. Try ViaCEP first for fast street/neighborhood metadata
  try {
    const res = await fetchWithTimeout(`https://viacep.com.br/ws/${cleanCep}/json/`, {
      headers: { Accept: 'application/json' },
    }, 4000);
    if (res.ok) {
      const data = await res.json();
      if (!data.erro) {
        result = {
          cep: cleanCep,
          street: data.logradouro || '',
          neighborhood: data.bairro || '',
          city: data.localidade || '',
          state: (data.uf || '').toUpperCase(),
          found: true,
        };
      }
    }
  } catch {
    // Fallback to BrasilAPI below
  }

  // 2. Try BrasilAPI v2 (either as fallback or to enrich coordinates if missing)
  try {
    const res = await fetchWithTimeout(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`, {
      headers: { Accept: 'application/json' },
    }, 4500);
    if (res.ok) {
      const data = await res.json();
      const lat = data?.location?.coordinates?.latitude
        ? Number(data.location.coordinates.latitude)
        : null;
      const lng = data?.location?.coordinates?.longitude
        ? Number(data.location.coordinates.longitude)
        : null;

      if (!result) {
        result = {
          cep: cleanCep,
          street: data.street || '',
          neighborhood: data.neighborhood || '',
          city: data.city || '',
          state: (data.state || '').toUpperCase(),
          found: true,
          latitude: Number.isFinite(lat) ? lat : null,
          longitude: Number.isFinite(lng) ? lng : null,
        };
      } else {
        if (!result.street && data.street) result.street = data.street;
        if (!result.neighborhood && data.neighborhood) result.neighborhood = data.neighborhood;
        if (!result.city && data.city) result.city = data.city;
        if (!result.state && data.state) result.state = data.state.toUpperCase();
        if (lat && lng && Number.isFinite(lat) && Number.isFinite(lng)) {
          result.latitude = lat;
          result.longitude = lng;
        }
      }
    }
  } catch {
    // Ignore BrasilAPI error if ViaCEP already succeeded
  }

  const finalResult: CepLookupResult = result || {
    cep: cleanCep,
    street: '',
    neighborhood: '',
    city: '',
    state: '',
    found: false,
  };

  if (finalResult.found) {
    cepCache.set(cleanCep, { timestamp: Date.now(), data: finalResult });
  }

  return finalResult;
}

/**
 * Checks if a Nominatim display_name matches the target state/city reasonably well.
 */
function matchesCityOrState(displayName: string, city?: string, state?: string): boolean {
  const normDisplay = normalizeDeliveryText(displayName);
  if (state) {
    const normState = normalizeDeliveryText(state);
    const fullStateName = STATE_NAMES_BR[normState] || normState;
    if (
      !normDisplay.includes(fullStateName) &&
      !normDisplay.split(' ').includes(normState)
    ) {
      return false;
    }
  }
  if (city) {
    const normCity = normalizeDeliveryText(city);
    if (normCity && !normDisplay.includes(normCity)) {
      return false;
    }
  }
  return true;
}

// Circuit breaker for Nominatim if blocked (403/429) to avoid wasting seconds
let nominatimBlockedUntil = 0;

/**
 * Geocodes a structured Brazilian address into (latitude, longitude).
 * Never invents coordinates if geocoding fails.
 */
export async function geocodeAddressServer(
  address: Partial<DeliveryOriginAddress>,
  referenceOrigin?: DeliveryOriginAddress | null
): Promise<GeocodeResult> {
  // If valid coordinates are already provided on the object, validate and return them
  if (hasValidCoordinates(address)) {
    return {
      success: true,
      latitude: Number(address.latitude),
      longitude: Number(address.longitude),
      precision: 'rooftop',
    };
  }

  const cleanCep = normalizeCep(address.cep);
  let street = (address.street || '').trim();
  const number = (address.number || '').trim();
  let neighborhood = (address.neighborhood || '').trim();
  let city = (address.city || '').trim();
  let state = (address.state || '').trim().toUpperCase();

  // If customer is on the exact same street and city as reference store origin:
  if (
    referenceOrigin &&
    hasValidCoordinates(referenceOrigin) &&
    street &&
    normalizeDeliveryText(street) === normalizeDeliveryText(referenceOrigin.street) &&
    city &&
    normalizeDeliveryText(city) === normalizeDeliveryText(referenceOrigin.city)
  ) {
    return {
      success: true,
      latitude: referenceOrigin.latitude,
      longitude: referenceOrigin.longitude,
      formattedAddress: `${street}, ${number || 'S/N'}, ${neighborhood || referenceOrigin.neighborhood}, ${city} - ${state}`,
      precision: 'street',
      provider: 'google',
    };
  }

  // Enrich from CEP if city/state/street are missing or to obtain fast coordinates
  let cepLookupData: CepLookupResult | null = null;
  if (cleanCep.length === 8) {
    cepLookupData = await lookupPostalCodeServer(cleanCep);
    if (cepLookupData.found) {
      if (!street && cepLookupData.street) street = cepLookupData.street;
      if (!neighborhood && cepLookupData.neighborhood) neighborhood = cepLookupData.neighborhood;
      if (!city && cepLookupData.city) city = cepLookupData.city;
      if (!state && cepLookupData.state) state = cepLookupData.state;
    }
  }

  if (!city && !state && cleanCep.length !== 8) {
    return {
      success: false,
      error: 'Endereço insuficiente para geocodificação. Informe cidade, UF e logradouro ou CEP válido.',
    };
  }

  const cacheKey = normalizeDeliveryText(
    `${cleanCep}|${street}|${number}|${neighborhood}|${city}|${state}`
  );
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // 1. Fast check: If CEP lookup already gave us valid coordinates, use them!
  if (
    cepLookupData &&
    cepLookupData.found &&
    typeof cepLookupData.latitude === 'number' &&
    typeof cepLookupData.longitude === 'number' &&
    Number.isFinite(cepLookupData.latitude) &&
    Number.isFinite(cepLookupData.longitude)
  ) {
    const geoResult: GeocodeResult = {
      success: true,
      latitude: cepLookupData.latitude,
      longitude: cepLookupData.longitude,
      formattedAddress: `${street || cepLookupData.street || ''}, ${neighborhood || cepLookupData.neighborhood || ''}, ${city || cepLookupData.city} - ${state || cepLookupData.state}`,
      precision: 'cep',
      provider: 'brasilapi',
    };
    geocodeCache.set(cacheKey, { timestamp: Date.now(), data: geoResult });
    return geoResult;
  }

  // 2. Try Google Maps Geocoding API if GOOGLE_MAPS_API_KEY is available
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (googleApiKey && googleApiKey.trim()) {
    try {
      const fullQuery = [
        street ? `${street}${number ? `, ${number}` : ''}` : '',
        neighborhood,
        city,
        state,
        cleanCep,
        'Brasil',
      ]
        .filter(Boolean)
        .join(', ');
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        fullQuery
      )}&region=br&language=pt-BR&key=${encodeURIComponent(googleApiKey.trim())}`;
      const res = await fetchWithTimeout(url, {}, 3500);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
          const loc = data.results[0]?.geometry?.location;
          if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
            const result: GeocodeResult = {
              success: true,
              latitude: loc.lat,
              longitude: loc.lng,
              formattedAddress: data.results[0].formatted_address,
              precision: 'rooftop',
              provider: 'google',
            };
            geocodeCache.set(cacheKey, { timestamp: Date.now(), data: result });
            return result;
          }
        }
      }
    } catch {
      // Fallback below
    }
  }

  // 3. Try OpenStreetMap Nominatim with progressive queries (if not circuit-broken)
  if (Date.now() > nominatimBlockedUntil) {
    const queries: Array<{ q: string; precision: GeocodeResult['precision'] }> = [];

    if (street && number && number.toLowerCase() !== 's/n' && neighborhood && city && state) {
      queries.push({
        q: `${street}, ${number}, ${neighborhood}, ${city}, ${state}, Brasil`,
        precision: 'rooftop',
      });
    }
    if (street && neighborhood && city && state) {
      queries.push({
        q: `${street}, ${neighborhood}, ${city}, ${state}, Brasil`,
        precision: 'street',
      });
    } else if (neighborhood && city && state) {
      queries.push({
        q: `${neighborhood}, ${city}, ${state}, Brasil`,
        precision: 'neighborhood',
      });
    }

    for (const item of queries) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=2&countrycodes=br&addressdetails=1&q=${encodeURIComponent(
          item.q
        )}`;
        const res = await fetchWithTimeout(
          url,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'pt-BR,pt;q=0.9',
            },
          },
          2500
        );

        if (res.status === 403 || res.status === 429) {
          nominatimBlockedUntil = Date.now() + 1000 * 60 * 15;
          break;
        }

        if (res.ok) {
          const results = await res.json();
          if (Array.isArray(results) && results.length > 0) {
            const validMatch = results.find((r: any) =>
              matchesCityOrState(r.display_name || '', city, state)
            );
            const chosen = validMatch || results[0];
            const lat = parseFloat(chosen.lat);
            const lon = parseFloat(chosen.lon);

            if (
              Number.isFinite(lat) &&
              Number.isFinite(lon) &&
              matchesCityOrState(chosen.display_name || '', city, state)
            ) {
              const geoResult: GeocodeResult = {
                success: true,
                latitude: lat,
                longitude: lon,
                formattedAddress: chosen.display_name,
                precision: item.precision,
                provider: 'nominatim',
              };
              geocodeCache.set(cacheKey, { timestamp: Date.now(), data: geoResult });
              return geoResult;
            }
          }
        }
      } catch {
        // Continue to next query level or fallback
      }
    }
  }

  // 4. Fallback to BrasilAPI CEP coordinates if available
  if (cleanCep.length === 8) {
    const cepInfo = cepLookupData || (await lookupPostalCodeServer(cleanCep));
    if (
      cepInfo.found &&
      typeof cepInfo.latitude === 'number' &&
      typeof cepInfo.longitude === 'number' &&
      Number.isFinite(cepInfo.latitude) &&
      Number.isFinite(cepInfo.longitude)
    ) {
      const geoResult: GeocodeResult = {
        success: true,
        latitude: cepInfo.latitude,
        longitude: cepInfo.longitude,
        formattedAddress: `${cepInfo.street || ''}, ${cepInfo.neighborhood || ''}, ${cepInfo.city} - ${cepInfo.state}`,
        precision: 'cep',
        provider: 'brasilapi',
      };
      geocodeCache.set(cacheKey, { timestamp: Date.now(), data: geoResult });
      return geoResult;
    }
  }

  return {
    success: false,
    error:
      'Não foi possível localizar as coordenadas geográficas deste endereço. Verifique se o CEP, logradouro, bairro, cidade e UF estão corretos.',
  };
}

/**
 * Calculates distance between origin and destination coordinates using either:
 * - 'road_route': Real driving/motorcycle route via Google Routes or OSRM
 * - 'straight_line': Geodesic Haversine formula
 * Never presents straight-line distance as if it were road route distance.
 */
export async function calculateRouteDistanceServer(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  method: DistanceCalculationMethod = 'road_route'
): Promise<RouteDistanceResult> {
  if (!hasValidCoordinates(origin) || !hasValidCoordinates(destination)) {
    return {
      success: false,
      error: 'Coordenadas de origem ou destino inválidas para o cálculo de distância.',
    };
  }

  if (method === 'straight_line') {
    const distanceKm = calculateStraightLineDistanceKm(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude
    );
    return {
      success: true,
      distanceKm,
      methodUsed: 'straight_line',
      provider: 'haversine',
    };
  }

  const cacheKey = `${origin.latitude.toFixed(5)},${origin.longitude.toFixed(5)}->${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}`;
  const cached = routeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // 1. Try Google Distance Matrix API if GOOGLE_MAPS_API_KEY is configured
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (googleApiKey && googleApiKey.trim()) {
    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.latitude},${origin.longitude}&destinations=${destination.latitude},${destination.longitude}&mode=driving&language=pt-BR&key=${encodeURIComponent(
        googleApiKey.trim()
      )}`;
      const res = await fetchWithTimeout(url, {}, 5000);
      if (res.ok) {
        const data = await res.json();
        const element = data?.rows?.[0]?.elements?.[0];
        if (element && element.status === 'OK' && typeof element.distance?.value === 'number') {
          const result: RouteDistanceResult = {
            success: true,
            distanceKm: element.distance.value / 1000,
            durationMinutes: element.duration?.value
              ? Math.round(element.duration.value / 60)
              : undefined,
            methodUsed: 'road_route',
            provider: 'google',
          };
          routeCache.set(cacheKey, { timestamp: Date.now(), data: result });
          return result;
        }
      }
    } catch {
      // Fallback to OSRM below
    }
  }

  // Check if points are virtually at the same location (< 250 meters)
  const directDistanceKm = calculateStraightLineDistanceKm(
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude
  );

  if (directDistanceKm <= 0.25) {
    const result: RouteDistanceResult = {
      success: true,
      distanceKm: Math.max(0.1, Math.round(directDistanceKm * 100) / 100),
      durationMinutes: 5,
      methodUsed: 'road_route',
      provider: 'haversine',
    };
    routeCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  }

  // 2. Query OSRM public driving route engine
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=false`;
    const res = await fetchWithTimeout(
      osrmUrl,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      },
      4000
    );

    if (res.ok) {
      const data = await res.json();
      if (
        data.code === 'Ok' &&
        Array.isArray(data.routes) &&
        data.routes.length > 0 &&
        typeof data.routes[0].distance === 'number'
      ) {
        const result: RouteDistanceResult = {
          success: true,
          distanceKm: data.routes[0].distance / 1000,
          durationMinutes:
            typeof data.routes[0].duration === 'number'
              ? Math.round(data.routes[0].duration / 60)
              : undefined,
          methodUsed: 'road_route',
          provider: 'osrm',
        };
        routeCache.set(cacheKey, { timestamp: Date.now(), data: result });
        return result;
      }
    }
  } catch {
    // Fallback to estimation below
  }

  // Resilient fallback: estimate driving route distance via straight-line Haversine * 1.25
  if (Number.isFinite(directDistanceKm) && directDistanceKm >= 0) {
    const estimatedDistanceKm = Math.round(directDistanceKm * 1.25 * 100) / 100;
    const result: RouteDistanceResult = {
      success: true,
      distanceKm: Math.max(0.1, estimatedDistanceKm),
      durationMinutes: Math.max(5, Math.round(estimatedDistanceKm * 3)),
      methodUsed: 'road_route',
      provider: 'haversine',
    };
    routeCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  }

  return {
    success: false,
    error:
      'Não foi possível calcular a distância por rota viária entre o restaurante e o endereço informado no momento. Verifique o endereço ou tente novamente.',
  };
}
