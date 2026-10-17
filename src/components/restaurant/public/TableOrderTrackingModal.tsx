import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  Clock,
  ChefHat,
  BellRing,
  Utensils,
  AlertTriangle,
  RefreshCw,
  Receipt,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  Check,
  AlertCircle,
  PackageCheck,
  Store,
} from 'lucide-react';
import {
  RestaurantOrder,
  RestaurantOrderStatus,
  RESTAURANT_STATUS_LABELS,
  RESTAURANT_STATUS_COLORS,
} from '../../../types/restaurant';

interface TableOrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableNumber: string;
  tableName?: string | null;
  orders: RestaurantOrder[];
  selectedOrderId: string | null;
  onSelectOrder: (orderId: string) => void;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  lastUpdated: Date | null;
  refreshError: string | null;
  onViewBill: () => void;
}

interface StepConfig {
  status: RestaurantOrderStatus;
  stepNumber: number;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ORDER_STEPS: StepConfig[] = [
  {
    status: 'received',
    stepNumber: 1,
    label: 'Pedido Recebido',
    shortLabel: 'Recebido',
    description: 'Seu pedido foi registrado e encaminhado para a equipe da cozinha e bar.',
    icon: Clock,
  },
  {
    status: 'confirmed',
    stepNumber: 2,
    label: 'Pedido Confirmado',
    shortLabel: 'Confirmado',
    description: 'A equipe revisou seu pedido e confirmou os itens solicitados.',
    icon: CheckCircle2,
  },
  {
    status: 'preparing',
    stepNumber: 3,
    label: 'Em Preparação',
    shortLabel: 'Em Preparo',
    description: 'Nossa cozinha e bar já estão preparando seus pratos e bebidas com carinho.',
    icon: ChefHat,
  },
  {
    status: 'ready',
    stepNumber: 4,
    label: 'Pronto para Servir',
    shortLabel: 'Pronto',
    description: 'Tudo pronto! O garçom está a caminho para levar os itens até a sua mesa.',
    icon: BellRing,
  },
  {
    status: 'delivered',
    stepNumber: 5,
    label: 'Pedido Entregue',
    shortLabel: 'Entregue',
    description: 'Pedido entregue na mesa. Aproveite sua refeição e tenha um ótimo momento!',
    icon: Utensils,
  },
];

const STATUS_INDEX_MAP: Record<RestaurantOrderStatus, number> = {
  received: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  delivered: 4,
  cancelled: -1,
};

export const TableOrderTrackingModal: React.FC<TableOrderTrackingModalProps> = ({
  isOpen,
  onClose,
  tableNumber,
  tableName,
  orders,
  selectedOrderId,
  onSelectOrder,
  onRefresh,
  isRefreshing,
  lastUpdated,
  refreshError,
  onViewBill,
}) => {
  // Sort orders descending (most recent first)
  const sortedOrders = useMemo(() => {
    return [...orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [orders]);

  // Current order being inspected
  const activeOrder = useMemo(() => {
    if (!sortedOrders.length) return null;
    if (selectedOrderId) {
      const found = sortedOrders.find((o) => o.id === selectedOrderId);
      if (found) return found;
    }
    return sortedOrders[0];
  }, [sortedOrders, selectedOrderId]);

  if (!isOpen) return null;

  const currentStepIndex = activeOrder ? STATUS_INDEX_MAP[activeOrder.status] : 0;
  const isCancelled = activeOrder?.status === 'cancelled';

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatLastUpdated = (date: Date | null) => {
    if (!date) return 'Carregando status...';
    return `Atualizado às ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh] animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 font-black flex items-center justify-center text-sm shadow-md shrink-0">
              {tableNumber}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white truncate">
                  Acompanhar Pedido
                </h3>
                <span className="hidden xs:inline-flex items-center gap-1 text-[10px] font-bold bg-white/15 px-2 py-0.5 rounded-full text-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Em tempo real
                </span>
              </div>
              <p className="text-xs text-slate-300 truncate">
                Mesa {tableNumber} {tableName ? `• ${tableName}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="Fechar acompanhamento"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Multi-Order Tabs Selector (When there is more than 1 order in this table session) */}
        {sortedOrders.length > 1 && (
          <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200/80 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            <span className="text-[10px] font-black uppercase text-slate-500 whitespace-nowrap">
              Seus Pedidos:
            </span>
            {sortedOrders.map((ord) => {
              const isSelected = activeOrder?.id === ord.id;
              const ordStatusStyle = RESTAURANT_STATUS_COLORS[ord.status] || {
                bg: 'bg-slate-200',
                text: 'text-slate-700',
                border: 'border-slate-300',
                dot: 'bg-slate-400',
              };

              return (
                <button
                  key={ord.id}
                  type="button"
                  onClick={() => onSelectOrder(ord.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>#{ord.orderNumber}</span>
                  <span
                    className={`w-2 h-2 rounded-full ${ordStatusStyle.dot} ${
                      ord.status === 'preparing' || ord.status === 'received' ? 'animate-pulse' : ''
                    }`}
                  />
                  <span className="text-[10px] opacity-90">
                    {RESTAURANT_STATUS_LABELS[ord.status] || ord.status}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {refreshError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-800 animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{refreshError}</span>
              </div>
              <button
                type="button"
                onClick={() => onRefresh()}
                className="font-bold underline text-rose-900 hover:text-rose-700 cursor-pointer text-[11px]"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!activeOrder ? (
            <div className="py-12 text-center text-slate-400 space-y-3">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <Receipt className="w-8 h-8 stroke-[1.5]" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">Nenhum pedido encontrado</h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Assim que você enviar um pedido pelo cardápio, ele aparecerá aqui com acompanhamento em tempo real.
              </p>
            </div>
          ) : (
            <>
              {/* Order Card Overview */}
              <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/60 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black text-slate-900">
                        Pedido #{activeOrder.orderNumber}
                      </span>
                      {activeOrder.customerName && (
                        <span className="text-xs font-semibold text-slate-600 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                          {activeOrder.customerName}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 block mt-0.5">
                      Enviado às {formatTime(activeOrder.createdAt)}
                    </span>
                  </div>

                  {/* Badge */}
                  {(() => {
                    const statusConfig = RESTAURANT_STATUS_COLORS[activeOrder.status] || {
                      bg: 'bg-slate-100',
                      text: 'text-slate-800',
                      border: 'border-slate-200',
                      dot: 'bg-slate-400',
                    };
                    return (
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${statusConfig.dot} ${
                            !isCancelled ? 'animate-pulse' : ''
                          }`}
                        />
                        {RESTAURANT_STATUS_LABELS[activeOrder.status]}
                      </span>
                    );
                  })()}
                </div>

                {activeOrder.notes && (
                  <div className="pt-2 border-t border-slate-200/80 text-xs text-slate-600">
                    <strong className="text-slate-700">Obs do pedido:</strong> {activeOrder.notes}
                  </div>
                )}
              </div>

              {/* CANCELLED STATE BANNER */}
              {isCancelled ? (
                <div className="p-5 bg-rose-50 border-2 border-rose-200 rounded-3xl space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-6 h-6 stroke-[2.5]" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-rose-950">
                        Este pedido foi cancelado
                      </h4>
                      <p className="text-xs text-rose-700 font-medium mt-0.5">
                        O pedido não está sendo preparado e o valor não será cobrado na sua comanda.
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-rose-800/90 leading-relaxed bg-white/70 p-3 rounded-2xl border border-rose-100">
                    Caso tenha sido um engano ou precise de algo mais, por favor solicite apoio ao garçom ou selecione novos itens no cardápio digital.
                  </p>
                </div>
              ) : (
                /* LINEAR TIMELINE OF STEPS */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                      Progresso do Pedido
                    </h4>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Etapa {Math.min(5, currentStepIndex + 1)} de 5
                    </span>
                  </div>

                  <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {ORDER_STEPS.map((step, idx) => {
                      const isCompleted = idx < currentStepIndex;
                      const isCurrent = idx === currentStepIndex;
                      const isPending = idx > currentStepIndex;

                      const StepIcon = step.icon;

                      return (
                        <div key={step.status} className="relative flex items-start gap-4">
                          {/* Step Marker Dot / Icon */}
                          <div
                            className={`absolute -left-6 top-0 w-6.5 h-6.5 rounded-full flex items-center justify-center transition-all ${
                              isCompleted
                                ? 'bg-emerald-600 text-white ring-4 ring-emerald-100 shadow-xs'
                                : isCurrent
                                ? 'bg-amber-500 text-white ring-4 ring-amber-100 shadow-md scale-110'
                                : 'bg-white border-2 border-slate-300 text-slate-400'
                            }`}
                          >
                            {isCompleted ? (
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            ) : isCurrent ? (
                              <StepIcon className="w-3.5 h-3.5 stroke-[2.5] animate-bounce" />
                            ) : (
                              <span className="text-[10px] font-bold">{step.stepNumber}</span>
                            )}
                          </div>

                          {/* Step Content */}
                          <div
                            className={`flex-1 transition-all rounded-2xl p-3.5 ${
                              isCurrent
                                ? 'bg-amber-50/70 border border-amber-200/80 shadow-xs'
                                : isCompleted
                                ? 'bg-emerald-50/40 border border-emerald-100/60'
                                : 'opacity-60'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <h5
                                  className={`text-xs font-black tracking-tight ${
                                    isCurrent
                                      ? 'text-amber-950'
                                      : isCompleted
                                      ? 'text-emerald-950'
                                      : 'text-slate-600'
                                  }`}
                                >
                                  {step.label}
                                </h5>
                                {isCurrent && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-amber-500 text-white px-2 py-0.5 rounded-full shadow-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                    Agora
                                  </span>
                                )}
                                {isCompleted && (
                                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded-md">
                                    Concluído
                                  </span>
                                )}
                              </div>
                            </div>

                            <p
                              className={`text-[11px] mt-1 leading-relaxed ${
                                isCurrent
                                  ? 'text-amber-900 font-medium'
                                  : isCompleted
                                  ? 'text-emerald-900/80'
                                  : 'text-slate-500'
                              }`}
                            >
                              {step.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Items Breakdown */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Itens deste Pedido
                  </h4>
                  <span className="text-xs font-bold text-slate-500">
                    {activeOrder.items.length} produto(s)
                  </span>
                </div>

                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-3.5 space-y-2.5">
                  {activeOrder.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between text-xs gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-md bg-white border border-slate-200 text-slate-700 flex items-center justify-center font-black text-[10px] shrink-0">
                            {item.quantity}x
                          </span>
                          <span className="truncate">{item.productName}</span>
                        </div>
                        {item.variantName && (
                          <span className="text-[11px] text-slate-500 block ml-6">
                            Opção: {item.variantName}
                          </span>
                        )}
                        {item.notes && (
                          <span className="text-[10px] text-amber-700 italic block ml-6 mt-0.5">
                            Obs: {item.notes}
                          </span>
                        )}
                      </div>

                      <span className="font-bold text-slate-900 shrink-0">
                        R$ {item.subtotal.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  ))}

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-black text-xs text-slate-900">
                    <span>Subtotal deste pedido:</span>
                    <span className="text-sm font-black text-slate-900">
                      R$ {activeOrder.total.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer with Live Indicator & Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-3 shrink-0">
          {/* Status update indicator & manual refresh button */}
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{formatLastUpdated(lastUpdated)}</span>
            </div>

            <button
              type="button"
              onClick={() => onRefresh()}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-700 hover:text-slate-950 font-bold bg-white rounded-lg border border-slate-200 hover:border-slate-300 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
              title="Atualizar status agora"
            >
              <RefreshCw
                className={`w-3 h-3 text-slate-600 ${isRefreshing ? 'animate-spin' : ''}`}
              />
              <span>{isRefreshing ? 'Atualizando...' : 'Atualizar agora'}</span>
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onViewBill}
              className="flex-1 py-3 px-3 bg-white hover:bg-slate-100 text-slate-800 rounded-2xl text-xs font-bold transition-all border border-slate-200 shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Receipt className="w-4 h-4 text-slate-500" />
              <span>Ver Comanda Completa</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>Voltar ao Cardápio</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
