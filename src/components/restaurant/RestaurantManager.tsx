import React, { useState, useEffect, useCallback } from 'react';
import {
  UtensilsCrossed,
  Layers,
  Plus,
  Printer,
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Receipt,
  QrCode,
  Edit,
  Trash2,
  ChevronRight,
  TrendingUp,
  SlidersHorizontal,
  Coffee,
  Check,
  Ban,
  ArrowRight,
  Sparkles,
  Percent,
  Bell,
  BellRing,
  Volume2,
} from 'lucide-react';
import { Tenant } from '../../types/saas';
import {
  RestaurantTable,
  RestaurantOrder,
  RestaurantOrderStatus,
  RestaurantSummary,
  TableStatus,
  RESTAURANT_STATUS_LABELS,
  RESTAURANT_STATUS_COLORS,
} from '../../types/restaurant';
import { api } from '../../services/api';
import { TableModal } from './modals/TableModal';
import { BatchTablesModal } from './modals/BatchTablesModal';
import { TableSessionModal } from './modals/TableSessionModal';
import { PrintQrModal } from './modals/PrintQrModal';
import { RestaurantFeeTemplatesTab } from './RestaurantFeeTemplatesTab';
import { RestaurantOrderEditModal } from './modals/RestaurantOrderEditModal';
import { ConfirmModal } from '../common/ConfirmModal';
import { useBackHandler } from '../../services/navigationManager';

interface RestaurantManagerProps {
  tenant: Tenant | null;
}

export const RestaurantManager: React.FC<RestaurantManagerProps> = ({ tenant }) => {
  const [activeTab, setActiveTab] = useState<'hall' | 'orders' | 'tables' | 'fees' | 'guide'>('hall');
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [summary, setSummary] = useState<RestaurantSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const prevClosingCountRef = React.useRef(0);

  const playChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.7);
    } catch (e) {
      // Audio playback restrictions fallback
    }
  }, []);
  const [soundMuted, setSoundMuted] = useState(false);

  // Filters
  const [hallFilter, setHallFilter] = useState<'all' | TableStatus>('all');
  const [searchTable, setSearchTable] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [orderSearch, setOrderSearch] = useState('');

  // Modals state
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [sessionTable, setSessionTable] = useState<RestaurantTable | null>(null);
  const [printQrModalOpen, setPrintQrModalOpen] = useState(false);
  const [printQrTable, setPrintQrTable] = useState<RestaurantTable | null>(null);

  // Restaurant Order Edit / Delete state
  const [editingRestaurantOrder, setEditingRestaurantOrder] = useState<RestaurantOrder | null>(null);
  const [deletingRestaurantOrder, setDeletingRestaurantOrder] = useState<RestaurantOrder | null>(null);
  const [deletingOrderLoading, setDeletingOrderLoading] = useState(false);

  const handleDeleteRestaurantOrder = async () => {
    if (!deletingRestaurantOrder) return;
    try {
      setDeletingOrderLoading(true);
      await api.deleteRestaurantOrder(deletingRestaurantOrder.id);
      setDeletingRestaurantOrder(null);
      await loadData(true);
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir pedido.');
    } finally {
      setDeletingOrderLoading(false);
    }
  };

  // Global Android / Browser Back Button handlers for restaurant modals
  useBackHandler({
    isOpen: tableModalOpen,
    onClose: () => setTableModalOpen(false),
    priority: 20,
    name: 'RestaurantTableModal',
  });

  useBackHandler({
    isOpen: batchModalOpen,
    onClose: () => setBatchModalOpen(false),
    priority: 20,
    name: 'RestaurantBatchTablesModal',
  });

  useBackHandler({
    isOpen: sessionModalOpen,
    onClose: () => setSessionModalOpen(false),
    priority: 20,
    name: 'RestaurantTableSessionModal',
  });

  useBackHandler({
    isOpen: printQrModalOpen,
    onClose: () => setPrintQrModalOpen(false),
    priority: 20,
    name: 'RestaurantPrintQrModal',
  });

  const loadData = useCallback(async (isSilent = false) => {
    if (!tenant) return;
    try {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);

      const [tablesData, ordersData, summaryData] = await Promise.all([
        api.getRestaurantTables(),
        api.getRestaurantOrders(),
        api.getRestaurantSummary(),
      ]);

      setTables(tablesData);
      setOrders(ordersData);
      setSummary(summaryData);

      const closingCount = (tablesData || []).filter((t: RestaurantTable) => t.status === 'closing').length;
      if (closingCount > prevClosingCountRef.current) {
        playChime();
      }
      prevClosingCountRef.current = closingCount;
    } catch (err: any) {
      console.error('Error loading restaurant data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenant, playChime]);

  useEffect(() => {
    loadData();
    // Auto refresh every 12 seconds for responsive closing alerts and table orders
    const interval = setInterval(() => {
      loadData(true);
    }, 12000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Table handlers
  const handleSaveTable = async (payload: any) => {
    if (selectedTable) {
      await api.updateRestaurantTable(selectedTable.id, payload);
    } else {
      await api.createRestaurantTable(payload);
    }
    await loadData(true);
  };

  const handleBatchSave = async (payload: any) => {
    const res = await api.createRestaurantTablesBatch(payload);
    await loadData(true);
    return res;
  };

  const handleDeleteTable = async (table: RestaurantTable) => {
    if (table.currentSessionId) {
      alert('Não é possível excluir uma mesa com comanda aberta. Feche a conta antes de excluir.');
      return;
    }
    if (!confirm(`Tem certeza que deseja excluir a Mesa ${table.tableNumber}?`)) {
      return;
    }
    try {
      await api.deleteRestaurantTable(table.id);
      await loadData(true);
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir mesa.');
    }
  };

  const handleToggleTableActive = async (table: RestaurantTable) => {
    try {
      await api.updateRestaurantTable(table.id, { isActive: !table.isActive });
      await loadData(true);
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar ativação da mesa.');
    }
  };

  // Order status advancement
  const handleAdvanceOrderStatus = async (order: RestaurantOrder) => {
    let nextStatus: RestaurantOrderStatus | null = null;
    if (order.status === 'received') nextStatus = 'confirmed';
    else if (order.status === 'confirmed') nextStatus = 'preparing';
    else if (order.status === 'preparing') nextStatus = 'ready';
    else if (order.status === 'ready') nextStatus = 'delivered';

    if (!nextStatus) return;

    try {
      await api.updateRestaurantOrderStatus(order.id, nextStatus);
      await loadData(true);
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar status do pedido.');
    }
  };

  const handleCancelOrderQuick = async (order: RestaurantOrder) => {
    const reason = prompt(`Informe a justificativa do cancelamento do Pedido #${order.orderNumber}:`);
    if (!reason || !reason.trim()) return;

    try {
      await api.cancelRestaurantOrder(order.id, reason.trim());
      await loadData(true);
    } catch (err: any) {
      alert(err.message || 'Erro ao cancelar pedido.');
    }
  };

  // Filtered tables for hall view
  const filteredTables = tables.filter((t) => {
    if (hallFilter !== 'all' && t.status !== hallFilter) return false;
    if (searchTable.trim()) {
      const q = searchTable.toLowerCase().trim();
      return (
        t.tableNumber.toLowerCase().includes(q) ||
        (t.name && t.name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Filtered orders
  const filteredOrders = orders.filter((o) => {
    if (orderStatusFilter !== 'all' && o.status !== orderStatusFilter) return false;
    if (orderSearch.trim()) {
      const q = orderSearch.toLowerCase().trim();
      return (
        String(o.orderNumber).includes(q) ||
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        (o.tableNumber && o.tableNumber.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const closingTables = tables.filter((t) => t.status === 'closing');

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 print:p-0 print:m-0 print:max-w-none">
      <div className="space-y-6 print:hidden">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Catálogo Digital para Restaurantes
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Gestão de mesas, pedidos na mesa e QR Codes conectados ao catálogo de produtos
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="p-2.5 bg-white border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
            title="Atualizar dados agora"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          <button
            onClick={() => {
              setPrintQrTable(null);
              setPrintQrModalOpen(true);
              loadData(true);
            }}
            className="px-3.5 py-2.5 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span>Imprimir QR Codes</span>
          </button>

          <button
            onClick={() => {
              setSelectedTable(null);
              setTableModalOpen(true);
            }}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Mesa</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* CRITICAL CLOSING ALERT BANNER (IMPOSSIBLE TO MISS)      */}
      {/* ======================================================== */}
      {closingTables.length > 0 && (
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 rounded-3xl text-white shadow-xl border-2 border-amber-300 animate-in fade-in slide-in-from-top-2 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white text-orange-600 flex items-center justify-center font-black shadow-md shrink-0">
                <BellRing className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-black tracking-widest bg-white/25 px-2 py-0.5 rounded-full">
                    Atenção da Equipe
                  </span>
                  <span className="text-xs bg-rose-900/40 px-2 py-0.5 rounded-full font-bold">
                    {closingTables.length} {closingTables.length === 1 ? 'mesa aguardando' : 'mesas aguardando'}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white mt-0.5">
                  Solicitação de Fechamento de Comanda Recebida!
                </h2>
                <p className="text-xs text-white/90">
                  O cliente conferiu a conta pelo celular e está aguardando o garçom para efetuar o pagamento.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setSoundMuted(!soundMuted)}
                className="px-3 py-1.5 bg-black/25 hover:bg-black/35 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title={soundMuted ? 'Ativar alerta sonoro' : 'Silenciar alerta sonoro'}
              >
                <Volume2 className="w-4 h-4" />
                <span>{soundMuted ? 'Som Silenciado' : 'Silenciar Som'}</span>
              </button>
            </div>
          </div>

          {/* Cards for each closing table */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {closingTables.map((ct) => (
              <div
                key={ct.id}
                className="p-3.5 bg-white text-slate-900 rounded-2xl shadow-md border border-amber-200 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black text-slate-950">
                      Mesa {ct.tableNumber}
                    </span>
                    {ct.name && (
                      <span className="text-[11px] text-slate-500 truncate font-medium">
                        ({ct.name})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs">
                    <span className="font-black text-emerald-700">
                      R$ {(ct.currentSessionTotal || 0).toFixed(2).replace('.', ',')}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-500 text-[11px]">
                      {ct.currentSessionOrdersCount || 0} pedido(s)
                    </span>
                  </div>
                  {ct.updatedAt && (
                    <span className="text-[10px] text-amber-700 font-bold block mt-0.5">
                      Solicitado às {new Date(ct.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSessionTable(ct);
                    setSessionModalOpen(true);
                  }}
                  className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shrink-0 flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>VISUALIZAR CONTA / FINALIZAR MESA</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Total Mesas
          </span>
          <div className="text-xl font-black text-slate-900 mt-1">
            {summary?.totalTables || tables.length}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Cadastradas</span>
        </div>

        <div className="p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl shadow-xs">
          <span className="text-[10px] uppercase font-bold text-emerald-700 block tracking-wider">
            Livres
          </span>
          <div className="text-xl font-black text-emerald-900 mt-1">
            {summary?.availableTables || tables.filter((t) => t.status === 'available').length}
          </div>
          <span className="text-[10px] text-emerald-600 mt-0.5 block">Disponíveis</span>
        </div>

        <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl shadow-xs">
          <span className="text-[10px] uppercase font-bold text-amber-700 block tracking-wider">
            Ocupadas
          </span>
          <div className="text-xl font-black text-amber-900 mt-1">
            {summary?.occupiedTables || tables.filter((t) => t.status === 'occupied').length}
          </div>
          <span className="text-[10px] text-amber-600 mt-0.5 block">Com clientes</span>
        </div>

        <div className={`p-3.5 rounded-2xl border shadow-xs transition-all ${
          (summary?.closingTables || closingTables.length) > 0
            ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400 animate-pulse'
            : 'bg-white border-slate-200'
        }`}>
          <span className="text-[10px] uppercase font-bold text-amber-800 block tracking-wider">
            Fechando Conta
          </span>
          <div className="text-xl font-black text-amber-950 mt-1">
            {summary?.closingTables || closingTables.length}
          </div>
          <span className="text-[10px] text-amber-700 mt-0.5 block">Aguardam garçom</span>
        </div>

        <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl shadow-xs">
          <span className="text-[10px] uppercase font-bold text-blue-700 block tracking-wider">
            Pedidos Hoje
          </span>
          <div className="text-xl font-black text-blue-900 mt-1">
            {summary?.activeOrdersToday || 0}
          </div>
          <span className="text-[10px] text-blue-600 mt-0.5 block">Realizados no salão</span>
        </div>

        <div className="p-3.5 bg-purple-50/70 border border-purple-100 rounded-2xl shadow-xs">
          <span className="text-[10px] uppercase font-bold text-purple-700 block tracking-wider">
            Aguardando Ação
          </span>
          <div className="text-xl font-black text-purple-900 mt-1">
            {summary?.ordersPendingAction || 0}
          </div>
          <span className="text-[10px] text-purple-600 mt-0.5 block">Preparo / Entrega</span>
        </div>

        <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-2xl shadow-xs">
          <span className="text-[10px] uppercase font-bold text-indigo-700 block tracking-wider">
            Receita no Salão
          </span>
          <div className="text-xl font-black text-indigo-900 mt-1">
            R$ {(summary?.totalRevenueToday || 0).toFixed(2).replace('.', ',')}
          </div>
          <span className="text-[10px] text-indigo-600 mt-0.5 block">Consumido hoje</span>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('hall')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'hall'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <UtensilsCrossed className="w-4 h-4" />
          <span>Visão Geral do Salão</span>
          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px]">
            {tables.length}
          </span>
          {closingTables.length > 0 && (
            <span className="bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded-full text-[10px] animate-pulse">
              {closingTables.length} fechando
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'orders'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Pedidos & KDS das Mesas</span>
          {(summary?.ordersPendingAction || 0) > 0 && (
            <span className="bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded-full text-[10px] animate-pulse">
              {summary?.ordersPendingAction} novos
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('tables')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'tables'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Cadastro & Gestão de Mesas</span>
        </button>

        <button
          onClick={() => setActiveTab('fees')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'fees'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Percent className="w-4 h-4 text-indigo-600" />
          <span>Taxas Adicionais</span>
        </button>

        <button
          onClick={() => setActiveTab('guide')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'guide'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>Como Funciona o Catálogo</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: VISÃO GERAL DO SALÃO (MESAS EM CARDS)            */}
      {/* ======================================================== */}
      {activeTab === 'hall' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
              {[
                { key: 'all', label: 'Todas as Mesas' },
                { key: 'available', label: 'Disponíveis (Livres)' },
                { key: 'occupied', label: 'Ocupadas' },
                { key: 'closing', label: 'Fechando' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setHallFilter(f.key as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    hallFilter === f.key
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTable}
                onChange={(e) => setSearchTable(e.target.value)}
                placeholder="Buscar mesa ou setor..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Tables Grid */}
          {loading ? (
            <div className="py-20 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-500" />
              <p className="text-xs">Carregando mesas do salão...</p>
            </div>
          ) : filteredTables.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-200 space-y-3">
              <Coffee className="w-12 h-12 stroke-[1.5] mx-auto text-slate-300" />
              <h3 className="text-sm font-bold text-slate-700">Nenhuma mesa encontrada</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {tables.length === 0
                  ? 'Você ainda não cadastrou nenhuma mesa. Cadastre sua primeira mesa ou gere mesas em lote.'
                  : 'Nenhuma mesa corresponde ao filtro selecionado.'}
              </p>
              {tables.length === 0 && (
                <div className="flex justify-center gap-2 pt-2">
                  <button
                    onClick={() => setBatchModalOpen(true)}
                    className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-500 transition-colors cursor-pointer"
                  >
                    Cadastrar em Lote (1 a 20)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredTables.map((table) => {
                const isOccupied = table.status === 'occupied';
                const isClosing = table.status === 'closing';

                return (
                  <div
                    key={table.id}
                    className={`p-4 rounded-3xl border-2 transition-all flex flex-col justify-between ${
                      isClosing
                        ? 'bg-amber-50/80 border-amber-400 ring-2 ring-amber-400 shadow-lg'
                        : isOccupied
                        ? 'bg-amber-50/40 border-amber-300 shadow-md'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                    }`}
                  >
                    {/* Top card bar */}
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-black text-slate-900 tracking-tight">
                              Mesa {table.tableNumber}
                            </span>
                            {!table.isActive && (
                              <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                                Inativa
                              </span>
                            )}
                          </div>
                          {table.name && (
                            <span className="text-xs text-slate-500 font-medium block truncate mt-0.5">
                              {table.name}
                            </span>
                          )}
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isClosing
                              ? 'bg-amber-500 text-slate-950 font-black animate-pulse'
                              : isOccupied
                              ? 'bg-amber-500 text-white'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isClosing ? 'Fechando (Conta Solicitada)' : isOccupied ? 'Ocupada' : 'Livre'}
                        </span>
                      </div>

                      {/* Occupied or Closing details */}
                      {(isOccupied || isClosing) && (
                        <div className={`mt-3.5 p-3 rounded-2xl border space-y-1 ${
                          isClosing ? 'bg-amber-100/70 border-amber-300' : 'bg-white/90 border-amber-200'
                        }`}>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] uppercase font-bold text-slate-500">
                              {isClosing ? 'Valor a Cobrar' : 'Consumo'}
                            </span>
                            <span className="text-sm font-black text-slate-900">
                              R$ {(table.currentSessionTotal || 0).toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[11px] text-slate-600">
                            <span>Pedidos na mesa:</span>
                            <span className="font-bold text-slate-800">
                              {table.currentSessionOrdersCount || 0}
                            </span>
                          </div>
                          {isClosing && (
                            <div className="text-[10px] font-bold text-amber-900 bg-amber-200/90 px-2 py-1 rounded-lg mt-1 flex items-center gap-1.5 animate-pulse">
                              <Bell className="w-3 h-3 text-amber-800 shrink-0" />
                              <span>Cliente solicitou fechamento da conta</span>
                            </div>
                          )}
                          {table.currentSessionOpenedAt && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-400 pt-0.5">
                              <Clock className="w-3 h-3" />
                              <span>
                                Aberta às {new Date(table.currentSessionOpenedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {!isOccupied && !isClosing && (
                        <div className="mt-4 p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                          <span className="text-xs text-slate-400">
                            Pronta para novos clientes
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Card Actions */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setPrintQrTable(table);
                            setPrintQrModalOpen(true);
                          }}
                          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                          title="Ver QR Code da Mesa"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            setSelectedTable(table);
                            setTableModalOpen(true);
                          }}
                          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                          title="Editar Mesa"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>

                      {isClosing ? (
                        <button
                          onClick={() => {
                            setSessionTable(table);
                            setSessionModalOpen(true);
                          }}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs transition-all shadow-md flex items-center gap-1 cursor-pointer"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>FINALIZAR MESA</span>
                        </button>
                      ) : isOccupied ? (
                        <button
                          onClick={() => {
                            setSessionTable(table);
                            setSessionModalOpen(true);
                          }}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Ver Conta</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setPrintQrTable(table);
                            setPrintQrModalOpen(true);
                          }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>QR Code</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: PEDIDOS DO SALÃO (KDS / COMANDAS EM TEMPO REAL)  */}
      {/* ======================================================== */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* Orders Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
              {[
                { key: 'all', label: 'Todos' },
                { key: 'received', label: 'Recebidos' },
                { key: 'confirmed', label: 'Confirmados' },
                { key: 'preparing', label: 'Em Preparo' },
                { key: 'ready', label: 'Prontos' },
                { key: 'delivered', label: 'Entregues' },
                { key: 'cancelled', label: 'Cancelados' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setOrderStatusFilter(f.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    orderStatusFilter === f.key
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Buscar pedido, cliente ou mesa..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Orders List */}
          {loading ? (
            <div className="py-20 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-500" />
              <p className="text-xs">Carregando pedidos das mesas...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-200 space-y-2">
              <Receipt className="w-12 h-12 stroke-[1.5] mx-auto text-slate-300" />
              <h3 className="text-sm font-bold text-slate-700">Nenhum pedido encontrado</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Assim que clientes realizarem pedidos através dos QR Codes das mesas, eles aparecerão aqui em tempo real.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOrders.map((order) => {
                const isCancelled = order.status === 'cancelled';
                const statusStyle = RESTAURANT_STATUS_COLORS[order.status] || {
                  bg: 'bg-slate-50',
                  text: 'text-slate-700',
                  border: 'border-slate-200',
                  dot: 'bg-slate-400',
                };

                let nextButtonLabel = '';
                if (order.status === 'received') nextButtonLabel = 'Confirmar Pedido';
                else if (order.status === 'confirmed') nextButtonLabel = 'Iniciar Preparo';
                else if (order.status === 'preparing') nextButtonLabel = 'Marcar Pronto';
                else if (order.status === 'ready') nextButtonLabel = 'Marcar Entregue';

                return (
                  <div
                    key={order.id}
                    className={`p-5 rounded-3xl border transition-all flex flex-col justify-between ${
                      isCancelled
                        ? 'bg-slate-50 border-slate-200 opacity-60'
                        : order.status === 'received'
                        ? 'bg-blue-50/50 border-blue-200 shadow-md'
                        : order.status === 'ready'
                        ? 'bg-purple-50/50 border-purple-200 shadow-md'
                        : 'bg-white border-slate-200 shadow-xs'
                    }`}
                  >
                    <div>
                      {/* Top Order Bar */}
                      <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black text-slate-900">
                              Pedido #{order.orderNumber}
                            </span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-slate-900 text-white">
                              Mesa {order.tableNumber || '?'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {order.customerName && (
                              <span className="truncate max-w-[130px]">· {order.customerName}</span>
                            )}
                          </div>
                        </div>

                        <span
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                          {RESTAURANT_STATUS_LABELS[order.status] || order.status}
                        </span>
                      </div>

                      {/* Items */}
                      <div className="space-y-2 mb-3">
                        {order.items.map((item) => (
                          <div key={item.id} className="text-xs flex items-start justify-between">
                            <div className="flex items-start gap-2 max-w-[75%]">
                              <span className="font-bold text-slate-900 shrink-0">
                                {item.quantity}x
                              </span>
                              <div>
                                <span className="font-semibold text-slate-800">
                                  {item.productName}
                                </span>
                                {item.variantName && (
                                  <span className="text-slate-500 ml-1">({item.variantName})</span>
                                )}
                                {item.notes && (
                                  <div className="text-[11px] text-amber-700 italic font-medium mt-0.5">
                                    Obs: {item.notes}
                                  </div>
                                )}
                              </div>
                            </div>
                            <span className="font-bold text-slate-700 shrink-0">
                              R$ {item.subtotal.toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                        ))}
                      </div>

                      {order.notes && (
                        <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl text-[11px] text-amber-900 mb-3">
                          <span className="font-bold">Observação geral:</span> {order.notes}
                        </div>
                      )}
                    </div>

                    {/* Bottom Order Bar */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Total</span>
                        <span className="text-base font-black text-slate-900">
                          R$ {order.total.toFixed(2).replace('.', ',')}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingRestaurantOrder(order)}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
                          title="Editar pedido"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingRestaurantOrder(order)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                          title="Excluir pedido"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        {!isCancelled && order.status !== 'delivered' && (
                          <button
                            type="button"
                            onClick={() => handleCancelOrderQuick(order)}
                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                            title="Cancelar pedido"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}

                        {nextButtonLabel && !isCancelled && (
                          <button
                            type="button"
                            onClick={() => handleAdvanceOrderStatus(order)}
                            className="px-3.5 py-2 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>{nextButtonLabel}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: CADASTRO & GESTÃO COMPLETA DE MESAS             */}
      {/* ======================================================== */}
      {activeTab === 'tables' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Listagem de Mesas do Restaurante</h3>
              <p className="text-xs text-slate-500">
                Gerencie números, setores, ativação e QR Codes individuais de cada mesa
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => setBatchModalOpen(true)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Cadastrar em Lote</span>
              </button>

              <button
                onClick={() => {
                  setSelectedTable(null);
                  setTableModalOpen(true);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Mesa</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-5 py-3.5">Mesa</th>
                    <th className="px-5 py-3.5">Setor / Nome</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Ativa</th>
                    <th className="px-5 py-3.5">Comanda Atual</th>
                    <th className="px-5 py-3.5">Data de Criação</th>
                    <th className="px-5 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tables.map((table) => (
                    <tr key={table.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 font-black text-slate-900 text-sm">
                        Mesa {table.tableNumber}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {table.name || <span className="text-slate-400 italic">Geral</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            table.status === 'occupied'
                              ? 'bg-amber-100 text-amber-800'
                              : table.status === 'closing'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {table.status === 'occupied'
                            ? 'Ocupada'
                            : table.status === 'closing'
                            ? 'Fechando'
                            : 'Disponível'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => handleToggleTableActive(table)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                            table.isActive
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {table.isActive ? 'Ativa' : 'Inativa'}
                        </button>
                      </td>
                      <td className="px-5 py-3.5 font-medium text-slate-800">
                        {table.currentSessionId ? (
                          <span className="font-bold text-slate-900">
                            R$ {(table.currentSessionTotal || 0).toFixed(2).replace('.', ',')}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">
                        {new Date(table.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-1">
                        <button
                          onClick={() => {
                            setPrintQrTable(table);
                            setPrintQrModalOpen(true);
                          }}
                          className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                          title="Imprimir QR Code"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedTable(table);
                            setTableModalOpen(true);
                          }}
                          className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTable(table)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          title="Excluir mesa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: COMO FUNCIONA O CATÁLOGO                         */}
      {/* ======================================================== */}
      {activeTab === 'guide' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Como funciona o Catálogo Digital para Mesas
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              O módulo foi desenvolvido para restaurantes, bares, lanchonetes e cafeterias que atendem clientes presencialmente nas mesas, eliminando filas e cardápios físicos desatualizados.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                1
              </div>
              <h4 className="text-sm font-bold text-slate-900">Cardápio 100% Integrado</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Reutiliza exatamente o mesmo catálogo de produtos existente no sistema. Qualquer alteração de preço, foto ou item indisponível atualiza instantaneamente na mesa.
              </p>
            </div>

            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-sm">
                2
              </div>
              <h4 className="text-sm font-bold text-slate-900">QR Code Individual por Mesa</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Cada mesa possui um token de segurança opaco único. O cliente escaneia com a câmera do celular e o sistema já sabe exatamente qual mesa está fazendo o pedido.
              </p>
            </div>

            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                3
              </div>
              <h4 className="text-sm font-bold text-slate-900">Comanda Acumulada da Mesa</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Diversos pedidos podem ser feitos durante a mesma permanência do cliente na mesa. Todos os pedidos são somados na mesma comanda até o momento de fechar a conta.
              </p>
            </div>
          </div>

          <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
            <div className="text-xs text-indigo-950 leading-relaxed">
              <span className="font-bold">Validação Rígida no Servidor:</span> Os preços unitários, totais, itens e estoque são recalculados e validados no backend a cada pedido. O sistema impede que clientes alterem preços no navegador ou criem pedidos duplicados por clique acidental.
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: TAXAS ADICIONAIS & SERVIÇOS                       */}
      {/* ======================================================== */}
      {activeTab === 'fees' && <RestaurantFeeTemplatesTab />}
      </div>

      {/* Modals */}
      <TableModal
        isOpen={tableModalOpen}
        table={selectedTable}
        onClose={() => setTableModalOpen(false)}
        onSave={handleSaveTable}
      />

      <BatchTablesModal
        isOpen={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        onSave={handleBatchSave}
      />

      <TableSessionModal
        isOpen={sessionModalOpen}
        table={sessionTable}
        onClose={() => setSessionModalOpen(false)}
        onSessionClosed={() => loadData(true)}
      />

      <PrintQrModal
        isOpen={printQrModalOpen}
        tenant={tenant}
        table={printQrTable}
        allTables={tables}
        onClose={() => setPrintQrModalOpen(false)}
        onTokenRegenerated={() => loadData(true)}
      />

      {editingRestaurantOrder && (
        <RestaurantOrderEditModal
          isOpen={!!editingRestaurantOrder}
          order={editingRestaurantOrder}
          onClose={() => setEditingRestaurantOrder(null)}
          onOrderUpdated={(updated) => {
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            setEditingRestaurantOrder(null);
            loadData(true);
          }}
        />
      )}

      {deletingRestaurantOrder && (
        <ConfirmModal
          isOpen={!!deletingRestaurantOrder}
          title="Excluir Pedido da Mesa"
          message={`Tem certeza que deseja excluir o Pedido #${deletingRestaurantOrder.orderNumber} (Mesa ${deletingRestaurantOrder.tableNumber}) de ${tenant?.name || 'estabelecimento'}? Esta ação removerá o pedido permanentemente e atualizará o total da comanda.`}
          confirmText="Sim, excluir pedido"
          cancelText="Cancelar"
          isDestructive={true}
          loading={deletingOrderLoading}
          onConfirm={handleDeleteRestaurantOrder}
          onCancel={() => setDeletingRestaurantOrder(null)}
        />
      )}
    </div>
  );
};
