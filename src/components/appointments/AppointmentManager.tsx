import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Users,
  Search,
  Plus,
  Lock,
  Settings,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertCircle,
  XCircle,
  HelpCircle,
  Phone,
  MessageCircle,
  Briefcase,
  Loader2,
  CalendarDays,
  ListFilter,
  LayoutGrid,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { Tenant } from '../../types/saas';
import { Service, Professional } from '../../types/service';
import {
  Appointment,
  AppointmentStatus,
  ScheduleBlock,
} from '../../types/appointment';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { AppointmentCreateModal } from './AppointmentCreateModal';
import { AppointmentSettingsModal } from './AppointmentSettingsModal';
import { ScheduleBlockModal } from './ScheduleBlockModal';
import { AppointmentDetailModal } from './AppointmentDetailModal';
import { ProfessionalAvailabilityModal } from './ProfessionalAvailabilityModal';
import { ProfessionalServicesModal } from './ProfessionalServicesModal';

interface AppointmentManagerProps {
  tenant: Tenant;
}

type ViewMode = 'day' | 'week' | 'list';

export const AppointmentManager: React.FC<AppointmentManagerProps> = ({ tenant }) => {
  const { user, isProfessional, linkedProfessional, refreshSession, logout } = useAuth();

  // Navigation & View State
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [currentDate, setCurrentDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Data
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>(() => {
    return isProfessional && linkedProfessional ? linkedProfessional.id : 'all';
  });
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  const [isMyServicesModalOpen, setIsMyServicesModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // Calculate Date Boundaries based on view
  const { startDate, endDate, weekDays } = useMemo(() => {
    const curr = new Date(currentDate + 'T12:00:00Z');
    if (viewMode === 'day') {
      return {
        startDate: currentDate,
        endDate: currentDate,
        weekDays: [currentDate],
      };
    }

    if (viewMode === 'week') {
      // Find Monday of current week
      const day = curr.getUTCDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(curr);
      monday.setUTCDate(curr.getUTCDate() + diffToMonday);

      const days: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setUTCDate(monday.getUTCDate() + i);
        days.push(d.toISOString().split('T')[0]);
      }

      return {
        startDate: days[0],
        endDate: days[6],
        weekDays: days,
      };
    }

    // List mode: show from current date to 30 days ahead
    const pastDays = new Date(curr);
    pastDays.setUTCDate(curr.getUTCDate() - 7);
    const futureDays = new Date(curr);
    futureDays.setUTCDate(curr.getUTCDate() + 30);

    return {
      startDate: pastDays.toISOString().split('T')[0],
      endDate: futureDays.toISOString().split('T')[0],
      weekDays: [],
    };
  }, [currentDate, viewMode]);

  const loadData = async () => {
    if (isProfessional && !linkedProfessional) {
      setLoading(false);
      setAppointments([]);
      setServices([]);
      setProfessionals([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const targetProfId = isProfessional && linkedProfessional
        ? linkedProfessional.id
        : selectedProfessionalId !== 'all'
        ? selectedProfessionalId
        : undefined;

      const [servicesData, profsData, apptsData] = await Promise.all([
        api.getServices({ active: true }),
        api.getProfessionals({ active: true }),
        api.getAppointments({
          startDate,
          endDate,
          professionalId: targetProfId,
          status: selectedStatus !== 'all' ? (selectedStatus as AppointmentStatus) : undefined,
          search: searchQuery || undefined,
        }),
      ]);

      setServices(servicesData);
      setProfessionals(isProfessional && linkedProfessional ? [linkedProfessional] : profsData);
      setAppointments(apptsData);
    } catch (err: any) {
      console.error('Error loading agenda data:', err);
      setError(err.message || 'Erro ao carregar dados da agenda.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isProfessional && linkedProfessional) {
      setSelectedProfessionalId(linkedProfessional.id);
    }
  }, [isProfessional, linkedProfessional]);

  useEffect(() => {
    loadData();
  }, [startDate, endDate, selectedProfessionalId, selectedStatus, searchQuery]);

  // Date Navigation Handlers
  const handlePrev = () => {
    const d = new Date(currentDate + 'T12:00:00Z');
    if (viewMode === 'day') {
      d.setUTCDate(d.getUTCDate() - 1);
    } else if (viewMode === 'week') {
      d.setUTCDate(d.getUTCDate() - 7);
    } else {
      d.setUTCDate(d.getUTCDate() - 14);
    }
    setCurrentDate(d.toISOString().split('T')[0]);
  };

  const handleNext = () => {
    const d = new Date(currentDate + 'T12:00:00Z');
    if (viewMode === 'day') {
      d.setUTCDate(d.getUTCDate() + 1);
    } else if (viewMode === 'week') {
      d.setUTCDate(d.getUTCDate() + 7);
    } else {
      d.setUTCDate(d.getUTCDate() + 14);
    }
    setCurrentDate(d.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setCurrentDate(new Date().toISOString().split('T')[0]);
  };

  // Metrics counters for today
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAppointments = useMemo(() => {
    return appointments.filter((a) => a.startAt.startsWith(todayStr));
  }, [appointments, todayStr]);

  const metrics = useMemo(() => {
    const pending = appointments.filter((a) => a.status === 'pending').length;
    const confirmed = appointments.filter((a) => a.status === 'confirmed').length;
    const completed = appointments.filter((a) => a.status === 'completed').length;
    return {
      total: appointments.length,
      todayTotal: todayAppointments.length,
      pending,
      confirmed,
      completed,
    };
  }, [appointments, todayAppointments]);

  // Filtered appointments for display
  const filteredAppointments = useMemo(() => {
    return appointments.filter((a) => {
      if (selectedProfessionalId !== 'all' && a.professionalId !== selectedProfessionalId) {
        return false;
      }
      if (selectedStatus !== 'all' && a.status !== selectedStatus) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = a.customerName.toLowerCase().includes(q);
        const matchPhone = a.customerPhone.includes(q);
        const matchCode = a.code.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchCode) return false;
      }
      return true;
    });
  }, [appointments, selectedProfessionalId, selectedStatus, searchQuery]);

  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Pendente
          </span>
        );
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <CheckCircle2 className="w-3 h-3 text-blue-600" />
            Confirmado
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Concluído
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            Cancelado
          </span>
        );
      case 'no_show':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <HelpCircle className="w-3 h-3 text-slate-500" />
            Não compareceu
          </span>
        );
    }
  };

  const formatHeaderDate = () => {
    if (viewMode === 'day') {
      const d = new Date(currentDate + 'T12:00:00Z');
      const isToday = currentDate === todayStr;
      return `${isToday ? 'Hoje, ' : ''}${d.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })}`;
    }
    if (viewMode === 'week') {
      const start = new Date(startDate + 'T12:00:00Z');
      const end = new Date(endDate + 'T12:00:00Z');
      return `Semana de ${start.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
      })} a ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    }
    return 'Próximos Agendamentos';
  };

  if (isProfessional && !linkedProfessional) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center mb-5 shadow-sm">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Vínculo de Profissional Pendente</h2>
        <p className="text-xs text-slate-600 leading-relaxed mb-6">
          Seu usuário ({user?.email}) possui perfil de <strong>Profissional</strong>, mas ainda não está associado a nenhum cadastro de profissional deste estabelecimento.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left text-xs text-amber-900 mb-6 space-y-2 w-full">
          <p className="font-bold flex items-center gap-1.5 text-amber-950">
            <span>Orientação de Acesso</span>
          </p>
          <p>
            Por favor, solicite ao <strong>administrador do estabelecimento</strong> que acesse o módulo <strong>Profissionais</strong> no painel de gestão, edite o seu cadastro e selecione seu usuário no campo <em>&quot;Vincular Usuário do Sistema&quot;</em>.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={() => refreshSession()}
            className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Verificar Novamente
          </button>
          <button
            onClick={() => logout()}
            className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
          >
            Sair da Conta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                {isProfessional ? 'Minha Agenda' : 'Agenda & Agendamentos'}
              </h1>
              <p className="text-xs text-slate-500">
                {isProfessional
                  ? `${linkedProfessional?.name || user?.name} • Seus agendamentos e horários exclusivos de atendimento`
                  : 'Gerencie horários, disponibilidade da equipe e solicitações de clientes em tempo real.'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isProfessional && linkedProfessional ? (
            <>
              <button
                onClick={() => setIsAvailabilityModalOpen(true)}
                className="px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                title="Configurar seus dias e horários de atendimento e consultar políticas"
              >
                <Clock className="w-4 h-4 text-indigo-600" />
                Meus Horários
              </button>

              <button
                onClick={() => setIsMyServicesModalOpen(true)}
                className="px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                title="Adicionar ou remover serviços que você realiza"
              >
                <Briefcase className="w-4 h-4 text-indigo-600" />
                Meus Serviços
              </button>

              <button
                onClick={() => setIsBlockModalOpen(true)}
                className="px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                title="Bloquear horários de folgas, consultas ou ausências pessoais"
              >
                <Lock className="w-4 h-4 text-slate-500" />
                Bloqueios & Pausas
              </button>

              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer hover:shadow-indigo-500/20 hover:shadow-md"
              >
                <Plus className="w-4 h-4" />
                Novo Agendamento
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                title="Configurar horários de funcionamento, intervalos e regras"
              >
                <Settings className="w-4 h-4 text-slate-500" />
                Configurações
              </button>

              <button
                onClick={() => setIsBlockModalOpen(true)}
                className="px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                title="Bloquear horários de folgas, reuniões ou ausências"
              >
                <Lock className="w-4 h-4 text-slate-500" />
                Bloqueios & Folgas
              </button>

              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer hover:shadow-indigo-500/20 hover:shadow-md"
              >
                <Plus className="w-4 h-4" />
                Novo Agendamento
              </button>
            </>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Total Período
          </span>
          <div className="text-2xl font-black text-slate-900">{metrics.total}</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block mb-1 flex items-center gap-1">
            {metrics.pending > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
            Pendentes
          </span>
          <div className="text-2xl font-black text-amber-600">{metrics.pending}</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block mb-1">
            Confirmados
          </span>
          <div className="text-2xl font-black text-blue-600">{metrics.confirmed}</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block mb-1">
            Concluídos
          </span>
          <div className="text-2xl font-black text-emerald-600">{metrics.completed}</div>
        </div>
      </div>

      {/* Date Navigation & Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Navigation Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
            title="Período anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={handleToday}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Hoje
          </button>

          <button
            onClick={handleNext}
            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
            title="Próximo período"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <span className="text-sm font-black text-slate-800 ml-2 capitalize">
            {formatHeaderDate()}
          </span>

          <input
            type="date"
            value={currentDate}
            onChange={(e) => e.target.value && setCurrentDate(e.target.value)}
            className="ml-2 px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          />
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start md:self-auto">
          <button
            onClick={() => setViewMode('day')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'day'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dia
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'week'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semana
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'list'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Lista
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Professional indicator/filter */}
          {isProfessional ? (
            <div className="flex items-center gap-2 px-3.5 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-700 shadow-xs">
              <User className="w-4 h-4 text-indigo-600" />
              <span>{linkedProfessional?.name || user?.name}</span>
              <span className="text-[10px] bg-indigo-200/60 text-indigo-800 px-2 py-0.5 rounded-full font-medium">
                Atendimento Pessoal
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={selectedProfessionalId}
                onChange={(e) => setSelectedProfessionalId(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Todos os Profissionais</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Todos os Status</option>
              <option value="pending">Pendentes</option>
              <option value="confirmed">Confirmados</option>
              <option value="completed">Concluídos</option>
              <option value="cancelled">Cancelados</option>
              <option value="no_show">Não Compareceu</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por cliente, telefone ou código..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
          </div>
        </div>

        <button
          onClick={loadData}
          className="p-2 border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
          title="Atualizar lista"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-16 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
          <p className="text-xs font-semibold">Carregando agendamentos...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-bold">Erro ao carregar dados da agenda</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      ) : (
        <>
          {/* DAY VIEW */}
          {viewMode === 'day' && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-xs font-bold text-slate-700">
                  Agendamentos para {new Date(currentDate + 'T12:00:00Z').toLocaleDateString('pt-BR')} (
                  {filteredAppointments.length})
                </span>
              </div>

              {filteredAppointments.length === 0 ? (
                <div className="p-16 text-center text-slate-400">
                  <CalendarDays className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="font-bold text-slate-700 text-sm">Nenhum agendamento neste dia</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Não há atendimentos cadastrados ou que correspondam aos filtros selecionados para esta data.
                  </p>
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="mt-4 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    + Criar Agendamento Manual
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredAppointments.map((appt) => {
                    const start = new Date(appt.startAt);
                    const end = new Date(appt.endAt);
                    const startTime = start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    const endTime = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    const rawPhone = appt.customerPhone.replace(/\D/g, '');

                    return (
                      <div
                        key={appt.id}
                        onClick={() => setSelectedAppointment(appt)}
                        className="p-4.5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group"
                      >
                        {/* Time & Service Info */}
                        <div className="flex items-start gap-4">
                          <div className="w-20 text-center py-2 px-2.5 bg-indigo-50/70 border border-indigo-100 rounded-xl shrink-0 group-hover:bg-indigo-100/70 transition-colors">
                            <span className="text-xs font-black text-indigo-900 block">{startTime}</span>
                            <span className="text-[10px] font-semibold text-indigo-600 block">{endTime}</span>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-sm text-slate-900 hover:text-indigo-600 transition-colors">
                                {appt.customerName}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                {appt.code}
                              </span>
                              {getStatusBadge(appt.status)}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                              <span className="flex items-center gap-1 font-medium text-slate-700">
                                <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                                {appt.serviceName} ({appt.durationMinutes} min)
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="w-3.5 h-3.5 text-slate-400" />
                                {appt.professionalName || 'Sem profissional fixo'}
                              </span>
                              <span className="flex items-center gap-1">
                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                {appt.customerPhone}
                              </span>
                            </div>

                            {appt.customerNotes && (
                              <p className="text-[11px] text-slate-500 italic">
                                Obs cliente: "{appt.customerNotes}"
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 self-end sm:self-center" onClick={(e) => e.stopPropagation()}>
                          {rawPhone && (
                            <a
                              href={`https://wa.me/55${rawPhone}?text=${encodeURIComponent(
                                `Olá ${appt.customerName}! Entramos em contato referente ao seu agendamento ${appt.code} na ${tenant.name}.`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer"
                              title="Chamar cliente no WhatsApp"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </a>
                          )}

                          <button
                            onClick={() => setSelectedAppointment(appt)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Detalhes
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* WEEK VIEW */}
          {viewMode === 'week' && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                {weekDays.map((dateStr) => {
                  const d = new Date(dateStr + 'T12:00:00Z');
                  const isToday = dateStr === todayStr;
                  const dayAppts = filteredAppointments.filter((a) => a.startAt.startsWith(dateStr));

                  return (
                    <div key={dateStr} className="min-h-[350px] flex flex-col bg-white">
                      {/* Day Header */}
                      <div
                        className={`p-3 text-center border-b border-slate-100 ${
                          isToday ? 'bg-indigo-50/80' : 'bg-slate-50/50'
                        }`}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider block text-slate-400">
                          {d.toLocaleDateString('pt-BR', { weekday: 'short' })}
                        </span>
                        <span
                          className={`text-sm font-black inline-block mt-0.5 ${
                            isToday ? 'text-indigo-600' : 'text-slate-800'
                          }`}
                        >
                          {d.getDate()}{' '}
                          <span className="text-[10px] font-medium text-slate-400">
                            {d.toLocaleDateString('pt-BR', { month: 'short' })}
                          </span>
                        </span>
                        <span className="text-[10px] block text-slate-400 mt-0.5">
                          {dayAppts.length} {dayAppts.length === 1 ? 'atendimento' : 'atendimentos'}
                        </span>
                      </div>

                      {/* Day Appointments List */}
                      <div className="p-2 flex-1 space-y-2 overflow-y-auto max-h-[500px]">
                        {dayAppts.length === 0 ? (
                          <div className="h-full flex items-center justify-center p-4 text-center text-slate-300 text-[11px]">
                            Livre
                          </div>
                        ) : (
                          dayAppts.map((appt) => {
                            const start = new Date(appt.startAt);
                            const startTime = start.toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            });

                            return (
                              <div
                                key={appt.id}
                                onClick={() => setSelectedAppointment(appt)}
                                className="p-2.5 bg-slate-50 hover:bg-indigo-50/60 border border-slate-200/80 hover:border-indigo-200 rounded-xl text-left transition-all cursor-pointer group space-y-1"
                              >
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-black text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                                    {startTime}
                                  </span>
                                  {getStatusBadge(appt.status)}
                                </div>
                                <div className="font-bold text-xs text-slate-900 truncate">
                                  {appt.customerName}
                                </div>
                                <div className="text-[10px] text-slate-500 truncate">
                                  {appt.serviceName}
                                </div>
                                {appt.professionalName && (
                                  <div className="text-[9px] text-slate-400 truncate flex items-center gap-1">
                                    <User className="w-2.5 h-2.5" />
                                    {appt.professionalName}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* LIST VIEW */}
          {viewMode === 'list' && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-xs font-bold text-slate-700">
                  Lista Completa de Agendamentos ({filteredAppointments.length})
                </span>
              </div>

              {filteredAppointments.length === 0 ? (
                <div className="p-16 text-center text-slate-400">
                  <ListFilter className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="font-bold text-slate-700 text-sm">Nenhum agendamento encontrado</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Experimente ajustar os filtros ou selecionar outra data.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                        <th className="py-3 px-4">Código / Data</th>
                        <th className="py-3 px-4">Horário</th>
                        <th className="py-3 px-4">Cliente</th>
                        <th className="py-3 px-4">Serviço</th>
                        <th className="py-3 px-4">Profissional</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAppointments.map((appt) => {
                        const start = new Date(appt.startAt);
                        const end = new Date(appt.endAt);
                        const formattedDate = start.toLocaleDateString('pt-BR');
                        const startTime = start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        const endTime = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        const rawPhone = appt.customerPhone.replace(/\D/g, '');

                        return (
                          <tr
                            key={appt.id}
                            onClick={() => setSelectedAppointment(appt)}
                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <td className="py-3.5 px-4">
                              <span className="font-bold text-slate-900 block">{appt.code}</span>
                              <span className="text-[10px] text-slate-400">{formattedDate}</span>
                            </td>

                            <td className="py-3.5 px-4 font-bold text-indigo-700">
                              {startTime} - {endTime}
                            </td>

                            <td className="py-3.5 px-4">
                              <span className="font-bold text-slate-900 block">{appt.customerName}</span>
                              <span className="text-[10px] text-slate-400">{appt.customerPhone}</span>
                            </td>

                            <td className="py-3.5 px-4">
                              <span className="font-semibold text-slate-800 block">{appt.serviceName}</span>
                              <span className="text-[10px] text-slate-400">{appt.durationMinutes} min</span>
                            </td>

                            <td className="py-3.5 px-4 text-slate-600">
                              {appt.professionalName || 'Qualquer profissional'}
                            </td>

                            <td className="py-3.5 px-4">{getStatusBadge(appt.status)}</td>

                            <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                {rawPhone && (
                                  <a
                                    href={`https://wa.me/55${rawPhone}?text=${encodeURIComponent(
                                      `Olá ${appt.customerName}! Entramos em contato referente ao seu agendamento ${appt.code}.`
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                    title="WhatsApp"
                                  >
                                    <MessageCircle className="w-4 h-4" />
                                  </a>
                                )}
                                <button
                                  onClick={() => setSelectedAppointment(appt)}
                                  className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                  title="Ver Detalhes"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <AppointmentCreateModal
        isOpen={isCreateModalOpen}
        services={
          isProfessional && linkedProfessional && linkedProfessional.serviceIds && linkedProfessional.serviceIds.length > 0
            ? services.filter((s) => linkedProfessional.serviceIds!.includes(s.id))
            : services
        }
        professionals={isProfessional && linkedProfessional ? [linkedProfessional] : professionals}
        lockedProfessionalId={isProfessional && linkedProfessional ? linkedProfessional.id : undefined}
        initialDate={currentDate}
        tenantSlug={tenant.slug}
        onClose={() => setIsCreateModalOpen(false)}
        onAppointmentCreated={(newAppt) => {
          setAppointments((prev) => [newAppt, ...prev]);
          setIsCreateModalOpen(false);
        }}
      />

      {!isProfessional && (
        <AppointmentSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          onSaved={() => {
            setIsSettingsModalOpen(false);
            loadData();
          }}
        />
      )}

      {isProfessional && linkedProfessional && (
        <>
          <ProfessionalAvailabilityModal
            isOpen={isAvailabilityModalOpen}
            onClose={() => setIsAvailabilityModalOpen(false)}
            professional={linkedProfessional}
            tenant={tenant}
            onSaved={() => loadData()}
          />

          <ProfessionalServicesModal
            isOpen={isMyServicesModalOpen}
            onClose={() => setIsMyServicesModalOpen(false)}
            professional={linkedProfessional}
            onSaved={() => {
              loadData();
              refreshSession();
            }}
          />
        </>
      )}

      <ScheduleBlockModal
        isOpen={isBlockModalOpen}
        professionals={isProfessional && linkedProfessional ? [linkedProfessional] : professionals}
        lockedProfessionalId={isProfessional && linkedProfessional ? linkedProfessional.id : undefined}
        onClose={() => setIsBlockModalOpen(false)}
        onBlockSaved={() => {
          setIsBlockModalOpen(false);
          loadData();
        }}
      />

      <AppointmentDetailModal
        isOpen={!!selectedAppointment}
        appointment={selectedAppointment}
        professionals={isProfessional && linkedProfessional ? [linkedProfessional] : professionals}
        tenantSlug={tenant.slug}
        onClose={() => setSelectedAppointment(null)}
        onAppointmentUpdated={(updated) => {
          setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
          setSelectedAppointment(updated);
        }}
      />
    </div>
  );
};
