import React, { useState } from 'react';
import {
  X,
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  AlertTriangle,
  ArrowRight,
  Clock,
  Loader2,
  RefreshCw,
  Truck,
  Store,
  MapPin,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { Tenant } from '../../types/saas';
import { ValidatedCartItem } from '../../types/order';
import { useBackHandler } from '../../services/navigationManager';
import { formatCurrencyBRL, toSafePrice } from '../../utils/currency';
import { calculateCartTotals } from '../../utils/cartCalculator';
import { postalCodeService } from '../../services/postalCodeService';
import { CartCheckoutErrorBoundary } from './CartCheckoutErrorBoundary';

interface CartDrawerProps {
  tenant: Tenant;
  primaryColor?: string;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  tenant,
  primaryColor = '#1e293b',
}) => {
  const {
    isCartOpen,
    closeCart,
    openCheckout,
    items,
    displayItems,
    subtotal: contextSubtotal,
    itemCount,
    validatedData,
    isValidating,
    revalidationError,
    cartWarnings,
    updateQuantity,
    removeFromCart,
    clearCart,
    revalidateCart,
    fulfillmentType,
    setFulfillmentType,
    deliveryAddress,
    updateDeliveryAddress,
    deliveryQuote,
    isCalculatingDelivery,
    deliveryQuoteError,
    refreshDeliveryQuote,
  } = useCart();

  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [showAddressFields, setShowAddressFields] = useState(false);

  useBackHandler({
    isOpen: isCartOpen,
    onClose: closeCart,
    priority: 20,
    name: 'CartDrawer',
  });

  if (!isCartOpen) return null;

  // Authoritative calculation from displayItems
  const confirmedDeliveryFee =
    fulfillmentType === 'delivery' && deliveryQuote?.isCovered
      ? toSafePrice(deliveryQuote.fee)
      : 0;
  const totals = calculateCartTotals(displayItems, confirmedDeliveryFee, 0);
  const subtotal = totals.subtotal > 0 ? totals.subtotal : contextSubtotal;
  const totalWithDelivery =
    fulfillmentType === 'delivery' && deliveryQuote?.isCovered
      ? totals.total
      : subtotal;

  const hasItemsWaitingPrice =
    displayItems.length > 0 && displayItems.some((it) => toSafePrice(it.unitPrice) <= 0);

  const deliverySettings = validatedData?.deliverySettings;
  const effectiveMinOrder =
    fulfillmentType === 'delivery' && deliveryQuote?.minimumOrder && deliveryQuote.minimumOrder > 0
      ? toSafePrice(deliveryQuote.minimumOrder)
      : toSafePrice(deliverySettings?.minimumOrder || 0);

  const isBelowMinimum = !hasItemsWaitingPrice && effectiveMinOrder > 0 && subtotal < effectiveMinOrder;
  const minimumDifference = Math.max(0, Math.round((effectiveMinOrder - subtotal) * 100) / 100);

  const canAcceptOrders = validatedData?.canAcceptOrders ?? true;
  const closedNotice = validatedData?.closedNotice;

  const isCheckoutDisabled =
    items.length === 0 ||
    isBelowMinimum ||
    !canAcceptOrders ||
    (hasItemsWaitingPrice && isValidating) ||
    isCalculatingDelivery;

  const handleCartCepChange = async (val: string) => {
    const formatted = postalCodeService.formatCep(val);
    const clean = postalCodeService.cleanCep(formatted);
    updateDeliveryAddress({ cep: formatted, selectedRuleId: null });

    if (clean.length === 8) {
      setIsSearchingCep(true);
      setShowAddressFields(true);
      try {
        const res = await postalCodeService.lookup(clean, tenant.slug);
        if (res.found) {
          updateDeliveryAddress({
            cep: formatted,
            street: res.street || deliveryAddress.street,
            neighborhood: res.neighborhood || deliveryAddress.neighborhood,
            city: res.city || deliveryAddress.city,
            state: res.state || deliveryAddress.state,
            latitude: res.latitude ?? null,
            longitude: res.longitude ?? null,
          });
        }
      } finally {
        setIsSearchingCep(false);
      }
    }
  };

  return (
    <CartCheckoutErrorBoundary contextName="CartDrawer" onReset={() => revalidateCart()}>
      <div
        className="fixed inset-0 z-50 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Meu Carrinho"
      >
        {/* Backdrop */}
        <div
          onClick={closeCart}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        />

        {/* Right Panel Container — Full width on small mobile screens, max-w-md on larger viewports */}
        <div className="fixed inset-y-0 right-0 z-10 flex w-full sm:w-auto max-w-full">
          <div className="w-full sm:w-[420px] sm:max-w-md max-w-full h-dvh max-h-dvh bg-white shadow-2xl flex flex-col overflow-x-hidden transform transition-transform animate-in slide-in-from-right duration-250 ease-out">
            {/* =========================================================
                AREA 1: CABEÇALHO (Título, Quantidade, Limpar e Fechar)
               ========================================================= */}
            <header className="shrink-0 border-b border-slate-100 bg-slate-50/80">
              <div className="px-3.5 sm:px-5 py-3.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm sm:text-base font-extrabold text-slate-900 leading-tight truncate">
                      Meu Carrinho
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">
                      {itemCount} {itemCount === 1 ? 'item adicionado' : 'itens adicionados'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={clearCart}
                      title="Limpar carrinho"
                      aria-label="Limpar carrinho"
                      className="px-2.5 py-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors rounded-lg cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden xs:inline sm:inline">Limpar</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeCart}
                    title="Fechar carrinho"
                    aria-label="Fechar carrinho"
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Warnings Banner */}
              {cartWarnings.length > 0 && (
                <div className="bg-amber-50 border-t border-amber-200 px-3.5 sm:px-5 py-2.5 space-y-1">
                  {cartWarnings.map((warn: string, i: number) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-xs font-semibold text-amber-800 break-words whitespace-normal leading-relaxed"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span className="min-w-0 flex-1">{warn}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Store Business Hours Notice */}
              {closedNotice && (
                <div
                  className={`px-3.5 sm:px-5 py-2.5 border-t text-xs flex items-start gap-2 break-words whitespace-normal leading-relaxed ${
                    canAcceptOrders
                      ? 'bg-blue-50 border-blue-200 text-blue-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  <Clock className="w-4 h-4 shrink-0 mt-0.5 opacity-80" />
                  <div className="min-w-0 flex-1">
                    <strong className="block font-bold">Aviso de Horário:</strong>
                    <span className="block break-words">{closedNotice}</span>
                  </div>
                </div>
              )}
            </header>

            {/* =========================================================
                AREA 2: LISTA DE PRODUTOS E CÁLCULO DE ENTREGA NO CARRINHO
               ========================================================= */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-5 space-y-3">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 sm:p-6 text-slate-400 space-y-3">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
                    <ShoppingBag className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Seu carrinho está vazio</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      Explore nosso catálogo e adicione os itens que desejar para finalizar seu pedido.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeCart}
                    className="mt-3 px-5 py-2.5 text-xs font-bold rounded-xl text-white shadow-xs hover:opacity-90 transition-all cursor-pointer"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Continuar Comprando
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Revalidation Error Recovery Banner */}
                  {revalidationError && hasItemsWaitingPrice && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2">
                      <div className="flex items-start gap-2 font-semibold">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <span className="flex-1 break-words">{revalidationError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => revalidateCart()}
                        className="w-full py-2 px-3 bg-white border border-rose-200 hover:bg-rose-100 text-rose-700 font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Tentar atualizar valores</span>
                      </button>
                    </div>
                  )}

                  {displayItems.map((item: ValidatedCartItem) => {
                    const itemHasValidPrice = toSafePrice(item.unitPrice) > 0;

                    return (
                      <div
                        key={item.id}
                        className="flex flex-col gap-2.5 p-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all max-w-full overflow-hidden"
                      >
                        {/* Top Row: Thumbnail + Name + Variant + Unit Price + Remove Button */}
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center border border-slate-100">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.productName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ShoppingBag className="w-6 h-6 text-slate-300" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1.5">
                              <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug line-clamp-2 break-words">
                                {item.productName}
                              </h4>
                              <button
                                type="button"
                                onClick={() => removeFromCart(item.productId, item.variantId)}
                                title="Remover item"
                                aria-label={`Remover ${item.productName}`}
                                className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 -mr-1 -mt-1 rounded-lg transition-colors cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            {item.variantName && (
                              <span className="inline-block mt-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10px] font-semibold max-w-full truncate">
                                {item.variantName}
                              </span>
                            )}

                            {/* Unit Price Display */}
                            <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                              {itemHasValidPrice ? (
                                item.hasDiscount &&
                                item.originalPrice &&
                                item.originalPrice > item.unitPrice ? (
                                  <>
                                    <span className="text-[11px] text-slate-400 line-through whitespace-nowrap">
                                      {formatCurrencyBRL(item.originalPrice)}
                                    </span>
                                    <span className="text-xs sm:text-sm font-black text-emerald-600 whitespace-nowrap">
                                      {formatCurrencyBRL(item.unitPrice)}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-xs sm:text-sm font-bold text-slate-800 whitespace-nowrap">
                                    {formatCurrencyBRL(item.unitPrice)}
                                  </span>
                                )
                              ) : (
                                <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>Sincronizando preço...</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Bottom Row: Quantity Selector & Item Subtotal */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100/80">
                          <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50 shrink-0">
                            <button
                              type="button"
                              aria-label="Diminuir quantidade"
                              onClick={() =>
                                updateQuantity(item.productId, item.variantId, item.quantity - 1)
                              }
                              className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-200 active:bg-slate-300 transition-colors cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span
                              className="min-w-[2rem] px-1 text-center text-xs font-extrabold text-slate-900 select-none"
                              data-testid={`cart-item-qty-${item.productId}`}
                            >
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label="Aumentar quantidade"
                              onClick={() =>
                                updateQuantity(item.productId, item.variantId, item.quantity + 1)
                              }
                              className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-200 active:bg-slate-300 transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="text-right min-w-0">
                            <span className="block text-[10px] text-slate-400 font-medium leading-none mb-0.5">
                              Total do item
                            </span>
                            {itemHasValidPrice ? (
                              <span
                                className="text-xs sm:text-sm font-black text-slate-900 whitespace-nowrap"
                                data-testid={`cart-item-subtotal-${item.productId}`}
                              >
                                {formatCurrencyBRL(item.subtotal)}
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-slate-400">...</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* =========================================================
                      DELIVERY & PICKUP SELECTOR + FREIGHT CALCULATOR IN CART
                     ========================================================= */}
                  {deliverySettings && (
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">
                          Como deseja receber?
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {deliverySettings.pickupEnabled !== false && (
                          <button
                            type="button"
                            onClick={() => setFulfillmentType('pickup')}
                            className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              fulfillmentType === 'pickup'
                                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <Store className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">Retirar no Local</span>
                          </button>
                        )}
                        {deliverySettings.deliveryEnabled !== false && (
                          <button
                            type="button"
                            onClick={() => setFulfillmentType('delivery')}
                            className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              fulfillmentType === 'delivery'
                                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <Truck className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">Entrega</span>
                          </button>
                        )}
                      </div>

                      {fulfillmentType === 'delivery' && (
                        <div className="space-y-2 pt-1">
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                maxLength={9}
                                value={deliveryAddress.cep}
                                onChange={(e) => handleCartCepChange(e.target.value)}
                                placeholder="Digite seu CEP (00000-000)"
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              {isSearchingCep && (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 absolute right-3 top-2.5" />
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowAddressFields((v) => !v)}
                              className="px-2.5 py-2 text-[11px] font-bold bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-100 flex items-center gap-1 cursor-pointer shrink-0"
                            >
                              <span>Endereço</span>
                              {showAddressFields ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {(showAddressFields || deliveryAddress.cep.replace(/\D/g, '').length === 8) && (
                            <div className="space-y-2 pt-1 animate-in fade-in duration-150">
                              <div className="grid grid-cols-4 gap-2">
                                <input
                                  type="text"
                                  value={deliveryAddress.street}
                                  onChange={(e) =>
                                    updateDeliveryAddress({ street: e.target.value })
                                  }
                                  placeholder="Rua / Avenida"
                                  className="col-span-3 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-medium text-slate-800"
                                />
                                <input
                                  type="text"
                                  value={deliveryAddress.number}
                                  onChange={(e) =>
                                    updateDeliveryAddress({ number: e.target.value })
                                  }
                                  placeholder="Nº"
                                  className="col-span-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                                />
                              </div>
                              <div className="grid grid-cols-5 gap-2">
                                <input
                                  type="text"
                                  value={deliveryAddress.neighborhood}
                                  onChange={(e) =>
                                    updateDeliveryAddress({
                                      neighborhood: e.target.value,
                                      selectedRuleId: null,
                                    })
                                  }
                                  placeholder="Bairro"
                                  className="col-span-2 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-medium text-slate-800"
                                />
                                <input
                                  type="text"
                                  value={deliveryAddress.city}
                                  onChange={(e) =>
                                    updateDeliveryAddress({
                                      city: e.target.value,
                                      selectedRuleId: null,
                                    })
                                  }
                                  placeholder="Cidade"
                                  className="col-span-2 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-medium text-slate-800"
                                />
                                <input
                                  type="text"
                                  maxLength={2}
                                  value={deliveryAddress.state}
                                  onChange={(e) =>
                                    updateDeliveryAddress({
                                      state: e.target.value.toUpperCase(),
                                      selectedRuleId: null,
                                    })
                                  }
                                  placeholder="UF"
                                  className="col-span-1 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800 uppercase text-center"
                                />
                              </div>
                            </div>
                          )}

                          {/* Ambiguous Neighborhood Disambiguation */}
                          {deliveryQuote?.errorCode === 'AMBIGUOUS_NEIGHBORHOOD' &&
                            deliveryQuote.ambiguousRules && (
                              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5 text-xs">
                                <p className="font-bold text-amber-900">{deliveryQuote.reason}</p>
                                <div className="space-y-1">
                                  {deliveryQuote.ambiguousRules.map((r) => (
                                    <button
                                      key={r.id}
                                      type="button"
                                      onClick={() => updateDeliveryAddress({ selectedRuleId: r.id })}
                                      className="w-full p-2 rounded-lg bg-white border border-amber-200 hover:bg-amber-100/50 text-left flex items-center justify-between font-semibold text-slate-800 cursor-pointer"
                                    >
                                      <span>
                                        {r.name} ({r.city}/{r.state})
                                      </span>
                                      <span className="font-black">
                                        {formatCurrencyBRL(r.fee)}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                          {/* Delivery Quote Status Box */}
                          {isCalculatingDelivery ? (
                            <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-600 flex items-center gap-2 shadow-xs">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
                              <span>Calculando rota e taxa de entrega...</span>
                            </div>
                          ) : deliveryQuoteError ? (
                            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between gap-2">
                              <div className="flex items-start gap-1.5 min-w-0">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                                <span className="break-words font-medium">{deliveryQuoteError}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => refreshDeliveryQuote(undefined, true)}
                                className="px-2.5 py-1 bg-white rounded-lg border border-rose-300 font-bold text-[11px] text-rose-700 hover:bg-rose-100/60 shrink-0 cursor-pointer flex items-center gap-1 shadow-xs"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Repetir</span>
                              </button>
                            </div>
                          ) : deliveryQuote ? (
                            <div
                              className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                                deliveryQuote.isCovered
                                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                                  : 'bg-rose-50 border-rose-200 text-rose-900'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-1.5 font-bold min-w-0">
                                  {deliveryQuote.isCovered ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                  ) : (
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                                  )}
                                  <span className="break-words">
                                    {deliveryQuote.isCovered
                                      ? deliveryQuote.fee === 0
                                        ? 'Frete Grátis para seu endereço!'
                                        : `Entrega disponível: ${formatCurrencyBRL(deliveryQuote.fee)}`
                                      : deliveryQuote.reason ||
                                        'Endereço fora da nossa área de entrega.'}
                                  </span>
                                </div>
                                {!deliveryQuote.isCovered && (
                                  <button
                                    type="button"
                                    onClick={() => refreshDeliveryQuote(undefined, true)}
                                    className="px-2 py-0.5 bg-white rounded border border-rose-200 text-[10px] font-bold text-rose-700 hover:bg-rose-100/50 shrink-0 cursor-pointer"
                                  >
                                    Recalcular
                                  </button>
                                )}
                              </div>
                              {deliveryQuote.isCovered && (
                                <div className="text-[11px] text-emerald-800 pl-5 flex flex-wrap gap-x-2">
                                  {deliveryQuote.distanceKm !== null &&
                                    deliveryQuote.distanceKm !== undefined && (
                                      <span>
                                        Distância:{' '}
                                        <strong>
                                          {deliveryQuote.distanceKm.toFixed(1).replace('.', ',')} km
                                        </strong>
                                      </span>
                                    )}
                                  {deliveryQuote.estimatedTime && (
                                    <span>• Tempo: {deliveryQuote.estimatedTime}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : !deliveryAddress.cep.replace(/\D/g, '') && !deliveryAddress.street.trim() ? (
                            <div className="p-2.5 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500 flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>Informe seu CEP ou bairro acima para calcular a entrega.</span>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* =========================================================
                AREA 3: RESUMO FINANCEIRO E AÇÕES DE FINALIZAÇÃO (Fixo no rodapé)
               ========================================================= */}
            {items.length > 0 && (
              <footer className="shrink-0 p-3.5 sm:p-5 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-200/80 bg-slate-50/95 space-y-3">
                {/* Financial Summary */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2 text-slate-600 font-medium">
                    <span>Subtotal dos produtos</span>
                    {hasItemsWaitingPrice && subtotal <= 0 ? (
                      <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Calculando...</span>
                      </span>
                    ) : (
                      <span
                        className="font-bold text-slate-900 whitespace-nowrap"
                        data-testid="cart-subtotal"
                      >
                        {formatCurrencyBRL(subtotal)}
                      </span>
                    )}
                  </div>

                  {fulfillmentType === 'delivery' && deliveryQuote?.destinationSummary && (
                    <div className="flex items-start justify-between gap-2 text-[11px] text-slate-500">
                      <span className="shrink-0 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        Destino:
                      </span>
                      <span className="text-right truncate max-w-[220px] font-medium text-slate-700">
                        {deliveryQuote.destinationSummary}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 text-slate-500">
                    <span>
                      {fulfillmentType === 'pickup'
                        ? 'Modalidade: Retirada'
                        : deliveryQuote?.distanceKm !== null &&
                          deliveryQuote?.distanceKm !== undefined
                        ? `Frete (${deliveryQuote.distanceKm.toFixed(1).replace('.', ',')} km)`
                        : 'Frete / Entrega'}
                    </span>
                    <span className="text-[11px] font-bold text-slate-800 text-right">
                      {fulfillmentType === 'pickup' ? (
                        <span className="text-emerald-700">Sem taxa</span>
                      ) : isCalculatingDelivery ? (
                        <span className="text-slate-400 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Calculando...
                        </span>
                      ) : deliveryQuote?.isCovered ? (
                        deliveryQuote.fee === 0 ? (
                          <span className="text-emerald-700 font-extrabold">GRÁTIS</span>
                        ) : (
                          formatCurrencyBRL(deliveryQuote.fee)
                        )
                      ) : (
                        <span className="text-slate-500 italic">A calcular no endereço</span>
                      )}
                    </span>
                  </div>

                  {deliverySettings?.freeDeliveryAbove && deliverySettings.freeDeliveryAbove > 0 && (
                    <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 flex items-center justify-between gap-2">
                      <span className="truncate">Frete Grátis acima de:</span>
                      <span className="font-bold whitespace-nowrap shrink-0">
                        {formatCurrencyBRL(deliverySettings.freeDeliveryAbove)}
                      </span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-200/80 flex items-baseline justify-between gap-2">
                    <span className="text-sm font-extrabold text-slate-900">
                      {fulfillmentType === 'delivery' && deliveryQuote?.isCovered
                        ? 'Total estimado'
                        : 'Total parcial'}
                    </span>
                    {hasItemsWaitingPrice && subtotal <= 0 ? (
                      <span className="text-sm font-bold text-slate-400">Calculando...</span>
                    ) : (
                      <span
                        className="text-base sm:text-lg font-black text-slate-900 whitespace-nowrap"
                        data-testid="cart-partial-total"
                      >
                        {formatCurrencyBRL(totalWithDelivery)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Minimum order notice */}
                {isBelowMinimum && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-0.5 break-words">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Pedido Mínimo Não Atingido</span>
                    </div>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      O pedido mínimo é de {formatCurrencyBRL(effectiveMinOrder)}. Faltam{' '}
                      <strong>{formatCurrencyBRL(minimumDifference)}</strong> para finalizar.
                    </p>
                  </div>
                )}

                {/* Primary & Secondary Action Buttons */}
                <div className="space-y-2 pt-0.5">
                  <button
                    type="button"
                    disabled={isCheckoutDisabled}
                    onClick={openCheckout}
                    data-testid="cart-checkout-button"
                    className={`w-full py-3.5 px-4 rounded-xl text-white text-xs sm:text-sm font-bold shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      isCheckoutDisabled
                        ? 'opacity-50 cursor-not-allowed bg-slate-400'
                        : 'hover:opacity-95 hover:shadow-xl active:scale-[0.99]'
                    }`}
                    style={isCheckoutDisabled ? undefined : { backgroundColor: primaryColor }}
                  >
                    <span>Finalizar Pedido</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={closeCart}
                    data-testid="cart-continue-shopping-button"
                    className="w-full py-2.5 px-4 rounded-xl border border-slate-200/90 bg-white text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer text-center"
                  >
                    Continuar Comprando
                  </button>
                </div>
              </footer>
            )}
          </div>
        </div>
      </div>
    </CartCheckoutErrorBoundary>
  );
};
