import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Briefcase,
  Search,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Tag,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';
import { api } from '../../services/api';
import type { Professional, Service, ServiceCategory } from '../../types/service';

interface ProfessionalServicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  professional: Professional;
  onSaved: () => void;
}

export const ProfessionalServicesModal: React.FC<ProfessionalServicesModalProps> = ({
  isOpen,
  onClose,
  professional,
  onSaved,
}) => {
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(false);

        const [servicesData, categoriesData, profData] = await Promise.all([
          api.getServices({ active: true }),
          api.getServiceCategories(),
          api.getProfessional(professional.id),
        ]);

        setAllServices(servicesData);
        setCategories(categoriesData);

        const currentServiceIds = profData?.serviceIds || professional.serviceIds || [];
        setSelectedIds(currentServiceIds);
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar serviços.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isOpen, professional.id]);

  if (!isOpen) return null;

  const handleToggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const visibleIds = filteredServices.map((s) => s.id);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const filteredServices = useMemo(() => {
    return allServices.filter((s) => {
      if (categoryFilter !== 'all' && s.categoryId !== categoryFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchName = s.name.toLowerCase().includes(q);
        const matchDesc = s.description?.toLowerCase().includes(q);
        if (!matchName && !matchDesc) return false;
      }
      return true;
    });
  }, [allServices, categoryFilter, search]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      await api.updateProfessional(professional.id, {
        serviceIds: selectedIds,
      });

      setSuccess(true);
      onSaved();
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar serviços oferecidos.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Meus Serviços Oferecidos
              </h3>
              <p className="text-xs text-slate-500">
                {professional.name} • Marque os serviços que você realiza neste estabelecimento
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notice Banner */}
        <div className="px-6 pt-4">
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl flex items-start gap-2.5">
            <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-[11px] text-indigo-950 leading-relaxed">
              <strong>Catálogo Geral:</strong> Os valores, durações e descrições dos serviços são definidos pelo administrador. Aqui você adiciona ou remove serviços da sua própria grade de atendimento sem alterar o catálogo original.
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mx-6 mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Lista de serviços atualizada com sucesso!</span>
          </div>
        )}

        {/* Filters */}
        <div className="px-6 pt-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar serviços cadastrados..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer w-full sm:w-auto"
            >
              <option value="all">Todas as Categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleSelectAll}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
            >
              Alternar Todos
            </button>
          </div>
        </div>

        {/* Services List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2.5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
              <p className="text-xs">Carregando catálogo de serviços...</p>
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Nenhum serviço ativo encontrado com os filtros aplicados.
            </div>
          ) : (
            filteredServices.map((service) => {
              const isSelected = selectedIds.includes(service.id);
              const category = categories.find((c) => c.id === service.categoryId);

              return (
                <div
                  key={service.id}
                  onClick={() => handleToggle(service.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-indigo-50/60 border-indigo-300 shadow-xs'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {service.name}
                        </span>
                        {category && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium shrink-0">
                            {category.name}
                          </span>
                        )}
                      </div>

                      {service.description && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5 max-w-md">
                          {service.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {service.durationMinutes} min
                        </span>
                        <span className="font-semibold text-slate-700">
                          {service.price !== null && service.price !== undefined
                            ? Number(service.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                            : 'Sob consulta'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-xl shrink-0 ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {isSelected ? 'Oferecido' : 'Não atendo'}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            <strong className="text-slate-900">{selectedIds.length}</strong> de{' '}
            {allServices.length} serviços selecionados
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{saving ? 'Salvando...' : 'Salvar Meus Serviços'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
