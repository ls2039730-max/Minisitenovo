-- ==============================================================================
-- SUPABASE POSTGRESQL PRODUCT WEEKLY AVAILABILITY MIGRATION
-- Migration: 20261016000000_product_weekly_availability.sql
-- ==============================================================================

-- Add availability_days JSONB column to products table
-- Structure:
-- {
--   "sameChannels": boolean,
--   "tableDays": number[],
--   "deliveryDays": number[]
-- }
-- Backward compatibility: Existing products with NULL are treated as available
-- every day for all channels. New products default to all days (0..6).

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS availability_days JSONB DEFAULT '{"sameChannels": true, "tableDays": [0,1,2,3,4,5,6], "deliveryDays": [0,1,2,3,4,5,6]}'::jsonb;

-- Create GIN index for high-performance querying if needed
CREATE INDEX IF NOT EXISTS idx_products_availability_days ON public.products USING GIN (availability_days);
