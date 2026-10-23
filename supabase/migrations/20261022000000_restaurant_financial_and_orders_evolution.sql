-- ==============================================================================
-- SUPABASE POSTGRESQL MIGRATION: RESTAURANT FINANCIAL DASHBOARD, PAYMENTS & ORDERS
-- Migration: 20261022000000_restaurant_financial_and_orders_evolution.sql
-- ==============================================================================

-- 1. Add financial tracking columns to public.orders if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'discount'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (payment_status IN ('paid', 'partial', 'pending', 'unpaid', 'cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'paid_amount'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'paid_at'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN paid_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'origin_channel'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN origin_channel TEXT NOT NULL DEFAULT 'online'
      CHECK (origin_channel IN ('online', 'table', 'counter'));
  END IF;
END $$;

-- 2. Add partial payment & discount columns to public.restaurant_sessions if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'restaurant_sessions' AND column_name = 'discount_amount'
  ) THEN
    ALTER TABLE public.restaurant_sessions ADD COLUMN discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'restaurant_sessions' AND column_name = 'paid_amount'
  ) THEN
    ALTER TABLE public.restaurant_sessions ADD COLUMN paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0);
  END IF;
END $$;

-- 3. Performance Indexes for Financial & Operational Queries
CREATE INDEX IF NOT EXISTS idx_orders_tenant_created_status ON public.orders(tenant_id, created_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_fulfillment ON public.orders(tenant_id, fulfillment_type);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_tenant_created ON public.restaurant_orders(tenant_id, created_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_restaurant_sessions_tenant_opened ON public.restaurant_sessions(tenant_id, opened_at DESC, status);
