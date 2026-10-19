import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { FeatureKey, Plan, Tenant, TenantStatus, User, UserRole, FeatureDefinition } from '../../types/saas';
import { OrdersSummary } from '../../types/order';
import { SYSTEM_FEATURES, getFeatureResolution } from '../../utils/features';
import { StatusBadge } from '../common/Badge';
import { ConfirmModal } from '../common/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  Globe,
  Mail,
  Palette,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Shield,
  Sliders,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  Lock,
  Send,
  Eye,
  ShoppingBag,
} from 'lucide-react';

interface TenantDetailViewProps {
  tenantId: string;
  plans: Plan[];
  onBack: () => void;
  onTenantUpdated: () => void;
  onTenantDeleted: () => void;
}

export const TenantDetailView: React.FC<TenantDetailViewProps> = ({
  tenantId,
  plans,
  onBack,
  onTenantUpdated,
  onTenantDeleted,
}) => {
  const { impersonate } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'company_data' | 'users' | 'features' | 'appearance' | 'settings'
  >('overview');

  // Feedback banner state
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [editFormData, setEditFormData] = useState<Partial<Tenant>>({});
  const [isSaving, setIsSaving] = useState(false);

  // User modal / edit state
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userFormName, setUserFormName] = useState('');
  const [userFormEmail, setUserFormEmail] = useState('');
  const [userFormPhone, setUserFormPhone] = useState('');
  const [userFormRole, setUserFormRole] = useState<UserRole>('CLIENT_ADMIN');
  const [userFormPassword, setUserFormPassword] = useState('');
  const [userModalLoading, setUserModalLoading] = useState(false);

  // Deletion modals
  const [confirmDeleteTenant, setConfirmDeleteTenant] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Products module summary
  const [productsSummary, setProductsSummary] = useState<{
    totalProducts: number;
    activeProducts: number;
    outOfStockProducts: number;
    categoriesCount: number;
  } | null>(null);

  // Orders module summary
  const [ordersSummary, setOrdersSummary] = useState<OrdersSummary | null>(null);

  useEffect(() => {
    loadData();
  }, [tenantId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tData, uData, pSummary, oSummary] = await Promise.all([
        api.getTenant(tenantId),
        api.getTenantUsers(tenantId),
        api.getTenantProductsSummary(tenantId).catch(() => null),
        api.getTenantOrdersSummary(tenantId).catch(() => null),
      ]);
      setTenant(tData);
      setUsers(uData);
      setProductsSummary(pSummary);
      setOrdersSummary(oSummary);
      setEditFormData(tData);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar dados da empresa.');
    } finally {
      setLoading(false);
    }
  };

  const currentPlan = plans.find((p) => p.id === tenant?.planId);

  const showToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // 1. Save general company data
  const handleSaveCompanyData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const updated = await api.updateTenant(tenant.id, editFormData);
      setTenant(updated);
      onTenantUpdated();
      showToast('Dados cadastrais da empresa salvos com sucesso!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar alterações.');
    } finally {
      setIsSaving(false);
    }
  };

  // 2. Toggle Feature
  const handleToggleFeature = async (featureKey: FeatureKey, currentActive: boolean) => {
    if (!tenant) return;
    try {
      const newActive = !currentActive;
      const overrides = {
        ...tenant.featureOverrides,
        [featureKey]: newActive,
      };
      const updated = await api.updateTenantFeatures(tenant.id, overrides);
      setTenant(updated);
      onTenantUpdated();
      showToast(`Recurso "${featureKey}" ${newActive ? 'ativado' : 'desativado'} para esta empresa.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao alterar recurso.');
    }
  };

  // 3. Reset Feature to plan default
  const handleResetFeature = async (featureKey: FeatureKey) => {
    if (!tenant) return;
    try {
      const updated = await api.resetTenantFeature(tenant.id, featureKey);
      setTenant(updated);
      onTenantUpdated();
      showToast(`Recurso "${featureKey}" restaurado para a herança do plano.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao restaurar recurso.');
    }
  };

  // 4. Save Appearance
  const handleSaveAppearance = async () => {
    if (!tenant) return;
    setIsSaving(true);
    try {
      const updated = await api.updateTenant(tenant.id, {
        appearance: editFormData.appearance,
      });
      setTenant(updated);
      onTenantUpdated();
      showToast('Identidade visual atualizada com sucesso!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar aparência.');
    } finally {
      setIsSaving(false);
    }
  };

  // 5. Change Tenant Status
  const handleChangeStatus = async (newStatus: TenantStatus) => {
    if (!tenant) return;
    try {
      const updated = await api.updateTenantStatus(tenant.id, newStatus);
      setTenant(updated);
      setEditFormData((prev) => ({ ...prev, status: newStatus }));
      onTenantUpdated();
      showToast(`Status da empresa atualizado para "${newStatus}".`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao atualizar status.');
    }
  };

  // 6. User Management
  const handleOpenUserModal = (userToEdit?: User) => {
    if (userToEdit) {
      setEditingUser(userToEdit);
      setUserFormName(userToEdit.name);
      setUserFormEmail(userToEdit.email);
      setUserFormPhone(userToEdit.phone || '');
      setUserFormRole(userToEdit.role);
      setUserFormPassword('');
    } else {
      setEditingUser(null);
      setUserFormName('');
      setUserFormEmail('');
      setUserFormPhone('');
      setUserFormRole('CLIENT_ADMIN');
      setUserFormPassword('');
    }
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setUserModalLoading(true);
    try {
      if (editingUser) {
        await api.updateTenantUser(tenant.id, editingUser.id, {
          name: userFormName,
          phone: userFormPhone,
          role: userFormRole,
          password: userFormPassword || undefined,
        });
        showToast('Usuário atualizado com sucesso!');
      } else {
        await api.createTenantUser(tenant.id, {
          name: userFormName,
          email: userFormEmail,
          phone: userFormPhone,
          role: userFormRole,
          password: userFormPassword || 'cliente123',
        });
        showToast('Novo usuário associado ao tenant com sucesso!');
      }
      setUserModalOpen(false);
      const updatedUsers = await api.getTenantUsers(tenant.id);
      setUsers(updatedUsers);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar usuário.');
    } finally {
      setUserModalLoading(false);
    }
  };

  const handleToggleUserStatus = async (user: User) => {
    if (!tenant) return;
    try {
      const newStatus = user.status === 'active' ? 'inactive' : 'active';
      await api.updateTenantUser(tenant.id, user.id, { status: newStatus });
      const updatedUsers = await api.getTenantUsers(tenant.id);
      setUsers(updatedUsers);
      showToast(`Status do usuário alterado para ${newStatus}.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao atualizar status do usuário.');
    }
  };

  const handleResendInvite = async (user: User) => {
    if (!tenant) return;
    try {
      const res = await api.resendInvite(tenant.id, user.id);
      showToast(res.message);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao reenviar convite.');
    }
  };

  const handleDeleteUserConfirm = async () => {
    if (!tenant || !userToDelete) return;
    try {
      await api.deleteTenantUser(tenant.id, userToDelete.id);
      setUserToDelete(null);
      const updatedUsers = await api.getTenantUsers(tenant.id);
      setUsers(updatedUsers);
      showToast('Acesso do usuário removido deste tenant.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao remover usuário.');
    }
  };

  const handleDeleteTenantConfirm = async () => {
    if (!tenant) return;
    try {
      await api.deleteTenant(tenant.id);
      onTenantDeleted();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir empresa.');
    }
  };

  if (loading || !tenant) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 animate-pulse h-96 flex items-center justify-center">
        <span className="text-slate-400 text-sm">Carregando detalhes da empresa...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200 pb-12">
      {/* Toast Notification */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-white shadow-sm text-sm shrink-0"
              style={{ backgroundColor: tenant.appearance.primaryColor || '#1e293b' }}
            >
              {tenant.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{tenant.name}</h1>
                <StatusBadge status={tenant.status} />
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                <span className="font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                  {tenant.subdomain}
                </span>
                <span>•</span>
                <span>Plano: {currentPlan?.name || 'Personalizado'}</span>
                <span>•</span>
                <span className="font-mono text-[11px] text-slate-400">ID: {tenant.id}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => impersonate(tenant.id)}
            className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs border border-amber-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Eye className="w-3.5 h-3.5 text-amber-600" />
            Visualizar como Cliente
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200/80 overflow-x-auto pb-px">
        {[
          { key: 'overview', label: 'Visão Geral', icon: Building2 },
          { key: 'company_data', label: 'Dados da Empresa', icon: Save },
          { key: 'users', label: `Usuários (${users.length})`, icon: Users },
          { key: 'features', label: 'Recursos & Permissões', icon: Sliders },
          { key: 'appearance', label: 'Aparência', icon: Palette },
          { key: 'settings', label: 'Configurações', icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40 rounded-t-xl'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* ABA 1: VISÃO GERAL */}
      {/* ======================================================== */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-150">
          {/* Card Resumo do Negócio */}
          <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
                Identificação do Tenant
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">Nome Fantasia</span>
                  <span className="text-slate-900 font-bold text-sm mt-0.5 block">{tenant.name}</span>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">Slug do Tenant</span>
                  <span className="text-indigo-600 font-mono font-bold text-sm mt-0.5 block">{tenant.slug}</span>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">Subdomínio Previsto</span>
                  <span className="text-slate-900 font-mono font-bold text-sm mt-0.5 block flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-indigo-500" />
                    {tenant.subdomain}
                  </span>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">Segmento</span>
                  <span className="text-slate-900 font-semibold text-sm mt-0.5 block">{tenant.segment}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
                Responsável Principal
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">Nome</span>
                  <span className="text-slate-900 font-bold text-sm mt-0.5 block">{tenant.ownerName}</span>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">E-mail</span>
                  <span className="text-slate-900 font-medium text-xs mt-0.5 block">{tenant.ownerEmail}</span>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">Telefone</span>
                  <span className="text-slate-900 font-medium text-xs mt-0.5 block">{tenant.ownerPhone || tenant.phone}</span>
                </div>
              </div>
            </div>

            {productsSummary && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                    Catálogo de Produtos (Resumo)
                  </h3>
                  <button
                    onClick={() => impersonate(tenant.id)}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Gerenciar como Cliente</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block font-medium">Produtos Cadastrados</span>
                    <span className="text-slate-900 font-bold text-lg mt-0.5 block">{productsSummary.totalProducts}</span>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block font-medium">Produtos Ativos</span>
                    <span className="text-emerald-600 font-bold text-lg mt-0.5 block">{productsSummary.activeProducts}</span>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block font-medium">Produtos Esgotados</span>
                    <span className={`font-bold text-lg mt-0.5 block ${productsSummary.outOfStockProducts > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                      {productsSummary.outOfStockProducts}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block font-medium">Categorias</span>
                    <span className="text-indigo-600 font-bold text-lg mt-0.5 block">{productsSummary.categoriesCount}</span>
                  </div>
                </div>
              </div>
            )}

            {ordersSummary && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                    Vendas & Pedidos (Resumo)
                  </h3>
                  <button
                    onClick={() => impersonate(tenant.id)}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Ver no Painel de Pedidos</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block font-medium">Pedidos Hoje</span>
                    <span className="text-slate-900 font-bold text-lg mt-0.5 block">{ordersSummary.ordersTodayCount}</span>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block font-medium">Novos / Pendentes</span>
                    <span className="text-amber-600 font-bold text-lg mt-0.5 block">{ordersSummary.ordersNewCount}</span>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block font-medium">Concluídos Hoje</span>
                    <span className="text-emerald-600 font-bold text-lg mt-0.5 block">{ordersSummary.ordersCompletedCount}</span>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block font-medium">Faturamento Hoje</span>
                    <span className="text-indigo-600 font-bold text-lg mt-0.5 block">
                      R$ {ordersSummary.ordersTodayTotal.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
                Datas e Auditoria do Sistema
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">Data de Criação</span>
                  <span className="text-slate-700 font-medium mt-0.5 block">
                    {new Date(tenant.createdAt).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">Última Atualização</span>
                  <span className="text-slate-700 font-medium mt-0.5 block">
                    {new Date(tenant.updatedAt).toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna Lateral: Status e Plano */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Plano Contratado
              </h3>
              <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-indigo-900 text-base">{currentPlan?.name}</span>
                  <span className="text-xs font-bold text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                    R$ {currentPlan?.price.toFixed(2)}/mês
                  </span>
                </div>
                <p className="text-xs text-indigo-700 mt-2 leading-relaxed">
                  {currentPlan?.description}
                </p>
                <div className="mt-4 pt-3 border-t border-indigo-200/60 flex items-center justify-between text-xs text-indigo-900 font-medium">
                  <span>Recursos inclusos no plano:</span>
                  <span className="font-bold">{currentPlan?.includedFeatures.length}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Status Atual da Empresa
              </h3>
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-semibold text-slate-600">Situação:</span>
                <StatusBadge status={tenant.status} />
              </div>
              <div className="text-xs text-slate-500 leading-relaxed">
                Empresas com status <strong>Suspenso</strong> ou <strong>Cancelado</strong> são automaticamente bloqueadas no backend contra logins e visualizações.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ABA 2: DADOS DA EMPRESA */}
      {/* ======================================================== */}
      {activeTab === 'company_data' && (
        <form onSubmit={handleSaveCompanyData} className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6 animate-in fade-in duration-150">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Atualizar Dados Cadastrais</h3>
            <p className="text-xs text-slate-500 mt-0.5">Modifique as informações comerciais e contatos desta empresa</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nome da Empresa</label>
              <input
                type="text"
                value={editFormData.name || ''}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Slug do Subdomínio</label>
              <input
                type="text"
                value={editFormData.slug || ''}
                onChange={(e) => setEditFormData({ ...editFormData, slug: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Segmento</label>
              <input
                type="text"
                value={editFormData.segment || ''}
                onChange={(e) => setEditFormData({ ...editFormData, segment: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">CNPJ</label>
              <input
                type="text"
                value={editFormData.cnpj || ''}
                onChange={(e) => setEditFormData({ ...editFormData, cnpj: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone Comercial</label>
              <input
                type="text"
                value={editFormData.phone || ''}
                onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp</label>
              <input
                type="text"
                value={editFormData.whatsapp || ''}
                onChange={(e) => setEditFormData({ ...editFormData, whatsapp: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail da Empresa</label>
              <input
                type="email"
                value={editFormData.email || ''}
                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Responsável</label>
              <input
                type="text"
                value={editFormData.ownerName || ''}
                onChange={(e) => setEditFormData({ ...editFormData, ownerName: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail do Responsável</label>
              <input
                type="email"
                value={editFormData.ownerEmail || ''}
                onChange={(e) => setEditFormData({ ...editFormData, ownerEmail: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Notas Internas da Plataforma</label>
              <textarea
                rows={3}
                value={editFormData.notes || ''}
                onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                placeholder="Observações restritas ao Super Admin..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Alterações
            </button>
          </div>
        </form>
      )}

      {/* ======================================================== */}
      {/* ABA 3: USUÁRIOS */}
      {/* ======================================================== */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden animate-in fade-in duration-150">
          <div className="px-6 py-5 border-b border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Usuários Vinculados à Empresa</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Usuários com acesso a este tenant ({users.length} usuários cadastrados)
              </p>
            </div>
            <button
              onClick={() => handleOpenUserModal()}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <UserPlus className="w-4 h-4" />
              Adicionar Usuário
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-6">Nome & E-mail</th>
                  <th className="py-3 px-4">Telefone</th>
                  <th className="py-3 px-4">Função</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Cadastro</th>
                  <th className="py-3 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-6">
                      <div className="font-bold text-slate-900">{u.name}</div>
                      <div className="text-[11px] text-slate-400">{u.email}</div>
                    </td>
                    <td className="py-3.5 px-4">{u.phone || '—'}</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-800">
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          u.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {u.status === 'active' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          title="Reenviar Convite"
                          onClick={() => handleResendInvite(u)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                        <button
                          title={u.status === 'active' ? 'Desativar usuário' : 'Ativar usuário'}
                          onClick={() => handleToggleUserStatus(u)}
                          className={`p-1.5 rounded-lg cursor-pointer ${
                            u.status === 'active'
                              ? 'text-amber-600 hover:bg-amber-50'
                              : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                        </button>
                        <button
                          title="Editar usuário"
                          onClick={() => handleOpenUserModal(u)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                        </button>
                        <button
                          title="Remover acesso"
                          onClick={() => setUserToDelete(u)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ABA 4: RECURSOS & PERMISSÕES (FEATURES) */}
      {/* ======================================================== */}
      {activeTab === 'features' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6 animate-in fade-in duration-150">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Recursos e Permissões da Empresa</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure quais módulos esta empresa tem acesso. As permissões são validadas no backend em todas as rotas.
                </p>
              </div>
              <div className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                Plano Base: <strong className="text-indigo-600">{currentPlan?.name}</strong>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SYSTEM_FEATURES.map((feature) => {
              const res = getFeatureResolution(tenant, currentPlan, feature.key);
              const isOverridden = tenant.featureOverrides?.[feature.key] !== undefined;

              return (
                <div
                  key={feature.key}
                  className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-4 ${
                    res.active
                      ? 'bg-emerald-50/20 border-emerald-200/80'
                      : 'bg-slate-50/60 border-slate-200'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">{feature.name}</span>
                      <span className="font-mono text-[10px] text-slate-400">({feature.key})</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{feature.description}</p>
                    <div className="pt-1.5 flex items-center gap-2">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                          isOverridden
                            ? res.active
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-rose-100 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {res.label}
                      </span>
                      {isOverridden && (
                        <button
                          type="button"
                          onClick={() => handleResetFeature(feature.key)}
                          className="text-[10px] text-slate-400 hover:text-indigo-600 underline cursor-pointer"
                        >
                          Restaurar padrão do plano
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Switch Button */}
                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleFeature(feature.key, res.active)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                        res.active ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          res.active ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ABA 5: APARÊNCIA */}
      {/* ======================================================== */}
      {activeTab === 'appearance' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6 animate-in fade-in duration-150">
          <div>
            <h3 className="text-base font-bold text-slate-900">Identidade Visual da Empresa</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Personalização de cores, tipografia e logo específicas para este tenant.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Color & Font Controls */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Logomarca da Empresa
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editFormData.appearance?.logoUrl || ''}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        appearance: {
                          ...editFormData.appearance!,
                          logoUrl: e.target.value,
                        },
                      })
                    }
                    placeholder="https://exemplo.com/logo.png ou faça upload"
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  <label className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0">
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = async () => {
                          const base64 = reader.result as string;
                          try {
                            const res = await api.uploadMedia(base64, file.name, file.type);
                            setEditFormData({
                              ...editFormData,
                              appearance: {
                                ...editFormData.appearance!,
                                logoUrl: res.url,
                              },
                            });
                            showToast('Upload de imagem realizado com sucesso!');
                          } catch (err: any) {
                            setErrorMsg('Erro no upload: ' + err.message);
                          }
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Slogan ou Frase de Destaque
                </label>
                <input
                  type="text"
                  value={editFormData.appearance?.tagline || ''}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      appearance: {
                        ...editFormData.appearance!,
                        tagline: e.target.value,
                      },
                    })
                  }
                  placeholder="Ex: Qualidade e tradição no atendimento."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cor Primária</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editFormData.appearance?.primaryColor || '#1e293b'}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          appearance: {
                            ...editFormData.appearance!,
                            primaryColor: e.target.value,
                          },
                        })
                      }
                      className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={editFormData.appearance?.primaryColor || '#1e293b'}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          appearance: {
                            ...editFormData.appearance!,
                            primaryColor: e.target.value,
                          },
                        })
                      }
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-mono text-[11px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cor Secundária</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editFormData.appearance?.secondaryColor || '#3b82f6'}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          appearance: {
                            ...editFormData.appearance!,
                            secondaryColor: e.target.value,
                          },
                        })
                      }
                      className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={editFormData.appearance?.secondaryColor || '#3b82f6'}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          appearance: {
                            ...editFormData.appearance!,
                            secondaryColor: e.target.value,
                          },
                        })
                      }
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-mono text-[11px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Destaque</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editFormData.appearance?.accentColor || '#f59e0b'}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          appearance: {
                            ...editFormData.appearance!,
                            accentColor: e.target.value,
                          },
                        })
                      }
                      className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={editFormData.appearance?.accentColor || '#f59e0b'}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          appearance: {
                            ...editFormData.appearance!,
                            accentColor: e.target.value,
                          },
                        })
                      }
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-mono text-[11px]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Fonte da Identidade Visual
                </label>
                <select
                  value={editFormData.appearance?.fontFamily || 'Inter'}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      appearance: {
                        ...editFormData.appearance!,
                        fontFamily: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Inter">Inter (Moderna & Limpa)</option>
                  <option value="Roboto">Roboto (Clássica & Técnica)</option>
                  <option value="Poppins">Poppins (Geométrica & Amigável)</option>
                  <option value="Montserrat">Montserrat (Marcante & Elegante)</option>
                  <option value="Playfair Display">Playfair Display (Sofisticada & Tradicional)</option>
                </select>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSaveAppearance}
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar Identidade Visual
                </button>
              </div>
            </div>

            {/* Live Visual Preview Card */}
            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Preview da Identidade Visual
              </span>
              <div
                className="rounded-2xl border border-slate-200 shadow-md p-6 text-white space-y-4 transition-all"
                style={{
                  backgroundColor: editFormData.appearance?.primaryColor || '#1e293b',
                  fontFamily: editFormData.appearance?.fontFamily || 'Inter',
                }}
              >
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-sm"
                      style={{
                        backgroundColor: editFormData.appearance?.secondaryColor || '#3b82f6',
                      }}
                    >
                      {tenant.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-extrabold text-base leading-tight">{tenant.name}</h4>
                      <p className="text-[11px] opacity-75">{tenant.segment}</p>
                    </div>
                  </div>
                  <span
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
                    style={{
                      backgroundColor: editFormData.appearance?.accentColor || '#f59e0b',
                      color: '#000',
                    }}
                  >
                    Aberto Hoje
                  </span>
                </div>

                <div className="py-2">
                  <p className="text-xs opacity-90 leading-relaxed italic">
                    "{editFormData.appearance?.tagline || 'Atendimento com excelência e qualidade garantida.'}"
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs shadow-sm transition-transform active:scale-95"
                    style={{
                      backgroundColor: editFormData.appearance?.secondaryColor || '#3b82f6',
                      color: '#ffffff',
                    }}
                  >
                    Fazer Pedido / Contato
                  </button>
                  <button
                    type="button"
                    className="py-2.5 px-4 rounded-xl font-bold text-xs border border-white/20 bg-white/10 hover:bg-white/20"
                  >
                    Ver Serviços
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ABA 6: CONFIGURAÇÕES */}
      {/* ======================================================== */}
      {activeTab === 'settings' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Status Switcher */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Gerenciar Ciclo de Vida da Empresa</h3>
            <p className="text-xs text-slate-500">
              Alterne o estado de ativação da empresa na plataforma:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(['ativo', 'teste', 'pagamento_pendente', 'atrasado', 'suspenso', 'cancelado'] as TenantStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleChangeStatus(st)}
                  className={`p-3 rounded-xl border text-xs font-bold capitalize flex items-center justify-between cursor-pointer transition-all ${
                    tenant.status === st
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>{st.replace('_', ' ')}</span>
                  {tenant.status === st && <Check className="w-4 h-4 text-indigo-600" />}
                </button>
              ))}
            </div>
          </div>

          {/* Destructive Zone */}
          <div className="bg-rose-50/50 rounded-2xl border border-rose-200 p-6 shadow-xs">
            <h3 className="text-sm font-bold text-rose-900">Zona de Perigo</h3>
            <p className="text-xs text-rose-700 mt-1 max-w-xl leading-relaxed">
              Excluir este estabelecimento removerá permanentemente todos os dados, configurações, acessos e vínculos multi-tenant cadastrados no banco de dados.
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setConfirmDeleteTenant(true)}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <Trash2 className="w-4 h-4" />
                Excluir Empresa Permanentemente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Create/Edit Modal */}
      {userModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 text-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingUser ? 'Editar Usuário' : 'Novo Usuário do Tenant'}
              </h3>
              <button
                onClick={() => setUserModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  value={userFormName}
                  onChange={(e) => setUserFormName(e.target.value)}
                  required
                  placeholder="Nome do colaborador"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail *</label>
                <input
                  type="email"
                  value={userFormEmail}
                  onChange={(e) => setUserFormEmail(e.target.value)}
                  disabled={!!editingUser}
                  required
                  placeholder="email@empresa.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone / Celular</label>
                <input
                  type="text"
                  value={userFormPhone}
                  onChange={(e) => setUserFormPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Função / Papel</label>
                <select
                  value={userFormRole}
                  onChange={(e) => setUserFormRole(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="CLIENT_ADMIN">CLIENT_ADMIN (Administrador da Empresa)</option>
                  <option value="MANAGER">MANAGER (Gerente - Futuro)</option>
                  <option value="STAFF">STAFF (Funcionário - Futuro)</option>
                  <option value="PROFESSIONAL">PROFESSIONAL (Profissional - Futuro)</option>
                  <option value="ATTENDANT">ATTENDANT (Atendente - Futuro)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {editingUser ? 'Alterar Senha (opcional)' : 'Senha Inicial'}
                </label>
                <input
                  type="password"
                  value={userFormPassword}
                  onChange={(e) => setUserFormPassword(e.target.value)}
                  placeholder={editingUser ? 'Deixe em branco para manter' : 'Padrão: cliente123'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={userModalLoading}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Salvar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirm */}
      {userToDelete && (
        <ConfirmModal
          isOpen={!!userToDelete}
          title={`Remover usuário ${userToDelete.name}?`}
          message={`O usuário perderá o acesso a esta empresa (${tenant.name}).`}
          confirmText="Sim, remover acesso"
          onConfirm={handleDeleteUserConfirm}
          onCancel={() => setUserToDelete(null)}
        />
      )}

      {/* Delete Tenant Confirm */}
      {confirmDeleteTenant && (
        <ConfirmModal
          isOpen={confirmDeleteTenant}
          title={`Excluir definitivamente ${tenant.name}?`}
          message={`Esta ação é irreversível. Todos os dados, subdomínio e usuários associados ao tenant ${tenant.slug} serão removidos.`}
          confirmText="Confirmar exclusão definitiva"
          onConfirm={handleDeleteTenantConfirm}
          onCancel={() => setConfirmDeleteTenant(false)}
        />
      )}
    </div>
  );
};
