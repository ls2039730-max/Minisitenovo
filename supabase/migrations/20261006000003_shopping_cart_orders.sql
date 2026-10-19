-- ==============================================================================
-- SUPABASE POSTGRESQL SHOPPING CART, CHECKOUT & ORDERS SCHEMA MIGRATION
-- Migration: 20261006000003_shopping_cart_orders.sql
-- ==============================================================================

-- 1. Delivery Settings Table
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

-- 2. Delivery Rules Table
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

-- 3. Payment Methods Table
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

-- 4. Visitor Carts Table
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

-- 5. Cart Items Table
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

-- 6. Orders Table
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

-- 7. Order Items (Snapshot) Table
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

-- 8. Order Delivery Addresses Table
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

-- 9. Inventory Movements Table (Stock History & Audit)
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

-- ==============================================
-- 10. INDEXES FOR HIGH PERFORMANCE
-- ==============================================
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

-- ==============================================
-- 11. TRIGGERS FOR updated_at AUTOMATION
-- ==============================================
DROP TRIGGER IF EXISTS trigger_delivery_settings_updated_at ON public.delivery_settings;
CREATE TRIGGER trigger_delivery_settings_updated_at
BEFORE UPDATE ON public.delivery_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_delivery_rules_updated_at ON public.delivery_rules;
CREATE TRIGGER trigger_delivery_rules_updated_at
BEFORE UPDATE ON public.delivery_rules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_payment_methods_updated_at ON public.payment_methods;
CREATE TRIGGER trigger_payment_methods_updated_at
BEFORE UPDATE ON public.payment_methods
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_carts_updated_at ON public.carts;
CREATE TRIGGER trigger_carts_updated_at
BEFORE UPDATE ON public.carts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_cart_items_updated_at ON public.cart_items;
CREATE TRIGGER trigger_cart_items_updated_at
BEFORE UPDATE ON public.cart_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_orders_updated_at ON public.orders;
CREATE TRIGGER trigger_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================
ALTER TABLE public.delivery_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_delivery_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Delivery Settings & Rules: Public can read active configurations
CREATE POLICY "Public can view delivery settings"
ON public.delivery_settings FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Tenant admin can manage delivery settings"
ON public.delivery_settings FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

CREATE POLICY "Public can view active delivery rules"
ON public.delivery_rules FOR SELECT
TO anon, authenticated
USING (is_active = true);

CREATE POLICY "Tenant admin can manage delivery rules"
ON public.delivery_rules FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

-- Payment Methods: Public can view active methods
CREATE POLICY "Public can view active payment methods"
ON public.payment_methods FOR SELECT
TO anon, authenticated
USING (is_active = true);

CREATE POLICY "Tenant admin can manage payment methods"
ON public.payment_methods FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

-- Carts & Cart Items: Anon and Authenticated manage their session carts
CREATE POLICY "Users can manage carts by session"
ON public.carts FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can manage cart items"
ON public.cart_items FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Orders: Strict isolation (Privacy Guard)
-- Public CANNOT view all orders (no SELECT true!).
CREATE POLICY "Tenant admin can view own orders"
ON public.orders FOR SELECT
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

CREATE POLICY "Tenant admin can update own orders"
ON public.orders FOR UPDATE
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

CREATE POLICY "Tenant admin can view order items"
ON public.order_items FOR SELECT
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

CREATE POLICY "Tenant admin can view order addresses"
ON public.order_delivery_addresses FOR SELECT
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);

CREATE POLICY "Tenant admin can view inventory movements"
ON public.inventory_movements FOR SELECT
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
);
