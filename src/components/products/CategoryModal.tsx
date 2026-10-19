import React, { useState } from 'react';
import { X, Plus, Edit2, Trash2, ArrowUp, ArrowDown, FolderPlus, Layers, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { ProductCategory } from '../../types/product';
import { api } from '../../services/api';
import { ConfirmModal } from '../common/ConfirmModal';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ProductCategory[];
  onRefresh: () => void;
}

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  categories,
  onRefresh,
}) => {
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deletion confirm modal
  const [deletingCategory, setDeletingCategory] = useState<ProductCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!isOpen) return null;

  const handleStartCreate = () => {
    setEditingCategory(null);
    setName('');
    setDescription('');
    setIsActive(true);
    setError(null);
    setIsCreating(true);
  };

  const handleStartEdit = (cat: ProductCategory) => {
    setEditingCategory(cat);
    setName(cat.name);
    setDescription(cat.description || '');
    setIsActive(cat.isActive);
    setError(null);
    setIsCreating(true);
  };

  const handleCancelForm = () => {
    setIsCreating(false);
    setEditingCategory(null);
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nome da categoria é obrigatório.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (editingCategory) {
        await api.updateCategory(editingCategory.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          isActive,
        });
      } else {
        await api.createCategory({
          name: name.trim(),
          description: description.trim() || undefined,
          isActive,
        });
      }

      onRefresh();
      setIsCreating(false);
      setEditingCategory(null);
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
      await api.deleteCategory(deletingCategory.id);
      setDeletingCategory(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir categoria.');
    } finally {
      setDeleting(false);
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const list = [...categories];
    const [moved] = list.splice(index, 1);
    list.splice(targetIndex, 0, moved);

    try {
      await api.reorderCategories(list.map((c) => c.id));
      onRefresh();
    } catch (err) {
      console.error('Error reordering categories:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Gerenciar Categorias</h3>
              <p className="text-xs text-slate-500">Organize os produtos em grupos no catálogo</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form to Add or Edit */}
          {isCreating ? (
            <form onSubmit={handleSave} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
              </h4>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome da Categoria *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Pomadas & Finalizadores, Bebidas, Camisetas..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Descrição (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Breve texto sobre os produtos desta seção"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="catActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                <label htmlFor="catActive" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Categoria Ativa no catálogo
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingCategory ? 'Salvar Alterações' : 'Criar Categoria'}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={handleStartCreate}
              className="w-full py-3 px-4 border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/50 hover:bg-indigo-50 rounded-2xl text-xs font-bold text-indigo-700 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Nova Categoria</span>
            </button>
          )}

          {/* Categories List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
              <span>Categorias Existentes ({categories.length})</span>
              <span>Ordem / Ações</span>
            </div>

            {categories.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                Nenhuma categoria cadastrada ainda.
              </div>
            ) : (
              categories.map((cat, index) => (
                <div
                  key={cat.id}
                  className={`p-3 bg-white border rounded-2xl flex items-center justify-between gap-3 transition-all ${
                    cat.isActive ? 'border-slate-200' : 'border-slate-200/60 bg-slate-50/60 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 font-bold text-xs">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 truncate">{cat.name}</span>
                        {!cat.isActive && (
                          <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                            Inativa
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span>slug: /{cat.slug}</span>
                        <span>•</span>
                        <span>{cat.productsCount || 0} produtos</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Reorder Buttons */}
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMove(index, 'up')}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 cursor-pointer"
                      title="Mover para cima"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === categories.length - 1}
                      onClick={() => handleMove(index, 'down')}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 cursor-pointer"
                      title="Mover para baixo"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStartEdit(cat)}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors ml-1 cursor-pointer"
                      title="Editar categoria"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingCategory(cat)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Excluir categoria"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Concluir
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingCategory}
        title="Excluir Categoria"
        message={
          deletingCategory?.productsCount && deletingCategory.productsCount > 0
            ? `A categoria "${deletingCategory?.name}" possui ${deletingCategory.productsCount} produtos vinculados. Os produtos NÃO serão excluídos, mas ficarão sem categoria no catálogo. Deseja continuar?`
            : `Tem certeza que deseja excluir a categoria "${deletingCategory?.name}"?`
        }
        confirmText="Sim, excluir"
        cancelText="Cancelar"
        isDestructive={true}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeletingCategory(null)}
      />
    </div>
  );
};
