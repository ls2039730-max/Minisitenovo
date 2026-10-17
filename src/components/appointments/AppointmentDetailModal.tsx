import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  Briefcase,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileText,
  MessageCircle,
  Loader2,
  CalendarDays,
  Sparkles,
  HelpCircle,
  Save,
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { Appointment, AppointmentStatus, AvailableSlot } from '../../types/appointment';
import type { Professional } from '../../types/service';

interface AppointmentDetailModalProps {
  isOpen: boolean;
  appointment: Appointment | null;
  professionals: Professional[];
  tenantSlug: string;
  onClose: () => void;
  onAppointmentUpdated: (updated: Appointment) => void;
}

export const AppointmentDetailModal: React.FC<AppointmentDetailModalProps> = ({
  isOpen,
  appointment,
  professionals,
  tenantSlug,
  onClose,
  onAppointmentUpdated,
}) => {
  const { isProfessional, linkedProfessional } = useAuth();
  const [internalNotes, setInternalNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSuccess, setNotesSuccess] = useState(false);

  // Status change state
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Cancellation state
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Reschedule state
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleProfId, setRescheduleProfId] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [savingReschedule, setSavingReschedule] = useState(false);

  useEffect(() => {
    if (!appointment) return;
    setInternalNotes(appointment.internalNotes || '');
    setStatusError(null);
    setIsCancelling(false);
    setCancelReason('');
    setIsRescheduling(false);
    setRescheduleDate(appointment.startAt.split('T')[0]);
    setRescheduleProfId(appointment.professionalId || '');
    setRescheduleTime('');
    setNotesSuccess(false);
  }, [appointment, isOpen]);

  // Load slots when rescheduling
  useEffect(() => {
    if (!isRescheduling || !appointment || !rescheduleDate) return;

    const loadSlots = async () => {
      try {
        setLoadingSlots(true);
        setSlotsError(null);
        const res = await api.getPublicAvailableSlots(
          tenantSlug,
          appointment.serviceId,
          rescheduleDate,
          rescheduleProfId || undefined
        );
        setAvailableSlots(res.slots || []);
        if (res.slots.length === 0) {
          setSlotsError(res.closedReason || 'Nenhum horário disponível para esta data.');
        }
      } catch (err: any) {
        setSlotsError(err.message || 'Erro ao consultar horários disponíveis.');
        setAvailableSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    };

    loadSlots();
  }, [isRescheduling, rescheduleDate, rescheduleProfId, appointment, tenantSlug]);

  if (!isOpen || !appointment) return null;

  // Format date and time
  const startDate = new Date(appointment.startAt);
  const endDate = new Date(appointment.endAt);
  const formattedDate = startDate.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const formattedStartTime = startDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const formattedEndTime = endDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // WhatsApp url
  const rawPhone = appointment.customerPhone.replace(/\D/g, '');
  const waUrl = rawPhone
    ? `https://wa.me/55${rawPhone}?text=${encodeURIComponent(
        `Olá ${appointment.customerName}! Entramos em contato a respeito do seu agendamento (${appointment.code}) para o serviço ${appointment.serviceName} no dia ${startDate.toLocaleDateString('pt-BR')} às ${formattedStartTime}.`
      )}`
    : null;

  const handleSaveNotes = async () => {
    try {
      setSavingNotes(true);
      setStatusError(null);
      const updated = await api.updateAppointmentNotes(appointment.id, internalNotes.trim() || null);
      onAppointmentUpdated(updated);
      setNotesSuccess(true);
      setTimeout(() => setNotesSuccess(false), 3000);
    } catch (err: any) {
      setStatusError(err.message || 'Erro ao salvar anotações.');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleUpdateStatus = async (newStatus: AppointmentStatus, reason?: string) => {
    try {
      setUpdatingStatus(true);
      setStatusError(null);
      const updated = await api.updateAppointmentStatus(appointment.id, newStatus, reason);
      onAppointmentUpdated(updated);
      setIsCancelling(false);
      setCancelReason('');

      // Open WhatsApp with pre-filled message according to new status
      const rawPhone = appointment.customerPhone.replace(/\D/g, '');
      if (rawPhone) {
        let msg = '';
        if (newStatus === 'confirmed') {
          msg = `Olá ${appointment.customerName}! Boas notícias: o seu agendamento (${appointment.code}) para o serviço *${appointment.serviceName}* no dia *${startDate.toLocaleDateString('pt-BR')}* às *${formattedStartTime}* foi *confirmado*! Aguardamos você.`;
        } else if (newStatus === 'cancelled') {
          msg = `Olá ${appointment.customerName}. Informamos que o seu agendamento (${appointment.code}) para o serviço *${appointment.serviceName}* no dia *${startDate.toLocaleDateString('pt-BR')}* às *${formattedStartTime}* foi *cancelado*${reason ? `. Motivo: ${reason}` : ''}.`;
        } else if (newStatus === 'completed') {
          msg = `Olá ${appointment.customerName}! Seu atendimento referente ao serviço *${appointment.serviceName}* (${appointment.code}) foi concluído com sucesso. Agradecemos a preferência!`;
        } else if (newStatus === 'no_show') {
          msg = `Olá ${appointment.customerName}, sentimos sua falta no horário agendado para o serviço *${appointment.serviceName}* (${appointment.code}) em ${startDate.toLocaleDateString('pt-BR')} às ${formattedStartTime}.`;
        }
        if (msg) {
          const url = `https://wa.me/55${rawPhone}?text=${encodeURIComponent(msg)}`;
          window.open(url, '_blank');
        }
      }
    } catch (err: any) {
      setStatusError(err.message || 'Erro ao alterar status do agendamento.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleDate || !rescheduleTime) {
      setStatusError('Selecione a nova data e o novo horário.');
      return;
    }

    try {
      setSavingReschedule(true);
      setStatusError(null);

      const slot = availableSlots.find((s) => s.time === rescheduleTime);
      const startAtIso = slot ? slot.startAt : `${rescheduleDate}T${rescheduleTime}:00.000Z`;

      const updated = await api.rescheduleAppointment(appointment.id, {
        startAt: startAtIso,
        professionalId: rescheduleProfId || null,
      });

      onAppointmentUpdated(updated);
      setIsRescheduling(false);

      // Open WhatsApp for rescheduling confirmation
      const rawPhone = appointment.customerPhone.replace(/\D/g, '');
      if (rawPhone) {
        const newStartDate = new Date(startAtIso);
        const newFormattedDate = newStartDate.toLocaleDateString('pt-BR');
        const newFormattedTime = newStartDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const msg = `Olá ${appointment.customerName}! Seu agendamento (${appointment.code}) para o serviço *${appointment.serviceName}* foi *remarcado* com sucesso para o dia *${newFormattedDate}* às *${newFormattedTime}*.`;
        const url = `https://wa.me/55${rawPhone}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
      }
    } catch (err: any) {
      setStatusError(err.message || 'Erro ao remarcar agendamento.');
    } finally {
      setSavingReschedule(false);
    }
  };

  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Pendente de Confirmação
          </span>
        );
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
            Confirmado
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Concluído
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Cancelado
          </span>
        );
      case 'no_show':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            Não Compareceu
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm shadow-xs">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">Agendamento {appointment.code}</h3>
                {getStatusBadge(appointment.status)}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Origem: {appointment.source === 'public_site' ? 'Site Público' : 'Painel Administrativo'} • Criado em{' '}
                {new Date(appointment.createdAt).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {statusError && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{statusError}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Main Info Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4.5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Serviço</span>
                <div className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-indigo-600" />
                  {appointment.serviceName}
                </div>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                  <span>{appointment.durationMinutes} minutos</span>
                  {appointment.servicePrice !== undefined && appointment.servicePrice !== null && (
                    <>
                      <span>•</span>
                      <span className="font-semibold text-slate-700">
                        {Number(appointment.servicePrice).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Profissional</span>
                <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-slate-600" />
                  {appointment.professionalName || 'Qualquer profissional disponível'}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-700 font-bold">
                <CalendarDays className="w-4 h-4 text-indigo-600" />
                <span className="capitalize">{formattedDate}</span>
              </div>
              <div className="flex items-center gap-1.5 font-black text-indigo-700 bg-indigo-50 px-3 py-1 rounded-xl">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {formattedStartTime} - {formattedEndTime}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" />
              Dados do Cliente
            </h4>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="font-extrabold text-sm text-slate-900">{appointment.customerName}</div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {appointment.customerPhone}
                    </span>
                    {appointment.customerEmail && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        {appointment.customerEmail}
                      </span>
                    )}
                  </div>
                </div>

                {waUrl && (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Chamar no WhatsApp
                  </a>
                )}
              </div>

              {appointment.customerNotes && (
                <div className="pt-3 border-t border-slate-100 text-xs">
                  <span className="font-bold text-slate-600 block mb-1">Observações do Cliente:</span>
                  <p className="text-slate-600 italic bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    "{appointment.customerNotes}"
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Reschedule View or Trigger */}
          {isRescheduling ? (
            <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-xs text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  Remarcar Atendimento
                </h4>
                <button
                  type="button"
                  onClick={() => setIsRescheduling(false)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                  Cancelar Remarcação
                </button>
              </div>

              <form onSubmit={handleRescheduleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nova Data</label>
                    <input
                      type="date"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Profissional</label>
                    {isProfessional ? (
                      <div className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-between">
                        <span>{professionals.find((p) => p.id === rescheduleProfId)?.name || 'Meu Perfil'}</span>
                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                          Fixo
                        </span>
                      </div>
                    ) : (
                      <select
                        value={rescheduleProfId}
                        onChange={(e) => setRescheduleProfId(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                      >
                        <option value="">Qualquer profissional disponível</option>
                        {professionals.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Novo Horário Disponível</label>
                  {loadingSlots ? (
                    <div className="flex items-center gap-2 py-3 text-xs text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                      Calculando horários livres...
                    </div>
                  ) : slotsError ? (
                    <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                      {slotsError}
                    </p>
                  ) : availableSlots.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhum horário disponível para esta data.</p>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-36 overflow-y-auto p-1">
                      {availableSlots.map((slot) => (
                        <button
                          key={slot.time}
                          type="button"
                          onClick={() => setRescheduleTime(slot.time)}
                          className={`py-2 px-1 text-center rounded-xl text-xs font-extrabold border transition-all ${
                            rescheduleTime === slot.time
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-400'
                          }`}
                        >
                          {slot.time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRescheduling(false)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-white"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={savingReschedule || !rescheduleTime}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
                  >
                    {savingReschedule && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Confirmar Nova Data/Horário
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          {/* Cancellation View */}
          {isCancelling ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3">
              <h4 className="font-extrabold text-xs text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-rose-600" />
                Motivo do Cancelamento
              </h4>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: Cliente solicitou cancelamento via WhatsApp por motivo de viagem."
                rows={2}
                className="w-full p-2.5 bg-white border border-rose-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCancelling(false)}
                  className="px-3.5 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-white"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateStatus('cancelled', cancelReason.trim())}
                  disabled={updatingStatus}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  {updatingStatus && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirmar Cancelamento
                </button>
              </div>
            </div>
          ) : null}

          {/* Internal Notes Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                Observações Internas (Visível apenas para a empresa)
              </h4>
              {notesSuccess && (
                <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Salvo com sucesso!
                </span>
              )}
            </div>
            <div className="space-y-2">
              <textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Anotações internas sobre preferências do cliente, orientações ao profissional, etc."
                rows={3}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-hidden"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {savingNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Salvar Observações
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {appointment.status === 'pending' && (
              <button
                type="button"
                onClick={() => handleUpdateStatus('confirmed')}
                disabled={updatingStatus}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                {updatingStatus && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <CheckCircle2 className="w-4 h-4" />
                Confirmar Solicitação
              </button>
            )}

            {appointment.status === 'confirmed' && (
              <>
                <button
                  type="button"
                  onClick={() => handleUpdateStatus('completed')}
                  disabled={updatingStatus}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  {updatingStatus && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <CheckCircle2 className="w-4 h-4" />
                  Marcar Concluído
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdateStatus('no_show')}
                  disabled={updatingStatus}
                  className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  Não Compareceu
                </button>
              </>
            )}

            {appointment.status !== 'cancelled' && !isRescheduling && !isCancelling && (
              <button
                type="button"
                onClick={() => setIsRescheduling(true)}
                className="px-3.5 py-2 border border-slate-300 hover:bg-white text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
                Remarcar Horário
              </button>
            )}

            {appointment.status !== 'cancelled' && !isCancelling && (
              <button
                type="button"
                onClick={() => setIsCancelling(true)}
                className="px-3 py-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                Cancelar Agendamento
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
