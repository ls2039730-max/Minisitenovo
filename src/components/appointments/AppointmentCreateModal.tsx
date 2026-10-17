import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  Phone,
  Briefcase,
  AlertCircle,
  Loader2,
  Check,
  Sparkles,
} from 'lucide-react';
import { api } from '../../services/api';
import type { Service, Professional } from '../../types/service';
import type { Appointment, AppointmentStatus, AvailableSlot } from '../../types/appointment';

interface AppointmentCreateModalProps {
  isOpen: boolean;
  services: Service[];
  professionals: Professional[];
  lockedProfessionalId?: string;
  initialDate?: string;
  tenantSlug?: string;
  onClose: () => void;
  onAppointmentCreated: (appt: Appointment) => void;
}

export const AppointmentCreateModal: React.FC<AppointmentCreateModalProps> = ({
  isOpen,
  services,
  professionals,
  lockedProfessionalId,
  initialDate,
  tenantSlug,
  onClose,
  onAppointmentCreated,
}) => {
  const [serviceId, setServiceId] = useState('');
  const [professionalId, setProfessionalId] = useState(lockedProfessionalId || '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [status, setStatus] = useState<AppointmentStatus>('confirmed');

  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const today = initialDate || new Date().toISOString().split('T')[0];
    setDate(today);
    setServiceId(services.length > 0 ? services[0].id : '');
    setProfessionalId(lockedProfessionalId || '');
    setTime('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setCustomerNotes('');
    setInternalNotes('');
    setStatus('confirmed');
    setError(null);
  }, [isOpen, initialDate, services, lockedProfessionalId]);

  // Load available slots when service, professional or date changes
  useEffect(() => {
    if (!serviceId || !date) {
      setAvailableSlots([]);
      return;
    }

    const loadSlots = async () => {
      try {
        setLoadingSlots(true);
        setSlotsError(null);
        // Note: For tenant admin, we fetch slots or calculate
        const tenant = JSON.parse(localStorage.getItem('saas_current_tenant') || '{}');
        const slug = tenantSlug || tenant.slug || 'barbearia-prime';
        const res = await api.getPublicAvailableSlots(slug, serviceId, date, professionalId || undefined);
        setAvailableSlots(res.slots || []);
        if (res.slots.length === 0) {
          setSlotsError(res.closedReason || 'Nenhum horário disponível para esta data.');
        }
      } catch (err: any) {
        setSlotsError(err.message || 'Erro ao carregar horários disponíveis.');
        setAvailableSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    };

    loadSlots();
  }, [serviceId, professionalId, date]);

  if (!isOpen) return null;

  const handlePhoneChange = (val: string) => {
    let raw = val.replace(/\D/g, '').substring(0, 11);
    if (raw.length > 10) {
      setCustomerPhone(`(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`);
    } else if (raw.length > 6) {
      setCustomerPhone(`(${raw.slice(0, 2)}) ${raw.slice(2, 6)}-${raw.slice(6)}`);
    } else if (raw.length > 2) {
      setCustomerPhone(`(${raw.slice(0, 2)}) ${raw.slice(2)}`);
    } else {
      setCustomerPhone(raw);
    }
  };

  const selectedService = services.find((s) => s.id === serviceId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setError('O nome do cliente é obrigatório.');
      return;
    }
    if (!customerPhone.trim()) {
      setError('O telefone do cliente é obrigatório.');
      return;
    }
    if (!serviceId) {
      setError('Selecione um serviço.');
      return;
    }
    if (!date || !time) {
      setError('Selecione a data e o horário do agendamento.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Find slot startAt in UTC if available, else construct with Brazil UTC-3 offset
      const slot = availableSlots.find((s) => s.time === time);
      let startAtIso = slot ? slot.startAt : '';
      if (!startAtIso) {
        const [year, month, day] = date.split('-').map(Number);
        const [hour, minute] = time.split(':').map(Number);
        const utcDate = new Date(Date.UTC(year, month - 1, day, hour + 3, minute, 0));
        startAtIso = utcDate.toISOString();
      }

      const appt = await api.createAppointment({
        serviceId,
        professionalId: professionalId || null,
        startAt: startAtIso,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || null,
        customerNotes: customerNotes.trim() || null,
        internalNotes: internalNotes.trim() || null,
        status,
        idempotencyKey: `adm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      });

      onAppointmentCreated(appt);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar agendamento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Novo Agendamento Manual</h3>
              <p className="text-xs text-slate-500">
                Cadastre um horário diretamente para clientes presenciais ou por telefone.
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
        <form id="create-appointment-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Cliente */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-indigo-600" />
              1. Dados do Cliente
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  placeholder="Ex: João da Silva"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  WhatsApp / Telefone *
                </label>
                <input
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={customerPhone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail (opcional)
                </label>
                <input
                  type="email"
                  placeholder="cliente@email.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status Inicial
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="confirmed">Confirmado</option>
                  <option value="pending">Pendente</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Serviço e Profissional */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
              2. Serviço & Especialista
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Serviço *
                </label>
                <select
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  required
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.durationMinutes || 30} min
                      {s.price !== null ? ` - R$ ${s.price.toFixed(2)}` : ''})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Profissional
                </label>
                {lockedProfessionalId ? (
                  <div className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span>
                      {professionals.find((p) => p.id === lockedProfessionalId)?.name || 'Meu Perfil'}
                    </span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                      Atendimento Próprio
                    </span>
                  </div>
                ) : (
                  <select
                    value={professionalId}
                    onChange={(e) => setProfessionalId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
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
          </div>

          {/* Section 3: Data e Horário Disponível */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              3. Data & Horário
            </h4>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Data do Atendimento *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setTime('');
                }}
                className="w-full sm:w-64 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Horários Disponíveis (Calculados pelo sistema) *
              </label>

              {loadingSlots ? (
                <div className="p-6 bg-slate-50 rounded-2xl text-center text-xs text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1 text-indigo-600" />
                  Calculando horários livres...
                </div>
              ) : slotsError ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-700">
                  {slotsError}
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-500 text-center">
                  Nenhum horário livre encontrado para esta data.
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-40 overflow-y-auto p-1">
                  {availableSlots.map((slot) => {
                    const isSelected = time === slot.time;
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={() => setTime(slot.time)}
                        className={`py-2 px-2 text-center rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-600/30'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {slot.time}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Notas */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Notas do Cliente (visíveis se ele consultar)
              </label>
              <textarea
                rows={2}
                placeholder="Observações passadas pelo cliente..."
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Notas Internas (privadas da empresa)
              </label>
              <textarea
                rows={2}
                placeholder="Observações confidenciais visíveis apenas para os administradores..."
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="submit"
            form="create-appointment-form"
            disabled={saving || !time}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Registrando...' : 'Confirmar Agendamento'}
          </button>
        </div>
      </div>
    </div>
  );
};
