import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  CartItemInput,
  ValidatedCartItem,
  ValidatedCartResponse,
  Order,
  FulfillmentType,
  DeliveryQuoteResponse,
  DeliverySettings,
  DeliveryRule,
} from '../types/order';
import { Tenant } from '../types/saas';
import { api } from '../services/api';
import { parsePrice, toSafePrice, sanitizeQuantity } from '../utils/currency';
import { buildAuthoritativeCartItems, calculateCartTotals } from '../utils/cartCalculator';
import {
  calculateComprehensiveDeliveryQuote,
  normalizeCep,
  calculateStraightLineDistanceKm,
  hasValidCoordinates,
  normalizeDeliveryText,
} from '../utils/deliveryFeeCalculator';

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

export interface CustomerDeliveryAddressInput {
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  reference: string;
  selectedRuleId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

const EMPTY_CUSTOMER_ADDRESS: CustomerDeliveryAddressInput = {
  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  reference: '',
  selectedRuleId: null,
  latitude: null,
  longitude: null,
};

export function getDeliveryCalculationKey(
  slug: string,
  fulfillmentType: string,
  address: CustomerDeliveryAddressInput,
  subtotal: number,
  deliverySettings?: DeliverySettings | null
): string {
  if (fulfillmentType === 'pickup') {
    return `${slug}|pickup`;
  }
  const cleanCep = normalizeCep(address.cep);
  const normStreet = normalizeDeliveryText(address.street);
  const normNum = (address.number || '').trim().toLowerCase();
  const normNeigh = normalizeDeliveryText(address.neighborhood);
  const normCity = normalizeDeliveryText(address.city);
  const normState = (address.state || '').trim().toUpperCase();
  const ruleId = address.selectedRuleId || '';
  const freeAbove = deliverySettings?.freeDeliveryAbove || 0;
  const isFreeTier = freeAbove > 0 && subtotal >= freeAbove;
  return `${slug}|${fulfillmentType}|${cleanCep}|${normStreet}|${normNum}|${normNeigh}|${normCity}|${normState}|${ruleId}|${isFreeTier ? 'FREE' : subtotal.toFixed(2)}`;
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
  // Delivery & Fulfillment state shared between Cart and Checkout
  fulfillmentType: FulfillmentType;
  setFulfillmentType: (type: FulfillmentType) => void;
  deliveryAddress: CustomerDeliveryAddressInput;
  updateDeliveryAddress: (patch: Partial<CustomerDeliveryAddressInput>) => void;
  deliveryQuote: DeliveryQuoteResponse | null;
  isCalculatingDelivery: boolean;
  deliveryQuoteError: string | null;
  refreshDeliveryQuote: (
    overrideAddr?: Partial<CustomerDeliveryAddressInput>,
    forceRefresh?: boolean
  ) => Promise<DeliveryQuoteResponse | null>;
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
    const variantId =
      typeof it.variantId === 'string' && it.variantId.trim() ? it.variantId.trim() : null;
    const key = `${it.productId.trim()}_${variantId || 'base'}`;

    const unitPrice =
      it.unitPrice !== undefined && it.unitPrice !== null ? parsePrice(it.unitPrice) : undefined;
    const originalPrice =
      it.originalPrice !== undefined && it.originalPrice !== null
        ? parsePrice(it.originalPrice)
        : null;

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
  const addressStorageKey = `localhub_delivery_addr_${tenant.slug}`;

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

  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState<CustomerDeliveryAddressInput>(() => {
    try {
      const saved = localStorage.getItem(addressStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return { ...EMPTY_CUSTOMER_ADDRESS, ...parsed };
        }
      }
    } catch {
      // Ignore
    }
    return EMPTY_CUSTOMER_ADDRESS;
  });

  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuoteResponse | null>(null);
  const [isCalculatingDelivery, setIsCalculatingDelivery] = useState(false);
  const [deliveryQuoteError, setDeliveryQuoteError] = useState<string | null>(null);

  const [validatedData, setValidatedData] = useState<ValidatedCartResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [revalidationError, setRevalidationError] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [cartWarnings, setCartWarnings] = useState<string[]>([]);
  const [addedToast, setAddedToast] = useState<CartToast | null>(null);

  const reqIdRef = useRef(0);
  const quoteReqIdRef = useRef(0);
  const quoteAbortControllerRef = useRef<AbortController | null>(null);
  const quoteSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightQuoteCountRef = useRef(0);
  const lastCalculatedKeyRef = useRef<string>('');
  const calculatedQuoteCacheRef = useRef<Map<string, DeliveryQuoteResponse>>(new Map());

  const itemsRef = useRef<CartItemInput[]>(items);
  itemsRef.current = items;
  const addressRef = useRef<CustomerDeliveryAddressInput>(deliveryAddress);
  addressRef.current = deliveryAddress;
  const validatedDataRef = useRef<ValidatedCartResponse | null>(validatedData);
  validatedDataRef.current = validatedData;
  const subtotalRef = useRef<number>(0);
  const fulfillmentTypeRef = useRef<FulfillmentType>(fulfillmentType);
  fulfillmentTypeRef.current = fulfillmentType;

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // Ignore
    }
  }, [items, storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(addressStorageKey, JSON.stringify(deliveryAddress));
    } catch {
      // Ignore
    }
  }, [deliveryAddress, addressStorageKey]);

  const updateDeliveryAddress = useCallback((patch: Partial<CustomerDeliveryAddressInput>) => {
    setDeliveryAddress((prev) => ({ ...prev, ...patch }));
  }, []);

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
  subtotalRef.current = subtotal;

  const effectiveValidatedData = useMemo<ValidatedCartResponse | null>(() => {
    if (!validatedData) return null;
    return {
      ...validatedData,
      items: displayItems,
      subtotal,
      itemCount,
    };
  }, [validatedData, displayItems, subtotal, itemCount]);

  // Set default fulfillmentType when deliverySettings arrive
  useEffect(() => {
    const ds = validatedData?.deliverySettings;
    if (!ds) return;
    if (ds.deliveryEnabled && !ds.pickupEnabled) {
      setFulfillmentType('delivery');
    } else if (ds.pickupEnabled && !ds.deliveryEnabled) {
      setFulfillmentType('pickup');
    }
  }, [validatedData?.deliverySettings]);

  // Clean up any pending abort controllers or safety timers on unmount
  useEffect(() => {
    return () => {
      quoteAbortControllerRef.current?.abort();
      if (quoteSafetyTimerRef.current) {
        clearTimeout(quoteSafetyTimerRef.current);
      }
    };
  }, []);

  // Calculate delivery quote via backend API (with resilient local fallback and strict deduplication)
  const refreshDeliveryQuote = useCallback(
    async (
      overrideAddr?: Partial<CustomerDeliveryAddressInput>,
      forceRefresh = false
    ): Promise<DeliveryQuoteResponse | null> => {
      const targetFulfillment = fulfillmentTypeRef.current;
      const addr = { ...addressRef.current, ...(overrideAddr || {}) };
      const currentSubtotal = subtotalRef.current;
      const currentSettings = validatedDataRef.current?.deliverySettings;

      if (targetFulfillment === 'pickup') {
        if (quoteAbortControllerRef.current) {
          quoteAbortControllerRef.current.abort();
          quoteAbortControllerRef.current = null;
        }
        if (quoteSafetyTimerRef.current) {
          clearTimeout(quoteSafetyTimerRef.current);
          quoteSafetyTimerRef.current = null;
        }
        inFlightQuoteCountRef.current = 0;
        lastCalculatedKeyRef.current = `${tenant.slug}|pickup`;
        setDeliveryQuote(null);
        setDeliveryQuoteError(null);
        setIsCalculatingDelivery(false);
        return null;
      }

      const cleanCep = normalizeCep(addr.cep);
      const hasMinimumFields =
        cleanCep.length === 8 ||
        Boolean(addr.neighborhood?.trim() && addr.city?.trim() && addr.state?.trim()) ||
        Boolean(addr.street?.trim() && addr.city?.trim() && addr.state?.trim());

      if (!hasMinimumFields) {
        if (quoteAbortControllerRef.current) {
          quoteAbortControllerRef.current.abort();
          quoteAbortControllerRef.current = null;
        }
        if (quoteSafetyTimerRef.current) {
          clearTimeout(quoteSafetyTimerRef.current);
          quoteSafetyTimerRef.current = null;
        }
        inFlightQuoteCountRef.current = 0;
        lastCalculatedKeyRef.current = '';
        setDeliveryQuote(null);
        setDeliveryQuoteError(null);
        setIsCalculatingDelivery(false);
        return null;
      }

      const calcKey = getDeliveryCalculationKey(
        tenant.slug,
        targetFulfillment,
        addr,
        currentSubtotal,
        currentSettings
      );

      // Deduplication: if already calculated for this exact key and not forced, reuse existing quote
      if (!forceRefresh) {
        if (lastCalculatedKeyRef.current === calcKey) {
          const cached = calculatedQuoteCacheRef.current.get(calcKey);
          if (cached) {
            setDeliveryQuote(cached);
            setDeliveryQuoteError(null);
            setIsCalculatingDelivery(false);
            return cached;
          }
        }
        if (calculatedQuoteCacheRef.current.has(calcKey)) {
          const cached = calculatedQuoteCacheRef.current.get(calcKey)!;
          lastCalculatedKeyRef.current = calcKey;
          setDeliveryQuote(cached);
          setDeliveryQuoteError(null);
          setIsCalculatingDelivery(false);
          return cached;
        }
      }

      // Fast-path: In pure neighborhood pricing mode with in-memory rules, resolve synchronously
      if (currentSettings && (currentSettings.pricingMode || 'neighborhood') === 'neighborhood') {
        const rules = validatedDataRef.current?.deliveryRules || [];
        if (rules.length > 0) {
          const localQuote = calculateComprehensiveDeliveryQuote({
            fulfillmentType: 'delivery',
            subtotal: currentSubtotal,
            deliverySettings: currentSettings,
            deliveryRules: rules,
            address: addr,
            selectedRuleId: addr.selectedRuleId || null,
          });
          if (
            localQuote.isCovered ||
            localQuote.errorCode === 'AMBIGUOUS_NEIGHBORHOOD' ||
            localQuote.errorCode === 'NEIGHBORHOOD_NOT_FOUND'
          ) {
            calculatedQuoteCacheRef.current.set(calcKey, localQuote);
            lastCalculatedKeyRef.current = calcKey;
            setDeliveryQuote(localQuote);
            setDeliveryQuoteError(null);
            setIsCalculatingDelivery(false);
            return localQuote;
          }
        }
      }

      // Abort any prior in-flight calculation to prevent race conditions and network waste
      if (quoteAbortControllerRef.current) {
        quoteAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      quoteAbortControllerRef.current = controller;

      const thisQuoteId = ++quoteReqIdRef.current;
      inFlightQuoteCountRef.current++;

      // Emergency safety watchdog: guarantee that isCalculatingDelivery NEVER hangs indefinitely
      if (quoteSafetyTimerRef.current) {
        clearTimeout(quoteSafetyTimerRef.current);
      }
      quoteSafetyTimerRef.current = setTimeout(() => {
        if (thisQuoteId === quoteReqIdRef.current) {
          console.warn('[DELIVERY] Quote safety timeout triggered after 7s');
          setIsCalculatingDelivery(false);
          setDeliveryQuoteError(
            (prev) => prev || 'O cálculo do frete demorou mais que o esperado. Clique em "Tentar Novamente" abaixo.'
          );
        }
      }, 7000);

      try {
        setIsCalculatingDelivery(true);
        setDeliveryQuoteError(null);

        const res = await api.calculateDeliveryQuote(
          tenant.slug,
          {
            address: {
              cep: cleanCep,
              street: addr.street,
              number: addr.number,
              complement: addr.complement,
              neighborhood: addr.neighborhood,
              city: addr.city,
              state: addr.state,
              latitude: addr.latitude ?? null,
              longitude: addr.longitude ?? null,
            },
            subtotal: currentSubtotal,
            selectedRuleId: addr.selectedRuleId || null,
          },
          controller.signal
        );

        if (thisQuoteId === quoteReqIdRef.current) {
          calculatedQuoteCacheRef.current.set(calcKey, res);
          lastCalculatedKeyRef.current = calcKey;
          setDeliveryQuote(res);
          setDeliveryQuoteError(null);
          return res;
        }
        return null;
      } catch (err: any) {
        if (err?.name === 'AbortError' || controller.signal.aborted) {
          return null;
        }

        if (thisQuoteId === quoteReqIdRef.current) {
          if (currentSettings) {
            let calculatedDistanceKm: number | null = null;
            if ((currentSettings.pricingMode || 'neighborhood') === 'km' && currentSettings.originAddress) {
              const origin = currentSettings.originAddress;
              if (
                addr.street &&
                origin.street &&
                normalizeDeliveryText(addr.street) === normalizeDeliveryText(origin.street) &&
                normalizeDeliveryText(addr.city) === normalizeDeliveryText(origin.city)
              ) {
                calculatedDistanceKm = 0.2;
              } else if (hasValidCoordinates(origin) && hasValidCoordinates(addr)) {
                calculatedDistanceKm =
                  Math.round(
                    calculateStraightLineDistanceKm(origin.latitude, origin.longitude, addr.latitude!, addr.longitude!) *
                      1.25 *
                      100
                  ) / 100;
              }
            }

            const localQuote = calculateComprehensiveDeliveryQuote({
              fulfillmentType: 'delivery',
              subtotal: currentSubtotal,
              deliverySettings: currentSettings,
              deliveryRules: validatedDataRef.current?.deliveryRules || [],
              address: addr,
              selectedRuleId: addr.selectedRuleId || null,
              calculatedDistanceKm,
              distanceMethodUsed: 'road_route',
            });

            if (localQuote.isCovered) {
              calculatedQuoteCacheRef.current.set(calcKey, localQuote);
              lastCalculatedKeyRef.current = calcKey;
              setDeliveryQuote(localQuote);
              setDeliveryQuoteError(null);
              return localQuote;
            }
          }

          setDeliveryQuoteError(
            err?.message || 'Não foi possível calcular o frete para o endereço informado no momento. Tente novamente.'
          );
        }
        return null;
      } finally {
        inFlightQuoteCountRef.current = Math.max(0, inFlightQuoteCountRef.current - 1);
        if (thisQuoteId === quoteReqIdRef.current || inFlightQuoteCountRef.current === 0) {
          if (quoteSafetyTimerRef.current) {
            clearTimeout(quoteSafetyTimerRef.current);
            quoteSafetyTimerRef.current = null;
          }
          setIsCalculatingDelivery(false);
          if (quoteAbortControllerRef.current === controller) {
            quoteAbortControllerRef.current = null;
          }
        }
      }
    },
    [tenant.slug]
  );

  // Debounced auto-calculation when address or subtotal changes in delivery mode
  useEffect(() => {
    if (fulfillmentType !== 'delivery' || items.length === 0) {
      if (quoteAbortControllerRef.current) {
        quoteAbortControllerRef.current.abort();
        quoteAbortControllerRef.current = null;
      }
      setDeliveryQuote(null);
      setDeliveryQuoteError(null);
      setIsCalculatingDelivery(false);
      lastCalculatedKeyRef.current = '';
      return;
    }

    const cleanCep = normalizeCep(deliveryAddress.cep);
    const hasAddressInput =
      cleanCep.length === 8 ||
      Boolean(deliveryAddress.neighborhood.trim() && deliveryAddress.city.trim());

    if (!hasAddressInput) {
      setDeliveryQuote(null);
      setDeliveryQuoteError(null);
      setIsCalculatingDelivery(false);
      lastCalculatedKeyRef.current = '';
      return;
    }

    const currentKey = getDeliveryCalculationKey(
      tenant.slug,
      'delivery',
      deliveryAddress,
      subtotal,
      validatedData?.deliverySettings
    );

    // If key hasn't changed and quote is already present, do not recalculate!
    if (currentKey === lastCalculatedKeyRef.current && deliveryQuote) {
      return;
    }

    const timer = setTimeout(() => {
      refreshDeliveryQuote();
    }, 350);

    return () => clearTimeout(timer);
  }, [
    fulfillmentType,
    deliveryAddress.cep,
    deliveryAddress.street,
    deliveryAddress.number,
    deliveryAddress.neighborhood,
    deliveryAddress.city,
    deliveryAddress.state,
    deliveryAddress.selectedRuleId,
    subtotal,
    items.length,
    tenant.slug,
    validatedData?.deliverySettings?.updatedAt,
  ]);

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

        setItems((prev) => {
          const next: CartItemInput[] = [];
          for (const localIt of prev) {
            const key = `${localIt.productId}_${localIt.variantId || 'base'}`;
            const serverIt = serverMap.get(key);
            if (serverIt) {
              const maxStock = sanitizeQuantity(serverIt.maxAvailableQuantity ?? 99, 1, 99);
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
                originalPrice:
                  serverIt.originalPrice !== null ? parsePrice(serverIt.originalPrice) : null,
                hasDiscount: Boolean(serverIt.hasDiscount),
                maxAvailableQuantity: maxStock,
              });
            } else if (thisReqId !== reqIdRef.current) {
              next.push(localIt);
            }
          }
          return next;
        });

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

        // Pre-fill default city/state from store's originAddress if customer hasn't typed city/state yet
        if (res.deliverySettings?.originAddress?.city) {
          setDeliveryAddress((prev) => ({
            ...prev,
            city: prev.city || res.deliverySettings?.originAddress?.city || '',
            state: prev.state || res.deliverySettings?.originAddress?.state || '',
          }));
        }

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

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);

  const openCheckout = useCallback(() => {
    if (itemsRef.current.length === 0) return;
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  }, []);

  const closeCheckout = useCallback(() => setIsCheckoutOpen(false), []);

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
            variantName:
              snapshot?.variantName !== undefined ? snapshot.variantName : existing.variantName,
            imageUrl: snapshot?.imageUrl !== undefined ? snapshot.imageUrl : existing.imageUrl,
            unitPrice:
              snapshot?.unitPrice !== undefined && snapshot.unitPrice > 0
                ? toSafePrice(snapshot.unitPrice)
                : existing.unitPrice,
            originalPrice:
              snapshot?.originalPrice !== undefined
                ? snapshot.originalPrice
                : existing.originalPrice,
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
            unitPrice:
              snapshot?.unitPrice !== undefined ? toSafePrice(snapshot.unitPrice) : undefined,
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

  const removeFromCart = useCallback((productId: string, variantId?: string | null) => {
    const normVariantId = variantId || null;
    setItems((prev) =>
      prev.filter((it) => !(it.productId === productId && (it.variantId || null) === normVariantId))
    );
  }, []);

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
        fulfillmentType,
        setFulfillmentType,
        deliveryAddress,
        updateDeliveryAddress,
        deliveryQuote,
        isCalculatingDelivery,
        deliveryQuoteError,
        refreshDeliveryQuote,
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
  fulfillmentType: 'pickup',
  setFulfillmentType: () => {},
  deliveryAddress: EMPTY_CUSTOMER_ADDRESS,
  updateDeliveryAddress: () => {},
  deliveryQuote: null,
  isCalculatingDelivery: false,
  deliveryQuoteError: null,
  refreshDeliveryQuote: async () => null,
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
