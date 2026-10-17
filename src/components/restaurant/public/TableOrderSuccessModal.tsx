import React from 'react';
import {
  CheckCircle2,
  Clock,
  ArrowRight,
  Receipt,
  UtensilsCrossed,
  Sparkles,
} from 'lucide-react';
import { RestaurantOrder, RESTAURANT_STATUS_LABELS, RESTAURANT_STATUS_COLORS } from '../../../types/restaurant';

interface TableOrderSuccessModalProps {
  order: RestaurantOrder;
  tableNumber: string;
  tableName?: string | null;
  onTrackOrder: () => void;
  onContinueBrowsing: () => void;
  onViewBill: () => void;
}

export const TableOrderSuccessModal: React.FC<TableOrderSuccessModalProps> = ({
  order,
  tableNumber,
  tableName,
  onTrackOrder,
  onContinueBrowsing,
  onViewBill,
}) => {
  const statusStyle = RESTAURANT_STATUS_COLORS[order.status] || {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  };

  const statusLabel = RESTAURANT_STATUS_LABELS[order.status] || 'Recebido';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 text-center space-y-5 shadow-2xl border border-slate-100 overflow-hidden relative">
        {/* Decorative Top Accent */}
        <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600" />

        {/* Animated Success Icon */}
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-25" />
          <div className="w-20 h-20 rounded-full bg-emerald-50 border-4 border-emerald-100 text-emerald-600 flex items-center justify-center shadow-md relative z-10">
            <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
          </div>
        </div>

        {/* Header Text */}
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
            Pedido enviado com sucesso!
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed max-w-xs mx-auto">
            Agora você pode acompanhar o preparo do seu pedido em tempo real pelo celular.
          </p>
        </div>

        {/* Order Highlight Card */}
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3 text-left">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Número do Pedido
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black text-slate-900">
                  Pedido #{order.orderNumber}
                </span>
                <Sparkles className="w-4 h-4 text-amber-500 fill-amber-400" />
              </div>
            </div>

            {/* Current Status Badge */}
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                Status Atual
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
              >
                <span className={`w-2 h-2 rounded-full ${statusStyle.dot} animate-pulse`} />
                {statusLabel}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-600">
            <span>
              Mesa <strong className="text-slate-900 font-bold">{tableNumber}</strong>
              {tableName && ` (${tableName})`}
            </span>
            <span className="font-semibold text-slate-800">
              {order.items.length} item(ns) • R$ {order.total.toFixed(2).replace('.', ',')}
            </span>
          </div>
        </div>

        {/* Main Action Button - Highly Prominent & High Contrast */}
        <div className="space-y-3 pt-1">
          <button
            type="button"
            onClick={onTrackOrder}
            className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-2xl font-black text-sm sm:text-base tracking-wide transition-all shadow-lg hover:shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2.5 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <span>ACOMPANHAR MEU PEDIDO</span>
            <ArrowRight className="w-5 h-5 stroke-[2.5]" />
          </button>

          {/* Auxiliary Helper Text */}
          <p className="text-xs text-slate-500 font-medium leading-relaxed px-2">
            💡 Você não precisa chamar o garçom para saber como está seu pedido.
          </p>
        </div>

        {/* Secondary Options */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={onViewBill}
            className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Receipt className="w-3.5 h-3.5 text-slate-500" />
            <span>Ver Comanda da Mesa</span>
          </button>

          <button
            type="button"
            onClick={onContinueBrowsing}
            className="flex-1 py-2.5 px-3 bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            <span>Voltar ao Cardápio</span>
          </button>
        </div>
      </div>
    </div>
  );
};
