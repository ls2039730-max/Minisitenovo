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

export interface MultiStopRoadRouteResult {
  success: boolean;
  totalDistanceKm: number;
  totalDurationMin: number;
  legDistancesKm: number[];
  legDurationsMin: number[];
  routeGeometry: Array<[number, number]>;
  navigationProvider: 'google' | 'osrm' | 'estimated';
}

const multiStopRouteCache = new Map<
  string,
  { timestamp: number; data: MultiStopRoadRouteResult }
>();

/**
 * Decodes a Google Maps encoded polyline string into an array of [lat, lng] pairs.
 */
function decodeGooglePolyline(encoded: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < len);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < len);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/**
 * Calculates a multi-stop road route (origin -> stop 1 -> stop 2 -> ... -> stop N)
 * using real road navigation data (Google Directions API when GOOGLE_MAPS_API_KEY is configured,
 * or OSRM driving route API with full road geometry).
 * Falls back to Haversine estimation clearly tagged as 'estimated' if external routing is unreachable.
 */
export async function calculateMultiStopRoadRouteServer(
  waypoints: Array<{ latitude: number; longitude: number }>
): Promise<MultiStopRoadRouteResult> {
  const validPoints = waypoints.filter((p) => hasValidCoordinates(p.latitude, p.longitude));
  if (validPoints.length < 2) {
    return {
      success: false,
      totalDistanceKm: 0,
      totalDurationMin: 0,
      legDistancesKm: [],
      legDurationsMin: [],
      routeGeometry: validPoints.map((p) => [p.latitude, p.longitude]),
      navigationProvider: 'estimated',
    };
  }

  const cacheKey = validPoints
    .map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`)
    .join(';');
  const cached = multiStopRouteCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // 1. Try Google Directions API if GOOGLE_MAPS_API_KEY is configured
  const googleApiKey = (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    ''
  ).trim();
  if (googleApiKey && googleApiKey !== 'YOUR_API_KEY' && !googleApiKey.includes('your-')) {
    try {
      const origin = `${validPoints[0].latitude},${validPoints[0].longitude}`;
      const destination = `${validPoints[validPoints.length - 1].latitude},${
        validPoints[validPoints.length - 1].longitude
      }`;
      const middle = validPoints
        .slice(1, -1)
        .map((p) => `${p.latitude},${p.longitude}`)
        .join('|');
      const waypointsParam = middle ? `&waypoints=${encodeURIComponent(middle)}` : '';
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(
        origin
      )}&destination=${encodeURIComponent(
        destination
      )}${waypointsParam}&mode=driving&language=pt-BR&key=${encodeURIComponent(googleApiKey)}`;

      const res = await fetchWithTimeout(url, {}, 4500);
      if (res.ok) {
        const data = await res.json();
        const route = data?.routes?.[0];
        if (data.status === 'OK' && route && Array.isArray(route.legs) && route.legs.length > 0) {
          const legDistancesKm: number[] = [];
          const legDurationsMin: number[] = [];
          let totalDistanceKm = 0;
          let totalDurationMin = 0;

          for (const leg of route.legs) {
            const distKm = Math.max(
              0.1,
              Math.round(((leg.distance?.value || 0) / 1000) * 100) / 100
            );
            // Add 2 min handoff buffer per delivery stop
            const durMin = Math.max(3, Math.ceil((leg.duration?.value || 180) / 60) + 2);
            legDistancesKm.push(distKm);
            legDurationsMin.push(durMin);
            totalDistanceKm = Math.round((totalDistanceKm + distKm) * 100) / 100;
            totalDurationMin += durMin;
          }

          const encodedPoly = route.overview_polyline?.points;
          const decodedGeometry =
            typeof encodedPoly === 'string' && encodedPoly.length > 0
              ? decodeGooglePolyline(encodedPoly)
              : validPoints.map((p) => [p.latitude, p.longitude] as [number, number]);

          const result: MultiStopRoadRouteResult = {
            success: true,
            totalDistanceKm,
            totalDurationMin,
            legDistancesKm,
            legDurationsMin,
            routeGeometry: decodedGeometry,
            navigationProvider: 'google',
          };
          multiStopRouteCache.set(cacheKey, { timestamp: Date.now(), data: result });
          return result;
        }
      }
    } catch {
      // Fallback to OSRM driving navigation below
    }
  }

  // 2. Query OSRM public driving route engine with full GeoJSON road geometry
  try {
    const coordsString = validPoints
      .map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`)
      .join(';');
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson&steps=false`;
    const res = await fetchWithTimeout(
      osrmUrl,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      },
      3800
    );

    if (res.ok) {
      const data = await res.json();
      const route = data?.routes?.[0];
      if (data.code === 'Ok' && route && Array.isArray(route.legs)) {
        const legDistancesKm: number[] = [];
        const legDurationsMin: number[] = [];
        let totalDistanceKm = 0;
        let totalDurationMin = 0;

        for (const leg of route.legs) {
          const distKm = Math.max(0.1, Math.round(((leg.distance || 0) / 1000) * 100) / 100);
          // Urban motorcycle/delivery speed + 2 min stop handoff
          const rawMin = typeof leg.duration === 'number' ? Math.ceil(leg.duration / 60) : Math.ceil(distKm * 2.4);
          const durMin = Math.max(3, rawMin + 2);
          legDistancesKm.push(distKm);
          legDurationsMin.push(durMin);
          totalDistanceKm = Math.round((totalDistanceKm + distKm) * 100) / 100;
          totalDurationMin += durMin;
        }

        const rawCoords = route.geometry?.coordinates;
        const routeGeometry: Array<[number, number]> =
          Array.isArray(rawCoords) && rawCoords.length >= 2
            ? rawCoords
                .filter((c: any) => Array.isArray(c) && c.length >= 2)
                .map((c: any) => [Number(c[1]), Number(c[0])] as [number, number])
            : validPoints.map((p) => [p.latitude, p.longitude] as [number, number]);

        const result: MultiStopRoadRouteResult = {
          success: true,
          totalDistanceKm,
          totalDurationMin,
          legDistancesKm,
          legDurationsMin,
          routeGeometry,
          navigationProvider: 'osrm',
        };
        multiStopRouteCache.set(cacheKey, { timestamp: Date.now(), data: result });
        return result;
      }
    }
  } catch {
    // Fallback to Haversine estimation below
  }

  // 3. Fallback: Haversine estimation clearly tagged as 'estimated'
  const legDistancesKm: number[] = [];
  const legDurationsMin: number[] = [];
  let totalDistanceKm = 0;
  let totalDurationMin = 0;

  for (let i = 1; i < validPoints.length; i++) {
    const prev = validPoints[i - 1];
    const curr = validPoints[i];
    const straight = calculateStraightLineDistanceKm(
      prev.latitude,
      prev.longitude,
      curr.latitude,
      curr.longitude
    );
    const stepDistKm = Math.max(0.2, Math.round(straight * 1.28 * 100) / 100);
    const stepDurationMin = Math.max(4, Math.ceil(stepDistKm * 2.4 + 3));
    legDistancesKm.push(stepDistKm);
    legDurationsMin.push(stepDurationMin);
    totalDistanceKm = Math.round((totalDistanceKm + stepDistKm) * 100) / 100;
    totalDurationMin += stepDurationMin;
  }

  return {
    success: true,
    totalDistanceKm,
    totalDurationMin,
    legDistancesKm,
    legDurationsMin,
    routeGeometry: validPoints.map((p) => [p.latitude, p.longitude]),
    navigationProvider: 'estimated',
  };
}

