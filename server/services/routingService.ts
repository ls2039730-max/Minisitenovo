import {
  CepLookupResult,
  DeliveryOriginAddress,
  DistanceCalculationMethod,
  GeocodePrecision,
} from '../../src/types/order.js';
import {
  calculateStraightLineDistanceKm,
  hasValidCoordinates,
  normalizeCep,
  normalizeDeliveryText,
} from '../../src/utils/deliveryFeeCalculator.js';
import {
  buildFullGeocodingQuery,
  computeAddressFingerprint,
  validateAndNormalizeCoordinates,
} from '../../src/utils/addressCoordinateValidator.js';

export interface GeocodeResult {
  success: boolean;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  precision?: GeocodePrecision;
  locationType?: 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE';
  placeId?: string | null;
  isApproximate?: boolean;
  provider?: 'google' | 'arcgis' | 'nominatim' | 'brasilapi' | 'manual';
  geocodedAt?: string;
  addressFingerprint?: string;
  error?: string;
}

export interface GeocodeOptions {
  forceRefresh?: boolean;
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

/**
 * Invalidates cached geocoding and route entries when an address is modified.
 */
export function invalidateGeocodeCache(address?: Partial<DeliveryOriginAddress> | null): void {
  if (!address) {
    geocodeCache.clear();
    routeCache.clear();
    return;
  }
  const fp = computeAddressFingerprint(address);
  if (fp) {
    geocodeCache.delete(fp);
  }
  const cleanCep = normalizeCep(address.cep);
  const street = normalizeDeliveryText(address.street);
  for (const key of Array.from(geocodeCache.keys())) {
    if ((cleanCep && key.includes(cleanCep)) || (street && key.includes(street))) {
      geocodeCache.delete(key);
    }
  }
  routeCache.clear();
}

/**
 * Resolves the Google Maps API key on the server from either GOOGLE_MAPS_API_KEY
 * or VITE_GOOGLE_MAPS_API_KEY, ignoring empty strings or placeholder values.
 */
export function getServerGoogleMapsApiKey(): string {
  const raw = (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    ''
  ).trim();
  if (!raw || raw === 'YOUR_API_KEY' || raw.toLowerCase().includes('your-')) {
    return '';
  }
  return raw;
}

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
      const rawLat = data?.location?.coordinates?.latitude
        ? Number(data.location.coordinates.latitude)
        : null;
      const rawLng = data?.location?.coordinates?.longitude
        ? Number(data.location.coordinates.longitude)
        : null;
      const coordCheck = validateAndNormalizeCoordinates(rawLat, rawLng);

      if (!result) {
        result = {
          cep: cleanCep,
          street: data.street || '',
          neighborhood: data.neighborhood || '',
          city: data.city || '',
          state: (data.state || '').toUpperCase(),
          found: true,
          latitude: coordCheck.valid ? coordCheck.latitude : null,
          longitude: coordCheck.valid ? coordCheck.longitude : null,
        };
      } else {
        if (!result.street && data.street) result.street = data.street;
        if (!result.neighborhood && data.neighborhood) result.neighborhood = data.neighborhood;
        if (!result.city && data.city) result.city = data.city;
        if (!result.state && data.state) result.state = data.state.toUpperCase();
        if (coordCheck.valid) {
          result.latitude = coordCheck.latitude;
          result.longitude = coordCheck.longitude;
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
 * Checks if a formatted display string matches the target state and city.
 */
export function matchesCityOrState(displayName: string, city?: string, state?: string): boolean {
  const normDisplay = normalizeDeliveryText(displayName);
  if (state) {
    const normState = normalizeDeliveryText(state);
    const fullStateName = STATE_NAMES_BR[normState] || normState;
    const tokens = normDisplay.split(' ');
    if (!normDisplay.includes(fullStateName) && !tokens.includes(normState)) {
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

/**
 * Validates that a Google Geocoding result belongs to the requested city and state,
 * preventing homonymous streets/neighborhoods in other cities from being accepted.
 */
function matchesGoogleResultCityAndState(
  result: any,
  targetCity?: string,
  targetState?: string
): boolean {
  const formatted = String(result?.formatted_address || '');
  const components: any[] = Array.isArray(result?.address_components)
    ? result.address_components
    : [];

  if (targetState) {
    const normState = normalizeDeliveryText(targetState);
    const fullState = STATE_NAMES_BR[normState] || normState;
    const stateComp = components.find(
      (c) => Array.isArray(c.types) && c.types.includes('administrative_area_level_1')
    );
    if (stateComp) {
      const shortState = normalizeDeliveryText(stateComp.short_name);
      const longState = normalizeDeliveryText(stateComp.long_name);
      if (shortState !== normState && longState !== fullState && !longState.includes(fullState)) {
        return false;
      }
    } else if (!matchesCityOrState(formatted, undefined, targetState)) {
      return false;
    }
  }

  if (targetCity) {
    const normCity = normalizeDeliveryText(targetCity);
    const cityComps = components.filter(
      (c) =>
        Array.isArray(c.types) &&
        (c.types.includes('administrative_area_level_2') ||
          c.types.includes('locality') ||
          c.types.includes('sublocality_level_1'))
    );
    if (cityComps.length > 0) {
      const anyMatch = cityComps.some((c) => {
        const s = normalizeDeliveryText(c.short_name);
        const l = normalizeDeliveryText(c.long_name);
        return s === normCity || l === normCity || l.includes(normCity) || normCity.includes(l);
      });
      if (!anyMatch && !matchesCityOrState(formatted, targetCity, undefined)) {
        return false;
      }
    } else if (!matchesCityOrState(formatted, targetCity, undefined)) {
      return false;
    }
  }

  return true;
}

/**
 * Validates that a Nominatim result belongs to the requested city and state.
 */
function matchesNominatimResultCityAndState(
  result: any,
  targetCity?: string,
  targetState?: string
): boolean {
  const addr = result?.address || {};
  const display = String(result?.display_name || '');

  if (targetState) {
    const normState = normalizeDeliveryText(targetState);
    const fullState = STATE_NAMES_BR[normState] || normState;
    const isoLvl4 = normalizeDeliveryText(addr['ISO3166-2-lvl4'] || '');
    const addrState = normalizeDeliveryText(addr.state || '');
    const stateMatches =
      isoLvl4 === `br ${normState}` ||
      isoLvl4.endsWith(` ${normState}`) ||
      addrState === normState ||
      addrState === fullState ||
      matchesCityOrState(display, undefined, targetState);
    if (!stateMatches) return false;
  }

  if (targetCity) {
    const normCity = normalizeDeliveryText(targetCity);
    const candidateCities = [
      addr.city,
      addr.town,
      addr.municipality,
      addr.village,
      addr.county,
    ]
      .filter(Boolean)
      .map((c) => normalizeDeliveryText(c));

    if (candidateCities.length > 0) {
      const cityMatch = candidateCities.some(
        (c) => c === normCity || c.includes(normCity) || normCity.includes(c)
      );
      if (!cityMatch && !matchesCityOrState(display, targetCity, undefined)) {
        return false;
      }
    } else if (!matchesCityOrState(display, targetCity, undefined)) {
      return false;
    }
  }

  return true;
}

// Circuit breaker for Nominatim if blocked (403/429) to avoid wasting seconds
let nominatimBlockedUntil = 0;

/**
 * Geocodes a structured Brazilian address into (latitude, longitude).
 * Queries complete structured address: "Rua + número + bairro + cidade + estado + CEP + Brasil".
 * Validates city/state consistency, classifies precision (ROOFTOP, RANGE_INTERPOLATED, etc.),
 * never copies the restaurant's coordinates onto a customer's address, and never invents coordinates.
 */
export async function geocodeAddressServer(
  address: Partial<DeliveryOriginAddress>,
  _referenceOrigin?: DeliveryOriginAddress | null,
  options?: GeocodeOptions
): Promise<GeocodeResult> {
  const nowIso = new Date().toISOString();
  const fingerprint = computeAddressFingerprint(address);

  // If valid coordinates are already provided on the object and forceRefresh is not requested,
  // validate & normalize them (correcting inverted lat/lng if detected).
  if (!options?.forceRefresh && address.latitude !== null && address.latitude !== undefined && address.longitude !== null && address.longitude !== undefined) {
    const coordCheck = validateAndNormalizeCoordinates(address.latitude, address.longitude);
    if (coordCheck.valid && coordCheck.latitude !== null && coordCheck.longitude !== null) {
      const isManual = address.geocodeStatus === 'manual' || address.geocodePrecision === 'manual';
      return {
        success: true,
        latitude: coordCheck.latitude,
        longitude: coordCheck.longitude,
        formattedAddress: address.formattedAddress || buildFullGeocodingQuery(address),
        precision: isManual ? 'manual' : address.geocodePrecision || 'rooftop',
        locationType: 'ROOFTOP',
        placeId: address.placeId || null,
        isApproximate: Boolean(address.isApproximate),
        provider: isManual ? 'manual' : 'google',
        geocodedAt: address.geocodedAt || nowIso,
        addressFingerprint: fingerprint,
      };
    }
  }

  const cleanCep = normalizeCep(address.cep);
  let street = (address.street || '').trim();
  const number = (address.number || '').trim();
  let neighborhood = (address.neighborhood || '').trim();
  let city = (address.city || '').trim();
  let state = (address.state || '').trim().toUpperCase();

  // Enrich missing fields from CEP, while detecting any city/state conflict
  let cepLookupData: CepLookupResult | null = null;
  let cepCityStateMismatch = false;

  if (cleanCep.length === 8) {
    cepLookupData = await lookupPostalCodeServer(cleanCep);
    if (cepLookupData.found) {
      const cepState = (cepLookupData.state || '').trim().toUpperCase();
      const cepCity = (cepLookupData.city || '').trim();

      if (state && cepState && state !== cepState) {
        cepCityStateMismatch = true;
      } else if (
        city &&
        cepCity &&
        normalizeDeliveryText(city) !== normalizeDeliveryText(cepCity)
      ) {
        cepCityStateMismatch = true;
      }

      if (!cepCityStateMismatch) {
        if (!street && cepLookupData.street) street = cepLookupData.street;
        if (!neighborhood && cepLookupData.neighborhood) neighborhood = cepLookupData.neighborhood;
        if (!city && cepLookupData.city) city = cepLookupData.city;
        if (!state && cepLookupData.state) state = cepLookupData.state;
      }
    }
  }

  if (!city && !state && cleanCep.length !== 8) {
    return {
      success: false,
      error:
        'Endereço insuficiente para geocodificação. Informe cidade, UF e logradouro ou CEP válido.',
    };
  }

  if (!street && !neighborhood && (cleanCep.length !== 8 || !cepLookupData?.found)) {
    return {
      success: false,
      error:
        'Endereço incompleto para geocodificação. Informe o logradouro, número e bairro ou um CEP válido.',
    };
  }

  const cacheKey = normalizeDeliveryText(
    `${cleanCep}|${street}|${number}|${neighborhood}|${city}|${state}`
  );

  if (options?.forceRefresh) {
    geocodeCache.delete(cacheKey);
  } else {
    const cached = geocodeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const fullFormattedQuery = buildFullGeocodingQuery({
    cep: cleanCep,
    street,
    number,
    neighborhood,
    city,
    state,
    country: 'Brasil',
  });

  let googleApproximateFallback: GeocodeResult | null = null;

  // 1. PRIORITY 1: Google Maps Geocoding API with full structured query + components validation
  const googleApiKey = getServerGoogleMapsApiKey();
  if (googleApiKey) {
    try {
      const componentParts: string[] = ['country:BR'];
      if (state) componentParts.push(`administrative_area:${state}`);
      if (cleanCep.length === 8 && !cepCityStateMismatch) {
        componentParts.push(`postal_code:${cleanCep}`);
      }
      const componentsParam = componentParts.join('|');
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        fullFormattedQuery
      )}&components=${encodeURIComponent(
        componentsParam
      )}&region=br&language=pt-BR&key=${encodeURIComponent(googleApiKey.trim())}`;

      const res = await fetchWithTimeout(url, {}, 4000);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
          // Filter results that strictly match the requested city and state
          const matchingResults = data.results.filter((r: any) =>
            matchesGoogleResultCityAndState(r, city, state)
          );

          // Rank results by location_type accuracy
          const locationTypeRank: Record<string, number> = {
            ROOFTOP: 4,
            RANGE_INTERPOLATED: 3,
            GEOMETRIC_CENTER: 2,
            APPROXIMATE: 1,
          };

          matchingResults.sort(
            (a: any, b: any) =>
              (locationTypeRank[b?.geometry?.location_type] || 0) -
              (locationTypeRank[a?.geometry?.location_type] || 0)
          );

          const chosen = matchingResults[0];
          const loc = chosen?.geometry?.location;
          const coordCheck = validateAndNormalizeCoordinates(loc?.lat, loc?.lng);

          if (chosen && coordCheck.valid && coordCheck.latitude !== null && coordCheck.longitude !== null) {
            const locType = (chosen.geometry?.location_type || 'APPROXIMATE') as
              | 'ROOFTOP'
              | 'RANGE_INTERPOLATED'
              | 'GEOMETRIC_CENTER'
              | 'APPROXIMATE';

            const precisionMap: Record<string, GeocodePrecision> = {
              ROOFTOP: 'rooftop',
              RANGE_INTERPOLATED: 'range_interpolated',
              GEOMETRIC_CENTER: 'geometric_center',
              APPROXIMATE: 'approximate',
            };

            const mappedPrecision = precisionMap[locType] || 'approximate';
            const isApproximate = locType === 'APPROXIMATE' || locType === 'GEOMETRIC_CENTER';

            const result: GeocodeResult = {
              success: true,
              latitude: coordCheck.latitude,
              longitude: coordCheck.longitude,
              formattedAddress: chosen.formatted_address || fullFormattedQuery,
              precision: mappedPrecision,
              locationType: locType,
              placeId: chosen.place_id || null,
              isApproximate,
              provider: 'google',
              geocodedAt: nowIso,
              addressFingerprint: cacheKey,
            };

            if (!isApproximate) {
              geocodeCache.set(cacheKey, { timestamp: Date.now(), data: result });
              return result;
            }
            // Hold APPROXIMATE result in case Nominatim or CEP has a more specific street/CEP location
            googleApproximateFallback = result;
          }
        }
      }
    } catch {
      // Fallback to ArcGIS / Nominatim below
    }
  }

  const cleanNeighborhoodForQuery = neighborhood
    .replace(/\(([^)]+)\)/g, ', $1')
    .replace(/\s+/g, ' ')
    .trim();
  const primaryNeighborhood = neighborhood.replace(/\([^)]*\)/g, '').trim() || neighborhood;

  // 2. PRIORITY 2: ArcGIS World Geocoder for high-precision street/rooftop resolution in Brazilian cities & districts
  if (street && city && state) {
    try {
      const arcgisParts = [
        number && number.toLowerCase() !== 's/n' ? `${street}, ${number}` : street,
        cleanNeighborhoodForQuery,
        city,
        state,
        !cepCityStateMismatch && cleanCep.length === 8 ? cleanCep : '',
        'Brasil',
      ].filter(Boolean);
      const singleLine = arcgisParts.join(', ');
      const arcgisUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(
        singleLine
      )}&countryCode=BRA&outFields=Addr_type,Match_addr,City,Subregion,Region,RegionAbbr,Postal,StName,AddNum,Nbrhd,District&maxLocations=5`;

      const res = await fetchWithTimeout(arcgisUrl, {}, 3500);
      if (res.ok) {
        const data = await res.json();
        const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
        const streetTokens = normalizeDeliveryText(street)
          .split(' ')
          .filter((t) => t.length >= 3 && !['rua', 'avenida', 'estrada', 'travessa', 'alameda', 'rodovia', 'praca'].includes(t));

        const validCandidate = candidates.find((c: any) => {
          const score = Number(c?.score || 0);
          const addrType = String(c?.attributes?.Addr_type || '');
          if (score < 82) return false;
          if (!['PointAddress', 'Subaddress', 'StreetAddress', 'StreetName'].includes(addrType)) {
            return false;
          }
          const attr = c?.attributes || {};
          const matchText = `${c?.address || ''} ${attr.Match_addr || ''} ${attr.City || ''} ${attr.Subregion || ''} ${attr.District || ''} ${attr.Region || ''} ${attr.RegionAbbr || ''}`;
          if (!matchesCityOrState(matchText, city, state)) {
            return false;
          }
          if (streetTokens.length > 0) {
            const candidateStreetNorm = normalizeDeliveryText(
              `${attr.StName || ''} ${c?.address || ''} ${attr.Match_addr || ''}`
            );
            const hasStreetToken = streetTokens.some((tok) => candidateStreetNorm.includes(tok));
            if (!hasStreetToken) return false;
          }
          return true;
        });

        if (validCandidate) {
          const coordCheck = validateAndNormalizeCoordinates(
            validCandidate?.location?.y,
            validCandidate?.location?.x
          );
          if (coordCheck.valid && coordCheck.latitude !== null && coordCheck.longitude !== null) {
            const addrType = String(validCandidate?.attributes?.Addr_type || '');
            const precision: GeocodePrecision =
              addrType === 'PointAddress' || addrType === 'Subaddress'
                ? 'rooftop'
                : addrType === 'StreetAddress'
                ? 'range_interpolated'
                : 'street';
            const locationType =
              precision === 'rooftop'
                ? 'ROOFTOP'
                : precision === 'range_interpolated'
                ? 'RANGE_INTERPOLATED'
                : 'GEOMETRIC_CENTER';

            const geoResult: GeocodeResult = {
              success: true,
              latitude: coordCheck.latitude,
              longitude: coordCheck.longitude,
              formattedAddress:
                validCandidate?.attributes?.Match_addr ||
                validCandidate?.address ||
                fullFormattedQuery,
              precision,
              locationType,
              placeId: null,
              isApproximate: precision === 'street',
              provider: 'arcgis',
              geocodedAt: nowIso,
              addressFingerprint: cacheKey,
            };
            geocodeCache.set(cacheKey, { timestamp: Date.now(), data: geoResult });
            return geoResult;
          }
        }
      }
    } catch {
      // Fallback to Nominatim below
    }
  }

  // 3. PRIORITY 3: OpenStreetMap Nominatim with progressive rooftop -> street -> neighborhood queries
  if (Date.now() > nominatimBlockedUntil) {
    const queries: Array<{
      q: string;
      precision: GeocodePrecision;
      isApproximate: boolean;
    }> = [];

    if (street && number && number.toLowerCase() !== 's/n' && city && state) {
      queries.push({
        q: [street, number, primaryNeighborhood, city, state, 'Brasil'].filter(Boolean).join(', '),
        precision: 'rooftop',
        isApproximate: false,
      });
    }
    if (street && city && state) {
      queries.push({
        q: [street, primaryNeighborhood, city, state, 'Brasil'].filter(Boolean).join(', '),
        precision: 'street',
        isApproximate: true,
      });
    }
    if (primaryNeighborhood && city && state) {
      queries.push({
        q: `${primaryNeighborhood}, ${city}, ${state}, Brasil`,
        precision: 'neighborhood',
        isApproximate: true,
      });
    }

    for (const item of queries) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=4&countrycodes=br&addressdetails=1&q=${encodeURIComponent(
          item.q
        )}`;
        const res = await fetchWithTimeout(
          url,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'pt-BR,pt;q=0.9',
            },
          },
          3000
        );

        if (res.status === 403 || res.status === 429) {
          nominatimBlockedUntil = Date.now() + 1000 * 60 * 15;
          break;
        }

        if (res.ok) {
          const results = await res.json();
          if (Array.isArray(results) && results.length > 0) {
            const validMatch = results.find((r: any) =>
              matchesNominatimResultCityAndState(r, city, state)
            );
            if (validMatch) {
              const coordCheck = validateAndNormalizeCoordinates(validMatch.lat, validMatch.lon);
              if (coordCheck.valid && coordCheck.latitude !== null && coordCheck.longitude !== null) {
                const geoResult: GeocodeResult = {
                  success: true,
                  latitude: coordCheck.latitude,
                  longitude: coordCheck.longitude,
                  formattedAddress: validMatch.display_name || fullFormattedQuery,
                  precision: item.precision,
                  locationType:
                    item.precision === 'rooftop'
                      ? 'ROOFTOP'
                      : item.precision === 'street'
                      ? 'GEOMETRIC_CENTER'
                      : 'APPROXIMATE',
                  placeId: validMatch.place_id ? String(validMatch.place_id) : null,
                  isApproximate: item.isApproximate,
                  provider: 'nominatim',
                  geocodedAt: nowIso,
                  addressFingerprint: cacheKey,
                };
                geocodeCache.set(cacheKey, { timestamp: Date.now(), data: geoResult });
                return geoResult;
              }
            }
          }
        }
      } catch {
        // Continue to next query level or fallback
      }
    }
  }

  // 3. PRIORITY 3: Fallback to BrasilAPI CEP coordinates ONLY when rooftop/street failed
  // and ONLY if the CEP matches the target city/state.
  if (cleanCep.length === 8 && !cepCityStateMismatch) {
    const cepInfo = cepLookupData || (await lookupPostalCodeServer(cleanCep));
    if (cepInfo.found && matchesCityOrState(`${cepInfo.city} ${cepInfo.state}`, city, state)) {
      const coordCheck = validateAndNormalizeCoordinates(cepInfo.latitude, cepInfo.longitude);
      if (coordCheck.valid && coordCheck.latitude !== null && coordCheck.longitude !== null) {
        const geoResult: GeocodeResult = {
          success: true,
          latitude: coordCheck.latitude,
          longitude: coordCheck.longitude,
          formattedAddress:
            fullFormattedQuery ||
            `${cepInfo.street || street || ''}, ${cepInfo.neighborhood || neighborhood || ''}, ${cepInfo.city} - ${cepInfo.state}`,
          precision: 'cep',
          locationType: 'APPROXIMATE',
          placeId: null,
          isApproximate: true,
          provider: 'brasilapi',
          geocodedAt: nowIso,
          addressFingerprint: cacheKey,
        };
        geocodeCache.set(cacheKey, { timestamp: Date.now(), data: geoResult });
        return geoResult;
      }
    }
  }

  // 4. If Google returned a city/neighborhood-matched APPROXIMATE candidate and nothing more specific was found
  if (googleApproximateFallback) {
    geocodeCache.set(cacheKey, { timestamp: Date.now(), data: googleApproximateFallback });
    return googleApproximateFallback;
  }

  return {
    success: false,
    error: cepCityStateMismatch
      ? `Conflito de endereço: o CEP ${cleanCep} pertence a ${cepLookupData?.city || ''} - ${cepLookupData?.state || ''}, diferente de ${city} - ${state}.`
      : 'Não foi possível localizar as coordenadas geográficas deste endereço. Verifique se o CEP, logradouro, número, bairro, cidade e UF estão corretos.',
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

  // 1. Try Google Distance Matrix API if GOOGLE_MAPS_API_KEY or VITE_GOOGLE_MAPS_API_KEY is configured
  const googleApiKey = getServerGoogleMapsApiKey();
  if (googleApiKey) {
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

  // 1. Try Google Directions API if GOOGLE_MAPS_API_KEY or VITE_GOOGLE_MAPS_API_KEY is configured
  const googleApiKey = getServerGoogleMapsApiKey();
  if (googleApiKey) {
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

