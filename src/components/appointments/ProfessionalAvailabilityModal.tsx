import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Calendar,
  AlertCircle,
  Check,
  Loader2,
  ShieldCheck,
  Info,
  CheckCircle2,
  Coffee,
} from 'lucide-react';
import { api } from '../../services/api';
import type { Tenant } from '../../types/saas';
import type { Professional } from '../../types/service';
import type {
  AppointmentSettings,
  WeeklyBusinessHours,
  ProfessionalSchedule,
} from '../../types/appointment';

interface ProfessionalAvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  professional: Professional;
  tenant: Tenant;
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

export const ProfessionalAvailabilityModal: React.FC<ProfessionalAvailabilityModalProps> = ({
  isOpen,
  onClose,
  professional,
  tenant,
  onSaved,
}) => {
  const [activeTab, setActiveTab] = useState<'schedule' | 'policies'>('schedule');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Availability state
  const [useBusinessHours, setUseBusinessHours] = useState(true);
  const [customHours, setCustomHours] = useState<WeeklyBusinessHours>({
    seg: { isOpen: true, intervals: [{ start: '09:00', end: '18:00' }] },
    ter: { isOpen: true, intervals: [{ start: '09:00', end: '18:00' }] },
    qua: { isOpen: true, intervals: [{ start: '09:00', end: '18:00' }] },
    qui: { isOpen: true, intervals: [{ start: '09:00', end: '18:00' }] },
    sex: { isOpen: true, intervals: [{ start: '09:00', end: '18:00' }] },
    sab: { isOpen: true, intervals: [{ start: '09:00', end: '14:00' }] },
    dom: { isOpen: false, intervals: [] },
  });

  // Global settings (read-only)
  const [globalSettings, setGlobalSettings] = useState<AppointmentSettings | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(false);

        const [schedulesData, settingsData] = await Promise.all([
          api.getProfessionalSchedules(),
          api.getAppointmentSettings(),
        ]);

        setGlobalSettings(settingsData);

        const mySched = (schedulesData || []).find((s) => s.professionalId === professional.id);
        if (mySched) {
          setUseBusinessHours(mySched.useBusinessHours !== false);
          if (mySched.customHours) {
            setCustomHours(mySched.customHours);
          } else if (settingsData.businessHours) {
            setCustomHours(settingsData.businessHours);
          }
        } else if (settingsData.businessHours) {
          setCustomHours(settingsData.businessHours);
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar disponibilidade do profissional.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen, professional.id]);

  if (!isOpen) return null;

  const handleToggleDay = (dayKey: keyof WeeklyBusinessHours) => {
    setCustomHours((prev) => {
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

  const handleUpdateTime = (
    dayKey: keyof WeeklyBusinessHours,
    field: 'start' | 'end',
    val: string
  ) => {
    setCustomHours((prev) => {
      const current = prev[dayKey];
      const primaryInterval = current.intervals[0] || { start: '09:00', end: '18:00' };
      const updatedInterval = { ...primaryInterval, [field]: val };
      return {
        ...prev,
        [dayKey]: {
          ...current,
          intervals: [updatedInterval, ...current.intervals.slice(1)],
        },
      };
    });
  };

  const handleToggleLunch = (dayKey: keyof WeeklyBusinessHours) => {
    setCustomHours((prev) => {
      const current = prev[dayKey];
      const hasBreak = current.intervals.length >= 2;
      if (hasBreak) {
        // Remove break
        const main = current.intervals[0];
        return {
          ...prev,
          [dayKey]: {
            ...current,
            intervals: [main],
          },
        };
      } else {
        // Split day around default 12:00 - 13:00 lunch
        const main = current.intervals[0] || { start: '09:00', end: '18:00' };
        return {
          ...prev,
          [dayKey]: {
            ...current,
            intervals: [
              { start: main.start, end: '12:00' },
              { start: '13:00', end: main.end },
            ],
          },
        };
      }
    });
  };

  const handleUpdateBreakIntervals = (
    dayKey: keyof WeeklyBusinessHours,
    morningEnd: string,
    afternoonStart: string
  ) => {
    setCustomHours((prev) => {
      const current = prev[dayKey];
      const morningStart = current.intervals[0]?.start || '09:00';
      const afternoonEnd = current.intervals[1]?.end || '18:00';
      return {
        ...prev,
        [dayKey]: {
          ...current,
          intervals: [
            { start: morningStart, end: morningEnd },
            { start: afternoonStart, end: afternoonEnd },
          ],
        },
      };
    });
  };

  const validateHours = (): boolean => {
    if (useBusinessHours) return true;

    for (const { key, label } of DAYS_MAP) {
      const day = customHours[key];
      if (!day.isOpen) continue;

      if (!day.intervals || day.intervals.length === 0) {
        setError(`O dia ${label} está ativo mas sem horários definidos.`);
        return false;
      }

      for (let i = 0; i < day.intervals.length; i++) {
        const inv = day.intervals[i];
        if (inv.start >= inv.end) {
          setError(`No dia ${label}, o horário de início (${inv.start}) deve ser anterior ao término (${inv.end}).`);
          return false;
        }
        if (i > 0) {
          const prevInv = day.intervals[i - 1];
          if (inv.start < prevInv.end) {
            setError(`No dia ${label}, existe sobreposição de horários.`);
            return false;
          }
        }
      }
    }

    return true;
  };

  const handleSave = async () => {
    setError(null);
    if (!validateHours()) return;

    try {
      setSaving(true);
      await api.saveProfessionalSchedule({
        professionalId: professional.id,
        useBusinessHours,
        customHours: useBusinessHours ? null : customHours,
        active: true,
      });

      setSuccess(true);
      onSaved();
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar disponibilidade.');
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
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Minha Disponibilidade & Horários
              </h3>
              <p className="text-xs text-slate-500">
                {professional.name} • Gestão exclusiva da sua agenda de atendimentos
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

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-100 px-6 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('schedule')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'schedule'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Dias & Horários de Trabalho
          </button>
          <button
            onClick={() => setActiveTab('policies')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'policies'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Políticas do Estabelecimento (Consulta)
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mx-6 mt-4 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl text-xs flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Horários de atendimento salvos com sucesso!</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
              <p className="text-xs">Carregando horários e políticas...</p>
            </div>
          ) : activeTab === 'schedule' ? (
            <div className="space-y-6">
              {/* Mode Toggle */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Regra de Disponibilidade
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Escolha se deseja acompanhar o horário padrão da empresa ou ter horários exclusivos.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setUseBusinessHours(true)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      useBusinessHours
                        ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900">
                        Horário Geral da Empresa
                      </span>
                      {useBusinessHours && <Check className="w-4 h-4 text-indigo-600" />}
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Segue automaticamente os horários de funcionamento configurados pelo estabelecimento.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUseBusinessHours(false)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      !useBusinessHours
                        ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900">
                        Minha Grade Personalizada
                      </span>
                      {!useBusinessHours && <Check className="w-4 h-4 text-indigo-600" />}
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Defina dias de trabalho, horários de início/fim e intervalos de almoço exclusivos para você.
                    </p>
                  </button>
                </div>
              </div>

              {/* Schedule Details */}
              {useBusinessHours ? (
                <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-2xl flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-900 space-y-1">
                    <p className="font-bold">Você está utilizando o horário geral do estabelecimento.</p>
                    <p className="text-blue-700 leading-relaxed">
                      Sua agenda ficará aberta nos dias e períodos de funcionamento da empresa. Se precisar tirar folgas ou ausências pontuais, utilize a funcionalidade de <strong>Bloqueios & Pausas</strong>.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                    <span>Defina seus Dias e Horários de Trabalho</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      Configuração pessoal do profissional
                    </span>
                  </h4>

                  <div className="space-y-2.5">
                    {DAYS_MAP.map(({ key, label }) => {
                      const day = customHours[key];
                      const isMultiInterval = (day.intervals || []).length >= 2;
                      const morning = day.intervals[0] || { start: '09:00', end: '18:00' };
                      const afternoon = day.intervals[1] || { start: '13:00', end: '18:00' };

                      return (
                        <div
                          key={key}
                          className={`p-3.5 rounded-2xl border transition-all ${
                            day.isOpen
                              ? 'bg-white border-slate-200 shadow-xs'
                              : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            {/* Day Checkbox */}
                            <label className="flex items-center gap-3 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={day.isOpen}
                                onChange={() => handleToggleDay(key)}
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                              <span className={`text-xs font-bold ${day.isOpen ? 'text-slate-900' : 'text-slate-500'}`}>
                                {label}
                              </span>
                            </label>

                            {/* Hours Controls */}
                            {day.isOpen && (
                              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                                {!isMultiInterval ? (
                                  <>
                                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                      <span>Das</span>
                                      <input
                                        type="time"
                                        value={morning.start}
                                        onChange={(e) => handleUpdateTime(key, 'start', e.target.value)}
                                        className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500"
                                      />
                                      <span>às</span>
                                      <input
                                        type="time"
                                        value={morning.end}
                                        onChange={(e) => handleUpdateTime(key, 'end', e.target.value)}
                                        className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleLunch(key)}
                                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors flex items-center gap-1 cursor-pointer"
                                    >
                                      <Coffee className="w-3.5 h-3.5" />
                                      + Pausa de Almoço
                                    </button>
                                  </>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <div className="flex items-center gap-1 text-slate-600">
                                      <span>Manhã:</span>
                                      <input
                                        type="time"
                                        value={morning.start}
                                        onChange={(e) => handleUpdateTime(key, 'start', e.target.value)}
                                        className="w-20 px-1.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                                      />
                                      <span>às</span>
                                      <input
                                        type="time"
                                        value={morning.end}
                                        onChange={(e) => handleUpdateBreakIntervals(key, e.target.value, afternoon.start)}
                                        className="w-20 px-1.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                                      />
                                    </div>
                                    <span className="text-slate-300">|</span>
                                    <div className="flex items-center gap-1 text-slate-600">
                                      <span>Tarde:</span>
                                      <input
                                        type="time"
                                        value={afternoon.start}
                                        onChange={(e) => handleUpdateBreakIntervals(key, morning.end, e.target.value)}
                                        className="w-20 px-1.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                                      />
                                      <span>às</span>
                                      <input
                                        type="time"
                                        value={afternoon.end}
                                        onChange={(e) => {
                                          setCustomHours((prev) => {
                                            const cur = prev[key];
                                            return {
                                              ...prev,
                                              [key]: {
                                                ...cur,
                                                intervals: [cur.intervals[0], { ...cur.intervals[1], end: e.target.value }],
                                              },
                                            };
                                          });
                                        }}
                                        className="w-20 px-1.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleLunch(key)}
                                      className="text-[10px] text-rose-600 hover:text-rose-800 ml-1 font-bold cursor-pointer"
                                    >
                                      Remover pausa
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Establishment Policies Read-Only Tab */
            <div className="space-y-5">
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 space-y-1">
                  <p className="font-bold">Regras e Políticas Oficiais do Estabelecimento</p>
                  <p className="text-amber-800 leading-relaxed">
                    Estas políticas são definidas exclusivamente pela gerência da empresa e são aplicadas a todos os clientes que realizam agendamentos pelo mini site. Você pode consultá-las abaixo para tirar dúvidas e orientar seus clientes.
                  </p>
                </div>
              </div>

              {globalSettings ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Política de Cancelamento
                    </span>
                    <div className="text-sm font-extrabold text-slate-900">
                      {globalSettings.allowCustomerCancellation ? (
                        <span className="text-emerald-700">
                          Permitido até {globalSettings.cancellationNoticeHours}h antes
                        </span>
                      ) : (
                        <span className="text-rose-700">Cancelamento online desativado</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {globalSettings.allowCustomerCancellation
                        ? `Clientes podem cancelar sem custos com antecedência mínima de ${globalSettings.cancellationNoticeHours} horas.`
                        : 'Cancelamentos só podem ser realizados entrando em contato direto com o estabelecimento.'}
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Antecedência de Agendamento
                    </span>
                    <div className="text-sm font-extrabold text-slate-900">
                      Mínima: {globalSettings.minBookingNoticeHours}h • Máxima: {globalSettings.maxBookingAdvanceDays} dias
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Evita solicitações de última hora sem preparação prévia.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Intervalo entre Atendimentos (Buffer)
                    </span>
                    <div className="text-sm font-extrabold text-slate-900">
                      {globalSettings.bufferBetweenAppointmentsMinutes} minutos
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Tempo de respiro automático inserido entre atendimentos para organização do espaço.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Confirmação de Agendamentos
                    </span>
                    <div className="text-sm font-extrabold text-slate-900">
                      {globalSettings.autoConfirmBookings ? (
                        <span className="text-blue-700">Confirmação Automática</span>
                      ) : (
                        <span className="text-amber-700">Requer Aprovação Manual</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {globalSettings.autoConfirmBookings
                        ? 'Agendamentos públicos entram diretamente como confirmados.'
                        : 'Agendamentos públicos entram como pendentes aguardando sua validação.'}
                    </p>
                  </div>

                  {globalSettings.notificationInstructions && (
                    <div className="col-span-1 sm:col-span-2 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        Instruções Oficiais aos Clientes
                      </span>
                      <p className="text-xs text-slate-700 italic leading-relaxed">
                        "{globalSettings.notificationInstructions}"
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Configurações gerais não disponíveis no momento.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Fechar
          </button>

          {activeTab === 'schedule' && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{saving ? 'Salvando...' : 'Salvar Minha Disponibilidade'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
