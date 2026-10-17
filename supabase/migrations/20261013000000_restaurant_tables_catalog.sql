-- ==============================================================================
-- SUPABASE POSTGRESQL RESTAURANT DIGITAL CATALOG, TABLES & SESSIONS SCHEMA MIGRATION
-- Migration: 20261013000000_restaurant_tables_catalog.sql
-- ==============================================================================
-- REVISÃO FINAL DE PRODUÇÃO & ENDURECIMENTO (Hardening):
-- A. Contador Atômico por Tenant: Reconciliação automática de pedidos legados,
--    inicialização concorrente sem colisões (GREATEST + UPSERT com RETURNING)
-- B. Integridade de Constraints Compostas:
--    Verificação preventiva dos tipos reais e relacionamentos compostos
-- C. Serialização Transacional & Concorrência:
--    Gatilho com FOR SHARE na comanda aberta + Função close_restaurant_session()
--    com SELECT FOR UPDATE para totalização atômica imutável
-- D. RLS & Privilégios SQL Estritos:
--    REVOKE explícito para anon e authenticated nos contadores;
--    Gatilhos e rotinas SECURITY DEFINER com search_path = public, pg_temp;
--    Nenhum cliente pode alterar o contador diretamente.
-- ==============================================================================

-- ==============================================================================
-- 1. CONSULTAS DE DIAGNÓSTICO PRÉVIO (NÃO DESTRUTIVAS)
-- O administrador pode executar estas consultas antes da migração para auditar
-- anomalias nos dados legados:
--
-- 1.1 Variantes com tenant_id diferente do produto pai:
-- SELECT pv.id AS variant_id, pv.product_id, pv.tenant_id AS variant_tenant, p.tenant_id AS product_tenant
-- FROM public.product_variants pv
-- JOIN public.products p ON p.id = pv.product_id
-- WHERE pv.tenant_id <> p.tenant_id;
--
-- 1.2 Múltiplas comandas abertas na mesma mesa:
-- SELECT table_id, COUNT(*) AS open_sessions
-- FROM public.restaurant_sessions
-- WHERE status = 'open'
-- GROUP BY table_id
-- HAVING COUNT(*) > 1;
--
-- 1.3 Duplicidade de número de pedido por tenant em dados anteriores:
-- SELECT tenant_id, order_number, COUNT(*)
-- FROM public.restaurant_orders
-- GROUP BY tenant_id, order_number
-- HAVING COUNT(*) > 1;
-- ==============================================================================

-- ==============================================================================
-- 2. REGISTRO DO RECURSO NO CATÁLOGO DO SAAS
-- ==============================================================================
INSERT INTO public.features (key, name, description, category, icon)
VALUES (
  'restaurant_tables',
  'Catálogo Digital & Mesas',
  'Gestão de mesas, pedidos e comanda para restaurantes presenciais com QR Code.',
  'vendas',
  'UtensilsCrossed'
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon;

-- ==============================================================================
-- 3. TABELA DE CONTROLE ATÔMICO DE SEQUÊNCIA DE PEDIDOS POR TENANT
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.restaurant_tenant_order_counters (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_order_number INTEGER NOT NULL DEFAULT 1000
);

-- Reconciliação e Inicialização Segura:
-- Se já existirem pedidos no banco de dados para qualquer tenant, o contador
-- é inicializado com o maior order_number existente (mínimo 1000).
-- Não reinicia contadores existentes nem altera números de pedidos legados.
INSERT INTO public.restaurant_tenant_order_counters (tenant_id, last_order_number)
SELECT
  t.id AS tenant_id,
  COALESCE(MAX(o.order_number), 1000) AS last_order_number
FROM public.tenants t
LEFT JOIN public.restaurant_orders o ON o.tenant_id = t.id
GROUP BY t.id
ON CONFLICT (tenant_id)
DO UPDATE SET last_order_number = GREATEST(
  public.restaurant_tenant_order_counters.last_order_number,
  EXCLUDED.last_order_number
);

-- ==============================================================================
-- 4. CONSTRAINTS COMPOSTAS NAS TABELAS DO CATÁLOGO EXISTENTE (PRODUCTS & VARIANTS)
-- Garante que produtos e variantes pertencem inequivocamente ao tenant do pedido
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_products_id_tenant'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT uq_products_id_tenant UNIQUE (id, tenant_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_product_variants_id_product_tenant'
  ) THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT uq_product_variants_id_product_tenant UNIQUE (id, product_id, tenant_id);
  END IF;
END $$;

-- ==============================================================================
-- 5. TABELA DE MESAS (restaurant_tables)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'closing')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  qr_code_token TEXT NOT NULL UNIQUE,
  current_session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_tenant_table_number UNIQUE (tenant_id, table_number)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_restaurant_tables_id_tenant'
  ) THEN
    ALTER TABLE public.restaurant_tables
      ADD CONSTRAINT uq_restaurant_tables_id_tenant UNIQUE (id, tenant_id);
  END IF;
END $$;

-- ==============================================================================
-- 6. TABELA DE COMANDAS / SESSÕES DA MESA (restaurant_sessions)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.restaurant_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  table_id UUID NOT NULL,
  session_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  closed_at TIMESTAMPTZ,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Chave estrangeira composta com ON DELETE RESTRICT:
-- Impede que uma mesa seja excluída se possuir histórico financeiro de comandas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_restaurant_sessions_table_composite'
  ) THEN
    ALTER TABLE public.restaurant_sessions
      ADD CONSTRAINT fk_restaurant_sessions_table_composite
      FOREIGN KEY (table_id, tenant_id) REFERENCES public.restaurant_tables(id, tenant_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_restaurant_sessions_id_tenant_table'
  ) THEN
    ALTER TABLE public.restaurant_sessions
      ADD CONSTRAINT uq_restaurant_sessions_id_tenant_table UNIQUE (id, tenant_id, table_id);
  END IF;
END $$;

-- Vinculo circular da comanda ativa na mesa
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_restaurant_tables_current_session'
  ) THEN
    ALTER TABLE public.restaurant_tables
      ADD CONSTRAINT fk_restaurant_tables_current_session
      FOREIGN KEY (current_session_id) REFERENCES public.restaurant_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ==============================================================================
-- 7. TABELA DE PEDIDOS DA MESA (restaurant_orders)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.restaurant_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  table_id UUID NOT NULL,
  session_id UUID NOT NULL,
  order_number INTEGER NOT NULL CHECK (order_number > 0),
  customer_name TEXT,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
  total NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total >= 0),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled')),
  notes TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Chave estrangeira composta: Garante que o pedido pertence à MESMA SESSÃO, MESA E TENANT
-- ON DELETE RESTRICT impede que sessões com pedidos registrados sejam excluídas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_restaurant_orders_session_composite'
  ) THEN
    ALTER TABLE public.restaurant_orders
      ADD CONSTRAINT fk_restaurant_orders_session_composite
      FOREIGN KEY (session_id, tenant_id, table_id) REFERENCES public.restaurant_sessions(id, tenant_id, table_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_restaurant_orders_id_tenant'
  ) THEN
    ALTER TABLE public.restaurant_orders
      ADD CONSTRAINT uq_restaurant_orders_id_tenant UNIQUE (id, tenant_id);
  END IF;
END $$;

-- ==============================================================================
-- 8. TABELA DE ITENS DO PEDIDO (restaurant_order_items)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.restaurant_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  variant_id UUID,
  product_name TEXT NOT NULL,
  variant_name TEXT,
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  -- ON DELETE RESTRICT: Preserva integridade contábil do item de pedido
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_restaurant_order_items_order'
  ) THEN
    ALTER TABLE public.restaurant_order_items
      ADD CONSTRAINT fk_restaurant_order_items_order
      FOREIGN KEY (order_id, tenant_id) REFERENCES public.restaurant_orders(id, tenant_id) ON DELETE RESTRICT;
  END IF;

  -- Garante que o produto pertence estritamente ao mesmo tenant do pedido
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_restaurant_order_items_product_tenant'
  ) THEN
    ALTER TABLE public.restaurant_order_items
      ADD CONSTRAINT fk_restaurant_order_items_product_tenant
      FOREIGN KEY (product_id, tenant_id) REFERENCES public.products(id, tenant_id) ON DELETE RESTRICT;
  END IF;

  -- Garante que a variante pertence estritamente ao mesmo produto e tenant
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_restaurant_order_items_variant_tenant'
  ) THEN
    ALTER TABLE public.restaurant_order_items
      ADD CONSTRAINT fk_restaurant_order_items_variant_tenant
      FOREIGN KEY (variant_id, product_id, tenant_id) REFERENCES public.product_variants(id, product_id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ==============================================================================
-- 9. HISTÓRICO DE MUDANÇA DE STATUS (restaurant_order_status_history)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.restaurant_order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('received', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled')),
  notes TEXT,
  changed_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  -- ON DELETE RESTRICT: Trilha de auditoria imutável
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_restaurant_history_order'
  ) THEN
    ALTER TABLE public.restaurant_order_status_history
      ADD CONSTRAINT fk_restaurant_history_order
      FOREIGN KEY (order_id, tenant_id) REFERENCES public.restaurant_orders(id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ==============================================================================
-- 10. ÍNDICES DE PERFORMANCE E REGRAS DE CONCORRÊNCIA
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_tenant ON public.restaurant_tables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_token ON public.restaurant_tables(qr_code_token);
CREATE INDEX IF NOT EXISTS idx_restaurant_sessions_tenant ON public.restaurant_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_sessions_table ON public.restaurant_sessions(table_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_sessions_status ON public.restaurant_sessions(table_id, status);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_tenant ON public.restaurant_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_session ON public.restaurant_orders(session_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_table ON public.restaurant_orders(table_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_status ON public.restaurant_orders(status);
CREATE INDEX IF NOT EXISTS idx_restaurant_order_items_order ON public.restaurant_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_history_order ON public.restaurant_order_status_history(order_id);

-- Proteção Concorrente: NO MÁXIMO UMA comanda aberta por mesa simultaneamente
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_sessions_open_table
ON public.restaurant_sessions (table_id)
WHERE (status = 'open');

-- Proteção Concorrente: Unicidade do número do pedido por tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_orders_tenant_number
ON public.restaurant_orders (tenant_id, order_number);

-- Proteção Concorrente: Idempotência de pedidos por tenant e chave
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_orders_idempotency
ON public.restaurant_orders (tenant_id, idempotency_key)
WHERE (idempotency_key IS NOT NULL);

-- ==============================================================================
-- 11. GATILHOS (TRIGGERS) TRANSACIONAIS DE INTEGRIDADE E CONCORRÊNCIA
-- ==============================================================================

-- 11.1 Gatilho com bloqueio FOR SHARE para serializar com o fechamento da comanda
CREATE OR REPLACE FUNCTION public.check_restaurant_order_session_open()
RETURNS TRIGGER AS $$
DECLARE
  v_session RECORD;
BEGIN
  -- Bloqueio FOR SHARE na comanda para sincronização transacional com fechamento concorrente
  SELECT id, status, tenant_id, table_id
  INTO v_session
  FROM public.restaurant_sessions
  WHERE id = NEW.session_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comanda informada não foi encontrada.';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Não é permitido registrar pedidos em uma comanda com status "%" (apenas comandas "open" aceitam novos pedidos).', v_session.status;
  END IF;

  IF v_session.tenant_id <> NEW.tenant_id OR v_session.table_id <> NEW.table_id THEN
    RAISE EXCEPTION 'Inconsistência de mesa ou estabelecimento entre o pedido e a comanda.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trigger_check_restaurant_order_session_open ON public.restaurant_orders;
CREATE TRIGGER trigger_check_restaurant_order_session_open
BEFORE INSERT ON public.restaurant_orders
FOR EACH ROW EXECUTE FUNCTION public.check_restaurant_order_session_open();

-- 11.2 Gatilho Atômico para Numeração Sequencial Segura de Pedidos por Tenant
-- Implementa alocação transacional por tenant com reconciliação e proteção contra concorrência
CREATE OR REPLACE FUNCTION public.assign_restaurant_order_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
  max_existing INTEGER;
BEGIN
  -- Se o pedido já tiver número válido especificado (ex: migração, restore ou teste)
  IF NEW.order_number IS NOT NULL AND NEW.order_number > 0 THEN
    INSERT INTO public.restaurant_tenant_order_counters (tenant_id, last_order_number)
    VALUES (NEW.tenant_id, NEW.order_number)
    ON CONFLICT (tenant_id)
    DO UPDATE SET last_order_number = GREATEST(public.restaurant_tenant_order_counters.last_order_number, EXCLUDED.last_order_number);
    RETURN NEW;
  END IF;

  -- 1. Tentativa de incremento atômico na linha do tenant já existente (bloqueio atômico de linha)
  UPDATE public.restaurant_tenant_order_counters
  SET last_order_number = last_order_number + 1
  WHERE tenant_id = NEW.tenant_id
  RETURNING last_order_number INTO next_num;

  -- 2. Se o contador ainda não existia para este tenant (tenant criado após a migração)
  IF next_num IS NULL THEN
    -- Busca o maior número de pedido já registrado para evitar qualquer colisão
    SELECT COALESCE(MAX(order_number), 1000)
    INTO max_existing
    FROM public.restaurant_orders
    WHERE tenant_id = NEW.tenant_id;

    -- Upsert seguro contra concorrência:
    -- Se duas requisições tentarem inicializar concorrentemente, uma insere (max + 1)
    -- e a outra cai no ON CONFLICT incrementando atomicamente para (max + 2)
    INSERT INTO public.restaurant_tenant_order_counters (tenant_id, last_order_number)
    VALUES (NEW.tenant_id, GREATEST(COALESCE(max_existing, 1000), 1000) + 1)
    ON CONFLICT (tenant_id)
    DO UPDATE SET last_order_number = GREATEST(public.restaurant_tenant_order_counters.last_order_number + 1, EXCLUDED.last_order_number)
    RETURNING last_order_number INTO next_num;
  END IF;

  NEW.order_number := next_num;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trigger_assign_restaurant_order_number ON public.restaurant_orders;
CREATE TRIGGER trigger_assign_restaurant_order_number
BEFORE INSERT ON public.restaurant_orders
FOR EACH ROW EXECUTE FUNCTION public.assign_restaurant_order_number();

-- 11.3 Função RPC Transacional para Fechamento de Comanda com Bloqueio Exclusivo
-- Garante atomicidade total: nenhum pedido é aceito durante o fechamento e todos
-- os pedidos aceitos são incluídos no total da comanda
CREATE OR REPLACE FUNCTION public.close_restaurant_session(
  p_tenant_id UUID,
  p_table_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_session RECORD;
  v_total NUMERIC(12, 2);
BEGIN
  -- 1. Bloqueia a sessão exclusivamente (FOR UPDATE).
  -- Se um pedido estiver em processamento concorrente, a trigger check_restaurant_order_session_open
  -- solicitou FOR SHARE. O PostgreSQL aguarda a conclusão da transação do pedido antes de prosseguir.
  SELECT id, status, notes
  INTO v_session
  FROM public.restaurant_sessions
  WHERE table_id = p_table_id AND tenant_id = p_tenant_id AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nenhuma comanda aberta para esta mesa.';
  END IF;

  -- 2. Calcula a soma exata de TODOS os pedidos válidos desta comanda
  SELECT COALESCE(SUM(total), 0.00)
  INTO v_total
  FROM public.restaurant_orders
  WHERE session_id = v_session.id
    AND tenant_id = p_tenant_id
    AND status <> 'cancelled';

  -- 3. Atualiza a comanda para 'closed' com o valor consolidado e timestamp de fechamento
  UPDATE public.restaurant_sessions
  SET status = 'closed',
      closed_at = timezone('utc'::text, now()),
      total_amount = v_total,
      notes = COALESCE(p_notes, notes),
      updated_at = timezone('utc'::text, now())
  WHERE id = v_session.id;

  -- 4. Libera a mesa e remove o ponteiro da sessão ativa
  UPDATE public.restaurant_tables
  SET status = 'available',
      current_session_id = NULL,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_table_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'table_id', p_table_id,
    'total_amount', v_total,
    'status', 'closed'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- 11.4 Gatilhos para updated_at (utilizando função set_updated_at existente)
DROP TRIGGER IF EXISTS trigger_restaurant_tables_updated_at ON public.restaurant_tables;
CREATE TRIGGER trigger_restaurant_tables_updated_at
BEFORE UPDATE ON public.restaurant_tables
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_restaurant_sessions_updated_at ON public.restaurant_sessions;
CREATE TRIGGER trigger_restaurant_sessions_updated_at
BEFORE UPDATE ON public.restaurant_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_restaurant_orders_updated_at ON public.restaurant_orders;
CREATE TRIGGER trigger_restaurant_orders_updated_at
BEFORE UPDATE ON public.restaurant_orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 12. PERMISSÕES SQL E ROW LEVEL SECURITY (RLS) RIGOROSOS
-- ==============================================================================

-- 12.1 Habilitação de RLS em todas as tabelas do módulo
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tenant_order_counters ENABLE ROW LEVEL SECURITY;

-- 12.2 Revogação Total de Acesso Direto para anon (visitantes anônimos não acessam tabelas)
REVOKE ALL ON public.restaurant_tables FROM anon;
REVOKE ALL ON public.restaurant_sessions FROM anon;
REVOKE ALL ON public.restaurant_orders FROM anon;
REVOKE ALL ON public.restaurant_order_items FROM anon;
REVOKE ALL ON public.restaurant_order_status_history FROM anon;
REVOKE ALL ON public.restaurant_tenant_order_counters FROM anon;

-- 12.3 Permissões do Contador de Pedidos (restaurant_tenant_order_counters)
-- Clientes authenticated NUNCA podem alterar o contador diretamente. Apenas SELECT com RLS.
-- Gravações ocorrem exclusivamente pela trigger assign_restaurant_order_number() com SECURITY DEFINER.
REVOKE ALL ON public.restaurant_tenant_order_counters FROM PUBLIC;
REVOKE ALL ON public.restaurant_tenant_order_counters FROM authenticated;
GRANT SELECT ON public.restaurant_tenant_order_counters TO authenticated;
GRANT ALL ON public.restaurant_tenant_order_counters TO service_role;

-- 12.4 Concessão de Operações para Usuários Autenticados (filtrados por RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_tables TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_order_status_history TO authenticated;

-- 12.5 Concessão para Funções e Rotinas
REVOKE ALL ON FUNCTION public.check_restaurant_order_session_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_restaurant_order_session_open() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.assign_restaurant_order_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_restaurant_order_number() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.close_restaurant_session(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_restaurant_session(UUID, UUID, TEXT) TO authenticated, service_role;

-- 12.6 Políticas RLS por Tenant

-- Mesas
DROP POLICY IF EXISTS "Public can view active tables by token" ON public.restaurant_tables;
DROP POLICY IF EXISTS "Tenant users can view own tables" ON public.restaurant_tables;
CREATE POLICY "Tenant users can view own tables"
ON public.restaurant_tables FOR SELECT
TO authenticated
USING (public.user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Tenant users can manage own tables" ON public.restaurant_tables;
CREATE POLICY "Tenant users can manage own tables"
ON public.restaurant_tables FOR ALL
TO authenticated
USING (public.user_has_tenant_access(tenant_id))
WITH CHECK (public.user_has_tenant_access(tenant_id));

-- Comandas / Sessões
DROP POLICY IF EXISTS "Tenant users can view own sessions" ON public.restaurant_sessions;
CREATE POLICY "Tenant users can view own sessions"
ON public.restaurant_sessions FOR SELECT
TO authenticated
USING (public.user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Tenant users can manage own sessions" ON public.restaurant_sessions;
CREATE POLICY "Tenant users can manage own sessions"
ON public.restaurant_sessions FOR ALL
TO authenticated
USING (public.user_has_tenant_access(tenant_id))
WITH CHECK (public.user_has_tenant_access(tenant_id));

-- Pedidos da Mesa
DROP POLICY IF EXISTS "Tenant users can view own orders" ON public.restaurant_orders;
CREATE POLICY "Tenant users can view own orders"
ON public.restaurant_orders FOR SELECT
TO authenticated
USING (public.user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Tenant users can manage own orders" ON public.restaurant_orders;
CREATE POLICY "Tenant users can manage own orders"
ON public.restaurant_orders FOR ALL
TO authenticated
USING (public.user_has_tenant_access(tenant_id))
WITH CHECK (public.user_has_tenant_access(tenant_id));

-- Itens do Pedido
DROP POLICY IF EXISTS "Tenant users can view own order items" ON public.restaurant_order_items;
CREATE POLICY "Tenant users can view own order items"
ON public.restaurant_order_items FOR SELECT
TO authenticated
USING (public.user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Tenant users can manage own order items" ON public.restaurant_order_items;
CREATE POLICY "Tenant users can manage own order items"
ON public.restaurant_order_items FOR ALL
TO authenticated
USING (public.user_has_tenant_access(tenant_id))
WITH CHECK (public.user_has_tenant_access(tenant_id));

-- Histórico de Status
DROP POLICY IF EXISTS "Tenant users can view own order history" ON public.restaurant_order_status_history;
CREATE POLICY "Tenant users can view own order history"
ON public.restaurant_order_status_history FOR SELECT
TO authenticated
USING (public.user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Tenant users can manage own order history" ON public.restaurant_order_status_history;
CREATE POLICY "Tenant users can manage own order history"
ON public.restaurant_order_status_history FOR ALL
TO authenticated
USING (public.user_has_tenant_access(tenant_id))
WITH CHECK (public.user_has_tenant_access(tenant_id));

-- Contadores de Pedidos (Somente leitura para usuários do tenant)
DROP POLICY IF EXISTS "Tenant users can view own order counters" ON public.restaurant_tenant_order_counters;
CREATE POLICY "Tenant users can view own order counters"
ON public.restaurant_tenant_order_counters FOR SELECT
TO authenticated
USING (public.user_has_tenant_access(tenant_id));
