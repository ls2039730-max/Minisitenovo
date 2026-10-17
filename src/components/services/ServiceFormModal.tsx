import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  DollarSign,
  Clock,
  Star,
  Users,
  Tag,
  Loader2,
  AlertCircle,
  HelpCircle,
  Check,
} from 'lucide-react';
import { Service, ServiceCategory, Professional, PricingType } from '../../types/service';
import { Tenant } from '../../types/saas';
import { api } from '../../services/api';
import { ImageUpload } from '../common/ImageUpload';

interface ServiceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: Service | null;
  categories: ServiceCategory[];
  professionals: Professional[];
  tenant: Tenant;
  onSaved: () => void;
  onOpenCategories: () => void;
}

export const ServiceFormModal: React.FC<ServiceFormModalProps> = ({
  isOpen,
  onClose,
  service,
  categories,
  professionals,
  tenant,
  onSaved,
  onOpenCategories,
}) => {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [pricingType, setPricingType] = useState<PricingType>('fixed');
  const [price, setPrice] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<string>('30');
  const [active, setActive] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [bookingEnabled, setBookingEnabled] = useState(true);
  const [selectedProfIds, setSelectedProfIds] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state when editing or opening
  useEffect(() => {
    if (service) {
      setName(service.name || '');
      setSlug(service.slug || '');
      setCategoryId(service.categoryId || '');
      setDescription(service.description || '');
      setImageUrl(service.imageUrl || '');
      setPricingType(service.pricingType || 'fixed');
      setPrice(service.price !== null && service.price !== undefined ? String(service.price) : '');
      setDurationMinutes(service.durationMinutes ? String(service.durationMinutes) : '');
      setActive(service.active !== false);
      setFeatured(service.featured === true);
      setBookingEnabled(service.bookingEnabled !== false);
      setSelectedProfIds(service.professionalIds || []);
    } else {
      setName('');
      setSlug('');
      setCategoryId(categories.length > 0 ? categories[0].id : '');
      setDescription('');
      setImageUrl('');
      setPricingType('fixed');
      setPrice('50.00');
      setDurationMinutes('30');
      setActive(true);
      setFeatured(false);
      setBookingEnabled(true);
      setSelectedProfIds([]);
    }
    setError(null);
  }, [service, isOpen, categories]);

  if (!isOpen) return null;

  const handleToggleProf = (profId: string) => {
    setSelectedProfIds((prev) =>
      prev.includes(profId) ? prev.filter((id) => id !== profId) : [...prev, profId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('O nome do serviço é obrigatório.');
      return;
    }

    const cleanPrice = String(price || '').trim().replace(/\s/g, '').replace('R$', '').replace(',', '.');
    const parsedPrice = cleanPrice ? Number(cleanPrice) : 0;

    if (pricingType === 'fixed' || pricingType === 'starting_at') {
      if (!cleanPrice || isNaN(parsedPrice) || parsedPrice < 0) {
        setError('Informe um valor de preço válido e não negativo.');
        return;
      }
    }

    const cleanDuration = String(durationMinutes || '').trim();
    const parsedDuration = cleanDuration ? Number(cleanDuration) : null;
    if (cleanDuration && (isNaN(Number(cleanDuration)) || Number(cleanDuration) <= 0)) {
      setError('A duração estimada deve ser um número positivo em minutos.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        categoryId: categoryId || null,
        description: description.trim() || null,
        imageUrl: imageUrl.trim() || null,
        pricingType,
        price: pricingType === 'on_request' ? null : parsedPrice,
        durationMinutes: parsedDuration,
        active,
        featured,
        bookingEnabled,
        professionalIds: selectedProfIds,
      };

      if (service) {
        await api.updateService(service.id, payload);
      } else {
        await api.createService(payload);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar serviço.');
    } finally {
      setSaving(false);
    }
  };

  const durationPresets = [15, 30, 45, 60, 90, 120];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {service ? 'Editar Serviço' : 'Novo Serviço'}
              </h3>
              <p className="text-xs text-slate-500">
                Cadastre os detalhes do procedimento, valor, duração e profissionais vinculados.
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

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <form id="service-modal-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Basic Info */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600" />
              1. Informações Principais
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Serviço *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Corte Masculino Degradê"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">Categoria</label>
                  <button
                    type="button"
                    onClick={onOpenCategories}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                  >
                    + Criar
                  </button>
                </div>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">Sem categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Descrição Detalhada
              </label>
              <textarea
                rows={3}
                placeholder="Descreva o que está incluso no serviço, diferenciais e orientações para o cliente..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 leading-relaxed"
              />
            </div>

            {/* Service Image Upload */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Imagem do Serviço (Foto Principal)
              </label>
              <ImageUpload
                value={imageUrl}
                onChange={(url) => setImageUrl(url)}
                subfolder="services"
                aspectRatio="video"
                helperText="Envie uma imagem de alta resolução do trabalho ou procedimento (PNG, JPG, WEBP até 5MB)"
              />
            </div>
          </div>

          {/* Section 2: Pricing & Duration */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              2. Preço e Duração Estimada
            </h4>

            {/* Pricing Type Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Tipo de Cobrança *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  {
                    type: 'fixed' as PricingType,
                    title: 'Preço Fixo',
                    desc: 'Valor exato definido (Ex: R$ 50,00)',
                  },
                  {
                    type: 'starting_at' as PricingType,
                    title: 'A Partir de',
                    desc: 'Preço inicial base (Ex: A partir de R$ 60)',
                  },
                  {
                    type: 'on_request' as PricingType,
                    title: 'Sob Consulta',
                    desc: 'Orçamento direto pelo WhatsApp',
                  },
                ].map((pt) => {
                  const isSelected = pricingType === pt.type;
                  return (
                    <button
                      key={pt.type}
                      type="button"
                      onClick={() => setPricingType(pt.type)}
                      className={`p-3 text-left border rounded-2xl transition-all cursor-pointer ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-600/20'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-xs font-bold ${
                            isSelected ? 'text-indigo-900' : 'text-slate-800'
                          }`}
                        >
                          {pt.title}
                        </span>
                        {isSelected && <Check className="w-4 h-4 text-indigo-600" />}
                      </div>
                      <span className="text-[11px] text-slate-500 block leading-tight">
                        {pt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Price Field */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Valor em Reais (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs font-bold text-slate-400">
                    R$
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    disabled={pricingType === 'on_request'}
                    value={pricingType === 'on_request' ? '' : price}
                    onChange={(e) => setPrice(e.target.value)}
                    className={`w-full pl-10 pr-3.5 py-2.5 border rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 ${
                      pricingType === 'on_request'
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200'
                        : 'bg-slate-50 focus:bg-white border-slate-200'
                    }`}
                  />
                </div>
                {pricingType === 'on_request' && (
                  <span className="text-[11px] text-slate-400 block mt-1">
                    Para serviços sob consulta, o preço fica oculto e exibe botão do WhatsApp.
                  </span>
                )}
              </div>

              {/* Estimated Duration */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Duração Estimada (minutos)
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="number"
                    min="5"
                    step="5"
                    placeholder="Ex: 40"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                {/* Presets */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {durationPresets.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDurationMinutes(String(m))}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                        durationMinutes === String(m)
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Assigned Professionals */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                3. Profissionais que Realizam este Serviço
              </h4>
              <span className="text-[11px] text-slate-500">
                {selectedProfIds.length} selecionado(s)
              </span>
            </div>

            {professionals.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-500">
                <Users className="w-6 h-6 mx-auto mb-1 opacity-40 text-slate-400" />
                Nenhum profissional cadastrado ainda. Você poderá associá-los depois.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto p-1">
                {professionals.map((prof) => {
                  const isChecked = selectedProfIds.includes(prof.id);
                  return (
                    <button
                      key={prof.id}
                      type="button"
                      onClick={() => handleToggleProf(prof.id)}
                      className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                        isChecked
                          ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600/30'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center font-bold text-xs text-slate-600 shrink-0">
                        {prof.photoUrl ? (
                          <img src={prof.photoUrl} alt={prof.name} className="w-full h-full object-cover" />
                        ) : (
                          prof.name.substring(0, 1)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block font-bold text-xs text-slate-900 truncate">
                          {prof.name}
                        </span>
                        {prof.specialties && prof.specialties.length > 0 && (
                          <span className="block text-[10px] text-slate-500 truncate">
                            {prof.specialties.join(', ')}
                          </span>
                        )}
                      </div>
                      <div
                        className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                          isChecked
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isChecked && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 4: Status and Flags */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-700" />
              4. Configurações de Exibição
            </h4>

            <div className="space-y-2.5">
              <label className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-100/60 transition-colors">
                <div>
                  <span className="font-bold text-xs text-slate-900 block">Serviço Ativo</span>
                  <span className="text-[11px] text-slate-500 block">
                    Serviços ativos podem ser exibidos no mini site e no catálogo público.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4 rounded-md text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-100/60 transition-colors">
                <div className="flex items-start gap-2">
                  <Star className="w-4 h-4 text-amber-500 fill-current mt-0.5 shrink-0" />
                  <div>
                    <span className="font-bold text-xs text-slate-900 block">Destaque na Página</span>
                    <span className="text-[11px] text-slate-500 block">
                      Exibe um selo dourado de destaque e prioriza a exibição deste serviço.
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={(e) => setFeatured(e.target.checked)}
                  className="w-4 h-4 rounded-md text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-100/60 transition-colors">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-slate-900 block">
                      Habilitar para Agendamento Futuro
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 bg-indigo-100 text-indigo-700 rounded-sm">
                      Etapa 4B
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 block">
                    Prepara este serviço para a futura agenda (não ativa agendamentos antes da Etapa 4B).
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={bookingEnabled}
                  onChange={(e) => setBookingEnabled(e.target.checked)}
                  className="w-4 h-4 rounded-md text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
              </label>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-semibold">{error}</span>
            </div>
          )}
          <div className="flex items-center justify-end gap-3 w-full sm:w-auto ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              form="service-modal-form"
              disabled={saving}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {service ? 'Salvar Alterações' : 'Cadastrar Serviço'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
