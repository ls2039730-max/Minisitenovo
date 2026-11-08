import {
  DeliveryOriginAddress,
  GeocodePrecision,
  GeocodeStatus,
  OrderDeliveryAddress,
} from '../types/order.js';
import { formatCep, normalizeCep, normalizeDeliveryText } from './deliveryFeeCalculator.js';

export interface CoordinateValidationResult {
  valid: boolean;
  latitude: number | null;
  longitude: number | null;
  wasInverted: boolean;
  withinBrazilBounds: boolean;
  reason?: string;
}

// Bounding box for Brazilian territory (including oceanic islands)
const BRAZIL_LAT_MIN = -34.0;
const BRAZIL_LAT_MAX = 5.5;
const BRAZIL_LNG_MIN = -74.5;
const BRAZIL_LNG_MAX = -28.0;

/**
 * Validates latitude and longitude, automatically detecting zeroed (0,0),
 * out-of-range, or inverted (lng, lat) coordinates in Brazil.
 */
export function validateAndNormalizeCoordinates(
  rawLat?: number | string | null,
  rawLng?: number | string | null
): CoordinateValidationResult {
  if (rawLat === null || rawLat === undefined || rawLng === null || rawLng === undefined) {
    return {
      valid: false,
      latitude: null,
      longitude: null,
      wasInverted: false,
      withinBrazilBounds: false,
      reason: 'Coordenadas ausentes.',
    };
  }

  const numLat = typeof rawLat === 'string' ? Number(rawLat.replace(',', '.').trim()) : Number(rawLat);
  const numLng = typeof rawLng === 'string' ? Number(rawLng.replace(',', '.').trim()) : Number(rawLng);

  if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
    return {
      valid: false,
      latitude: null,
      longitude: null,
      wasInverted: false,
      withinBrazilBounds: false,
      reason: 'Coordenadas não numéricas.',
    };
  }

  if (Math.abs(numLat) < 1e-6 && Math.abs(numLng) < 1e-6) {
    return {
      valid: false,
      latitude: null,
      longitude: null,
      wasInverted: false,
      withinBrazilBounds: false,
      reason: 'Coordenadas zeradas (0, 0).',
    };
  }

  // Check if coordinates are inverted (e.g., latitude = -46.63, longitude = -23.55 in Brazil)
  const normalInBrazil =
    numLat >= BRAZIL_LAT_MIN &&
    numLat <= BRAZIL_LAT_MAX &&
    numLng >= BRAZIL_LNG_MIN &&
    numLng <= BRAZIL_LNG_MAX;

  const invertedInBrazil =
    !normalInBrazil &&
    numLng >= BRAZIL_LAT_MIN &&
    numLng <= BRAZIL_LAT_MAX &&
    numLat >= BRAZIL_LNG_MIN &&
    numLat <= BRAZIL_LNG_MAX &&
    numLat < -34.0; // Latitudes in Brazil are never < -34.0, whereas longitudes in Brazil are between -34.8 and -74.0

  if (invertedInBrazil) {
    return {
      valid: true,
      latitude: numLng,
      longitude: numLat,
      wasInverted: true,
      withinBrazilBounds: true,
    };
  }

  if (numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
    return {
      valid: false,
      latitude: null,
      longitude: null,
      wasInverted: false,
      withinBrazilBounds: false,
      reason: 'Coordenadas fora dos limites globais (-90..90, -180..180).',
    };
  }

  return {
    valid: true,
    latitude: numLat,
    longitude: numLng,
    wasInverted: false,
    withinBrazilBounds: normalInBrazil,
  };
}

/**
 * Computes a deterministic fingerprint for an address based on its core location fields.
 * Used to detect when an address was edited so stale coordinates are invalidated.
 */
export function computeAddressFingerprint(
  addr?: Partial<DeliveryOriginAddress | OrderDeliveryAddress> | null
): string {
  if (!addr) return '';
  const cep = normalizeCep(addr.cep);
  const street = normalizeDeliveryText(addr.street);
  const number = normalizeDeliveryText(addr.number || 's/n');
  const neighborhood = normalizeDeliveryText(addr.neighborhood);
  const city = normalizeDeliveryText(addr.city);
  const state = normalizeDeliveryText(addr.state);
  if (!street && !city && !cep) return '';
  return `${cep}|${street}|${number}|${neighborhood}|${city}|${state}`;
}

/**
 * Returns true if the core address fields (CEP, street, number, neighborhood, city, state)
 * differ between two address objects.
 */
export function didAddressTextChange(
  prev?: Partial<DeliveryOriginAddress | OrderDeliveryAddress> | null,
  next?: Partial<DeliveryOriginAddress | OrderDeliveryAddress> | null
): boolean {
  const fpPrev = computeAddressFingerprint(prev);
  const fpNext = computeAddressFingerprint(next);
  if (!fpPrev && !fpNext) return false;
  return fpPrev !== fpNext;
}

/**
 * Builds the complete structured query string for geocoding:
 * "Rua + número + bairro + cidade + estado + CEP + Brasil"
 */
export function buildFullGeocodingQuery(
  addr: Partial<DeliveryOriginAddress | OrderDeliveryAddress>
): string {
  const street = (addr.street || '').trim();
  const number = (addr.number || '').trim();
  const neighborhood = (addr.neighborhood || '').trim();
  const city = (addr.city || '').trim();
  const state = (addr.state || '').trim().toUpperCase();
  const cep = formatCep(addr.cep);
  const country = (addr.country || 'Brasil').trim();

  const streetWithNumber = street
    ? number && number.toLowerCase() !== 's/n'
      ? `${street}, ${number}`
      : street
    : '';

  const cityWithState = [city, state].filter(Boolean).join(' - ');

  return [streetWithNumber, neighborhood, cityWithState, cep, country]
    .filter(Boolean)
    .join(', ');
}

export function getPrecisionRank(precision?: GeocodePrecision | string | null): number {
  switch (precision) {
    case 'manual':
      return 6;
    case 'rooftop':
      return 5;
    case 'range_interpolated':
      return 4;
    case 'street':
      return 3;
    case 'geometric_center':
    case 'neighborhood':
      return 2;
    case 'cep':
    case 'approximate':
      return 1;
    case 'city':
    default:
      return 0;
  }
}

export function isExactGeocodePrecision(
  precision?: GeocodePrecision | string | null,
  status?: GeocodeStatus | string | null,
  isApproximate?: boolean
): boolean {
  if (status === 'manual' || precision === 'manual') {
    return true;
  }
  if (isApproximate) {
    return false;
  }
  return precision === 'rooftop' || precision === 'range_interpolated';
}

export function getGeocodePrecisionLabel(
  precision?: GeocodePrecision | string | null,
  status?: GeocodeStatus | string | null
): string {
  if (status === 'manual' || precision === 'manual') {
    return 'Ajustado manualmente (Exato)';
  }
  switch (precision) {
    case 'rooftop':
      return 'Número exato (Rooftop)';
    case 'range_interpolated':
      return 'Trecho da via (Interpolado)';
    case 'street':
      return 'Apenas nome da rua (Aproximado)';
    case 'geometric_center':
      return 'Centro geométrico da via (Aproximado)';
    case 'neighborhood':
      return 'Centro do bairro (Aproximado)';
    case 'cep':
      return 'Centro do CEP (Aproximado)';
    case 'approximate':
    case 'city':
      return 'Região aproximada';
    default:
      return status === 'geocoded' ? 'Geocodificado' : 'Pendente';
  }
}
