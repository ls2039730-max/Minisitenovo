import React, { useState } from 'react';
import {
  X,
  Receipt,
  CheckCircle2,
  Clock,
  Utensils,
  AlertTriangle,
  Loader2,
  PlusCircle,
  Percent,
  Sparkles,
  CreditCard,
  Check,
} from 'lucide-react';
import {
  RestaurantSession,
  RestaurantOrder,
  RestaurantSessionFee,
} from '../../../types/restaurant';
import { api } from '../../../services/api';

interface TableCloseBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  tableToken: string;
  tableNumber: string;
  tableName?: string | null;
  session: RestaurantSession | null;
  orders: RestaurantOrder[];
  onOrderMore: () => void;
  onRefreshSession: () => Promise<void>;
}

export const TableCloseBillModal: React.FC<TableCloseBillModalProps> = ({
  isOpen,
  onClose,
  tenantSlug,
  tableToken,
  tableNumber,
  tableName,
  session,
  orders,
  onOrderMore,
  onRefreshSession,
}) => {
  const [confirmStep, setConfirmStep] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState(false);

  if (!isOpen) return null;

  const validOrders = orders.filter((o) => o.status !== 'cancelled');
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled');

  const ordersSubtotal = validOrders.reduce((sum, o) => sum + o.total, 0);
  const fees: RestaurantSessionFee[] = session?.fees || [];
  const feesTotal = fees.reduce((sum, f) => sum + f.calculatedAmount, 0);
  const grandTotal = Math.round((ordersSubtotal + feesTotal) * 100) / 100;

  const isClosingRequested = Boolean(session?.closingRequestedAt);
  const isClosed = session?.status === 'closed';

  const handleConfirmClosing = async () => {
    try {
      setSubmitting(true);
      setError(null);
      await api.requestPublicTableClosing({ tenantSlug, tableToken });
      setSuccessNotice(true);
      setConfirmStep(false);
      await onRefreshSession();
    } catch (err: any) {
      setError(err.message || 'Não foi possível solicitar o fechamento da conta.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-400 text-slate-950 font-black flex items-center justify-center text-xs shadow-xs">
              {tableNumber}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  Conferência da Comanda - Mesa {tableNumber}
                </h3>
              </div>
              <span className="text-[11px] text-slate-400 block">
                {tableName ? `${tableName} • ` : ''}
                {session?.sessionCode || 'Comanda da Mesa'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Banner: Closed bill */}
          {isClosed ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-2">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-emerald-900">
                Conta Encerrada com Sucesso!
              </h4>
              <p className="text-xs text-emerald-800 leading-relaxed max-w-sm mx-auto">
                Sua comanda foi finalizada pelo restaurante. Agradecemos muito a sua preferência e esperamos você de volta em breve!
              </p>
              {session?.paymentMethod && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-emerald-200 rounded-full text-xs font-bold text-emerald-800">
                  <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Pago via: {session.paymentMethod}</span>
                </div>
              )}
            </div>
          ) : isClosingRequested || successNotice ? (
            /* Banner: Closing Requested / Waiting for waiter */
            <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-amber-900">
                  Aguardando Fechamento pelo Restaurante
                </span>
              </div>
              <p className="text-xs text-amber-900 leading-relaxed font-medium">
                “Solicitação de fechamento enviada! O restaurante já foi avisado e um atendente poderá finalizar sua conta. Você não precisa ficar esperando para chamar o garçom.”
              </p>
              <div className="text-[11px] text-amber-700/90 pt-1 border-t border-amber-200/60 flex items-center justify-between">
                <span>Solicitada às {session?.closingRequestedAt ? new Date(session.closingRequestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'poucos instantes'}</span>
                <button
                  type="button"
                  onClick={() => onRefreshSession()}
                  className="font-bold text-amber-900 underline hover:text-amber-950 cursor-pointer text-[11px]"
                >
                  Atualizar status
                </button>
              </div>
            </div>
          ) : null}

          {/* Breakdown Header */}
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Utensils className="w-3.5 h-3.5 text-slate-400" />
              <span>Itens Consumidos ({validOrders.length} pedido{validOrders.length !== 1 ? 's' : ''})</span>
            </h4>
            <span className="text-[11px] text-slate-400">
              Subtotal: R$ {ordersSubtotal.toFixed(2).replace('.', ',')}
            </span>
          </div>

          {/* Orders & Items detailed list */}
          <div className="space-y-3">
            {validOrders.map((order) => (
              <div
                key={order.id}
                className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2"
              >
                <div className="flex items-center justify-between text-xs border-b border-slate-200/60 pb-1.5">
                  <span className="font-bold text-slate-800">
                    Pedido #{order.orderNumber}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-start text-xs">
                      <div className="max-w-[70%]">
                        <span className="font-bold text-slate-900 mr-1.5">
                          {item.quantity}x
                        </span>
                        <span className="text-slate-800">
                          {item.productName}
                        </span>
                        {item.variantName && (
                          <span className="text-slate-500 text-[11px] ml-1">
                            ({item.variantName})
                          </span>
                        )}
                        {item.notes && (
                          <p className="text-[10px] text-amber-700 italic">
                            Obs: {item.notes}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-900">
                          R$ {item.subtotal.toFixed(2).replace('.', ',')}
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          R$ {item.unitPrice.toFixed(2).replace('.', ',')} un
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-1.5 border-t border-slate-200/60 flex justify-between text-xs font-bold">
                  <span className="text-slate-500">Subtotal deste pedido</span>
                  <span className="text-slate-900">
                    R$ {order.total.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Additional Fees Breakdown */}
          {fees.length > 0 && (
            <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-indigo-600" />
                  Taxas Adicionais & Serviços
                </span>
                <span className="text-xs font-bold text-indigo-900">
                  + R$ {feesTotal.toFixed(2).replace('.', ',')}
                </span>
              </div>

              <div className="space-y-1.5 divide-y divide-indigo-100/60">
                {fees.map((fee) => (
                  <div key={fee.id} className="pt-1.5 first:pt-0 flex justify-between items-start text-xs">
                    <div>
                      <span className="font-bold text-slate-900">{fee.name}</span>
                      <p className="text-[10px] text-slate-500">
                        {fee.type === 'percentage'
                          ? `${fee.rateOrAmount}% sobre o subtotal de consumo (R$ ${ordersSubtotal.toFixed(2).replace('.', ',')})`
                          : 'Valor fixo configurado'}
                        {fee.description ? ` • ${fee.description}` : ''}
                      </p>
                    </div>
                    <span className="font-bold text-slate-900 shrink-0">
                      R$ {fee.calculatedAmount.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financial Summary Breakdown Card */}
          <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2 shadow-md">
            <div className="flex justify-between items-center text-xs text-slate-300">
              <span>Subtotal dos Produtos:</span>
              <span className="font-semibold">R$ {ordersSubtotal.toFixed(2).replace('.', ',')}</span>
            </div>

            {fees.length > 0 && (
              <div className="flex justify-between items-center text-xs text-slate-300">
                <span>Taxas Adicionais:</span>
                <span className="font-semibold">+ R$ {feesTotal.toFixed(2).replace('.', ',')}</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
              <div>
                <span className="text-[10px] uppercase font-bold text-amber-400 block tracking-wider">
                  Valor Total da Comanda
                </span>
                <span className="text-2xl font-black text-white">
                  R$ {grandTotal.toFixed(2).replace('.', ',')}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Status da Comanda</span>
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    isClosed
                      ? 'bg-emerald-500 text-white'
                      : isClosingRequested
                      ? 'bg-amber-400 text-slate-950 font-extrabold animate-pulse'
                      : 'bg-indigo-500 text-white'
                  }`}
                >
                  {isClosed
                    ? 'Encerrada'
                    : isClosingRequested
                    ? 'Fechamento Solicitado'
                    : 'Aberta'}
                </span>
              </div>
            </div>
          </div>

          {/* Confirmation Prompt before Submitting */}
          {confirmStep && !isClosingRequested && !isClosed && (
            <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-3 animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-xs font-bold text-amber-950">
                    Confirmar Solicitação de Fechamento da Mesa {tableNumber}?
                  </h5>
                  <p className="text-[11px] text-amber-900 mt-1 leading-relaxed">
                    Ao confirmar, o restaurante receberá um aviso imediato com o total da sua conta{' '}
                    <span className="font-bold">R$ {grandTotal.toFixed(2).replace('.', ',')}</span> para que o garçom venha finalizar o seu atendimento.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmStep(false)}
                  disabled={submitting}
                  className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClosing}
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>CONFIRMAR SOLICITAÇÃO</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-2.5">
          {/* Main Action: Close Bill or Order More */}
          {!isClosed && !isClosingRequested && !confirmStep && (
            <button
              type="button"
              onClick={() => setConfirmStep(true)}
              className="w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer border border-amber-600/20"
            >
              <Receipt className="w-4 h-4" />
              <span>FECHAR MINHA COMANDA</span>
            </button>
          )}

          {/* Button: Order More (Always visible while comanda is open) */}
          {!isClosed && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOrderMore();
              }}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-2xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              <span>+ REALIZAR MAIS PEDIDOS</span>
            </button>
          )}

          {isClosed && (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-2xl transition-all cursor-pointer"
            >
              Fechar Visualização
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
