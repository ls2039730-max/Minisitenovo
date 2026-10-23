import React, { useState, useEffect, useCallback } from 'react';
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
  UtensilsCrossed,
  DollarSign,
  AlertTriangle,
  Download,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Edit2,
  Trash2,
  RotateCcw,
  Check,
  CreditCard,
  Hash,
  User,
  Phone,
  Layers,
} from 'lucide-react';
import { Tenant } from '../../types/saas';
import { Order } from '../../types/order';
import { RestaurantOrder, RestaurantTable } from '../../types/restaurant';
import {
  UnifiedOrder,
  AdvancedOrderFilterParams,
  PeriodFilterPreset,
  PERIOD_PRESET_LABELS,
  OPERATIONAL_STATUS_LABELS,
  OPERATIONAL_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  FULFILLMENT_TYPE_LABELS,
  ORIGIN_CHANNEL_LABELS,
} from '../../types/analytics';
import { api } from '../../services/api';
import { exportUnifiedOrdersToCsv } from '../../utils/csvExport';
import { UnifiedOrderDetailModal } from './UnifiedOrderDetailModal';
import { OrderEditModal } from './OrderEditModal';
import { RestaurantOrderEditModal } from '../restaurant/modals/RestaurantOrderEditModal';
import { DeliverySettingsTab } from './DeliverySettingsTab';
import { ConfirmModal } from '../common/ConfirmModal';

interface OrdersManagerProps {
  tenant: Tenant;
}

const DEFAULT_FILTERS: AdvancedOrderFilterParams = {
  period: 'all',
  startDate: '',
  endDate: '',
  operationalStatus: 'all',
  paymentStatus: 'all',
  paymentMethod: 'all',
  fulfillmentType: 'all',
  tableId: 'all',
  orderNumber: '',
  customerName: '',
  customerPhone: '',
  minAmount: '',
  maxAmount: '',
  originChannel: 'all',
  search: '',
  sortBy: 'date',
  sortDirection: 'desc',
  page: 1,
  limit: 20,
};

export const OrdersManager: React.FC<OrdersManagerProps> = ({ tenant }) => {
  const [activeTab, setActiveTab] = useState<'orders' | 'settings'>('orders');

  // Draft filters (in form inputs) vs Applied filters (sent to server)
  const [draftFilters, setDraftFilters] = useState<AdvancedOrderFilterParams>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AdvancedOrderFilterParams>(DEFAULT_FILTERS);
  const [quickOrderNumber, setQuickOrderNumber] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(true);

  // Data state
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filteredSummary, setFilteredSummary] = useState({
    grossTotal: 0,
    discountsTotal: 0,
    deliveryFeeTotal: 0,
    serviceFeeTotal: 0,
    netTotal: 0,
    paidTotal: 0,
    pendingTotal: 0,
    validCount: 0,
    cancelledCount: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [selectedOrder, setSelectedOrder] = useState<UnifiedOrder | null>(null);
  const [editingOnlineOrder, setEditingOnlineOrder] = useState<Order | null>(null);
  const [editingTableOrder, setEditingTableOrder] = useState<RestaurantOrder | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<UnifiedOrder | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load restaurant tables once for the table filter dropdown
  useEffect(() => {
    api
      .getRestaurantTables()
      .then((list) => setTables(list || []))
      .catch(() => {});
  }, [tenant.id]);

  const fetchOrders = useCallback(async (filtersToRun: AdvancedOrderFilterParams) => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.getUnifiedOrders(filtersToRun);
      setOrders(res.orders);
      setTotalCount(res.total);
      const s = (res.summary || {}) as any;
      setFilteredSummary({
        grossTotal: s.grossTotal ?? s.filteredGrossTotal ?? 0,
        discountsTotal: s.discountsTotal ?? 0,
        deliveryFeeTotal: s.deliveryFeeTotal ?? 0,
        serviceFeeTotal: s.serviceFeeTotal ?? 0,
        netTotal: s.netTotal ?? s.filteredNetTotal ?? 0,
        paidTotal: s.paidTotal ?? s.filteredPaidTotal ?? 0,
        pendingTotal: s.pendingTotal ?? s.filteredPendingTotal ?? 0,
        validCount: s.validCount ?? res.total ?? 0,
        cancelledCount: s.cancelledCount ?? 0,
      });
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar catálogo de pedidos.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'orders') {
      fetchOrders(appliedFilters);
    }
  }, [activeTab, appliedFilters, fetchOrders]);

  const handleApplyFilters = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const nextFilters: AdvancedOrderFilterParams = {
      ...draftFilters,
      orderNumber: quickOrderNumber.trim() || draftFilters.orderNumber,
      page: 1,
    };
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
  };

  const handleClearFilters = () => {
    setQuickOrderNumber('');
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  };

  const handleQuickOrderNumberSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const nextFilters: AdvancedOrderFilterParams = {
      ...draftFilters,
      orderNumber: quickOrderNumber.trim(),
      page: 1,
    };
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
  };

  const handleSortChange = (field: 'date' | 'total' | 'status') => {
    const nextDirection =
      appliedFilters.sortBy === field && appliedFilters.sortDirection === 'desc' ? 'asc' : 'desc';
    const nextFilters: AdvancedOrderFilterParams = {
      ...appliedFilters,
      sortBy: field,
      sortDirection: nextDirection,
      page: 1,
    };
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    const nextFilters: AdvancedOrderFilterParams = {
      ...appliedFilters,
      page: newPage,
    };
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
  };

  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      // Fetch all matching records for the current filter (up to 500)
      const fullRes = await api.getUnifiedOrders({
        ...appliedFilters,
        page: 1,
        limit: 500,
      });
      exportUnifiedOrdersToCsv(fullRes.orders, `pedidos-${tenant.slug}`);
    } catch (err: any) {
      alert(err.message || 'Erro ao exportar CSV.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenEdit = async (uOrder: UnifiedOrder) => {
    try {
      if (uOrder.source === 'online') {
        const fullOnline = await api.getOrder(uOrder.id);
        setEditingOnlineOrder(fullOnline);
      } else {
        const fullTable = await api.getRestaurantOrder(uOrder.id);
        setEditingTableOrder(fullTable);
      }
    } catch (err: any) {
      alert(err.message || 'Não foi possível carregar o pedido para edição.');
    }
  };

  const formatMoney = (val: number) =>
    `R$ ${Number(val || 0)
      .toFixed(2)
      .replace('.', ',')}`;

  return (
    <div className="flex-1 overflow-y-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Catálogo Geral de Pedidos & Vendas
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Acompanhe pedidos de entrega, retirada e consumo nas mesas com filtros combináveis, controle de pagamento e exportação CSV.
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
            <span>Catálogo de Pedidos</span>
            <span className="px-1.5 py-0.2 bg-indigo-600 text-white text-[10px] rounded-full font-black ml-1">
              {totalCount}
            </span>
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
            <span>Configurações de Entrega</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB: PEDIDOS */}
      {activeTab === 'orders' && (
        <div className="space-y-5">
          {/* Filtered Summary KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                Resultados Encontrados
              </span>
              <div className="text-xl font-black text-slate-900 mt-1">{totalCount}</div>
              <span className="text-[11px] text-slate-500">
                {filteredSummary.validCount} válidos • {filteredSummary.cancelledCount} cancelados
              </span>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                Faturamento Bruto (Filtro)
              </span>
              <div className="text-lg font-black text-slate-900 mt-1">
                {formatMoney(filteredSummary.grossTotal)}
              </div>
              <span className="text-[11px] text-slate-500">
                Descontos: {formatMoney(filteredSummary.discountsTotal)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                Vendas Líquidas (Filtro)
              </span>
              <div className="text-lg font-black text-indigo-700 mt-1">
                {formatMoney(filteredSummary.netTotal)}
              </div>
              <span className="text-[11px] text-slate-500">
                Frete: {formatMoney(filteredSummary.deliveryFeeTotal)}
              </span>
            </div>

            <div className="bg-emerald-50/70 p-4 rounded-3xl border border-emerald-200 shadow-xs">
              <span className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider block">
                Recebimentos Confirmados
              </span>
              <div className="text-lg font-black text-emerald-900 mt-1">
                {formatMoney(filteredSummary.paidTotal)}
              </div>
              <span className="text-[11px] text-emerald-700">Efetivamente pago</span>
            </div>

            <div className="bg-amber-50/70 p-4 rounded-3xl border border-amber-200 shadow-xs col-span-2 sm:col-span-1">
              <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider block">
                Valores a Receber
              </span>
              <div className="text-lg font-black text-amber-950 mt-1">
                {formatMoney(filteredSummary.pendingTotal)}
              </div>
              <span className="text-[11px] text-amber-800">Pendente / Parcial</span>
            </div>
          </div>

          {/* Quick Search Bar + Actions */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              {/* Quick Search by Order Number */}
              <form
                onSubmit={handleQuickOrderNumberSearch}
                className="flex items-center gap-2 flex-1 max-w-md"
              >
                <div className="relative flex-1">
                  <Hash className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={quickOrderNumber}
                    onChange={(e) => {
                      setQuickOrderNumber(e.target.value);
                      setDraftFilters((prev) => ({ ...prev, orderNumber: e.target.value }));
                    }}
                    placeholder="Busca rápida por nº ou código do pedido (ex: 1004, #12)..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  Buscar Nº
                </button>
              </form>

              {/* Toolbar Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                    showAdvancedFilters
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>{showAdvancedFilters ? 'Ocultar Filtros' : 'Filtros Avançados'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={isExporting || totalCount === 0}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  {isExporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>Exportar CSV ({totalCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => fetchOrders(appliedFilters)}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
                  title="Atualizar dados agora"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
                </button>
              </div>
            </div>

            {/* Combinable Advanced Filters Panel */}
            {showAdvancedFilters && (
              <form
                onSubmit={handleApplyFilters}
                className="pt-4 border-t border-slate-100 space-y-4 animate-in fade-in"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {/* 1. Período */}
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
                      Período
                    </label>
                    <select
                      value={draftFilters.period || 'all'}
                      onChange={(e) =>
                        setDraftFilters((prev) => ({
                          ...prev,
                          period: e.target.value as PeriodFilterPreset,
                        }))
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                    >
                      {(Object.keys(PERIOD_PRESET_LABELS) as PeriodFilterPreset[]).map((key) => (
                        <option key={key} value={key}>
                          {PERIOD_PRESET_LABELS[key]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Custom Date Range if period === 'custom' */}
                  {draftFilters.period === 'custom' && (
                    <>
                      <div>
                        <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
                          Data Inicial
                        </label>
                        <input
                          type="date"
                          value={draftFilters.startDate || ''}
                          onChange={(e) =>
                            setDraftFilters((prev) => ({ ...prev, startDate: e.target.value }))
                          }
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
                          Data Final
                        </label>
                        <input
                          type="date"
                          value={draftFilters.endDate || ''}
                          onChange={(e) =>
                            setDraftFilters((prev) => ({ ...prev, endDate: e.target.value }))
                          }
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                        />
                      </div>
                    </>
                  )}

                  {/* 2. Status do Pedido */}
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
                      Status Operacional
                    </label>
                    <select
                      value={draftFilters.operationalStatus || 'all'}
                      onChange={(e) =>
                        setDraftFilters((prev) => ({ ...prev, operationalStatus: e.target.value }))
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                    >
                      <option value="all">Todos os Status</option>
                      <option value="received">Novo / Recebido</option>
                      <option value="confirmed">Confirmado</option>
                      <option value="preparing">Em Preparação</option>
                      <option value="ready">Pronto</option>
                      <option value="out_for_delivery">Saiu para Entrega</option>
                      <option value="completed">Entregue / Finalizado</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>

                  {/* 3. Status do Pagamento */}
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
                      Status do Pagamento
                    </label>
                    <select
                      value={draftFilters.paymentStatus || 'all'}
                      onChange={(e) =>
                        setDraftFilters((prev) => ({ ...prev, paymentStatus: e.target.value as any }))
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                    >
                      <option value="all">Todos os Status Financeiros</option>
                      <option value="paid">Pago (Confirmado)</option>
                      <option value="pending">Pendente (Em Aberto)</option>
                      <option value="partial">Pago Parcialmente</option>
                      <option value="cancelled">Cancelado</option>
                      <option value="refunded">Estornado</option>
                    </select>
                  </div>

                  {/* 4. Forma de Pagamento */}
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
                      Forma de Pagamento
                    </label>
                    <select
                      value={draftFilters.paymentMethod || 'all'}
                      onChange={(e) =>
                        setDraftFilters((prev) => ({ ...prev, paymentMethod: e.target.value }))
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                    >
                      <option value="all">Todas as Formas</option>
                      <option value="pix">PIX</option>
                      <option value="credit_card">Cartão de Crédito</option>
                      <option value="debit_card">Cartão de Débito</option>
                      <option value="cash">Dinheiro</option>
                      <option value="voucher">Vale Refeição / Voucher</option>
                      <option value="online">Pagamento Online</option>
                      <option value="uninformed">Não informado / Em aberto</option>
                    </select>
                  </div>

                  {/* 5. Tipo de Atendimento */}
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
                      Tipo de Atendimento
                    </label>
                    <select
                      value={draftFilters.fulfillmentType || 'all'}
                      onChange={(e) =>
                        setDraftFilters((prev) => ({ ...prev, fulfillmentType: e.target.value as any }))
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                    >
                      <option value="all">Todas as Modalidades</option>
                      <option value="delivery">Entrega (Delivery)</option>
                      <option value="pickup">Retirada no Local</option>
                      <option value="dine_in">Consumo no Local (Mesa)</option>
                    </select>
                  </div>

                  {/* 6. Mesa */}
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
                      Mesa
                    </label>
                    <select
                      value={draftFilters.tableId || 'all'}
                      onChange={(e) =>
                        setDraftFilters((prev) => ({ ...prev, tableId: e.target.value }))
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                    >
                      <option value="all">Todas as Mesas</option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.id}>
                          Mesa {t.tableNumber} {t.name ? `(${t.name})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 7. Origem do Pedido */}
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
                      Canal / Origem
                    </label>
                    <select
                      value={draftFilters.originChannel || 'all'}
                      onChange={(e) =>
                        setDraftFilters((prev) => ({ ...prev, originChannel: e.target.value as any }))
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                    >
                      <option value="all">Todos os Canais</option>
                      <option value="online_catalog">Catálogo Online</option>
                      <option value="qr_table">QR Code na Mesa</option>
                      <option value="counter_pos">Balcão / PDV</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>
                  </div>

                  {/* 8. Nome do Cliente */}
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
                      Nome do Cliente
                    </label>
                    <input
                      type="text"
                      value={draftFilters.customerName || ''}
                      onChange={(e) =>
                        setDraftFilters((prev) => ({ ...prev, customerName: e.target.value }))
                      }
                      placeholder="Ex: Maria, João..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                    />
                  </div>

                  {/* 9. Telefone do Cliente */}
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
                      Telefone do Cliente
                    </label>
                    <input
                      type="text"
                      value={draftFilters.customerPhone || ''}
                      onChange={(e) =>
                        setDraftFilters((prev) => ({ ...prev, customerPhone: e.target.value }))
                      }
                      placeholder="Ex: 1199999..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                    />
                  </div>

                  {/* 10. Faixa de Valor (Mínimo e Máximo) */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
                        Valor Mín (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={draftFilters.minAmount ?? ''}
                        onChange={(e) =>
                          setDraftFilters((prev) => ({
                            ...prev,
                            minAmount: e.target.value ? Number(e.target.value) : undefined,
                          }))
                        }
                        placeholder="0,00"
                        className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
                        Valor Máx (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={draftFilters.maxAmount ?? ''}
                        onChange={(e) =>
                          setDraftFilters((prev) => ({
                            ...prev,
                            maxAmount: e.target.value ? Number(e.target.value) : undefined,
                          }))
                        }
                        placeholder="999,00"
                        className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {/* Filter Actions Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Ordenar por:</span>
                    <button
                      type="button"
                      onClick={() => handleSortChange('date')}
                      className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer ${
                        appliedFilters.sortBy === 'date'
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span>Data</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSortChange('total')}
                      className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer ${
                        appliedFilters.sortBy === 'total'
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span>Valor</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSortChange('status')}
                      className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer ${
                        appliedFilters.sortBy === 'status'
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span>Status</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleClearFilters}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Limpar Filtros</span>
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Aplicar Filtros</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* Orders Catalog Table */}
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-2 bg-white rounded-3xl border border-slate-200">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <span className="text-xs text-slate-500 font-semibold">
                Consultando pedidos no banco de dados...
              </span>
            </div>
          ) : error ? (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-3xl text-rose-700 text-xs text-center flex flex-col items-center gap-2">
              <AlertTriangle className="w-6 h-6" />
              <span>{error}</span>
              <button
                onClick={() => fetchOrders(appliedFilters)}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold mt-2 cursor-pointer"
              >
                Tentar Novamente
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-14 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                <Inbox className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 text-base">
                Nenhum pedido encontrado para os filtros aplicados
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Altere o período ou clique em &ldquo;Limpar Filtros&rdquo; para visualizar todos os pedidos registrados no estabelecimento.
              </p>
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-500 transition-colors cursor-pointer"
              >
                Limpar Todos os Filtros
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/90 border-b border-slate-200 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Pedido / Canal</th>
                      <th className="py-3.5 px-3">Data e Hora</th>
                      <th className="py-3.5 px-3">Cliente</th>
                      <th className="py-3.5 px-3">Atendimento / Mesa</th>
                      <th className="py-3.5 px-3">Itens</th>
                      <th className="py-3.5 px-3 text-right">Subtotal / Taxas</th>
                      <th className="py-3.5 px-3 text-right">Total</th>
                      <th className="py-3.5 px-3">Status Operacional</th>
                      <th className="py-3.5 px-3">Pagamento</th>
                      <th className="py-3.5 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {orders.map((o) => {
                      const opColor =
                        OPERATIONAL_STATUS_COLORS[o.operationalStatus] ||
                        OPERATIONAL_STATUS_COLORS.received;
                      const payColor =
                        PAYMENT_STATUS_COLORS[o.paymentStatus] || PAYMENT_STATUS_COLORS.pending;

                      return (
                        <tr
                          key={`${o.source}-${o.id}`}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                          onClick={() => setSelectedOrder(o)}
                        >
                          {/* Pedido / Canal */}
                          <td className="py-3.5 px-4">
                            <span className="font-black text-slate-900 group-hover:text-indigo-600 transition-colors block text-sm">
                              {o.displayCode}
                            </span>
                            <span className="text-[10px] text-slate-400 font-semibold">
                              {o.originLabel}
                            </span>
                          </td>

                          {/* Data e Hora */}
                          <td className="py-3.5 px-3 text-slate-600 whitespace-nowrap">
                            <span className="font-semibold block text-slate-800">
                              {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(o.createdAt).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </td>

                          {/* Cliente */}
                          <td className="py-3.5 px-3">
                            <strong className="block text-slate-900 truncate max-w-[150px]">
                              {o.customerName}
                            </strong>
                            {o.customerPhone && (
                              <span className="text-[11px] text-slate-500 block">
                                {o.customerPhone}
                              </span>
                            )}
                          </td>

                          {/* Atendimento / Mesa */}
                          <td className="py-3.5 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                                o.fulfillmentType === 'delivery'
                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                  : o.fulfillmentType === 'pickup'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-amber-50 text-amber-900 border-amber-200'
                              }`}
                            >
                              {o.fulfillmentType === 'delivery' ? (
                                <Truck className="w-3 h-3" />
                              ) : o.fulfillmentType === 'pickup' ? (
                                <Store className="w-3 h-3" />
                              ) : (
                                <UtensilsCrossed className="w-3 h-3" />
                              )}
                              {o.tableNumber ? `Mesa ${o.tableNumber}` : o.fulfillmentLabel}
                            </span>
                            {o.tableName && (
                              <span className="block text-[10px] text-slate-400 mt-0.5">
                                {o.tableName}
                              </span>
                            )}
                          </td>

                          {/* Itens */}
                          <td className="py-3.5 px-3 max-w-[180px]">
                            <span className="font-bold text-slate-800 block">
                              {o.itemsCount} {o.itemsCount === 1 ? 'item' : 'itens'}
                            </span>
                            <span className="text-[10px] text-slate-500 truncate block">
                              {o.items.map((it) => `${it.quantity}x ${it.productName}`).join(', ')}
                            </span>
                          </td>

                          {/* Subtotal / Descontos / Taxas */}
                          <td className="py-3.5 px-3 text-right whitespace-nowrap">
                            <span className="text-slate-700 font-semibold block">
                              Sub: {formatMoney(o.subtotal)}
                            </span>
                            {o.deliveryFee > 0 && (
                              <span className="text-[10px] text-indigo-600 block">
                                + Frete: {formatMoney(o.deliveryFee)}
                              </span>
                            )}
                            {o.serviceFee > 0 && (
                              <span className="text-[10px] text-indigo-600 block">
                                + Serv: {formatMoney(o.serviceFee)}
                              </span>
                            )}
                            {o.discount > 0 && (
                              <span className="text-[10px] text-rose-600 font-bold block">
                                - Desc: {formatMoney(o.discount)}
                              </span>
                            )}
                          </td>

                          {/* Total */}
                          <td className="py-3.5 px-3 text-right whitespace-nowrap">
                            <span className="font-black text-slate-900 text-sm block">
                              {formatMoney(o.total)}
                            </span>
                            {o.paymentStatus === 'partial' && (
                              <span className="text-[10px] text-amber-700 font-bold block">
                                Falta: {formatMoney(o.pendingAmount)}
                              </span>
                            )}
                          </td>

                          {/* Status Operacional */}
                          <td className="py-3.5 px-3">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-xl text-[11px] font-bold border ${opColor.bg} ${opColor.text} ${opColor.border}`}
                            >
                              {o.operationalStatusLabel}
                            </span>
                          </td>

                          {/* Pagamento */}
                          <td className="py-3.5 px-3">
                            <div className="space-y-0.5">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-extrabold border ${payColor.bg} ${payColor.text} ${payColor.border}`}
                              >
                                {o.paymentStatusLabel}
                              </span>
                              <span className="block text-[11px] font-semibold text-slate-700">
                                {o.paymentMethodLabel}
                              </span>
                              {o.paidAt && (
                                <span className="block text-[9px] text-slate-400">
                                  Pago: {new Date(o.paidAt).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Ações */}
                          <td className="py-3.5 px-4 text-right">
                            <div
                              className="flex items-center justify-end gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedOrder(o)}
                                className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
                                title="Ver detalhes e histórico"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(o)}
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

              {/* Pagination Footer */}
              {totalPages > 1 && (
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                  <span className="text-slate-600 font-medium">
                    Página <strong>{appliedFilters.page || 1}</strong> de{' '}
                    <strong>{totalPages}</strong> ({totalCount} pedidos encontrados)
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={(appliedFilters.page || 1) <= 1}
                      onClick={() => handlePageChange((appliedFilters.page || 1) - 1)}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer flex items-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Anterior</span>
                    </button>
                    <button
                      type="button"
                      disabled={(appliedFilters.page || 1) >= totalPages}
                      onClick={() => handlePageChange((appliedFilters.page || 1) + 1)}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer flex items-center gap-1"
                    >
                      <span>Próxima</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB: CONFIGURAÇÕES DE ENTREGA */}
      {activeTab === 'settings' && <DeliverySettingsTab tenantId={tenant.id} />}

      {/* UNIFIED ORDER DETAIL MODAL */}
      {selectedOrder && (
        <UnifiedOrderDetailModal
          order={selectedOrder}
          tenantName={tenant.name}
          onOrderUpdated={(updated) => {
            setSelectedOrder(updated);
            fetchOrders(appliedFilters);
          }}
          onOpenEditModal={(ord) => {
            setSelectedOrder(null);
            handleOpenEdit(ord);
          }}
          onOpenDeleteModal={(ord) => {
            setSelectedOrder(null);
            setDeletingOrder(ord);
          }}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {/* EDIT ONLINE ORDER MODAL */}
      {editingOnlineOrder && (
        <OrderEditModal
          isOpen={!!editingOnlineOrder}
          order={editingOnlineOrder}
          onClose={() => setEditingOnlineOrder(null)}
          onOrderUpdated={() => {
            setEditingOnlineOrder(null);
            fetchOrders(appliedFilters);
          }}
        />
      )}

      {/* EDIT TABLE ORDER MODAL */}
      {editingTableOrder && (
        <RestaurantOrderEditModal
          isOpen={!!editingTableOrder}
          order={editingTableOrder}
          onClose={() => setEditingTableOrder(null)}
          onOrderUpdated={() => {
            setEditingTableOrder(null);
            fetchOrders(appliedFilters);
          }}
        />
      )}

      {/* DELETE CONFIRM MODAL */}
      <ConfirmModal
        isOpen={!!deletingOrder}
        title="Excluir Pedido"
        message={`Tem certeza que deseja excluir o pedido ${deletingOrder?.displayCode} de ${tenant.name}? Esta ação removerá o registro permanentemente do sistema.`}
        confirmText="Sim, excluir pedido"
        cancelText="Cancelar"
        isDestructive={true}
        loading={deleting}
        onConfirm={async () => {
          if (!deletingOrder) return;
          try {
            setDeleting(true);
            if (deletingOrder.source === 'online') {
              await api.deleteOrder(deletingOrder.id);
            } else {
              await api.deleteRestaurantOrder(deletingOrder.id);
            }
            setDeletingOrder(null);
            fetchOrders(appliedFilters);
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
