import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Tenant } from '../../types/saas';
import { StatusBadge } from '../common/Badge';
import {
  Building2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  Plus,
  ArrowRight,
  TrendingUp,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

interface DashboardOverviewProps {
  onOpenNewTenant: () => void;
  onSelectTenant: (tenantId: string) => void;
  onNavigateTab: (tab: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  onOpenNewTenant,
  onSelectTenant,
  onNavigateTab,
}) => {
  const baseDomain = React.useMemo(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('localhub_base_domain');
      if (saved) return saved;
      const host = window.location.host;
      if (host && !host.includes('localhost') && !host.includes('127.0.0.1') && !host.includes('run.app')) {
        return host;
      }
    }
    return 'meudominio.com';
  }, []);

  const [stats, setStats] = useState<{
    totalTenants: number;
    activeTenants: number;
    suspendedTenants: number;
    trialTenants: number;
    pendingTenants: number;
    overdueTenants: number;
    totalClientUsers: number;
    recentTenants: Tenant[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await api.getSuperAdminStats();
      setStats(data);
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200/80 animate-pulse h-28" />
          ))}
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 animate-pulse h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Visão Geral da Plataforma</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Gerenciamento global de tenants, permissões e status dos estabelecimentos cadastrados.
          </p>
        </div>
        <button
          onClick={onOpenNewTenant}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-all shadow-sm shadow-indigo-600/20 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nova Empresa
        </button>
      </div>

      {/* Modern KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Empresas */}
        <div
          onClick={() => onNavigateTab('tenants')}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-indigo-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total de Empresas</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{stats.totalTenants}</span>
            <span className="text-xs text-slate-400">cadastradas</span>
          </div>
        </div>

        {/* Ativas */}
        <div
          onClick={() => onNavigateTab('tenants')}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-emerald-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Empresas Ativas</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-600">{stats.activeTenants}</span>
            <span className="text-xs text-slate-400">em operação</span>
          </div>
        </div>

        {/* Em Teste */}
        <div
          onClick={() => onNavigateTab('tenants')}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-blue-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Em Teste</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-blue-600">{stats.trialTenants}</span>
            <span className="text-xs text-slate-400">período trial</span>
          </div>
        </div>

        {/* Suspensas */}
        <div
          onClick={() => onNavigateTab('tenants')}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-rose-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Suspensas</span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-rose-600">{stats.suspendedTenants}</span>
            <span className="text-xs text-slate-400">bloqueadas</span>
          </div>
        </div>

        {/* Usuários Clientes */}
        <div
          onClick={() => onNavigateTab('users')}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-purple-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Gestores Clientes</span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-purple-600">{stats.totalClientUsers}</span>
            <span className="text-xs text-slate-400">acessos ativos</span>
          </div>
        </div>
      </div>

      {/* Multi-tenant Architecture Architecture Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-indigo-500/20 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              Arquitetura Multi-Tenant Isolada
            </div>
            <h3 className="text-lg font-bold">Subdomínios Dinâmicos e Separação por Tenant ID</h3>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Cada empresa opera sob um identificador único <code className="bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300">tenant_id</code> e subdomínio previsto <code className="bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300">{`{slug}.${baseDomain}`}</code>. 
              As regras de permissão no backend garantem isolamento estrito contra vazamento de dados.
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('tenants')}
            className="shrink-0 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-colors border border-white/20 flex items-center gap-2 cursor-pointer"
          >
            Ver Todas Empresas
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Recent Companies Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200/70 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Empresas Cadastradas Recentemente</h2>
            <p className="text-xs text-slate-500 mt-0.5">Últimos estabelecimentos criados na plataforma</p>
          </div>
          <button
            onClick={() => onNavigateTab('tenants')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 cursor-pointer"
          >
            Ver todas ({stats.totalTenants})
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {stats.recentTenants.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              Nenhuma empresa cadastrada ainda.
            </div>
          ) : (
            stats.recentTenants.map((tenant) => (
              <div
                key={tenant.id}
                onClick={() => onSelectTenant(tenant.id)}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white shadow-xs shrink-0"
                    style={{ backgroundColor: tenant.appearance.primaryColor || '#1e293b' }}
                  >
                    {tenant.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                        {tenant.name}
                      </h4>
                      <StatusBadge status={tenant.status} />
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-slate-600">{tenant.subdomain}</span>
                      <span>•</span>
                      <span>Resp: {tenant.ownerName}</span>
                      <span>•</span>
                      <span>{tenant.segment}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <span className="text-xs text-slate-400">
                    {new Date(tenant.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                  <div className="p-1.5 rounded-lg text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
