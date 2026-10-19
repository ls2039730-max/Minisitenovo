-- ==============================================================================
-- SUPABASE POSTGRESQL APPOINTMENTS & SCHEDULING SCHEMA MIGRATION
-- Migration: 20261006000005_appointments_scheduling.sql
-- Etapa 4B: Sistema completo de Agenda, Horários de Funcionamento, Bloqueios e Agendamentos
-- ==============================================================================

-- 0. Garantir extensão btree_gist para restrições de exclusão se aplicável
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Tabela de Configurações de Agenda por Empresa (Tenant)
CREATE TABLE IF NOT EXISTS public.appointment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  min_booking_notice_hours NUMERIC NOT NULL DEFAULT 1 CHECK (min_booking_notice_hours >= 0),
  max_booking_advance_days INTEGER NOT NULL DEFAULT 30 CHECK (max_booking_advance_days >= 1),
  buffer_between_appointments_minutes INTEGER NOT NULL DEFAULT 0 CHECK (buffer_between_appointments_minutes >= 0),
  business_hours JSONB NOT NULL DEFAULT '{
    "seg": {"isOpen": true, "intervals": [{"start": "09:00", "end": "12:00"}, {"start": "13:00", "end": "18:00"}]},
    "ter": {"isOpen": true, "intervals": [{"start": "09:00", "end": "12:00"}, {"start": "13:00", "end": "18:00"}]},
    "qua": {"isOpen": true, "intervals": [{"start": "09:00", "end": "12:00"}, {"start": "13:00", "end": "18:00"}]},
    "qui": {"isOpen": true, "intervals": [{"start": "09:00", "end": "12:00"}, {"start": "13:00", "end": "18:00"}]},
    "sex": {"isOpen": true, "intervals": [{"start": "09:00", "end": "12:00"}, {"start": "13:00", "end": "18:00"}]},
    "sab": {"isOpen": true, "intervals": [{"start": "09:00", "end": "14:00"}]},
    "dom": {"isOpen": false, "intervals": []}
  }'::jsonb,
  allow_customer_cancellation BOOLEAN NOT NULL DEFAULT true,
  cancellation_notice_hours NUMERIC NOT NULL DEFAULT 2 CHECK (cancellation_notice_hours >= 0),
  public_booking_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_confirm_bookings BOOLEAN NOT NULL DEFAULT false,
  notification_instructions TEXT DEFAULT 'Por favor, chegue com 10 minutos de antecedência. Em caso de imprevisto, avise com antecedência.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_tenant_appointment_settings UNIQUE (tenant_id)
);

-- 2. Tabela de Horários / Disponibilidade Específica dos Profissionais
CREATE TABLE IF NOT EXISTS public.professional_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  use_business_hours BOOLEAN NOT NULL DEFAULT true,
  custom_hours JSONB DEFAULT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_professional_schedule UNIQUE (professional_id)
);

-- 3. Tabela de Bloqueios de Horário, Férias, Folgas e Ausências
CREATE TABLE IF NOT EXISTS public.schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  is_all_day BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT check_block_dates CHECK (end_at > start_at)
);

-- 4. Tabela de Agendamentos (Appointments)
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  customer_notes TEXT,
  internal_notes TEXT,
  cancellation_reason TEXT,
  source TEXT NOT NULL DEFAULT 'public_site' CHECK (source IN ('public_site', 'admin')),
  public_access_token TEXT NOT NULL,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT check_appointment_dates CHECK (end_at > start_at)
);

-- ==============================================
-- 5. ÍNDICES DE PERFORMANCE E INTEGRIDADE
-- ==============================================
CREATE INDEX IF NOT EXISTS idx_appointment_settings_tenant ON public.appointment_settings(tenant_id);

CREATE INDEX IF NOT EXISTS idx_professional_schedules_tenant ON public.professional_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_professional_schedules_professional ON public.professional_schedules(professional_id);

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_tenant ON public.schedule_blocks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_prof_range ON public.schedule_blocks(professional_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_range ON public.schedule_blocks(tenant_id, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_id ON public.appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_code ON public.appointments(tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_appointments_service_id ON public.appointments(service_id);
CREATE INDEX IF NOT EXISTS idx_appointments_professional_id ON public.appointments(professional_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_range ON public.appointments(tenant_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_appointments_prof_range ON public.appointments(professional_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_appointments_customer_phone ON public.appointments(tenant_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_appointments_public_token ON public.appointments(public_access_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency ON public.appointments(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ==============================================
-- 6. TRIGGERS AUTOMÁTICOS DE updated_at
-- ==============================================
DROP TRIGGER IF EXISTS trigger_appointment_settings_updated_at ON public.appointment_settings;
CREATE TRIGGER trigger_appointment_settings_updated_at
  BEFORE UPDATE ON public.appointment_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_professional_schedules_updated_at ON public.professional_schedules;
CREATE TRIGGER trigger_professional_schedules_updated_at
  BEFORE UPDATE ON public.professional_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_schedule_blocks_updated_at ON public.schedule_blocks;
CREATE TRIGGER trigger_schedule_blocks_updated_at
  BEFORE UPDATE ON public.schedule_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_appointments_updated_at ON public.appointments;
CREATE TRIGGER trigger_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================
-- 7. FUNÇÃO RPC TRANSACIONAL ATÔMICA DE AGENDAMENTO (Prevenção de Dupla Reserva)
-- ==============================================
CREATE OR REPLACE FUNCTION public.book_appointment(
  p_tenant_id UUID,
  p_service_id UUID,
  p_professional_id UUID,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_email TEXT,
  p_start_at TIMESTAMPTZ,
  p_customer_notes TEXT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'public_site'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_service RECORD;
  v_prof RECORD;
  v_settings RECORD;
  v_duration INTEGER;
  v_buffer INTEGER := 0;
  v_end_at TIMESTAMPTZ;
  v_conflict_count INTEGER;
  v_block_count INTEGER;
  v_code TEXT;
  v_token TEXT;
  v_initial_status TEXT := 'pending';
  v_appointment_id UUID;
  v_existing_id UUID;
  v_random_suffix TEXT;
BEGIN
  -- 1. Verificar idempotência se chave fornecida
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
    SELECT id INTO v_existing_id FROM public.appointments
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', true,
        'appointment_id', v_existing_id
      );
    END IF;
  END IF;

  -- 2. Validar Serviço
  SELECT id, tenant_id, name, duration_minutes, active, booking_enabled
  INTO v_service
  FROM public.services
  WHERE id = p_service_id;

  IF v_service.id IS NULL THEN
    RAISE EXCEPTION 'Serviço não encontrado.';
  END IF;

  IF v_service.tenant_id != p_tenant_id THEN
    RAISE EXCEPTION 'Violação multi-tenant: O serviço não pertence a esta empresa.';
  END IF;

  IF v_service.active = false THEN
    RAISE EXCEPTION 'Este serviço está inativo no momento.';
  END IF;

  IF v_service.booking_enabled = false THEN
    RAISE EXCEPTION 'Este serviço não aceita agendamentos online.';
  END IF;

  v_duration := COALESCE(v_service.duration_minutes, 30);

  -- 3. Obter configurações de agenda do tenant
  SELECT * INTO v_settings FROM public.appointment_settings WHERE tenant_id = p_tenant_id;
  IF v_settings.id IS NOT NULL THEN
    IF p_source = 'public_site' AND v_settings.public_booking_enabled = false THEN
      RAISE EXCEPTION 'Os agendamentos online estão temporariamente desativados por este estabelecimento.';
    END IF;
    v_buffer := COALESCE(v_settings.buffer_between_appointments_minutes, 0);
    IF v_settings.auto_confirm_bookings = true THEN
      v_initial_status := 'confirmed';
    END IF;
  END IF;

  -- 4. Validar Profissional se especificado
  IF p_professional_id IS NOT NULL THEN
    SELECT id, tenant_id, name, active INTO v_prof
    FROM public.professionals
    WHERE id = p_professional_id;

    IF v_prof.id IS NULL THEN
      RAISE EXCEPTION 'Profissional não encontrado.';
    END IF;

    IF v_prof.tenant_id != p_tenant_id THEN
      RAISE EXCEPTION 'Violação multi-tenant: O profissional não pertence a esta empresa.';
    END IF;

    IF v_prof.active = false THEN
      RAISE EXCEPTION 'O profissional selecionado está temporariamente indisponível.';
    END IF;

    -- Verificar se o profissional está vinculado ao serviço
    IF NOT EXISTS (
      SELECT 1 FROM public.service_professionals
      WHERE service_id = p_service_id AND professional_id = p_professional_id
    ) THEN
      RAISE EXCEPTION 'O profissional selecionado não realiza este serviço.';
    END IF;
  END IF;

  -- 5. Calcular término do atendimento
  v_end_at := p_start_at + (v_duration || ' minutes')::interval;

  -- 6. Garantir atomicidade com lock transacional no profissional (ou tenant)
  -- Impede condição de corrida quando duas requisições concorrentes tentam o mesmo horário
  IF p_professional_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('booking_' || p_professional_id::text));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('booking_tenant_' || p_tenant_id::text));
  END IF;

  -- 7. Verificar se colide com Bloqueio de Horário (schedule_blocks)
  IF p_professional_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_block_count
    FROM public.schedule_blocks
    WHERE tenant_id = p_tenant_id
      AND (professional_id = p_professional_id OR professional_id IS NULL)
      AND (start_at < v_end_at AND end_at > p_start_at);
  ELSE
    SELECT COUNT(*) INTO v_block_count
    FROM public.schedule_blocks
    WHERE tenant_id = p_tenant_id
      AND professional_id IS NULL
      AND (start_at < v_end_at AND end_at > p_start_at);
  END IF;

  IF v_block_count > 0 THEN
    RAISE EXCEPTION 'O horário selecionado está bloqueado ou indisponível.';
  END IF;

  -- 8. Verificar Conflito com Agendamentos Existentes no mesmo profissional
  -- Apenas agendamentos em 'pending' ou 'confirmed' ocupam o horário
  IF p_professional_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conflict_count
    FROM public.appointments
    WHERE tenant_id = p_tenant_id
      AND professional_id = p_professional_id
      AND status IN ('pending', 'confirmed')
      AND (
        (start_at < v_end_at + (v_buffer || ' minutes')::interval)
        AND
        (end_at + (v_buffer || ' minutes')::interval > p_start_at)
      );

    IF v_conflict_count > 0 THEN
      RAISE EXCEPTION 'Este horário acabou de ser reservado por outro cliente. Por favor, escolha outro horário.';
    END IF;
  END IF;

  -- 9. Gerar código amigável e token de acesso público
  v_random_suffix := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 5));
  v_code := 'AG-' || to_char(now() AT TIME ZONE 'UTC', 'YYMM') || '-' || v_random_suffix;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_appointment_id := gen_random_uuid();

  -- 10. Inserir Agendamento Atomicamente
  INSERT INTO public.appointments (
    id,
    tenant_id,
    code,
    service_id,
    professional_id,
    customer_name,
    customer_phone,
    customer_email,
    start_at,
    end_at,
    duration_minutes,
    timezone,
    status,
    customer_notes,
    source,
    public_access_token,
    idempotency_key,
    created_at,
    updated_at
  ) VALUES (
    v_appointment_id,
    p_tenant_id,
    v_code,
    p_service_id,
    p_professional_id,
    trim(p_customer_name),
    trim(p_customer_phone),
    NULLIF(trim(p_customer_email), ''),
    p_start_at,
    v_end_at,
    v_duration,
    COALESCE(v_settings.timezone, 'America/Sao_Paulo'),
    v_initial_status,
    NULLIF(trim(p_customer_notes), ''),
    p_source,
    v_token,
    p_idempotency_key,
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appointment_id,
    'code', v_code,
    'status', v_initial_status,
    'start_at', p_start_at,
    'end_at', v_end_at,
    'public_access_token', v_token
  );
END;
$$;

-- ==============================================
-- 8. POLÍTICAS ROW LEVEL SECURITY (RLS)
-- ==============================================
ALTER TABLE public.appointment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- 8.1 appointment_settings RLS
CREATE POLICY "Public can view appointment settings"
ON public.appointment_settings FOR SELECT
TO anon, authenticated
USING (public_booking_enabled = true);

CREATE POLICY "Tenant admin can manage appointment settings"
ON public.appointment_settings FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
)
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

-- 8.2 professional_schedules RLS
CREATE POLICY "Public can view active professional schedules"
ON public.professional_schedules FOR SELECT
TO anon, authenticated
USING (active = true);

CREATE POLICY "Tenant admin can manage professional schedules"
ON public.professional_schedules FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
)
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

-- 8.3 schedule_blocks RLS
CREATE POLICY "Public can view schedule blocks for slot calculation"
ON public.schedule_blocks FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Tenant admin can manage schedule blocks"
ON public.schedule_blocks FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
)
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

-- 8.4 appointments RLS
-- Importante: Acesso público a agendamentos individuais apenas com token de segurança (sem listar appointments de outros)
CREATE POLICY "Public can view own appointment by token"
ON public.appointments FOR SELECT
TO anon, authenticated
USING (public_access_token IS NOT NULL);

CREATE POLICY "Tenant admin can manage own appointments"
ON public.appointments FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
)
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);
