-- ==============================================================================
-- LOCALHUB SAAS - SCRIPT SQL COMPLETO DE INICIALIZAÇÃO DO SUPABASE
-- Este script cria todas as extensões, tabelas, relacionamentos, índices, 
-- triggers de updated_at, funções de segurança, buckets de storage, 
-- políticas de RLS e dados iniciais (Features e Planos padrão).
-- Execute diretamente no SQL Editor do seu projeto Supabase.
-- ==============================================================================

-- 1. EXTENSÕES POSTGRESQL NECESSÁRIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABELAS: CORE SAAS & MULTI-TENANCY
-- ==============================================================================

-- Tabela de Planos de Assinatura
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Catálogo Geral de Funcionalidades (Features)
CREATE TABLE IF NOT EXISTS public.features (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('core', 'vendas', 'atendimento', 'marketing')),
  icon TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Vínculo de Features incluídas em cada Plano
CREATE TABLE IF NOT EXISTS public.plan_features (
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES public.features(key) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (plan_id, feature_key)
);

-- Empresas / Estabelecimentos (Tenants)
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
  street TEXT,
  number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  cep TEXT,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Configurações Visuais e Aparência do Tenant
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

-- Sobrescritas de Features por Tenant (Overrides)
CREATE TABLE IF NOT EXISTS public.tenant_features (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES public.features(key) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (tenant_id, feature_key)
);

-- Usuários e Papéis vinculados aos Tenants (Supabase Auth)
CREATE TABLE IF NOT EXISTS public.tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE, -- NULL para Super Admins globais
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'CLIENT_ADMIN' CHECK (role IN ('SUPER_ADMIN', 'CLIENT_ADMIN', 'OWNER', 'MANAGER', 'EMPLOYEE', 'PROFESSIONAL')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'invited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_tenant_user UNIQUE (tenant_id, user_id)
);

-- Logs de Auditoria e Rastreabilidade
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_user_name TEXT,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  diff JSONB DEFAULT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 3. TABELAS: CONSTRUTOR DE MINI SITES (SITE BUILDER)
-- ==============================================================================

-- Sites dos Tenants
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

-- Seções / Blocos Modulares do Site
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

-- Metadados SEO do Site
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

-- Histórico de Versões Publicadas
CREATE TABLE IF NOT EXISTS public.site_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  snapshot JSONB NOT NULL,
  published_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 4. TABELAS: CATÁLOGO DE PRODUTOS, VARIAÇÕES E ESTOQUE (ETAPA 3A)
-- ==============================================================================

-- Categorias de Produtos
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

-- Produtos
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

-- Imagens dos Produtos
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

-- Variações de Produtos (Tamanho, Cor, Volume, etc.)
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

-- ==============================================================================
-- 5. TABELAS: CARRINHO, ENTREGA, PAGAMENTO E PEDIDOS (ETAPA 3B)
-- ==============================================================================

-- Configurações de Delivery e Retirada
CREATE TABLE IF NOT EXISTS public.delivery_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  orders_enabled BOOLEAN NOT NULL DEFAULT true,
  accept_orders_when_closed BOOLEAN NOT NULL DEFAULT true,
  pickup_enabled BOOLEAN NOT NULL DEFAULT true,
  delivery_enabled BOOLEAN NOT NULL DEFAULT true,
  minimum_order NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (minimum_order >= 0),
  free_delivery_above NUMERIC(12, 2) DEFAULT NULL CHECK (free_delivery_above IS NULL OR free_delivery_above >= 0),
  pickup_instructions TEXT DEFAULT 'Retire no balcão apresentando o número do pedido.',
  delivery_estimate_text TEXT DEFAULT '40 a 60 minutos',
  order_whatsapp_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Regras de Taxa de Entrega (Fixo, Bairro ou Faixa de CEP)
CREATE TABLE IF NOT EXISTS public.delivery_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('fixed', 'neighborhood', 'cep_range')),
  name TEXT NOT NULL,
  neighborhood TEXT,
  cep_start TEXT,
  cep_end TEXT,
  fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (fee >= 0),
  minimum_order NUMERIC(12, 2) DEFAULT NULL CHECK (minimum_order IS NULL OR minimum_order >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Formas de Pagamento Aceitas
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('PIX', 'CASH', 'CREDIT_CARD_ON_DELIVERY', 'DEBIT_CARD_ON_DELIVERY', 'PAYMENT_ON_PICKUP')),
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_tenant_payment_type UNIQUE (tenant_id, type)
);

-- Carrinhos de Visitantes
CREATE TABLE IF NOT EXISTS public.carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'converted', 'abandoned', 'expired')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_tenant_session_cart UNIQUE (tenant_id, session_id)
);

-- Itens do Carrinho do Visitante
CREATE TABLE IF NOT EXISTS public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 99),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Pedidos (Orders)
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_number INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('pickup', 'delivery')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('PIX', 'CASH', 'CREDIT_CARD_ON_DELIVERY', 'DEBIT_CARD_ON_DELIVERY', 'PAYMENT_ON_PICKUP')),
  change_for NUMERIC(12, 2) DEFAULT NULL CHECK (change_for IS NULL OR change_for >= 0),
  subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (delivery_fee >= 0),
  total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'IN_SERVICE', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED')),
  notes TEXT,
  idempotency_key TEXT,
  whatsapp_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_tenant_order_number UNIQUE (tenant_id, order_number),
  CONSTRAINT unique_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

-- Itens Gravados do Pedido (Snapshot Imutável)
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  variant_name TEXT,
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Endereço de Entrega do Pedido
CREATE TABLE IF NOT EXISTS public.order_delivery_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cep TEXT NOT NULL,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  complement TEXT,
  neighborhood TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  reference TEXT,
  delivery_rule_id UUID REFERENCES public.delivery_rules(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Histórico de Movimentações de Estoque (Auditoria)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('ORDER', 'ORDER_CANCEL', 'ADJUSTMENT')),
  quantity INTEGER NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 6. ÍNDICES DE PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_plan ON public.tenants(plan_id);
CREATE INDEX IF NOT EXISTS idx_tenants_created_at ON public.tenants(created_at);

CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON public.tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON public.tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_role ON public.tenant_users(role);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sites_tenant_id ON public.sites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sites_status ON public.sites(status);
CREATE INDEX IF NOT EXISTS idx_site_sections_site_id ON public.site_sections(site_id);
CREATE INDEX IF NOT EXISTS idx_site_sections_tenant_id ON public.site_sections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_sections_position ON public.site_sections(position);
CREATE INDEX IF NOT EXISTS idx_site_seo_tenant_id ON public.site_seo(tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_versions_site_id ON public.site_versions(site_id);

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
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_tenant_id ON public.product_variants(tenant_id);

CREATE INDEX IF NOT EXISTS idx_delivery_settings_tenant_id ON public.delivery_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_delivery_rules_tenant_id ON public.delivery_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_tenant_id ON public.payment_methods(tenant_id);

CREATE INDEX IF NOT EXISTS idx_carts_tenant_session ON public.carts(tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items(cart_id);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_id ON public.orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(tenant_id, order_number);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_delivery_addresses_order_id ON public.order_delivery_addresses(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_reference ON public.inventory_movements(reference_id);

-- ==============================================================================
-- 7. FUNÇÕES E TRIGGERS DE UPDATED_AT AUTOMÁTICO
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trigger_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trigger_tenant_settings_updated_at BEFORE UPDATE ON public.tenant_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trigger_tenant_features_updated_at BEFORE UPDATE ON public.tenant_features FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trigger_tenant_users_updated_at BEFORE UPDATE ON public.tenant_users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trigger_sites_updated_at BEFORE UPDATE ON public.sites FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trigger_site_sections_updated_at BEFORE UPDATE ON public.site_sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trigger_site_seo_updated_at BEFORE UPDATE ON public.site_seo FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trigger_product_categories_updated_at BEFORE UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trigger_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trigger_product_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trigger_delivery_settings_updated_at BEFORE UPDATE ON public.delivery_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trigger_delivery_rules_updated_at BEFORE UPDATE ON public.delivery_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trigger_payment_methods_updated_at BEFORE UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trigger_carts_updated_at BEFORE UPDATE ON public.carts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trigger_cart_items_updated_at BEFORE UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER trigger_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 8. FUNÇÕES DE SUPORTE À SEGURANÇA (SECURITY DEFINER)
-- ==============================================================================

-- Verifica se o usuário atual é Super Admin
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

-- Verifica se o usuário atual tem permissão para gerenciar o tenant alvo
CREATE OR REPLACE FUNCTION public.user_has_tenant_access(target_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
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

-- Gerador seguro de número amigável sequencial de pedido por tenant (#1001, #1002, ...)
CREATE OR REPLACE FUNCTION public.get_next_order_number(p_tenant_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_next INTEGER;
BEGIN
  SELECT COALESCE(MAX(order_number), 1000) + 1
  INTO v_next
  FROM public.orders
  WHERE tenant_id = p_tenant_id;

  RETURN v_next;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==============================================================================
-- 9. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_seo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_delivery_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 10. POLÍTICAS DE RLS (ROW LEVEL SECURITY)
-- ==============================================================================

-- Plans & Features
CREATE POLICY "Plans: Leitura pública e autenticada" ON public.plans FOR SELECT USING (true);
CREATE POLICY "Plans: Gestão exclusiva Super Admin" ON public.plans FOR ALL TO authenticated USING (public.is_super_admin());

CREATE POLICY "Features: Leitura pública e autenticada" ON public.features FOR SELECT USING (true);
CREATE POLICY "Features: Gestão exclusiva Super Admin" ON public.features FOR ALL TO authenticated USING (public.is_super_admin());

CREATE POLICY "Plan Features: Leitura pública e autenticada" ON public.plan_features FOR SELECT USING (true);
CREATE POLICY "Plan Features: Gestão exclusiva Super Admin" ON public.plan_features FOR ALL TO authenticated USING (public.is_super_admin());

-- Tenants
CREATE POLICY "Tenants: Leitura para membros ou Super Admin"
ON public.tenants FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL AND (
    public.is_super_admin() OR
    id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() AND status = 'active')
  )
);

CREATE POLICY "Tenants: Criação por Super Admin" ON public.tenants FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY "Tenants: Atualização por membros ou Super Admin" ON public.tenants FOR UPDATE TO authenticated USING (public.user_has_tenant_access(id)) WITH CHECK (public.user_has_tenant_access(id));
CREATE POLICY "Tenants: Exclusão exclusiva Super Admin" ON public.tenants FOR DELETE TO authenticated USING (public.is_super_admin());

-- Tenant Settings & Features
CREATE POLICY "Tenant Settings: Leitura com acesso" ON public.tenant_settings FOR SELECT USING (public.user_has_tenant_access(tenant_id) OR true);
CREATE POLICY "Tenant Settings: Atualização por membros" ON public.tenant_settings FOR UPDATE TO authenticated USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY "Tenant Settings: Criação por Super Admin" ON public.tenant_settings FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

CREATE POLICY "Tenant Features: Leitura com acesso" ON public.tenant_features FOR SELECT USING (public.user_has_tenant_access(tenant_id) OR true);
CREATE POLICY "Tenant Features: Gestão exclusiva Super Admin" ON public.tenant_features FOR ALL TO authenticated USING (public.is_super_admin());

-- Tenant Users
CREATE POLICY "Tenant Users: Leitura do próprio vínculo ou equipe" ON public.tenant_users FOR SELECT TO authenticated USING (public.is_super_admin() OR tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() AND status = 'active'));
CREATE POLICY "Tenant Users: Gestão por Super Admin" ON public.tenant_users FOR ALL TO authenticated USING (public.is_super_admin());

-- Audit Logs
CREATE POLICY "Audit Logs: Acesso exclusivo Super Admin" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_super_admin());

-- Sites e Construtor
CREATE POLICY "Sites: Leitura pública de sites publicados" ON public.sites FOR SELECT USING (status = 'published');
CREATE POLICY "Sites: Gestão por membros do tenant ou Super Admin" ON public.sites FOR ALL TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Site Sections: Leitura pública de seções ativas" ON public.site_sections FOR SELECT USING (is_enabled = true);
CREATE POLICY "Site Sections: Gestão por membros do tenant" ON public.site_sections FOR ALL TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Site SEO: Leitura pública" ON public.site_seo FOR SELECT USING (true);
CREATE POLICY "Site SEO: Gestão por membros do tenant" ON public.site_seo FOR ALL TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Site Versions: Gestão por membros do tenant" ON public.site_versions FOR ALL TO authenticated USING (public.user_has_tenant_access(tenant_id));

-- Produtos & Categorias
CREATE POLICY "Categorias: Leitura pública de ativas" ON public.product_categories FOR SELECT USING (is_active = true);
CREATE POLICY "Categorias: Gestão por membros do tenant" ON public.product_categories FOR ALL TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Produtos: Leitura pública de ativos" ON public.products FOR SELECT USING (is_active = true);
CREATE POLICY "Produtos: Gestão por membros do tenant" ON public.products FOR ALL TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Imagens de Produtos: Leitura pública" ON public.product_images FOR SELECT USING (true);
CREATE POLICY "Imagens de Produtos: Gestão por membros do tenant" ON public.product_images FOR ALL TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Variações: Leitura pública de ativas" ON public.product_variants FOR SELECT USING (is_active = true);
CREATE POLICY "Variações: Gestão por membros do tenant" ON public.product_variants FOR ALL TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));

-- Carrinho do Visitante
CREATE POLICY "Carts: Visitantes gerenciam suas sessões" ON public.carts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Cart Items: Visitantes gerenciam seus itens" ON public.cart_items FOR ALL USING (true) WITH CHECK (true);

-- Configurações de Entrega e Pagamento
CREATE POLICY "Delivery Settings: Leitura pública" ON public.delivery_settings FOR SELECT USING (true);
CREATE POLICY "Delivery Settings: Gestão por membros do tenant" ON public.delivery_settings FOR ALL TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Delivery Rules: Leitura pública de regras ativas" ON public.delivery_rules FOR SELECT USING (is_active = true);
CREATE POLICY "Delivery Rules: Gestão por membros do tenant" ON public.delivery_rules FOR ALL TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Payment Methods: Leitura pública de formas ativas" ON public.payment_methods FOR SELECT USING (is_active = true);
CREATE POLICY "Payment Methods: Gestão por membros do tenant" ON public.payment_methods FOR ALL TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));

-- Pedidos (Isolamento Estrito - Sem visualização pública aberta)
CREATE POLICY "Orders: Gestão por membros do tenant ou Super Admin" ON public.orders FOR ALL TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));
CREATE POLICY "Order Items: Visualização por membros do tenant" ON public.order_items FOR ALL TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));
CREATE POLICY "Order Addresses: Visualização por membros do tenant" ON public.order_delivery_addresses FOR ALL TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));
CREATE POLICY "Inventory Movements: Visualização por membros do tenant" ON public.inventory_movements FOR ALL TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));

-- ==============================================================================
-- 11. BUCKETS DE STORAGE DO SUPABASE & POLÍTICAS DE ARQUIVOS
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('tenant-media', 'tenant-media', true),
  ('products', 'products', true),
  ('sites', 'sites', true)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública de mídias de tenants
CREATE POLICY "Public media access" ON storage.objects FOR SELECT USING (bucket_id IN ('tenant-media', 'products', 'sites'));

-- Upload autenticado com isolamento por pasta de tenant
CREATE POLICY "Tenant media upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('tenant-media', 'products', 'sites') AND
  (public.is_super_admin() OR (storage.foldername(name))[1]::uuid IN (
    SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() AND status = 'active'
  ))
);

-- ==============================================================================
-- 12. DADOS INICIAIS (SEEDS): FEATURES DO SISTEMA E PLANOS PADRÃO
-- ==============================================================================

-- Inserção das Funcionalidades Disponíveis no LocalHub
INSERT INTO public.features (key, name, description, category, icon)
VALUES
  ('site_editor', 'Editor do Site', 'Personalização visual e blocos da página digital do negócio.', 'core', 'Layout'),
  ('whatsapp', 'Botão WhatsApp', 'Direcionamento direto com mensagem personalizada para atendimento.', 'core', 'MessageSquare'),
  ('social_links', 'Links & Redes Sociais', 'Botões de Instagram, Facebook, TikTok e contatos integrados.', 'core', 'Share2'),
  ('google_reviews', 'Avaliações Google', 'Exibição de depoimentos e incentivo a avaliações.', 'marketing', 'Star'),
  ('qr_code', 'Gerador de QR Code', 'QR Code dinâmico para mesas, balcão e material impresso.', 'marketing', 'QrCode'),
  ('services', 'Catálogo de Serviços', 'Listagem de procedimentos, durações e preços oferecidos.', 'atendimento', 'Sparkles'),
  ('appointments', 'Agenda & Horários', 'Módulo de agendamento online de horários para clientes.', 'atendimento', 'Calendar'),
  ('professionals', 'Equipe & Profissionais', 'Vinculação de membros da equipe com suas especialidades.', 'atendimento', 'Users'),
  ('coupons', 'Cupons & Descontos', 'Criação de cupons promocionais para fidelização.', 'marketing', 'Tag'),
  ('analytics', 'Métricas & Acessos', 'Contador de visualizações e taxas de conversão.', 'marketing', 'BarChart2'),
  ('products', 'Catálogo de Produtos', 'Vitrine digital com fotos, variações e controle de estoque.', 'vendas', 'ShoppingBag'),
  ('shopping_cart', 'Carrinho de Compras', 'Seleção de múltiplos itens e fechamento de pedidos.', 'vendas', 'ShoppingCart'),
  ('delivery', 'Módulo Delivery', 'Cálculo de taxa de entrega, bairros atendidos e retirada.', 'vendas', 'Truck'),
  ('wifi', 'Wi-Fi Marketing', 'Captura de contatos ao conectar na rede Wi-Fi.', 'marketing', 'Wifi'),
  ('custom_domain', 'Domínio Próprio', 'Uso de domínio customizado (ex: seunegocio.com.br).', 'core', 'Globe')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon;

-- Inserção dos Planos Padrão
INSERT INTO public.plans (id, name, description, price, status)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'Essencial', 'Ideal para negócios locais que precisam de presença digital rápida e confiável.', 89.00, 'active'),
  ('22222222-2222-4222-8222-222222222222', 'Pro', 'Perfeito para prestadores de serviços, clínicas, salões e barbearias.', 179.00, 'active'),
  ('33333333-3333-4333-8333-333333333333', 'Premium', 'Solução completa com delivery, catálogo de produtos, Wi-Fi marketing e domínio próprio.', 299.00, 'active')
ON CONFLICT (id) DO NOTHING;

-- Vínculo das Features aos Planos
INSERT INTO public.plan_features (plan_id, feature_key)
VALUES
  -- Essencial
  ('11111111-1111-4111-8111-111111111111', 'site_editor'),
  ('11111111-1111-4111-8111-111111111111', 'whatsapp'),
  ('11111111-1111-4111-8111-111111111111', 'social_links'),
  ('11111111-1111-4111-8111-111111111111', 'google_reviews'),
  ('11111111-1111-4111-8111-111111111111', 'qr_code'),
  -- Pro (+ serviços e agenda)
  ('22222222-2222-4222-8222-222222222222', 'site_editor'),
  ('22222222-2222-4222-8222-222222222222', 'whatsapp'),
  ('22222222-2222-4222-8222-222222222222', 'social_links'),
  ('22222222-2222-4222-8222-222222222222', 'google_reviews'),
  ('22222222-2222-4222-8222-222222222222', 'qr_code'),
  ('22222222-2222-4222-8222-222222222222', 'services'),
  ('22222222-2222-4222-8222-222222222222', 'appointments'),
  ('22222222-2222-4222-8222-222222222222', 'professionals'),
  ('22222222-2222-4222-8222-222222222222', 'coupons'),
  ('22222222-2222-4222-8222-222222222222', 'analytics'),
  -- Premium (+ produtos, carrinho e delivery)
  ('33333333-3333-4333-8333-333333333333', 'site_editor'),
  ('33333333-3333-4333-8333-333333333333', 'whatsapp'),
  ('33333333-3333-4333-8333-333333333333', 'social_links'),
  ('33333333-3333-4333-8333-333333333333', 'google_reviews'),
  ('33333333-3333-4333-8333-333333333333', 'qr_code'),
  ('33333333-3333-4333-8333-333333333333', 'services'),
  ('33333333-3333-4333-8333-333333333333', 'appointments'),
  ('33333333-3333-4333-8333-333333333333', 'professionals'),
  ('33333333-3333-4333-8333-333333333333', 'coupons'),
  ('33333333-3333-4333-8333-333333333333', 'analytics'),
  ('33333333-3333-4333-8333-333333333333', 'products'),
  ('33333333-3333-4333-8333-333333333333', 'shopping_cart'),
  ('33333333-3333-4333-8333-333333333333', 'delivery'),
  ('33333333-3333-4333-8333-333333333333', 'wifi'),
  ('33333333-3333-4333-8333-333333333333', 'custom_domain')
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- ==============================================================================
-- 13. USUÁRIO SUPER ADMIN E EMPRESA DEMO INICIAL
-- ==============================================================================

-- 13.1 Criar usuário Super Admin no Supabase Auth e em tenant_users
DO $$
DECLARE
  v_admin_id UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_client_id UUID := '11111111-aaaa-4111-8aaa-111111111111';
  v_tenant_id UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_plan_pro_id UUID := '22222222-2222-4222-8222-222222222222';
BEGIN
  -- Criação do Super Admin (admin@localhub.com / admin123)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@localhub.com') THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      role,
      aud
    ) VALUES (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      'admin@localhub.com',
      crypt('admin123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"name":"Administrador da Plataforma","phone":"(11) 99999-0000"}',
      now(),
      now(),
      'authenticated',
      'authenticated'
    );
  ELSE
    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@localhub.com';
    UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now()) WHERE id = v_admin_id;
  END IF;

  -- Vincular Super Admin em public.tenant_users
  INSERT INTO public.tenant_users (
    id,
    tenant_id,
    user_id,
    role,
    status,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    NULL,
    v_admin_id,
    'SUPER_ADMIN',
    'active',
    now(),
    now()
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'SUPER_ADMIN', status = 'active';

  -- 13.2 Empresa Inicial de Exemplo (Barbearia Prime)
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE slug = 'barbearia-prime') THEN
    INSERT INTO public.tenants (
      id,
      name,
      slug,
      segment,
      cnpj,
      phone,
      whatsapp,
      email,
      plan_id,
      status,
      owner_name,
      owner_email,
      owner_phone,
      subdomain,
      notes,
      created_at,
      updated_at
    ) VALUES (
      v_tenant_id,
      'Barbearia Prime',
      'barbearia-prime',
      'Barbearia & Estética Masculina',
      '12.345.678/0001-90',
      '(11) 98765-4321',
      '11987654321',
      'contato@barbeariaprime.com',
      v_plan_pro_id,
      'ativo',
      'Carlos Eduardo Silva',
      'contato@barbeariaprime.com',
      '(11) 98765-4321',
      'barbearia-prime.meudominio.com',
      'Empresa modelo de demonstração',
      now(),
      now()
    );

    -- Configurações visuais da Barbearia Prime
    INSERT INTO public.tenant_settings (
      tenant_id,
      primary_color,
      secondary_color,
      accent_color,
      font_family,
      tagline,
      created_at,
      updated_at
    ) VALUES (
      v_tenant_id,
      '#1e293b',
      '#ca8a04',
      '#f59e0b',
      'Inter',
      'Corte tradicional e cuidados modernos para o homem exigente.',
      now(),
      now()
    ) ON CONFLICT (tenant_id) DO NOTHING;

    -- Criação do Usuário Cliente (contato@barbeariaprime.com / cliente123)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'contato@barbeariaprime.com') THEN
      INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        role,
        aud
      ) VALUES (
        v_client_id,
        '00000000-0000-0000-0000-000000000000',
        'contato@barbeariaprime.com',
        crypt('cliente123', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}',
        '{"name":"Carlos Eduardo Silva","phone":"(11) 98765-4321"}',
        now(),
        now(),
        'authenticated',
        'authenticated'
      );
    ELSE
      SELECT id INTO v_client_id FROM auth.users WHERE email = 'contato@barbeariaprime.com';
      UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now()) WHERE id = v_client_id;
    END IF;

    -- Vincular Carlos à Barbearia Prime
    INSERT INTO public.tenant_users (
      id,
      tenant_id,
      user_id,
      role,
      status,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_tenant_id,
      v_client_id,
      'CLIENT_ADMIN',
      'active',
      now(),
      now()
    ) ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'CLIENT_ADMIN', status = 'active';
  END IF;

END $$;

-- ==============================================================================
-- 14. MÓDULO DE SERVIÇOS E PROFISSIONAIS (ETAPA 4A)
-- ==============================================================================

-- 14.1 Categorias de Serviços
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

-- 14.2 Serviços
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

-- 14.3 Profissionais
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

-- 14.4 Relacionamento Serviços e Profissionais
CREATE TABLE IF NOT EXISTS public.service_professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_service_professional UNIQUE (service_id, professional_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_service_categories_tenant_id ON public.service_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_services_tenant_id ON public.services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_professionals_tenant_id ON public.professionals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_professionals_tenant_id ON public.service_professionals(tenant_id);

-- RLS
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active service categories" ON public.service_categories FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "Tenant admin can manage own service categories" ON public.service_categories FOR ALL TO authenticated
USING (tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1) OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN'));

CREATE POLICY "Public can view active services" ON public.services FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "Tenant admin can manage own services" ON public.services FOR ALL TO authenticated
USING (tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1) OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN'));

CREATE POLICY "Public can view active professionals" ON public.professionals FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "Tenant admin can manage own professionals" ON public.professionals FOR ALL TO authenticated
USING (tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1) OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN'));

CREATE POLICY "Public can view service professionals" ON public.service_professionals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Tenant admin can manage own service professionals" ON public.service_professionals FOR ALL TO authenticated
USING (tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1) OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN'));

-- ==============================================================================
-- 15. AGENDAMENTOS E GESTÃO DE AGENDA (ETAPA 4B)
-- ==============================================================================

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

ALTER TABLE public.appointment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;


