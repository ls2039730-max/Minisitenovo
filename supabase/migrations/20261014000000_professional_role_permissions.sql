-- ==============================================================================
-- Migration: 20261014000000_professional_role_permissions.sql
-- Rigorous Role-Based Separation for PROFESSIONAL Role
-- ==============================================================================

-- 1. Ensure user_id column exists on public.professionals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'professionals' 
      AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.professionals 
    ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index on (tenant_id, user_id) for fast lookup of linked professional
CREATE INDEX IF NOT EXISTS idx_professionals_tenant_user_id 
ON public.professionals(tenant_id, user_id);

-- 2. Helper function: Get linked professional id for the current authenticated user
CREATE OR REPLACE FUNCTION public.get_auth_professional_id(target_tenant_id UUID)
RETURNS UUID AS $$
  SELECT id FROM public.professionals
  WHERE tenant_id = target_tenant_id
    AND (
      user_id = auth.uid() OR 
      (user_id IS NULL AND LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid())))
    )
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Helper function: Checks if authenticated user has role PROFESSIONAL in the tenant
CREATE OR REPLACE FUNCTION public.is_user_professional(target_tenant_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE user_id = auth.uid()
      AND tenant_id = target_tenant_id
      AND role = 'PROFESSIONAL'
      AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 3. Row Level Security updates for public.professionals
-- Allow professionals to select themselves and allow admins to manage all
DROP POLICY IF EXISTS "Professionals: professional select own record" ON public.professionals;
CREATE POLICY "Professionals: professional select own record"
ON public.professionals FOR SELECT
TO authenticated
USING (
  public.is_super_admin() OR
  (public.user_has_tenant_access(tenant_id) AND (
    NOT public.is_user_professional(tenant_id) OR
    id = public.get_auth_professional_id(tenant_id)
  ))
);

-- Allow professionals to update only their own profile details
DROP POLICY IF EXISTS "Professionals: professional update own record" ON public.professionals;
CREATE POLICY "Professionals: professional update own record"
ON public.professionals FOR UPDATE
TO authenticated
USING (
  public.is_super_admin() OR
  (public.user_has_tenant_access(tenant_id) AND (
    NOT public.is_user_professional(tenant_id) OR
    id = public.get_auth_professional_id(tenant_id)
  ))
)
WITH CHECK (
  public.is_super_admin() OR
  (public.user_has_tenant_access(tenant_id) AND (
    NOT public.is_user_professional(tenant_id) OR
    id = public.get_auth_professional_id(tenant_id)
  ))
);

-- 4. Row Level Security for public.service_professionals
DROP POLICY IF EXISTS "Service professionals: professional manage own links" ON public.service_professionals;
CREATE POLICY "Service professionals: professional manage own links"
ON public.service_professionals FOR ALL
TO authenticated
USING (
  public.is_super_admin() OR
  (public.user_has_tenant_access(tenant_id) AND (
    NOT public.is_user_professional(tenant_id) OR
    professional_id = public.get_auth_professional_id(tenant_id)
  ))
);

-- 5. Row Level Security for public.professional_schedules
DROP POLICY IF EXISTS "Professional schedules: professional manage own schedule" ON public.professional_schedules;
CREATE POLICY "Professional schedules: professional manage own schedule"
ON public.professional_schedules FOR ALL
TO authenticated
USING (
  public.is_super_admin() OR
  (public.user_has_tenant_access(tenant_id) AND (
    NOT public.is_user_professional(tenant_id) OR
    professional_id = public.get_auth_professional_id(tenant_id)
  ))
);

-- 6. Row Level Security for public.schedule_blocks
DROP POLICY IF EXISTS "Schedule blocks: professional manage own blocks" ON public.schedule_blocks;
CREATE POLICY "Schedule blocks: professional manage own blocks"
ON public.schedule_blocks FOR ALL
TO authenticated
USING (
  public.is_super_admin() OR
  (public.user_has_tenant_access(tenant_id) AND (
    NOT public.is_user_professional(tenant_id) OR
    professional_id = public.get_auth_professional_id(tenant_id)
  ))
);

-- 7. Row Level Security for public.appointments
DROP POLICY IF EXISTS "Appointments: professional access own appointments" ON public.appointments;
CREATE POLICY "Appointments: professional access own appointments"
ON public.appointments FOR ALL
TO authenticated
USING (
  public.is_super_admin() OR
  (public.user_has_tenant_access(tenant_id) AND (
    NOT public.is_user_professional(tenant_id) OR
    professional_id = public.get_auth_professional_id(tenant_id)
  ))
);
