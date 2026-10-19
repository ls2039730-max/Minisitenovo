-- ==============================================================================
-- SUPABASE POSTGRESQL MULTI-TENANT SAAS MIGRATION
-- Migration: 20261006000000_init_saas_schema.sql
-- ==============================================================================

-- 1. Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLES DEFINITIONS
-- ==============================================================================

-- Plans table
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- System features catalog
CREATE TABLE IF NOT EXISTS public.features (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('core', 'vendas', 'atendimento', 'marketing')),
  icon TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Plan included features
CREATE TABLE IF NOT EXISTS public.plan_features (
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES public.features(key) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (plan_id, feature_key)
);

-- Tenants (Companies) table
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  segment TEXT NOT NULL,
  cnpj TEXT,
  phone TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  email TEXT NOT NULL,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'teste' CHECK (status IN ('teste', 'ativo', 'pagamento_pendente', 'atrasado', 'suspenso', 'cancelado')),
  owner_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  owner_phone TEXT NOT NULL,
  subdomain TEXT NOT NULL,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Tenant visual appearance and settings
CREATE TABLE IF NOT EXISTS public.tenant_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  primary_color TEXT NOT NULL DEFAULT '#1e293b',
  secondary_color TEXT NOT NULL DEFAULT '#3b82f6',
  accent_color TEXT NOT NULL DEFAULT '#f59e0b',
  font_family TEXT NOT NULL DEFAULT 'Inter',
  logo_url TEXT,
  tagline TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Tenant specific feature overrides (true = enabled, false = disabled)
CREATE TABLE IF NOT EXISTS public.tenant_features (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES public.features(key) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (tenant_id, feature_key)
);

-- Tenant user relationships (linking Supabase Auth users to tenants with roles)
CREATE TABLE IF NOT EXISTS public.tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE, -- NULL for platform super admins
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'CLIENT_ADMIN' CHECK (role IN ('SUPER_ADMIN', 'CLIENT_ADMIN', 'OWNER', 'MANAGER', 'EMPLOYEE', 'PROFESSIONAL')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'invited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_tenant_user UNIQUE (tenant_id, user_id)
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_user_name TEXT,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================
-- 3. INDEXES FOR PERFORMANCE
-- ==============================================
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_plan ON public.tenants(plan_id);
CREATE INDEX IF NOT EXISTS idx_tenants_created_at ON public.tenants(created_at);

CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON public.tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON public.tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_role ON public.tenant_users(role);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- ==============================================
-- 4. AUTOMATIC updated_at TRIGGER FUNCTION
-- ==============================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tenants_updated_at ON public.tenants;
CREATE TRIGGER trigger_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_tenant_settings_updated_at ON public.tenant_settings;
CREATE TRIGGER trigger_tenant_settings_updated_at
BEFORE UPDATE ON public.tenant_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_tenant_features_updated_at ON public.tenant_features;
CREATE TRIGGER trigger_tenant_features_updated_at
BEFORE UPDATE ON public.tenant_features
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_tenant_users_updated_at ON public.tenant_users;
CREATE TRIGGER trigger_tenant_users_updated_at
BEFORE UPDATE ON public.tenant_users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_plans_updated_at ON public.plans;
CREATE TRIGGER trigger_plans_updated_at
BEFORE UPDATE ON public.plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================
-- 5. RLS SECURITY HELPER FUNCTIONS
-- ==============================================

-- Checks if the authenticated user is a SUPER_ADMIN
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE user_id = auth.uid()
      AND role = 'SUPER_ADMIN'
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Checks if the authenticated user has access to a specific tenant
CREATE OR REPLACE FUNCTION public.user_has_tenant_access(target_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Super admins have global access
  IF public.is_super_admin() THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE user_id = auth.uid()
      AND tenant_id = target_tenant_id
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==============================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Plans & Features: readable by authenticated users, editable only by Super Admin
CREATE POLICY "Plans are viewable by authenticated users"
ON public.plans FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Plans are editable only by Super Admin"
ON public.plans FOR ALL
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Features are viewable by authenticated users"
ON public.features FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Features are editable only by Super Admin"
ON public.features FOR ALL
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Plan features are viewable by authenticated users"
ON public.plan_features FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Plan features are editable only by Super Admin"
ON public.plan_features FOR ALL
TO authenticated
USING (public.is_super_admin());

-- Tenants Policies
CREATE POLICY "Tenants: select access"
ON public.tenants FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL AND (
    public.is_super_admin() OR
    id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() AND status = 'active')
  )
);

CREATE POLICY "Tenants: insert access"
ON public.tenants FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin());

CREATE POLICY "Tenants: update access"
ON public.tenants FOR UPDATE
TO authenticated
USING (
  public.is_super_admin() OR
  (id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() AND status = 'active'))
)
WITH CHECK (
  public.is_super_admin() OR
  (id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() AND status = 'active'))
);

CREATE POLICY "Tenants: delete access"
ON public.tenants FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- Tenant Settings Policies
CREATE POLICY "Tenant settings: select access"
ON public.tenant_settings FOR SELECT
TO authenticated
USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Tenant settings: update access"
ON public.tenant_settings FOR UPDATE
TO authenticated
USING (public.user_has_tenant_access(tenant_id))
WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Tenant settings: insert/delete access"
ON public.tenant_settings FOR ALL
TO authenticated
USING (public.is_super_admin());

-- Tenant Features Policies
CREATE POLICY "Tenant features: select access"
ON public.tenant_features FOR SELECT
TO authenticated
USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Tenant features: write access"
ON public.tenant_features FOR ALL
TO authenticated
USING (public.is_super_admin());

-- Tenant Users Policies
CREATE POLICY "Tenant users: select access"
ON public.tenant_users FOR SELECT
TO authenticated
USING (
  public.is_super_admin() OR
  tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() AND status = 'active')
);

CREATE POLICY "Tenant users: write access"
ON public.tenant_users FOR ALL
TO authenticated
USING (public.is_super_admin());

-- Audit Logs Policies: Readable only by Super Admin, insertable by backend service role
CREATE POLICY "Audit logs: select access"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.is_super_admin());

-- ==============================================
-- 7. SUPABASE STORAGE BUCKET CONFIGURATION
-- ==============================================
-- Note: executed via storage schema in Supabase
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-media', 'tenant-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies:
-- Anyone can view public tenant-media objects
CREATE POLICY "Public media access"
ON storage.objects FOR SELECT
USING (bucket_id = 'tenant-media');

-- Authenticated upload restricted to authorized tenant path
CREATE POLICY "Tenant media upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-media' AND
  (public.is_super_admin() OR (storage.foldername(name))[1]::uuid IN (
    SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() AND status = 'active'
  ))
);
