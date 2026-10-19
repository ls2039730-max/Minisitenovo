-- ==============================================================================
-- SUPABASE POSTGRESQL SERVICES & PROFESSIONALS SCHEMA MIGRATION
-- Migration: 20261006000004_services_professionals.sql
-- Etapa 4A: Gerenciamento completo de Serviços, Categorias e Profissionais
-- ==============================================================================

-- 1. Service Categories Table
CREATE TABLE IF NOT EXISTS public.service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_tenant_service_category_slug UNIQUE (tenant_id, slug)
);

-- 2. Services Table
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.service_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  pricing_type TEXT NOT NULL DEFAULT 'fixed' CHECK (pricing_type IN ('fixed', 'starting_at', 'on_request')),
  price NUMERIC(12, 2) DEFAULT NULL CHECK (price IS NULL OR price >= 0),
  duration_minutes INTEGER DEFAULT NULL CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  featured BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  booking_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_tenant_service_slug UNIQUE (tenant_id, slug)
);

-- 3. Professionals Table
CREATE TABLE IF NOT EXISTS public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bio TEXT,
  photo_url TEXT,
  specialties TEXT[] DEFAULT '{}',
  phone TEXT,
  email TEXT,
  show_contact_publicly BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Service Professionals Relationship Table (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.service_professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_service_professional UNIQUE (service_id, professional_id)
);

-- ==============================================
-- 5. INDEXES FOR HIGH PERFORMANCE & ISOLATION
-- ==============================================
CREATE INDEX IF NOT EXISTS idx_service_categories_tenant_id ON public.service_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_categories_display_order ON public.service_categories(display_order);
CREATE INDEX IF NOT EXISTS idx_service_categories_active ON public.service_categories(active);

CREATE INDEX IF NOT EXISTS idx_services_tenant_id ON public.services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_services_category_id ON public.services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_active ON public.services(active);
CREATE INDEX IF NOT EXISTS idx_services_featured ON public.services(featured);
CREATE INDEX IF NOT EXISTS idx_services_display_order ON public.services(display_order);
CREATE INDEX IF NOT EXISTS idx_services_slug ON public.services(tenant_id, slug);

CREATE INDEX IF NOT EXISTS idx_professionals_tenant_id ON public.professionals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_professionals_active ON public.professionals(active);
CREATE INDEX IF NOT EXISTS idx_professionals_display_order ON public.professionals(display_order);

CREATE INDEX IF NOT EXISTS idx_service_professionals_tenant_id ON public.service_professionals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_professionals_service_id ON public.service_professionals(service_id);
CREATE INDEX IF NOT EXISTS idx_service_professionals_professional_id ON public.service_professionals(professional_id);

-- ==============================================
-- 6. TRIGGERS FOR updated_at AUTOMATION
-- ==============================================
DROP TRIGGER IF EXISTS trigger_service_categories_updated_at ON public.service_categories;
CREATE TRIGGER trigger_service_categories_updated_at
  BEFORE UPDATE ON public.service_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_services_updated_at ON public.services;
CREATE TRIGGER trigger_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_professionals_updated_at ON public.professionals;
CREATE TRIGGER trigger_professionals_updated_at
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================
-- 7. CROSS-TENANT INTEGRITY CHECK FUNCTION & TRIGGER
-- Ensures service and professional belong to the exact same tenant
-- ==============================================
CREATE OR REPLACE FUNCTION public.check_service_professional_tenant_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_service_tenant UUID;
  v_prof_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_service_tenant FROM public.services WHERE id = NEW.service_id;
  SELECT tenant_id INTO v_prof_tenant FROM public.professionals WHERE id = NEW.professional_id;

  IF v_service_tenant IS NULL OR v_prof_tenant IS NULL THEN
    RAISE EXCEPTION 'Serviço ou profissional não encontrado.';
  END IF;

  IF v_service_tenant != v_prof_tenant OR v_service_tenant != NEW.tenant_id THEN
    RAISE EXCEPTION 'Violação de segurança multi-tenant: O serviço e o profissional pertencem a empresas diferentes.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_service_professional_tenant_integrity ON public.service_professionals;
CREATE TRIGGER trigger_check_service_professional_tenant_integrity
  BEFORE INSERT OR UPDATE ON public.service_professionals
  FOR EACH ROW
  EXECUTE FUNCTION public.check_service_professional_tenant_integrity();

-- Cross-tenant category check for services
CREATE OR REPLACE FUNCTION public.check_service_category_tenant_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_cat_tenant UUID;
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT tenant_id INTO v_cat_tenant FROM public.service_categories WHERE id = NEW.category_id;
    IF v_cat_tenant IS NULL OR v_cat_tenant != NEW.tenant_id THEN
      RAISE EXCEPTION 'Violação de segurança multi-tenant: A categoria informada não pertence à mesma empresa do serviço.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_service_category_tenant_integrity ON public.services;
CREATE TRIGGER trigger_check_service_category_tenant_integrity
  BEFORE INSERT OR UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.check_service_category_tenant_integrity();

-- ==============================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_professionals ENABLE ROW LEVEL SECURITY;

-- 8.1 Service Categories Policies
CREATE POLICY "Public can view active service categories"
ON public.service_categories FOR SELECT
TO anon, authenticated
USING (active = true);

CREATE POLICY "Tenant admin can manage own service categories"
ON public.service_categories FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
)
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

-- 8.2 Services Policies
CREATE POLICY "Public can view active services"
ON public.services FOR SELECT
TO anon, authenticated
USING (active = true);

CREATE POLICY "Tenant admin can manage own services"
ON public.services FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
)
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

-- 8.3 Professionals Policies
-- Public view: only active professionals; private contact info is filtered in repository/API
CREATE POLICY "Public can view active professionals"
ON public.professionals FOR SELECT
TO anon, authenticated
USING (active = true);

CREATE POLICY "Tenant admin can manage own professionals"
ON public.professionals FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
)
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

-- 8.4 Service Professionals Policies
CREATE POLICY "Public can view service professionals"
ON public.service_professionals FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Tenant admin can manage own service professionals"
ON public.service_professionals FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
)
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);
