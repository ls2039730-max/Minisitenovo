import React, { useState, useEffect } from 'react';
import { Plan, Tenant } from '../../types/saas';
import { StatusBadge } from '../common/Badge';
import { isTenantFeatureEnabled } from '../../utils/features';
import { getPublicStoreUrl } from '../../utils/url';
import { useAuth } from '../../context/AuthContext';
import {
  Globe,
  ExternalLink,
  Check,
  Copy,
  ShoppingBag,
  UtensilsCrossed,
  DollarSign,
  Receipt,
  BellRing,
  TrendingUp,
  ChevronRight,
} from 'lucide-react';
import { api } from '../../services/api';
import { FinancialDashboardResponse, EnrichedTablesOverviewResponse } from '../../types/analytics';

interface ClientHomeViewProps {
  tenant: Tenant;
  plans: Plan[];
  onNavigateTab: (tab: string) => void;
}

export const ClientHomeView: React.FC<ClientHomeViewProps> = ({
  tenant,
  plans,
  onNavigateTab,
}) => {
  const { resolvedFeatures } = useAuth();
  const currentPlan = plans.find((p) => p.id === tenant.planId);
  const [copied, setCopied] = useState(false);

  // Centralized feature flags
  const hasRestaurantCatalog = isTenantFeatureEnabled('restaurant_tables', resolvedFeatures, tenant, currentPlan);
  const hasShoppingCart = isTenantFeatureEnabled('shopping_cart', resolvedFeatures, tenant, currentPlan);
  const hasProducts = isTenantFeatureEnabled('products', resolvedFeatures, tenant, currentPlan);
  const hasOrdersAccess = hasShoppingCart || hasRestaurantCatalog;

  // Live operational and financial indicators
  const [dashboardData, setDashboardData] = useState<FinancialDashboardResponse | null>(null);
  const [tablesOverview, setTablesOverview] = useState<EnrichedTablesOverviewResponse | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  const publicUrl = getPublicStoreUrl(tenant.slug);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    let isMounted = true;
    const loadHomeIndicators = async () => {
      try {
        setLoadingMetrics(true);
        const [dash, tables] = await Promise.all([
          api.getFinancialDashboard({ period: 'today' }).catch(() => null),
          hasRestaurantCatalog
            ? api.getEnrichedTablesOverview({ period: 'today' }).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (isMounted) {
          setDashboardData(dash);
          setTablesOverview(tables);
        }
      } catch (err) {
        console.error('Error loading home metrics:', err);
      } finally {
        if (isMounted) setLoadingMetrics(false);
      }
    };

    loadHomeIndicators();
    return () => {
      isMounted = false;
    };
  }, [tenant.id, hasRestaurantCatalog]);

  const closingTables = hasRestaurantCatalog
    ? (tablesOverview?.tables || []).filter((t) => t.visualState === 'closing')
    : [];
  const preparingTables = hasRestaurantCatalog
    ? (tablesOverview?.tables || []).filter((t) => t.visualState === 'preparing')
    : [];
  const pendingOrders = hasOrdersAccess
    ? (dashboardData?.reportOrders || []).filter(
        (r: any) =>
          r.operationalStatus === 'received' ||
          r.operationalStatus === 'confirmed' ||
          r.operationalStatus === 'NEW' ||
          r.operationalStatus === 'CONFIRMED'
      )
    : [];

  const formatMoney = (val: number | null | undefined) =>
    `R$ ${Number(val || 0)
      .toFixed(2)
      .replace('.', ',')}`;

  const quickLinks = [
    {
      key: 'home',
      baseLabel: 'Visão Geral',
      subtitle: 'Resumo do dia',
      icon: TrendingUp,
      iconBg: 'bg-indigo-50 text-indigo-600',
      hoverText: 'group-hover:text-indigo-600',
      active: true,
      enabled: true,
    },
    {
      key: 'orders',
      baseLabel: 'Pedidos',
      subtitle: 'Filtros & entregas',
      icon: ShoppingBag,
      iconBg: 'bg-blue-50 text-blue-600',
      hoverText: 'group-hover:text-blue-600',
      active: false,
      enabled: hasOrdersAccess,
    },
    {
      key: 'restaurant',
      baseLabel: 'Mesas',
      subtitle: '5 estados & comandas',
      icon: UtensilsCrossed,
      iconBg: 'bg-amber-50 text-amber-600',
      hoverText: 'group-hover:text-amber-600',
      active: false,
      enabled: hasRestaurantCatalog,
    },
    {
      key: 'financial',
      baseLabel: 'Financeiro',
      subtitle: 'KPIs & 6 gráficos',
      icon: DollarSign,
      iconBg: 'bg-emerald-50 text-emerald-600',
      hoverText: 'group-hover:text-emerald-600',
      active: false,
      enabled: true,
    },
    {
      key: 'top_products',
      baseLabel: 'Mais Vendidos',
      subtitle: 'Ranking de itens',
      icon: ShoppingBag,
      iconBg: 'bg-purple-50 text-purple-600',
      hoverText: 'group-hover:text-purple-600',
      active: false,
      enabled: hasProducts || hasOrdersAccess,
    },
    {
      key: 'reports',
      baseLabel: 'Relatórios',
      subtitle: 'Exportações CSV',
      icon: Receipt,
      iconBg: 'bg-slate-100 text-slate-700',
      hoverText: 'group-hover:text-indigo-600',
      active: false,
      enabled: true,
    },
  ]
    .filter((item) => item.enabled)
    .map((item, idx) => ({
      ...item,
      label: `${idx + 1}. ${item.baseLabel}`,
    }));

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Welcome Card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-7 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center font-extrabold text-white text-xl shadow-md shrink-0"
            style={{ backgroundColor: tenant.appearance?.primaryColor || '#1e293b' }}
          >
            {tenant.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {tenant.name}
              </h1>
              <StatusBadge status={tenant.status} />
            </div>
            <p className="text-xs text-slate-500 mt-1">{tenant.segment}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                {publicUrl}
              </span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                <span>{copied ? 'Copiado!' : 'Copiar Link'}</span>
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Ver Página Pública</span>
              </a>
            </div>
          </div>
        </div>

        <div className="flex sm:flex-col items-end justify-between sm:justify-center border-t sm:border-t-0 pt-4 sm:pt-0 border-slate-100">
          <span className="text-xs text-slate-400">Plano Atual:</span>
          <span className="text-sm font-extrabold text-slate-900 bg-slate-100 px-3 py-1 rounded-xl">
            {currentPlan?.name || 'Personalizado'}
          </span>
        </div>
      </div>

      {/* Real-Time Restaurant Action Banners (Tables needing attention — only if restaurant_tables is enabled) */}
      {hasRestaurantCatalog && closingTables.length > 0 && (
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 rounded-3xl text-white shadow-lg flex items-center justify-between gap-4 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-white text-orange-600 flex items-center justify-center font-black shadow-md shrink-0">
              <BellRing className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-black tracking-widest bg-white/20 px-2 py-0.5 rounded-full">
                Mesas Aguardando Atendimento
              </span>
              <h3 className="text-base font-black mt-0.5">
                {closingTables.length} {closingTables.length === 1 ? 'mesa solicitou' : 'mesas solicitaram'} o fechamento da conta!
              </h3>
              <p className="text-xs text-white/90">
                Mesas: {closingTables.map((t) => `Mesa ${t.tableNumber}`).join(', ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('restaurant')}
            className="px-4 py-2.5 bg-white text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-md hover:bg-amber-50 transition-colors shrink-0 cursor-pointer"
          >
            Atender Mesas
          </button>
        </div>
      )}

      {/* Main Management Areas Quick Links (strictly filtered by active tenant features) */}
      <div className="space-y-2">
        <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider px-1">
          Áreas de Gestão Operacional & Financeira
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickLinks.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigateTab(item.key)}
                className={
                  item.active
                    ? 'p-4 bg-white rounded-2xl border-2 border-indigo-600 shadow-xs flex flex-col justify-between text-left hover:bg-indigo-50/20 transition-all cursor-pointer group'
                    : 'p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between text-left hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer group'
                }
              >
                <div className={`w-9 h-9 rounded-xl ${item.iconBg} flex items-center justify-center font-bold mb-3`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <span className={`font-black text-xs text-slate-900 ${item.hoverText} block`}>
                    {item.label}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">{item.subtitle}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Today's Operational & Financial Performance Strip */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
            Indicadores de Hoje ({tenant.name})
          </h2>
          <button
            type="button"
            onClick={() => onNavigateTab('financial')}
            className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Ver dashboard completo</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className={`grid grid-cols-2 ${hasRestaurantCatalog ? 'sm:grid-cols-4' : 'sm:grid-cols-2'} gap-3.5`}>
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
              Faturamento Hoje
            </span>
            <div className="text-xl font-black text-slate-900 mt-1">
              {formatMoney(dashboardData?.kpis?.grossRevenue || 0)}
            </div>
            <span className="text-[11px] text-slate-500">
              Líquido: {formatMoney(dashboardData?.kpis?.netSales || 0)}
            </span>
          </div>

          <div className="bg-emerald-50/70 p-4 rounded-3xl border border-emerald-200 shadow-xs">
            <span className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider block">
              Recebido Hoje
            </span>
            <div className="text-xl font-black text-emerald-950 mt-1">
              {formatMoney(dashboardData?.kpis?.confirmedReceipts || 0)}
            </div>
            <span className="text-[11px] text-emerald-700">Confirmado no caixa</span>
          </div>

          {hasRestaurantCatalog && (
            <>
              <div className="bg-amber-50/70 p-4 rounded-3xl border border-amber-200 shadow-xs">
                <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider block">
                  Contas & Saldo Aberto
                </span>
                <div className="text-xl font-black text-amber-950 mt-1">
                  {formatMoney(tablesOverview?.summary?.totalPendingInOpenSessions || 0)}
                </div>
                <span className="text-[11px] text-amber-800">
                  Total em consumo: {formatMoney(tablesOverview?.summary?.totalOpenAmount || 0)}
                </span>
              </div>

              <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Mesas Ocupadas
                </span>
                <div className="text-xl font-black text-slate-900 mt-1">
                  {(tablesOverview?.summary?.occupiedTables || 0) +
                    (tablesOverview?.summary?.preparingCount || 0) +
                    (tablesOverview?.summary?.awaitingPaymentCount || 0) +
                    (tablesOverview?.summary?.closingCount || 0)}{' '}
                  / {tablesOverview?.summary?.totalTables || 0}
                </div>
                <span className="text-[11px] text-slate-500">
                  {tablesOverview?.summary?.freeTables || tablesOverview?.summary?.freeCount || 0} livres para clientes
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Quick Attention Orders & Tables section (strictly filtered by active features) */}
      {(hasRestaurantCatalog || hasOrdersAccess) && (
        <div className={`grid grid-cols-1 ${hasRestaurantCatalog && hasOrdersAccess ? 'md:grid-cols-2' : ''} gap-4`}>
          {/* Mesas que precisam de atenção */}
          {hasRestaurantCatalog && (
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <UtensilsCrossed className="w-4 h-4 text-amber-600" />
                  <span>Mesas que Precisam de Atenção</span>
                </h3>
                <button
                  type="button"
                  onClick={() => onNavigateTab('restaurant')}
                  className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  Ver Salão
                </button>
              </div>

              {closingTables.length === 0 && preparingTables.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Todas as mesas estão em dia ou disponíveis.
                </div>
              ) : (
                <div className="space-y-2">
                  {[...closingTables, ...preparingTables].slice(0, 5).map((t) => (
                    <div
                      key={t.id}
                      onClick={() => onNavigateTab('restaurant')}
                      className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-slate-900">Mesa {t.tableNumber}</strong>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                            {t.visualStateLabel}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          Consumo: {formatMoney(t.activeSession?.totalAmount)} • Falta:{' '}
                          {formatMoney(t.activeSession?.pendingAmount)}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pedidos em andamento */}
          {hasOrdersAccess && (
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-blue-600" />
                  <span>Pedidos em Andamento Hoje</span>
                </h3>
                <button
                  type="button"
                  onClick={() => onNavigateTab('orders')}
                  className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  Ver Pedidos
                </button>
              </div>

              {pendingOrders.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Nenhum novo pedido pendente no momento.
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingOrders.slice(0, 5).map((ord: any) => (
                    <div
                      key={ord.id || ord.orderId}
                      onClick={() => onNavigateTab('orders')}
                      className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-slate-900">{ord.displayCode}</strong>
                          <span className="text-[11px] text-slate-600">({ord.customerName})</span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {ord.fulfillmentLabel} • {formatMoney(ord.total)}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-900">
                        {ord.operationalStatusLabel}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
