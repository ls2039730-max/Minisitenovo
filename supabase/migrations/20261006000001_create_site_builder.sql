-- ==============================================================================
-- SUPABASE POSTGRESQL SITE BUILDER MIGRATION
-- Migration: 20261006000001_create_site_builder.sql
-- ==============================================================================

-- 1. Sites table (Mini-sites for local business tenants)
CREATE TABLE IF NOT EXISTS public.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL DEFAULT 'moderno',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  draft_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_data JSONB DEFAULT NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_tenant_site UNIQUE (tenant_id)
);

-- 2. Site Sections table (Normalized modular block configuration)
CREATE TABLE IF NOT EXISTS public.site_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Site SEO metadata table
CREATE TABLE IF NOT EXISTS public.site_seo (
  site_id UUID PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  keywords TEXT DEFAULT '',
  og_title TEXT DEFAULT '',
  og_description TEXT DEFAULT '',
  og_image TEXT DEFAULT '',
  favicon TEXT DEFAULT '',
  allow_indexing BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Site Versioning & Snapshot History
CREATE TABLE IF NOT EXISTS public.site_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  snapshot JSONB NOT NULL,
  published_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================
-- 5. INDEXES FOR PERFORMANCE
-- ==============================================
CREATE INDEX IF NOT EXISTS idx_sites_tenant_id ON public.sites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sites_status ON public.sites(status);
CREATE INDEX IF NOT EXISTS idx_site_sections_site_id ON public.site_sections(site_id);
CREATE INDEX IF NOT EXISTS idx_site_sections_tenant_id ON public.site_sections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_sections_position ON public.site_sections(position);
CREATE INDEX IF NOT EXISTS idx_site_seo_tenant_id ON public.site_seo(tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_versions_site_id ON public.site_versions(site_id);

-- ==============================================
-- 6. TRIGGERS FOR updated_at
-- ==============================================
DROP TRIGGER IF EXISTS trigger_sites_updated_at ON public.sites;
CREATE TRIGGER trigger_sites_updated_at
BEFORE UPDATE ON public.sites
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_site_sections_updated_at ON public.site_sections;
CREATE TRIGGER trigger_site_sections_updated_at
BEFORE UPDATE ON public.site_sections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_site_seo_updated_at ON public.site_seo;
CREATE TRIGGER trigger_site_seo_updated_at
BEFORE UPDATE ON public.site_seo
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_seo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_versions ENABLE ROW LEVEL SECURITY;

-- Public can view published sites
CREATE POLICY "Public can view published sites"
ON public.sites FOR SELECT
TO anon, authenticated
USING (
  status = 'published' AND
  tenant_id IN (
    SELECT id FROM public.tenants
    WHERE deleted_at IS NULL
      AND status IN ('ativo', 'teste', 'pagamento_pendente', 'atrasado')
  )
);

-- Tenant admins and super admins can view and edit their site
CREATE POLICY "Tenants and Super Admin can manage sites"
ON public.sites FOR ALL
TO authenticated
USING (public.user_has_tenant_access(tenant_id))
WITH CHECK (public.user_has_tenant_access(tenant_id));

-- Public can view published site sections
CREATE POLICY "Public can view published site sections"
ON public.site_sections FOR SELECT
TO anon, authenticated
USING (
  is_enabled = true AND
  site_id IN (
    SELECT id FROM public.sites
    WHERE status = 'published' AND tenant_id IN (
      SELECT id FROM public.tenants
      WHERE deleted_at IS NULL AND status IN ('ativo', 'teste', 'pagamento_pendente', 'atrasado')
    )
  )
);

-- Tenant admins can manage site sections
CREATE POLICY "Tenants can manage site sections"
ON public.site_sections FOR ALL
TO authenticated
USING (public.user_has_tenant_access(tenant_id))
WITH CHECK (public.user_has_tenant_access(tenant_id));

-- Tenant admins can manage site SEO
CREATE POLICY "Tenants can manage site SEO"
ON public.site_seo FOR ALL
TO authenticated
USING (public.user_has_tenant_access(tenant_id))
WITH CHECK (public.user_has_tenant_access(tenant_id));

-- Public can view published site SEO
CREATE POLICY "Public can view published site SEO"
ON public.site_seo FOR SELECT
TO anon, authenticated
USING (
  site_id IN (
    SELECT id FROM public.sites
    WHERE status = 'published' AND tenant_id IN (
      SELECT id FROM public.tenants
      WHERE deleted_at IS NULL AND status IN ('ativo', 'teste', 'pagamento_pendente', 'atrasado')
    )
  )
);

-- Tenant admins can view site versions
CREATE POLICY "Tenants can view site versions"
ON public.site_versions FOR SELECT
TO authenticated
USING (public.user_has_tenant_access(tenant_id));
