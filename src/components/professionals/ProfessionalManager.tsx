import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Briefcase,
  Lock,
  Eye,
  Star,
  Tag,
  Phone,
  Mail,
} from 'lucide-react';
import { Professional, Service } from '../../types/service';
import { Tenant } from '../../types/saas';
import { api } from '../../services/api';
import { ProfessionalFormModal } from './ProfessionalFormModal';
import { ConfirmModal } from '../common/ConfirmModal';

interface ProfessionalManagerProps {
  tenant: Tenant;
}

export const ProfessionalManager: React.FC<ProfessionalManagerProps> = ({ tenant }) => {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);

  // Delete modal state
  const [deletingProfessional, setDeletingProfessional] = useState<Professional | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Status toggle state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const [profsData, servicesData] = await Promise.all([
        api.getProfessionals({
          search: search || undefined,
          active: statusFilter === 'all' ? 'all' : statusFilter === 'active',
        }),
        api.getServices(),
      ]);

      setProfessionals(profsData);
      setServices(servicesData);
    } catch (err: any) {
      console.error('Error loading professionals:', err);
      setErrorMessage(err.message || 'Erro ao carregar lista de profissionais.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, statusFilter]);

  const showToast = (msg: string) => {
    setActionSuccessMessage(msg);
    setTimeout(() => {
      setActionSuccessMessage(null);
    }, 3500);
  };

  const handleOpenCreate = () => {
    setEditingProfessional(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (p: Professional) => {
    setEditingProfessional(p);
    setIsFormModalOpen(true);
  };

  const handleToggleStatus = async (p: Professional) => {
    try {
      setTogglingId(p.id);
      const updated = await api.toggleProfessionalStatus(p.id, !p.active);
      setProfessionals((prev) => prev.map((item) => (item.id === p.id ? updated : item)));
      showToast(`Profissional ${updated.active ? 'ativado' : 'desativado'} com sucesso!`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao alterar status do profissional.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingProfessional) return;
    try {
      setDeleting(true);
      await api.deleteProfessional(deletingProfessional.id);
      setProfessionals((prev) => prev.filter((item) => item.id !== deletingProfessional.id));
      showToast('Profissional excluído com sucesso.');
      setDeletingProfessional(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao excluir profissional.');
    } finally {
      setDeleting(false);
    }
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
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
              Profissionais & Equipe
            </h1>
          </div>
          <p className="text-xs text-slate-500">
            Cadastre os membros da equipe, especialidades, fotos e os serviços que cada um executa.
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={handleOpenCreate}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-600/20 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Profissional</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por nome, especialidade ou bio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-1.5">
            {['all', 'active', 'inactive'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  statusFilter === st
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st === 'all' ? 'Todos' : st === 'active' ? 'Ativos' : 'Inativos'}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-slate-500 font-semibold whitespace-nowrap">
            {professionals.length} {professionals.length === 1 ? 'membro' : 'membros'}
          </span>
        </div>
      </div>

      {/* Professionals Cards Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
          <p className="text-xs font-semibold">Carregando profissionais...</p>
        </div>
      ) : professionals.length === 0 ? (
        <div className="py-16 px-4 bg-white border border-slate-200 rounded-3xl text-center max-w-lg mx-auto w-full space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Nenhum profissional cadastrado</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1 leading-relaxed">
              Adicione os colaboradores, barbeiros, terapeutas, médicos ou especialistas da sua empresa.
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Cadastrar Primeiro Profissional
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {professionals.map((prof) => {
            const isToggling = togglingId === prof.id;

            return (
              <div
                key={prof.id}
                className={`bg-white border rounded-2xl shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden p-5 space-y-4 ${
                  prof.active ? 'border-slate-200' : 'border-slate-200 opacity-75 bg-slate-50/50'
                }`}
              >
                {/* Header: Avatar, Name, Status */}
                <div className="flex items-start gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 overflow-hidden flex items-center justify-center text-slate-600 font-bold text-lg shrink-0 shadow-xs border border-slate-200">
                    {prof.photoUrl ? (
                      <img src={prof.photoUrl} alt={prof.name} className="w-full h-full object-cover" />
                    ) : (
                      prof.name.substring(0, 2).toUpperCase()
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h3 className="font-bold text-sm text-slate-900 truncate">{prof.name}</h3>
                      <button
                        onClick={() => handleToggleStatus(prof)}
                        disabled={isToggling}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all shadow-xs cursor-pointer ${
                          prof.active
                            ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                            : 'bg-slate-800 text-white hover:bg-slate-700'
                        }`}
                        title={prof.active ? 'Clique para desativar' : 'Clique para ativar'}
                      >
                        {isToggling ? '...' : prof.active ? 'Ativo' : 'Inativo'}
                      </button>
                    </div>

                    {prof.bio && (
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {prof.bio}
                      </p>
                    )}
                  </div>
                </div>

                {/* Specialties Tags */}
                {prof.specialties && prof.specialties.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Especialidades:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {prof.specialties.map((spec) => (
                        <span
                          key={spec}
                          className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] font-semibold"
                        >
                          {spec}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Associated Services */}
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Serviços que realiza ({prof.servicesCount || 0}):
                  </span>
                  {prof.services && prof.services.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {prof.services.map((svc) => (
                        <span
                          key={svc.id}
                          className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-[11px] font-semibold truncate max-w-[200px]"
                        >
                          {svc.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">
                      Nenhum serviço associado
                    </span>
                  )}
                </div>

                {/* Privacy Badge & Actions Footer */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {prof.showContactPublicly ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                        <Eye className="w-3 h-3" />
                        Contato público
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        <Lock className="w-3 h-3 text-slate-400" />
                        Contato privado
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(prof)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                      title="Editar profissional"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingProfessional(prof)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Excluir profissional"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Professional Form Modal */}
      <ProfessionalFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        professional={editingProfessional}
        services={services}
        tenant={tenant}
        onSaved={loadData}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingProfessional}
        title="Excluir Profissional"
        message={`Tem certeza que deseja excluir o profissional "${deletingProfessional?.name}"? Ele possui ${
          deletingProfessional?.servicesCount || 0
        } serviço(s) associado(s), que serão desvinculados com segurança.`}
        confirmText="Excluir Profissional"
        cancelText="Cancelar"
        isDestructive={true}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeletingProfessional(null)}
      />
    </div>
  );
};
