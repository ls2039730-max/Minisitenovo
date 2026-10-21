/**
 * Safely parses any currency string (including Brazilian "59,90", "R$ 59,90",
 * standard "59.90", integers, or numbers) into a valid finite floating number or null.
 */
export function parsePrice(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? Math.round(val * 100) / 100 : null;
  }
  const str = String(val).trim();
  if (!str) return null;

  // Handles comma decimal (e.g. "89,99" or "1.250,50" or "R$ 89,99")
  if (str.includes(',')) {
    const cleaned = str
      .replace(/[^\d.,-]/g, '')
      .replace(/\./g, '') // remove thousands separator dots
      .replace(',', '.'); // convert comma to decimal dot
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  // Standard dot decimal or integers
  const cleaned = str.replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * Safely parses any price input into a guaranteed finite number (defaults to 0 when null/invalid).
 */
export function toSafePrice(val: unknown, fallback = 0): number {
  const parsed = parsePrice(val);
  return parsed !== null && Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Resolves the effective unit price, original price, and discount flag
 * from base price and optional promotional price (for product or variant).
 * Promotional price is only applied when > 0 and strictly less than base price.
 */
export function resolveEffectivePrice(
  baseInput: unknown,
  promoInput?: unknown
): {
  unitPrice: number;
  originalPrice: number | null;
  hasDiscount: boolean;
} {
  const parsedBase = parsePrice(baseInput);
  const basePrice = parsedBase !== null && parsedBase >= 0 ? parsedBase : 0;
  const parsedPromo = parsePrice(promoInput);

  const hasDiscount =
    parsedPromo !== null &&
    parsedPromo > 0 &&
    basePrice > 0 &&
    parsedPromo < basePrice;

  const unitPrice = hasDiscount && parsedPromo !== null ? parsedPromo : basePrice;

  return {
    unitPrice: Math.round(unitPrice * 100) / 100,
    originalPrice: hasDiscount ? Math.round(basePrice * 100) / 100 : null,
    hasDiscount,
  };
}

/**
 * Sanitizes an item quantity into a safe integer between 1 and maxQty (default 99).
 */
export function sanitizeQuantity(val: unknown, fallback = 1, maxQty = 99): number {
  const parsed = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.max(1, Math.min(maxQty, Math.floor(fallback)));
  }
  return Math.max(1, Math.min(maxQty, Math.floor(parsed)));
}

/**
 * Formats a number to Brazilian Real string without prefix (e.g. "89,99")
 */
export function formatPriceBRL(val: unknown): string {
  const num = typeof val === 'number' ? val : parsePrice(val);
  if (num === null || !Number.isFinite(num)) return '0,00';
  return num.toFixed(2).replace('.', ',');
}

/**
 * Formats a number to full Brazilian Real currency string (e.g. "R$ 89,99")
 */
export function formatCurrencyBRL(val: unknown): string {
  return `R$ ${formatPriceBRL(val)}`;
}
