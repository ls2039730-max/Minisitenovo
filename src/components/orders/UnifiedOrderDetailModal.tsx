import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  MapPin,
  Truck,
  Store,
  UtensilsCrossed,
  CreditCard,
  FileText,
  Clock,
  CheckCircle2,
  MessageCircle,
  ExternalLink,
  Edit2,
  Trash2,
  DollarSign,
  Plus,
  History,
  Tag,
  AlertCircle,
  Loader2,
  Receipt,
} from 'lucide-react';
import {
  UnifiedOrder,
  OrderPaymentStatus,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
} from '../../types/analytics';
import { ORDER_STATUS_LABELS, OrderStatus } from '../../types/order';
import { RESTAURANT_STATUS_LABELS, RestaurantOrderStatus } from '../../types/restaurant';
import { api } from '../../services/api';

interface UnifiedOrderDetailModalProps {
  order: UnifiedOrder;
  tenantName?: string;
  onOrderUpdated: (updated: UnifiedOrder) => void;
  onOrderDeleted?: (orderId: string) => void;
  onOpenEditModal?: (order: UnifiedOrder) => void;
  onOpenDeleteModal?: (order: UnifiedOrder) => void;
  onClose: () => void;
}

const ONLINE_STATUS_LIST: OrderStatus[] = [
  'NEW',
  'IN_SERVICE',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
  'CANCELLED',
];

const TABLE_STATUS_LIST: RestaurantOrderStatus[] = [
  'received',
  'confirmed',
  'preparing',
  'ready',
  'delivered',
  'cancelled',
];

const PAYMENT_METHODS_OPTIONS = [
  'PIX',
  'Cartão de Crédito',
  'Cartão de Débito',
  'Dinheiro',
  'Vale Refeição',
  'Pagamento Online',
];

export const UnifiedOrderDetailModal: React.FC<UnifiedOrderDetailModalProps> = ({
  order: initialOrder,
  tenantName,
  onOrderUpdated,
  onOpenEditModal,
  onOpenDeleteModal,
  onClose,
}) => {
  const [order, setOrder] = useState<UnifiedOrder>(initialOrder);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // Financial & Payment form states
  const [discountInput, setDiscountInput] = useState<string>(
    initialOrder.discount > 0 ? initialOrder.discount.toFixed(2).replace('.', ',') : ''
  );
  const [paymentAmountInput, setPaymentAmountInput] = useState<string>('');
  const [paymentMethodInput, setPaymentMethodInput] = useState<string>(
    initialOrder.paymentMethod !== 'uninformed' && initialOrder.paymentMethodLabel !== 'Não informado'
      ? initialOrder.paymentMethodLabel
      : 'PIX'
  );
  const [paymentNotesInput, setPaymentNotesInput] = useState<string>('');
  const [isSavingFinancial, setIsSavingFinancial] = useState(false);
  const [financialError, setFinancialError] = useState<string | null>(null);
  const [financialSuccess, setFinancialSuccess] = useState<string | null>(null);

  useEffect(() => {
    setOrder(initialOrder);
    setDiscountInput(
      initialOrder.discount > 0 ? initialOrder.discount.toFixed(2).replace('.', ',') : ''
    );
  }, [initialOrder]);

  // Refresh full order details with latest audit history
  const refreshOrderDetails = async () => {
    try {
      const fresh = await api.getUnifiedOrderById(order.id);
      setOrder(fresh);
      onOrderUpdated(fresh);
    } catch {
      // ignore if deleted
    }
  };

  const handleOperationalStatusChange = async (newRawStatus: string) => {
    try {
      setIsUpdatingStatus(true);
      setFinancialError(null);
      if (order.source === 'online') {
        await api.updateOrderStatus(order.id, newRawStatus as OrderStatus);
      } else {
        if (newRawStatus === 'cancelled') {
          await api.cancelRestaurantOrder(order.id, 'Cancelado pelo painel de pedidos');
        } else {
          await api.updateRestaurantOrderStatus(order.id, newRawStatus as RestaurantOrderStatus);
        }
      }
      await refreshOrderDetails();
      setStatusFeedback('Status operacional atualizado!');
      setTimeout(() => setStatusFeedback(null), 2500);
    } catch (err: any) {
      setFinancialError(err.message || 'Erro ao alterar status operacional.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSaveDiscount = async () => {
    const parsed = parseFloat(discountInput.replace(',', '.')) || 0;
    if (parsed < 0) {
      setFinancialError('O desconto não pode ser negativo.');
      return;
    }
    try {
      setIsSavingFinancial(true);
      setFinancialError(null);
      const updated = await api.updateOrderFinancials(order.id, {
        discount: parsed,
      });
      setOrder(updated);
      onOrderUpdated(updated);
      setFinancialSuccess('Desconto atualizado com sucesso!');
      setTimeout(() => setFinancialSuccess(null), 2500);
    } catch (err: any) {
      setFinancialError(err.message || 'Erro ao salvar desconto.');
    } finally {
      setIsSavingFinancial(false);
    }
  };

  const handleAddPartialPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(paymentAmountInput.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      setFinancialError('Informe um valor válido maior que zero para registrar o recebimento.');
      return;
    }
    try {
      setIsSavingFinancial(true);
      setFinancialError(null);
      const updated = await api.updateOrderFinancials(order.id, {
        addPayment: {
          amount,
          paymentMethod: paymentMethodInput,
          notes: paymentNotesInput.trim() || undefined,
        },
      });
      setOrder(updated);
      onOrderUpdated(updated);
      setPaymentAmountInput('');
      setPaymentNotesInput('');
      setFinancialSuccess('Recebimento registrado com sucesso!');
      setTimeout(() => setFinancialSuccess(null), 2500);
    } catch (err: any) {
      setFinancialError(err.message || 'Erro ao registrar recebimento.');
    } finally {
      setIsSavingFinancial(false);
    }
  };

  const handleMarkFullPaid = async () => {
    try {
      setIsSavingFinancial(true);
      setFinancialError(null);
      const updated = await api.updateOrderFinancials(order.id, {
        markFullPaid: true,
        paymentMethodForFullPaid: paymentMethodInput,
      });
      setOrder(updated);
      onOrderUpdated(updated);
      setFinancialSuccess('Pedido marcado como integralmente pago!');
      setTimeout(() => setFinancialSuccess(null), 2500);
    } catch (err: any) {
      setFinancialError(err.message || 'Erro ao quitar pedido.');
    } finally {
      setIsSavingFinancial(false);
    }
  };

  const handlePaymentStatusOverride = async (newPaymentStatus: OrderPaymentStatus) => {
    try {
      setIsSavingFinancial(true);
      setFinancialError(null);
      const updated = await api.updateOrderFinancials(order.id, {
        paymentStatus: newPaymentStatus,
        paymentMethod: paymentMethodInput,
      });
      setOrder(updated);
      onOrderUpdated(updated);
      setFinancialSuccess(`Status financeiro alterado para ${PAYMENT_STATUS_LABELS[newPaymentStatus]}!`);
      setTimeout(() => setFinancialSuccess(null), 2500);
    } catch (err: any) {
      setFinancialError(err.message || 'Erro ao alterar status do pagamento.');
    } finally {
      setIsSavingFinancial(false);
    }
  };

  const handleRemovePayment = async (paymentId: string) => {
    try {
      setIsSavingFinancial(true);
      setFinancialError(null);
      const updated = await api.updateOrderFinancials(order.id, {
        removePaymentId: paymentId,
      });
      setOrder(updated);
      onOrderUpdated(updated);
    } catch (err: any) {
      setFinancialError(err.message || 'Erro ao estornar lançamento.');
    } finally {
      setIsSavingFinancial(false);
    }
  };

  const payColor = PAYMENT_STATUS_COLORS[order.paymentStatus] || PAYMENT_STATUS_COLORS.pending;
  const clientPhoneClean = (order.customerPhone || '').replace(/\D/g, '');
  const clientWhatsAppUrl = clientPhoneClean
    ? `https://wa.me/55${clientPhoneClean}?text=${encodeURIComponent(
        `Olá ${order.customerName}! Estamos entrando em contato sobre o seu Pedido ${order.displayCode}${tenantName ? ` em ${tenantName}` : ''}.`
      )}`
    : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/90">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xl font-black text-slate-900">
              Pedido {order.displayCode}
            </span>
            <span className="px-2.5 py-1 rounded-xl text-xs font-extrabold bg-slate-900 text-white">
              {order.operationalStatusLabel}
            </span>
            <span
              className={`px-2.5 py-1 rounded-xl text-xs font-extrabold border ${payColor.bg} ${payColor.text} ${payColor.border}`}
            >
              Pgto: {order.paymentStatusLabel}
            </span>
            <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {order.originLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onOpenEditModal && (
              <button
                type="button"
                onClick={() => onOpenEditModal(order)}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Editar itens ou dados do pedido"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>
            )}
            {onOpenDeleteModal && (
              <button
                type="button"
                onClick={() => onOpenDeleteModal(order)}
                className="px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Excluir pedido"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {financialError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{financialError}</span>
            </div>
          )}

          {financialSuccess && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{financialSuccess}</span>
            </div>
          )}

          {/* Operational Status Selector */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                Status Operacional ({order.source === 'online' ? 'Catálogo Online' : 'Salão / Mesa'}):
              </label>
              {statusFeedback && (
                <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {statusFeedback}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {order.source === 'online'
                ? ONLINE_STATUS_LIST.map((st) => {
                    const isCurrent = order.rawStatus === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        disabled={isUpdatingStatus}
                        onClick={() => handleOperationalStatusChange(st)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isCurrent
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {ORDER_STATUS_LABELS[st]}
                      </button>
                    );
                  })
                : TABLE_STATUS_LIST.map((st) => {
                    const isCurrent = order.rawStatus === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        disabled={isUpdatingStatus}
                        onClick={() => handleOperationalStatusChange(st)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isCurrent
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {RESTAURANT_STATUS_LABELS[st]}
                      </button>
                    );
                  })}
            </div>
          </div>

          {/* Customer & Fulfillment Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Customer Box */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                Dados do Cliente
              </span>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <strong className="text-slate-900">{order.customerName}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-700">{order.customerPhone || 'Não informado'}</span>
                </div>
                {order.customerEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-700 truncate">{order.customerEmail}</span>
                  </div>
                )}
              </div>

              {clientWhatsAppUrl && (
                <a
                  href={clientWhatsAppUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-bold transition-colors w-full justify-center"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Contatar no WhatsApp</span>
                  <ExternalLink className="w-3 h-3 ml-0.5" />
                </a>
              )}
            </div>

            {/* Fulfillment & Table Info */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                Atendimento & Pagamento
              </span>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  {order.fulfillmentType === 'delivery' ? (
                    <Truck className="w-4 h-4 text-indigo-600" />
                  ) : order.fulfillmentType === 'pickup' ? (
                    <Store className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <UtensilsCrossed className="w-4 h-4 text-amber-600" />
                  )}
                  <span className="font-bold text-slate-900">
                    {order.fulfillmentLabel}
                    {order.tableNumber
                      ? ` — Mesa ${order.tableNumber}${order.tableName ? ` (${order.tableName})` : ''}`
                      : ''}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-slate-700">
                  <CreditCard className="w-4 h-4 text-slate-400" />
                  <span>
                    Forma de Pagamento: <strong>{order.paymentMethodLabel}</strong>
                  </span>
                </div>

                {order.paidAt && (
                  <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      Pago em: {new Date(order.paidAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                )}

                {order.changeFor !== null && order.changeFor !== undefined && (
                  <div className="text-[11px] text-slate-500 pl-6">
                    Troco solicitado para: R$ {order.changeFor.toFixed(2).replace('.', ',')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Delivery Address */}
          {order.fulfillmentType === 'delivery' && order.deliveryAddress && (
            <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-indigo-600 font-bold">
                  <MapPin className="w-4 h-4" />
                  <span>Endereço de Entrega</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {order.deliveryAddress.distanceKm !== null &&
                    order.deliveryAddress.distanceKm !== undefined && (
                      <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-[10px]">
                        Distância: {Number(order.deliveryAddress.distanceKm).toFixed(1).replace('.', ',')} km
                      </span>
                    )}
                  {order.deliveryAddress.appliedRuleName && (
                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-semibold text-[10px]">
                      Regra: {order.deliveryAddress.appliedRuleName}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-slate-700">
                {order.deliveryAddress.street}, nº {order.deliveryAddress.number}
                {order.deliveryAddress.complement ? ` (${order.deliveryAddress.complement})` : ''} —{' '}
                {order.deliveryAddress.neighborhood}, {order.deliveryAddress.city} / {order.deliveryAddress.state} — CEP:{' '}
                {order.deliveryAddress.cep}
              </p>
              {order.deliveryAddress.reference && (
                <p className="text-[11px] text-slate-500 italic">
                  Referência: {order.deliveryAddress.reference}
                </p>
              )}
            </div>
          )}

          {/* Items List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                Itens do Pedido ({order.itemsCount} un.)
              </span>
              <span className="text-[11px] font-semibold text-slate-500">
                Valores históricos registrados no momento da venda
              </span>
            </div>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
              {order.items.map((item) => (
                <div key={item.id} className="p-3.5 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900">
                      {item.quantity}x {item.productName}
                      {item.variantName ? (
                        <span className="text-slate-500 font-normal"> ({item.variantName})</span>
                      ) : (
                        ''
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      R$ {item.unitPrice.toFixed(2).replace('.', ',')} cada
                      {item.notes ? ` • Obs: ${item.notes}` : ''}
                    </div>
                  </div>
                  <div className="font-extrabold text-slate-900">
                    R$ {item.subtotal.toFixed(2).replace('.', ',')}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-amber-600" />
                <span>Observações / Justificativas:</span>
              </div>
              <p className="text-amber-800 italic">{order.notes}</p>
            </div>
          )}

          {/* Complete Financial Summary & Payment Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Financial Breakdown */}
            <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-2.5 text-xs flex flex-col justify-between">
              <div className="space-y-2">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                  Demonstrativo Financeiro do Pedido
                </span>
                <div className="flex justify-between text-slate-700">
                  <span>Subtotal dos Itens:</span>
                  <span className="font-bold">R$ {order.subtotal.toFixed(2).replace('.', ',')}</span>
                </div>
                {order.serviceFee > 0 && (
                  <div className="flex justify-between text-slate-700">
                    <span>Taxa de Serviço / Comanda:</span>
                    <span className="font-bold text-indigo-700">
                      + R$ {order.serviceFee.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                )}
                {order.fulfillmentType !== 'dine_in' && (
                  <div className="flex justify-between text-slate-700">
                    <span>Taxa de Entrega:</span>
                    <span className="font-bold text-emerald-700">
                      {order.fulfillmentType === 'pickup'
                        ? 'Grátis (Retirada)'
                        : order.deliveryFee === 0
                        ? 'GRÁTIS'
                        : `+ R$ ${order.deliveryFee.toFixed(2).replace('.', ',')}`}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-rose-700 pt-1">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" />
                    Desconto Concedido:
                  </span>
                  <span className="font-bold">
                    - R$ {order.discount.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-indigo-200/80 space-y-1.5">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-extrabold text-slate-900">Total Final:</span>
                  <span className="text-xl font-black text-slate-900">
                    R$ {order.total.toFixed(2).replace('.', ',')}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>Recebido Confirmado:</span>
                  <span>R$ {order.paidAmount.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between text-amber-800 font-bold">
                  <span>Saldo Pendente a Receber:</span>
                  <span>R$ {order.pendingAmount.toFixed(2).replace('.', ',')}</span>
                </div>
              </div>
            </div>

            {/* Payment & Discount Registration Box */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3 text-xs">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                Controle de Pagamento & Desconto
              </span>

              {/* Quick Discount Input */}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Desconto no Pedido (R$)
                  </label>
                  <input
                    type="text"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
                <button
                  type="button"
                  disabled={isSavingFinancial}
                  onClick={handleSaveDiscount}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Aplicar Desconto
                </button>
              </div>

              {/* Payment Status Quick Buttons */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Situação do Pagamento:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(['pending', 'partial', 'paid', 'refunded'] as OrderPaymentStatus[]).map((st) => {
                    const active = order.paymentStatus === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        disabled={isSavingFinancial}
                        onClick={() =>
                          st === 'paid' && order.pendingAmount > 0
                            ? handleMarkFullPaid()
                            : handlePaymentStatusOverride(st)
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                          active
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {PAYMENT_STATUS_LABELS[st]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Partial / Split Payment Form */}
              {order.operationalStatus !== 'cancelled' && (
                <form onSubmit={handleAddPartialPayment} className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="font-bold text-slate-700 flex items-center justify-between">
                    <span>Registrar Pagamento (Parcial ou Total)</span>
                    {order.pendingAmount > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentAmountInput(order.pendingAmount.toFixed(2).replace('.', ','))
                        }
                        className="text-[11px] text-indigo-600 hover:underline cursor-pointer"
                      >
                        Preencher saldo (R$ {order.pendingAmount.toFixed(2).replace('.', ',')})
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={paymentAmountInput}
                      onChange={(e) => setPaymentAmountInput(e.target.value)}
                      placeholder="Valor (ex: 45,00)"
                      className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                    />
                    <select
                      value={paymentMethodInput}
                      onChange={(e) => setPaymentMethodInput(e.target.value)}
                      className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                    >
                      {PAYMENT_METHODS_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={paymentNotesInput}
                      onChange={(e) => setPaymentNotesInput(e.target.value)}
                      placeholder="Obs (ex: Parte Cliente 1, PIX confirmado)"
                      className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                    <button
                      type="submit"
                      disabled={isSavingFinancial}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {isSavingFinancial ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      <span>Receber</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Registered Payment Records */}
              {order.payments && order.payments.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">
                    Pagamentos Registrados ({order.payments.length})
                  </span>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {order.payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-2.5 py-1.5 bg-emerald-50/70 border border-emerald-200/70 rounded-lg text-[11px]"
                      >
                        <div>
                          <strong className="text-emerald-900">
                            R$ {p.amount.toFixed(2).replace('.', ',')}
                          </strong>{' '}
                          <span className="text-emerald-700">({p.paymentMethodLabel})</span>
                          {p.notes && <span className="text-slate-500"> • {p.notes}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500">
                            {new Date(p.paidAt).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {!p.id.startsWith('auto-') && (
                            <button
                              type="button"
                              onClick={() => handleRemovePayment(p.id)}
                              className="text-rose-500 hover:text-rose-700 cursor-pointer"
                              title="Remover lançamento"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Order Alteration & Audit History */}
          {order.history && order.history.length > 0 && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
              <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                <History className="w-4 h-4 text-indigo-600" />
                <span>Histórico de Alterações e Eventos do Pedido</span>
              </div>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {order.history.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-start justify-between gap-3 p-2.5 bg-white rounded-xl border border-slate-200/80"
                  >
                    <div className="space-y-0.5">
                      <span className="font-bold text-slate-800 block">{h.description}</span>
                      {h.actorName && (
                        <span className="text-[10px] text-slate-500 block">
                          Responsável: {h.actorName}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {new Date(h.timestamp).toLocaleString('pt-BR')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            Criado em: <strong>{new Date(order.createdAt).toLocaleString('pt-BR')}</strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Fechar Detalhes
          </button>
        </div>
      </div>
    </div>
  );
};
