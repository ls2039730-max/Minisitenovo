-- ============================================================================
-- MIGRATION: 20261103000000_delivery_dispatch_hub.sql
-- Central de Entregas, Equipe de Motoboys, Rotas Multi-Paradas, QR Code e Notificações
-- ============================================================================

-- 0. Permitir o perfil DELIVERY_DRIVER na tabela public.tenant_users
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'tenant_users'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.tenant_users DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;

  ALTER TABLE public.tenant_users
    ADD CONSTRAINT tenant_users_role_check
    CHECK (role IN ('SUPER_ADMIN', 'CLIENT_ADMIN', 'OWNER', 'MANAGER', 'EMPLOYEE', 'PROFESSIONAL', 'DELIVERY_DRIVER'));
END $$;

-- 1. Add coordinates and geocoding status to order_delivery_addresses
ALTER TABLE public.order_delivery_addresses
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS geocode_status TEXT DEFAULT 'pending' CHECK (geocode_status IN ('geocoded', 'pending', 'manual'));

CREATE INDEX IF NOT EXISTS idx_order_delivery_addresses_tenant_coords
  ON public.order_delivery_addresses (tenant_id, geocode_status);

-- 2. Delivery Drivers (Motoboys / Equipe de Entregas)
CREATE TABLE IF NOT EXISTS public.delivery_drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  photo_url TEXT,
  vehicle_info TEXT,
  plate TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  availability_status TEXT NOT NULL DEFAULT 'available' CHECK (availability_status IN ('available', 'in_route', 'unavailable')),
  share_location BOOLEAN NOT NULL DEFAULT false,
  last_latitude NUMERIC(10, 7),
  last_longitude NUMERIC(10, 7),
  last_location_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_delivery_drivers_tenant_email UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_delivery_drivers_tenant_active
  ON public.delivery_drivers (tenant_id, is_active, availability_status);

CREATE INDEX IF NOT EXISTS idx_delivery_drivers_user
  ON public.delivery_drivers (user_id);

-- 3. Delivery Routes (Rotas com Múltiplas Paradas e QR Code Seguro)
CREATE TABLE IF NOT EXISTS public.delivery_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  route_code TEXT NOT NULL,
  name TEXT,
  driver_id UUID REFERENCES public.delivery_drivers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'assigned', 'accepted', 'in_progress', 'completed', 'cancelled')),
  total_stops INTEGER NOT NULL DEFAULT 0,
  completed_stops INTEGER NOT NULL DEFAULT 0,
  failed_stops INTEGER NOT NULL DEFAULT 0,
  total_distance_km NUMERIC(10, 2) NOT NULL DEFAULT 0,
  estimated_duration_min INTEGER NOT NULL DEFAULT 0,
  origin_address JSONB,
  qr_token TEXT NOT NULL UNIQUE,
  qr_expires_at TIMESTAMPTZ NOT NULL,
  qr_revoked_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_delivery_routes_tenant_code UNIQUE (tenant_id, route_code)
);

CREATE INDEX IF NOT EXISTS idx_delivery_routes_tenant_status
  ON public.delivery_routes (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_routes_driver
  ON public.delivery_routes (tenant_id, driver_id, status);

CREATE INDEX IF NOT EXISTS idx_delivery_routes_qr_token
  ON public.delivery_routes (qr_token);

-- 4. Delivery Route Stops (Paradas Individuais de Entrega por Pedido)
CREATE TABLE IF NOT EXISTS public.delivery_route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES public.delivery_routes(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_number INTEGER NOT NULL,
  stop_sequence INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'out_for_delivery', 'delivered', 'failed_attempt', 'cancelled')),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  address_summary TEXT NOT NULL,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  complement TEXT,
  neighborhood TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  cep TEXT NOT NULL,
  reference TEXT,
  notes TEXT,
  order_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL,
  change_for NUMERIC(10, 2),
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  distance_from_prev_km NUMERIC(10, 2),
  duration_from_prev_min INTEGER,
  cumulative_eta_min INTEGER,
  tracking_token TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT CHECK (failure_reason IS NULL OR failure_reason IN ('customer_absent', 'address_not_found', 'customer_not_answered', 'access_issue', 'other')),
  failure_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_route_stops_route_seq
  ON public.delivery_route_stops (route_id, stop_sequence ASC);

CREATE INDEX IF NOT EXISTS idx_delivery_route_stops_tenant_order
  ON public.delivery_route_stops (tenant_id, order_id);

CREATE INDEX IF NOT EXISTS idx_delivery_route_stops_tracking_token
  ON public.delivery_route_stops (tracking_token);

-- 5. Delivery Events (Histórico Auditável de Transições de Rota e Entrega)
CREATE TABLE IF NOT EXISTS public.delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  route_id UUID REFERENCES public.delivery_routes(id) ON DELETE CASCADE,
  stop_id UUID REFERENCES public.delivery_route_stops(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES public.delivery_drivers(id) ON DELETE SET NULL,
  actor_user_id UUID,
  actor_name TEXT,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_tenant_route
  ON public.delivery_events (tenant_id, route_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_events_tenant_order
  ON public.delivery_events (tenant_id, order_id, created_at DESC);

-- 6. Delivery Notifications (Logs e Idempotência de Notificações WhatsApp)
CREATE TABLE IF NOT EXISTS public.delivery_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  route_id UUID REFERENCES public.delivery_routes(id) ON DELETE SET NULL,
  stop_id UUID REFERENCES public.delivery_route_stops(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('out_for_delivery', 'delivered', 'failed_attempt')),
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  recipient_phone TEXT NOT NULL,
  message_body TEXT NOT NULL,
  tracking_url TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending_gateway' CHECK (status IN ('sent', 'failed', 'pending_gateway')),
  provider_confirmed BOOLEAN NOT NULL DEFAULT false,
  provider_name TEXT,
  provider_response JSONB,
  error_message TEXT,
  whatsapp_web_url TEXT NOT NULL,
  attempts_count INTEGER NOT NULL DEFAULT 1,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_delivery_notifications_order_event UNIQUE (tenant_id, order_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_delivery_notifications_tenant_order
  ON public.delivery_notifications (tenant_id, order_id);

-- 7. Row Level Security (RLS) Multi-Tenant Isolation
ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_delivery_drivers ON public.delivery_drivers;
CREATE POLICY tenant_isolation_delivery_drivers ON public.delivery_drivers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = delivery_drivers.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.status = 'active'
    )
  );

DROP POLICY IF EXISTS tenant_isolation_delivery_routes ON public.delivery_routes;
CREATE POLICY tenant_isolation_delivery_routes ON public.delivery_routes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = delivery_routes.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.status = 'active'
    )
  );

DROP POLICY IF EXISTS tenant_isolation_delivery_route_stops ON public.delivery_route_stops;
CREATE POLICY tenant_isolation_delivery_route_stops ON public.delivery_route_stops
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = delivery_route_stops.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.status = 'active'
    )
  );

DROP POLICY IF EXISTS tenant_isolation_delivery_events ON public.delivery_events;
CREATE POLICY tenant_isolation_delivery_events ON public.delivery_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = delivery_events.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.status = 'active'
    )
  );

DROP POLICY IF EXISTS tenant_isolation_delivery_notifications ON public.delivery_notifications;
CREATE POLICY tenant_isolation_delivery_notifications ON public.delivery_notifications
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = delivery_notifications.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.status = 'active'
    )
  );
