import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Plus,
  Search,
  Filter,
  Tag,
  Edit2,
  Trash2,
  Copy,
  Star,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Eye,
  Users,
  ExternalLink,
  Layers,
  ArrowUpDown,
} from 'lucide-react';
import { Service, ServiceCategory, Professional, PricingType } from '../../types/service';
import { Tenant } from '../../types/saas';
import { api } from '../../services/api';
import { ServiceFormModal } from './ServiceFormModal';
import { ServiceCategoryModal } from './ServiceCategoryModal';
import { ServiceCardPreviewModal } from './ServiceCardPreviewModal';
import { ConfirmModal } from '../common/ConfirmModal';

interface ServiceManagerProps {
  tenant: Tenant;
}

export const ServiceManager: React.FC<ServiceManagerProps> = ({ tenant }) => {
  const [subTab, setSubTab] = useState<'services' | 'categories'>('services');
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [pricingTypeFilter, setPricingTypeFilter] = useState<string>('all');
  const [featuredFilter, setFeaturedFilter] = useState<boolean>(false);
  const [sortOption, setSortOption] = useState<'order' | 'name_asc' | 'price_asc' | 'price_desc' | 'duration_asc'>('order');

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [previewService, setPreviewService] = useState<Service | null>(null);

  // Delete modal state
  const [deletingService, setDeletingService] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Action states
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const [catsData, profsData, servicesData] = await Promise.all([
        api.getServiceCategories(),
        api.getProfessionals(),
        api.getServices({
          search: search || undefined,
          categoryId: selectedCategoryId || undefined,
          active: statusFilter === 'all' ? 'all' : statusFilter === 'active',
          featured: featuredFilter || undefined,
          pricingType: pricingTypeFilter !== 'all' ? (pricingTypeFilter as PricingType) : undefined,
          sort: sortOption,
        }),
      ]);

      setCategories(catsData);
      setProfessionals(profsData);
      setServices(servicesData);
    } catch (err: any) {
      console.error('Error loading services data:', err);
      setErrorMessage(err.message || 'Erro ao carregar catálogo de serviços.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedCategoryId, statusFilter, pricingTypeFilter, featuredFilter, sortOption]);

  const showToast = (msg: string) => {
    setActionSuccessMessage(msg);
    setTimeout(() => {
      setActionSuccessMessage(null);
    }, 3500);
  };

  const handleOpenCreate = () => {
    setEditingService(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (s: Service) => {
    setEditingService(s);
    setIsFormModalOpen(true);
  };

  const handleToggleStatus = async (s: Service) => {
    try {
      setTogglingId(s.id);
      const updated = await api.toggleServiceStatus(s.id, !s.active);
      setServices((prev) => prev.map((item) => (item.id === s.id ? updated : item)));
      showToast(`Serviço ${updated.active ? 'ativado' : 'desativado'} com sucesso!`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao alterar status do serviço.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDuplicate = async (s: Service) => {
    try {
      setDuplicatingId(s.id);
      const duplicated = await api.duplicateService(s.id);
      setServices((prev) => [duplicated, ...prev]);
      showToast('Serviço duplicado com sucesso! Ele foi criado inativo para sua revisão.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao duplicar serviço.');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingService) return;
    try {
      setDeleting(true);
      await api.deleteService(deletingService.id);
      setServices((prev) => prev.filter((item) => item.id !== deletingService.id));
      showToast('Serviço excluído com sucesso.');
      setDeletingService(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao excluir serviço.');
    } finally {
      setDeleting(false);
    }
  };

  const formatPriceDisplay = (s: Service) => {
    if (s.pricingType === 'on_request') {
      return <span className="text-slate-500 font-semibold text-xs">Sob consulta</span>;
    }
    if (s.price !== null && s.price !== undefined) {
      const formatted = Number(s.price).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
      if (s.pricingType === 'starting_at') {
        return (
          <span className="font-extrabold text-xs text-slate-900">
            A partir de <span className="text-indigo-600">{formatted}</span>
          </span>
        );
      }
      return <span className="font-extrabold text-xs text-slate-900">{formatted}</span>;
    }
    return <span className="text-slate-500 font-semibold text-xs">Sob consulta</span>;
  };

  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Toast Feedback */}
      {actionSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center justify-between shadow-md animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button
            onClick={() => setActionSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Feedback */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-600 hover:text-rose-800 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Briefcase className="w-5 h-5" />
            </div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
              Serviços & Procedimentos
            </h1>
          </div>
          <p className="text-xs text-slate-500">
            Gerencie o catálogo completo de serviços da sua empresa, valores, durações e profissionais.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer"
          >
            <Tag className="w-4 h-4 text-slate-500" />
            <span>Categorias ({categories.length})</span>
          </button>

          <button
            onClick={handleOpenCreate}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Serviço</span>
          </button>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Buscar serviço por nome ou descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="">Todas as categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">Todos os status</option>
              <option value="active">Apenas Ativos</option>
              <option value="inactive">Apenas Inativos</option>
            </select>
          </div>

          {/* Sort Option */}
          <div>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="order">Ordem padrão</option>
              <option value="name_asc">Nome (A - Z)</option>
              <option value="price_asc">Menor preço</option>
              <option value="price_desc">Maior preço</option>
              <option value="duration_asc">Menor duração</option>
            </select>
          </div>
        </div>

        {/* Secondary filters row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Cobrança:
            </span>
            {['all', 'fixed', 'starting_at', 'on_request'].map((pt) => (
              <button
                key={pt}
                onClick={() => setPricingTypeFilter(pt)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  pricingTypeFilter === pt
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {pt === 'all'
                  ? 'Todos'
                  : pt === 'fixed'
                  ? 'Fixo'
                  : pt === 'starting_at'
                  ? 'A partir de'
                  : 'Sob consulta'}
              </button>
            ))}

            <button
              onClick={() => setFeaturedFilter(!featuredFilter)}
              className={`ml-2 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                featuredFilter
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Star className="w-3 h-3 fill-current" />
              <span>Destaques</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 font-semibold">
            {services.length} {services.length === 1 ? 'serviço encontrado' : 'serviços encontrados'}
          </div>
        </div>
      </div>

      {/* Services List / Table */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
          <p className="text-xs font-semibold">Carregando serviços...</p>
        </div>
      ) : services.length === 0 ? (
        <div className="py-16 px-4 bg-white border border-slate-200 rounded-3xl text-center max-w-lg mx-auto w-full space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
            <Briefcase className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Nenhum serviço cadastrado</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1 leading-relaxed">
              Comece cadastrando os cortes, procedimentos, consultas ou serviços que sua empresa oferece.
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Cadastrar Primeiro Serviço
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s) => {
            const isToggling = togglingId === s.id;
            const isDuplicating = duplicatingId === s.id;

            return (
              <div
                key={s.id}
                className={`bg-white border rounded-2xl shadow-xs hover:shadow-md transition-all flex flex-col overflow-hidden group ${
                  s.active ? 'border-slate-200 hover:border-slate-300' : 'border-slate-200 opacity-75 bg-slate-50/50'
                }`}
              >
                {/* Card Top: Image + Quick Badges */}
                <div className="relative aspect-[16/9] bg-slate-100 overflow-hidden">
                  {s.imageUrl ? (
                    <img
                      src={s.imageUrl}
                      alt={s.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 bg-slate-50">
                      <Briefcase className="w-8 h-8 mb-1" />
                      <span className="text-[10px] font-bold">Sem imagem</span>
                    </div>
                  )}

                  {/* Overlaid Badges */}
                  <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
                    {s.featured && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-xs">
                        <Star className="w-3 h-3 fill-current" />
                        Destaque
                      </span>
                    )}
                    {s.durationMinutes && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/70 text-white backdrop-blur-xs">
                        <Clock className="w-3 h-3" />
                        {s.durationMinutes} min
                      </span>
                    )}
                  </div>

                  {/* Status Pill on Top-Right */}
                  <div className="absolute top-2.5 right-2.5">
                    <button
                      onClick={() => handleToggleStatus(s)}
                      disabled={isToggling}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all shadow-xs cursor-pointer ${
                        s.active
                          ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                          : 'bg-slate-800 text-white hover:bg-slate-700'
                      }`}
                      title={s.active ? 'Clique para desativar' : 'Clique para ativar'}
                    >
                      {isToggling ? '...' : s.active ? 'Ativo' : 'Inativo'}
                    </button>
                  </div>

                  {/* Category Chip */}
                  {s.category && (
                    <div className="absolute bottom-2.5 left-2.5">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/90 text-slate-800 shadow-xs">
                        {s.category.name}
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Middle: Info */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                      {s.name}
                    </h3>
                    {s.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                        {s.description}
                      </p>
                    )}
                  </div>

                  {/* Assigned Professionals */}
                  {s.professionals && s.professionals.length > 0 && (
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {s.professionals.length} {s.professionals.length === 1 ? 'profissional' : 'profissionais'}
                      </span>
                      <div className="flex -space-x-1.5 overflow-hidden">
                        {s.professionals.slice(0, 4).map((prof) => (
                          <div
                            key={prof.id}
                            title={prof.name}
                            className="w-5 h-5 rounded-full ring-2 ring-white bg-slate-200 overflow-hidden flex items-center justify-center text-[8px] font-bold text-slate-600"
                          >
                            {prof.photoUrl ? (
                              <img src={prof.photoUrl} alt={prof.name} className="w-full h-full object-cover" />
                            ) : (
                              prof.name.substring(0, 1)
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Price & Actions Row */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="block text-[9px] uppercase font-bold text-slate-400">
                        {s.pricingType === 'on_request'
                          ? 'Cobrança'
                          : s.pricingType === 'starting_at'
                          ? 'A Partir De'
                          : 'Preço'}
                      </span>
                      {formatPriceDisplay(s)}
                    </div>

                    {/* Action Icon Buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPreviewService(s)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="Pré-visualizar card público"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDuplicate(s)}
                        disabled={isDuplicating}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title="Duplicar serviço"
                      >
                        {isDuplicating ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => handleOpenEdit(s)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="Editar serviço"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setDeletingService(s)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Excluir serviço"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Service Form Modal */}
      <ServiceFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        service={editingService}
        categories={categories}
        professionals={professionals}
        tenant={tenant}
        onSaved={() => {
          loadData();
          showToast(editingService ? 'Serviço atualizado com sucesso!' : 'Serviço cadastrado com sucesso!');
        }}
        onOpenCategories={() => setIsCategoryModalOpen(true)}
      />

      {/* Category Management Modal */}
      <ServiceCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        onCategorySaved={loadData}
      />

      {/* Public Card Preview Modal */}
      <ServiceCardPreviewModal
        isOpen={!!previewService}
        onClose={() => setPreviewService(null)}
        service={previewService}
        tenant={tenant}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingService}
        title="Excluir Serviço"
        message={`Tem certeza que deseja excluir o serviço "${deletingService?.name}"? Esta ação removerá o serviço do mini site e desvinculará os profissionais associados.`}
        confirmText="Excluir Serviço"
        cancelText="Cancelar"
        isDestructive={true}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeletingService(null)}
      />
    </div>
  );
};
