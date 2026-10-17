import { DeliveryRule, DeliverySettings } from '../types/order.js';

export interface DeliveryCalculationResult {
  fee: number;
  isFreeDelivery: boolean;
  ruleMatched: DeliveryRule | null;
  isCovered: boolean;
  reason?: string;
}

/**
 * Normalizes string for accent and case insensitive neighborhood matching
 */
export function normalizeNeighborhood(text: string): string {
  return (text || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Centralized delivery fee calculation shared between backend and frontend.
 * Priority order:
 * 1. Free delivery threshold (subtotal >= freeDeliveryAbove)
 * 2. Neighborhood match rule
 * 3. CEP range match rule
 * 4. Fixed fee rule
 * 5. Not covered if no rule matches
 */
export function calculateDeliveryFee(
  subtotal: number,
  address: { cep?: string; neighborhood?: string },
  settings: DeliverySettings | null,
  rules: DeliveryRule[]
): DeliveryCalculationResult {
  if (!settings || !settings.deliveryEnabled) {
    return {
      fee: 0,
      isFreeDelivery: false,
      ruleMatched: null,
      isCovered: false,
      reason: 'Entrega não está habilitada para este estabelecimento.',
    };
  }

  // 1. Free delivery by minimum subtotal
  if (
    settings.freeDeliveryAbove !== null &&
    settings.freeDeliveryAbove !== undefined &&
    settings.freeDeliveryAbove > 0 &&
    subtotal >= settings.freeDeliveryAbove
  ) {
    return {
      fee: 0,
      isFreeDelivery: true,
      ruleMatched: null,
      isCovered: true,
      reason: 'Entrega grátis concedida pelo valor do pedido!',
    };
  }

  const activeRules = (rules || []).filter((r) => r.isActive);
  const cleanCep = (address.cep || '').replace(/\D/g, '');
  const normNeigh = normalizeNeighborhood(address.neighborhood || '');

  // 2. Neighborhood Rule
  if (normNeigh) {
    const neighborhoodRule = activeRules
      .filter((r) => r.type === 'neighborhood' && r.neighborhood)
      .sort((a, b) => a.position - b.position)
      .find((r) => normalizeNeighborhood(r.neighborhood!) === normNeigh);

    if (neighborhoodRule) {
      return {
        fee: Number(neighborhoodRule.fee),
        isFreeDelivery: Number(neighborhoodRule.fee) === 0,
        ruleMatched: neighborhoodRule,
        isCovered: true,
      };
    }
  }

  // 3. CEP Range Rule
  if (cleanCep && cleanCep.length === 8) {
    const cepNum = parseInt(cleanCep, 10);
    const cepRule = activeRules
      .filter((r) => r.type === 'cep_range' && r.cepStart && r.cepEnd)
      .sort((a, b) => a.position - b.position)
      .find((r) => {
        const start = parseInt((r.cepStart || '').replace(/\D/g, ''), 10);
        const end = parseInt((r.cepEnd || '').replace(/\D/g, ''), 10);
        return !isNaN(start) && !isNaN(end) && cepNum >= start && cepNum <= end;
      });

    if (cepRule) {
      return {
        fee: Number(cepRule.fee),
        isFreeDelivery: Number(cepRule.fee) === 0,
        ruleMatched: cepRule,
        isCovered: true,
      };
    }
  }

  // 4. Fixed Fee Default Rule
  const fixedRule = activeRules.find((r) => r.type === 'fixed');
  if (fixedRule) {
    return {
      fee: Number(fixedRule.fee),
      isFreeDelivery: Number(fixedRule.fee) === 0,
      ruleMatched: fixedRule,
      isCovered: true,
    };
  }

  // 5. Not Covered
  return {
    fee: 0,
    isFreeDelivery: false,
    ruleMatched: null,
    isCovered: false,
    reason: 'Este endereço ainda não está na nossa área de entrega.',
  };
}
