// ==============================================================================
// APPOINTMENTS & SCHEDULING REPOSITORY (ETAPA 4B)
// Multi-tenant architecture with conflict prevention, atomic bookings & RLS
// ==============================================================================

import { supabaseAdmin } from '../supabaseAdmin.js';
import { repo } from './repository.js';
import { canTenantOperate } from '../tenantResolver.js';
import type { User } from '../../src/types/saas.js';
import type {
  Appointment,
  AppointmentSettings,
  AppointmentStatus,
  AvailableSlot,
  AvailableSlotsResponse,
  CreateAppointmentPayload,
  CreateScheduleBlockPayload,
  DaySchedule,
  ProfessionalSchedule,
  RescheduleAppointmentPayload,
  SaveProfessionalSchedulePayload,
  ScheduleBlock,
  UpdateAppointmentSettingsPayload,
  WeeklyBusinessHours,
} from '../../src/types/appointment.js';

const DEFAULT_BUSINESS_HOURS: WeeklyBusinessHours = {
  seg: { isOpen: true, intervals: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }] },
  ter: { isOpen: true, intervals: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }] },
  qua: { isOpen: true, intervals: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }] },
  qui: { isOpen: true, intervals: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }] },
  sex: { isOpen: true, intervals: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }] },
  sab: { isOpen: true, intervals: [{ start: '09:00', end: '14:00' }] },
  dom: { isOpen: false, intervals: [] },
};

export class AppointmentRepository {
  // ==========================================
  // 1. APPOINTMENT SETTINGS
  // ==========================================

  public async getSettings(tenantId: string): Promise<AppointmentSettings> {
    const { data } = await supabaseAdmin
      .from('appointment_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (data) {
      return this.mapSettings(data);
    }

    // Default initialization
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    const defaultRecord = {
      id: newId,
      tenant_id: tenantId,
      timezone: 'America/Sao_Paulo',
      min_booking_notice_hours: 1,
      max_booking_advance_days: 30,
      buffer_between_appointments_minutes: 0,
      business_hours: DEFAULT_BUSINESS_HOURS,
      allow_customer_cancellation: true,
      cancellation_notice_hours: 2,
      public_booking_enabled: true,
      auto_confirm_bookings: false,
      notification_instructions: 'Chegue com 10 minutos de antecedência. Em caso de imprevisto, avise com antecedência.',
      created_at: now,
      updated_at: now,
    };

    await supabaseAdmin.from('appointment_settings').insert(defaultRecord);
    return this.mapSettings(defaultRecord);
  }

  public async updateSettings(
    tenantId: string,
    payload: UpdateAppointmentSettingsPayload,
    actor: User
  ): Promise<AppointmentSettings> {
    await this.getSettings(tenantId); // Ensure exists

    const patch: any = { updated_at: new Date().toISOString() };
    if (payload.timezone !== undefined) patch.timezone = payload.timezone.trim();
    if (payload.minBookingNoticeHours !== undefined) {
      const val = Number(payload.minBookingNoticeHours);
      if (isNaN(val) || val < 0) throw new Error('Antecedência mínima deve ser um número não negativo.');
      patch.min_booking_notice_hours = val;
    }
    if (payload.maxBookingAdvanceDays !== undefined) {
      const val = Number(payload.maxBookingAdvanceDays);
      if (isNaN(val) || val < 1) throw new Error('Antecedência máxima deve ser de pelo menos 1 dia.');
      patch.max_booking_advance_days = val;
    }
    if (payload.bufferBetweenAppointmentsMinutes !== undefined) {
      const val = Number(payload.bufferBetweenAppointmentsMinutes);
      if (isNaN(val) || val < 0) throw new Error('Intervalo entre atendimentos deve ser não negativo.');
      patch.buffer_between_appointments_minutes = val;
    }
    if (payload.businessHours !== undefined) {
      patch.business_hours = payload.businessHours;
    }
    if (payload.allowCustomerCancellation !== undefined) {
      patch.allow_customer_cancellation = payload.allowCustomerCancellation === true;
    }
    if (payload.cancellationNoticeHours !== undefined) {
      const val = Number(payload.cancellationNoticeHours);
      if (isNaN(val) || val < 0) throw new Error('Prazo de cancelamento deve ser não negativo.');
      patch.cancellation_notice_hours = val;
    }
    if (payload.publicBookingEnabled !== undefined) {
      patch.public_booking_enabled = payload.publicBookingEnabled === true;
    }
    if (payload.autoConfirmBookings !== undefined) {
      patch.auto_confirm_bookings = payload.autoConfirmBookings === true;
    }
    if (payload.notificationInstructions !== undefined) {
      patch.notification_instructions = payload.notificationInstructions ? payload.notificationInstructions.trim() : null;
    }

    const { error } = await supabaseAdmin
      .from('appointment_settings')
      .update(patch)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new Error(`Erro ao atualizar configurações da agenda: ${error.message}`);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'APPOINTMENT_SETTINGS_UPDATE' as any,
      entity: 'appointment_settings',
      entityId: tenantId,
      metadata: patch,
    });

    return await this.getSettings(tenantId);
  }

  // ==========================================
  // 2. PROFESSIONAL SCHEDULES
  // ==========================================

  public async listProfessionalSchedules(tenantId: string): Promise<ProfessionalSchedule[]> {
    const { data: profs } = await supabaseAdmin
      .from('professionals')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('active', true);

    const { data: schedules } = await supabaseAdmin
      .from('professional_schedules')
      .select('*')
      .eq('tenant_id', tenantId);

    const scheduleMap: Record<string, any> = {};
    (schedules || []).forEach((s: any) => {
      scheduleMap[s.professional_id] = s;
    });

    return (profs || []).map((p: any) => {
      const s = scheduleMap[p.id];
      if (s) {
        return {
          id: s.id,
          tenantId: s.tenant_id,
          professionalId: p.id,
          professionalName: p.name,
          useBusinessHours: s.use_business_hours !== false,
          customHours: s.custom_hours || null,
          active: s.active !== false,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        };
      }
      return {
        id: `default-${p.id}`,
        tenantId,
        professionalId: p.id,
        professionalName: p.name,
        useBusinessHours: true,
        customHours: null,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  public async saveProfessionalSchedule(
    tenantId: string,
    payload: SaveProfessionalSchedulePayload,
    actor: User
  ): Promise<ProfessionalSchedule> {
    // Validate professional belongs to tenant
    const { data: prof } = await supabaseAdmin
      .from('professionals')
      .select('id, name')
      .eq('id', payload.professionalId)
      .eq('tenant_id', tenantId)
      .single();

    if (!prof) {
      throw new Error('Profissional não encontrado nesta empresa.');
    }

    const { data: existing } = await supabaseAdmin
      .from('professional_schedules')
      .select('id')
      .eq('professional_id', payload.professionalId)
      .single();

    const now = new Date().toISOString();
    const record = {
      tenant_id: tenantId,
      professional_id: payload.professionalId,
      use_business_hours: payload.useBusinessHours !== false,
      custom_hours: payload.useBusinessHours ? null : payload.customHours || DEFAULT_BUSINESS_HOURS,
      active: payload.active !== false,
      updated_at: now,
    };

    if (existing) {
      await supabaseAdmin
        .from('professional_schedules')
        .update(record)
        .eq('id', existing.id);
    } else {
      await supabaseAdmin.from('professional_schedules').insert({
        id: crypto.randomUUID(),
        ...record,
        created_at: now,
      });
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'PROFESSIONAL_SCHEDULE_UPDATE' as any,
      entity: 'professional_schedules',
      entityId: payload.professionalId,
      metadata: { professionalName: prof.name, useBusinessHours: payload.useBusinessHours },
    });

    const list = await this.listProfessionalSchedules(tenantId);
    return list.find((s) => s.professionalId === payload.professionalId)!;
  }

  // ==========================================
  // 3. SCHEDULE BLOCKS (BLOQUEIOS E FOLGAS)
  // ==========================================

  public async listScheduleBlocks(
    tenantId: string,
    filters?: { professionalId?: string; start?: string; end?: string }
  ): Promise<ScheduleBlock[]> {
    let query = supabaseAdmin
      .from('schedule_blocks')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('start_at', { ascending: true });

    if (filters?.professionalId) {
      query = query.eq('professional_id', filters.professionalId);
    }

    const { data } = await query;

    // Fetch professional names
    const { data: profs } = await supabaseAdmin
      .from('professionals')
      .select('id, name')
      .eq('tenant_id', tenantId);

    const profMap: Record<string, string> = {};
    (profs || []).forEach((p: any) => {
      profMap[p.id] = p.name;
    });

    return (data || []).map((b: any) => ({
      id: b.id,
      tenantId: b.tenant_id,
      professionalId: b.professional_id || null,
      professionalName: b.professional_id ? profMap[b.professional_id] || null : 'Toda a Empresa',
      title: b.title,
      startAt: b.start_at,
      endAt: b.end_at,
      isAllDay: b.is_all_day === true,
      notes: b.notes || null,
      createdAt: b.created_at,
      updatedAt: b.updated_at,
    }));
  }

  public async createScheduleBlock(
    tenantId: string,
    payload: CreateScheduleBlockPayload,
    actor: User
  ): Promise<ScheduleBlock> {
    if (!payload.title || !payload.title.trim()) {
      throw new Error('O título do bloqueio é obrigatório.');
    }

    const start = new Date(payload.startAt);
    const end = new Date(payload.endAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Datas de início e fim inválidas.');
    }
    if (end <= start) {
      throw new Error('A data/hora de término deve ser posterior à data/hora de início.');
    }

    if (payload.professionalId) {
      const { data: prof } = await supabaseAdmin
        .from('professionals')
        .select('id')
        .eq('id', payload.professionalId)
        .eq('tenant_id', tenantId)
        .single();

      if (!prof) {
        throw new Error('Profissional não encontrado nesta empresa.');
      }
    }

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    const record = {
      id: newId,
      tenant_id: tenantId,
      professional_id: payload.professionalId || null,
      title: payload.title.trim(),
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      is_all_day: payload.isAllDay === true,
      notes: payload.notes ? payload.notes.trim() : null,
      created_at: now,
      updated_at: now,
    };

    const { error } = await supabaseAdmin.from('schedule_blocks').insert(record);
    if (error) {
      throw new Error(`Erro ao criar bloqueio: ${error.message}`);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'SCHEDULE_BLOCK_CREATE' as any,
      entity: 'schedule_blocks',
      entityId: newId,
      metadata: { title: record.title, start_at: record.start_at, end_at: record.end_at },
    });

    const blocks = await this.listScheduleBlocks(tenantId);
    return blocks.find((b) => b.id === newId)!;
  }

  public async deleteScheduleBlock(id: string, tenantId: string, actor: User): Promise<void> {
    const { data: existing } = await supabaseAdmin
      .from('schedule_blocks')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (!existing) {
      throw new Error('Bloqueio não encontrado.');
    }

    const { error } = await supabaseAdmin
      .from('schedule_blocks')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new Error(`Erro ao excluir bloqueio: ${error.message}`);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'SCHEDULE_BLOCK_DELETE' as any,
      entity: 'schedule_blocks',
      entityId: id,
      metadata: { title: existing.title },
    });
  }

  // ==========================================
  // 4. AVAILABLE SLOTS CALCULATION (DISPONIBILIDADE)
  // ==========================================

  public async getAvailableSlots(
    tenantId: string,
    serviceId: string,
    dateStr: string, // YYYY-MM-DD
    requestedProfessionalId?: string
  ): Promise<AvailableSlotsResponse> {
    // 1. Fetch Service & Settings
    const { data: service } = await supabaseAdmin
      .from('services')
      .select('id, name, duration_minutes, active, booking_enabled')
      .eq('id', serviceId)
      .eq('tenant_id', tenantId)
      .single();

    if (!service || !service.active || !service.booking_enabled) {
      return {
        date: dateStr,
        slots: [],
        isOpen: false,
        closedReason: 'Serviço indisponível para agendamento online.',
        timezone: 'America/Sao_Paulo',
      };
    }

    const settings = await this.getSettings(tenantId);
    if (!settings.publicBookingEnabled) {
      return {
        date: dateStr,
        slots: [],
        isOpen: false,
        closedReason: 'Agendamentos online estão temporariamente desativados por este estabelecimento.',
        timezone: settings.timezone,
      };
    }

    // 2. Validate Date
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
      throw new Error('Formato de data inválido. Utilize YYYY-MM-DD.');
    }
    const [year, month, day] = parts;
    const targetDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // Noon UTC

    const now = new Date();
    const minNoticeMs = settings.minBookingNoticeHours * 60 * 60 * 1000;
    const minEarliestBookingTime = new Date(now.getTime() + minNoticeMs);

    const maxAdvanceMs = settings.maxBookingAdvanceDays * 24 * 60 * 60 * 1000;
    const maxBookingDate = new Date(now.getTime() + maxAdvanceMs);

    if (targetDate > maxBookingDate) {
      return {
        date: dateStr,
        slots: [],
        isOpen: false,
        closedReason: `Agendamentos são permitidos com até ${settings.maxBookingAdvanceDays} dias de antecedência.`,
        timezone: settings.timezone,
      };
    }

    // Determine Day of Week ('seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom')
    const dayIndex = targetDate.getUTCDay();
    const dayKeys: Array<'dom' | 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab'> = [
      'dom',
      'seg',
      'ter',
      'qua',
      'qui',
      'sex',
      'sab',
    ];
    const dayKey = dayKeys[dayIndex];

    const daySchedule = settings.businessHours[dayKey];
    if (!daySchedule || !daySchedule.isOpen || !daySchedule.intervals || daySchedule.intervals.length === 0) {
      return {
        date: dateStr,
        slots: [],
        isOpen: false,
        closedReason: 'O estabelecimento não abre nesta data.',
        timezone: settings.timezone,
      };
    }

    // 3. Find Eligible Professionals
    const { data: links } = await supabaseAdmin
      .from('service_professionals')
      .select('professional_id')
      .eq('tenant_id', tenantId)
      .eq('service_id', serviceId);

    const linkedProfIds = (links || []).map((l: any) => l.professional_id);

    const { data: activeProfs } = await supabaseAdmin
      .from('professionals')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('active', true);

    let candidateProfs = (activeProfs || []).filter((p: any) =>
      linkedProfIds.length === 0 ? true : linkedProfIds.includes(p.id)
    );

    if (requestedProfessionalId) {
      candidateProfs = candidateProfs.filter((p: any) => p.id === requestedProfessionalId);
      if (candidateProfs.length === 0) {
        return {
          date: dateStr,
          slots: [],
          isOpen: false,
          closedReason: 'Profissional selecionado não realiza este serviço ou não está disponível.',
          timezone: settings.timezone,
        };
      }
    }

    // 4. Load Custom Schedules for Candidates
    const { data: customSchedules } = await supabaseAdmin
      .from('professional_schedules')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('professional_id', candidateProfs.map((p: any) => p.id).concat(['__none__']));

    const profScheduleMap: Record<string, any> = {};
    (customSchedules || []).forEach((cs: any) => {
      profScheduleMap[cs.professional_id] = cs;
    });

    // 5. Load Existing Appointments on that day (UTC range)
    const dayStartUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const dayEndUtc = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));

    const { data: existingAppts } = await supabaseAdmin
      .from('appointments')
      .select('id, professional_id, start_at, end_at, status')
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'confirmed'])
      .gte('end_at', dayStartUtc.toISOString())
      .lte('start_at', dayEndUtc.toISOString());

    // 6. Load Schedule Blocks on that day
    const { data: blocks } = await supabaseAdmin
      .from('schedule_blocks')
      .select('id, professional_id, start_at, end_at')
      .eq('tenant_id', tenantId)
      .gte('end_at', dayStartUtc.toISOString())
      .lte('start_at', dayEndUtc.toISOString());

    // 7. Calculate Potential Slots
    const duration = service.duration_minutes || 30;
    const buffer = settings.bufferBetweenAppointmentsMinutes || 0;
    const totalSlotSpan = duration + buffer;

    // Use 15-minute resolution
    const stepMinutes = 15;
    const availableSlots: AvailableSlot[] = [];

    // Parse timezone offset for America/Sao_Paulo (UTC-3)
    const tzOffsetHours = -3; // America/Sao_Paulo is UTC-3 standard

    for (const interval of daySchedule.intervals) {
      const [startHour, startMin] = interval.start.split(':').map(Number);
      const [endHour, endMin] = interval.end.split(':').map(Number);

      const intervalStartTotalMin = startHour * 60 + startMin;
      const intervalEndTotalMin = endHour * 60 + endMin;

      for (
        let currentMin = intervalStartTotalMin;
        currentMin + duration <= intervalEndTotalMin;
        currentMin += stepMinutes
      ) {
        const slotHour = Math.floor(currentMin / 60);
        const slotMinute = currentMin % 60;
        const timeStr = `${String(slotHour).padStart(2, '0')}:${String(slotMinute).padStart(2, '0')}`;

        // Build UTC timestamps: local time hour - tzOffsetHours = UTC hour
        const slotStartUtc = new Date(
          Date.UTC(year, month - 1, day, slotHour - tzOffsetHours, slotMinute, 0)
        );
        const slotEndUtc = new Date(slotStartUtc.getTime() + duration * 60 * 1000);

        // Check notice minimum
        if (slotStartUtc < minEarliestBookingTime) {
          continue; // In the past or violates min notice
        }

        // Check which candidates are free in this slot
        const freeProfIds: string[] = [];

        for (const candidate of candidateProfs) {
          const profSched = profScheduleMap[candidate.id];
          if (profSched && profSched.active === false) {
            continue; // Professional inactive
          }

          // If custom hours configured, check if professional is open at this interval
          if (profSched && profSched.use_business_hours === false && profSched.custom_hours) {
            const profDay = profSched.custom_hours[dayKey];
            if (!profDay || !profDay.isOpen || !profDay.intervals || profDay.intervals.length === 0) {
              continue;
            }
            const isWithinProfHours = profDay.intervals.some((i: any) => {
              const [h1, m1] = i.start.split(':').map(Number);
              const [h2, m2] = i.end.split(':').map(Number);
              return currentMin >= h1 * 60 + m1 && currentMin + duration <= h2 * 60 + m2;
            });
            if (!isWithinProfHours) continue;
          }

          // Check Schedule Blocks collision
          const hasBlock = (blocks || []).some((b: any) => {
            if (b.professional_id && b.professional_id !== candidate.id) return false;
            const bStart = new Date(b.start_at).getTime();
            const bEnd = new Date(b.end_at).getTime();
            return slotStartUtc.getTime() < bEnd && slotEndUtc.getTime() > bStart;
          });

          if (hasBlock) continue;

          // Check Existing Appointments collision
          const hasCollision = (existingAppts || []).some((a: any) => {
            if (a.professional_id && a.professional_id !== candidate.id) return false;
            const aStart = new Date(a.start_at).getTime();
            const aEnd = new Date(a.end_at).getTime() + buffer * 60 * 1000;
            return slotStartUtc.getTime() < aEnd && slotEndUtc.getTime() + buffer * 60 * 1000 > aStart;
          });

          if (hasCollision) continue;

          freeProfIds.push(candidate.id);
        }

        // If candidateProfs is empty (no individual professionals required/registered)
        if (candidateProfs.length === 0) {
          const hasCompanyBlock = (blocks || []).some((b: any) => {
            const bStart = new Date(b.start_at).getTime();
            const bEnd = new Date(b.end_at).getTime();
            return slotStartUtc.getTime() < bEnd && slotEndUtc.getTime() > bStart;
          });
          if (hasCompanyBlock) continue;

          const hasCollision = (existingAppts || []).some((a: any) => {
            const aStart = new Date(a.start_at).getTime();
            const aEnd = new Date(a.end_at).getTime() + buffer * 60 * 1000;
            return slotStartUtc.getTime() < aEnd && slotEndUtc.getTime() + buffer * 60 * 1000 > aStart;
          });
          if (hasCollision) continue;

          availableSlots.push({
            time: timeStr,
            startAt: slotStartUtc.toISOString(),
            endAt: slotEndUtc.toISOString(),
            availableProfessionalIds: [],
          });
        } else if (freeProfIds.length > 0) {
          availableSlots.push({
            time: timeStr,
            startAt: slotStartUtc.toISOString(),
            endAt: slotEndUtc.toISOString(),
            availableProfessionalIds: freeProfIds,
          });
        }
      }
    }

    return {
      date: dateStr,
      slots: availableSlots,
      isOpen: availableSlots.length > 0,
      closedReason: availableSlots.length === 0 ? 'Não há horários disponíveis para a data selecionada.' : undefined,
      timezone: settings.timezone,
    };
  }

  // ==========================================
  // 5. ATOMIC APPOINTMENT CREATION (PREVENÇÃO DE CONFLITO)
  // ==========================================

  public async createAppointment(
    tenantId: string,
    payload: CreateAppointmentPayload,
    source: 'public_site' | 'admin',
    actor?: User
  ): Promise<Appointment> {
    if (!payload.customerName || !payload.customerName.trim()) {
      throw new Error('O nome do cliente é obrigatório.');
    }
    if (!payload.customerPhone || !payload.customerPhone.trim()) {
      throw new Error('O telefone do cliente é obrigatório.');
    }
    if (!payload.serviceId) {
      throw new Error('O serviço é obrigatório.');
    }
    if (!payload.startAt) {
      throw new Error('A data e horário do agendamento são obrigatórios.');
    }

    const startAtDate = new Date(payload.startAt);
    if (isNaN(startAtDate.getTime())) {
      throw new Error('Data/hora de início inválida.');
    }

    // 1. Idempotency Check
    if (payload.idempotencyKey && payload.idempotencyKey.trim()) {
      const { data: existing } = await supabaseAdmin
        .from('appointments')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('idempotency_key', payload.idempotencyKey.trim())
        .single();

      if (existing) {
        return (await this.getAppointmentById(existing.id, tenantId))!;
      }
    }

    // 2. Validate Service
    const { data: service } = await supabaseAdmin
      .from('services')
      .select('id, name, price, duration_minutes, active, booking_enabled')
      .eq('id', payload.serviceId)
      .eq('tenant_id', tenantId)
      .single();

    if (!service || !service.active) {
      throw new Error('Serviço não encontrado ou inativo.');
    }
    if (source === 'public_site' && !service.booking_enabled) {
      throw new Error('Este serviço não está habilitado para agendamentos online.');
    }

    const duration = service.duration_minutes || 30;
    const settings = await this.getSettings(tenantId);

    if (source === 'public_site' && !settings.publicBookingEnabled) {
      throw new Error('Os agendamentos online estão desativados por este estabelecimento.');
    }

    const buffer = settings.bufferBetweenAppointmentsMinutes || 0;
    const endAtDate = new Date(startAtDate.getTime() + duration * 60 * 1000);

    // 3. Resolve Professional (if not specified, auto-assign first available)
    let assignedProfId: string | null = payload.professionalId || null;

    if (!assignedProfId) {
      // Find linked professionals for this service
      const { data: links } = await supabaseAdmin
        .from('service_professionals')
        .select('professional_id')
        .eq('tenant_id', tenantId)
        .eq('service_id', payload.serviceId);

      const linkedIds = (links || []).map((l: any) => l.professional_id);

      if (linkedIds.length > 0) {
        // Find which linked professional is free at startAtDate
        const { data: busyAppts } = await supabaseAdmin
          .from('appointments')
          .select('professional_id')
          .eq('tenant_id', tenantId)
          .in('status', ['pending', 'confirmed'])
          .lt('start_at', new Date(endAtDate.getTime() + buffer * 60 * 1000).toISOString())
          .gt('end_at', new Date(startAtDate.getTime() - buffer * 60 * 1000).toISOString());

        const busyIds = new Set((busyAppts || []).map((b: any) => b.professional_id));
        const freeId = linkedIds.find((id: string) => !busyIds.has(id));
        assignedProfId = freeId || linkedIds[0];
      }
    } else {
      // Validate requested professional
      const { data: prof } = await supabaseAdmin
        .from('professionals')
        .select('id, name, active')
        .eq('id', assignedProfId)
        .eq('tenant_id', tenantId)
        .single();

      if (!prof || !prof.active) {
        throw new Error('Profissional selecionado não encontrado ou inativo.');
      }
    }

    // 3.5 Transactional Atomic Execution via PostgreSQL RPC Function 'book_appointment'
    // Uses pg_advisory_xact_lock to prevent concurrent double bookings at the database level
    if (supabaseAdmin.rpc) {
      try {
        const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc('book_appointment', {
          p_tenant_id: tenantId,
          p_service_id: payload.serviceId,
          p_professional_id: assignedProfId,
          p_customer_name: payload.customerName.trim(),
          p_customer_phone: payload.customerPhone.trim(),
          p_customer_email: payload.customerEmail ? payload.customerEmail.trim().toLowerCase() : null,
          p_start_at: startAtDate.toISOString(),
          p_customer_notes: payload.customerNotes ? payload.customerNotes.trim() : null,
          p_idempotency_key: payload.idempotencyKey ? payload.idempotencyKey.trim() : null,
          p_source: source,
        });

        if (rpcErr) {
          if (rpcErr.message && !rpcErr.message.includes('function') && !rpcErr.message.includes('does not exist')) {
            throw new Error(rpcErr.message);
          }
        } else if (rpcResult && rpcResult.appointment_id) {
          if (payload.internalNotes && payload.internalNotes.trim()) {
            await supabaseAdmin
              .from('appointments')
              .update({ internal_notes: payload.internalNotes.trim() })
              .eq('id', rpcResult.appointment_id);
          }
          if (source === 'admin' && payload.status && payload.status !== rpcResult.status) {
            await supabaseAdmin
              .from('appointments')
              .update({ status: payload.status })
              .eq('id', rpcResult.appointment_id);
          }

          await repo.logAudit({
            actorUserId: actor ? actor.id : null,
            actorUserName: actor ? actor.name : 'Cliente (Mini Site)',
            tenantId,
            action: 'APPOINTMENT_CREATE' as any,
            entity: 'appointments',
            entityId: rpcResult.appointment_id,
            metadata: { code: rpcResult.code, serviceName: service.name, start_at: startAtDate.toISOString(), source },
          });

          return (await this.getAppointmentById(rpcResult.appointment_id, tenantId))!;
        }
      } catch (rpcEx: any) {
        if (
          rpcEx.message &&
          (rpcEx.message.includes('reservado por outro cliente') ||
            rpcEx.message.includes('bloqueado ou indisponível') ||
            rpcEx.message.includes('não pertence a esta empresa') ||
            rpcEx.message.includes('não encontrado'))
        ) {
          throw rpcEx;
        }
      }
    }

    // 4. Fallback Conflict Check: Schedule Blocks
    let blockQuery = supabaseAdmin
      .from('schedule_blocks')
      .select('id, title')
      .eq('tenant_id', tenantId)
      .lt('start_at', endAtDate.toISOString())
      .gt('end_at', startAtDate.toISOString());

    if (assignedProfId) {
      blockQuery = blockQuery.or(`professional_id.eq.${assignedProfId},professional_id.is.null`);
    } else {
      blockQuery = blockQuery.is('professional_id', null);
    }

    const { data: blocks } = await blockQuery;
    if (blocks && blocks.length > 0) {
      throw new Error('O horário selecionado está bloqueado ou indisponível.');
    }

    // 5. Conflict Check: Existing Appointments
    let conflictQuery = supabaseAdmin
      .from('appointments')
      .select('id, code')
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'confirmed'])
      .lt('start_at', new Date(endAtDate.getTime() + buffer * 60 * 1000).toISOString())
      .gt('end_at', new Date(startAtDate.getTime() - buffer * 60 * 1000).toISOString());

    if (assignedProfId) {
      conflictQuery = conflictQuery.eq('professional_id', assignedProfId);
    } else {
      conflictQuery = conflictQuery.eq('service_id', payload.serviceId);
    }

    const { data: conflicts } = await conflictQuery;
    if (conflicts && conflicts.length > 0) {
      throw new Error('Este horário acabou de ser reservado por outro cliente. Por favor, escolha outro horário.');
    }

    // 6. Generate readable code and public token
    const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    const now = new Date();
    const yy = String(now.getUTCFullYear()).slice(-2);
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const code = `AG-${yy}${mm}-${randomSuffix}`;
    const publicToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const newId = crypto.randomUUID();

    // Determine initial status
    let initialStatus: AppointmentStatus = 'pending';
    if (source === 'admin' && payload.status) {
      initialStatus = payload.status;
    } else if (settings.autoConfirmBookings) {
      initialStatus = 'confirmed';
    }

    const insertRecord = {
      id: newId,
      tenant_id: tenantId,
      code,
      service_id: payload.serviceId,
      professional_id: assignedProfId,
      customer_name: payload.customerName.trim(),
      customer_phone: payload.customerPhone.trim(),
      customer_email: payload.customerEmail ? payload.customerEmail.trim().toLowerCase() : null,
      start_at: startAtDate.toISOString(),
      end_at: endAtDate.toISOString(),
      duration_minutes: duration,
      timezone: settings.timezone,
      status: initialStatus,
      customer_notes: payload.customerNotes ? payload.customerNotes.trim() : null,
      internal_notes: payload.internalNotes ? payload.internalNotes.trim() : null,
      cancellation_reason: null,
      source,
      public_access_token: publicToken,
      idempotency_key: payload.idempotencyKey ? payload.idempotencyKey.trim() : null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    const { error } = await supabaseAdmin.from('appointments').insert(insertRecord);
    if (error) {
      throw new Error(`Erro ao registrar agendamento: ${error.message}`);
    }

    await repo.logAudit({
      actorUserId: actor ? actor.id : null,
      actorUserName: actor ? actor.name : 'Cliente (Mini Site)',
      tenantId,
      action: 'APPOINTMENT_CREATE' as any,
      entity: 'appointments',
      entityId: newId,
      metadata: { code, serviceName: service.name, start_at: insertRecord.start_at, source },
    });

    return (await this.getAppointmentById(newId, tenantId))!;
  }

  // ==========================================
  // 6. APPOINTMENTS MANAGEMENT
  // ==========================================

  public async listAppointments(
    tenantId: string,
    filters?: {
      date?: string; // YYYY-MM-DD
      startDate?: string;
      endDate?: string;
      professionalId?: string;
      status?: string;
      search?: string;
    }
  ): Promise<Appointment[]> {
    let query = supabaseAdmin
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('start_at', { ascending: true });

    if (filters?.date) {
      const parts = filters.date.split('-').map(Number);
      const startOfDay = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] - 1, 20, 0, 0)).toISOString();
      const endOfDay = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1, 4, 0, 0)).toISOString();
      query = query.gte('start_at', startOfDay).lte('start_at', endOfDay);
    } else {
      if (filters?.startDate) {
        const startMs = filters.startDate.length === 10
          ? new Date(`${filters.startDate}T00:00:00.000Z`).getTime() - 4 * 3600 * 1000
          : new Date(filters.startDate).getTime();
        query = query.gte('start_at', new Date(startMs).toISOString());
      }
      if (filters?.endDate) {
        const endMs = filters.endDate.length === 10
          ? new Date(`${filters.endDate}T23:59:59.999Z`).getTime() + 4 * 3600 * 1000
          : new Date(filters.endDate).getTime();
        query = query.lte('start_at', new Date(endMs).toISOString());
      }
    }

    if (filters?.professionalId && filters.professionalId !== 'all') {
      query = query.eq('professional_id', filters.professionalId);
    }

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    const { data: appts } = await query;
    let list = appts || [];

    if (filters?.search && filters.search.trim()) {
      const term = filters.search.toLowerCase().trim();
      list = list.filter(
        (a: any) =>
          a.customer_name.toLowerCase().includes(term) ||
          a.customer_phone.includes(term) ||
          a.code.toLowerCase().includes(term)
      );
    }

    // Populate service & professional names
    const { data: services } = await supabaseAdmin
      .from('services')
      .select('id, name, price')
      .eq('tenant_id', tenantId);

    const { data: profs } = await supabaseAdmin
      .from('professionals')
      .select('id, name')
      .eq('tenant_id', tenantId);

    const serviceMap: Record<string, any> = {};
    (services || []).forEach((s: any) => {
      serviceMap[s.id] = s;
    });

    const profMap: Record<string, string> = {};
    (profs || []).forEach((p: any) => {
      profMap[p.id] = p.name;
    });

    return list.map((a: any) => ({
      id: a.id,
      tenantId: a.tenant_id,
      code: a.code,
      serviceId: a.service_id,
      serviceName: serviceMap[a.service_id]?.name || 'Serviço',
      servicePrice: serviceMap[a.service_id]?.price ?? null,
      serviceDurationMinutes: a.duration_minutes,
      professionalId: a.professional_id || null,
      professionalName: a.professional_id ? profMap[a.professional_id] || null : null,
      customerName: a.customer_name,
      customerPhone: a.customer_phone,
      customerEmail: a.customer_email || null,
      startAt: a.start_at,
      endAt: a.end_at,
      durationMinutes: a.duration_minutes,
      timezone: a.timezone || 'America/Sao_Paulo',
      status: a.status as AppointmentStatus,
      customerNotes: a.customer_notes || null,
      internalNotes: a.internal_notes || null,
      cancellationReason: a.cancellation_reason || null,
      source: a.source || 'public_site',
      publicAccessToken: a.public_access_token,
      idempotencyKey: a.idempotency_key || null,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    }));
  }

  public async getAppointmentById(id: string, tenantId: string): Promise<Appointment | null> {
    const list = await this.listAppointments(tenantId);
    return list.find((a) => a.id === id) || null;
  }

  public async getAppointmentByToken(token: string, tenantId?: string): Promise<Appointment | null> {
    let query = supabaseAdmin
      .from('appointments')
      .select('*')
      .eq('public_access_token', token);

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data } = await query.single();
    if (!data) return null;

    return (await this.getAppointmentById(data.id, data.tenant_id)) || null;
  }

  public async updateAppointmentStatus(
    id: string,
    tenantId: string,
    status: AppointmentStatus,
    cancellationReason?: string | null,
    actor?: User
  ): Promise<Appointment> {
    const existing = await this.getAppointmentById(id, tenantId);
    if (!existing) {
      throw new Error('Agendamento não encontrado.');
    }

    const patch: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'cancelled' && cancellationReason) {
      patch.cancellation_reason = cancellationReason.trim();
    }

    const { error } = await supabaseAdmin
      .from('appointments')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new Error(`Erro ao atualizar status: ${error.message}`);
    }

    await repo.logAudit({
      actorUserId: actor ? actor.id : null,
      actorUserName: actor ? actor.name : 'Sistema',
      tenantId,
      action: 'APPOINTMENT_STATUS_CHANGE' as any,
      entity: 'appointments',
      entityId: id,
      metadata: { code: existing.code, oldStatus: existing.status, newStatus: status },
    });

    return (await this.getAppointmentById(id, tenantId))!;
  }

  public async rescheduleAppointment(
    id: string,
    tenantId: string,
    payload: RescheduleAppointmentPayload,
    actor: User
  ): Promise<Appointment> {
    const existing = await this.getAppointmentById(id, tenantId);
    if (!existing) {
      throw new Error('Agendamento não encontrado.');
    }

    const newStartAt = new Date(payload.startAt);
    if (isNaN(newStartAt.getTime())) {
      throw new Error('Nova data/hora de início inválida.');
    }

    const targetProfId = payload.professionalId !== undefined ? payload.professionalId : existing.professionalId;
    const settings = await this.getSettings(tenantId);
    const buffer = settings.bufferBetweenAppointmentsMinutes || 0;
    const newEndAt = new Date(newStartAt.getTime() + existing.durationMinutes * 60 * 1000);

    // Verify conflicts on the new time slot (excluding this current appointment)
    let conflictQuery = supabaseAdmin
      .from('appointments')
      .select('id, code')
      .eq('tenant_id', tenantId)
      .neq('id', id)
      .in('status', ['pending', 'confirmed'])
      .lt('start_at', new Date(newEndAt.getTime() + buffer * 60 * 1000).toISOString())
      .gt('end_at', new Date(newStartAt.getTime() - buffer * 60 * 1000).toISOString());

    if (targetProfId) {
      conflictQuery = conflictQuery.eq('professional_id', targetProfId);
    } else {
      conflictQuery = conflictQuery.eq('service_id', existing.serviceId);
    }

    const { data: conflicts } = await conflictQuery;
    if (conflicts && conflicts.length > 0) {
      throw new Error('O novo horário selecionado já está ocupado por outro agendamento.');
    }

    // Verify schedule blocks on the new time slot
    let blockQuery = supabaseAdmin
      .from('schedule_blocks')
      .select('id, title')
      .eq('tenant_id', tenantId)
      .lt('start_at', newEndAt.toISOString())
      .gt('end_at', newStartAt.toISOString());

    if (targetProfId) {
      blockQuery = blockQuery.or(`professional_id.eq.${targetProfId},professional_id.is.null`);
    } else {
      blockQuery = blockQuery.is('professional_id', null);
    }

    const { data: blocks } = await blockQuery;
    if (blocks && blocks.length > 0) {
      throw new Error('O novo horário selecionado está bloqueado ou indisponível.');
    }

    const patch: any = {
      start_at: newStartAt.toISOString(),
      end_at: newEndAt.toISOString(),
      professional_id: targetProfId,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from('appointments')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new Error(`Erro ao remarcar agendamento: ${error.message}`);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'APPOINTMENT_RESCHEDULE' as any,
      entity: 'appointments',
      entityId: id,
      metadata: { code: existing.code, oldStart: existing.startAt, newStart: patch.start_at },
    });

    return (await this.getAppointmentById(id, tenantId))!;
  }

  public async updateAppointmentNotes(
    id: string,
    tenantId: string,
    internalNotes: string | null,
    actor: User
  ): Promise<Appointment> {
    const existing = await this.getAppointmentById(id, tenantId);
    if (!existing) throw new Error('Agendamento não encontrado.');

    const patch = {
      internal_notes: internalNotes ? internalNotes.trim() : null,
      updated_at: new Date().toISOString(),
    };

    await supabaseAdmin
      .from('appointments')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId);

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'APPOINTMENT_NOTES_UPDATE' as any,
      entity: 'appointments',
      entityId: id,
      metadata: { code: existing.code },
    });

    return (await this.getAppointmentById(id, tenantId))!;
  }

  public async getCustomerAppointmentsHistory(
    tenantId: string,
    phone: string
  ): Promise<Appointment[]> {
    const cleanPhone = phone.replace(/\D/g, '');
    const all = await this.listAppointments(tenantId);
    return all.filter((a) => a.customerPhone.replace(/\D/g, '') === cleanPhone);
  }

  // ==========================================
  // HELPER MAPPER
  // ==========================================

  private mapSettings(data: any): AppointmentSettings {
    return {
      id: data.id,
      tenantId: data.tenant_id,
      timezone: data.timezone || 'America/Sao_Paulo',
      minBookingNoticeHours: Number(data.min_booking_notice_hours) || 1,
      maxBookingAdvanceDays: Number(data.max_booking_advance_days) || 30,
      bufferBetweenAppointmentsMinutes: Number(data.buffer_between_appointments_minutes) || 0,
      businessHours: data.business_hours || DEFAULT_BUSINESS_HOURS,
      allowCustomerCancellation: data.allow_customer_cancellation !== false,
      cancellationNoticeHours: Number(data.cancellation_notice_hours) || 2,
      publicBookingEnabled: data.public_booking_enabled !== false,
      autoConfirmBookings: data.auto_confirm_bookings === true,
      notificationInstructions: data.notification_instructions || null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
}

export const appointmentRepo = new AppointmentRepository();
