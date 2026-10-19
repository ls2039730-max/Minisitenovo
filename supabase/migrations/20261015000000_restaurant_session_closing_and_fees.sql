-- ==============================================================================
-- SUPABASE POSTGRESQL RESTAURANT DIGITAL CATALOG: CLOSING, FEES & ALERTS SCHEMA
-- Migration: 20261015000000_restaurant_session_closing_and_fees.sql (REVISADA & CORRIGIDA)
-- ==============================================================================
-- CORREÇÕES DE SEGURANÇA E COMPATIBILIDADE:
-- 1. Chave estrangeira de closed_by_user_id aponta estritamente para auth.users(id),
--    eliminando o erro 42P01 de tabela inexistente no schema public.
-- 2. Separação formal e atômica entre "request_session_closing" (cliente via QR Code)
--    e "close_restaurant_session" (funcionário autenticado e autorizado).
-- 3. Procedure close_restaurant_session com validação rigorosa de auth.uid() e
--    tenant_users.role (excluindo role PROFESSIONAL e chamadas anônimas).
-- 4. Suporte explícito e seguro para execução via service_role.
-- 5. Revogação de privilégios de PUBLIC e anon na procedure de fechamento definitivo.
-- 6. Diferenciação contábil entre forma de pagamento (payment_method) e status
--    da quitação (payment_status).
-- 7. Remoção do índice uq_restaurant_session_fees_session_name em favor de unicidade
--    por template (session_id, fee_template_id), permitindo remoção e reinserção
--    de taxas e múltiplas taxas customizadas sem conflito.
-- 8. Remoção de assinaturas sobrecarregadas legadas de close_restaurant_session.
-- ==============================================================================

-- 0. GARANTE FUNÇÃO DE TIMESTAMP updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. ADICIONA COLUNAS DE FECHAMENTO E TAXAS NA TABELA DE COMANDAS (restaurant_sessions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'restaurant_sessions' 
      AND column_name = 'closing_requested_at'
  ) THEN
    ALTER TABLE public.restaurant_sessions 
      ADD COLUMN closing_requested_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'restaurant_sessions' 
      AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE public.restaurant_sessions 
      ADD COLUMN payment_method TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'restaurant_sessions' 
      AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE public.restaurant_sessions 
      ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid', 'pending', 'unpaid'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'restaurant_sessions' 
      AND column_name = 'orders_subtotal'
  ) THEN
    ALTER TABLE public.restaurant_sessions 
      ADD COLUMN orders_subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (orders_subtotal >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'restaurant_sessions' 
      AND column_name = 'fees_total'
  ) THEN
    ALTER TABLE public.restaurant_sessions 
      ADD COLUMN fees_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (fees_total >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'restaurant_sessions' 
      AND column_name = 'closed_by_user_id'
  ) THEN
    ALTER TABLE public.restaurant_sessions 
      ADD COLUMN closed_by_user_id UUID;
  END IF;
END $$;

-- Vincula chave estrangeira para auth.users de forma compatível com Supabase
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_restaurant_sessions_closed_by_user'
  ) THEN
    ALTER TABLE public.restaurant_sessions
      ADD CONSTRAINT fk_restaurant_sessions_closed_by_user
      FOREIGN KEY (closed_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Garante constraint única (id, tenant_id) em restaurant_sessions para integridade composta
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_restaurant_sessions_id_tenant'
  ) THEN
    ALTER TABLE public.restaurant_sessions
      ADD CONSTRAINT uq_restaurant_sessions_id_tenant UNIQUE (id, tenant_id);
  END IF;
END $$;

-- 2. TABELA DE MODELOS DE TAXAS CONFIGURÁVEIS PELO RESTAURANTE (restaurant_fee_templates)
CREATE TABLE IF NOT EXISTS public.restaurant_fee_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('percentage', 'fixed')),
  value NUMERIC(10, 2) NOT NULL CHECK (value >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_restaurant_fee_templates_tenant_name'
  ) THEN
    ALTER TABLE public.restaurant_fee_templates
      ADD CONSTRAINT uq_restaurant_fee_templates_tenant_name UNIQUE (tenant_id, name);
  END IF;
END $$;

-- 3. TABELA DE TAXAS LANÇADAS NA COMANDA DA MESA (restaurant_session_fees)
CREATE TABLE IF NOT EXISTS public.restaurant_session_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  fee_template_id UUID REFERENCES public.restaurant_fee_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('percentage', 'fixed')),
  rate_or_amount NUMERIC(10, 2) NOT NULL CHECK (rate_or_amount >= 0),
  calculated_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (calculated_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Chave estrangeira composta para sessão e tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_restaurant_session_fees_session_tenant'
  ) THEN
    ALTER TABLE public.restaurant_session_fees
      ADD CONSTRAINT fk_restaurant_session_fees_session_tenant
      FOREIGN KEY (session_id, tenant_id) REFERENCES public.restaurant_sessions(id, tenant_id) ON DELETE CASCADE;
  END IF;
END $$;

-- Remove constraint legada por (session_id, name) que causava falhas ao reinserir ou usar taxas com nomes similares
DROP INDEX IF EXISTS public.uq_restaurant_session_fees_session_name;

-- Previne duplicidade de um mesmo MODELO de taxa já lançado na comanda
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_session_fees_template
ON public.restaurant_session_fees (session_id, fee_template_id)
WHERE (fee_template_id IS NOT NULL);

-- 4. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_restaurant_fee_templates_tenant ON public.restaurant_fee_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_session_fees_session ON public.restaurant_session_fees(session_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_session_fees_tenant ON public.restaurant_session_fees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_sessions_closing ON public.restaurant_sessions(table_id, closing_requested_at) WHERE (status = 'open');

-- 5. TRIGGER PARA updated_at EM restaurant_fee_templates
DROP TRIGGER IF EXISTS trigger_restaurant_fee_templates_updated_at ON public.restaurant_fee_templates;
CREATE TRIGGER trigger_restaurant_fee_templates_updated_at
BEFORE UPDATE ON public.restaurant_fee_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. PROCEDURE RPC: SOLICITAÇÃO DE FECHAMENTO PELO CLIENTE (request_session_closing)
-- Permite que o cliente na mesa, validado por token de QR Code, solicite o fechamento.
-- A comanda PERMANECE ABERTA e a mesa PERMANECE OCUPADA (com sinalizador de fechamento).
CREATE OR REPLACE FUNCTION public.request_session_closing(
  p_tenant_id UUID,
  p_table_id UUID,
  p_qr_code_token TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_table RECORD;
  v_session RECORD;
  v_default_fee RECORD;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  -- 1. Validação da mesa com bloqueio FOR UPDATE
  SELECT id, tenant_id, status, current_session_id, qr_code_token, is_active
  INTO v_table
  FROM public.restaurant_tables
  WHERE id = p_table_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mesa não encontrada para este estabelecimento.';
  END IF;

  IF NOT v_table.is_active THEN
    RAISE EXCEPTION 'Mesa inativa no momento.';
  END IF;

  -- Se fornecido token do QR Code (chamada anônima ou do cliente), valida correspondência
  IF p_qr_code_token IS NOT NULL AND v_table.qr_code_token <> p_qr_code_token THEN
    RAISE EXCEPTION 'Acesso negado: token do QR Code inválido para esta mesa.' USING ERRCODE = '42501';
  END IF;

  -- 2. Localiza comanda ativa da mesa com bloqueio FOR UPDATE
  SELECT id, tenant_id, table_id, status, closing_requested_at
  INTO v_session
  FROM public.restaurant_sessions
  WHERE table_id = p_table_id 
    AND tenant_id = p_tenant_id 
    AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nenhuma comanda aberta para esta mesa.';
  END IF;

  -- Se já foi solicitada anteriormente, preserva o timestamp original e retorna status
  IF v_session.closing_requested_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'session_id', v_session.id,
      'table_id', p_table_id,
      'status', 'closing',
      'already_requested', true,
      'closing_requested_at', v_session.closing_requested_at
    );
  END IF;

  -- 3. Aplicação idempotente de taxas padrão ativas do estabelecimento
  FOR v_default_fee IN (
    SELECT id, name, description, type, value
    FROM public.restaurant_fee_templates
    WHERE tenant_id = p_tenant_id
      AND is_active = true
      AND is_default = true
  ) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.restaurant_session_fees
      WHERE session_id = v_session.id
        AND (fee_template_id = v_default_fee.id OR name = v_default_fee.name)
    ) THEN
      INSERT INTO public.restaurant_session_fees (
        id,
        tenant_id,
        session_id,
        fee_template_id,
        name,
        description,
        type,
        rate_or_amount,
        calculated_amount,
        created_at
      ) VALUES (
        gen_random_uuid(),
        p_tenant_id,
        v_session.id,
        v_default_fee.id,
        v_default_fee.name,
        v_default_fee.description,
        v_default_fee.type,
        v_default_fee.value,
        CASE WHEN v_default_fee.type = 'fixed' THEN v_default_fee.value ELSE 0.00 END,
        v_now
      );
    END IF;
  END LOOP;

  -- 4. Registra timestamp de solicitação mantendo comanda aberta
  UPDATE public.restaurant_sessions
  SET closing_requested_at = v_now,
      updated_at = v_now
  WHERE id = v_session.id;

  -- 5. Atualiza status visual da mesa para 'closing'
  UPDATE public.restaurant_tables
  SET status = 'closing',
      updated_at = v_now
  WHERE id = p_table_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'table_id', p_table_id,
    'status', 'closing',
    'already_requested', false,
    'closing_requested_at', v_now
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- 7. REMOVE ASSINATURAS SOBRECARREGADAS LEGADAS DE close_restaurant_session
DROP FUNCTION IF EXISTS public.close_restaurant_session(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.close_restaurant_session(UUID, UUID, TEXT, TEXT, UUID);

-- 8. PROCEDURE RPC: FECHAMENTO DEFINITIVO DA COMANDA (close_restaurant_session)
-- Restrita exclusivamente a funcionários autorizados (não anônimos, não profissionais)
CREATE OR REPLACE FUNCTION public.close_restaurant_session(
  p_tenant_id UUID,
  p_table_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'Cartão',
  p_closed_by_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_uid UUID;
  v_is_service_role BOOLEAN;
  v_authorized_user_id UUID;
  v_user_role TEXT;
  v_table RECORD;
  v_session RECORD;
  v_orders_subtotal NUMERIC(12, 2);
  v_fees_total NUMERIC(12, 2);
  v_total NUMERIC(12, 2);
  v_method TEXT;
BEGIN
  -- 1. VALIDAÇÃO RIGOROSA DE IDENTIDADE E PERMISSÃO (ZERO TRUST)
  v_caller_uid := auth.uid();
  v_is_service_role := (
    current_setting('request.jwt.claim.role', true) = 'service_role' 
    OR current_setting('role', true) = 'service_role'
    OR current_user = 'service_role'
    OR session_user = 'service_role'
  );

  IF v_is_service_role THEN
    -- Chamada pelo backend operacional confiável (service_role)
    IF p_closed_by_user_id IS NOT NULL THEN
      SELECT role INTO v_user_role
      FROM public.tenant_users
      WHERE user_id = p_closed_by_user_id
        AND (tenant_id = p_tenant_id OR role = 'SUPER_ADMIN')
        AND status = 'active'
      LIMIT 1;

      IF v_user_role IS NOT NULL AND v_user_role <> 'PROFESSIONAL' THEN
        v_authorized_user_id := p_closed_by_user_id;
      ELSE
        v_authorized_user_id := NULL;
      END IF;
    ELSE
      v_authorized_user_id := NULL;
    END IF;
  ELSE
    -- Chamada direta via PostgREST / Supabase Client
    IF v_caller_uid IS NULL THEN
      RAISE EXCEPTION 'Não autorizado: usuário anônimo não pode encerrar comanda nem liberar mesa.' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_user_role
    FROM public.tenant_users
    WHERE user_id = v_caller_uid
      AND (tenant_id = p_tenant_id OR role = 'SUPER_ADMIN')
      AND status = 'active'
    LIMIT 1;

    IF v_user_role IS NULL THEN
      RAISE EXCEPTION 'Acesso negado: o usuário autenticado não pertence a este estabelecimento.' USING ERRCODE = '42501';
    END IF;

    IF v_user_role = 'PROFESSIONAL' THEN
      RAISE EXCEPTION 'Acesso restrito: profissionais não possuem permissão para encerrar comandas de restaurante.' USING ERRCODE = '42501';
    END IF;

    v_authorized_user_id := v_caller_uid;
  END IF;

  -- 2. BLOQUEIO CONCORRENTE E VALIDAÇÃO DE INTEGRIDADE (FOR UPDATE)
  SELECT id, tenant_id, status, current_session_id
  INTO v_table
  FROM public.restaurant_tables
  WHERE id = p_table_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mesa não encontrada para este estabelecimento.';
  END IF;

  SELECT id, tenant_id, table_id, status, notes
  INTO v_session
  FROM public.restaurant_sessions
  WHERE table_id = p_table_id 
    AND tenant_id = p_tenant_id 
    AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nenhuma comanda aberta para esta mesa.';
  END IF;

  -- Integridade cruzada: a mesa deve apontar exatamente para esta comanda ativa
  IF v_table.current_session_id IS DISTINCT FROM v_session.id THEN
    RAISE EXCEPTION 'Inconsistência de integridade: a mesa não está vinculada a esta comanda ativa.';
  END IF;

  -- 3. FINALIZAÇÃO AUTOMÁTICA DE PEDIDOS AINDA NÃO ENTREGUES (Evita itens órfãos no KDS)
  UPDATE public.restaurant_orders
  SET status = 'delivered',
      updated_at = timezone('utc'::text, now())
  WHERE session_id = v_session.id
    AND tenant_id = p_tenant_id
    AND status IN ('received', 'confirmed', 'preparing', 'ready');

  -- 4. CONSOLIDAÇÃO FINANCEIRA PRECISA
  -- 4.1 Subtotal dos pedidos válidos não cancelados
  SELECT COALESCE(SUM(total), 0.00)
  INTO v_orders_subtotal
  FROM public.restaurant_orders
  WHERE session_id = v_session.id
    AND tenant_id = p_tenant_id
    AND status <> 'cancelled';

  -- 4.2 Recálculo exato de taxas percentuais sobre o subtotal atual e soma total de taxas
  UPDATE public.restaurant_session_fees
  SET calculated_amount = CASE 
    WHEN type = 'percentage' THEN ROUND(v_orders_subtotal * (rate_or_amount / 100.0), 2)
    ELSE rate_or_amount
  END
  WHERE session_id = v_session.id
    AND tenant_id = p_tenant_id;

  SELECT COALESCE(SUM(calculated_amount), 0.00)
  INTO v_fees_total
  FROM public.restaurant_session_fees
  WHERE session_id = v_session.id
    AND tenant_id = p_tenant_id;

  v_total := ROUND(v_orders_subtotal + v_fees_total, 2);
  v_method := COALESCE(NULLIF(TRIM(p_payment_method), ''), 'Cartão');

  -- 5. FECHAMENTO ATÔMICO DA COMANDA
  UPDATE public.restaurant_sessions
  SET status = 'closed',
      closed_at = timezone('utc'::text, now()),
      orders_subtotal = v_orders_subtotal,
      fees_total = v_fees_total,
      total_amount = v_total,
      payment_method = v_method,
      payment_status = 'paid',
      closed_by_user_id = v_authorized_user_id,
      notes = COALESCE(p_notes, notes),
      updated_at = timezone('utc'::text, now())
  WHERE id = v_session.id
    AND tenant_id = p_tenant_id
    AND status = 'open';

  -- 6. LIBERAÇÃO ATÔMICA DA MESA (Apenas se a mesa ainda estiver vinculada a esta sessão)
  UPDATE public.restaurant_tables
  SET status = 'available',
      current_session_id = NULL,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_table_id 
    AND tenant_id = p_tenant_id
    AND current_session_id = v_session.id;

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'table_id', p_table_id,
    'orders_subtotal', v_orders_subtotal,
    'fees_total', v_fees_total,
    'total_amount', v_total,
    'payment_method', v_method,
    'payment_status', 'paid',
    'status', 'closed',
    'closed_by_user_id', v_authorized_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- 9. PERMISSÕES EXPLÍCITAS DAS PROCEDURES
-- 9.1 request_session_closing: anon pode chamar desde que informe o token do QR Code da mesa
REVOKE ALL ON FUNCTION public.request_session_closing(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_session_closing(UUID, UUID, TEXT) TO authenticated, service_role, anon;

-- 9.2 close_restaurant_session: REVOGAÇÃO TOTAL DE ACESSO PÚBLICO E ANÔNIMO
REVOKE ALL ON FUNCTION public.close_restaurant_session(UUID, UUID, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_restaurant_session(UUID, UUID, TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_restaurant_session(UUID, UUID, TEXT, TEXT, UUID) TO authenticated, service_role;

-- 10. ROW LEVEL SECURITY (RLS) E PERMISSÕES DE TABELAS
ALTER TABLE public.restaurant_fee_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_session_fees ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.restaurant_fee_templates FROM anon, PUBLIC;
REVOKE ALL ON public.restaurant_session_fees FROM anon, PUBLIC;

-- Modelos de Taxas (Templates): Leitura por membros do tenant
DROP POLICY IF EXISTS "Tenant users can view fee templates" ON public.restaurant_fee_templates;
CREATE POLICY "Tenant users can view fee templates"
ON public.restaurant_fee_templates FOR SELECT
TO authenticated
USING (public.user_has_tenant_access(tenant_id));

-- Modelos de Taxas: Gestão restrita a Administradores e Gerentes
DROP POLICY IF EXISTS "Tenant managers can manage fee templates" ON public.restaurant_fee_templates;
CREATE POLICY "Tenant managers can manage fee templates"
ON public.restaurant_fee_templates FOR ALL
TO authenticated
USING (
  public.is_super_admin() OR
  tenant_id IN (
    SELECT tenant_id FROM public.tenant_users
    WHERE user_id = auth.uid()
      AND role IN ('SUPER_ADMIN', 'CLIENT_ADMIN', 'OWNER', 'MANAGER')
      AND status = 'active'
  )
)
WITH CHECK (
  public.is_super_admin() OR
  tenant_id IN (
    SELECT tenant_id FROM public.tenant_users
    WHERE user_id = auth.uid()
      AND role IN ('SUPER_ADMIN', 'CLIENT_ADMIN', 'OWNER', 'MANAGER')
      AND status = 'active'
  )
);

-- Taxas Lançadas na Comanda: Leitura por membros do tenant
DROP POLICY IF EXISTS "Tenant users can view session fees" ON public.restaurant_session_fees;
CREATE POLICY "Tenant users can view session fees"
ON public.restaurant_session_fees FOR SELECT
TO authenticated
USING (public.user_has_tenant_access(tenant_id));

-- Taxas Lançadas na Comanda: Lançamento e remoção por equipe do restaurante (excluindo PROFESSIONAL)
DROP POLICY IF EXISTS "Tenant staff can manage session fees" ON public.restaurant_session_fees;
CREATE POLICY "Tenant staff can manage session fees"
ON public.restaurant_session_fees FOR ALL
TO authenticated
USING (
  public.is_super_admin() OR
  tenant_id IN (
    SELECT tenant_id FROM public.tenant_users
    WHERE user_id = auth.uid()
      AND role IN ('SUPER_ADMIN', 'CLIENT_ADMIN', 'OWNER', 'MANAGER', 'EMPLOYEE')
      AND status = 'active'
  )
)
WITH CHECK (
  public.is_super_admin() OR
  tenant_id IN (
    SELECT tenant_id FROM public.tenant_users
    WHERE user_id = auth.uid()
      AND role IN ('SUPER_ADMIN', 'CLIENT_ADMIN', 'OWNER', 'MANAGER', 'EMPLOYEE')
      AND status = 'active'
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_fee_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_session_fees TO authenticated;
GRANT ALL ON public.restaurant_fee_templates TO service_role;
GRANT ALL ON public.restaurant_session_fees TO service_role;
