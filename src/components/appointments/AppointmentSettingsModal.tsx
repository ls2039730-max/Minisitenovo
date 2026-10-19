import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Clock,
  Calendar,
  AlertCircle,
  Check,
  Loader2,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { api } from '../../services/api';
import type { AppointmentSettings, WeeklyBusinessHours, DaySchedule } from '../../types/appointment';
import { useBackHandler } from '../../services/navigationManager';

interface AppointmentSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const DAYS_MAP: Array<{ key: keyof WeeklyBusinessHours; label: string }> = [
  { key: 'seg', label: 'Segunda-feira' },
  { key: 'ter', label: 'Terça-feira' },
  { key: 'qua', label: 'Quarta-feira' },
  { key: 'qui', label: 'Quinta-feira' },
  { key: 'sex', label: 'Sexta-feira' },
  { key: 'sab', label: 'Sábado' },
  { key: 'dom', label: 'Domingo' },
];

export const AppointmentSettingsModal: React.FC<AppointmentSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  useBackHandler({
    isOpen,
    onClose,
    priority: 20,
    name: 'AppointmentSettingsModal',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form states
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [minBookingNoticeHours, setMinBookingNoticeHours] = useState('1');
  const [maxBookingAdvanceDays, setMaxBookingAdvanceDays] = useState('30');
  const [bufferBetweenAppointmentsMinutes, setBufferBetweenAppointmentsMinutes] = useState('0');
  const [allowCustomerCancellation, setAllowCustomerCancellation] = useState(true);
  const [cancellationNoticeHours, setCancellationNoticeHours] = useState('2');
  const [publicBookingEnabled, setPublicBookingEnabled] = useState(true);
  const [autoConfirmBookings, setAutoConfirmBookings] = useState(false);
  const [notificationInstructions, setNotificationInstructions] = useState('');
  const [businessHours, setBusinessHours] = useState<WeeklyBusinessHours>({
    seg: { isOpen: true, intervals: [{ start: '09:00', end: '18:00' }] },
    ter: { isOpen: true, intervals: [{ start: '09:00', end: '18:00' }] },
    qua: { isOpen: true, intervals: [{ start: '09:00', end: '18:00' }] },
    qui: { isOpen: true, intervals: [{ start: '09:00', end: '18:00' }] },
    sex: { isOpen: true, intervals: [{ start: '09:00', end: '18:00' }] },
    sab: { isOpen: true, intervals: [{ start: '09:00', end: '14:00' }] },
    dom: { isOpen: false, intervals: [] },
  });

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(false);
        const data = await api.getAppointmentSettings();
        setTimezone(data.timezone || 'America/Sao_Paulo');
        setMinBookingNoticeHours(String(data.minBookingNoticeHours ?? 1));
        setMaxBookingAdvanceDays(String(data.maxBookingAdvanceDays ?? 30));
        setBufferBetweenAppointmentsMinutes(String(data.bufferBetweenAppointmentsMinutes ?? 0));
        setAllowCustomerCancellation(data.allowCustomerCancellation !== false);
        setCancellationNoticeHours(String(data.cancellationNoticeHours ?? 2));
        setPublicBookingEnabled(data.publicBookingEnabled !== false);
        setAutoConfirmBookings(data.autoConfirmBookings === true);
        setNotificationInstructions(data.notificationInstructions || '');
        if (data.businessHours) {
          setBusinessHours(data.businessHours);
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar configurações.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleDay = (dayKey: keyof WeeklyBusinessHours) => {
    setBusinessHours((prev) => {
      const current = prev[dayKey];
      const nextIsOpen = !current.isOpen;
      return {
        ...prev,
        [dayKey]: {
          isOpen: nextIsOpen,
          intervals: nextIsOpen && current.intervals.length === 0
            ? [{ start: '09:00', end: '18:00' }]
            : current.intervals,
        },
      };
    });
  };

  const handleUpdateInterval = (
    dayKey: keyof WeeklyBusinessHours,
    idx: number,
    field: 'start' | 'end',
    val: string
  ) => {
    setBusinessHours((prev) => {
      const current = prev[dayKey];
      const newIntervals = current.intervals.map((inv, i) =>
        i === idx ? { ...inv, [field]: val } : inv
      );
      return {
        ...prev,
        [dayKey]: { ...current, intervals: newIntervals },
      };
    });
  };

  const handleAddInterval = (dayKey: keyof WeeklyBusinessHours) => {
    setBusinessHours((prev) => {
      const current = prev[dayKey];
      return {
        ...prev,
        [dayKey]: {
          ...current,
          intervals: [...current.intervals, { start: '13:00', end: '18:00' }],
        },
      };
    });
  };

  const handleRemoveInterval = (dayKey: keyof WeeklyBusinessHours, idx: number) => {
    setBusinessHours((prev) => {
      const current = prev[dayKey];
      return {
        ...prev,
        [dayKey]: {
          ...current,
          intervals: current.intervals.filter((_, i) => i !== idx),
        },
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);

      await api.updateAppointmentSettings({
        timezone,
        minBookingNoticeHours: Number(minBookingNoticeHours) || 0,
        maxBookingAdvanceDays: Number(maxBookingAdvanceDays) || 30,
        bufferBetweenAppointmentsMinutes: Number(bufferBetweenAppointmentsMinutes) || 0,
        allowCustomerCancellation,
        cancellationNoticeHours: Number(cancellationNoticeHours) || 2,
        publicBookingEnabled,
        autoConfirmBookings,
        notificationInstructions: notificationInstructions.trim() || null,
        businessHours,
      });

      setSuccess(true);
      onSaved();
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Configurações da Agenda</h3>
              <p className="text-xs text-slate-500">
                Horários de funcionamento, regras de agendamento e políticas de cancelamento.
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
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
            <span className="text-xs font-semibold">Carregando configurações...</span>
          </div>
        ) : (
          <form id="appointment-settings-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Section 1: Regras Gerais e Disponibilidade Pública */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                1. Regras de Agendamento
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-100/60 transition-colors">
                  <div>
                    <span className="font-bold text-xs text-slate-900 block">Agendamento Online Ativo</span>
                    <span className="text-[11px] text-slate-500 block">
                      Permite que clientes agendem pelo mini site.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={publicBookingEnabled}
                    onChange={(e) => setPublicBookingEnabled(e.target.checked)}
                    className="w-4 h-4 rounded-md text-indigo-600 focus:ring-indigo-500 border-slate-300"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-100/60 transition-colors">
                  <div>
                    <span className="font-bold text-xs text-slate-900 block">Confirmação Automática</span>
                    <span className="text-[11px] text-slate-500 block">
                      Aprova agendamentos sem precisar confirmar manualmente.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoConfirmBookings}
                    onChange={(e) => setAutoConfirmBookings(e.target.checked)}
                    className="w-4 h-4 rounded-md text-indigo-600 focus:ring-indigo-500 border-slate-300"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Antecedência Mínima (horas)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={minBookingNoticeHours}
                    onChange={(e) => setMinBookingNoticeHours(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">Tempo mínimo antes do horário</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Antecedência Máxima (dias)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={maxBookingAdvanceDays}
                    onChange={(e) => setMaxBookingAdvanceDays(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">Até quantos dias no futuro</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Intervalo Entre Atendimentos (min)
                  </label>
                  <select
                    value={bufferBetweenAppointmentsMinutes}
                    onChange={(e) => setBufferBetweenAppointmentsMinutes(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="0">0 minutos (sem intervalo)</option>
                    <option value="5">5 minutos</option>
                    <option value="10">10 minutos</option>
                    <option value="15">15 minutos</option>
                    <option value="30">30 minutos</option>
                  </select>
                  <span className="text-[10px] text-slate-400 block mt-1">Tempo de higienização / descanso</span>
                </div>
              </div>
            </div>

            {/* Section 2: Horários de Funcionamento por Dia da Semana */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  2. Horários de Funcionamento da Empresa
                </h4>
                <span className="text-[11px] text-slate-400">Suporte a múltiplos turnos (ex: almoço)</span>
              </div>

              <div className="space-y-3">
                {DAYS_MAP.map(({ key, label }) => {
                  const day = businessHours[key];
                  return (
                    <div
                      key={key}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        day.isOpen ? 'bg-white border-slate-200 shadow-2xs' : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={day.isOpen}
                            onChange={() => handleToggleDay(key)}
                            className="w-4 h-4 rounded-md text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                          />
                          <span className="font-bold text-xs text-slate-900 min-w-28">{label}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            day.isOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {day.isOpen ? 'Aberto' : 'Fechado'}
                          </span>
                        </div>

                        {day.isOpen && (
                          <div className="flex flex-wrap items-center gap-2 ml-7 sm:ml-0">
                            {day.intervals.map((inv, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                                <input
                                  type="time"
                                  value={inv.start}
                                  onChange={(e) => handleUpdateInterval(key, idx, 'start', e.target.value)}
                                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                                />
                                <span className="text-xs text-slate-400">às</span>
                                <input
                                  type="time"
                                  value={inv.end}
                                  onChange={(e) => handleUpdateInterval(key, idx, 'end', e.target.value)}
                                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                                />
                                {day.intervals.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveInterval(key, idx)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                                    title="Remover intervalo"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}

                            {day.intervals.length < 3 && (
                              <button
                                type="button"
                                onClick={() => handleAddInterval(key)}
                                className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              >
                                + Intervalo
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Cancelamento e Orientações */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                3. Políticas de Cancelamento & Orientações
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-100/60 transition-colors">
                  <div>
                    <span className="font-bold text-xs text-slate-900 block">Permitir Cancelamento pelo Cliente</span>
                    <span className="text-[11px] text-slate-500 block">
                      O cliente pode cancelar através do link do comprovante.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowCustomerCancellation}
                    onChange={(e) => setAllowCustomerCancellation(e.target.checked)}
                    className="w-4 h-4 rounded-md text-indigo-600 focus:ring-indigo-500 border-slate-300"
                  />
                </label>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Prazo Mínimo para Cancelar (horas)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    disabled={!allowCustomerCancellation}
                    value={cancellationNoticeHours}
                    onChange={(e) => setCancellationNoticeHours(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Ex: até 2 horas antes do início do atendimento.
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Instruções para o Cliente (Exibido no comprovante)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Por favor chegue com 10 minutos de antecedência. Em caso de imprevisto, avise pelo WhatsApp..."
                  value={notificationInstructions}
                  onChange={(e) => setNotificationInstructions(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
          >
            Fechar
          </button>

          <button
            type="submit"
            form="appointment-settings-form"
            disabled={saving || loading}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {success ? <Check className="w-4 h-4 text-emerald-300" /> : null}
            {saving ? 'Salvando...' : success ? 'Salvo!' : 'Salvar Configurações'}
          </button>
        </div>
      </div>
    </div>
  );
};
