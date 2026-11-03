import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  Utensils,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MessageSquare,
  User as UserIcon,
  Layers,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Lock,
} from 'lucide-react';
import {
  Product,
  ProductCategory,
  ProductVariant,
  DayOfWeek,
} from '../../../types/product';
import {
  RestaurantOrder,
  RestaurantSession,
  RestaurantTable,
} from '../../../types/restaurant';
import { api } from '../../../services/api';

function getCurrentDayOfWeek(): DayOfWeek {
  return new Date().getDay() as DayOfWeek;
}

function isProductAvailableOnDay(
  product: Product,
  day: DayOfWeek,
  channel: 'table' | 'delivery'
): boolean {
  const cfg = product.availabilityDays;
  if (!cfg) return true;
  const days =
    channel === 'table' || cfg.sameChannels
      ? cfg.tableDays
      : cfg.deliveryDays;
  if (!Array.isArray(days) || days.length === 0) return true;
  return days.includes(day);
}

interface AddTableOrderModalProps {
  isOpen: boolean;
  table: RestaurantTable | null;
  sessionId?: string | null;
  sessionCode?: string | null;
  currentSessionTotal?: number;
  onClose: () => void;
  onOrderAdded: (order: RestaurantOrder, session: RestaurantSession) => void;
}

interface CartItemDraft {
  key: string;
  productId: string;
  variantId?: string | null;
  productName: string;
  variantName?: string | null;
  imageUrl?: string | null;
  unitPrice: number;
  quantity: number;
  maxStock?: number | null;
  notes: string;
}

export const AddTableOrderModal: React.FC<AddTableOrderModalProps> = ({
  isOpen,
  table,
  sessionId,
  sessionCode,
  currentSessionTotal = 0,
  onClose,
  onOrderAdded,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [liveSession, setLiveSession] = useState<RestaurantSession | null>(null);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);
  const [isSessionUnavailable, setIsSessionUnavailable] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedVariantsByProduct, setSelectedVariantsByProduct] = useState<Record<string, string>>({});
  const [draftQuantityByProduct, setDraftQuantityByProduct] = useState<Record<string, number>>({});
  const [draftNotesByProduct, setDraftNotesByProduct] = useState<Record<string, string>>({});
  const [expandedNotesProductId, setExpandedNotesProductId] = useState<string | null>(null);
  const [expandedNameProductIds, setExpandedNameProductIds] = useState<Record<string, boolean>>({});
  const [failedImageIds, setFailedImageIds] = useState<Record<string, boolean>>({});

  const [cart, setCart] = useState<CartItemDraft[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [isSummaryExpandedMobile, setIsSummaryExpandedMobile] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedToast, setAddedToast] = useState<string | null>(null);
  const [confirmedOrderInfo, setConfirmedOrderInfo] = useState<{ orderNumber: number } | null>(null);
  const [idempotencySeed, setIdempotencySeed] = useState<string>('');

  const toastTimeoutRef = useRef<number | null>(null);
  const currentDay = useMemo(() => getCurrentDayOfWeek(), []);

  const loadCatalogAndSession = useCallback(async () => {
    if (!table) return;
    setIsLoadingCatalog(true);
    setCatalogLoadError(null);
    setError(null);

    try {
      const [prods, cats, sessionData] = await Promise.all([
        api.getProducts({ isActive: true }),
        api.getCategories(),
        api.getTableSession(table.id).catch(() => null),
      ]);

      const activeProducts = (prods || []).filter((p) => p.isActive);
      setProducts(activeProducts);
      setCategories((cats || []).filter((c) => c.isActive));

      if (sessionData) {
        setLiveSession(sessionData);
        if (sessionData.status === 'closed' || Boolean(sessionData.closedAt)) {
          setIsSessionUnavailable(true);
        } else {
          setIsSessionUnavailable(false);
        }
      } else if (!sessionId && !table.currentSessionId) {
        setIsSessionUnavailable(true);
      }

      setSelectedVariantsByProduct((prev) => {
        const next = { ...prev };
        for (const p of activeProducts) {
          if (!next[p.id]) {
            const activeVars = (p.variants || []).filter((v) => v.isActive);
            if (activeVars.length > 0) {
              next[p.id] = activeVars[0].id;
            }
          }
        }
        return next;
      });
    } catch (err: any) {
      setCatalogLoadError(
        err.message || 'Falha de conexão ao carregar o catálogo de produtos.'
      );
    } finally {
      setIsLoadingCatalog(false);
    }
  }, [table, sessionId]);

  useEffect(() => {
    if (!isOpen || !table) return;

    setSearchQuery('');
    setSelectedCategoryId('all');
    setCart([]);
    setCustomerName('');
    setOrderNotes('');
    setError(null);
    setCatalogLoadError(null);
    setAddedToast(null);
    setConfirmedOrderInfo(null);
    setIsSessionUnavailable(false);
    setLiveSession(null);
    setExpandedNotesProductId(null);
    setExpandedNameProductIds({});
    setIsSummaryExpandedMobile(false);
    setIdempotencySeed(`${table.id}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

    loadCatalogAndSession();

    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [isOpen, table, loadCatalogAndSession]);

  const triggerAddedToast = (message: string) => {
    setAddedToast(message);
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setAddedToast(null);
    }, 2400);
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  const getProductEffectivePrice = (product: Product, variant?: ProductVariant | null): number => {
    if (variant) {
      if (
        variant.promotionalPrice !== null &&
        variant.promotionalPrice !== undefined &&
        Number(variant.promotionalPrice) > 0
      ) {
        return Number(variant.promotionalPrice);
      }
      return Number(variant.price || 0);
    }
    if (
      product.promotionalPrice !== null &&
      product.promotionalPrice !== undefined &&
      Number(product.promotionalPrice) > 0
    ) {
      return Number(product.promotionalPrice);
    }
    return Number(product.price || 0);
  };

  const evaluateProductAvailability = (
    product: Product,
    variant?: ProductVariant | null
  ): { available: boolean; reason?: string; maxStock?: number | null } => {
    if (!product.isActive) {
      return { available: false, reason: 'Inativo' };
    }
    if (product.priceOnRequest) {
      return { available: false, reason: 'Preço sob consulta' };
    }
    if (!isProductAvailableOnDay(product, currentDay, 'table')) {
      return { available: false, reason: 'Indisponível hoje na mesa' };
    }
    if (variant) {
      if (!variant.isActive) {
        return { available: false, reason: 'Variação inativa' };
      }
      if (variant.stockQuantity !== null && variant.stockQuantity !== undefined) {
        if (Number(variant.stockQuantity) <= 0 && !product.allowOutOfStock) {
          return { available: false, reason: 'Variação esgotada', maxStock: 0 };
        }
        return {
          available: true,
          maxStock: product.allowOutOfStock ? null : Number(variant.stockQuantity),
        };
      }
      return { available: true, maxStock: null };
    }
    if (product.trackStock && !product.allowOutOfStock) {
      const stock = Number(product.stockQuantity ?? 0);
      if (stock <= 0) {
        return { available: false, reason: 'Esgotado', maxStock: 0 };
      }
      return { available: true, maxStock: stock };
    }
    return { available: true, maxStock: null };
  };

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) {
        return false;
      }
      if (q) {
        const matchName = p.name.toLowerCase().includes(q);
        const matchDesc = (p.shortDescription || '').toLowerCase().includes(q);
        const matchCat = (p.category?.name || '').toLowerCase().includes(q);
        const matchSku = (p.sku || '').toLowerCase().includes(q);
        return matchName || matchDesc || matchCat || matchSku;
      }
      return true;
    });
  }, [products, selectedCategoryId, searchQuery]);

  const handleAddProductToCart = (product: Product) => {
    setError(null);
    if (isSessionUnavailable) {
      setError('A sessão desta mesa está encerrada ou indisponível.');
      return;
    }

    const activeVariants = (product.variants || []).filter((v) => v.isActive);
    const chosenVariantId = selectedVariantsByProduct[product.id];
    const chosenVariant =
      activeVariants.length > 0
        ? activeVariants.find((v) => v.id === chosenVariantId) || null
        : null;

    if (activeVariants.length > 0 && !chosenVariant) {
      setError(`Selecione uma opção/variação válida para "${product.name}".`);
      return;
    }

    const availability = evaluateProductAvailability(product, chosenVariant);
    if (!availability.available) {
      setError(`O produto "${product.name}" não pode ser adicionado: ${availability.reason}.`);
      return;
    }

    const unitPrice = getProductEffectivePrice(product, chosenVariant);
    if (unitPrice <= 0) {
      setError(`O produto "${product.name}" não possui preço válido para venda.`);
      return;
    }

    const qtyToAdd = Math.max(1, Number(draftQuantityByProduct[product.id] || 1));
    const itemNotes = (draftNotesByProduct[product.id] || '').trim();
    const itemKey = `${product.id}::${chosenVariant?.id || 'base'}::${itemNotes.toLowerCase()}`;

    let stockExceeded = false;
    setCart((prev) => {
      const existingIdx = prev.findIndex((c) => c.key === itemKey);
      if (existingIdx >= 0) {
        const existing = prev[existingIdx];
        const nextQty = existing.quantity + qtyToAdd;
        if (availability.maxStock !== null && availability.maxStock !== undefined && nextQty > availability.maxStock) {
          stockExceeded = true;
          return prev;
        }
        const updated = [...prev];
        updated[existingIdx] = {
          ...existing,
          quantity: nextQty,
        };
        return updated;
      }

      if (availability.maxStock !== null && availability.maxStock !== undefined && qtyToAdd > availability.maxStock) {
        stockExceeded = true;
        return prev;
      }

      const primaryImg =
        product.primaryImage?.publicUrl ||
        product.images?.find((img) => img.isPrimary)?.publicUrl ||
        product.images?.[0]?.publicUrl ||
        null;

      return [
        ...prev,
        {
          key: itemKey,
          productId: product.id,
          variantId: chosenVariant?.id || null,
          productName: product.name,
          variantName: chosenVariant?.name || null,
          imageUrl: primaryImg,
          unitPrice,
          quantity: qtyToAdd,
          maxStock: availability.maxStock,
          notes: itemNotes,
        },
      ];
    });

    if (stockExceeded) {
      setError(`Estoque máximo atingido para "${product.name}" (${availability.maxStock} un.).`);
      return;
    }

    triggerAddedToast(
      `${qtyToAdd}x ${product.name}${chosenVariant ? ` (${chosenVariant.name})` : ''} adicionado ao pedido`
    );

    setDraftQuantityByProduct((prev) => ({ ...prev, [product.id]: 1 }));
    setDraftNotesByProduct((prev) => ({ ...prev, [product.id]: '' }));
    if (expandedNotesProductId === product.id) {
      setExpandedNotesProductId(null);
    }
    setIdempotencySeed(`${table?.id || 'tbl'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  };

  const handleUpdateCartQuantity = (key: string, delta: number) => {
    setError(null);
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.key !== key) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;
          if (item.maxStock !== null && item.maxStock !== undefined && nextQty > item.maxStock) {
            setError(`Estoque máximo atingido para "${item.productName}" (${item.maxStock} un.).`);
            return item;
          }
          return { ...item, quantity: nextQty };
        })
        .filter(Boolean) as CartItemDraft[]
    );
    setIdempotencySeed(`${table?.id || 'tbl'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  };

  const handleUpdateCartItemNotes = (key: string, notes: string) => {
    setCart((prev) =>
      prev.map((item) => (item.key === key ? { ...item, notes } : item))
    );
    setIdempotencySeed(`${table?.id || 'tbl'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  };

  const handleRemoveCartItem = (key: string) => {
    setCart((prev) => prev.filter((item) => item.key !== key));
    setIdempotencySeed(`${table?.id || 'tbl'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  };

  const newOrderSubtotal = useMemo(
    () =>
      Math.round(
        cart.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0) * 100
      ) / 100,
    [cart]
  );

  const totalItemsCount = useMemo(
    () => cart.reduce((acc, item) => acc + item.quantity, 0),
    [cart]
  );

  // Financial breakdown calculations
  const financialBreakdown = useMemo(() => {
    const baseConsumption =
      liveSession !== null
        ? Number(liveSession.totalAmount || 0)
        : Number(currentSessionTotal || 0);

    const existingOrdersSub =
      liveSession?.ordersSubtotal !== undefined
        ? Number(liveSession.ordersSubtotal || 0)
        : baseConsumption;

    const combinedOrdersSubtotal = Math.round((existingOrdersSub + newOrderSubtotal) * 100) / 100;

    let projectedFees = 0;
    if (liveSession?.fees && liveSession.fees.length > 0) {
      for (const f of liveSession.fees) {
        if (f.type === 'percentage') {
          projectedFees += Math.round(combinedOrdersSubtotal * (Number(f.rateOrAmount || 0) / 100) * 100) / 100;
        } else {
          projectedFees += Number(f.rateOrAmount || 0);
        }
      }
      projectedFees = Math.round(projectedFees * 100) / 100;
    } else if (liveSession?.feesTotal) {
      projectedFees = Number(liveSession.feesTotal || 0);
    }

    const discountAmount = Number(liveSession?.discountAmount || 0);
    const paidAmount = Number(liveSession?.paidAmount || 0);

    const estimatedAccountTotal = liveSession
      ? Math.max(0, Math.round((combinedOrdersSubtotal + projectedFees - discountAmount) * 100) / 100)
      : Math.max(0, Math.round((baseConsumption + newOrderSubtotal) * 100) / 100);

    const estimatedPendingBalance = Math.max(
      0,
      Math.round((estimatedAccountTotal - paidAmount) * 100) / 100
    );

    return {
      currentTableConsumption: baseConsumption,
      existingOrdersSub,
      projectedFees,
      discountAmount,
      paidAmount,
      estimatedAccountTotal,
      estimatedPendingBalance,
    };
  }, [liveSession, currentSessionTotal, newOrderSubtotal]);

  const effectiveSessionCode = liveSession?.sessionCode || sessionCode || null;
  const nextOrderSequence =
    liveSession?.ordersCount !== undefined ? Number(liveSession.ordersCount) + 1 : null;

  const handleSubmitOrder = async () => {
    if (!table || cart.length === 0 || isSubmitting || isSessionUnavailable) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const targetSessionId = liveSession?.id || sessionId || table.currentSessionId || undefined;
      const result = await api.addOrderToTableSession(table.id, {
        sessionId: targetSessionId,
        customerName: customerName.trim() || undefined,
        notes: orderNotes.trim() || undefined,
        idempotencyKey: idempotencySeed,
        items: cart.map((item) => ({
          productId: item.productId,
          variantId: item.variantId || null,
          quantity: item.quantity,
          notes: item.notes.trim() || undefined,
        })),
      });

      setConfirmedOrderInfo({ orderNumber: result.order.orderNumber });

      try {
        window.dispatchEvent(
          new CustomEvent('localhub:restaurant-updated', {
            detail: {
              type: 'ORDER_ADDED_TO_SESSION',
              tableId: table.id,
              sessionId: result.session.id,
              orderId: result.order.id,
              orderNumber: result.order.orderNumber,
            },
          })
        );
        if (typeof BroadcastChannel !== 'undefined') {
          const bc = new BroadcastChannel('localhub_restaurant_sync');
          bc.postMessage({
            type: 'ORDER_ADDED_TO_SESSION',
            tableId: table.id,
            sessionId: result.session.id,
            orderId: result.order.id,
            orderNumber: result.order.orderNumber,
          });
          bc.close();
        }
      } catch {
        // Ignore broadcast errors
      }

      onOrderAdded(result.order, result.session);
      onClose();
    } catch (err: any) {
      const msg = err.message || 'Não foi possível enviar o pedido para a cozinha. Verifique sua conexão e tente novamente.';
      if (
        msg.toLowerCase().includes('encerrada') ||
        msg.toLowerCase().includes('não há nenhuma conta aberta')
      ) {
        setIsSessionUnavailable(true);
      }
      // Keep cart intact on error so waiter never loses selected items
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !table) return null;

  const renderSummaryContent = () => (
    <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
      {cart.length === 0 ? (
        <div className="py-10 px-4 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/60">
          <ShoppingBag className="w-10 h-10 text-slate-300 mb-2.5" />
          <p className="text-[15px] font-bold text-slate-700">
            Nenhum item selecionado
          </p>
          <p className="text-[13px] text-slate-500 mt-1 max-w-xs leading-relaxed">
            Toque em &ldquo;Adicionar&rdquo; nos produtos do catálogo para montar o pedido adicional desta mesa.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cart.map((item) => (
            <div
              key={item.key}
              className="p-3.5 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold text-slate-900 leading-snug break-words">
                    {item.productName}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5 text-[13px] text-slate-500">
                    {item.variantName && (
                      <>
                        <span className="font-semibold text-amber-800">
                          {item.variantName}
                        </span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span className="tabular-nums">
                      {formatCurrency(item.unitPrice)} un.
                    </span>
                  </div>
                </div>
                <span className="text-[16px] font-extrabold text-slate-900 tabular-nums shrink-0">
                  {formatCurrency(item.unitPrice * item.quantity)}
                </span>
              </div>

              {/* Item Notes Input */}
              <input
                type="text"
                value={item.notes}
                onChange={(e) => handleUpdateCartItemNotes(item.key, e.target.value)}
                placeholder="Observação deste item (ex: sem cebola, gelo e limão)..."
                className="w-full min-h-[42px] px-3 py-2 text-[14px] bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-amber-500 outline-none"
              />

              {/* Quantity & Remove Controls with >=44px touch targets */}
              <div className="flex items-center justify-between pt-1 gap-2">
                <div className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-xl p-0.5">
                  <button
                    type="button"
                    onClick={() => handleUpdateCartQuantity(item.key, -1)}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-700 hover:bg-white active:scale-95 transition-all cursor-pointer"
                    title="Diminuir quantidade"
                    aria-label={`Diminuir quantidade de ${item.productName}`}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-9 text-center text-[15px] font-extrabold text-slate-900 tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUpdateCartQuantity(item.key, 1)}
                    disabled={
                      item.maxStock !== null &&
                      item.maxStock !== undefined &&
                      item.quantity >= item.maxStock
                    }
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-700 hover:bg-white disabled:opacity-40 active:scale-95 transition-all cursor-pointer"
                    title="Aumentar quantidade"
                    aria-label={`Aumentar quantidade de ${item.productName}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveCartItem(item.key)}
                  className="min-h-[44px] px-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Remover</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Optional Order Identification & General Notes */}
      {cart.length > 0 && (
        <div className="pt-3 border-t border-slate-200 space-y-3">
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5 text-slate-400" />
              Identificação do cliente na mesa (opcional)
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Ex: João / Cadeira 2"
              className="w-full min-h-[44px] px-3.5 py-2 text-[14px] bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-amber-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
              Observação geral do pedido (opcional)
            </label>
            <input
              type="text"
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="Ex: Trazer junto com as bebidas..."
              className="w-full min-h-[44px] px-3.5 py-2 text-[14px] bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-amber-500 outline-none"
            />
          </div>
        </div>
      )}

      {/* Complete Financial Breakdown of the Session */}
      <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-[14px]">
        <div className="flex items-center justify-between text-slate-600">
          <span>Consumo atual da mesa:</span>
          <span className="font-semibold text-slate-800 tabular-nums">
            {formatCurrency(financialBreakdown.currentTableConsumption)}
          </span>
        </div>

        <div className="flex items-center justify-between text-amber-800 font-bold pt-1.5 border-t border-slate-200/80">
          <span>Subtotal do novo pedido ({totalItemsCount} {totalItemsCount === 1 ? 'item' : 'itens'}):</span>
          <span className="tabular-nums">+ {formatCurrency(newOrderSubtotal)}</span>
        </div>

        {financialBreakdown.projectedFees > 0 && (
          <div className="flex items-center justify-between text-slate-600 text-[13px]">
            <span>Taxas de serviço estimadas:</span>
            <span className="font-semibold tabular-nums">
              + {formatCurrency(financialBreakdown.projectedFees)}
            </span>
          </div>
        )}

        {financialBreakdown.discountAmount > 0 && (
          <div className="flex items-center justify-between text-emerald-700 text-[13px]">
            <span>Descontos aplicados na conta:</span>
            <span className="font-semibold tabular-nums">
              - {formatCurrency(financialBreakdown.discountAmount)}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between text-slate-900 font-extrabold text-[15px] pt-2 border-t border-slate-200">
          <span>Novo total estimado da conta:</span>
          <span className="text-emerald-700 tabular-nums">
            {formatCurrency(financialBreakdown.estimatedAccountTotal)}
          </span>
        </div>

        {financialBreakdown.paidAmount > 0 && (
          <div className="pt-1.5 border-t border-slate-200/70 space-y-1 text-[13px]">
            <div className="flex items-center justify-between text-emerald-700">
              <span>Já recebido (pagamento parcial):</span>
              <span className="font-semibold tabular-nums">
                - {formatCurrency(financialBreakdown.paidAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-800 font-bold">
              <span>Saldo pendente estimado:</span>
              <span className="tabular-nums">
                {formatCurrency(financialBreakdown.estimatedPendingBalance)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col sm:items-center sm:justify-center sm:p-3 lg:p-5 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-table-order-title"
    >
      <div className="bg-white w-full h-[100dvh] max-h-[100dvh] sm:h-[92dvh] sm:max-h-[92dvh] sm:max-w-6xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden sm:border sm:border-slate-200 pt-safe">
        {/* 1. COMPACT HEADER (shrink-0) */}
        <header className="shrink-0 px-3.5 py-2.5 sm:px-5 sm:py-3.5 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-[16px] sm:text-[18px] shrink-0 shadow-xs tabular-nums">
              {table.tableNumber}
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="add-table-order-title"
                className="text-[20px] sm:text-[22px] font-extrabold text-white leading-tight truncate"
              >
                Adicionar itens
              </h2>
              <div className="flex items-center gap-1.5 text-[13px] sm:text-[14px] text-slate-300 mt-0.5 truncate">
                <span className="font-semibold text-amber-300 shrink-0">
                  Mesa {table.tableNumber}
                  {table.name ? ` (${table.name})` : ''}
                </span>
                <span aria-hidden="true" className="text-slate-500 shrink-0">·</span>
                <span className="truncate">
                  {effectiveSessionCode ? `Sessão #${effectiveSessionCode}` : 'Sessão aberta'}
                </span>
                {nextOrderSequence !== null && (
                  <>
                    <span aria-hidden="true" className="text-slate-500 shrink-0">·</span>
                    <span className="text-emerald-300 font-semibold shrink-0">
                      {nextOrderSequence}º pedido
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Fechar janela de adicionar itens"
            title="Fechar"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 active:bg-slate-700 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* STATUS / FEEDBACK BANNERS (shrink-0) */}
        {isSessionUnavailable && (
          <div className="shrink-0 px-3.5 py-2.5 bg-rose-600 text-white flex items-center justify-between gap-2.5 text-[13px] sm:text-[14px] font-semibold">
            <div className="flex items-center gap-2 min-w-0">
              <Lock className="w-4 h-4 shrink-0" />
              <span>
                A sessão desta mesa foi encerrada ou não está mais disponível para novos pedidos.
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[36px] px-3 rounded-lg bg-white text-rose-700 font-bold text-[13px] shrink-0"
            >
              Fechar
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="shrink-0 mx-3.5 mt-2.5 px-3.5 py-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-rose-800 text-[13px] sm:text-[14px] font-semibold"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="flex-1 leading-snug">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dispensar mensagem de erro"
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-100 font-bold shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {addedToast && !error && (
          <div
            role="status"
            aria-live="polite"
            className="shrink-0 mx-3.5 mt-2 px-3.5 py-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-emerald-800 text-[13px] font-bold"
          >
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate">{addedToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsSummaryExpandedMobile(true)}
              className="lg:hidden text-[12px] font-extrabold text-emerald-700 underline shrink-0"
            >
              Ver resumo
            </button>
          </div>
        )}

        {confirmedOrderInfo && (
          <div
            role="status"
            className="shrink-0 mx-3.5 mt-2 px-3.5 py-2.5 bg-emerald-600 text-white rounded-xl flex items-center gap-2 text-[14px] font-bold"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>
              Pedido #{confirmedOrderInfo.orderNumber} confirmado e enviado para a cozinha!
            </span>
          </div>
        )}

        {/* 2. MAIN WORKSPACE: CATALOG + DESKTOP SIDEBAR + MOBILE EXPANDED SHEET */}
        <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 overflow-hidden relative">
          {/* LEFT / MAIN COLUMN: SEARCH + CATEGORIES + SCROLLABLE PRODUCTS */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden lg:col-span-7 xl:col-span-8 lg:border-r lg:border-slate-200 bg-slate-50">
            {/* Search and Horizontal Category Bar (shrink-0, never overlaps product cards) */}
            <div className="shrink-0 px-3.5 py-2.5 sm:px-5 sm:py-3 bg-white border-b border-slate-200 space-y-2.5">
              {/* Search Field */}
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar produto por nome, código ou categoria..."
                  className="w-full min-h-[44px] pl-10 pr-11 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[15px] text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Limpar busca"
                    className="min-w-[44px] min-h-[44px] absolute right-0 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Horizontal Scrollable Category Strip */}
              <div
                className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5"
                role="tablist"
                aria-label="Categorias de produtos"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedCategoryId === 'all'}
                  onClick={() => setSelectedCategoryId('all')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-[13px] sm:text-[14px] font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    selectedCategoryId === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Todos ({products.length})
                </button>
                {categories.map((cat) => {
                  const count = products.filter((p) => p.categoryId === cat.id).length;
                  if (count === 0) return null;
                  const isSelected = selectedCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-[13px] sm:text-[14px] font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {cat.name} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dedicated Scrollable Product List */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3.5 pt-3.5 pb-10 sm:px-5 sm:pt-4 sm:pb-12">
              {isLoadingCatalog ? (
                <div className="py-16 flex flex-col items-center justify-center text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
                  <p className="text-[15px] font-semibold text-slate-700">
                    Carregando catálogo do restaurante...
                  </p>
                </div>
              ) : catalogLoadError ? (
                <div className="py-12 px-5 text-center bg-white rounded-2xl border border-rose-200 max-w-md mx-auto my-4">
                  <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-2.5" />
                  <p className="text-[16px] font-bold text-slate-900">
                    Falha ao carregar os produtos
                  </p>
                  <p className="text-[14px] text-slate-600 mt-1">
                    {catalogLoadError}
                  </p>
                  <button
                    type="button"
                    onClick={loadCatalogAndSession}
                    className="mt-4 min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-[14px] inline-flex items-center gap-2 hover:bg-slate-800 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Tentar novamente
                  </button>
                </div>
              ) : products.length === 0 ? (
                <div className="py-14 px-5 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                  <Utensils className="w-10 h-10 text-slate-300 mx-auto mb-2.5" />
                  <p className="text-[16px] font-bold text-slate-800">
                    Nenhum produto disponível no catálogo
                  </p>
                  <p className="text-[14px] text-slate-500 mt-1">
                    Cadastre ou ative produtos no menu Catálogo de Produtos para lançá-los nas mesas.
                  </p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-12 px-5 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                  <Search className="w-9 h-9 text-slate-300 mx-auto mb-2.5" />
                  <p className="text-[16px] font-bold text-slate-800">
                    Nenhum produto encontrado
                  </p>
                  <p className="text-[14px] text-slate-500 mt-1">
                    Não encontramos produtos para &ldquo;{searchQuery}&rdquo; nesta categoria.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategoryId('all');
                    }}
                    className="mt-4 min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[14px] transition-colors cursor-pointer"
                  >
                    Limpar busca e filtros
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredProducts.map((product) => {
                    const activeVariants = (product.variants || []).filter((v) => v.isActive);
                    const selectedVariantId = selectedVariantsByProduct[product.id];
                    const selectedVariant =
                      activeVariants.length > 0
                        ? activeVariants.find((v) => v.id === selectedVariantId) || activeVariants[0]
                        : null;

                    const availability = evaluateProductAvailability(product, selectedVariant);
                    const effectivePrice = getProductEffectivePrice(product, selectedVariant);
                    const basePrice = selectedVariant
                      ? Number(selectedVariant.price || 0)
                      : Number(product.price || 0);
                    const hasPromo = effectivePrice > 0 && effectivePrice < basePrice;

                    const rawPrimaryImage =
                      product.primaryImage?.publicUrl ||
                      product.images?.find((img) => img.isPrimary)?.publicUrl ||
                      product.images?.[0]?.publicUrl ||
                      null;
                    const showImage = Boolean(rawPrimaryImage && !failedImageIds[product.id]);

                    const draftQty = draftQuantityByProduct[product.id] || 1;
                    const draftNote = draftNotesByProduct[product.id] || '';
                    const isNotesOpen = expandedNotesProductId === product.id || Boolean(draftNote);
                    const isNameExpanded = Boolean(expandedNameProductIds[product.id]);

                    const inCartQty = cart
                      .filter((c) => c.productId === product.id)
                      .reduce((acc, c) => acc + c.quantity, 0);

                    return (
                      <article
                        key={product.id}
                        className={`bg-white rounded-2xl border p-3.5 sm:p-4 flex flex-col justify-between transition-all ${
                          !availability.available
                            ? 'border-slate-200 bg-slate-50/80 opacity-70'
                            : inCartQty > 0
                            ? 'border-amber-500 ring-1 ring-amber-500/25 shadow-xs'
                            : 'border-slate-200/90 hover:border-slate-300 shadow-2xs'
                        }`}
                      >
                        <div>
                          {/* Top Row: Thumbnail + Name + Category + Price + Availability */}
                          <div className="flex items-start gap-3">
                            <div className="w-[68px] h-[68px] sm:w-[72px] sm:h-[72px] rounded-xl bg-slate-100 border border-slate-200/80 overflow-hidden shrink-0 flex items-center justify-center">
                              {showImage ? (
                                <img
                                  src={rawPrimaryImage!}
                                  alt={product.name}
                                  referrerPolicy="no-referrer"
                                  onError={() =>
                                    setFailedImageIds((prev) => ({ ...prev, [product.id]: true }))
                                  }
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Utensils className="w-6 h-6 text-slate-400" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedNameProductIds((prev) => ({
                                      ...prev,
                                      [product.id]: !prev[product.id],
                                    }))
                                  }
                                  title={product.name}
                                  className="text-left focus:outline-none group min-w-0 flex-1"
                                >
                                  <h3
                                    className={`font-bold text-slate-900 text-[16px] sm:text-[17px] leading-snug break-words ${
                                      isNameExpanded ? '' : 'line-clamp-2'
                                    }`}
                                  >
                                    {product.name}
                                  </h3>
                                </button>

                                {inCartQty > 0 && (
                                  <span className="px-2.5 py-0.5 rounded-lg text-[12px] font-extrabold bg-amber-100 text-amber-900 shrink-0 tabular-nums">
                                    {inCartQty}x no pedido
                                  </span>
                                )}
                              </div>

                              {/* Clean unboxed metadata: Category & SKU */}
                              {(product.category?.name || product.sku) && (
                                <div className="flex items-center gap-1.5 text-[13px] text-slate-500 mt-0.5 truncate">
                                  {product.category?.name && (
                                    <span className="truncate">{product.category.name}</span>
                                  )}
                                  {product.category?.name && product.sku && (
                                    <span aria-hidden="true">·</span>
                                  )}
                                  {product.sku && (
                                    <span className="font-mono text-[12px] text-slate-400 shrink-0">
                                      Cód. {product.sku}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Price & Availability Row */}
                              <div className="flex items-baseline justify-between gap-2 mt-1.5 flex-wrap">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-[18px] sm:text-[19px] font-extrabold text-emerald-700 tabular-nums">
                                    {formatCurrency(effectivePrice)}
                                  </span>
                                  {hasPromo && (
                                    <span className="text-[13px] text-slate-400 line-through tabular-nums">
                                      {formatCurrency(basePrice)}
                                    </span>
                                  )}
                                </div>

                                {!availability.available ? (
                                  <span className="text-[13px] font-bold text-rose-600">
                                    {availability.reason}
                                  </span>
                                ) : availability.maxStock !== null &&
                                  availability.maxStock !== undefined ? (
                                  <span className="text-[13px] font-medium text-slate-500 tabular-nums">
                                    Estoque: {availability.maxStock} un.
                                  </span>
                                ) : (
                                  <span className="text-[13px] font-semibold text-emerald-700">
                                    Disponível
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Variant Selector */}
                          {activeVariants.length > 0 && (
                            <div className="mt-3 pt-2.5 border-t border-slate-100">
                              <label className="block text-[12px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                                <Layers className="w-3.5 h-3.5 text-slate-400" />
                                Selecione a variação / opção
                              </label>
                              <select
                                value={selectedVariant?.id || ''}
                                onChange={(e) =>
                                  setSelectedVariantsByProduct((prev) => ({
                                    ...prev,
                                    [product.id]: e.target.value,
                                  }))
                                }
                                className="w-full min-h-[44px] px-3 py-2 text-[14px] bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                              >
                                {activeVariants.map((v) => {
                                  const vPrice = getProductEffectivePrice(product, v);
                                  return (
                                    <option key={v.id} value={v.id}>
                                      {v.name} — {formatCurrency(vPrice)}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          )}

                          {/* Optional Item Notes Input */}
                          {isNotesOpen && availability.available && (
                            <div className="mt-2.5">
                              <input
                                type="text"
                                value={draftNote}
                                onChange={(e) =>
                                  setDraftNotesByProduct((prev) => ({
                                    ...prev,
                                    [product.id]: e.target.value,
                                  }))
                                }
                                placeholder="Observação do item (ex: sem cebola, bem passado)..."
                                className="w-full min-h-[44px] px-3 py-2 text-[14px] bg-amber-50/50 border border-amber-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-amber-500 outline-none"
                              />
                            </div>
                          )}
                        </div>

                        {/* Card Controls Row: Quantity (- / +) + Notes Button + Add Button (all >= 44px touch targets) */}
                        <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-2">
                          {/* Quantity Selector */}
                          <div className="inline-flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200 shrink-0">
                            <button
                              type="button"
                              disabled={!availability.available || isSessionUnavailable || draftQty <= 1}
                              onClick={() =>
                                setDraftQuantityByProduct((prev) => ({
                                  ...prev,
                                  [product.id]: Math.max(1, (prev[product.id] || 1) - 1),
                                }))
                              }
                              aria-label={`Diminuir quantidade de ${product.name}`}
                              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-700 hover:bg-white disabled:opacity-40 active:scale-95 transition-all cursor-pointer"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-8 text-center text-[15px] font-extrabold text-slate-900 tabular-nums">
                              {draftQty}
                            </span>
                            <button
                              type="button"
                              disabled={
                                !availability.available ||
                                isSessionUnavailable ||
                                (availability.maxStock !== null &&
                                  availability.maxStock !== undefined &&
                                  draftQty >= availability.maxStock)
                              }
                              onClick={() =>
                                setDraftQuantityByProduct((prev) => ({
                                  ...prev,
                                  [product.id]: (prev[product.id] || 1) + 1,
                                }))
                              }
                              aria-label={`Aumentar quantidade de ${product.name}`}
                              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-700 hover:bg-white disabled:opacity-40 active:scale-95 transition-all cursor-pointer"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Item Notes Toggle Button */}
                          {availability.available && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedNotesProductId((prev) =>
                                  prev === product.id ? null : product.id
                                )
                              }
                              title="Adicionar observação ao item"
                              aria-label={`Observação para ${product.name}`}
                              aria-expanded={isNotesOpen}
                              className={`min-w-[44px] min-h-[44px] px-2.5 rounded-xl border flex items-center justify-center gap-1 text-[13px] font-semibold transition-colors shrink-0 cursor-pointer ${
                                isNotesOpen
                                  ? 'bg-amber-100 border-amber-400 text-amber-900'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <MessageSquare className="w-4 h-4" />
                              <span className="hidden sm:inline">Obs.</span>
                            </button>
                          )}

                          {/* Primary Add Product Button */}
                          <button
                            type="button"
                            disabled={!availability.available || isSessionUnavailable}
                            onClick={() => handleAddProductToCart(product)}
                            className="flex-1 min-h-[44px] px-3.5 py-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-slate-950 font-extrabold text-[15px] rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                          >
                            <Plus className="w-4 h-4 stroke-[2.5]" />
                            <span>Adicionar</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN ON DESKTOP (lg:flex): PERMANENT SUMMARY SIDEBAR */}
          <aside className="hidden lg:flex lg:col-span-5 xl:col-span-4 flex-col min-h-0 overflow-hidden bg-white">
            <div className="shrink-0 px-4 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-amber-600" />
                <h3 className="text-[16px] font-extrabold text-slate-900">
                  Resumo do pedido adicional
                </h3>
              </div>
              <span className="text-[14px] font-bold text-slate-600 tabular-nums">
                {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'itens'}
              </span>
            </div>

            {renderSummaryContent()}
          </aside>

          {/* MOBILE LAYER 2: EXPANDED SUMMARY PANEL (BOTTOM SHEET OVERLAY ON < lg) */}
          {isSummaryExpandedMobile && (
            <div
              className="lg:hidden absolute inset-0 z-30 bg-slate-950/60 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-150"
              onClick={() => setIsSummaryExpandedMobile(false)}
            >
              <div
                className="bg-white rounded-t-3xl max-h-[86%] flex flex-col overflow-hidden shadow-2xl border-t border-slate-200"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Grab Handle + Sheet Header */}
                <div className="shrink-0 pt-2 pb-3 px-4 border-b border-slate-200 bg-slate-50">
                  <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-2.5" />
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-[17px] font-extrabold text-slate-900">
                        Resumo do pedido ({totalItemsCount} {totalItemsCount === 1 ? 'item' : 'itens'})
                      </h3>
                      <p className="text-[13px] text-slate-500">
                        Confira quantidades, observações e o total estimado da conta
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsSummaryExpandedMobile(false)}
                      className="min-h-[44px] px-3.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-800 font-bold text-[13px] inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <ChevronDown className="w-4 h-4" />
                      <span>Voltar</span>
                    </button>
                  </div>
                </div>

                {renderSummaryContent()}
              </div>
            </div>
          )}
        </div>

        {/* 3. MOBILE LAYER 1: COMPACT SUMMARY BAR (Fixed above confirmation bar on < lg when expanded sheet is closed) */}
        {!isSummaryExpandedMobile && (
          <div
            data-testid="mobile-compact-summary-bar"
            className="lg:hidden shrink-0 bg-slate-900 text-white px-3.5 py-2 border-t border-slate-800 flex items-center justify-between gap-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[14px] truncate">
                <span className="font-extrabold text-amber-400 tabular-nums shrink-0">
                  {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'itens'}
                </span>
                <span aria-hidden="true" className="text-slate-500 shrink-0">·</span>
                <span className="text-slate-200 font-semibold text-[14px] truncate tabular-nums">
                  Subtotal: {formatCurrency(newOrderSubtotal)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsSummaryExpandedMobile(true)}
              className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-[13px] inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
              aria-expanded={isSummaryExpandedMobile}
            >
              <span>Ver resumo</span>
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 4. FIXED CONFIRMATION FOOTER (shrink-0, respects bottom safe-area) */}
        <footer className="shrink-0 bg-white border-t border-slate-200 px-3.5 py-2.5 sm:px-5 sm:py-3.5 pb-safe z-40">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-[48px] px-3.5 sm:px-5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-bold text-[15px] transition-colors shrink-0 cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={cart.length === 0 || isSubmitting || isSessionUnavailable}
              onClick={handleSubmitOrder}
              className="flex-1 min-h-[48px] px-3.5 sm:px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold text-[15px] sm:text-[16px] transition-all flex items-center justify-between sm:justify-center gap-2 shadow-sm cursor-pointer"
            >
              {isSubmitting ? (
                <div className="w-full flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                  <span>Enviando para cozinha...</span>
                </div>
              ) : (
                <>
                  <span className="flex items-center gap-1.5 text-left leading-tight">
                    <CheckCircle2 className="w-5 h-5 shrink-0 hidden xs:inline sm:inline" />
                    <span>Confirmar e enviar para cozinha</span>
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-black/20 text-white font-black text-[15px] sm:text-[16px] tabular-nums shrink-0">
                    {formatCurrency(newOrderSubtotal)}
                  </span>
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
