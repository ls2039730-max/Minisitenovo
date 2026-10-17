import React, { useState } from 'react';
import { Plan, Tenant, TenantStatus } from '../../types/saas';
import { StatusBadge } from '../common/Badge';
import { ConfirmModal } from '../common/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import {
  Search,
  Plus,
  Filter,
  Building2,
  ChevronRight,
  UserCheck,
  Trash2,
  ExternalLink,
  Edit,
  Mail,
  Phone,
  Shield,
  Layers,
} from 'lucide-react';

interface TenantsListProps {
  tenants: Tenant[];
  plans: Plan[];
  onOpenNewTenant: () => void;
  onSelectTenant: (tenantId: string) => void;
  onDeleteTenant: (tenantId: string) => Promise<void>;
  onUpdateStatus: (tenantId: string, status: TenantStatus) => Promise<void>;
}

export const TenantsList: React.FC<TenantsListProps> = ({
  tenants,
  plans,
  onOpenNewTenant,
  onSelectTenant,
  onDeleteTenant,
  onUpdateStatus,
}) => {
  const { impersonate } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');

  // Deletion modal state
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Quick status change dropdown state
  const [statusDropdownTenantId, setStatusDropdownTenantId] = useState<string | null>(null);

  const planMap = React.useMemo(() => {
    const map = new Map<string, Plan>();
    plans.forEach((p) => map.set(p.id, p));
    return map;
  }, [plans]);

  // Filtered tenants
  const filteredTenants = tenants.filter((tenant) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      tenant.name.toLowerCase().includes(term) ||
      tenant.slug.toLowerCase().includes(term) ||
      tenant.ownerName.toLowerCase().includes(term) ||
      tenant.ownerEmail.toLowerCase().includes(term) ||
      tenant.segment.toLowerCase().includes(term);

    const matchesStatus = statusFilter === 'all' || tenant.status === statusFilter;
    const matchesPlan = planFilter === 'all' || tenant.planId === planFilter;

    return matchesSearch && matchesStatus && matchesPlan;
  });

  const handleDeleteConfirm = async () => {
    if (!tenantToDelete) return;
    setIsDeleting(true);
    try {
      await onDeleteTenant(tenantToDelete.id);
      setTenantToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImpersonate = async (e: React.MouseEvent, tenantId: string) => {
    e.stopPropagation();
    try {
      await impersonate(tenantId);
    } catch (err: any) {
      alert(`Falha ao acessar como cliente: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header & New Tenant CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Gerenciamento de Empresas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cadastre, audite e configure os estabelecimentos locais da plataforma ({tenants.length} empresas no total).
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

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, slug, responsável ou e-mail..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Todos os Status</option>
              <option value="ativo">Ativo</option>
              <option value="teste">Em Teste</option>
              <option value="pagamento_pendente">Pagamento Pendente</option>
              <option value="atrasado">Atrasado</option>
              <option value="suspenso">Suspenso</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          {/* Plan Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Plano:</span>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Todos os Planos</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {(searchTerm || statusFilter !== 'all' || planFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setPlanFilter('all');
              }}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded cursor-pointer"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tenants Table / Cards */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {filteredTenants.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">Nenhuma empresa encontrada</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Nenhum estabelecimento corresponde aos filtros selecionados. Tente ajustar a busca.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-6">Empresa & Slug</th>
                  <th className="py-3.5 px-4">Responsável</th>
                  <th className="py-3.5 px-4">Contato</th>
                  <th className="py-3.5 px-4">Plano</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Cadastro</th>
                  <th className="py-3.5 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredTenants.map((tenant) => {
                  const plan = planMap.get(tenant.planId);
                  return (
                    <tr
                      key={tenant.id}
                      onClick={() => onSelectTenant(tenant.id)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                    >
                      {/* Empresa e Logo */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-xs shrink-0 text-xs"
                            style={{ backgroundColor: tenant.appearance.primaryColor || '#1e293b' }}
                          >
                            {tenant.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                              {tenant.name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                              {tenant.subdomain}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">{tenant.segment}</div>
                          </div>
                        </div>
                      </td>

                      {/* Responsável */}
                      <td className="py-4 px-4">
                        <div className="font-medium text-slate-900">{tenant.ownerName}</div>
                        <div className="text-[11px] text-slate-400">{tenant.ownerEmail}</div>
                      </td>

                      {/* Contato */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1 text-slate-600">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{tenant.phone}</span>
                        </div>
                        <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
                          WhatsApp: {tenant.whatsapp}
                        </div>
                      </td>

                      {/* Plano */}
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                          {plan?.name || 'Personalizado'}
                        </span>
                      </td>

                      {/* Status com Dropdown Rápido */}
                      <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={() =>
                              setStatusDropdownTenantId(
                                statusDropdownTenantId === tenant.id ? null : tenant.id
                              )
                            }
                            className="cursor-pointer"
                          >
                            <StatusBadge status={tenant.status} />
                          </button>
                          {statusDropdownTenantId === tenant.id && (
                            <div className="absolute left-0 mt-2 w-44 rounded-xl bg-white shadow-xl border border-slate-100 z-20 p-1.5 animate-in fade-in zoom-in-95">
                              <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">
                                Alterar Status
                              </div>
                              {(['ativo', 'teste', 'pagamento_pendente', 'atrasado', 'suspenso', 'cancelado'] as TenantStatus[]).map((st) => (
                                <button
                                  key={st}
                                  onClick={async () => {
                                    await onUpdateStatus(tenant.id, st);
                                    setStatusDropdownTenantId(null);
                                  }}
                                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize flex items-center justify-between hover:bg-slate-50 cursor-pointer ${
                                    tenant.status === st ? 'font-bold text-indigo-600 bg-indigo-50/50' : 'text-slate-700'
                                  }`}
                                >
                                  {st.replace('_', ' ')}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Data de Cadastro */}
                      <td className="py-4 px-4 text-slate-400 text-[11px]">
                        {new Date(tenant.createdAt).toLocaleDateString('pt-BR')}
                      </td>

                      {/* Ações */}
                      <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            title="Acessar como cliente (Impersonation)"
                            onClick={(e) => handleImpersonate(e, tenant.id)}
                            className="p-2 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                          <button
                            title="Ver detalhes da empresa"
                            onClick={() => onSelectTenant(tenant.id)}
                            className="p-2 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <button
                            title="Excluir empresa"
                            onClick={() => setTenantToDelete(tenant)}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
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
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {tenantToDelete && (
        <ConfirmModal
          isOpen={!!tenantToDelete}
          title={`Excluir ${tenantToDelete.name}?`}
          message={`Atenção: Essa ação excluirá permanentemente todos os registros, usuários e configurações associados ao tenant "${tenantToDelete.name}" (${tenantToDelete.slug}). Não será possível recuperar estas informações.`}
          confirmText="Sim, excluir empresa"
          cancelText="Cancelar"
          isDestructive={true}
          loading={isDeleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setTenantToDelete(null)}
        />
      )}
    </div>
  );
};
