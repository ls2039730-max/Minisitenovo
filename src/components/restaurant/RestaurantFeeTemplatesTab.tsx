import React, { useState, useEffect } from 'react';
import {
  Percent,
  Plus,
  Trash2,
  Edit,
  CheckCircle2,
  AlertCircle,
  Loader2,
  DollarSign,
  HelpCircle,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  X,
} from 'lucide-react';
import { RestaurantFeeTemplate, RestaurantFeeType } from '../../types/restaurant';
import { api } from '../../services/api';
import { useBackHandler } from '../../services/navigationManager';

export const RestaurantFeeTemplatesTab: React.FC = () => {
  const [templates, setTemplates] = useState<RestaurantFeeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RestaurantFeeTemplate | null>(null);

  useBackHandler({
    isOpen: modalOpen,
    onClose: () => setModalOpen(false),
    priority: 20,
    name: 'FeeTemplateModal',
  });

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<RestaurantFeeType>('percentage');
  const [value, setValue] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await api.getRestaurantFeeTemplates();
      setTemplates(data);
    } catch (err: any) {
      console.error('Error loading fee templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setName('');
    setDescription('');
    setType('percentage');
    setValue('10');
    setIsActive(true);
    setIsDefault(false);
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (t: RestaurantFeeTemplate) => {
    setEditingTemplate(t);
    setName(t.name);
    setDescription(t.description || '');
    setType(t.type);
    setValue(String(t.value));
    setIsActive(t.isActive);
    setIsDefault(t.isDefault);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('O nome da taxa é obrigatório.');
      return;
    }
    const numVal = parseFloat(value.replace(',', '.'));
    if (isNaN(numVal) || numVal < 0) {
      setFormError('Informe um valor numérico válido.');
      return;
    }

    try {
      setSaving(true);
      setFormError(null);

      if (editingTemplate) {
        await api.updateRestaurantFeeTemplate(editingTemplate.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          type,
          value: numVal,
          isActive,
          isDefault,
        });
      } else {
        await api.createRestaurantFeeTemplate({
          name: name.trim(),
          description: description.trim() || undefined,
          type,
          value: numVal,
          isActive,
          isDefault,
        });
      }

      setModalOpen(false);
      await loadTemplates();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar taxa.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (t: RestaurantFeeTemplate) => {
    try {
      await api.updateRestaurantFeeTemplate(t.id, { isActive: !t.isActive });
      await loadTemplates();
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar status da taxa.');
    }
  };

  const handleDelete = async (t: RestaurantFeeTemplate) => {
    if (!confirm(`Tem certeza que deseja excluir a taxa "${t.name}"?`)) return;
    try {
      await api.deleteRestaurantFeeTemplate(t.id);
      await loadTemplates();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir taxa.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Percent className="w-5 h-5 text-indigo-600" />
            <span>Taxas Adicionais & Serviços do Restaurante</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure taxas de serviço (garçom), couvert artístico e cobranças opcionais para comandas.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Taxa</span>
        </button>
      </div>

      {/* Info Card */}
      <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-start gap-3 text-xs text-indigo-900">
        <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold block mb-0.5">Regras de Cobrança e Transparência:</span>
          As taxas cadastradas aqui podem ser aplicadas pelo atendente em qualquer comanda no salão ou sugeridas automaticamente quando configuradas como padrão. No fechamento da conta, cada taxa é discriminada individualmente com seu cálculo explícito para o cliente.
        </div>
      </div>

      {/* Templates List */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 bg-white rounded-3xl border border-slate-200">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-500" />
          <p className="text-xs">Carregando taxas configuradas...</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-200 space-y-3">
          <Percent className="w-12 h-12 stroke-[1.5] mx-auto text-slate-300" />
          <h4 className="text-sm font-bold text-slate-700">Nenhuma taxa cadastrada</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Cadastre taxas como 10% de serviço ou couvert artístico para lançar nas comandas de forma padronizada.
          </p>
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-500 transition-colors cursor-pointer"
          >
            Cadastrar Primeira Taxa
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className={`p-5 rounded-3xl border transition-all flex flex-col justify-between ${
                t.isActive
                  ? 'bg-white border-slate-200 shadow-xs'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{t.name}</h4>
                    {t.description && (
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleToggleActive(t)}
                    className="cursor-pointer"
                    title={t.isActive ? 'Desativar taxa' : 'Ativar taxa'}
                  >
                    {t.isActive ? (
                      <span className="text-emerald-600 text-xs font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Ativa
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs font-bold bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                        Inativa
                      </span>
                    )}
                  </button>
                </div>

                <div className="mt-4 p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Tipo de Cobrança
                    </span>
                    <span className="text-xs font-bold text-slate-800">
                      {t.type === 'percentage' ? 'Percentual (%)' : 'Valor Fixo (R$)'}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Valor
                    </span>
                    <span className="text-lg font-black text-indigo-950">
                      {t.type === 'percentage' ? `${t.value}%` : `R$ ${t.value.toFixed(2).replace('.', ',')}`}
                    </span>
                  </div>
                </div>

                {t.isDefault && (
                  <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                    <span>Sugerida automaticamente no fechamento</span>
                  </div>
                )}
              </div>

              {/* Card Footer Actions */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  onClick={() => handleOpenEdit(t)}
                  className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  title="Editar Taxa"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(t)}
                  className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                  title="Excluir Taxa"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Create / Edit Fee Template */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                {editingTemplate ? 'Editar Taxa' : 'Cadastrar Nova Taxa'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nome da Taxa *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Taxa de Serviço (Garçom), Couvert Artístico..."
                  required
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Descrição (Opcional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: 10% opcional sobre o consumo de alimentos e bebidas"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Tipo de Cobrança
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="percentage">Percentual (%)</option>
                    <option value="fixed">Valor Fixo (R$)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {type === 'percentage' ? 'Percentual (%) *' : 'Valor em R$ *'}
                  </label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={type === 'percentage' ? '10' : '15,00'}
                    required
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    Taxa ativa para seleção em comandas
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    Sugerir/Aplicar como padrão no fechamento da comanda
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : editingTemplate ? 'Atualizar Taxa' : 'Salvar Taxa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
