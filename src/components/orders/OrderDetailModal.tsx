import React, { useState } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  MapPin,
  Truck,
  Store,
  CreditCard,
  Banknote,
  QrCode,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
  ExternalLink,
  ChevronDown,
  Edit2,
  Trash2,
} from 'lucide-react';
import {
  Order,
  OrderStatus,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  PAYMENT_METHOD_LABELS,
} from '../../types/order';
import { OrderEditModal } from './OrderEditModal';
import { ConfirmModal } from '../common/ConfirmModal';
import { api } from '../../services/api';

interface OrderDetailModalProps {
  order: Order;
  tenantName?: string;
  onUpdateStatus: (orderId: string, newStatus: OrderStatus) => Promise<void>;
  onOrderUpdated: (updated: Order) => void;
  onOrderDeleted: (orderId: string) => void;
  onClose: () => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  tenantName,
  onUpdateStatus,
  onOrderUpdated,
  onOrderDeleted,
  onClose,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus>(order.status);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  // Edit & Delete state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const statusList: OrderStatus[] = [
    'NEW',
    'IN_SERVICE',
    'CONFIRMED',
    'PREPARING',
    'READY_FOR_PICKUP',
    'OUT_FOR_DELIVERY',
    'COMPLETED',
    'CANCELLED',
  ];

  const handleStatusChange = async (newStatus: OrderStatus) => {
    try {
      setIsUpdating(true);
      await onUpdateStatus(order.id, newStatus);
      setSelectedStatus(newStatus);
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 2500);
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar status.');
    } finally {
      setIsUpdating(false);
    }
  };

  const statusColor = ORDER_STATUS_COLORS[selectedStatus] || ORDER_STATUS_COLORS.NEW;

  // WhatsApp link to client
  const clientPhoneClean = (order.customerPhone || '').replace(/\D/g, '');
  const clientWhatsAppUrl = clientPhoneClean
    ? `https://wa.me/55${clientPhoneClean}?text=${encodeURIComponent(
        `Olá ${order.customerName}! Estamos entrando em contato a respeito do seu Pedido #${order.orderNumber}.`
      )}`
    : null;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
        <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
            <div className="flex items-center gap-3">
              <span className="text-xl font-black text-slate-900">
                Pedido #{order.orderNumber}
              </span>
              <div
                className={`px-3 py-1 rounded-xl text-xs font-extrabold border ${statusColor.bg} ${statusColor.text} ${statusColor.border}`}
              >
                {ORDER_STATUS_LABELS[selectedStatus]}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Editar pedido"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Excluir pedido"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </button>
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
            {/* Status Quick Changer */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Alterar Status do Pedido:
                </label>
                {updateSuccess && (
                  <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Status atualizado com sucesso!
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {statusList.map((st) => {
                  const isCurrent = selectedStatus === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleStatusChange(st)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {ORDER_STATUS_LABELS[st]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Customer & Fulfillment Info */}
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
                    <span className="text-slate-700">{order.customerPhone}</span>
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

              {/* Fulfillment Box */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Modalidade e Pagamento
                </span>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    {order.fulfillmentType === 'delivery' ? (
                      <Truck className="w-4 h-4 text-indigo-600" />
                    ) : (
                      <Store className="w-4 h-4 text-emerald-600" />
                    )}
                    <span className="font-bold text-slate-900">
                      {order.fulfillmentType === 'delivery' ? 'Entrega em Domicílio' : 'Retirada no Local'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-700">
                    <CreditCard className="w-4 h-4 text-slate-400" />
                    <span>Pagamento: <strong>{PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}</strong></span>
                  </div>

                  {order.changeFor !== null && order.changeFor !== undefined && (
                    <div className="text-[11px] text-slate-500 pl-6">
                      Troco para: R$ {order.changeFor.toFixed(2).replace('.', ',')}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Delivery Address (if applicable) */}
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
                {order.deliveryAddress.deliveryBreakdown && (
                  <p className="text-[11px] text-indigo-600 font-medium pt-1 border-t border-slate-100">
                    Cálculo do frete: {order.deliveryAddress.deliveryBreakdown}
                  </p>
                )}
              </div>
            )}

            {/* Items List */}
            <div className="space-y-3">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                Itens Solicitados
              </span>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                {order.items.map((item) => (
                  <div key={item.id} className="p-3.5 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900">
                        {item.quantity}x {item.productName}
                        {item.variantName ? <span className="text-slate-500 font-normal"> ({item.variantName})</span> : ''}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        R$ {item.unitPrice.toFixed(2).replace('.', ',')} cada
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
                  <span>Observações do Cliente:</span>
                </div>
                <p className="text-amber-800 italic">{order.notes}</p>
              </div>
            )}

            {/* Totals */}
            <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-2 text-xs">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                Resumo Financeiro
              </span>
              <div className="flex justify-between text-slate-600">
                <span>Subtotal dos Itens:</span>
                <span className="font-bold">R$ {order.subtotal.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Taxa de Entrega:</span>
                <span className="font-bold text-emerald-700">
                  {order.fulfillmentType === 'pickup'
                    ? 'Grátis (Retirada)'
                    : order.deliveryFee === 0
                    ? 'GRÁTIS'
                    : `R$ ${order.deliveryFee.toFixed(2).replace('.', ',')}`}
                </span>
              </div>
              <div className="pt-2 border-t border-indigo-200 flex justify-between items-baseline">
                <span className="text-sm font-extrabold text-slate-900">Total:</span>
                <span className="text-xl font-black text-slate-900">
                  R$ {order.total.toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="text-[11px] text-slate-400">
              Criado em: {new Date(order.createdAt).toLocaleString('pt-BR')}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>

      <OrderEditModal
        isOpen={isEditModalOpen}
        order={order}
        onClose={() => setIsEditModalOpen(false)}
        onOrderUpdated={onOrderUpdated}
      />

      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        title="Excluir Pedido"
        message={`Tem certeza que deseja excluir o pedido #${order.orderNumber} ${tenantName ? `de ${tenantName}` : ''}? Esta ação removerá o registro permanentemente do sistema.`}
        confirmText="Sim, excluir pedido"
        cancelText="Cancelar"
        isDestructive={true}
        loading={deleting}
        onConfirm={async () => {
          try {
            setDeleting(true);
            await api.deleteOrder(order.id);
            onOrderDeleted(order.id);
            setIsDeleteConfirmOpen(false);
            onClose();
          } catch (err: any) {
            alert(err.message || 'Erro ao excluir pedido.');
          } finally {
            setDeleting(false);
          }
        }}
        onCancel={() => setIsDeleteConfirmOpen(false)}
      />
    </>
  );
};
