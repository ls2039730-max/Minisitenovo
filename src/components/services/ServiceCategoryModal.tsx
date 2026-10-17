import React, { useState } from 'react';
import { X, Plus, Edit2, Trash2, Tag, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ServiceCategory } from '../../types/service';
import { api } from '../../services/api';
import { ConfirmModal } from '../common/ConfirmModal';

interface ServiceCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ServiceCategory[];
  onCategorySaved: () => void;
}

export const ServiceCategoryModal: React.FC<ServiceCategoryModalProps> = ({
  isOpen,
  onClose,
  categories,
  onCategorySaved,
}) => {
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Deletion modal
  const [deletingCategory, setDeletingCategory] = useState<ServiceCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!isOpen) return null;

  const handleStartEdit = (cat: ServiceCategory) => {
    setEditingCategory(cat);
    setName(cat.name);
    setDescription(cat.description || '');
    setActive(cat.active);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingCategory(null);
    setName('');
    setDescription('');
    setActive(true);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('O nome da categoria é obrigatório.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (editingCategory) {
        await api.updateServiceCategory(editingCategory.id, {
          name: name.trim(),
          description: description.trim() || null,
          active,
        });
        setSuccess('Categoria atualizada com sucesso!');
      } else {
        await api.createServiceCategory({
          name: name.trim(),
          description: description.trim() || null,
          active,
        });
        setSuccess('Categoria criada com sucesso!');
      }

      handleCancelEdit();
      onCategorySaved();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar categoria.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCategory) return;
    try {
      setDeleting(true);
      setError(null);
      await api.deleteServiceCategory(deletingCategory.id);
      setSuccess('Categoria excluída com sucesso.');
      setDeletingCategory(null);
      onCategorySaved();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir categoria.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Categorias de Serviços</h3>
              <p className="text-xs text-slate-500">
                Organize seus serviços em seções como Cabelo, Barba, Estética, etc.
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

        {/* Feedback Messages */}
        {error && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mx-6 mt-4 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 border-b border-slate-100 bg-slate-50/50 space-y-3">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
            {editingCategory ? 'Editar Categoria' : 'Adicionar Nova Categoria'}
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome da Categoria *
              </label>
              <input
                type="text"
                placeholder="Ex: Cabelo & Cortes"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Descrição (Opcional)
              </label>
              <input
                type="text"
                placeholder="Breve resumo da categoria"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 rounded-md text-indigo-600 focus:ring-indigo-500 border-slate-300"
              />
              <span>Categoria Ativa</span>
            </label>

            <div className="flex items-center gap-2">
              {editingCategory && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingCategory ? 'Atualizar Categoria' : 'Salvar Categoria'}
              </button>
            </div>
          </div>
        </form>

        {/* Existing Categories List */}
        <div className="p-6 flex-1 overflow-y-auto space-y-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-3">
            Categorias Cadastradas ({categories.length})
          </span>

          {categories.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">Nenhuma categoria cadastrada ainda.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="p-3.5 bg-white border border-slate-200 hover:border-slate-300 rounded-2xl flex items-center justify-between transition-all"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">{cat.name}</span>
                      {!cat.active && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                          Inativa
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 font-medium">
                        {cat.servicesCount || 0} {cat.servicesCount === 1 ? 'serviço' : 'serviços'}
                      </span>
                    </div>
                    {cat.description && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">{cat.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleStartEdit(cat)}
                      className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                      title="Editar"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingCategory(cat)}
                      className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
          >
            Concluir
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Delete */}
      <ConfirmModal
        isOpen={!!deletingCategory}
        title="Excluir Categoria"
        message={`Tem certeza que deseja excluir a categoria "${deletingCategory?.name}"? Esta ação só pode ser realizada se não houver serviços associados.`}
        confirmText="Excluir Categoria"
        cancelText="Cancelar"
        isDestructive={true}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeletingCategory(null)}
      />
    </div>
  );
};
