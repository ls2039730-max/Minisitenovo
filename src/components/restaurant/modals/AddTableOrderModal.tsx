import React, { useEffect, useMemo, useState } from 'react';
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
  Tag,
  MessageSquare,
  User as UserIcon,
  Layers,
} from 'lucide-react';
import {
  Product,
  ProductCategory,
  ProductVariant,
  DayOfWeek,
} from '../../../types/product';

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
import {
  RestaurantOrder,
  RestaurantSession,
  RestaurantTable,
} from '../../../types/restaurant';
import { api } from '../../../services/api';

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
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedVariantsByProduct, setSelectedVariantsByProduct] = useState<Record<string, string>>({});
  const [draftQuantityByProduct, setDraftQuantityByProduct] = useState<Record<string, number>>({});
  const [draftNotesByProduct, setDraftNotesByProduct] = useState<Record<string, string>>({});
  const [expandedNotesProductId, setExpandedNotesProductId] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItemDraft[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencySeed, setIdempotencySeed] = useState<string>('');

  const currentDay = useMemo(() => getCurrentDayOfWeek(), []);

  useEffect(() => {
    if (!isOpen || !table) return;

    setSearchQuery('');
    setSelectedCategoryId('all');
    setCart([]);
    setCustomerName('');
    setOrderNotes('');
    setError(null);
    setExpandedNotesProductId(null);
    setIdempotencySeed(`${table.id}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

    let mounted = true;
    const loadCatalog = async () => {
      setIsLoadingCatalog(true);
      try {
        const [prods, cats] = await Promise.all([
          api.getProducts({ isActive: true }),
          api.getCategories(),
        ]);
        if (!mounted) return;
        const activeProducts = (prods || []).filter((p) => p.isActive);
        setProducts(activeProducts);
        setCategories((cats || []).filter((c) => c.isActive));

        const defaultVariants: Record<string, string> = {};
        for (const p of activeProducts) {
          const activeVars = (p.variants || []).filter((v) => v.isActive);
          if (activeVars.length > 0) {
            defaultVariants[p.id] = activeVars[0].id;
          }
        }
        setSelectedVariantsByProduct(defaultVariants);
      } catch (err: any) {
        if (!mounted) return;
        setError(err.message || 'Erro ao carregar o catálogo de produtos.');
      } finally {
        if (mounted) setIsLoadingCatalog(false);
      }
    };

    loadCatalog();
    return () => {
      mounted = false;
    };
  }, [isOpen, table]);

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
        if (Number(variant.stockQuantity) <= 0) {
          return { available: false, reason: 'Variação esgotada', maxStock: 0 };
        }
        return { available: true, maxStock: Number(variant.stockQuantity) };
      }
      return { available: true, maxStock: null };
    }
    if (product.trackStock) {
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
    const activeVariants = (product.variants || []).filter((v) => v.isActive);
    const chosenVariantId = selectedVariantsByProduct[product.id];
    const chosenVariant =
      activeVariants.length > 0
        ? activeVariants.find((v) => v.id === chosenVariantId) || activeVariants[0]
        : null;

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

    setCart((prev) => {
      const existingIdx = prev.findIndex((c) => c.key === itemKey);
      if (existingIdx >= 0) {
        const existing = prev[existingIdx];
        const nextQty = existing.quantity + qtyToAdd;
        if (availability.maxStock !== null && availability.maxStock !== undefined && nextQty > availability.maxStock) {
          setError(`Estoque máximo atingido para "${product.name}" (${availability.maxStock} un.).`);
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
        setError(`Estoque insuficiente para "${product.name}" (disponível: ${availability.maxStock} un.).`);
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

    // Reset draft quantity & notes for this product card
    setDraftQuantityByProduct((prev) => ({ ...prev, [product.id]: 1 }));
    setDraftNotesByProduct((prev) => ({ ...prev, [product.id]: '' }));
    if (expandedNotesProductId === product.id) {
      setExpandedNotesProductId(null);
    }
    // Rotate idempotency seed whenever cart content changes intentionally
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

  const projectedSessionTotal = useMemo(
    () => Math.round((Number(currentSessionTotal || 0) + newOrderSubtotal) * 100) / 100,
    [currentSessionTotal, newOrderSubtotal]
  );

  const handleSubmitOrder = async () => {
    if (!table || cart.length === 0 || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const targetSessionId = sessionId || table.currentSessionId || undefined;
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

      // Broadcast synchronization event across tabs and views
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
      setError(err.message || 'Não foi possível adicionar o pedido à mesa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !table) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-100">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-lg shadow-sm">
              {table.tableNumber}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white">
                  Adicionar Itens — Mesa {table.tableNumber}
                  {table.name ? ` (${table.name})` : ''}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Sessão Aberta {sessionCode ? `• #${sessionCode}` : ''}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Os novos itens serão lançados como pedido adicional na conta aberta desta mesa e enviados ao KDS.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Fechar catálogo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-4 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-rose-700 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="flex-1">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-rose-500 hover:text-rose-700 font-bold px-1.5"
            >
              ✕
            </button>
          </div>
        )}

        {/* Main Content Split: Catalog (Left) + Cart Summary (Right) */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* Left Column: Product Catalog */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/50">
            {/* Search and Category Bar */}
            <div className="p-4 bg-white border-b border-slate-200 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar produto pelo nome, categoria ou código..."
                  className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {/* Category Filter Buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    selectedCategoryId === 'all'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Todos ({products.length})
                </button>
                {categories.map((cat) => {
                  const count = products.filter((p) => p.categoryId === cat.id).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                        selectedCategoryId === cat.id
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <Tag className="w-3 h-3" />
                      {cat.name} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Product List */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoadingCatalog ? (
                <div className="py-16 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
                  <p className="text-sm font-medium">Carregando catálogo oficial do restaurante...</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-slate-200 p-8">
                  <Utensils className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">Nenhum produto encontrado</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Tente ajustar o termo de busca ou selecionar outra categoria.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredProducts.map((product) => {
                    const activeVariants = (product.variants || []).filter((v) => v.isActive);
                    const selectedVariantId = selectedVariantsByProduct[product.id];
                    const selectedVariant =
                      activeVariants.length > 0
                        ? activeVariants.find((v) => v.id === selectedVariantId) || activeVariants[0]
                        : null;

                    const availability = evaluateProductAvailability(product, selectedVariant);
                    const effectivePrice = getProductEffectivePrice(product, selectedVariant);
                    const primaryImage =
                      product.primaryImage?.publicUrl ||
                      product.images?.find((img) => img.isPrimary)?.publicUrl ||
                      product.images?.[0]?.publicUrl ||
                      null;
                    const draftQty = draftQuantityByProduct[product.id] || 1;
                    const draftNote = draftNotesByProduct[product.id] || '';
                    const isNotesOpen = expandedNotesProductId === product.id || Boolean(draftNote);

                    const inCartQty = cart
                      .filter((c) => c.productId === product.id)
                      .reduce((acc, c) => acc + c.quantity, 0);

                    return (
                      <div
                        key={product.id}
                        className={`bg-white rounded-xl border p-3.5 flex flex-col justify-between transition-all ${
                          !availability.available
                            ? 'border-slate-200 opacity-60 bg-slate-50'
                            : inCartQty > 0
                            ? 'border-amber-400 ring-1 ring-amber-400/30 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 shadow-sm'
                        }`}
                      >
                        <div>
                          <div className="flex gap-3">
                            {/* Product Thumbnail */}
                            <div className="w-16 h-16 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                              {primaryImage ? (
                                <img
                                  src={primaryImage}
                                  alt={product.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Utensils className="w-6 h-6 text-slate-400" />
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-1.5">
                                <h4 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2">
                                  {product.name}
                                </h4>
                                {inCartQty > 0 && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 shrink-0">
                                    {inCartQty}x na lista
                                  </span>
                                )}
                              </div>

                              {product.category?.name && (
                                <span className="inline-block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                                  {product.category.name}
                                </span>
                              )}

                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className="text-sm font-black text-emerald-700">
                                  {formatCurrency(effectivePrice)}
                                </span>
                                {!availability.available ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">
                                    {availability.reason}
                                  </span>
                                ) : availability.maxStock !== null &&
                                  availability.maxStock !== undefined ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                                    Estoque: {availability.maxStock}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                                    Disponível
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Variant Selector if product has variants */}
                          {activeVariants.length > 0 && (
                            <div className="mt-3 pt-2.5 border-t border-slate-100">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                <Layers className="w-3 h-3 text-slate-400" />
                                Opção / Variação
                              </label>
                              <select
                                value={selectedVariant?.id || ''}
                                onChange={(e) =>
                                  setSelectedVariantsByProduct((prev) => ({
                                    ...prev,
                                    [product.id]: e.target.value,
                                  }))
                                }
                                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
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
                                placeholder="Ex: Sem cebola, bem passado, gelo e limão..."
                                className="w-full px-2.5 py-1.5 text-xs bg-amber-50/50 border border-amber-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-amber-500 outline-none"
                              />
                            </div>
                          )}
                        </div>

                        {/* Card Actions: Quantity + Notes Toggle + Add Button */}
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                              <button
                                type="button"
                                disabled={!availability.available || draftQty <= 1}
                                onClick={() =>
                                  setDraftQuantityByProduct((prev) => ({
                                    ...prev,
                                    [product.id]: Math.max(1, (prev[product.id] || 1) - 1),
                                  }))
                                }
                                className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:bg-white disabled:opacity-40"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-7 text-center text-xs font-bold text-slate-800">
                                {draftQty}
                              </span>
                              <button
                                type="button"
                                disabled={
                                  !availability.available ||
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
                                className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:bg-white disabled:opacity-40"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            {availability.available && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedNotesProductId((prev) =>
                                    prev === product.id ? null : product.id
                                  )
                                }
                                title="Adicionar observação ao item"
                                className={`p-1.5 rounded-lg border text-xs transition-colors ${
                                  isNotesOpen
                                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                }`}
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={!availability.available}
                            onClick={() => handleAddProductToCart(product)}
                            className="flex-1 py-1.5 px-3 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Adicionar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Selected Items Summary (New Additional Order) */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col bg-white overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Resumo do Novo Pedido
                </h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'itens'}
              </span>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/40">
                  <ShoppingBag className="w-9 h-9 text-slate-300 mb-2" />
                  <p className="text-sm font-bold text-slate-600">
                    Nenhum item selecionado
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    Selecione produtos do catálogo ao lado para compor o pedido adicional desta mesa.
                  </p>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.key}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 leading-snug">
                          {item.productName}
                        </p>
                        {item.variantName && (
                          <p className="text-[11px] font-semibold text-amber-700">
                            Opção: {item.variantName}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-500">
                          {formatCurrency(item.unitPrice)} un.
                        </p>
                      </div>
                      <span className="text-xs font-black text-slate-900 shrink-0">
                        {formatCurrency(item.unitPrice * item.quantity)}
                      </span>
                    </div>

                    {/* Item Note Editable */}
                    <input
                      type="text"
                      value={item.notes}
                      onChange={(e) => handleUpdateCartItemNotes(item.key, e.target.value)}
                      placeholder="Observação do item (opcional)..."
                      className="w-full px-2.5 py-1 text-[11px] bg-white border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:border-amber-500 outline-none"
                    />

                    {/* Quantity Controls & Remove */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQuantity(item.key, -1)}
                          className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:bg-slate-100"
                          title="Diminuir quantidade"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-7 text-center text-xs font-bold text-slate-900">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQuantity(item.key, 1)}
                          className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:bg-slate-100"
                          title="Aumentar quantidade"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveCartItem(item.key)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 px-2 py-1 rounded hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remover
                      </button>
                    </div>
                  </div>
                ))
              )}

              {/* Optional Order Metadata (Customer Name & General Observation) */}
              {cart.length > 0 && (
                <div className="pt-3 border-t border-slate-200 space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                      <UserIcon className="w-3 h-3 text-slate-400" />
                      Identificação do cliente na mesa (opcional)
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ex: João / Cliente cadeira 2"
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-slate-400" />
                      Observação geral do pedido (opcional)
                    </label>
                    <input
                      type="text"
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      placeholder="Ex: Trazer junto com as bebidas..."
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-amber-500 outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer Totals & Submit Button */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-3">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Consumo atual da mesa:</span>
                  <span className="font-semibold text-slate-700">
                    {formatCurrency(currentSessionTotal)}
                  </span>
                </div>
                <div className="flex justify-between text-amber-800 font-bold text-sm pt-1 border-t border-slate-200/80">
                  <span>Subtotal deste novo pedido:</span>
                  <span>+ {formatCurrency(newOrderSubtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-900 font-black text-sm pt-1 border-t border-slate-200">
                  <span>Novo total estimado da conta:</span>
                  <span className="text-emerald-700">
                    {formatCurrency(projectedSessionTotal)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={cart.length === 0 || isSubmitting}
                  onClick={handleSubmitOrder}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Lançando Pedido...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Confirmar e Enviar para Cozinha ({formatCurrency(newOrderSubtotal)})
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
