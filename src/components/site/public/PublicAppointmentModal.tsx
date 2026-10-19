import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  MessageCircle,
  Copy,
  Check,
} from 'lucide-react';
import { api } from '../../../services/api';
import { PublicService, Professional } from '../../../types/service';
import { Tenant } from '../../../types/saas';
import { AvailableSlot, PublicBookingResult } from '../../../types/appointment';

interface PublicAppointmentModalProps {
  isOpen: boolean;
  tenant: Tenant;
  services: PublicService[];
  preSelectedService?: PublicService | null;
  preSelectedProfessionalId?: string | null;
  primaryColor?: string;
  radiusClass?: string;
  onClose: () => void;
}

type Step = 'service_prof' | 'date_time' | 'customer' | 'success';

export const PublicAppointmentModal: React.FC<PublicAppointmentModalProps> = ({
  isOpen,
  tenant,
  services,
  preSelectedService = null,
  preSelectedProfessionalId = null,
  primaryColor = '#1e293b',
  radiusClass = 'rounded-2xl',
  onClose,
}) => {
  const [step, setStep] = useState<Step>('service_prof');

  // Form Selections
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedProfId, setSelectedProfId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');

  // Customer Data
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  // Slots Loading
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  // Submitting
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<PublicBookingResult['appointment'] | null>(null);

  // Copy code feedback
  const [copiedCode, setCopiedCode] = useState(false);

  // Initialize or reset when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const initialService =
      preSelectedService || (services.length > 0 ? services[0] : null);

    setSelectedServiceId(initialService ? initialService.id : '');
    setSelectedProfId(preSelectedProfessionalId || '');

    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
    setSelectedTime('');

    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setCustomerNotes('');
    setSubmitError(null);
    setBookingResult(null);
    setCopiedCode(false);

    // If pre-selected service is passed, jump straight to date_time step
    if (preSelectedService) {
      setStep('date_time');
    } else {
      setStep('service_prof');
    }
  }, [isOpen, preSelectedService, preSelectedProfessionalId, services]);

  // Selected Service Object
  const selectedService = services.find((s) => s.id === selectedServiceId);

  // Associated professionals for the chosen service
  const availableProfessionals = selectedService?.professionals || [];

  // Reset selected time when service, professional or date changes
  useEffect(() => {
    setSelectedTime('');
  }, [selectedServiceId, selectedProfId, selectedDate]);

  // Load Available Slots whenever Service, Professional or Date changes
  useEffect(() => {
    if (!isOpen || !selectedServiceId || !selectedDate || step === 'success') {
      return;
    }

    let isMounted = true;
    const fetchSlots = async () => {
      try {
        setLoadingSlots(true);
        setSlotsError(null);

        const res = await api.getPublicAvailableSlots(
          tenant.slug,
          selectedServiceId,
          selectedDate,
          selectedProfId || undefined
        );

        if (isMounted) {
          setAvailableSlots(res.slots || []);
          if (res.slots.length === 0) {
            setSlotsError(
              res.closedReason ||
                'Nenhum horário disponível nesta data. Por favor, escolha outro dia.'
            );
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setSlotsError(err.message || 'Erro ao carregar horários disponíveis.');
          setAvailableSlots([]);
        }
      } finally {
        if (isMounted) setLoadingSlots(false);
      }
    };

    fetchSlots();
    return () => {
      isMounted = false;
    };
  }, [isOpen, tenant.slug, selectedServiceId, selectedProfId, selectedDate]);

  if (!isOpen) return null;

  // Format phone mask
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

  // Submit booking
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setSubmitError('Por favor, informe seu nome completo.');
      return;
    }
    if (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 10) {
      setSubmitError('Por favor, informe um telefone de contato válido com DDD.');
      return;
    }
    if (!selectedTime) {
      setSubmitError('Por favor, selecione um horário para o agendamento.');
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError(null);

      // Find slot to send accurate startAt ISO with Brazil UTC-3 offset
      const slot = availableSlots.find((s) => s.time === selectedTime);
      let startAtIso = slot ? slot.startAt : '';
      if (!startAtIso) {
        const [year, month, day] = selectedDate.split('-').map(Number);
        const [hour, minute] = selectedTime.split(':').map(Number);
        const utcDate = new Date(Date.UTC(year, month - 1, day, hour + 3, minute, 0));
        startAtIso = utcDate.toISOString();
      }

      // Unique idempotency key to prevent double submits
      const idempotencyKey = `pub-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const res = await api.bookPublicAppointment(tenant.slug, {
        serviceId: selectedServiceId,
        professionalId: selectedProfId || null,
        startAt: startAtIso,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || null,
        customerNotes: customerNotes.trim() || null,
        idempotencyKey,
      });

      if (res.success && res.appointment) {
        setBookingResult(res.appointment);
        setStep('success');

        // Automatically open WhatsApp with booking details
        if (res.appointment.whatsappDirectUrl) {
          window.open(res.appointment.whatsappDirectUrl, '_blank');
        }
      } else {
        throw new Error('Não foi possível confirmar o agendamento.');
      }
    } catch (err: any) {
      console.error('[BOOKING] Error:', err);
      setSubmitError(
        err.message ||
          'Este horário acabou de ser reservado ou está indisponível. Por favor, selecione outro horário.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Copy code helper
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // Next 7 days quick dates
  const nextDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      iso: d.toISOString().split('T')[0],
      dayName: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'short' }),
      dayNumber: d.getDate(),
      month: d.toLocaleDateString('pt-BR', { month: 'short' }),
    };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div
        className={`bg-white max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${radiusClass}`}
      >
        {/* Header */}
        <div className="p-5 md:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xs font-bold text-sm"
              style={{ backgroundColor: primaryColor }}
            >
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">Agendar Horário Online</h3>
              <p className="text-xs text-slate-500">{tenant.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Progress (if not in success) */}
        {step !== 'success' && (
          <div className="px-6 py-3 bg-slate-50/40 border-b border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 'service_prof'
                    ? 'bg-slate-900 text-white'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                1
              </span>
              <span className={step === 'service_prof' ? 'font-bold text-slate-900' : 'text-slate-500'}>
                Serviço
              </span>
            </div>

            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />

            <div className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 'date_time'
                    ? 'bg-slate-900 text-white'
                    : step === 'customer'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                2
              </span>
              <span className={step === 'date_time' ? 'font-bold text-slate-900' : 'text-slate-500'}>
                Data & Hora
              </span>
            </div>

            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />

            <div className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 'customer' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'
                }`}
              >
                3
              </span>
              <span className={step === 'customer' ? 'font-bold text-slate-900' : 'text-slate-500'}>
                Seus Dados
              </span>
            </div>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
          {submitError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* STEP 1: SERVICE & PROFESSIONAL */}
          {step === 'service_prof' && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Escolha o Serviço Desejado
                </label>
                <div className="grid grid-cols-1 gap-2.5 max-h-60 overflow-y-auto pr-1">
                  {services.map((s) => {
                    const isSelected = s.id === selectedServiceId;
                    return (
                      <div
                        key={s.id}
                        onClick={() => {
                          setSelectedServiceId(s.id);
                          setSelectedProfId('');
                        }}
                        className={`p-3.5 border rounded-2xl cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/60 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <span className="font-extrabold text-sm text-slate-900 block">{s.name}</span>
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            {s.durationMinutes && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400" />
                                {s.durationMinutes} min
                              </span>
                            )}
                            {s.price !== null && s.price !== undefined && (
                              <span className="font-bold text-slate-700">
                                {Number(s.price).toLocaleString('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                })}
                              </span>
                            )}
                          </div>
                        </div>

                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-300'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Professional Selection */}
              {availableProfessionals.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                    Profissional de Atendimento
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedProfId('')}
                      className={`p-3 border rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                        selectedProfId === ''
                          ? 'border-indigo-600 bg-indigo-50/60 text-indigo-900'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      Qualquer profissional disponível
                    </button>

                    {availableProfessionals.map((p) => {
                      const isSelected = p.id === selectedProfId;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedProfId(p.id)}
                          className={`p-2.5 border rounded-xl flex items-center gap-2.5 text-left text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-50/60 text-indigo-900'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="w-7 h-7 rounded-full bg-slate-200 overflow-hidden shrink-0 flex items-center justify-center text-[10px] text-slate-700">
                            {p.photoUrl ? (
                              <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              p.name.substring(0, 1)
                            )}
                          </div>
                          <span className="truncate">{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: DATE & TIME */}
          {step === 'date_time' && (
            <div className="space-y-5">
              {/* Service Recap Header */}
              {selectedService && (
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="font-extrabold text-slate-900 block">{selectedService.name}</span>
                    <span className="text-slate-500">
                      {selectedService.durationMinutes} minutos{' '}
                      {selectedProfId
                        ? `• Com ${availableProfessionals.find((p) => p.id === selectedProfId)?.name || 'Profissional'}`
                        : '• Qualquer profissional'}
                    </span>
                  </div>
                  <button
                    onClick={() => setStep('service_prof')}
                    className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                  >
                    Alterar
                  </button>
                </div>
              )}

              {/* Quick Date Pills */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  1. Selecione o Dia
                </label>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {nextDates.map((item) => {
                    const isSelected = item.iso === selectedDate;
                    return (
                      <button
                        key={item.iso}
                        type="button"
                        onClick={() => setSelectedDate(item.iso)}
                        className={`flex flex-col items-center justify-center min-w-[70px] p-2.5 rounded-2xl border transition-all shrink-0 cursor-pointer ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <span className="text-[10px] uppercase font-bold tracking-tight opacity-80">
                          {item.dayName}
                        </span>
                        <span className="text-lg font-black my-0.5">{item.dayNumber}</span>
                        <span className="text-[10px] uppercase font-medium opacity-80">{item.month}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 flex items-center justify-end gap-2 text-xs text-slate-500">
                  <span>Ou escolha no calendário:</span>
                  <input
                    type="date"
                    value={selectedDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                    className="px-2.5 py-1 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Available Time Slots */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>2. Horários Livres para {new Date(selectedDate + 'T12:00:00Z').toLocaleDateString('pt-BR')}</span>
                  {selectedTime && (
                    <span className="text-indigo-600 font-black">Selecionado: {selectedTime}</span>
                  )}
                </label>

                {loadingSlots ? (
                  <div className="py-10 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-100">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mb-2" />
                    <span className="text-xs font-medium">Buscando horários disponíveis...</span>
                  </div>
                ) : slotsError ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs">
                    {slotsError}
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 text-xs text-center">
                    Nenhum horário livre para esta data. Por favor, selecione outro dia acima.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1">
                    {availableSlots.map((slot) => {
                      const isSelected = selectedTime === slot.time;
                      return (
                        <button
                          key={slot.time}
                          type="button"
                          onClick={() => setSelectedTime(slot.time)}
                          className={`py-2.5 px-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-white hover:border-indigo-300 text-slate-800 border-slate-200'
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
          )}

          {/* STEP 3: CUSTOMER DATA */}
          {step === 'customer' && (
            <form id="public-booking-form" onSubmit={handleConfirmBooking} className="space-y-4">
              {/* Summary Card */}
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-2xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between font-black text-slate-900">
                  <span>{selectedService?.name}</span>
                  <span className="text-indigo-700">
                    {new Date(selectedDate + 'T12:00:00Z').toLocaleDateString('pt-BR')} às {selectedTime}
                  </span>
                </div>
                <div className="text-slate-500 flex items-center justify-between">
                  <span>Duração: {selectedService?.durationMinutes} min</span>
                  {selectedService?.price !== null && selectedService?.price !== undefined && (
                    <span className="font-bold text-slate-700">
                      {Number(selectedService.price).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Seu Nome Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João da Silva"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-950 font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Telefone / WhatsApp (com DDD) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="(11) 98765-4321"
                  value={customerPhone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-950 font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-hidden"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Usado para confirmação e envio dos detalhes do atendimento.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  E-mail <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="email"
                  placeholder="joao@exemplo.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-950 font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Observações <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Primeira vez no estabelecimento, preferência de estilo..."
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-950 font-semibold focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-hidden"
                />
              </div>
            </form>
          )}

          {/* STEP 4: SUCCESS CONFIRMATION */}
          {step === 'success' && bookingResult && (
            <div className="py-4 text-center space-y-5 animate-in fade-in duration-200">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h4 className="text-lg font-black text-slate-900">
                  {bookingResult.status === 'confirmed'
                    ? 'Agendamento Confirmado!'
                    : 'Solicitação Enviada com Sucesso!'}
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  {bookingResult.status === 'confirmed'
                    ? 'Seu horário está garantido. Apresente o código abaixo ao comparecer.'
                    : 'O estabelecimento foi notificado e você receberá a confirmação em breve.'}
                </p>
              </div>

              {/* Code Banner */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl max-w-sm mx-auto">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Código de Identificação
                </span>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl font-black text-slate-900 tracking-wider">
                    {bookingResult.code}
                  </span>
                  <button
                    onClick={() => handleCopyCode(bookingResult.code)}
                    className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"
                    title="Copiar código"
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Details card */}
              <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-left text-xs space-y-2 max-w-sm mx-auto">
                <div className="flex justify-between">
                  <span className="text-slate-500">Serviço:</span>
                  <span className="font-bold text-slate-900">{bookingResult.serviceName}</span>
                </div>
                {bookingResult.professionalName && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Profissional:</span>
                    <span className="font-bold text-slate-900">{bookingResult.professionalName}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Data e Hora:</span>
                  <span className="font-bold text-indigo-700">
                    {new Date(bookingResult.startAt).toLocaleDateString('pt-BR')} às{' '}
                    {new Date(bookingResult.startAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                {bookingResult.instructions && (
                  <div className="pt-2 border-t border-indigo-100/80 text-[11px] text-slate-600 italic">
                    {bookingResult.instructions}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          {step === 'service_prof' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!selectedServiceId}
                onClick={() => setStep('date_time')}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer"
              >
                Escolher Data
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 'date_time' && (
            <>
              <button
                type="button"
                onClick={() => setStep('service_prof')}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-white flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </button>
              <button
                type="button"
                disabled={!selectedTime}
                onClick={() => setStep('customer')}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer"
              >
                Preencher Dados
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 'customer' && (
            <>
              <button
                type="button"
                onClick={() => setStep('date_time')}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-white flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </button>
              <button
                type="submit"
                form="public-booking-form"
                disabled={submitting || !customerName || !customerPhone}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 shadow-sm transition-all cursor-pointer"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmar Agendamento
              </button>
            </>
          )}

          {step === 'success' && (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Concluir
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
