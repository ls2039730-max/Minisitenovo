import React, { useState, useEffect, useCallback, useId, useMemo } from 'react';
import {
  UtensilsCrossed,
  Search,
  ShoppingCart,
  Plus,
  Minus,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Receipt,
  FileText,
  Sparkles,
  ArrowRight,
  Coffee,
  Check,
  Tag,
  Eye,
  BellRing,
} from 'lucide-react';
import {
  PublicTableInfoResponse,
  TableCartItemInput,
  RestaurantOrder,
  RestaurantSession,
  RESTAURANT_STATUS_LABELS,
  RESTAURANT_STATUS_COLORS,
} from '../../../types/restaurant';
import { Product, ProductCategory, ProductVariant } from '../../../types/product';
import { api } from '../../../services/api';
import { TableOrderSuccessModal } from './TableOrderSuccessModal';
import { TableOrderTrackingModal } from './TableOrderTrackingModal';
import { TableCloseBillModal } from './TableCloseBillModal';
import { useBackHandler } from '../../../services/navigationManager';
import { isProductAvailableOnDay, getCurrentDayOfWeek } from '../../../utils/productAvailability';

interface PublicTableCatalogViewProps {
  tenantSlug: string;
  tableToken: string;
}

export const PublicTableCatalogView: React.FC<PublicTableCatalogViewProps> = ({
  tenantSlug,
  tableToken,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableInfo, setTableInfo] = useState<PublicTableInfoResponse | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Cart State (items added in current submission)
  const [cart, setCart] = useState<
    Array<{
      product: Product;
      variant?: ProductVariant | null;
      quantity: number;
      unitPrice: number;
      notes?: string;
    }>
  >([]);

  // Modals / Drawers State
  const [cartOpen, setCartOpen] = useState(false);
  const [productModal, setProductModal] = useState<{
    product: Product;
    selectedVariant?: ProductVariant | null;
    quantity: number;
    notes: string;
  } | null>(null);

  // Order Submission State
  const [customerName, setCustomerName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderSubmittedSuccess, setOrderSubmittedSuccess] = useState<RestaurantOrder | null>(null);

  // Table Bill / Account Session View State
  const [viewingBill, setViewingBill] = useState(false);
  const [sessionOrders, setSessionOrders] = useState<RestaurantOrder[]>([]);
  const [sessionTotal, setSessionTotal] = useState<number>(0);
  const [currentSession, setCurrentSession] = useState<RestaurantSession | null>(null);
  const [loadingBill, setLoadingBill] = useState(false);
  const [closeBillModalOpen, setCloseBillModalOpen] = useState(false);

  // Order Tracking State
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [selectedTrackingOrderId, setSelectedTrackingOrderId] = useState<string | null>(null);
  const [lastTrackingUpdated, setLastTrackingUpdated] = useState<Date | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [isRefreshingTracking, setIsRefreshingTracking] = useState(false);

  // Global Android & Browser Back Button Handlers (Priority: nested modal > drawer > catalog)
  useBackHandler({
    isOpen: closeBillModalOpen,
    onClose: () => setCloseBillModalOpen(false),
    priority: 30,
    name: 'TableCloseBillModal',
  });

  useBackHandler({
    isOpen: viewingBill,
    onClose: () => setViewingBill(false),
    priority: 20,
    name: 'TableBillDrawer',
  });

  useBackHandler({
    isOpen: trackingOpen,
    onClose: () => setTrackingOpen(false),
    priority: 20,
    name: 'TableTrackingDrawer',
  });

  useBackHandler({
    isOpen: !!orderSubmittedSuccess,
    onClose: () => setOrderSubmittedSuccess(null),
    priority: 25,
    name: 'TableOrderSuccessModal',
  });

  useBackHandler({
    isOpen: cartOpen,
    onClose: () => setCartOpen(false),
    priority: 20,
    name: 'TableCartDrawer',
  });

  useBackHandler({
    isOpen: !!productModal,
    onClose: () => setProductModal(null),
    priority: 20,
    name: 'TableProductModal',
  });

  // Load table info and catalog
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Validate table & fetch restaurant branding
      const info = await api.getPublicTableInfo(tenantSlug, tableToken);
      setTableInfo(info);

      // 2. Fetch live product catalog
      const catalog = await api.getPublicTableCatalog(tenantSlug, tableToken);
      setCategories(catalog.categories || []);
      setProducts(catalog.products || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar o cardápio da mesa.');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, tableToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load / Refresh table session orders and bill
  const refreshTableSession = useCallback(
    async (isSilent = false) => {
      try {
        if (!isSilent) setIsRefreshingTracking(true);
        setTrackingError(null);
        const res = await api.getPublicTableSession(tenantSlug, tableToken);
        const orders = res.orders || [];
        setSessionOrders(orders);
        setSessionTotal(res.totalAmount || 0);
        setCurrentSession(res.session);
        setLastTrackingUpdated(new Date());

        // Select the active or latest order if none is selected
        if (orders.length > 0) {
          setSelectedTrackingOrderId((prev) => {
            if (prev && orders.some((o) => o.id === prev)) return prev;
            const active = orders.find(
              (o) => o.status !== 'delivered' && o.status !== 'cancelled'
            );
            return active ? active.id : orders[0].id;
          });
        }
      } catch (err: any) {
        console.error('Error loading table session:', err);
        if (!isSilent) {
          setTrackingError('Não foi possível atualizar o status agora. Verifique sua conexão.');
        }
      } finally {
        if (!isSilent) setIsRefreshingTracking(false);
        setLoadingBill(false);
      }
    },
    [tenantSlug, tableToken]
  );

  // Load session orders once table loads
  useEffect(() => {
    refreshTableSession(true);
  }, [refreshTableSession]);

  // Periodic polling: every 7s when tracking modal is open, 15s when viewing bill, 25s when there are active orders
  useEffect(() => {
    const hasActiveOrders = sessionOrders.some(
      (o) => o.status !== 'delivered' && o.status !== 'cancelled'
    );

    const intervalTime = trackingOpen ? 7000 : viewingBill ? 15000 : hasActiveOrders ? 25000 : 0;
    if (intervalTime === 0) return;

    const interval = setInterval(() => {
      refreshTableSession(true);
    }, intervalTime);

    return () => clearInterval(interval);
  }, [trackingOpen, viewingBill, sessionOrders, refreshTableSession]);

  // Most recent active order or newest order
  const latestActiveOrder = useMemo(() => {
    if (!sessionOrders.length) return null;
    return (
      sessionOrders.find((o) => o.status !== 'delivered' && o.status !== 'cancelled') ||
      sessionOrders[0]
    );
  }, [sessionOrders]);

  // Product Selection Handlers
  const handleOpenProduct = (product: Product) => {
    if (!product.isActive) return;
    const isOutOfStock = product.trackStock && product.stockQuantity <= 0 && !product.allowOutOfStock;
    if (isOutOfStock) return;

    const defaultVariant = product.variants && product.variants.length > 0 ? product.variants[0] : null;
    setProductModal({
      product,
      selectedVariant: defaultVariant,
      quantity: 1,
      notes: '',
    });
  };

  const handleAddToCart = () => {
    if (!productModal) return;
    const { product, selectedVariant, quantity, notes } = productModal;

    const basePrice =
      selectedVariant?.price !== null && selectedVariant?.price !== undefined
        ? Number(selectedVariant.price)
        : Number(product.price || 0);

    const promoPrice =
      selectedVariant?.promotionalPrice !== null && selectedVariant?.promotionalPrice !== undefined
        ? Number(selectedVariant.promotionalPrice)
        : product.promotionalPrice !== null && product.promotionalPrice !== undefined
        ? Number(product.promotionalPrice)
        : null;

    const unitPrice = promoPrice !== null && promoPrice < basePrice ? promoPrice : basePrice;

    setCart((prev) => {
      // Check if exact same product + variant exists
      const existingIdx = prev.findIndex(
        (item) => item.product.id === product.id && item.variant?.id === selectedVariant?.id && (item.notes || '') === notes.trim()
      );

      if (existingIdx !== -1) {
        const copy = [...prev];
        copy[existingIdx].quantity += quantity;
        return copy;
      }

      return [
        ...prev,
        {
          product,
          variant: selectedVariant || null,
          quantity,
          unitPrice,
          notes: notes.trim() || undefined,
        },
      ];
    });

    setProductModal(null);
  };

  const handleRemoveFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateCartQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const copy = [...prev];
      const newQty = copy[index].quantity + delta;
      if (newQty <= 0) {
        return copy.filter((_, idx) => idx !== index);
      }
      copy[index].quantity = Math.min(99, newQty);
      return copy;
    });
  };

  // Submit Order to Kitchen/Bar
  const handleSubmitOrder = async () => {
    if (cart.length === 0) return;

    try {
      setSubmittingOrder(true);
      setError(null);

      const itemsPayload: TableCartItemInput[] = cart.map((item) => ({
        productId: item.product.id,
        variantId: item.variant?.id || null,
        quantity: item.quantity,
        notes: item.notes || undefined,
      }));

      // Generate random idempotency key for this submission
      const idempotencyKey = `table_order_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      const createdOrder = await api.submitPublicTableOrder({
        tenantSlug,
        tableToken,
        customerName: customerName.trim() || undefined,
        notes: orderNotes.trim() || undefined,
        items: itemsPayload,
        idempotencyKey,
      });

      setOrderSubmittedSuccess(createdOrder);
      setSelectedTrackingOrderId(createdOrder.id);
      setCart([]);
      setCartOpen(false);
      setOrderNotes('');

      // Persist order id in local storage
      try {
        const storageKey = `localhub_table_${tenantSlug}_${tableToken}_recent_orders`;
        const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
        localStorage.setItem(
          storageKey,
          JSON.stringify(Array.from(new Set([createdOrder.id, ...existing])))
        );
      } catch (e) {
        // Safe fallback
      }

      // Refresh table session in background
      refreshTableSession(true);
    } catch (err: any) {
      alert(err.message || 'Erro ao enviar pedido para a mesa. Tente novamente.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Calculated Cart Totals
  const cartSubtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const currentDay = getCurrentDayOfWeek();

  // Filter products by category, search & day availability for table channel
  const filteredProducts = products.filter((p) => {
    if (!isProductAvailableOnDay(p, currentDay, 'table')) {
      return false;
    }
    if (selectedCategory !== 'all' && p.categoryId !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.shortDescription && p.shortDescription.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
        <h2 className="text-base font-bold">Abrindo Cardápio da Mesa...</h2>
        <p className="text-xs text-slate-400 mt-1">Identificando sua mesa e carregando itens frescos</p>
      </div>
    );
  }

  if (error || !tableInfo) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-white mb-1">Mesa Não Disponível</h2>
        <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
          {error || 'Não foi possível identificar a mesa. Por favor, aponte novamente a câmera para o QR Code ou chame o garçom.'}
        </p>
        <button
          onClick={loadData}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  const primaryColor = tableInfo.tenant.primaryColor || '#0f172a';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col pb-28 selection:bg-amber-500 selection:text-white">
      {/* Mobile Top Header */}
      <header
        className="text-white sticky top-0 z-40 shadow-md px-4 py-3.5 transition-colors"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {tableInfo.tenant.logoUrl ? (
              <img
                src={tableInfo.tenant.logoUrl}
                alt={tableInfo.tenant.name}
                className="w-10 h-10 object-contain rounded-xl bg-white p-1 shrink-0 shadow-xs"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center font-black text-xs text-white shrink-0">
                {tableInfo.tenant.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/70 block">
                {tableInfo.tenant.name}
              </span>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight text-white truncate">
                  Mesa {tableInfo.table.tableNumber}
                </h1>
                {tableInfo.table.name && (
                  <span className="text-[11px] bg-white/20 text-white px-2 py-0.5 rounded-full font-medium truncate">
                    {tableInfo.table.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons in Header */}
          <div className="flex items-center gap-2 shrink-0">
            {sessionOrders.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTrackingOpen(true);
                  setCartOpen(false);
                  setViewingBill(false);
                }}
                className="px-2.5 sm:px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0 active:scale-95"
                title="Acompanhar status do pedido"
              >
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="hidden xs:inline">Acompanhar Pedido</span>
                <span className="xs:hidden">Status</span>
                {latestActiveOrder && (
                  <span className="text-[10px] bg-emerald-700/80 px-1.5 py-0.2 rounded-md font-black">
                    #{latestActiveOrder.orderNumber}
                  </span>
                )}
              </button>
            )}

            {/* Table Bill Quick Button */}
            <button
              onClick={() => {
                setViewingBill(true);
                setCartOpen(false);
                setTrackingOpen(false);
              }}
              className="px-2.5 sm:px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer backdrop-blur-xs shrink-0"
            >
              <Receipt className="w-4 h-4 text-amber-300" />
              <span className="hidden sm:inline">Conta da Mesa</span>
              <span className="sm:hidden">Comanda</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-2xl mx-auto w-full px-4 pt-4 space-y-4 flex-1">
        {/* Welcome & Table Banner */}
        <div className="p-4 bg-gradient-to-r from-amber-500 to-amber-600 rounded-3xl text-white shadow-md flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-100 block">
              Atendimento no Salão
            </span>
            <h2 className="text-base font-black mt-0.5">
              Peça à vontade na Mesa {tableInfo.table.tableNumber}
            </h2>
            <p className="text-xs text-amber-100/90 mt-0.5">
              Seus pedidos vão direto para a cozinha e bar!
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-6 h-6 text-white" />
          </div>
        </div>

        {/* HIGH-VISIBILITY ACTIVE ORDER TRACKING BANNER */}
        {latestActiveOrder && !trackingOpen && !orderSubmittedSuccess && (
          <div
            onClick={() => {
              setSelectedTrackingOrderId(latestActiveOrder.id);
              setTrackingOpen(true);
            }}
            className="p-3.5 sm:p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-300/80 hover:border-emerald-400 rounded-3xl text-emerald-950 shadow-md flex items-center justify-between gap-3 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] animate-in fade-in"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md relative">
                <Clock className="w-6 h-6 animate-pulse" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-900">
                    Pedido #{latestActiveOrder.orderNumber}
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-950 border border-emerald-300/70">
                    {RESTAURANT_STATUS_LABELS[latestActiveOrder.status] || latestActiveOrder.status}
                  </span>
                </div>
                <p className="text-xs text-emerald-800 font-semibold truncate mt-0.5">
                  Acompanhe o preparo e entrega em tempo real pelo celular
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shrink-0 shadow-xs">
              <span className="hidden sm:inline">Acompanhar</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar pratos, bebidas ou sobremesas..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500 shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Pills (Horizontal Scroll) */}
        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Todos ({products.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Products Listing */}
        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-200 space-y-2">
            <Coffee className="w-12 h-12 stroke-[1.5] mx-auto text-slate-300" />
            <h3 className="text-sm font-bold text-slate-700">Nenhum item disponível</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Nenhum produto encontrado para a categoria ou busca selecionada.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredProducts.map((product) => {
              const primaryImg = product.primaryImage?.publicUrl || product.images?.[0]?.publicUrl;
              const hasDiscount = Boolean(
                product.promotionalPrice !== null &&
                product.promotionalPrice !== undefined &&
                product.price !== null &&
                product.price !== undefined &&
                product.promotionalPrice < product.price
              );

              const displayPrice = hasDiscount && product.promotionalPrice !== null && product.promotionalPrice !== undefined
                ? product.promotionalPrice
                : (product.price ?? 0);

              const isOutOfStock =
                product.trackStock && product.stockQuantity <= 0 && !product.allowOutOfStock;

              return (
                <div
                  key={product.id}
                  onClick={() => !isOutOfStock && handleOpenProduct(product)}
                  className={`p-3.5 bg-white rounded-3xl border border-slate-200 shadow-xs flex gap-3 transition-all ${
                    isOutOfStock
                      ? 'opacity-60 cursor-not-allowed'
                      : 'hover:border-amber-400 hover:shadow-md cursor-pointer'
                  }`}
                >
                  {/* Photo */}
                  <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-100 overflow-hidden shrink-0 border border-slate-100">
                    {primaryImg ? (
                      <img
                        src={primaryImg}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <UtensilsCrossed className="w-7 h-7 stroke-[1.5]" />
                      </div>
                    )}
                    {hasDiscount && !isOutOfStock && (
                      <div className="absolute top-1 left-1 bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-xs">
                        PROMO
                      </div>
                    )}
                    {isOutOfStock && (
                      <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center text-white text-[9px] font-black uppercase text-center px-1">
                        Esgotado
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 flex flex-col justify-between min-w-0">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">
                        {product.name}
                      </h3>
                      {product.shortDescription && (
                        <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-tight">
                          {product.shortDescription}
                        </p>
                      )}
                    </div>

                    <div className="flex items-end justify-between mt-2 pt-1">
                      <div>
                        {hasDiscount && product.price !== null && product.price !== undefined && (
                          <span className="text-[10px] text-slate-400 line-through block">
                            R$ {product.price.toFixed(2).replace('.', ',')}
                          </span>
                        )}
                        <span className="text-sm font-black text-slate-900">
                          R$ {(displayPrice ?? 0).toFixed(2).replace('.', ',')}
                        </span>
                      </div>

                      {!isOutOfStock ? (
                        <button
                          type="button"
                          className="w-7 h-7 rounded-xl bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center shadow-xs transition-colors cursor-pointer shrink-0"
                          title="Adicionar ao pedido"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-[10px] text-rose-500 font-bold">Indisponível</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Bottom Bar (Cart Summary) */}
      {cart.length > 0 && !cartOpen && !viewingBill && !trackingOpen && !orderSubmittedSuccess && (
        <div className="fixed bottom-4 inset-x-4 max-w-2xl mx-auto z-40 animate-in slide-in-from-bottom">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full p-4 bg-slate-900 hover:bg-slate-800 text-white rounded-3xl shadow-2xl flex items-center justify-between border border-slate-800 cursor-pointer transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-amber-500 text-slate-950 font-bold flex items-center justify-center text-xs">
                {cartItemCount}
              </div>
              <div className="text-left">
                <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">
                  Ver Pedido da Mesa
                </span>
                <span className="text-xs font-bold text-slate-200">
                  {cartItemCount} item(ns) selecionado(s)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-base font-black text-white">
                R$ {cartSubtotal.toFixed(2).replace('.', ',')}
              </span>
              <ArrowRight className="w-4 h-4 text-amber-400" />
            </div>
          </button>
        </div>
      )}

      {/* Floating Bottom Bar (Order Tracking Quick Access when cart is empty) */}
      {cart.length === 0 && sessionOrders.length > 0 && !cartOpen && !viewingBill && !trackingOpen && !orderSubmittedSuccess && (
        <div className="fixed bottom-4 inset-x-4 max-w-2xl mx-auto z-40 animate-in slide-in-from-bottom">
          <button
            onClick={() => {
              if (latestActiveOrder) {
                setSelectedTrackingOrderId(latestActiveOrder.id);
              }
              setTrackingOpen(true);
            }}
            className="w-full p-3.5 sm:p-4 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-3xl shadow-2xl flex items-center justify-between border border-emerald-500/60 cursor-pointer transition-all transform hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white text-emerald-900 font-black flex items-center justify-center text-xs shadow-xs">
                #{latestActiveOrder ? latestActiveOrder.orderNumber : sessionOrders[0].orderNumber}
              </div>
              <div className="text-left">
                <span className="text-[10px] text-emerald-200 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                  Acompanhar Pedido ({sessionOrders.length})
                </span>
                <span className="text-xs font-black text-white">
                  Status: {RESTAURANT_STATUS_LABELS[latestActiveOrder ? latestActiveOrder.status : sessionOrders[0].status]}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-black text-white backdrop-blur-xs">
              <span>Linha do Tempo</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </div>
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: PRODUCT SELECTION & CUSTOMIZATION              */}
      {/* ======================================================== */}
      {productModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 truncate">
                {productModal.product.name}
              </h3>
              <button
                onClick={() => setProductModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Product Image & Description */}
              <div className="flex gap-3">
                {productModal.product.primaryImage?.publicUrl && (
                  <img
                    src={productModal.product.primaryImage.publicUrl}
                    alt={productModal.product.name}
                    className="w-20 h-20 rounded-2xl object-cover shrink-0 border border-slate-100"
                  />
                )}
                <div className="text-xs text-slate-600 leading-relaxed">
                  {productModal.product.description || productModal.product.shortDescription || 'Item preparado na hora com todo o capricho.'}
                </div>
              </div>

              {/* Variants Selector */}
              {productModal.product.variants && productModal.product.variants.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                    Escolha a opção / tamanho:
                  </label>
                  <div className="space-y-1.5">
                    {productModal.product.variants.map((v) => {
                      const isSelected = productModal.selectedVariant?.id === v.id;
                      const vPrice = v.price !== null && v.price !== undefined ? Number(v.price) : Number(productModal.product.price || 0);
                      const vPromo = v.promotionalPrice !== null && v.promotionalPrice !== undefined ? Number(v.promotionalPrice) : null;
                      const hasPromo = vPromo !== null && vPromo < vPrice;

                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setProductModal({ ...productModal, selectedVariant: v })}
                          className={`w-full p-3 rounded-2xl border flex items-center justify-between transition-all cursor-pointer ${
                            isSelected
                              ? 'border-amber-500 bg-amber-50/50 text-slate-950 font-bold shadow-xs'
                              : 'border-slate-200 hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-amber-600' : 'border-slate-300'}`}>
                              {isSelected && <div className="w-2 h-2 rounded-full bg-amber-600" />}
                            </div>
                            <span className="text-xs">{v.name}</span>
                          </div>
                          <span className="text-xs font-bold">
                            R$ {(hasPromo && vPromo !== null ? vPromo : vPrice).toFixed(2).replace('.', ',')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Item Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Observações para a cozinha (Opcional):
                </label>
                <textarea
                  value={productModal.notes}
                  onChange={(e) => setProductModal({ ...productModal, notes: e.target.value })}
                  rows={2}
                  placeholder="Ex: Sem cebola, gelo e limão à parte, bem passado..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>

              {/* Quantity Counter */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-bold text-slate-800 uppercase">Quantidade:</span>
                <div className="flex items-center gap-3 bg-slate-100 p-1 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setProductModal({ ...productModal, quantity: Math.max(1, productModal.quantity - 1) })}
                    className="w-8 h-8 rounded-xl bg-white text-slate-800 font-bold flex items-center justify-center shadow-xs cursor-pointer disabled:opacity-40"
                    disabled={productModal.quantity <= 1}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-bold text-sm text-slate-900 w-6 text-center">
                    {productModal.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setProductModal({ ...productModal, quantity: Math.min(99, productModal.quantity + 1) })}
                    className="w-8 h-8 rounded-xl bg-white text-slate-800 font-bold flex items-center justify-center shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <button
                type="button"
                onClick={handleAddToCart}
                className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Adicionar ao Pedido da Mesa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* DRAWER 2: TABLE CART & ORDER SUBMISSION                  */}
      {/* ======================================================== */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Pedido para a Mesa {tableInfo.table.tableNumber}
                </h3>
                <p className="text-xs text-slate-500">Revise os itens antes de enviar para a cozinha</p>
              </div>
              <button
                onClick={() => setCartOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {cart.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <ShoppingCart className="w-10 h-10 stroke-[1.5] mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Seu carrinho de mesa está vazio.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-slate-900 truncate">
                          {item.product.name}
                        </h4>
                        {item.variant && (
                          <span className="text-[11px] text-slate-500 font-medium block">
                            Opção: {item.variant.name}
                          </span>
                        )}
                        {item.notes && (
                          <span className="text-[10px] text-amber-700 italic block mt-0.5">
                            Obs: {item.notes}
                          </span>
                        )}
                        <span className="text-xs font-bold text-slate-900 mt-1 block">
                          R$ {(item.unitPrice * item.quantity).toFixed(2).replace('.', ',')}
                        </span>
                      </div>

                      {/* Quantity Controller */}
                      <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-xl border border-slate-200 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQuantity(idx, -1)}
                          className="text-slate-600 hover:text-slate-900 p-0.5 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-bold text-slate-900 w-5 text-center">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQuantity(idx, 1)}
                          className="text-slate-600 hover:text-slate-900 p-0.5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveFromCart(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        title="Remover item"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Patron Identification & Notes */}
              {cart.length > 0 && (
                <div className="pt-2 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Seu Nome na Mesa (Opcional):
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ex: João, Família Silva..."
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Observações Gerais do Pedido (Opcional):
                    </label>
                    <input
                      type="text"
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      placeholder="Ex: Trazer todos os pratos juntos..."
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {cart.length > 0 && (
              <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500">Subtotal deste pedido</span>
                  <span className="text-lg font-black text-slate-900">
                    R$ {cartSubtotal.toFixed(2).replace('.', ',')}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleSubmitOrder}
                  disabled={submittingOrder}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submittingOrder ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Enviar Pedido para a Cozinha</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: ORDER SUCCESS CONFIRMATION                     */}
      {/* ======================================================== */}
      {orderSubmittedSuccess && (
        <TableOrderSuccessModal
          order={orderSubmittedSuccess}
          tableNumber={tableInfo.table.tableNumber}
          tableName={tableInfo.table.name}
          onTrackOrder={() => {
            setSelectedTrackingOrderId(orderSubmittedSuccess.id);
            setOrderSubmittedSuccess(null);
            setTrackingOpen(true);
          }}
          onContinueBrowsing={() => {
            setOrderSubmittedSuccess(null);
          }}
          onViewBill={() => {
            setOrderSubmittedSuccess(null);
            setViewingBill(true);
          }}
        />
      )}

      {/* ======================================================== */}
      {/* MODAL 4: ORDER TRACKING TIMELINE & REALTIME STATUS       */}
      {/* ======================================================== */}
      <TableOrderTrackingModal
        isOpen={trackingOpen}
        onClose={() => setTrackingOpen(false)}
        tableNumber={tableInfo.table.tableNumber}
        tableName={tableInfo.table.name}
        orders={sessionOrders}
        selectedOrderId={selectedTrackingOrderId}
        onSelectOrder={setSelectedTrackingOrderId}
        onRefresh={() => refreshTableSession(false)}
        isRefreshing={isRefreshingTracking}
        lastUpdated={lastTrackingUpdated}
        refreshError={trackingError}
        onViewBill={() => {
          setTrackingOpen(false);
          setViewingBill(true);
        }}
      />

      {/* ======================================================== */}
      {/* DRAWER 5: RUNNING TABLE BILL / SESSION ORDERS VIEW       */}
      {/* ======================================================== */}
      {viewingBill && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-400 text-slate-950 font-black flex items-center justify-center text-xs">
                  {tableInfo.table.tableNumber}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Comanda da Mesa {tableInfo.table.tableNumber}
                  </h3>
                  <span className="text-[11px] text-slate-400 block">
                    Todos os pedidos feitos nesta mesa
                  </span>
                </div>
              </div>
              <button
                onClick={() => setViewingBill(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {loadingBill ? (
                <div className="py-12 text-center text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-amber-500" />
                  <p className="text-xs">Consultando comanda da mesa...</p>
                </div>
              ) : sessionOrders.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Receipt className="w-10 h-10 stroke-[1.5] mx-auto text-slate-300" />
                  <h4 className="text-xs font-bold text-slate-700">Nenhum pedido realizado ainda</h4>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    Assim que você enviar seu primeiro pedido pelo cardápio digital, ele aparecerá aqui com acompanhamento em tempo real.
                  </p>
                </div>
              ) : (
                <>
                  {/* Total Banner */}
                  <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl space-y-2.5 shadow-md">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-amber-300 tracking-wider">
                          Consumo Acumulado
                        </span>
                        <div className="text-2xl font-black text-white mt-0.5">
                          R$ {sessionTotal.toFixed(2).replace('.', ',')}
                        </div>
                      </div>
                      <span className="text-xs font-bold text-white bg-white/20 px-3 py-1 rounded-full">
                        {sessionOrders.filter((o) => o.status !== 'cancelled').length} pedido(s)
                      </span>
                    </div>

                    {currentSession?.closingRequestedAt && (
                      <div className="pt-2 border-t border-white/10 flex items-center gap-2 text-amber-300 text-xs font-bold">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                        <span>Aguardando Fechamento pelo Restaurante</span>
                      </div>
                    )}
                  </div>

                  {/* Additional Fees if any */}
                  {currentSession?.fees && currentSession.fees.length > 0 && (
                    <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-1.5 text-xs">
                      <span className="font-bold text-amber-900 uppercase text-[10px] tracking-wider block">
                        Taxas e Serviços Lançados
                      </span>
                      {currentSession.fees.map((f) => (
                        <div key={f.id} className="flex justify-between items-center text-slate-800">
                          <span>
                            {f.name} {f.type === 'percentage' ? `(${f.rateOrAmount}%)` : ''}
                          </span>
                          <span className="font-bold text-slate-900">
                            + R$ {f.calculatedAmount.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Orders list */}
                  <div className="space-y-3">
                    {sessionOrders.map((o) => {
                      const isCancelled = o.status === 'cancelled';
                      const statusStyle = RESTAURANT_STATUS_COLORS[o.status] || {
                        bg: 'bg-slate-50',
                        text: 'text-slate-700',
                        border: 'border-slate-200',
                        dot: 'bg-slate-400',
                      };

                      return (
                        <div
                          key={o.id}
                          className={`p-3.5 rounded-2xl border transition-all ${
                            isCancelled
                              ? 'bg-slate-50 border-slate-200 opacity-60'
                              : 'bg-white border-slate-200 shadow-xs'
                          }`}
                        >
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-slate-900">
                                Pedido #{o.orderNumber}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                ({new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                              </span>
                            </div>

                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                              {RESTAURANT_STATUS_LABELS[o.status] || o.status}
                            </span>
                          </div>

                          <div className="space-y-1">
                            {o.items.map((it) => (
                              <div key={it.id} className="text-xs flex justify-between">
                                <span className="text-slate-700">
                                  {it.quantity}x {it.productName}
                                  {it.variantName && ` (${it.variantName})`}
                                </span>
                                <span className="font-semibold text-slate-900">
                                  R$ {it.subtotal.toFixed(2).replace('.', ',')}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="mt-2 pt-1.5 border-t border-slate-100 flex justify-between text-xs font-bold">
                            <span className="text-slate-500">Subtotal:</span>
                            <span className={isCancelled ? 'line-through text-slate-400' : 'text-slate-900'}>
                              R$ {o.total.toFixed(2).replace('.', ',')}
                            </span>
                          </div>

                          {/* Action Button to Track This Specific Order */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTrackingOrderId(o.id);
                              setViewingBill(false);
                              setTrackingOpen(true);
                            }}
                            className="mt-2.5 w-full py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-emerald-200"
                          >
                            <Clock className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Acompanhar Linha do Tempo</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Footer with Prominent Two Actions */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-500">Total Geral da Comanda</span>
                <span className="text-lg font-black text-slate-900">
                  R$ {sessionTotal.toFixed(2).replace('.', ',')}
                </span>
              </div>

              {/* Action 1: FECHAR MINHA COMANDA */}
              {sessionOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCloseBillModalOpen(true);
                    setViewingBill(false);
                  }}
                  className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer border border-amber-600/20 active:scale-98"
                >
                  <Receipt className="w-4 h-4" />
                  <span>
                    {currentSession?.closingRequestedAt
                      ? 'CONFERIR STATUS DO FECHAMENTO'
                      : 'FECHAR MINHA COMANDA'}
                  </span>
                </button>
              )}

              {/* Action 2: + REALIZAR MAIS PEDIDOS (Never disappears while comanda is open) */}
              <button
                type="button"
                onClick={() => setViewingBill(false)}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>+ REALIZAR MAIS PEDIDOS</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 6: TABLE BILL CONFERENCE & CLOSING MODAL           */}
      {/* ======================================================== */}
      <TableCloseBillModal
        isOpen={closeBillModalOpen}
        onClose={() => setCloseBillModalOpen(false)}
        tenantSlug={tenantSlug}
        tableToken={tableToken}
        tableNumber={tableInfo.table.tableNumber}
        tableName={tableInfo.table.name}
        session={currentSession}
        orders={sessionOrders}
        onOrderMore={() => {
          setCloseBillModalOpen(false);
          setViewingBill(false);
        }}
        onRefreshSession={async () => {
          await refreshTableSession(false);
        }}
      />
    </div>
  );
};
