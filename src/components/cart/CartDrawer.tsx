import React from 'react';
import {
  X,
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Clock,
  ShieldCheck,
  PackageX,
  Loader2,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { Tenant } from '../../types/saas';
import { ValidatedCartItem } from '../../types/order';
import { useBackHandler } from '../../services/navigationManager';

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
    itemCount,
    validatedData,
    isValidating,
    cartWarnings,
    updateQuantity,
    removeFromCart,
    clearCart,
  } = useCart();

  useBackHandler({
    isOpen: isCartOpen,
    onClose: closeCart,
    priority: 20,
    name: 'CartDrawer',
  });

  if (!isCartOpen) return null;

  // Use server-validated numbers when available; otherwise estimate safely
  const subtotal = validatedData?.subtotal ?? 0;
  const deliverySettings = validatedData?.deliverySettings;
  const minimumOrder = deliverySettings?.minimumOrder || 0;
  const isBelowMinimum = minimumOrder > 0 && subtotal < minimumOrder;
  const minimumDifference = Math.max(0, minimumOrder - subtotal);

  const canAcceptOrders = validatedData?.canAcceptOrders ?? true;
  const closedNotice = validatedData?.closedNotice;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={closeCart}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col transform transition-transform animate-in slide-in-from-right duration-250 ease-out">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs"
                style={{ backgroundColor: primaryColor }}
              >
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                  Meu Carrinho
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  {itemCount} {itemCount === 1 ? 'item adicionado' : 'itens adicionados'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  title="Esvaziar carrinho"
                  className="p-2 text-slate-400 hover:text-rose-600 transition-colors rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={closeCart}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Warnings Banner */}
          {cartWarnings.length > 0 && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 space-y-1">
              {cartWarnings.map((warn: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs font-semibold text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>{warn}</span>
                </div>
              ))}
            </div>
          )}

          {/* Store Closed Warning */}
          {closedNotice && (
            <div
              className={`px-4 py-2.5 border-b text-xs flex items-start gap-2 ${
                canAcceptOrders
                  ? 'bg-blue-50 border-blue-200 text-blue-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <Clock className="w-4 h-4 shrink-0 mt-0.5 opacity-80" />
              <div>
                <strong className="block font-bold">Aviso de Horário:</strong>
                <span>{closedNotice}</span>
              </div>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-3">
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
                {isValidating && !validatedData && (
                  <div className="flex items-center justify-center py-6 text-slate-400 gap-2 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                    <span>Atualizando valores e estoque...</span>
                  </div>
                )}

                {(validatedData?.items || []).map((item: ValidatedCartItem) => {
                  return (
                    <div
                      key={item.id}
                      className="flex gap-3.5 p-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all"
                    >
                      {/* Image Thumbnail */}
                      <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center border border-slate-100">
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

                      {/* Info & Quantity */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 truncate">
                            {item.productName}
                          </h4>
                          {item.variantName && (
                            <span className="inline-block mt-0.5 px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10px] font-semibold">
                              {item.variantName}
                            </span>
                          )}
                          <div className="mt-1 flex items-baseline gap-1.5">
                            {item.hasDiscount && item.originalPrice ? (
                              <>
                                <span className="text-[10px] text-slate-400 line-through">
                                  R$ {item.originalPrice.toFixed(2).replace('.', ',')}
                                </span>
                                <span className="text-xs font-black text-emerald-600">
                                  R$ {item.unitPrice.toFixed(2).replace('.', ',')}
                                </span>
                              </>
                            ) : (
                              <span className="text-xs font-bold text-slate-800">
                                R$ {item.unitPrice.toFixed(2).replace('.', ',')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100/60">
                          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.productId, item.variantId, item.quantity - 1)}
                              className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-8 text-center text-xs font-bold text-slate-800">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.productId, item.variantId, item.quantity + 1)}
                              className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="text-right flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">
                              R$ {item.subtotal.toFixed(2).replace('.', ',')}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.productId, item.variantId)}
                              className="text-slate-300 hover:text-rose-500 p-1 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer / Summary */}
          {items.length > 0 && (
            <div className="p-5 border-t border-slate-100 bg-slate-50/70 space-y-3">
              {/* Financial calculations */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Subtotal</span>
                  <span className="font-bold text-slate-900">
                    R$ {subtotal.toFixed(2).replace('.', ',')}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Entrega</span>
                  <span className="text-[11px] font-semibold text-slate-500 italic">
                    Calculada no checkout
                  </span>
                </div>
                {deliverySettings?.freeDeliveryAbove && deliverySettings.freeDeliveryAbove > 0 && (
                  <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 flex items-center justify-between">
                    <span>Frete Grátis acima de:</span>
                    <span className="font-bold">
                      R$ {deliverySettings.freeDeliveryAbove.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-200/80 flex justify-between items-baseline">
                  <span className="text-sm font-extrabold text-slate-900">Total parcial</span>
                  <span className="text-lg font-black text-slate-900">
                    R$ {subtotal.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>

              {/* Minimum order notice */}
              {isBelowMinimum && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-0.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Pedido Mínimo Não Atingido</span>
                  </div>
                  <p className="text-[11px] text-amber-700">
                    O pedido mínimo é de R$ {minimumOrder.toFixed(2).replace('.', ',')}. Faltam{' '}
                    <strong>R$ {minimumDifference.toFixed(2).replace('.', ',')}</strong> para
                    finalizar.
                  </p>
                </div>
              )}

              {/* Checkout Action Button */}
              <button
                type="button"
                disabled={isBelowMinimum || !canAcceptOrders || isValidating}
                onClick={openCheckout}
                className={`w-full py-3.5 px-4 rounded-xl text-white text-xs sm:text-sm font-bold shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isBelowMinimum || !canAcceptOrders || isValidating
                    ? 'opacity-50 cursor-not-allowed bg-slate-400'
                    : 'hover:opacity-95 hover:shadow-xl active:scale-[0.99]'
                }`}
                style={
                  isBelowMinimum || !canAcceptOrders || isValidating
                    ? undefined
                    : { backgroundColor: primaryColor }
                }
              >
                <span>Finalizar Pedido</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={closeCart}
                className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-800 py-1 cursor-pointer transition-colors"
              >
                Continuar Comprando
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
