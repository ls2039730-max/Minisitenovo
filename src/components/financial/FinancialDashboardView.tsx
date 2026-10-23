import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  DollarSign,
  Calendar,
  CreditCard,
  Truck,
  UtensilsCrossed,
  Tag,
  Ban,
  Clock,
  Download,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Eye,
  BarChart3,
  ArrowUpRight,
  ShoppingBag,
  Store,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';
import { Tenant } from '../../types/saas';
import {
  FinancialDashboardResponse,
  PeriodPreset,
  UnifiedOrder,
  FINANCIAL_PAYMENT_STATUS_LABELS,
  FINANCIAL_PAYMENT_STATUS_COLORS,
} from '../../types/analytics';
import { api } from '../../services/api';
import {
  exportFinancialReportRowsToCsv,
  exportRevenueByPaymentMethodToCsv,
  exportSalesByTableToCsv,
  exportTopProductsToCsv,
} from '../../utils/csvExport';
import { UnifiedOrderDetailModal } from '../orders/UnifiedOrderDetailModal';

interface FinancialDashboardViewProps {
  tenant: Tenant;
  initialMode?: 'dashboard' | 'top_products' | 'reports';
}

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  last_7_days: 'Últimos 7 dias',
  last_30_days: 'Últimos 30 dias',
  this_month: 'Este mês',
  last_month: 'Mês anterior',
  custom: 'Personalizado',
  all: 'Todo o histórico',
};

export const FinancialDashboardView: React.FC<FinancialDashboardViewProps> = ({
  tenant,
  initialMode = 'dashboard',
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'top_products' | 'reports'>(initialMode);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this_month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<FinancialDashboardResponse | null>(null);

  // Table & Report Filters
  const [reportSearch, setReportSearch] = useState('');
  const [reportPaymentFilter, setReportPaymentFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [reportFulfillmentFilter, setReportFulfillmentFilter] = useState<string>('all');
  const [topProductsSearch, setTopProductsSearch] = useState('');
  const [topProductsSortBy, setTopProductsSortBy] = useState<'quantity' | 'revenue'>('revenue');

  // Order Details Modal
  const [inspectOrder, setInspectOrder] = useState<UnifiedOrder | null>(null);

  const loadDashboard = useCallback(
    async (isSilent = false) => {
      try {
        if (!isSilent) setLoading(true);
        else setRefreshing(true);
        setError(null);

        const data = await api.getFinancialDashboard({
          period: periodPreset,
          startDate: periodPreset === 'custom' ? customStartDate : undefined,
          endDate: periodPreset === 'custom' ? customEndDate : undefined,
        });
        setDashboardData(data);
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar dados do dashboard financeiro.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [periodPreset, customStartDate, customEndDate]
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleOpenOrder = async (orderId: string) => {
    try {
      const full = await api.getUnifiedOrderById(orderId);
      setInspectOrder(full);
    } catch (err: any) {
      alert(err.message || 'Erro ao carregar detalhes do pedido.');
    }
  };

  const formatMoney = (val: number | null | undefined) =>
    `R$ ${Number(val || 0)
      .toFixed(2)
      .replace('.', ',')}`;

  const kpis = dashboardData?.kpis;
  const charts = dashboardData?.charts;
  const reportOrders = dashboardData?.reportOrders || [];

  // Filtered report rows
  const filteredReportOrders = reportOrders.filter((r) => {
    if (reportPaymentFilter === 'paid' && r.paymentStatus !== 'paid' && r.paidAmount === 0)
      return false;
    if (
      reportPaymentFilter === 'pending' &&
      r.paymentStatus !== 'pending' &&
      r.paymentStatus !== 'partial' &&
      r.pendingAmount === 0
    )
      return false;
    if (reportFulfillmentFilter !== 'all' && r.fulfillmentType !== reportFulfillmentFilter)
      return false;
    if (reportSearch.trim()) {
      const q = reportSearch.toLowerCase().trim();
      return (
        r.formattedOrderNumber.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        (r.customerPhone && r.customerPhone.includes(q)) ||
        (r.tableNumber && r.tableNumber.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Top products list
  const activeTopProducts =
    topProductsSortBy === 'quantity'
      ? charts?.topProductsByQuantity || []
      : charts?.topProductsByRevenue || [];

  const topProductsList = activeTopProducts.filter((p) => {
    if (!topProductsSearch.trim()) return true;
    const q = topProductsSearch.toLowerCase().trim();
    return p.productName.toLowerCase().includes(q);
  });

  return (
    <div className="flex-1 overflow-y-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Controle Operacional & Dashboard Financeiro
            </h1>
            <span className="text-[10px] uppercase font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
              {tenant.name}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Métricas de vendas, recebimentos confirmados, valores pendentes e produtos mais vendidos calculados a partir dos dados reais.
          </p>
        </div>

        {/* Global Period Selector */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-1.5 pl-2 pr-1">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-[11px] font-bold text-slate-600">Período:</span>
          </div>
          <select
            value={periodPreset}
            onChange={(e) => setPeriodPreset(e.target.value as PeriodPreset)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden"
          >
            {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((key) => (
              <option key={key} value={key}>
                {PERIOD_LABELS[key]}
              </option>
            ))}
          </select>

          {periodPreset === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
              <span className="text-xs text-slate-400">até</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
              <button
                type="button"
                onClick={() => loadDashboard()}
                className="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold"
              >
                Filtrar
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="Atualizar dados agora"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'dashboard'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Dashboard & Gráficos</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('top_products')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'top_products'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Produtos Mais Vendidos</span>
          {charts?.topProductsByRevenue && charts.topProductsByRevenue.length > 0 && (
            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-[10px]">
              {charts.topProductsByRevenue.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'reports'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Relatórios Detalhados & Exportações CSV</span>
          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-[10px]">
            {reportOrders.length}
          </span>
        </button>
      </div>

      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 bg-white rounded-3xl border border-slate-200 shadow-xs">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <span className="text-xs font-semibold text-slate-500">
            Calculando indicadores e consolidando financeiro ({PERIOD_LABELS[periodPreset]})...
          </span>
        </div>
      ) : error ? (
        <div className="p-8 bg-rose-50 border border-rose-200 rounded-3xl text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
          <h3 className="font-bold text-slate-900 text-sm">{error}</h3>
          <button
            type="button"
            onClick={() => loadDashboard()}
            className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold"
          >
            Tentar Novamente
          </button>
        </div>
      ) : (
        <>
          {/* TAB 1: DASHBOARD & 6 GRÁFICOS */}
          {activeTab === 'dashboard' && kpis && charts && (
            <div className="space-y-6 animate-in fade-in">
              {/* 9 KPI Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                {/* 1. Faturamento Bruto */}
                <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">
                      Faturamento Bruto
                    </span>
                    <DollarSign className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="my-2">
                    <div className="text-xl font-black text-slate-900">
                      {formatMoney(kpis.grossRevenue)}
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Soma dos pedidos válidos
                    </span>
                  </div>
                </div>

                {/* 2. Descontos Concedidos */}
                <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">
                      Descontos Concedidos
                    </span>
                    <Tag className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="my-2">
                    <div className="text-xl font-black text-rose-600">
                      - {formatMoney(kpis.discountsGranted)}
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Total de abatimentos
                    </span>
                  </div>
                </div>

                {/* 3. Vendas Líquidas */}
                <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-indigo-400">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">
                      Vendas Líquidas
                    </span>
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="my-2">
                    <div className="text-xl font-black text-indigo-700">
                      {formatMoney(kpis.netSales)}
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Bruto menos descontos
                    </span>
                  </div>
                </div>

                {/* 4. Recebimentos Confirmados */}
                <div className="bg-emerald-50/80 p-4 rounded-3xl border border-emerald-200 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-emerald-700">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">
                      Recebido Confirmado
                    </span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="my-2">
                    <div className="text-xl font-black text-emerald-950">
                      {formatMoney(kpis.confirmedReceipts)}
                    </div>
                    <span className="text-[11px] text-emerald-800 font-bold">
                      Efetivamente recebido
                    </span>
                  </div>
                </div>

                {/* 5. Valores a Receber */}
                <div className="bg-amber-50/80 p-4 rounded-3xl border border-amber-200 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-amber-800">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">
                      Valores a Receber
                    </span>
                    <Clock className="w-4 h-4 text-amber-700" />
                  </div>
                  <div className="my-2">
                    <div className="text-xl font-black text-amber-950">
                      {formatMoney(kpis.receivablesPending)}
                    </div>
                    <span className="text-[11px] text-amber-800 font-bold">
                      Comandas / pedidos abertos
                    </span>
                  </div>
                </div>

                {/* 6. Ticket Médio */}
                <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">
                      Ticket Médio
                    </span>
                    <ArrowUpRight className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="my-2">
                    <div className="text-xl font-black text-slate-900">
                      {formatMoney(kpis.averageTicket)}
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Por pedido válido
                    </span>
                  </div>
                </div>

                {/* 7. Pedidos Válidos */}
                <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">
                      Pedidos Válidos
                    </span>
                    <ShoppingBag className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="my-2">
                    <div className="text-xl font-black text-slate-900">
                      {kpis.validOrdersCount}
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Atendimentos concluídos
                    </span>
                  </div>
                </div>

                {/* 8. Pedidos Cancelados */}
                <div className="bg-rose-50/70 p-4 rounded-3xl border border-rose-200 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-rose-700">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">
                      Cancelados
                    </span>
                    <Ban className="w-4 h-4 text-rose-600" />
                  </div>
                  <div className="my-2">
                    <div className="text-xl font-black text-rose-950">
                      {kpis.cancelledOrdersCount} ped.
                    </div>
                    <span className="text-[11px] text-rose-800 font-bold">
                      Total: {formatMoney(kpis.cancelledOrdersAmount)}
                    </span>
                  </div>
                </div>

                {/* 9. Taxas de Entrega */}
                <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between col-span-2 sm:col-span-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">
                      Taxas de Entrega
                    </span>
                    <Truck className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="my-2">
                    <div className="text-xl font-black text-slate-900">
                      {formatMoney(kpis.deliveryFeesTotal)}
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Frete arrecadado
                    </span>
                  </div>
                </div>
              </div>

              {/* Informative Note: Zero Profit confusion */}
              <div className="px-4 py-2.5 bg-slate-100 rounded-2xl text-[11px] text-slate-600 flex items-center justify-between">
                <span>
                  <strong>Nota contábil:</strong> Faturamento e vendas líquidas representam a receita operacional bruta e não devem ser interpretados como lucro líquido, pois custos de insumos e despesas fixas não estão deduzidos.
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Fuso: America/Sao_Paulo
                </span>
              </div>

              {/* 6 INTERACTIVE CHARTS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* GRÁFICO 1: Evolução Temporal com 3 Séries */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-900">
                        1. Evolução de Vendas e Recebimentos
                      </h3>
                      <p className="text-xs text-slate-500">
                        Comparativo de Vendas Brutas, Vendas Líquidas e Recebimento Confirmado
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-bold">
                      <span className="flex items-center gap-1 text-slate-900">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-900" /> Bruto
                      </span>
                      <span className="flex items-center gap-1 text-indigo-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" /> Líquido
                      </span>
                      <span className="flex items-center gap-1 text-emerald-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> Confirmado
                      </span>
                    </div>
                  </div>

                  {charts.evolutionDaily.length === 0 ? (
                    <div className="py-16 text-center text-slate-400 text-xs">
                      Sem movimentações registradas no período selecionado.
                    </div>
                  ) : (
                    <div className="space-y-2 pt-2">
                      {charts.evolutionDaily.slice(-10).map((pt) => {
                        const maxVal = Math.max(
                          ...charts.evolutionDaily.map((p) => p.grossRevenue),
                          1
                        );
                        return (
                          <div key={pt.dateKey} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-bold text-slate-700">{pt.label}</span>
                              <span className="text-slate-500">
                                Bruto: {formatMoney(pt.grossRevenue)} • Rec: {formatMoney(pt.confirmedReceipts)}
                              </span>
                            </div>
                            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
                              <div
                                style={{ width: `${(pt.confirmedReceipts / maxVal) * 100}%` }}
                                className="bg-emerald-500 h-full rounded-full transition-all"
                                title={`Recebido: ${formatMoney(pt.confirmedReceipts)}`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* GRÁFICO 2: Distribuição por Status Operacional vs Financeiro */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">
                      2. Status Operacional vs. Status Financeiro
                    </h3>
                    <p className="text-xs text-slate-500">
                      Distribuição entre pedidos entregues, em preparo, quitados ou com saldo pendente
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    {/* Operacional */}
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Status Operacional
                      </span>
                      <div className="space-y-1.5">
                        {charts.operationalStatusDistribution.map((st) => (
                          <div key={st.statusKey} className="flex justify-between items-center text-xs">
                            <span className="font-medium text-slate-700">{st.label}</span>
                            <span className="font-bold text-slate-900">
                              {st.count} ped. ({formatMoney(st.amount)})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Financeiro */}
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Status do Pagamento
                      </span>
                      <div className="space-y-1.5">
                        {charts.financialStatusDistribution.map((st) => (
                          <div key={st.statusKey} className="flex justify-between items-center text-xs">
                            <span className="font-medium text-slate-700">{st.label}</span>
                            <span className="font-bold text-slate-900">
                              {st.count} ped. ({formatMoney(st.amount)})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* GRÁFICO 3: Recebimentos por Forma de Pagamento */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-900">
                        3. Recebimentos por Forma de Pagamento
                      </h3>
                      <p className="text-xs text-slate-500">
                        Valores confirmados por PIX, Cartão, Dinheiro e % de participação
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        exportRevenueByPaymentMethodToCsv(charts.paymentMethodsDistribution)
                      }
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>CSV</span>
                    </button>
                  </div>

                  <div className="space-y-3 pt-1">
                    {charts.paymentMethodsDistribution.map((pm) => (
                      <div key={pm.methodKey} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-bold text-slate-800">
                            {pm.label} ({pm.transactionsCount}x)
                          </span>
                          <span className="font-extrabold text-slate-900">
                            {formatMoney(pm.confirmedAmount)}{' '}
                            <span className="text-slate-400 font-normal">
                              ({pm.percentage.toFixed(1)}%)
                            </span>
                          </span>
                        </div>
                        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${Math.min(100, pm.percentage)}%` }}
                            className="bg-indigo-600 h-full rounded-full transition-all"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* GRÁFICO 4: Vendas por Modalidade de Atendimento */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">
                      4. Vendas por Modalidade de Atendimento
                    </h3>
                    <p className="text-xs text-slate-500">
                      Distribuição de receita entre Entrega (Delivery), Retirada e Mesas (Salão)
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    {charts.modalitiesDistribution.map((f) => (
                      <div
                        key={f.modality}
                        className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          {f.modality === 'delivery' ? (
                            <Truck className="w-4 h-4 text-blue-600" />
                          ) : f.modality === 'pickup' ? (
                            <Store className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <UtensilsCrossed className="w-4 h-4 text-amber-600" />
                          )}
                          <span className="font-bold text-xs text-slate-800">{f.label}</span>
                        </div>
                        <div>
                          <div className="text-base font-black text-slate-900">
                            {formatMoney(f.grossRevenue)}
                          </div>
                          <div className="text-[11px] text-slate-500 font-medium">
                            {f.ordersCount} pedidos ({f.percentageOfSales.toFixed(1)}%)
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* GRÁFICO 5: Desempenho das Mesas */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4 lg:col-span-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-900">
                        5. Desempenho Operacional e Financeiro das Mesas
                      </h3>
                      <p className="text-xs text-slate-500">
                        Contas abertas vs. fechadas, faturamento, recebido, saldo pendente e tempo de ocupação
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        exportSalesByTableToCsv(charts.tablePerformance)
                      }
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Exportar Mesas CSV</span>
                    </button>
                  </div>

                  {charts.tablePerformance.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      Nenhuma mesa com atendimentos registrados no período.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="py-2.5 px-3">Mesa</th>
                            <th className="py-2.5 px-3">Sessões</th>
                            <th className="py-2.5 px-3">Pedidos</th>
                            <th className="py-2.5 px-3 text-right">Faturamento</th>
                            <th className="py-2.5 px-3 text-right">Recebido</th>
                            <th className="py-2.5 px-3 text-right">Em Aberto</th>
                            <th className="py-2.5 px-3 text-right">Ticket Médio</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {charts.tablePerformance.map((t) => (
                            <tr key={t.tableId} className="hover:bg-slate-50/80">
                              <td className="py-2.5 px-3 font-bold text-slate-900">
                                Mesa {t.tableNumber} {t.tableName ? `(${t.tableName})` : ''}
                              </td>
                              <td className="py-2.5 px-3 text-slate-700">{t.sessionsCount}</td>
                              <td className="py-2.5 px-3 text-slate-700">{t.ordersCount}</td>
                              <td className="py-2.5 px-3 text-right font-black text-slate-900">
                                {formatMoney(t.revenue)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-emerald-700 font-bold">
                                {formatMoney(t.confirmedReceipts)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-amber-900 font-bold">
                                {formatMoney(t.pendingAmount)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-700">
                                {formatMoney(t.averageTicket)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PRODUTOS MAIS VENDIDOS */}
          {activeTab === 'top_products' && charts && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative flex-1 w-full sm:max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={topProductsSearch}
                    onChange={(e) => setTopProductsSearch(e.target.value)}
                    placeholder="Buscar produto por nome..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-xs text-slate-500 font-medium">Ordenar:</span>
                  <button
                    type="button"
                    onClick={() => setTopProductsSortBy('revenue')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                      topProductsSortBy === 'revenue'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Por Receita
                  </button>
                  <button
                    type="button"
                    onClick={() => setTopProductsSortBy('quantity')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                      topProductsSortBy === 'quantity'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Por Quantidade
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      exportTopProductsToCsv(topProductsList)
                    }
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3.5 px-4">#</th>
                        <th className="py-3.5 px-4">Produto</th>
                        <th className="py-3.5 px-4">Variação</th>
                        <th className="py-3.5 px-4 text-right">Qtd Vendida</th>
                        <th className="py-3.5 px-4 text-right">Qtd Pedidos</th>
                        <th className="py-3.5 px-4 text-right">Preço Médio Histórico</th>
                        <th className="py-3.5 px-4 text-right">Receita Total</th>
                        <th className="py-3.5 px-4 text-right">Participação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {topProductsList.map((p, idx) => (
                        <tr key={p.productKey} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 font-black text-slate-400">{idx + 1}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{p.productName}</td>
                          <td className="py-3 px-4 text-slate-500">{p.variantName || '-'}</td>
                          <td className="py-3 px-4 text-right font-black text-indigo-700">
                            {p.quantitySold} un.
                          </td>
                          <td className="py-3 px-4 text-right text-slate-700">{p.ordersCount}</td>
                          <td className="py-3 px-4 text-right text-slate-700 font-semibold">
                            {formatMoney(p.averageUnitPrice)}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-slate-900 text-sm">
                            {formatMoney(p.revenueGenerated)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-600">
                            {p.shareOfProductSales.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: RELATÓRIOS DETALHADOS & EXPORTAÇÃO CSV */}
          {activeTab === 'reports' && (
            <div className="space-y-4 animate-in fade-in">
              {/* Export Buttons Strip */}
              <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  Exportações CSV Disponíveis ({PERIOD_LABELS[periodPreset]})
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      exportFinancialReportRowsToCsv(
                        reportOrders,
                        'all',
                        `relatorio-completo-${tenant.slug}`
                      )
                    }
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Relatório Completo de Vendas</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      exportFinancialReportRowsToCsv(
                        reportOrders,
                        'paid',
                        `recebimentos-confirmados-${tenant.slug}`
                      )
                    }
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Recebimentos Confirmados</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      exportFinancialReportRowsToCsv(
                        reportOrders,
                        'pending',
                        `valores-a-receber-${tenant.slug}`
                      )
                    }
                    className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Valores a Receber / Pendências</span>
                  </button>
                </div>
              </div>

              {/* Filter Strip for Table */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative flex-1 w-full sm:max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    placeholder="Filtrar por pedido, cliente ou mesa..."
                    className="w-full pl-10 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={reportPaymentFilter}
                    onChange={(e) => setReportPaymentFilter(e.target.value as any)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
                  >
                    <option value="all">Todos os Pagamentos</option>
                    <option value="paid">Apenas Confirmados (Pagos)</option>
                    <option value="pending">Apenas Pendentes / A Receber</option>
                  </select>

                  <select
                    value={reportFulfillmentFilter}
                    onChange={(e) => setReportFulfillmentFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
                  >
                    <option value="all">Todas as Modalidades</option>
                    <option value="delivery">Entrega</option>
                    <option value="pickup">Retirada</option>
                    <option value="dine_in">Consumo no Local (Mesa)</option>
                  </select>
                </div>
              </div>

              {/* Report Table with click to open order */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3 px-3">Pedido</th>
                        <th className="py-3 px-3">Data / Hora</th>
                        <th className="py-3 px-3">Cliente</th>
                        <th className="py-3 px-3">Atendimento / Mesa</th>
                        <th className="py-3 px-3">Itens</th>
                        <th className="py-3 px-3 text-right">Subtotal</th>
                        <th className="py-3 px-3 text-right">Descontos</th>
                        <th className="py-3 px-3 text-right">Taxas</th>
                        <th className="py-3 px-3 text-right">Total</th>
                        <th className="py-3 px-3 text-right">Recebido</th>
                        <th className="py-3 px-3 text-right">Pendente</th>
                        <th className="py-3 px-3">Forma Pgto</th>
                        <th className="py-3 px-3">Status Pgto</th>
                        <th className="py-3 px-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredReportOrders.map((r) => (
                        <tr
                          key={r.id}
                          onClick={() => handleOpenOrder(r.id)}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                        >
                          <td className="py-3 px-3 font-black text-slate-900 group-hover:text-indigo-600">
                            {r.formattedOrderNumber}
                          </td>
                          <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                            {new Date(r.createdAt).toLocaleDateString('pt-BR')}{' '}
                            <span className="text-[10px] opacity-75">
                              {new Date(r.createdAt).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <strong className="block text-slate-900">{r.customerName}</strong>
                            <span className="text-[10px] text-slate-400">{r.customerPhone || '-'}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-semibold text-slate-800 block">
                              {r.fulfillmentType === 'delivery' ? 'Entrega' : r.fulfillmentType === 'pickup' ? 'Retirada' : 'Mesa'}
                            </span>
                            <span className="text-[10px] text-slate-500">{r.tableNumber ? `Mesa ${r.tableNumber}` : '-'}</span>
                          </td>
                          <td className="py-3 px-3 max-w-[150px] truncate text-slate-600">
                            {r.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-700">
                            {formatMoney(r.subtotal)}
                          </td>
                          <td className="py-3 px-3 text-right text-rose-600 font-semibold">
                            {r.discount > 0 ? `- ${formatMoney(r.discount)}` : '-'}
                          </td>
                          <td className="py-3 px-3 text-right text-indigo-700">
                            {formatMoney(r.deliveryFee + r.serviceFee)}
                          </td>
                          <td className="py-3 px-3 text-right font-black text-slate-900">
                            {formatMoney(r.total)}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-emerald-700">
                            {formatMoney(r.paidAmount)}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-amber-900">
                            {formatMoney(r.pendingAmount)}
                          </td>
                          <td className="py-3 px-3 text-slate-700">{r.paymentMethodLabel}</td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                r.paymentStatus === 'paid'
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : r.paymentStatus === 'partial'
                                  ? 'bg-amber-50 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {FINANCIAL_PAYMENT_STATUS_LABELS[r.paymentStatus] || r.paymentStatus}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenOrder(r.id);
                              }}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg cursor-pointer"
                              title="Ver detalhes do pedido"
                            >
                              <Eye className="w-4 h-4" />
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
        </>
      )}

      {/* Inspect Order Modal */}
      {inspectOrder && (
        <UnifiedOrderDetailModal
          order={inspectOrder}
          tenantName={tenant.name}
          onOrderUpdated={(updated) => {
            setInspectOrder(updated);
            loadDashboard(true);
          }}
          onClose={() => setInspectOrder(null)}
        />
      )}
    </div>
  );
};
