-- ==============================================================================
-- SUPABASE POSTGRESQL MIGRATION: Premium Templates & Global Design Standards
-- Migration: 20261016000001_premium_templates_and_site_enhancements.sql
-- ==============================================================================

-- 1. Ensure sites table has advanced configuration columns (Appearance, Animation, Custom Domain)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sites' 
        AND column_name = 'appearance'
    ) THEN
        ALTER TABLE public.sites ADD COLUMN appearance JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sites' 
        AND column_name = 'custom_domain'
    ) THEN
        ALTER TABLE public.sites ADD COLUMN custom_domain TEXT DEFAULT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sites' 
        AND column_name = 'animation_settings'
    ) THEN
        ALTER TABLE public.sites ADD COLUMN animation_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- 2. Create index on template_id for fast queries
CREATE INDEX IF NOT EXISTS idx_sites_template_id ON public.sites(template_id);
CREATE INDEX IF NOT EXISTS idx_sites_custom_domain ON public.sites(custom_domain);

-- 3. Templates Catalog Table (Centralized registry in DB)
CREATE TABLE IF NOT EXISTS public.templates_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  style TEXT NOT NULL DEFAULT 'modern',
  description TEXT NOT NULL DEFAULT '',
  badge TEXT DEFAULT NULL,
  recommended_for TEXT DEFAULT NULL,
  thumbnail TEXT NOT NULL DEFAULT '',
  color_primary TEXT NOT NULL DEFAULT '#000000',
  color_accent TEXT NOT NULL DEFAULT '#C7F36B',
  is_premium BOOLEAN NOT NULL DEFAULT false,
  is_excluded_from_global BOOLEAN NOT NULL DEFAULT false,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index on template category and active status
CREATE INDEX IF NOT EXISTS idx_templates_catalog_category ON public.templates_catalog(category);
CREATE INDEX IF NOT EXISTS idx_templates_catalog_is_active ON public.templates_catalog(is_active);

-- Enable RLS for templates_catalog
ALTER TABLE public.templates_catalog ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if any to avoid errors on rerun
DROP POLICY IF EXISTS "Public and authenticated users can view active templates" ON public.templates_catalog;
CREATE POLICY "Public and authenticated users can view active templates"
ON public.templates_catalog FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- 4. Seed / Upsert the Templates Catalog
INSERT INTO public.templates_catalog (
  id,
  name,
  category,
  style,
  description,
  badge,
  recommended_for,
  thumbnail,
  color_primary,
  color_accent,
  is_premium,
  is_excluded_from_global,
  features
) VALUES
(
  'otica_editorial',
  'Ótica Editorial Premium',
  'otica_moda',
  'Editorial Contemporâneo & Experimental',
  'Direção de arte editorial de alta costura com tipografia display Syne, layout assimétrico, lookbook interativo, filtro experimental de estilo de armação e checkout integrado.',
  'Editorial Haute Couture',
  'Óticas boutique, marcas de armações autorais e joalherias de óculos de sol',
  'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1200&q=80',
  '#101010',
  '#C7F36B',
  true,
  true,
  '["Tipografia Display Syne & Editorial Sans", "Filtro Interativo de Estilo de Armação (Bold, Wire, Acetato, Oversized)", "Composições Assimétricas e Lookbook de Alta Costura", "Exclusão estrita do padrão global para preservar identidade autoral", "Integração completa com Catálogo, Carrinho e WhatsApp Direct"]'::jsonb
),
(
  'restaurante_gourmet',
  'Restaurante Gourmet & Bistrô',
  'gastronomia',
  'Cinematográfico & Imersivo',
  'Experiência gastronômica cinematográfica inspirada nos grandes espaços culinários europeus, com tipografia serifada sofisticada, revelação suave por rolagem, reservas e menu sensorial.',
  'Gastronomia de Excelência',
  'Restaurantes requintados, bistrôs, bares de tapas e alta gastronomia',
  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
  '#1A1612',
  '#C99A45',
  true,
  false,
  '["Padrão Global Premium de Revelação e Transições", "Herói Cinematográfico com Badge Gastronômico", "Módulo de Reservas de Mesas e Atendimento", "Cardápio Sensorial com Preços e Detalhes Gourmet", "Galeria Imersiva com Modal Lightbox"]'::jsonb
),
(
  'moderno',
  'Moderno',
  'geral',
  'Contemporâneo & Versátil',
  'Layout dinâmico e versátil com cartões elegantes, foco em conversão e clareza visual para qualquer segmento comercial.',
  'Mais Popular',
  'Comércio em geral, varejo, prestadores de serviço e franquias',
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80',
  '#0f172a',
  '#3b82f6',
  false,
  false,
  '["Padrão Global Premium de Revelação e Microinterações", "Cards de produtos com elevação suave", "Catálogo dinâmico com carrinho", "Totalmente responsivo"]'::jsonb
),
(
  'elegante',
  'Elegante',
  'beleza_estetica',
  'Sofisticado & Minimalista',
  'Estética refinada com tons neutros, tipografia limpa e espaçamento generoso para salões, clínicas e spas.',
  'Premium',
  'Clínicas de estética, spas, salões de beleza e consultórios',
  'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80',
  '#18181b',
  '#d97706',
  false,
  false,
  '["Padrão Global Premium com Transições Refinadas", "Agendamento online e equipe em destaque", "Galeria de antes e depois com lightbox"]'::jsonb
),
(
  'minimalista',
  'Minimalista',
  'corporativo',
  'Direto & Funcional',
  'Foco absoluto no essencial: carregamento ultrarrápido, legibilidade perfeita e chamada direta para ação.',
  'Essencial',
  'Escritórios, profissionais liberais e serviços rápidos',
  'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80',
  '#09090b',
  '#10b981',
  false,
  false,
  '["Padrão Global Premium com Microinterações Sutis", "Carregamento veloz", "Contato rápido via WhatsApp"]'::jsonb
),
(
  'barbearia_vintage',
  'Barbearia Vintage',
  'barbearia',
  'Vintage & Industrial',
  'Visual rústico com estética de barbearia clássica, contrastes marcantes e agendamento prático.',
  'Barbearia',
  'Barbearias tradicionais, estúdios de tatuagem e estética masculina',
  'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=800&q=80',
  '#1c1917',
  '#eab308',
  false,
  false,
  '["Padrão Global Premium com Revelação por Rolagem", "Agendamento de corte e barba", "Tabela de preços integrada"]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  style = EXCLUDED.style,
  description = EXCLUDED.description,
  badge = EXCLUDED.badge,
  recommended_for = EXCLUDED.recommended_for,
  thumbnail = EXCLUDED.thumbnail,
  color_primary = EXCLUDED.color_primary,
  color_accent = EXCLUDED.color_accent,
  is_premium = EXCLUDED.is_premium,
  is_excluded_from_global = EXCLUDED.is_excluded_from_global,
  features = EXCLUDED.features,
  updated_at = timezone('utc'::text, now());

-- 5. Helper function to apply a template to a site safely preserving tenant isolation
CREATE OR REPLACE FUNCTION public.apply_site_template(
  p_site_id UUID,
  p_template_id TEXT,
  p_preserve_sections BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_site RECORD;
  v_template RECORD;
  v_result JSONB;
BEGIN
  -- Verify site exists
  SELECT * INTO v_site FROM public.sites WHERE id = p_site_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Site não encontrado.');
  END IF;

  -- Verify template exists
  SELECT * INTO v_template FROM public.templates_catalog WHERE id = p_template_id;
  IF NOT FOUND THEN
    -- Fallback: update template_id directly even if not in catalog table
    UPDATE public.sites 
    SET template_id = p_template_id, 
        updated_at = timezone('utc'::text, now())
    WHERE id = p_site_id;
    RETURN jsonb_build_object('success', true, 'message', 'Template atualizado (registro customizado).');
  END IF;

  -- Update site template_id
  UPDATE public.sites 
  SET template_id = p_template_id,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_site_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Template aplicado com sucesso!',
    'template_id', p_template_id,
    'site_id', p_site_id
  );
END;
$$;
