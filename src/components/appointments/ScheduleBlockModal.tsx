import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Calendar,
  Clock,
  Trash2,
  AlertCircle,
  Loader2,
  Plus,
} from 'lucide-react';
import { api } from '../../services/api';
import type { ScheduleBlock } from '../../types/appointment';
import type { Professional } from '../../types/service';
import { useBackHandler } from '../../services/navigationManager';

interface ScheduleBlockModalProps {
  isOpen: boolean;
  professionals: Professional[];
  lockedProfessionalId?: string;
  onClose: () => void;
  onBlockSaved: () => void;
}

export const ScheduleBlockModal: React.FC<ScheduleBlockModalProps> = ({
  isOpen,
  professionals,
  lockedProfessionalId,
  onClose,
  onBlockSaved,
}) => {
  useBackHandler({
    isOpen,
    onClose,
    priority: 20,
    name: 'ScheduleBlockModal',
  });

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New Block Form
  const [title, setTitle] = useState('');
  const [selectedProfId, setSelectedProfId] = useState<string>(lockedProfessionalId || '');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('18:00');
  const [isAllDay, setIsAllDay] = useState(false);
  const [notes, setNotes] = useState('');

  const loadBlocks = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getScheduleBlocks();
      setBlocks(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar bloqueios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
    setTitle('Pausa / Manutenção');
    if (lockedProfessionalId) {
      setSelectedProfId(lockedProfessionalId);
    }
    loadBlocks();
  }, [isOpen, lockedProfessionalId]);

  if (!isOpen) return null;

  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('O título do bloqueio é obrigatório.');
      return;
    }
    if (!startDate || !endDate) {
      setError('Informe as datas de início e término.');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const startAtStr = isAllDay ? `${startDate}T00:00:00.000Z` : `${startDate}T${startTime}:00.000Z`;
      const endAtStr = isAllDay ? `${endDate}T23:59:59.000Z` : `${endDate}T${endTime}:00.000Z`;

      await api.createScheduleBlock({
        title: title.trim(),
        professionalId: selectedProfId ? selectedProfId : null,
        startAt: new Date(startAtStr).toISOString(),
        endAt: new Date(endAtStr).toISOString(),
        isAllDay,
        notes: notes.trim() || null,
      });

      setTitle('Pausa / Manutenção');
      setNotes('');
      await loadBlocks();
      onBlockSaved();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar bloqueio.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id);
      await api.deleteScheduleBlock(id);
      setBlocks((prev) => prev.filter((b) => b.id !== id));
      onBlockSaved();
    } catch (err: any) {
      setError(err.message || 'Erro ao remover bloqueio.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-xs">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Bloqueios & Pausas de Horário</h3>
              <p className="text-xs text-slate-500">
                Bloqueie períodos para férias, almoços estendidos, folgas ou ausências.
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

        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* New Block Form */}
          <form onSubmit={handleCreateBlock} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-indigo-600" />
              Novo Bloqueio
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Motivo / Título *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Folga, Almoço estendido, Férias..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Profissional Afetado
                </label>
                {lockedProfessionalId ? (
                  <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span>
                      {professionals.find((p) => p.id === lockedProfessionalId)?.name || 'Meu Perfil'}
                    </span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                      Exclusivo
                    </span>
                  </div>
                ) : (
                  <select
                    value={selectedProfId}
                    onChange={(e) => setSelectedProfId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">Toda a Empresa (Geral)</option>
                    {professionals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Início
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                    required
                  />
                  {!isAllDay && (
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-24 px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                      required
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Término
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                    required
                  />
                  {!isAllDay && (
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-24 px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                      required
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAllDay}
                  onChange={(e) => setIsAllDay(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                Dia Inteiro
              </label>

              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                Registrar Bloqueio
              </button>
            </div>
          </form>

          {/* List of Existing Blocks */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Bloqueios Cadastrados ({blocks.length})
            </h4>

            {loading ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                Carregando bloqueios...
              </div>
            ) : blocks.length === 0 ? (
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-500">
                Nenhum bloqueio cadastrado no momento. Todos os horários seguem a disponibilidade padrão.
              </div>
            ) : (
              <div className="space-y-2">
                {blocks.map((b) => {
                  const startFormatted = new Date(b.startAt).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: b.isAllDay ? undefined : '2-digit',
                    minute: b.isAllDay ? undefined : '2-digit',
                  });
                  const endFormatted = new Date(b.endAt).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: b.isAllDay ? undefined : '2-digit',
                    minute: b.isAllDay ? undefined : '2-digit',
                  });

                  return (
                    <div
                      key={b.id}
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-2xs hover:border-slate-300 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">{b.title}</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">
                            {b.professionalName || 'Empresa Toda'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {startFormatted} até {endFormatted}
                          {b.isAllDay && ' (Dia todo)'}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDelete(b.id)}
                        disabled={deletingId === b.id}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Remover bloqueio"
                      >
                        {deletingId === b.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
