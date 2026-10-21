import React from 'react';
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
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { Tenant } from '../../types/saas';
import { ValidatedCartItem } from '../../types/order';
import { useBackHandler } from '../../services/navigationManager';
import { formatCurrencyBRL, toSafePrice } from '../../utils/currency';
import { calculateCartTotals } from '../../utils/cartCalculator';
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
  } = useCart();

  useBackHandler({
    isOpen: isCartOpen,
    onClose: closeCart,
    priority: 20,
    name: 'CartDrawer',
  });

  if (!isCartOpen) return null;

  // Authoritative calculation from displayItems
  const totals = calculateCartTotals(displayItems, 0, 0);
  const subtotal = totals.subtotal > 0 ? totals.subtotal : contextSubtotal;
  const hasItemsWaitingPrice =
    displayItems.length > 0 && displayItems.some((it) => toSafePrice(it.unitPrice) <= 0);

  const deliverySettings = validatedData?.deliverySettings;
  const minimumOrder = toSafePrice(deliverySettings?.minimumOrder || 0);
  const isBelowMinimum = !hasItemsWaitingPrice && minimumOrder > 0 && subtotal < minimumOrder;
  const minimumDifference = Math.max(0, Math.round((minimumOrder - subtotal) * 100) / 100);

  const canAcceptOrders = validatedData?.canAcceptOrders ?? true;
  const closedNotice = validatedData?.closedNotice;

  const isCheckoutDisabled =
    items.length === 0 ||
    isBelowMinimum ||
    !canAcceptOrders ||
    (hasItemsWaitingPrice && isValidating);

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
                AREA 2: LISTA DE PRODUTOS (Com controles e preços)
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
                          {/* Image Thumbnail */}
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

                          {/* Product Name, Variant & Unit Price */}
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

                            {/* Unit Price Display (Promotional vs Regular) */}
                            <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                              {itemHasValidPrice ? (
                                item.hasDiscount && item.originalPrice && item.originalPrice > item.unitPrice ? (
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

                        {/* Bottom Row: Compact Touch-Friendly Quantity Selector & Item Subtotal */}
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
                    <span>Subtotal</span>
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

                  <div className="flex items-center justify-between gap-2 text-slate-500">
                    <span>Frete / Entrega</span>
                    <span className="text-[11px] font-semibold text-slate-500 italic text-right">
                      Calculado na finalização
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
                    <span className="text-sm font-extrabold text-slate-900">Total parcial</span>
                    {hasItemsWaitingPrice && subtotal <= 0 ? (
                      <span className="text-sm font-bold text-slate-400">Calculando...</span>
                    ) : (
                      <span
                        className="text-base sm:text-lg font-black text-slate-900 whitespace-nowrap"
                        data-testid="cart-partial-total"
                      >
                        {formatCurrencyBRL(subtotal)}
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
                      O pedido mínimo é de {formatCurrencyBRL(minimumOrder)}. Faltam{' '}
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
