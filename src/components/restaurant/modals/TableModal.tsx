import React, { useState, useEffect } from 'react';
import { X, Loader2, Save, AlertCircle } from 'lucide-react';
import { RestaurantTable, CreateTablePayload } from '../../../types/restaurant';

interface TableModalProps {
  isOpen: boolean;
  table?: RestaurantTable | null;
  onClose: () => void;
  onSave: (payload: CreateTablePayload | Partial<RestaurantTable>) => Promise<void>;
}

export const TableModal: React.FC<TableModalProps> = ({
  isOpen,
  table,
  onClose,
  onSave,
}) => {
  const [tableNumber, setTableNumber] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [status, setStatus] = useState<'available' | 'occupied' | 'closing'>('available');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (table) {
      setTableNumber(table.tableNumber);
      setName(table.name || '');
      setNotes(table.notes || '');
      setIsActive(table.isActive);
      setStatus(table.status);
    } else {
      setTableNumber('');
      setName('');
      setNotes('');
      setIsActive(true);
      setStatus('available');
    }
    setError(null);
  }, [table, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNumber.trim()) {
      setError('O número da mesa é obrigatório.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave({
        tableNumber: tableNumber.trim(),
        name: name.trim() || undefined,
        notes: notes.trim() || undefined,
        isActive,
        status,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar mesa.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {table ? `Editar Mesa ${table.tableNumber}` : 'Nova Mesa'}
            </h3>
            <p className="text-xs text-slate-500">
              {table ? 'Atualize as informações da mesa' : 'Cadastre uma nova mesa para atendimento presencial'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Número ou Código da Mesa *
            </label>
            <input
              type="text"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="Ex: 01, 12, Balcão 1, Deck 3"
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Nome ou Setor (Opcional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Salão Principal, Varanda, Deck Superior"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>

          {table && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Status Físico da Mesa
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
              >
                <option value="available">Disponível (Livre)</option>
                <option value="occupied">Ocupada</option>
                <option value="closing">Aguardando Fechamento</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Observações Administrativas (Opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Ex: Mesa próxima à tomada, comporta até 6 pessoas..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
            />
          </div>

          <div className="flex items-center gap-2.5 pt-2">
            <input
              type="checkbox"
              id="tableActiveCheck"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
            />
            <label htmlFor="tableActiveCheck" className="text-xs font-medium text-slate-700 cursor-pointer">
              Mesa ativa para atendimento e leitura de QR Code
            </label>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {table ? 'Salvar Alterações' : 'Cadastrar Mesa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
