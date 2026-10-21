-- ============================================================================
-- Migration: Sistema Completo de Entrega por Km, por Bairro e Híbrido (Bairro + Km)
-- Isolamento Multi-Tenant + Geocodificação + Auditoria de Frete no Pedido
-- ============================================================================

-- 1. Campos de endereço e coordenadas na tabela public.tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS cep TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS street TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS number TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS complement TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS neighborhood TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS state TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7) DEFAULT NULL;

-- 2. Campos estendidos na tabela public.delivery_settings
ALTER TABLE public.delivery_settings
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'neighborhood',
  ADD COLUMN IF NOT EXISTS origin_address JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS km_config JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS accept_unlisted_Message TEXT DEFAULT NULL;

-- 3. Campos estendidos na tabela public.delivery_rules (Bairro e Híbrido Bairro + Km)
ALTER TABLE public.delivery_rules
  ADD COLUMN IF NOT EXISTS state TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS minimum_order NUMERIC(10, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS free_delivery_above NUMERIC(10, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS included_distance_km NUMERIC(10, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS extra_km_fee NUMERIC(10, 2) DEFAULT NULL;

-- 4. Campos de auditoria do cálculo de frete em public.order_delivery_addresses
ALTER TABLE public.order_delivery_addresses
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS distance_km NUMERIC(10, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS applied_rule_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_breakdown TEXT DEFAULT NULL;

-- Índices para performance por tenant
CREATE INDEX IF NOT EXISTS idx_delivery_settings_tenant_id ON public.delivery_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_delivery_rules_tenant_id ON public.delivery_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_delivery_addresses_order_id ON public.order_delivery_addresses(order_id);
