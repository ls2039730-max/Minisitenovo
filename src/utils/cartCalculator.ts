import { CartItemInput, ValidatedCartItem } from '../types/order.js';
import { parsePrice, resolveEffectivePrice, sanitizeQuantity } from './currency.js';

export interface CartCalculationSummary {
  items: ValidatedCartItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  itemCount: number;
  hasInvalidItems: boolean;
}

/**
 * Calculates the exact subtotal for a single cart item using numeric values only.
 */
export function calculateItemSubtotal(
  unitPriceInput: number | string | null | undefined,
  quantityInput: number | string | null | undefined
): number {
  const unitPrice = parsePrice(unitPriceInput);
  const safePrice = unitPrice !== null && unitPrice >= 0 ? unitPrice : 0;
  const safeQty = sanitizeQuantity(quantityInput, 1, 99);
  return Math.round(safePrice * safeQty * 100) / 100;
}

/**
 * Single authoritative source of truth for calculating cart items, subtotal, delivery fee, and total.
 * Ensures that:
 * - Item unitPrice respects promotionalPrice when applicable.
 * - Item subtotal ALWAYS equals round(unitPrice * quantity, 2).
 * - Cart subtotal ALWAYS equals the exact sum of item subtotals.
 * - Cart total ALWAYS equals round(max(0, subtotal + deliveryFee - discount), 2).
 * - Never returns NaN or divergent totals.
 */
export function calculateCartTotals(
  rawItems: Array<Partial<ValidatedCartItem> & { productId: string; quantity: number }>,
  deliveryFeeInput: number | string | null | undefined = 0,
  discountInput: number | string | null | undefined = 0
): CartCalculationSummary {
  const normalizedItems: ValidatedCartItem[] = [];
  let subtotal = 0;
  let itemCount = 0;
  let hasInvalidItems = false;

  for (const raw of rawItems || []) {
    if (!raw || typeof raw.productId !== 'string' || !raw.productId.trim()) {
      hasInvalidItems = true;
      continue;
    }

    const maxQty =
      typeof raw.maxAvailableQuantity === 'number' && Number.isFinite(raw.maxAvailableQuantity) && raw.maxAvailableQuantity > 0
        ? Math.min(99, Math.floor(raw.maxAvailableQuantity))
        : 99;

    const quantity = sanitizeQuantity(raw.quantity, 1, maxQty);

    // Resolve effective price safely whether raw comes from server or local snapshot
    const rawUnit = parsePrice(raw.unitPrice);
    const rawOrig = parsePrice(raw.originalPrice);

    let unitPrice = 0;
    let originalPrice: number | null = null;
    let hasDiscount = false;

    if (rawOrig !== null && rawOrig > 0 && rawUnit !== null && rawUnit > 0 && rawUnit < rawOrig) {
      unitPrice = rawUnit;
      originalPrice = rawOrig;
      hasDiscount = true;
    } else if (rawUnit !== null && rawUnit >= 0) {
      unitPrice = rawUnit;
      originalPrice = rawOrig !== null && rawOrig > rawUnit ? rawOrig : null;
      hasDiscount = originalPrice !== null;
    } else if (rawOrig !== null && rawOrig >= 0) {
      unitPrice = rawOrig;
      originalPrice = null;
      hasDiscount = false;
    } else {
      hasInvalidItems = true;
    }

    const itemSubtotal = calculateItemSubtotal(unitPrice, quantity);
    subtotal = Math.round((subtotal + itemSubtotal) * 100) / 100;
    itemCount += quantity;

    const variantId = raw.variantId || null;
    normalizedItems.push({
      id: raw.id || `${raw.productId}_${variantId || 'base'}`,
      productId: raw.productId,
      variantId,
      productName: raw.productName || 'Produto',
      variantName: raw.variantName || null,
      imageUrl: raw.imageUrl || null,
      unitPrice,
      originalPrice,
      hasDiscount,
      quantity,
      subtotal: itemSubtotal,
      maxAvailableQuantity: maxQty,
      warning: raw.warning || null,
    });
  }

  const parsedFee = parsePrice(deliveryFeeInput);
  const deliveryFee = parsedFee !== null && parsedFee >= 0 ? parsedFee : 0;

  const parsedDiscount = parsePrice(discountInput);
  const discount = parsedDiscount !== null && parsedDiscount >= 0 ? parsedDiscount : 0;

  const total = Math.max(0, Math.round((subtotal + deliveryFee - discount) * 100) / 100);

  return {
    items: normalizedItems,
    subtotal,
    deliveryFee,
    discount,
    total,
    itemCount,
    hasInvalidItems,
  };
}

/**
 * Merges local cart items with server-validated data so quantities and prices
 * stay 100% synchronized even while revalidating or after optimistic quantity updates.
 */
export function buildAuthoritativeCartItems(
  localItems: CartItemInput[],
  serverItems?: ValidatedCartItem[] | null
): ValidatedCartItem[] {
  const serverMap = new Map<string, ValidatedCartItem>();
  if (Array.isArray(serverItems)) {
    for (const si of serverItems) {
      if (si && si.productId) {
        const key = `${si.productId}_${si.variantId || 'base'}`;
        serverMap.set(key, si);
      }
    }
  }

  const merged: Array<Partial<ValidatedCartItem> & { productId: string; quantity: number }> = [];

  for (const local of localItems || []) {
    if (!local || typeof local.productId !== 'string') continue;
    const key = `${local.productId}_${local.variantId || 'base'}`;
    const serverMatch = serverMap.get(key);

    const maxQty = serverMatch?.maxAvailableQuantity ?? local.maxAvailableQuantity ?? 99;
    const quantity = sanitizeQuantity(local.quantity, 1, maxQty);

    if (serverMatch) {
      const { unitPrice, originalPrice, hasDiscount } = resolveEffectivePrice(
        serverMatch.originalPrice ?? serverMatch.unitPrice,
        serverMatch.hasDiscount ? serverMatch.unitPrice : null
      );
      merged.push({
        ...serverMatch,
        quantity,
        unitPrice,
        originalPrice,
        hasDiscount,
        subtotal: calculateItemSubtotal(unitPrice, quantity),
      });
    } else {
      // Fallback to local snapshot when server validation is still in-flight or offline
      const { unitPrice, originalPrice, hasDiscount } = resolveEffectivePrice(
        local.originalPrice ?? local.unitPrice,
        local.hasDiscount ? local.unitPrice : null
      );
      merged.push({
        id: key,
        productId: local.productId,
        variantId: local.variantId || null,
        productName: local.productName || 'Carregando produto...',
        variantName: local.variantName || null,
        imageUrl: local.imageUrl || null,
        unitPrice,
        originalPrice,
        hasDiscount,
        quantity,
        subtotal: calculateItemSubtotal(unitPrice, quantity),
        maxAvailableQuantity: maxQty,
      });
    }
  }

  return calculateCartTotals(merged).items;
}
