import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Sliders,
  Search,
  Filter,
  RefreshCw,
  Eye,
  CheckCircle2,
  Clock,
  Truck,
  Store,
  DollarSign,
  AlertTriangle,
  User,
  Phone,
  Calendar,
  ChevronRight,
  TrendingUp,
  Inbox,
  Loader2,
  Edit2,
  Trash2,
} from 'lucide-react';
import { Tenant } from '../../types/saas';
import {
  Order,
  OrderStatus,
  OrdersSummary,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  PAYMENT_METHOD_LABELS,
  FulfillmentType,
} from '../../types/order';
import { api } from '../../services/api';
import { OrderDetailModal } from './OrderDetailModal';
import { OrderEditModal } from './OrderEditModal';
import { DeliverySettingsTab } from './DeliverySettingsTab';
import { ConfirmModal } from '../common/ConfirmModal';

interface OrdersManagerProps {
  tenant: Tenant;
}

export const OrdersManager: React.FC<OrdersManagerProps> = ({ tenant }) => {
  const [activeTab, setActiveTab] = useState<'orders' | 'settings'>('orders');

  // Orders list state
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<OrdersSummary | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentType | 'all'>('all');

  // Modals state
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (activeTab === 'orders') {
      fetchOrders();
    }
  }, [activeTab, statusFilter, fulfillmentFilter]);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [resOrders, resSummary] = await Promise.all([
        api.getOrders({
          search: search.trim() || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          fulfillmentType: fulfillmentFilter !== 'all' ? fulfillmentFilter : undefined,
        }),
        api.getOrdersSummary(),
      ]);

      setOrders(resOrders.orders);
      setTotalCount(resOrders.total);
      setSummary(resSummary);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar lista de pedidos.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrders();
  };

  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    const updated = await api.updateOrderStatus(orderId, newStatus);
    setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder(updated);
    }
    api.getOrdersSummary().then(setSummary).catch(() => {});
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Gestão de Pedidos & Vendas
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gerencie os pedidos recebidos através do catálogo público, edite, altere status e configure taxas de entrega.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex bg-slate-200/70 p-1 rounded-2xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'orders'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Pedidos</span>
            {summary && summary.ordersNewCount > 0 && (
              <span className="px-1.5 py-0.2 bg-blue-600 text-white text-[10px] rounded-full font-black ml-1">
                {summary.ordersNewCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'settings'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Configurações</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB: PEDIDOS */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          {/* Summary Metric Cards */}
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    Total Hoje
                  </span>
                  <span className="text-lg font-black text-slate-900">{summary.ordersTodayCount}</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    Novos Pedidos
                  </span>
                  <span className="text-lg font-black text-amber-600">{summary.ordersNewCount}</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    Concluídos Hoje
                  </span>
                  <span className="text-lg font-black text-emerald-600">{summary.ordersCompletedCount}</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    Faturamento Hoje
                  </span>
                  <span className="text-base font-black text-slate-900">
                    R$ {summary.ordersTodayTotal.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
            <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por cliente, telefone..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
              />
            </form>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Todos os Status</option>
                <option value="NEW">Novo</option>
                <option value="CONFIRMED">Confirmado</option>
                <option value="PREPARING">Em Preparação</option>
                <option value="READY_FOR_PICKUP">Pronto para Retirada</option>
                <option value="OUT_FOR_DELIVERY">Saiu para Entrega</option>
                <option value="COMPLETED">Finalizado</option>
                <option value="CANCELLED">Cancelado</option>
              </select>

              {/* Fulfillment Filter */}
              <select
                value={fulfillmentFilter}
                onChange={(e) => setFulfillmentFilter(e.target.value as any)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Todas as Modalidades</option>
                <option value="delivery">Entrega</option>
                <option value="pickup">Retirada</option>
              </select>

              <button
                type="button"
                onClick={fetchOrders}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors cursor-pointer"
                title="Atualizar lista"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Orders Table */}
          {isLoading ? (
            <div className="py-20 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : error ? (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-3xl text-rose-700 text-xs text-center flex flex-col items-center gap-2">
              <AlertTriangle className="w-6 h-6" />
              <span>{error}</span>
              <button onClick={fetchOrders} className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold mt-2">
                Tentar Novamente
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-16 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                <Inbox className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 text-base">Nenhum pedido encontrado</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Os pedidos realizados pelos clientes no seu catálogo digital aparecerão aqui em tempo real.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Pedido</th>
                      <th className="py-3 px-4">Data / Hora</th>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4">Tipo</th>
                      <th className="py-3 px-4">Pagamento</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((o) => {
                      const statusColor = ORDER_STATUS_COLORS[o.status] || ORDER_STATUS_COLORS.NEW;
                      return (
                        <tr
                          key={o.id}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                          onClick={() => setSelectedOrder(o)}
                        >
                          <td className="py-3 px-4">
                            <span className="font-black text-slate-900 group-hover:text-indigo-600 transition-colors">
                              #{o.orderNumber}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500">
                            {new Date(o.createdAt).toLocaleDateString('pt-BR')}{' '}
                            <span className="text-[10px] opacity-75">
                              {new Date(o.createdAt).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <strong className="block text-slate-900">{o.customerName}</strong>
                            <span className="text-[11px] text-slate-500">{o.customerPhone}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                o.fulfillmentType === 'delivery'
                                  ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {o.fulfillmentType === 'delivery' ? 'Entrega' : 'Retirada'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            {PAYMENT_METHOD_LABELS[o.paymentMethod] || o.paymentMethod}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border ${statusColor.bg} ${statusColor.text} ${statusColor.border}`}
                            >
                              {ORDER_STATUS_LABELS[o.status]}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-black text-slate-900 text-sm">
                            R$ {o.total.toFixed(2).replace('.', ',')}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setSelectedOrder(o)}
                                className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
                                title="Ver detalhes"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingOrder(o)}
                                className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
                                title="Editar pedido"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingOrder(o)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                                title="Excluir pedido"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB: CONFIGURAÇÕES */}
      {activeTab === 'settings' && <DeliverySettingsTab tenantId={tenant.id} />}

      {/* DETAIL MODAL */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          tenantName={tenant.name}
          onUpdateStatus={handleUpdateStatus}
          onOrderUpdated={(updated) => {
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            setSelectedOrder(updated);
            fetchOrders();
          }}
          onOrderDeleted={(orderId) => {
            setOrders((prev) => prev.filter((o) => o.id !== orderId));
            setSelectedOrder(null);
            fetchOrders();
          }}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {/* EDIT MODAL FROM ROW */}
      {editingOrder && (
        <OrderEditModal
          isOpen={!!editingOrder}
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
          onOrderUpdated={(updated) => {
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            setEditingOrder(null);
            fetchOrders();
          }}
        />
      )}

      {/* DELETE CONFIRM MODAL FROM ROW */}
      <ConfirmModal
        isOpen={!!deletingOrder}
        title="Excluir Pedido"
        message={`Tem certeza que deseja excluir o pedido #${deletingOrder?.orderNumber} de ${tenant.name}? Esta ação removerá o registro permanentemente do sistema.`}
        confirmText="Sim, excluir pedido"
        cancelText="Cancelar"
        isDestructive={true}
        loading={deleting}
        onConfirm={async () => {
          if (!deletingOrder) return;
          try {
            setDeleting(true);
            await api.deleteOrder(deletingOrder.id);
            setOrders((prev) => prev.filter((o) => o.id !== deletingOrder.id));
            setDeletingOrder(null);
            fetchOrders();
          } catch (err: any) {
            alert(err.message || 'Erro ao excluir pedido.');
          } finally {
            setDeleting(false);
          }
        }}
        onCancel={() => setDeletingOrder(null)}
      />
    </div>
  );
};
