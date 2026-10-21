import {
  DeliveryKmConfig,
  DeliveryOriginAddress,
  DeliveryPricingMode,
  DeliveryQuoteResponse,
  DeliveryRule,
  DeliverySettings,
  DistanceCalculationMethod,
  FulfillmentType,
} from '../types/order.js';
import { toSafePrice } from './currency.js';

function safeParsePrice(val: unknown): number {
  return toSafePrice(val, 0);
}

function roundCurrency(val: number): number {
  return Math.round((Number.isFinite(val) ? val : 0) * 100) / 100;
}

export interface DeliveryCalculationResult {
  fee: number;
  ruleApplied: DeliveryRule | null;
  isCovered: boolean;
  reason?: string;
  quote?: DeliveryQuoteResponse;
}

export const DEFAULT_KM_CONFIG: DeliveryKmConfig = {
  baseFee: 5,
  pricePerKm: 2,
  minDistanceKm: 1,
  maxDistanceKm: 15,
  distanceMethod: 'road_route',
  roundDistanceUp: false,
  minDeliveryFee: null,
  freeDeliveryAbove: null,
};

/**
 * Normalizes text for neighborhood, city, and state comparisons:
 * - Removes accents/diacritics
 * - Converts to lowercase
 * - Collapses extra whitespace and trims
 */
export function normalizeDeliveryText(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-–—_/.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCep(cep?: string | null): string {
  if (!cep) return '';
  return String(cep).replace(/\D/g, '').slice(0, 8);
}

export function formatCep(cep?: string | null): string {
  const clean = normalizeCep(cep);
  if (clean.length === 8) {
    return `${clean.slice(0, 5)}-${clean.slice(5)}`;
  }
  return clean;
}

/**
 * Calculates straight-line (Haversine) distance between two coordinates in kilometers.
 */
export function calculateStraightLineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth's mean radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Applies configured rounding rule to a distance in km:
 * - roundDistanceUp = true: rounds up in increments of 0.1 km (e.g. 3.21 -> 3.3 km)
 * - roundDistanceUp = false: rounds to 2 decimal places (e.g. 3.214 -> 3.21 km)
 */
export function applyDistanceRounding(distanceKm: number, roundDistanceUp: boolean): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  if (roundDistanceUp) {
    return Math.ceil((distanceKm - 1e-9) * 10) / 10;
  }
  return Math.round(distanceKm * 100) / 100;
}

/**
 * Formats an origin or destination address object into a readable single-line summary.
 */
export function formatAddressSummary(addr?: Partial<DeliveryOriginAddress> | null): string {
  if (!addr) return '';
  const parts: string[] = [];
  const streetPart = [addr.street?.trim(), addr.number?.trim()].filter(Boolean).join(', ');
  if (streetPart) parts.push(streetPart);
  if (addr.complement?.trim()) parts.push(addr.complement.trim());
  if (addr.neighborhood?.trim()) parts.push(addr.neighborhood.trim());
  const cityState = [addr.city?.trim(), addr.state?.trim()].filter(Boolean).join(' - ');
  if (cityState) parts.push(cityState);
  const cep = formatCep(addr.cep);
  if (cep) parts.push(`CEP ${cep}`);
  return parts.join(', ');
}

/**
 * Parses a single-line address from site_sections (e.g. "Avenida independência, 103, Unamar, Cabo Frio - RJ, CEP 28928506")
 * into a structured DeliveryOriginAddress.
 */
export function parseFormattedAddressString(rawAddress?: string | null): DeliveryOriginAddress | null {
  if (!rawAddress || typeof rawAddress !== 'string' || !rawAddress.trim()) {
    return null;
  }

  let text = rawAddress.trim();
  let cep = '';
  const cepMatch = text.match(/(?:cep\s*:?\s*)?(\d{5})-?(\d{3})/i);
  if (cepMatch) {
    cep = `${cepMatch[1]}${cepMatch[2]}`;
    text = text.replace(cepMatch[0], '').replace(/,\s*$/, '').trim();
  }

  let state = '';
  let city = '';
  // Look for "Cidade - UF" or "Cidade/UF"
  const cityStateMatch = text.match(/([^,-]+?)\s*[-/]\s*([A-Za-z]{2})\s*$/);
  if (cityStateMatch) {
    city = cityStateMatch[1].trim();
    state = cityStateMatch[2].toUpperCase().trim();
    text = text.slice(0, cityStateMatch.index).replace(/,\s*$/, '').trim();
  }

  const segments = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let street = '';
  let number = '';
  let neighborhood = '';
  let complement = '';

  if (segments.length >= 3) {
    street = segments[0];
    number = segments[1];
    neighborhood = segments[segments.length - 1];
    if (segments.length > 3) {
      complement = segments.slice(2, segments.length - 1).join(', ');
    }
  } else if (segments.length === 2) {
    street = segments[0];
    if (/^\d+[A-Za-z0-9\s/-]*$/.test(segments[1]) || /^s\/?n$/i.test(segments[1])) {
      number = segments[1];
    } else {
      neighborhood = segments[1];
    }
  } else if (segments.length === 1) {
    street = segments[0];
  }

  if (!street && !city && !cep) {
    return null;
  }

  return {
    cep,
    street,
    number: number || 'S/N',
    complement: complement || null,
    neighborhood,
    city,
    state,
    latitude: null,
    longitude: null,
  };
}

export function isOriginAddressValid(origin?: DeliveryOriginAddress | null): boolean {
  if (!origin) return false;
  return Boolean(
    origin.street?.trim() &&
      origin.city?.trim() &&
      origin.state?.trim()
  );
}

export function hasValidCoordinates(
  coords?: { latitude?: number | null; longitude?: number | null } | null
): coords is { latitude: number; longitude: number } {
  if (!coords) return false;
  const lat = Number(coords.latitude);
  const lng = Number(coords.longitude);
  return (
    typeof coords.latitude === 'number' &&
    typeof coords.longitude === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

export interface ComprehensiveQuoteInput {
  fulfillmentType: FulfillmentType;
  subtotal: number;
  deliverySettings: DeliverySettings;
  deliveryRules: DeliveryRule[];
  address?: {
    cep?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  selectedRuleId?: string | null;
  calculatedDistanceKm?: number | null;
  distanceMethodUsed?: DistanceCalculationMethod | null;
  routeError?: string | null;
  geocodeError?: string | null;
}

/**
 * Matches a customer address against neighborhood/cep/fixed rules.
 */
function matchNeighborhoodOrLegacyRule(
  deliveryRules: DeliveryRule[],
  address: NonNullable<ComprehensiveQuoteInput['address']>,
  originAddress?: DeliveryOriginAddress | null,
  selectedRuleId?: string | null,
  strictNeighborhoodOnly = false
): {
  matchedRule: DeliveryRule | null;
  ambiguousRules?: DeliveryRule[];
  errorCode?: DeliveryQuoteResponse['errorCode'];
  reason?: string;
} {
  const allNeighborhoodRules = deliveryRules.filter((r) => r.type === 'neighborhood');
  const activeRules = deliveryRules
    .filter((r) => r.isActive)
    .sort((a, b) => a.position - b.position);

  if (deliveryRules.length === 0 || activeRules.length === 0) {
    // Check if the neighborhood exists as an INACTIVE rule
    if (address.neighborhood?.trim() && allNeighborhoodRules.length > 0) {
      const targetNorm = normalizeDeliveryText(address.neighborhood);
      const inactiveMatch = allNeighborhoodRules.find(
        (r) =>
          !r.isActive &&
          (normalizeDeliveryText(r.neighborhood) === targetNorm ||
            normalizeDeliveryText(r.name) === targetNorm)
      );
      if (inactiveMatch) {
        return {
          matchedRule: null,
          errorCode: 'NEIGHBORHOOD_INACTIVE',
          reason: `No momento não realizamos entregas no bairro "${address.neighborhood.trim()}".`,
        };
      }
    }
    return {
      matchedRule: null,
      errorCode: 'NO_RULES_CONFIGURED',
      reason: 'Ainda não há uma taxa de entrega configurada para esta região.',
    };
  }

  // If user explicitly selected a rule to resolve ambiguity
  if (selectedRuleId) {
    const chosen = activeRules.find((r) => r.id === selectedRuleId);
    if (chosen) {
      return { matchedRule: chosen };
    }
  }

  const customerNeighborhoodNorm = normalizeDeliveryText(address.neighborhood);
  const customerCityNorm = normalizeDeliveryText(address.city);
  const customerStateNorm = normalizeDeliveryText(address.state);
  const originCityNorm = normalizeDeliveryText(originAddress?.city);
  const originStateNorm = normalizeDeliveryText(originAddress?.state);

  // 1. Check active neighborhood rules
  const activeNeighborhoodRules = activeRules.filter((r) => r.type === 'neighborhood');
  if (customerNeighborhoodNorm) {
    const nameMatches = activeNeighborhoodRules.filter((r) => {
      const ruleNeighborhoodNorm = normalizeDeliveryText(r.neighborhood || r.name);
      return ruleNeighborhoodNorm === customerNeighborhoodNorm;
    });

    if (nameMatches.length > 0) {
      // Filter by city and UF if present
      const cityStateMatches = nameMatches.filter((r) => {
        const ruleCityNorm = normalizeDeliveryText(r.city) || originCityNorm;
        const ruleStateNorm = normalizeDeliveryText(r.state) || originStateNorm;

        if (ruleStateNorm && customerStateNorm && ruleStateNorm !== customerStateNorm) {
          return false;
        }
        if (ruleCityNorm && customerCityNorm && ruleCityNorm !== customerCityNorm) {
          return false;
        }
        return true;
      });

      if (cityStateMatches.length === 0) {
        return {
          matchedRule: null,
          errorCode: 'CITY_MISMATCH',
          reason: `O bairro "${address.neighborhood?.trim()}" pertence a outra cidade/UF configurada ou não atendemos na cidade informada (${[address.city, address.state].filter(Boolean).join(' - ')}).`,
        };
      }

      if (cityStateMatches.length > 1) {
        // Check if rules have distinct cities or distinct fees/names requiring disambiguation
        const distinctLabels = new Set(
          cityStateMatches.map(
            (r) => `${normalizeDeliveryText(r.name)}|${normalizeDeliveryText(r.city)}|${r.fee}`
          )
        );
        if (distinctLabels.size > 1) {
          return {
            matchedRule: null,
            ambiguousRules: cityStateMatches,
            errorCode: 'AMBIGUOUS_NEIGHBORHOOD',
            reason: `Encontramos mais de uma opção para o bairro "${address.neighborhood?.trim()}". Selecione a localidade exata abaixo.`,
          };
        }
      }

      return { matchedRule: cityStateMatches[0] };
    }

    // Check if it matches an INACTIVE neighborhood rule
    const inactiveMatch = allNeighborhoodRules.find((r) => {
      if (r.isActive) return false;
      const ruleNeighborhoodNorm = normalizeDeliveryText(r.neighborhood || r.name);
      return ruleNeighborhoodNorm === customerNeighborhoodNorm;
    });

    if (inactiveMatch) {
      return {
        matchedRule: null,
        errorCode: 'NEIGHBORHOOD_INACTIVE',
        reason: `No momento as entregas para o bairro "${address.neighborhood?.trim()}" estão temporariamente desativadas.`,
      };
    }
  }

  if (!strictNeighborhoodOnly) {
    // 2. Check CEP Range rules if any
    const cleanCep = normalizeCep(address.cep);
    if (cleanCep.length === 8) {
      const cepNum = parseInt(cleanCep, 10);
      for (const rule of activeRules) {
        if (rule.type === 'cep_range' && rule.cepStart && rule.cepEnd) {
          const startNum = parseInt(normalizeCep(rule.cepStart), 10);
          const endNum = parseInt(normalizeCep(rule.cepEnd), 10);
          if (!isNaN(startNum) && !isNaN(endNum) && cepNum >= startNum && cepNum <= endNum) {
            return { matchedRule: rule };
          }
        }
      }
    }

    // 3. Check Fixed fee rules (only if store explicitly added an active fixed rule and customer is in same city)
    const fixedRule = activeRules.find((r) => r.type === 'fixed');
    if (fixedRule) {
      const ruleCityNorm = normalizeDeliveryText(fixedRule.city) || originCityNorm;
      const ruleStateNorm = normalizeDeliveryText(fixedRule.state) || originStateNorm;
      if (ruleCityNorm && customerCityNorm && ruleCityNorm !== customerCityNorm) {
        return {
          matchedRule: null,
          errorCode: 'CITY_MISMATCH',
          reason: `Não entregamos na cidade informada (${[address.city, address.state].filter(Boolean).join(' - ')}).`,
        };
      }
      if (ruleStateNorm && customerStateNorm && ruleStateNorm !== customerStateNorm) {
        return {
          matchedRule: null,
          errorCode: 'CITY_MISMATCH',
          reason: `Não entregamos no estado informado (${address.state}).`,
        };
      }
      return { matchedRule: fixedRule };
    }
  }

  // Determine whether the mismatch is because of another city
  if (customerCityNorm) {
    const configuredCities = new Set(
      activeNeighborhoodRules
        .map((r) => normalizeDeliveryText(r.city) || originCityNorm)
        .filter(Boolean)
    );
    if (originCityNorm) configuredCities.add(originCityNorm);
    if (configuredCities.size > 0 && !configuredCities.has(customerCityNorm)) {
      return {
        matchedRule: null,
        errorCode: 'CITY_MISMATCH',
        reason: `Não realizamos entregas na cidade informada (${[address.city, address.state].filter(Boolean).join(' - ')}).`,
      };
    }
  }

  return {
    matchedRule: null,
    errorCode: 'NEIGHBORHOOD_NOT_FOUND',
    reason: address.neighborhood?.trim()
      ? `Não entregamos no bairro informado (${address.neighborhood.trim()}) ou ainda não há uma taxa de entrega configurada para aquela região.`
      : 'Informe o bairro para verificar a disponibilidade e taxa de entrega.',
  };
}

/**
 * Pure, deterministic delivery quote calculator supporting:
 * - Modalidade A: Por Quilômetro ('km')
 * - Modalidade B: Por Bairro ('neighborhood')
 * - Modalidade Avançada: Bairro + Adicional por Km ('neighborhood_km')
 */
export function calculateComprehensiveDeliveryQuote(
  input: ComprehensiveQuoteInput
): DeliveryQuoteResponse {
  const {
    fulfillmentType,
    subtotal,
    deliverySettings,
    deliveryRules,
    address,
    selectedRuleId,
    calculatedDistanceKm,
    distanceMethodUsed,
    routeError,
    geocodeError,
  } = input;

  const pricingMode: DeliveryPricingMode = deliverySettings.pricingMode || 'neighborhood';
  const safeSubtotal = roundCurrency(safeParsePrice(subtotal));
  const originAddress = deliverySettings.originAddress || null;
  const originSummary = formatAddressSummary(originAddress);
  const destinationSummary = formatAddressSummary(address || null);

  if (fulfillmentType === 'pickup') {
    return {
      isCovered: true,
      fee: 0,
      originalFee: 0,
      isFreeDelivery: true,
      pricingMode,
      minimumOrder: safeParsePrice(deliverySettings.minimumOrder),
      freeDeliveryAbove: deliverySettings.freeDeliveryAbove ?? null,
      estimatedTime: deliverySettings.deliveryEstimateText || null,
      originSummary,
      destinationSummary,
    };
  }

  if (!deliverySettings.deliveryEnabled) {
    return {
      isCovered: false,
      fee: 0,
      pricingMode,
      errorCode: 'DELIVERY_DISABLED',
      reason: 'A entrega em domicílio está desabilitada para este estabelecimento no momento.',
      originSummary,
      destinationSummary,
    };
  }

  if (!address) {
    return {
      isCovered: false,
      fee: 0,
      pricingMode,
      errorCode: 'INCOMPLETE_ADDRESS',
      reason: 'Informe o endereço de entrega para calcular o frete.',
      originSummary,
    };
  }

  // =========================================================================
  // MODALIDADE A: COBRANÇA POR QUILÔMETRO ('km')
  // =========================================================================
  if (pricingMode === 'km') {
    const kmConfig: DeliveryKmConfig = {
      ...DEFAULT_KM_CONFIG,
      ...(deliverySettings.kmConfig || {}),
    };

    if (!address.street?.trim() || !address.city?.trim() || !address.state?.trim()) {
      return {
        isCovered: false,
        fee: 0,
        pricingMode: 'km',
        errorCode: 'INCOMPLETE_ADDRESS',
        reason: 'Preencha logradouro, número, bairro, cidade e UF para calcular a distância de entrega.',
        originSummary,
        destinationSummary,
      };
    }

    if (!isOriginAddressValid(originAddress) || !hasValidCoordinates(originAddress)) {
      return {
        isCovered: false,
        fee: 0,
        pricingMode: 'km',
        errorCode: 'ORIGIN_NOT_CONFIGURED',
        reason:
          'O endereço de origem do restaurante ainda não possui coordenadas geocodificadas configuradas no painel administrativo.',
        originSummary,
        destinationSummary,
      };
    }

    if (geocodeError) {
      return {
        isCovered: false,
        fee: 0,
        pricingMode: 'km',
        errorCode: 'GEOCODE_FAILED',
        reason: geocodeError,
        originSummary,
        destinationSummary,
      };
    }

    if (routeError) {
      return {
        isCovered: false,
        fee: 0,
        pricingMode: 'km',
        errorCode: 'ROUTE_FAILED',
        reason: routeError,
        originSummary,
        destinationSummary,
      };
    }

    let rawDistanceKm = calculatedDistanceKm;
    let methodUsed: DistanceCalculationMethod =
      distanceMethodUsed || kmConfig.distanceMethod || 'road_route';

    if (
      (rawDistanceKm === null || rawDistanceKm === undefined) &&
      kmConfig.distanceMethod === 'straight_line' &&
      hasValidCoordinates(originAddress) &&
      hasValidCoordinates(address)
    ) {
      rawDistanceKm = calculateStraightLineDistanceKm(
        originAddress.latitude,
        originAddress.longitude,
        address.latitude!,
        address.longitude!
      );
      methodUsed = 'straight_line';
    }

    if (rawDistanceKm === null || rawDistanceKm === undefined || !Number.isFinite(rawDistanceKm)) {
      return {
        isCovered: false,
        fee: 0,
        pricingMode: 'km',
        errorCode: 'GEOCODE_FAILED',
        reason:
          'Não foi possível localizar as coordenadas exatas deste endereço para calcular a distância. Confira o CEP, rua, número, bairro e cidade.',
        originSummary,
        destinationSummary,
      };
    }

    const roundedDistanceKm = applyDistanceRounding(
      rawDistanceKm,
      Boolean(kmConfig.roundDistanceUp)
    );
    const maxDistanceKm = safeParsePrice(kmConfig.maxDistanceKm);

    if (maxDistanceKm > 0 && roundedDistanceKm > maxDistanceKm) {
      return {
        isCovered: false,
        fee: 0,
        pricingMode: 'km',
        distanceKm: roundedDistanceKm,
        distanceMethodUsed: methodUsed,
        errorCode: 'OUT_OF_RANGE_KM',
        reason: `Endereço fora da área máxima de entrega (${roundedDistanceKm
          .toFixed(2)
          .replace('.', ',')} km calculados; limite máximo de ${maxDistanceKm
          .toFixed(1)
          .replace('.', ',')} km).`,
        originSummary,
        destinationSummary,
      };
    }

    const minDistanceKm = Math.max(0, safeParsePrice(kmConfig.minDistanceKm));
    const billedDistanceKm = Math.max(roundedDistanceKm, minDistanceKm);
    const baseFee = Math.max(0, safeParsePrice(kmConfig.baseFee));
    const pricePerKm = Math.max(0, safeParsePrice(kmConfig.pricePerKm));
    const variableFee = roundCurrency(billedDistanceKm * pricePerKm);
    let calculatedFee = roundCurrency(baseFee + variableFee);

    const minDeliveryFee = safeParsePrice(kmConfig.minDeliveryFee);
    if (minDeliveryFee > 0 && calculatedFee < minDeliveryFee) {
      calculatedFee = roundCurrency(minDeliveryFee);
    }

    const effectiveFreeAbove =
      kmConfig.freeDeliveryAbove && kmConfig.freeDeliveryAbove > 0
        ? safeParsePrice(kmConfig.freeDeliveryAbove)
        : deliverySettings.freeDeliveryAbove && deliverySettings.freeDeliveryAbove > 0
        ? safeParsePrice(deliverySettings.freeDeliveryAbove)
        : null;

    const isFreeDelivery = Boolean(
      effectiveFreeAbove && effectiveFreeAbove > 0 && safeSubtotal >= effectiveFreeAbove
    );
    const finalFee = isFreeDelivery ? 0 : calculatedFee;

    return {
      isCovered: true,
      fee: finalFee,
      originalFee: calculatedFee,
      isFreeDelivery,
      pricingMode: 'km',
      distanceKm: roundedDistanceKm,
      billedDistanceKm,
      distanceMethodUsed: methodUsed,
      ruleName: `Entrega por Km (${roundedDistanceKm.toFixed(1).replace('.', ',')} km)`,
      estimatedTime: deliverySettings.deliveryEstimateText || null,
      minimumOrder: safeParsePrice(deliverySettings.minimumOrder),
      freeDeliveryAbove: effectiveFreeAbove,
      originSummary,
      destinationSummary,
      destinationCoordinates: hasValidCoordinates(address)
        ? { latitude: address.latitude, longitude: address.longitude }
        : null,
      breakdown: {
        baseFee,
        variableFee,
        formulaText: `R$ ${baseFee.toFixed(2).replace('.', ',')} (taxa fixa) + ${billedDistanceKm
          .toFixed(2)
          .replace('.', ',')} km × R$ ${pricePerKm.toFixed(2).replace('.', ',')}/km`,
      },
    };
  }

  // =========================================================================
  // MODALIDADE B: COBRANÇA POR BAIRRO ('neighborhood')
  // =========================================================================
  if (pricingMode === 'neighborhood') {
    if (!address.neighborhood?.trim()) {
      return {
        isCovered: false,
        fee: 0,
        pricingMode: 'neighborhood',
        errorCode: 'INCOMPLETE_ADDRESS',
        reason: 'Informe o bairro de entrega para calcular a taxa de entrega.',
        originSummary,
        destinationSummary,
      };
    }

    const matchResult = matchNeighborhoodOrLegacyRule(
      deliveryRules,
      address,
      originAddress,
      selectedRuleId,
      false
    );

    if (!matchResult.matchedRule) {
      return {
        isCovered: false,
        fee: 0,
        pricingMode: 'neighborhood',
        errorCode: matchResult.errorCode || 'NEIGHBORHOOD_NOT_FOUND',
        reason:
          matchResult.reason ||
          'Não entregamos no bairro informado ou ainda não há uma taxa de entrega configurada para aquela região.',
        ambiguousRules: matchResult.ambiguousRules,
        originSummary,
        destinationSummary,
      };
    }

    const rule = matchResult.matchedRule;
    const baseRuleFee = roundCurrency(safeParsePrice(rule.fee));

    const effectiveMinOrder =
      rule.minimumOrder && safeParsePrice(rule.minimumOrder) > 0
        ? safeParsePrice(rule.minimumOrder)
        : safeParsePrice(deliverySettings.minimumOrder);

    const effectiveFreeAbove =
      rule.freeDeliveryAbove && safeParsePrice(rule.freeDeliveryAbove) > 0
        ? safeParsePrice(rule.freeDeliveryAbove)
        : deliverySettings.freeDeliveryAbove && safeParsePrice(deliverySettings.freeDeliveryAbove) > 0
        ? safeParsePrice(deliverySettings.freeDeliveryAbove)
        : null;

    const isFreeDelivery = Boolean(
      effectiveFreeAbove && effectiveFreeAbove > 0 && safeSubtotal >= effectiveFreeAbove
    );
    const finalFee = isFreeDelivery ? 0 : baseRuleFee;

    return {
      isCovered: true,
      fee: finalFee,
      originalFee: baseRuleFee,
      isFreeDelivery,
      pricingMode: 'neighborhood',
      ruleApplied: rule,
      ruleName: rule.neighborhood || rule.name,
      estimatedTime: rule.estimatedTime || deliverySettings.deliveryEstimateText || null,
      minimumOrder: effectiveMinOrder,
      freeDeliveryAbove: effectiveFreeAbove,
      originSummary,
      destinationSummary,
      breakdown: {
        baseFee: baseRuleFee,
        variableFee: 0,
        formulaText: `Taxa fixa para o bairro ${rule.neighborhood || rule.name}: R$ ${baseRuleFee
          .toFixed(2)
          .replace('.', ',')}`,
      },
    };
  }

  // =========================================================================
  // MODALIDADE AVANÇADA: BAIRRO + ADICIONAL POR KM ('neighborhood_km')
  // =========================================================================
  if (!address.neighborhood?.trim() || !address.street?.trim()) {
    return {
      isCovered: false,
      fee: 0,
      pricingMode: 'neighborhood_km',
      errorCode: 'INCOMPLETE_ADDRESS',
      reason: 'Preencha rua, número, bairro e cidade para calcular a taxa do bairro + distância.',
      originSummary,
      destinationSummary,
    };
  }

  const matchResult = matchNeighborhoodOrLegacyRule(
    deliveryRules,
    address,
    originAddress,
    selectedRuleId,
    true
  );

  if (!matchResult.matchedRule) {
    return {
      isCovered: false,
      fee: 0,
      pricingMode: 'neighborhood_km',
      errorCode: matchResult.errorCode || 'NEIGHBORHOOD_NOT_FOUND',
      reason:
        matchResult.reason ||
        'Não entregamos no bairro informado ou ainda não há uma taxa de entrega configurada para aquela região.',
      ambiguousRules: matchResult.ambiguousRules,
      originSummary,
      destinationSummary,
    };
  }

  const rule = matchResult.matchedRule;
  const kmConfig: DeliveryKmConfig = {
    ...DEFAULT_KM_CONFIG,
    ...(deliverySettings.kmConfig || {}),
  };

  if (!isOriginAddressValid(originAddress) || !hasValidCoordinates(originAddress)) {
    return {
      isCovered: false,
      fee: 0,
      pricingMode: 'neighborhood_km',
      errorCode: 'ORIGIN_NOT_CONFIGURED',
      reason:
        'O endereço de origem do restaurante ainda não possui coordenadas configuradas para o cálculo híbrido por km.',
      originSummary,
      destinationSummary,
    };
  }

  if (geocodeError) {
    return {
      isCovered: false,
      fee: 0,
      pricingMode: 'neighborhood_km',
      errorCode: 'GEOCODE_FAILED',
      reason: geocodeError,
      originSummary,
      destinationSummary,
    };
  }

  if (routeError) {
    return {
      isCovered: false,
      fee: 0,
      pricingMode: 'neighborhood_km',
      errorCode: 'ROUTE_FAILED',
      reason: routeError,
      originSummary,
      destinationSummary,
    };
  }

  let rawDistanceKm = calculatedDistanceKm;
  let methodUsed: DistanceCalculationMethod =
    distanceMethodUsed || kmConfig.distanceMethod || 'road_route';

  if (
    (rawDistanceKm === null || rawDistanceKm === undefined) &&
    kmConfig.distanceMethod === 'straight_line' &&
    hasValidCoordinates(originAddress) &&
    hasValidCoordinates(address)
  ) {
    rawDistanceKm = calculateStraightLineDistanceKm(
      originAddress.latitude,
      originAddress.longitude,
      address.latitude!,
      address.longitude!
    );
    methodUsed = 'straight_line';
  }

  if (rawDistanceKm === null || rawDistanceKm === undefined || !Number.isFinite(rawDistanceKm)) {
    return {
      isCovered: false,
      fee: 0,
      pricingMode: 'neighborhood_km',
      errorCode: 'GEOCODE_FAILED',
      reason:
        'Não foi possível determinar a distância até o endereço informado para o cálculo híbrido.',
      originSummary,
      destinationSummary,
    };
  }

  const roundedDistanceKm = applyDistanceRounding(
    rawDistanceKm,
    Boolean(kmConfig.roundDistanceUp)
  );
  const maxDistanceKm = safeParsePrice(kmConfig.maxDistanceKm);

  if (maxDistanceKm > 0 && roundedDistanceKm > maxDistanceKm) {
    return {
      isCovered: false,
      fee: 0,
      pricingMode: 'neighborhood_km',
      distanceKm: roundedDistanceKm,
      distanceMethodUsed: methodUsed,
      errorCode: 'OUT_OF_RANGE_KM',
      reason: `Endereço fora da área máxima de entrega (${roundedDistanceKm
        .toFixed(2)
        .replace('.', ',')} km calculados; limite máximo de ${maxDistanceKm
        .toFixed(1)
        .replace('.', ',')} km).`,
      originSummary,
      destinationSummary,
    };
  }

  const baseRuleFee = roundCurrency(safeParsePrice(rule.fee));
  const includedKm =
    rule.includedDistanceKm !== null && rule.includedDistanceKm !== undefined
      ? Math.max(0, safeParsePrice(rule.includedDistanceKm))
      : Math.max(0, safeParsePrice(kmConfig.minDistanceKm));
  const extraKmRate =
    rule.extraKmFee !== null && rule.extraKmFee !== undefined
      ? Math.max(0, safeParsePrice(rule.extraKmFee))
      : Math.max(0, safeParsePrice(kmConfig.pricePerKm));

  const extraKm = Math.max(0, roundCurrency(roundedDistanceKm - includedKm));
  const variableFee = roundCurrency(extraKm * extraKmRate);
  let calculatedFee = roundCurrency(baseRuleFee + variableFee);

  const minDeliveryFee = safeParsePrice(kmConfig.minDeliveryFee);
  if (minDeliveryFee > 0 && calculatedFee < minDeliveryFee) {
    calculatedFee = roundCurrency(minDeliveryFee);
  }

  const effectiveMinOrder =
    rule.minimumOrder && safeParsePrice(rule.minimumOrder) > 0
      ? safeParsePrice(rule.minimumOrder)
      : safeParsePrice(deliverySettings.minimumOrder);

  const effectiveFreeAbove =
    rule.freeDeliveryAbove && safeParsePrice(rule.freeDeliveryAbove) > 0
      ? safeParsePrice(rule.freeDeliveryAbove)
      : kmConfig.freeDeliveryAbove && safeParsePrice(kmConfig.freeDeliveryAbove) > 0
      ? safeParsePrice(kmConfig.freeDeliveryAbove)
      : deliverySettings.freeDeliveryAbove && safeParsePrice(deliverySettings.freeDeliveryAbove) > 0
      ? safeParsePrice(deliverySettings.freeDeliveryAbove)
      : null;

  const isFreeDelivery = Boolean(
    effectiveFreeAbove && effectiveFreeAbove > 0 && safeSubtotal >= effectiveFreeAbove
  );
  const finalFee = isFreeDelivery ? 0 : calculatedFee;

  return {
    isCovered: true,
    fee: finalFee,
    originalFee: calculatedFee,
    isFreeDelivery,
    pricingMode: 'neighborhood_km',
    distanceKm: roundedDistanceKm,
    billedDistanceKm: roundedDistanceKm,
    distanceMethodUsed: methodUsed,
    ruleApplied: rule,
    ruleName: `${rule.neighborhood || rule.name} (${roundedDistanceKm.toFixed(1).replace('.', ',')} km)`,
    estimatedTime: rule.estimatedTime || deliverySettings.deliveryEstimateText || null,
    minimumOrder: effectiveMinOrder,
    freeDeliveryAbove: effectiveFreeAbove,
    originSummary,
    destinationSummary,
    breakdown: {
      baseFee: baseRuleFee,
      variableFee,
      extraKm,
      formulaText: `R$ ${baseRuleFee.toFixed(2).replace('.', ',')} (bairro ${
        rule.neighborhood || rule.name
      }, até ${includedKm.toFixed(1).replace('.', ',')} km) + ${extraKm
        .toFixed(2)
        .replace('.', ',')} km excedente × R$ ${extraKmRate.toFixed(2).replace('.', ',')}/km`,
    },
  };
}

/**
 * Synchronous wrapper for client-side/backward-compatible invocations when distanceKm is already known or in neighborhood mode.
 */
export function calculateDeliveryFee(
  fulfillmentType: FulfillmentType,
  subtotal: number,
  deliverySettings: DeliverySettings,
  deliveryRules: DeliveryRule[],
  address?: {
    cep: string;
    neighborhood: string;
    street?: string;
    number?: string;
    city?: string;
    state?: string;
    latitude?: number | null;
    longitude?: number | null;
  } | null,
  options?: {
    selectedRuleId?: string | null;
    calculatedDistanceKm?: number | null;
    distanceMethodUsed?: DistanceCalculationMethod | null;
    routeError?: string | null;
    geocodeError?: string | null;
  }
): DeliveryCalculationResult {
  const quote = calculateComprehensiveDeliveryQuote({
    fulfillmentType,
    subtotal,
    deliverySettings,
    deliveryRules,
    address: address || null,
    selectedRuleId: options?.selectedRuleId,
    calculatedDistanceKm: options?.calculatedDistanceKm,
    distanceMethodUsed: options?.distanceMethodUsed,
    routeError: options?.routeError,
    geocodeError: options?.geocodeError,
  });

  return {
    fee: quote.fee,
    ruleApplied: quote.ruleApplied || null,
    isCovered: quote.isCovered,
    reason: quote.reason,
    quote,
  };
}
