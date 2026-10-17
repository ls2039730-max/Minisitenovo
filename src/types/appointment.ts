// ==============================================================================
// APPOINTMENTS & SCHEDULING TYPES (ETAPA 4B)
// ==============================================================================

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type AppointmentSource = 'public_site' | 'admin';

export interface DayInterval {
  start: string; // "09:00"
  end: string;   // "12:00"
}

export interface DaySchedule {
  isOpen: boolean;
  intervals: DayInterval[];
}

export interface WeeklyBusinessHours {
  seg: DaySchedule;
  ter: DaySchedule;
  qua: DaySchedule;
  qui: DaySchedule;
  sex: DaySchedule;
  sab: DaySchedule;
  dom: DaySchedule;
}

export interface AppointmentSettings {
  id: string;
  tenantId: string;
  timezone: string;
  minBookingNoticeHours: number;
  maxBookingAdvanceDays: number;
  bufferBetweenAppointmentsMinutes: number;
  businessHours: WeeklyBusinessHours;
  allowCustomerCancellation: boolean;
  cancellationNoticeHours: number;
  publicBookingEnabled: boolean;
  autoConfirmBookings: boolean;
  notificationInstructions: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateAppointmentSettingsPayload {
  timezone?: string;
  minBookingNoticeHours?: number;
  maxBookingAdvanceDays?: number;
  bufferBetweenAppointmentsMinutes?: number;
  businessHours?: WeeklyBusinessHours;
  allowCustomerCancellation?: boolean;
  cancellationNoticeHours?: number;
  publicBookingEnabled?: boolean;
  autoConfirmBookings?: boolean;
  notificationInstructions?: string | null;
}

export interface ProfessionalSchedule {
  id: string;
  tenantId: string;
  professionalId: string;
  professionalName?: string;
  useBusinessHours: boolean;
  customHours: WeeklyBusinessHours | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveProfessionalSchedulePayload {
  professionalId: string;
  useBusinessHours: boolean;
  customHours?: WeeklyBusinessHours | null;
  active?: boolean;
}

export interface ScheduleBlock {
  id: string;
  tenantId: string;
  professionalId: string | null;
  professionalName?: string | null;
  title: string;
  startAt: string; // ISO
  endAt: string;   // ISO
  isAllDay: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduleBlockPayload {
  professionalId?: string | null;
  title: string;
  startAt: string;
  endAt: string;
  isAllDay?: boolean;
  notes?: string | null;
}

export interface Appointment {
  id: string;
  tenantId: string;
  code: string;
  serviceId: string;
  serviceName: string;
  servicePrice?: number | null;
  serviceDurationMinutes?: number;
  professionalId: string | null;
  professionalName?: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  startAt: string; // ISO UTC
  endAt: string;   // ISO UTC
  durationMinutes: number;
  timezone: string;
  status: AppointmentStatus;
  customerNotes: string | null;
  internalNotes: string | null;
  cancellationReason: string | null;
  source: AppointmentSource;
  publicAccessToken: string;
  idempotencyKey?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAppointmentPayload {
  serviceId: string;
  professionalId?: string | null;
  startAt: string; // ISO UTC or YYYY-MM-DDTHH:mm
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
  status?: AppointmentStatus;
  idempotencyKey?: string | null;
}

export interface RescheduleAppointmentPayload {
  startAt: string;
  professionalId?: string | null;
}

export interface CancelAppointmentPayload {
  reason?: string | null;
}

export interface UpdateAppointmentNotesPayload {
  internalNotes?: string | null;
}

export interface AvailableSlot {
  time: string; // "14:30"
  startAt: string; // ISO UTC
  endAt: string;   // ISO UTC
  availableProfessionalIds: string[];
}

export interface AvailableSlotsResponse {
  date: string;
  slots: AvailableSlot[];
  isOpen: boolean;
  closedReason?: string;
  timezone: string;
}

export interface PublicBookingPayload {
  serviceId: string;
  professionalId?: string | null;
  startAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerNotes?: string | null;
  idempotencyKey?: string | null;
}

export interface PublicBookingResult {
  success: boolean;
  appointment: {
    id: string;
    code: string;
    serviceName: string;
    professionalName: string | null;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    status: AppointmentStatus;
    customerName: string;
    customerPhone: string;
    publicAccessToken: string;
    whatsappDirectUrl: string;
    instructions: string | null;
  };
}
