-- ==============================================================================
-- SUPABASE POSTGRESQL PRODUCTS & CATALOG SCHEMA MIGRATION
-- Migration: 20261006000002_products.sql
-- ==============================================================================

-- 1. Product Categories Table
CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_tenant_category_slug UNIQUE (tenant_id, slug)
);

-- 2. Products Table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  short_description TEXT,
  description TEXT,
  sku TEXT,
  barcode TEXT,
  price NUMERIC(12, 2) DEFAULT NULL CHECK (price IS NULL OR price >= 0),
  promotional_price NUMERIC(12, 2) DEFAULT NULL CHECK (promotional_price IS NULL OR promotional_price >= 0),
  price_on_request BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  track_stock BOOLEAN NOT NULL DEFAULT false,
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  allow_out_of_stock BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_tenant_product_slug UNIQUE (tenant_id, slug)
);

-- 3. Product Images Table
CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  alt_text TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Product Variants Table
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  price NUMERIC(12, 2) DEFAULT NULL CHECK (price IS NULL OR price >= 0),
  promotional_price NUMERIC(12, 2) DEFAULT NULL CHECK (promotional_price IS NULL OR promotional_price >= 0),
  track_stock BOOLEAN NOT NULL DEFAULT false,
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================
-- 5. INDEXES FOR HIGH PERFORMANCE
-- ==============================================
CREATE INDEX IF NOT EXISTS idx_product_categories_tenant_id ON public.product_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_position ON public.product_categories(position);
CREATE INDEX IF NOT EXISTS idx_product_categories_is_active ON public.product_categories(is_active);

CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON public.products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON public.products(is_featured);
CREATE INDEX IF NOT EXISTS idx_products_position ON public.products(position);
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(tenant_id, slug);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_tenant_id ON public.product_images(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_images_is_primary ON public.product_images(product_id, is_primary);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_tenant_id ON public.product_variants(tenant_id);

-- ==============================================
-- 6. TRIGGERS FOR updated_at AUTOMATION
-- ==============================================
DROP TRIGGER IF EXISTS trigger_product_categories_updated_at ON public.product_categories;
CREATE TRIGGER trigger_product_categories_updated_at
BEFORE UPDATE ON public.product_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_products_updated_at ON public.products;
CREATE TRIGGER trigger_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER trigger_product_variants_updated_at
BEFORE UPDATE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Product Categories Policies
CREATE POLICY "Public can view active product categories"
ON public.product_categories FOR SELECT
TO anon, authenticated
USING (is_active = true);

CREATE POLICY "Tenant admin can view own categories"
ON public.product_categories FOR SELECT
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

CREATE POLICY "Tenant admin can insert own categories"
ON public.product_categories FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

CREATE POLICY "Tenant admin can update own categories"
ON public.product_categories FOR UPDATE
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

CREATE POLICY "Tenant admin can delete own categories"
ON public.product_categories FOR DELETE
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

-- Products Policies
CREATE POLICY "Public can view active products"
ON public.products FOR SELECT
TO anon, authenticated
USING (is_active = true);

CREATE POLICY "Tenant admin can view own products"
ON public.products FOR SELECT
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

CREATE POLICY "Tenant admin can insert own products"
ON public.products FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

CREATE POLICY "Tenant admin can update own products"
ON public.products FOR UPDATE
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

CREATE POLICY "Tenant admin can delete own products"
ON public.products FOR DELETE
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

-- Product Images Policies
CREATE POLICY "Public can view product images"
ON public.product_images FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Tenant admin can manage own product images"
ON public.product_images FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

-- Product Variants Policies
CREATE POLICY "Public can view active product variants"
ON public.product_variants FOR SELECT
TO anon, authenticated
USING (is_active = true);

CREATE POLICY "Tenant admin can manage own product variants"
ON public.product_variants FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

-- ==============================================
-- 8. STORAGE BUCKET POLICIES FOR PRODUCTS
-- ==============================================
-- Media path convention: tenant-media/{tenant_id}/products/{product_id}/filename.ext
CREATE POLICY "Public can read product media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'tenant-media');

CREATE POLICY "Authenticated users can upload product media for their tenant"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-media'
  AND (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
);
