import React, { useState } from 'react';
import { X, Loader2, Layers, AlertCircle, CheckCircle2 } from 'lucide-react';
import { CreateTablesBatchPayload } from '../../../types/restaurant';

interface BatchTablesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: CreateTablesBatchPayload) => Promise<{ createdCount: number; skippedCount: number }>;
}

export const BatchTablesModal: React.FC<BatchTablesModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [startNumber, setStartNumber] = useState(1);
  const [endNumber, setEndNumber] = useState(20);
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [namePrefix, setNamePrefix] = useState('Salão');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (startNumber < 1 || endNumber < startNumber) {
      setError('O número inicial deve ser menor ou igual ao número final.');
      return;
    }
    if (endNumber - startNumber > 100) {
      setError('Máximo de 100 mesas por lote.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave({
        startNumber,
        endNumber,
        prefix: prefix.trim() || undefined,
        suffix: suffix.trim() || undefined,
        namePrefix: namePrefix.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar mesas em lote.');
    } finally {
      setSaving(false);
    }
  };

  const previewCount = Math.max(0, endNumber - startNumber + 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Cadastrar Mesas em Lote</h3>
              <p className="text-xs text-slate-500">Gere várias mesas numeradas em sequência</p>
            </div>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Número Inicial *
              </label>
              <input
                type="number"
                min="1"
                max="999"
                value={startNumber}
                onChange={(e) => setStartNumber(parseInt(e.target.value) || 1)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Número Final *
              </label>
              <input
                type="number"
                min="1"
                max="999"
                value={endNumber}
                onChange={(e) => setEndNumber(parseInt(e.target.value) || 1)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Prefixo (Opcional)
              </label>
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="Ex: M-"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Sufixo (Opcional)
              </label>
              <input
                type="text"
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                placeholder="Ex: -EXT"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Prefixo do Nome / Setor
            </label>
            <input
              type="text"
              value={namePrefix}
              onChange={(e) => setNamePrefix(e.target.value)}
              placeholder="Ex: Salão, Varanda, Deck"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Resultará em nomes como: &quot;{namePrefix || 'Mesa'} {startNumber < 10 ? `0${startNumber}` : startNumber}&quot;
            </p>
          </div>

          {/* Preview Box */}
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
            <div className="text-xs text-indigo-900 leading-relaxed">
              <span className="font-bold">{previewCount} mesas</span> serão criadas com números de{' '}
              <span className="font-bold">{prefix}{startNumber < 10 ? `0${startNumber}` : startNumber}{suffix}</span> até{' '}
              <span className="font-bold">{prefix}{endNumber < 10 ? `0${endNumber}` : endNumber}{suffix}</span>.
              <br />
              <span className="text-[11px] opacity-80">Mesas já existentes serão ignoradas automaticamente para evitar duplicidade.</span>
            </div>
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
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
              Gerar {previewCount} Mesas
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
