import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CartItemInput, ValidatedCartItem, ValidatedCartResponse, Order } from '../types/order';
import { Tenant } from '../types/saas';
import { api } from '../services/api';
import { parsePrice, toSafePrice, sanitizeQuantity } from '../utils/currency';
import { buildAuthoritativeCartItems, calculateCartTotals } from '../utils/cartCalculator';

interface CartToast {
  show: boolean;
  message: string;
  productName?: string;
}

export interface AddToCartSnapshot {
  variantName?: string | null;
  imageUrl?: string | null;
  unitPrice?: number;
  originalPrice?: number | null;
  hasDiscount?: boolean;
  maxAvailableQuantity?: number;
}

interface CartContextType {
  items: CartItemInput[];
  displayItems: ValidatedCartItem[];
  subtotal: number;
  itemCount: number;
  validatedData: ValidatedCartResponse | null;
  isValidating: boolean;
  revalidationError: string | null;
  isCartOpen: boolean;
  isCheckoutOpen: boolean;
  completedOrder: Order | null;
  whatsappUrl: string | null;
  cartWarnings: string[];
  addedToast: CartToast | null;
  openCart: () => void;
  closeCart: () => void;
  openCheckout: () => void;
  closeCheckout: () => void;
  addToCart: (
    productId: string,
    variantId?: string | null,
    quantity?: number,
    productName?: string,
    snapshot?: AddToCartSnapshot
  ) => void;
  updateQuantity: (productId: string, variantId: string | null | undefined, quantity: number) => void;
  removeFromCart: (productId: string, variantId?: string | null) => void;
  clearCart: () => void;
  revalidateCart: () => Promise<ValidatedCartResponse | null>;
  setOrderCompleted: (order: Order, whatsappUrl: string) => void;
  closeOrderSuccess: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

interface CartProviderProps {
  tenant: Tenant;
  children: React.ReactNode;
}

function sanitizeStoredCartItems(raw: unknown): CartItemInput[] {
  if (!Array.isArray(raw)) return [];
  const mergedMap = new Map<string, CartItemInput>();

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const it = entry as Record<string, unknown>;
    if (typeof it.productId !== 'string' || !it.productId.trim()) continue;

    const qty = sanitizeQuantity(it.quantity, 1, 99);
    const variantId = typeof it.variantId === 'string' && it.variantId.trim() ? it.variantId.trim() : null;
    const key = `${it.productId.trim()}_${variantId || 'base'}`;

    const unitPrice = it.unitPrice !== undefined && it.unitPrice !== null ? parsePrice(it.unitPrice) : undefined;
    const originalPrice =
      it.originalPrice !== undefined && it.originalPrice !== null ? parsePrice(it.originalPrice) : null;

    const existing = mergedMap.get(key);
    if (existing) {
      existing.quantity = sanitizeQuantity(existing.quantity + qty, 1, 99);
    } else {
      mergedMap.set(key, {
        productId: it.productId.trim(),
        variantId,
        quantity: qty,
        productName: typeof it.productName === 'string' ? it.productName : undefined,
        variantName: typeof it.variantName === 'string' ? it.variantName : null,
        imageUrl: typeof it.imageUrl === 'string' ? it.imageUrl : null,
        unitPrice: unitPrice && unitPrice > 0 ? unitPrice : undefined,
        originalPrice: originalPrice && originalPrice > 0 ? originalPrice : null,
        hasDiscount: Boolean(it.hasDiscount),
        maxAvailableQuantity:
          typeof it.maxAvailableQuantity === 'number' && it.maxAvailableQuantity > 0
            ? it.maxAvailableQuantity
            : 99,
      });
    }
  }

  return Array.from(mergedMap.values());
}

export const CartProvider: React.FC<CartProviderProps> = ({ tenant, children }) => {
  const storageKey = `localhub_cart_${tenant.slug}`;

  // Read and sanitize initial cart items from localStorage
  const [items, setItems] = useState<CartItemInput[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return sanitizeStoredCartItems(parsed);
      }
    } catch {
      // Ignore corrupted localStorage
    }
    return [];
  });

  const [validatedData, setValidatedData] = useState<ValidatedCartResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [revalidationError, setRevalidationError] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [cartWarnings, setCartWarnings] = useState<string[]>([]);
  const [addedToast, setAddedToast] = useState<CartToast | null>(null);

  // Request sequence counter to prevent out-of-order response race conditions
  const reqIdRef = useRef(0);
  const itemsRef = useRef<CartItemInput[]>(items);
  itemsRef.current = items;

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // Storage quota or disabled
    }
  }, [items, storageKey]);

  // Single authoritative list of cart items and subtotal
  // Always reflects current local quantities immediately while using latest server-validated prices
  const displayItems = useMemo<ValidatedCartItem[]>(() => {
    return buildAuthoritativeCartItems(items, validatedData?.items);
  }, [items, validatedData?.items]);

  const { subtotal, itemCount } = useMemo(() => {
    const totals = calculateCartTotals(displayItems, 0, 0);
    return {
      subtotal: totals.subtotal,
      itemCount: totals.itemCount,
    };
  }, [displayItems]);

  // Keep validatedData.items and validatedData.subtotal synchronized with local quantity changes
  // so no consumer ever reads a stale subtotal or stale quantity while a network request is in-flight
  const effectiveValidatedData = useMemo<ValidatedCartResponse | null>(() => {
    if (!validatedData) return null;
    return {
      ...validatedData,
      items: displayItems,
      subtotal,
      itemCount,
    };
  }, [validatedData, displayItems, subtotal, itemCount]);

  // Server revalidation with sequence guard
  const revalidateCart = useCallback(async (): Promise<ValidatedCartResponse | null> => {
    const currentItems = itemsRef.current;
    if (currentItems.length === 0) {
      reqIdRef.current++;
      setValidatedData(null);
      setCartWarnings([]);
      setRevalidationError(null);
      setIsValidating(false);
      return null;
    }

    const thisReqId = ++reqIdRef.current;

    try {
      setIsValidating(true);
      setRevalidationError(null);

      const res = await api.validateCart(tenant.slug, currentItems);

      // If a newer request was started or cart was modified while awaiting, merge prices without clobbering newer quantities
      const latestItems = itemsRef.current;
      if (latestItems.length === 0) {
        setValidatedData(null);
        return null;
      }

      if (res && Array.isArray(res.items)) {
        const serverMap = new Map<string, ValidatedCartItem>();
        for (const si of res.items) {
          serverMap.set(`${si.productId}_${si.variantId || 'base'}`, si);
        }

        // Update local items with authoritative snapshots (prices, names, images, stock caps)
        // Only remove items if the server response corresponds to the latest request
        setItems((prev) => {
          const next: CartItemInput[] = [];
          for (const localIt of prev) {
            const key = `${localIt.productId}_${localIt.variantId || 'base'}`;
            const serverIt = serverMap.get(key);
            if (serverIt) {
              const maxStock = sanitizeQuantity(serverIt.maxAvailableQuantity ?? 99, 1, 99);
              // If user changed quantity while request was in flight, preserve user's latest quantity (capped by stock)
              const targetQty =
                thisReqId === reqIdRef.current
                  ? sanitizeQuantity(serverIt.quantity, 1, maxStock)
                  : sanitizeQuantity(localIt.quantity, 1, maxStock);

              next.push({
                productId: localIt.productId,
                variantId: localIt.variantId || null,
                quantity: targetQty,
                productName: serverIt.productName,
                variantName: serverIt.variantName,
                imageUrl: serverIt.imageUrl,
                unitPrice: toSafePrice(serverIt.unitPrice),
                originalPrice: serverIt.originalPrice !== null ? parsePrice(serverIt.originalPrice) : null,
                hasDiscount: Boolean(serverIt.hasDiscount),
                maxAvailableQuantity: maxStock,
              });
            } else if (thisReqId !== reqIdRef.current) {
              // Item was added after this request started; keep it
              next.push(localIt);
            }
          }
          return next;
        });

        // Recompute authoritative response with latest quantities
        const mergedValidatedItems = buildAuthoritativeCartItems(itemsRef.current, res.items);
        const mergedTotals = calculateCartTotals(mergedValidatedItems, 0, 0);
        const syncedResponse: ValidatedCartResponse = {
          ...res,
          items: mergedValidatedItems,
          subtotal: mergedTotals.subtotal,
          itemCount: mergedTotals.itemCount,
        };

        setValidatedData(syncedResponse);
        setCartWarnings(res.warnings || []);
        return syncedResponse;
      }

      return res;
    } catch (err: any) {
      console.warn('[CART] Revalidation warning:', err?.message || err);
      if (thisReqId === reqIdRef.current) {
        setRevalidationError(
          err?.message || 'Não foi possível sincronizar os dados do carrinho no momento.'
        );
      }
      return effectiveValidatedData;
    } finally {
      if (thisReqId === reqIdRef.current) {
        setIsValidating(false);
      }
    }
  }, [tenant.slug, effectiveValidatedData]);

  // Pre-validate on initial mount if cart has saved items, and whenever cart/checkout opens or items change
  useEffect(() => {
    if (items.length === 0) {
      setValidatedData(null);
      setCartWarnings([]);
      setRevalidationError(null);
      return;
    }

    const hasMissingPriceSnapshot = items.some((it) => !it.unitPrice || it.unitPrice <= 0);
    if (isCartOpen || isCheckoutOpen || !validatedData || hasMissingPriceSnapshot) {
      revalidateCart();
    }
  }, [items, isCartOpen, isCheckoutOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open/Close handlers
  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);

  const openCheckout = useCallback(() => {
    if (itemsRef.current.length === 0) return;
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  }, []);

  const closeCheckout = useCallback(() => setIsCheckoutOpen(false), []);

  // Add Item to cart with optional immediate product price snapshot
  const addToCart = useCallback(
    (
      productId: string,
      variantId?: string | null,
      quantity = 1,
      productName?: string,
      snapshot?: AddToCartSnapshot
    ) => {
      const safeAddQty = sanitizeQuantity(quantity, 1, 99);
      const normVariantId = variantId || null;

      setItems((prev) => {
        const existingIndex = prev.findIndex(
          (it) => it.productId === productId && (it.variantId || null) === normVariantId
        );

        if (existingIndex > -1) {
          const updated = [...prev];
          const existing = updated[existingIndex];
          const maxQty = existing.maxAvailableQuantity || snapshot?.maxAvailableQuantity || 99;
          const newQty = sanitizeQuantity(existing.quantity + safeAddQty, 1, maxQty);
          updated[existingIndex] = {
            ...existing,
            quantity: newQty,
            productName: productName || existing.productName,
            variantName: snapshot?.variantName !== undefined ? snapshot.variantName : existing.variantName,
            imageUrl: snapshot?.imageUrl !== undefined ? snapshot.imageUrl : existing.imageUrl,
            unitPrice:
              snapshot?.unitPrice !== undefined && snapshot.unitPrice > 0
                ? toSafePrice(snapshot.unitPrice)
                : existing.unitPrice,
            originalPrice:
              snapshot?.originalPrice !== undefined ? snapshot.originalPrice : existing.originalPrice,
            hasDiscount:
              snapshot?.hasDiscount !== undefined ? snapshot.hasDiscount : existing.hasDiscount,
          };
          return updated;
        }

        return [
          ...prev,
          {
            productId,
            variantId: normVariantId,
            quantity: safeAddQty,
            productName,
            variantName: snapshot?.variantName ?? null,
            imageUrl: snapshot?.imageUrl ?? null,
            unitPrice: snapshot?.unitPrice !== undefined ? toSafePrice(snapshot.unitPrice) : undefined,
            originalPrice:
              snapshot?.originalPrice !== undefined && snapshot.originalPrice !== null
                ? parsePrice(snapshot.originalPrice)
                : null,
            hasDiscount: Boolean(snapshot?.hasDiscount),
            maxAvailableQuantity: snapshot?.maxAvailableQuantity ?? 99,
          },
        ];
      });

      setAddedToast({
        show: true,
        message: 'Item adicionado ao carrinho!',
        productName,
      });

      setTimeout(() => {
        setAddedToast((current) => (current ? { ...current, show: false } : null));
      }, 3000);
    },
    []
  );

  // Remove item
  const removeFromCart = useCallback((productId: string, variantId?: string | null) => {
    const normVariantId = variantId || null;
    setItems((prev) =>
      prev.filter((it) => !(it.productId === productId && (it.variantId || null) === normVariantId))
    );
  }, []);

  // Update item quantity with immediate recalculation
  const updateQuantity = useCallback(
    (productId: string, variantId: string | null | undefined, quantity: number) => {
      const numericQty = Number(quantity);
      if (!Number.isFinite(numericQty) || numericQty <= 0) {
        removeFromCart(productId, variantId);
        return;
      }

      const normVariantId = variantId || null;
      setItems((prev) =>
        prev.map((it) => {
          if (it.productId === productId && (it.variantId || null) === normVariantId) {
            const maxQty = it.maxAvailableQuantity || 99;
            return { ...it, quantity: sanitizeQuantity(numericQty, 1, maxQty) };
          }
          return it;
        })
      );
    },
    [removeFromCart]
  );

  // Clear cart
  const clearCart = useCallback(() => {
    reqIdRef.current++;
    setItems([]);
    setValidatedData(null);
    setCartWarnings([]);
    setRevalidationError(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore
    }
  }, [storageKey]);

  // Order completion
  const setOrderCompleted = useCallback(
    (order: Order, url: string) => {
      setCompletedOrder(order);
      setWhatsappUrl(url);
      setIsCheckoutOpen(false);
      setIsCartOpen(false);
      clearCart();
    },
    [clearCart]
  );

  const closeOrderSuccess = useCallback(() => {
    setCompletedOrder(null);
    setWhatsappUrl(null);
  }, []);

  return (
    <CartContext.Provider
      value={{
        items,
        displayItems,
        subtotal,
        itemCount,
        validatedData: effectiveValidatedData,
        isValidating,
        revalidationError,
        isCartOpen,
        isCheckoutOpen,
        completedOrder,
        whatsappUrl,
        cartWarnings,
        addedToast,
        openCart,
        closeCart,
        openCheckout,
        closeCheckout,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        revalidateCart,
        setOrderCompleted,
        closeOrderSuccess,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

const defaultCartContext: CartContextType = {
  items: [],
  displayItems: [],
  subtotal: 0,
  itemCount: 0,
  validatedData: null,
  isValidating: false,
  revalidationError: null,
  isCartOpen: false,
  isCheckoutOpen: false,
  completedOrder: null,
  whatsappUrl: null,
  cartWarnings: [],
  addedToast: null,
  openCart: () => {},
  closeCart: () => {},
  openCheckout: () => {},
  closeCheckout: () => {},
  addToCart: () => {},
  updateQuantity: () => {},
  removeFromCart: () => {},
  clearCart: () => {},
  revalidateCart: async () => null,
  setOrderCompleted: () => {},
  closeOrderSuccess: () => {},
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  return context || defaultCartContext;
};
