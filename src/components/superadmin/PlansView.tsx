import React, { useState } from 'react';
import { Plan, FeatureKey, FeatureDefinition } from '../../types/saas';
import { SYSTEM_FEATURES } from '../../utils/features';
import { api } from '../../services/api';
import {
  Sparkles,
  Check,
  Edit2,
  Save,
  X,
  Layers,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
} from 'lucide-react';

interface PlansViewProps {
  plans: Plan[];
  onPlansUpdated: () => void;
}

export const PlansView: React.FC<PlansViewProps> = ({ plans, onPlansUpdated }) => {
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [includedFeatures, setIncludedFeatures] = useState<FeatureKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleStartEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setName(plan.name);
    setDescription(plan.description);
    setPrice(plan.price);
    setIncludedFeatures([...plan.includedFeatures]);
    setFeedback(null);
  };

  const handleToggleFeatureInPlan = (key: FeatureKey) => {
    if (includedFeatures.includes(key)) {
      setIncludedFeatures(includedFeatures.filter((k) => k !== key));
    } else {
      setIncludedFeatures([...includedFeatures, key]);
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    setLoading(true);
    try {
      await api.updatePlan(editingPlan.id, {
        name,
        description,
        price,
        includedFeatures,
      });
      setFeedback(`Plano "${name}" atualizado com sucesso!`);
      setEditingPlan(null);
      onPlansUpdated();
    } catch (err: any) {
      alert(`Erro ao salvar plano: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div className="pb-2 border-b border-slate-200/60">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Planos e Recursos</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Defina os pacotes de contratação e as features disponíveis para as empresas locais.
        </p>
      </div>

      {feedback && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {feedback}
        </div>
      )}

      {/* Plan Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrentEditing = editingPlan?.id === plan.id;
          return (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl border p-6 shadow-xs flex flex-col justify-between transition-all ${
                isCurrentEditing
                  ? 'border-indigo-600 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
                    {plan.name}
                  </span>
                  <button
                    onClick={() => handleStartEdit(plan)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Editar Plano"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-slate-900">
                    R$ {plan.price.toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-400">/mês</span>
                </div>

                <p className="text-xs text-slate-500 mt-2 min-h-10 leading-relaxed">
                  {plan.description}
                </p>

                <div className="mt-6 pt-4 border-t border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-3">
                    Features Inclusas ({plan.includedFeatures.length})
                  </span>
                  <ul className="space-y-2">
                    {SYSTEM_FEATURES.map((feat) => {
                      const isIncluded = plan.includedFeatures.includes(feat.key);
                      return (
                        <li
                          key={feat.key}
                          className={`text-xs flex items-center gap-2 ${
                            isIncluded ? 'text-slate-700 font-medium' : 'text-slate-300 line-through'
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                              isIncluded ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-300'
                            }`}
                          >
                            <Check className="w-2.5 h-2.5" />
                          </span>
                          <span>{feat.name}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-400 text-center">
                Atualizado em {new Date(plan.updatedAt).toLocaleDateString('pt-BR')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Plan Modal */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-xl w-full p-6 text-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Editar Plano: {editingPlan.name}</h3>
              <button
                onClick={() => setEditingPlan(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Plano</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Valor Mensal (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição Comercial</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Recursos Habilitados neste Plano ({includedFeatures.length} selecionados)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1">
                  {SYSTEM_FEATURES.map((f) => {
                    const checked = includedFeatures.includes(f.key);
                    return (
                      <label
                        key={f.key}
                        className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer text-xs transition-colors ${
                          checked
                            ? 'bg-indigo-50/50 border-indigo-200 text-indigo-900 font-semibold'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleFeatureInPlan(f.key)}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{f.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Feature Catalog Overview */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Catálogo Geral de Recursos do Sistema</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Arquitetura de 15 features estruturadas para o roadmap da plataforma.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SYSTEM_FEATURES.map((feature) => (
            <div key={feature.key} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900">{feature.name}</span>
                <span className="text-[10px] uppercase font-bold text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {feature.category}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">{feature.description}</p>
              <div className="pt-1 font-mono text-[10px] text-indigo-600">
                Chave técnica: {feature.key}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
