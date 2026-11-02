import assert from 'node:assert/strict';
import { supabaseAdmin } from '../server/supabaseAdmin.js';
import { restaurantRepo } from '../server/db/restaurantRepository.js';
import { restaurantAnalyticsService } from '../server/services/restaurantAnalyticsService.js';
import { User } from '../src/types/saas.js';

async function runVerification() {
  console.log('===================================================================');
  console.log('INICIANDO SUÍTE DE 12 TESTES — ADICIONAR ITENS À CONTA ABERTA');
  console.log('===================================================================');

  const createdTableIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];

  try {
    // 0. Buscar 2 tenants reais existentes no banco de dados para testar operação e isolamento multi-tenant
    const { data: allTenants } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, name')
      .limit(5);

    assert.ok(allTenants && allTenants.length >= 2, 'Devem existir pelo menos 2 tenants no banco para testar isolamento');
    const tenantA = allTenants[0];
    const tenantB = allTenants[1];
    const TENANT_A_ID = tenantA.id;
    const TENANT_B_ID = tenantB.id;

    const WAITER_USER_A: User = {
      id: '00000000-0000-4000-8000-0000000000a1',
      name: 'Garçom Teste A',
      email: 'garcom.a@localhub.test',
      role: 'CLIENT_ADMIN',
      tenantId: TENANT_A_ID,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    const WAITER_USER_B: User = {
      id: '00000000-0000-4000-8000-0000000000b1',
      name: 'Garçom Teste B',
      email: 'garcom.b@localhub.test',
      role: 'CLIENT_ADMIN',
      tenantId: TENANT_B_ID,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    const nowIso = new Date().toISOString();
    const suffix = Date.now().toString().slice(-6);

    // Criar 3 produtos no Tenant A (Produto 1: Prato R$ 40, Produto 2: Bebida R$ 12 com variante, Produto 3: Inativo)
    // E 1 produto no Tenant B para testar isolamento multi-tenant
    const { data: prod1, error: p1Err } = await supabaseAdmin
      .from('products')
      .insert({
        tenant_id: TENANT_A_ID,
        name: `Filé Parmegiana Teste ${suffix}`,
        slug: `file-parmegiana-teste-${suffix}`,
        price: 45.0,
        promotional_price: 40.0, // Preço oficial promocional = R$ 40,00
        is_active: true,
        track_stock: true,
        stock_quantity: 10,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single();
    if (p1Err || !prod1) throw new Error(`Erro ao criar prod1: ${p1Err?.message}`);
    createdProductIds.push(prod1.id);

    const { data: prod2, error: p2Err } = await supabaseAdmin
      .from('products')
      .insert({
        tenant_id: TENANT_A_ID,
        name: `Suco Natural Teste ${suffix}`,
        slug: `suco-natural-teste-${suffix}`,
        price: 12.0,
        is_active: true,
        track_stock: false,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single();
    if (p2Err || !prod2) throw new Error(`Erro ao criar prod2: ${p2Err?.message}`);
    createdProductIds.push(prod2.id);

    const { data: variant2, error: v2Err } = await supabaseAdmin
      .from('product_variants')
      .insert({
        product_id: prod2.id,
        tenant_id: TENANT_A_ID,
        name: 'Jarra 1L',
        price: 22.0,
        is_active: true,
        stock_quantity: 5,
        sort_order: 1,
      })
      .select('*')
      .single();
    if (v2Err || !variant2) throw new Error(`Erro ao criar variant2: ${v2Err?.message}`);
    createdVariantIds.push(variant2.id);

    const { data: prodInactive, error: pInactErr } = await supabaseAdmin
      .from('products')
      .insert({
        tenant_id: TENANT_A_ID,
        name: `Sobremesa Inativa Teste ${suffix}`,
        slug: `sobremesa-inativa-teste-${suffix}`,
        price: 18.0,
        is_active: false,
        track_stock: false,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single();
    if (pInactErr || !prodInactive) throw new Error(`Erro ao criar prodInactive: ${pInactErr?.message}`);
    createdProductIds.push(prodInactive.id);

    const { data: prodTenantB, error: pBErr } = await supabaseAdmin
      .from('products')
      .insert({
        tenant_id: TENANT_B_ID,
        name: `Produto Secreto Tenant B ${suffix}`,
        slug: `produto-secreto-b-${suffix}`,
        price: 99.0,
        is_active: true,
        track_stock: false,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single();
    if (pBErr || !prodTenantB) throw new Error(`Erro ao criar prodTenantB: ${pBErr?.message}`);
    createdProductIds.push(prodTenantB.id);

    // Criar Mesa de Teste no Tenant A
    const tableA = await restaurantRepo.createTable(
      TENANT_A_ID,
      {
        tableNumber: `T-ADD-${suffix.slice(-3)}`,
        name: `Mesa Teste Garçom ${suffix}`,
        isActive: true,
      },
      WAITER_USER_A
    );
    createdTableIds.push(tableA.id);

    // Criar Pedido Inicial (1x prod1 = R$ 40,00) abrindo a sessão da mesa
    const initialOrder = await restaurantRepo.createOrderFromTable(
      {
        tenantSlug: tenantA.slug,
        tableToken: tableA.qrCodeToken,
        customerName: 'Cliente Inicial',
        notes: 'Pedido de abertura da mesa',
        items: [{ productId: prod1.id, quantity: 1, notes: 'Ao ponto' }],
      },
      '127.0.0.201'
    );

    const openSessionId = initialOrder.sessionId;
    assert.ok(openSessionId, 'Sessão aberta deve existir após o pedido inicial');
    assert.equal(initialOrder.total, 40, 'Subtotal do pedido inicial deve ser R$ 40,00');

    // Avançar o pedido inicial para "preparing" para testar preservação de status no Cenário 6
    await restaurantRepo.updateOrderStatus(
      TENANT_A_ID,
      initialOrder.id,
      'preparing',
      WAITER_USER_A,
      'Cozinha iniciou preparo do pedido inicial'
    );

    // =========================================================================
    // CENÁRIO 1: Adição de um produto a uma mesa ocupada com sessão aberta
    // =========================================================================
    console.log('\n[Cenário 1] Adição de um produto a uma mesa ocupada com sessão aberta...');
    const add1Result = await restaurantRepo.addOrderToActiveSession(
      TENANT_A_ID,
      tableA.id,
      {
        sessionId: openSessionId,
        customerName: 'Mesa Garçom',
        notes: 'Cliente pediu bebida extra',
        idempotencyKey: `idem-test-1-${suffix}`,
        items: [
          {
            productId: prod2.id,
            quantity: 1,
            notes: 'Com gelo',
          },
        ],
      },
      WAITER_USER_A
    );

    assert.equal(add1Result.order.sessionId, openSessionId, 'Deve manter a mesma sessão aberta');
    assert.equal(add1Result.session.id, openSessionId, 'Não deve criar nova sessão');
    assert.equal(add1Result.session.status, 'open', 'A sessão deve permanecer aberta');
    assert.equal(add1Result.order.status, 'received', 'Novo pedido deve nascer com status "received"');
    assert.equal(add1Result.order.total, 12.0, 'Total do 1º pedido adicional deve ser R$ 12,00');
    assert.equal(add1Result.order.isAdditionalOrder, true, 'Deve ser marcado como pedido adicional');
    assert.equal(add1Result.order.sessionOrderSequence, 2, 'Sequência na sessão deve ser 2 (1º adicional)');
    console.log('✅ Cenário 1 aprovado!');

    // =========================================================================
    // CENÁRIO 2: Adição de vários produtos e quantidades no mesmo pedido adicional
    // =========================================================================
    console.log('\n[Cenário 2] Adição de vários produtos, variações e quantidades no mesmo pedido adicional...');
    const add2Result = await restaurantRepo.addOrderToActiveSession(
      TENANT_A_ID,
      tableA.id,
      {
        sessionId: openSessionId,
        customerName: 'Cliente Cadeira 3',
        notes: 'Segundo pedido adicional da mesa',
        idempotencyKey: `idem-test-2-${suffix}`,
        items: [
          {
            productId: prod1.id,
            quantity: 2, // 2 x R$ 40,00 = R$ 80,00
            notes: 'Bem passado',
          },
          {
            productId: prod2.id,
            variantId: variant2.id, // Jarra 1L = R$ 22,00
            quantity: 1,
            notes: 'Sem açúcar',
          },
        ],
      },
      WAITER_USER_A
    );

    assert.equal(add2Result.order.items.length, 2, 'O pedido adicional deve conter os 2 itens');
    assert.equal(add2Result.order.total, 102.0, 'Subtotal deste pedido adicional deve ser R$ 102,00 (80 + 22)');
    assert.equal(add2Result.order.sessionOrderSequence, 3, 'Sequência na sessão deve ser 3 (2º adicional)');
    assert.equal(add2Result.order.isAdditionalOrder, true, 'Deve ser marcado como pedido adicional');
    console.log('✅ Cenário 2 aprovado!');

    // =========================================================================
    // CENÁRIO 3: Atualização correta do total consumido da conta
    // =========================================================================
    console.log('\n[Cenário 3] Verificando atualização correta do total consumido da conta...');
    // Consumo acumulado: Inicial (40) + Adicional 1 (12) + Adicional 2 (102) = R$ 154,00
    assert.equal(add2Result.session.ordersSubtotal, 154.0, 'ordersSubtotal da sessão deve ser R$ 154,00');
    assert.equal(add2Result.session.totalAmount, 154.0, 'totalAmount da sessão deve ser R$ 154,00');
    assert.equal(add2Result.session.pendingAmount, 154.0, 'pendingAmount deve ser R$ 154,00');
    assert.equal(add2Result.session.paidAmount, 0, 'paidAmount deve ser R$ 0,00 (nada foi pago ainda)');
    console.log('✅ Cenário 3 aprovado!');

    // =========================================================================
    // CENÁRIO 4: Preservação de pagamentos parciais e descontos existentes
    // =========================================================================
    console.log('\n[Cenário 4] Verificando preservação de pagamentos parciais e descontos ao adicionar novos itens...');
    // Aplicar desconto de R$ 14,00 (Total líquido passa para R$ 140,00) e registrar pagamento parcial de R$ 50,00
    await restaurantAnalyticsService.updateSessionFinancialsAndPayments(
      TENANT_A_ID,
      openSessionId,
      {
        action: 'set_discount',
        discount: 14.0,
      },
      WAITER_USER_A
    );

    await restaurantAnalyticsService.updateSessionFinancialsAndPayments(
      TENANT_A_ID,
      openSessionId,
      {
        action: 'add_payment',
        amount: 50.0,
        paymentMethod: 'PIX',
        notes: 'Adiantamento parcial cliente 1',
      },
      WAITER_USER_A
    );

    const sessionAfterPartial = await restaurantRepo.getSessionDetails(TENANT_A_ID, openSessionId);
    assert.ok(sessionAfterPartial);
    assert.equal(sessionAfterPartial.discountAmount, 14.0, 'Desconto de R$ 14,00 deve estar registrado');
    assert.equal(sessionAfterPartial.paidAmount, 50.0, 'Valor pago de R$ 50,00 deve estar registrado');
    assert.equal(sessionAfterPartial.totalAmount, 140.0, 'Total líquido com desconto deve ser R$ 140,00');
    assert.equal(sessionAfterPartial.pendingAmount, 90.0, 'Saldo pendente antes de novo item deve ser R$ 90,00');
    assert.equal(sessionAfterPartial.paymentStatus, 'partial', 'Status financeiro deve ser "partial"');

    // Agora garçom adiciona mais 1x prod2 (R$ 12,00) na mesa que já tinha pagamento parcial e desconto
    const addAfterPartial = await restaurantRepo.addOrderToActiveSession(
      TENANT_A_ID,
      tableA.id,
      {
        sessionId: openSessionId,
        idempotencyKey: `idem-test-4-${suffix}`,
        items: [{ productId: prod2.id, quantity: 1 }],
      },
      WAITER_USER_A
    );

    // Novo subtotal de pedidos = 154 + 12 = 166. Desconto preservado = 14. Novo total líquido = 152.
    // Pagamento parcial preservado = 50. Novo saldo pendente = 152 - 50 = 102.
    assert.equal(addAfterPartial.session.ordersSubtotal, 166.0, 'ordersSubtotal deve subir para R$ 166,00');
    assert.equal(addAfterPartial.session.discountAmount, 14.0, 'Desconto de R$ 14,00 deve ser preservado');
    assert.equal(addAfterPartial.session.totalAmount, 152.0, 'Total líquido deve ser R$ 152,00 (166 - 14)');
    assert.equal(addAfterPartial.session.paidAmount, 50.0, 'Pagamento parcial de R$ 50,00 deve ser preservado sem duplicar');
    assert.equal(addAfterPartial.session.pendingAmount, 102.0, 'Saldo pendente deve ser atualizado para R$ 102,00');
    assert.equal(
      addAfterPartial.session.paymentStatus,
      'partial',
      'Sessão NÃO pode ser marcada como integralmente paga automaticamente'
    );
    console.log('✅ Cenário 4 aprovado!');

    // =========================================================================
    // CENÁRIO 5: Aparecimento imediato do pedido adicional no KDS (inclusive filtro Todos e Recebidos)
    // =========================================================================
    console.log('\n[Cenário 5] Verificando aparecimento imediato no KDS (filtro Todos e Recebidos)...');
    const kdsAllOrders = await restaurantRepo.listOrders(TENANT_A_ID, {
      sessionStatus: 'open',
      includeClosedSessions: false,
    });
    const sessionKdsOrders = kdsAllOrders.filter((o) => o.sessionId === openSessionId);
    assert.equal(sessionKdsOrders.length, 4, 'Todos os 4 pedidos da sessão aberta devem aparecer no filtro Todos do KDS');

    const kdsReceivedOrders = await restaurantRepo.listOrders(TENANT_A_ID, {
      status: 'received',
      sessionStatus: 'open',
    });
    const receivedIds = new Set(kdsReceivedOrders.map((o) => o.id));
    assert.ok(receivedIds.has(add1Result.order.id), '1º pedido adicional deve estar visível em Recebidos');
    assert.ok(receivedIds.has(add2Result.order.id), '2º pedido adicional deve estar visível em Recebidos');
    assert.ok(receivedIds.has(addAfterPartial.order.id), '3º pedido adicional deve estar visível em Recebidos');
    console.log('✅ Cenário 5 aprovado!');

    // =========================================================================
    // CENÁRIO 6: Preservação do status dos pedidos anteriores
    // =========================================================================
    console.log('\n[Cenário 6] Verificando preservação do status dos pedidos anteriores...');
    const initialInKds = sessionKdsOrders.find((o) => o.id === initialOrder.id);
    assert.ok(initialInKds, 'Pedido inicial deve continuar listado na sessão');
    assert.equal(
      initialInKds.status,
      'preparing',
      'Pedido inicial deve preservar seu status "preparing" sem ser reiniciado para "received"'
    );
    assert.equal(initialInKds.isAdditionalOrder, false, 'Pedido inicial deve ter isAdditionalOrder = false');
    assert.equal(initialInKds.sessionOrderSequence, 1, 'Pedido inicial deve ter sessionOrderSequence = 1');
    console.log('✅ Cenário 6 aprovado!');

    // =========================================================================
    // CENÁRIO 8: Prevenção de pedidos duplicados em múltiplos cliques (Idempotência)
    // =========================================================================
    console.log('\n[Cenário 8] Testando prevenção de pedidos duplicados com mesma idempotencyKey...');
    const duplicateAttempt = await restaurantRepo.addOrderToActiveSession(
      TENANT_A_ID,
      tableA.id,
      {
        sessionId: openSessionId,
        idempotencyKey: `idem-test-4-${suffix}`, // Mesma chave usada no Cenário 4
        items: [{ productId: prod2.id, quantity: 1 }],
      },
      WAITER_USER_A
    );

    assert.equal(
      duplicateAttempt.order.id,
      addAfterPartial.order.id,
      'Reenvio com mesma idempotencyKey deve retornar exatamente o mesmo pedido sem duplicar'
    );
    assert.equal(
      duplicateAttempt.session.totalAmount,
      152.0,
      'Total da conta não pode ser somado em duplicidade após duplo clique'
    );
    console.log('✅ Cenário 8 aprovado!');

    // =========================================================================
    // CENÁRIO 9: Bloqueio de acesso entre empresas diferentes (Multi-tenant isolation)
    // =========================================================================
    console.log('\n[Cenário 9] Testando bloqueio de acesso entre empresas diferentes (Multi-tenant)...');
    // 9A: Tenant B tentando adicionar pedido na mesa do Tenant A
    await assert.rejects(
      async () => {
        await restaurantRepo.addOrderToActiveSession(
          TENANT_B_ID,
          tableA.id,
          {
            sessionId: openSessionId,
            items: [{ productId: prod2.id, quantity: 1 }],
          },
          WAITER_USER_B
        );
      },
      /Mesa não encontrada|não pertence/i,
      'Tenant B deve ser bloqueado ao tentar acessar mesa do Tenant A'
    );

    // 9B: Usuário de outro tenant tentando operar no Tenant A
    await assert.rejects(
      async () => {
        await restaurantRepo.addOrderToActiveSession(
          TENANT_A_ID,
          tableA.id,
          {
            sessionId: openSessionId,
            items: [{ productId: prod2.id, quantity: 1 }],
          },
          WAITER_USER_B
        );
      },
      /Acesso negado/i,
      'Usuário do Tenant B não pode lançar pedidos no Tenant A'
    );

    // 9C: Tenant A tentando adicionar produto que pertence ao Tenant B
    await assert.rejects(
      async () => {
        await restaurantRepo.addOrderToActiveSession(
          TENANT_A_ID,
          tableA.id,
          {
            sessionId: openSessionId,
            items: [{ productId: prodTenantB.id, quantity: 1 }],
          },
          WAITER_USER_A
        );
      },
      /não pertencem a este restaurante/i,
      'Tenant A não pode adicionar produto pertencente ao Tenant B'
    );
    console.log('✅ Cenário 9 aprovado!');

    // =========================================================================
    // CENÁRIO 10: Validação de preços oficiais e disponibilidade no backend
    // =========================================================================
    console.log('\n[Cenário 10] Testando validação de preços oficiais, estoque e disponibilidade no backend...');
    // 10A: Tentativa de adicionar produto inativo
    await assert.rejects(
      async () => {
        await restaurantRepo.addOrderToActiveSession(
          TENANT_A_ID,
          tableA.id,
          {
            sessionId: openSessionId,
            items: [{ productId: prodInactive.id, quantity: 1 }],
          },
          WAITER_USER_A
        );
      },
      /inativo/i,
      'Produto inativo deve ser bloqueado pelo backend'
    );

    // 10B: Tentativa de adicionar quantidade acima do estoque disponível (prod1 tinha 10, já consumiu 1 + 2 = 3, restam 7)
    await assert.rejects(
      async () => {
        await restaurantRepo.addOrderToActiveSession(
          TENANT_A_ID,
          tableA.id,
          {
            sessionId: openSessionId,
            items: [{ productId: prod1.id, quantity: 50 }],
          },
          WAITER_USER_A
        );
      },
      /Estoque insuficiente/i,
      'Quantidade acima do estoque deve ser bloqueada pelo backend'
    );

    // 10C: Tentativa de manipular preço no payload do cliente (enviando unitPrice: 0.01)
    const manipulatedPayload: any = {
      sessionId: openSessionId,
      idempotencyKey: `idem-test-10c-${suffix}`,
      total: 0.01,
      subtotal: 0.01,
      items: [
        {
          productId: prod1.id,
          quantity: 1,
          unitPrice: 0.01,
          price: 0.01,
        },
      ],
    };
    const safePriceResult = await restaurantRepo.addOrderToActiveSession(
      TENANT_A_ID,
      tableA.id,
      manipulatedPayload,
      WAITER_USER_A
    );
    assert.equal(
      safePriceResult.order.items[0].unitPrice,
      40.0,
      'Backend deve ignorar preço manipulado (0.01) e usar preço oficial do banco (R$ 40,00)'
    );
    assert.equal(safePriceResult.order.total, 40.0, 'Total do pedido deve ser R$ 40,00');
    console.log('✅ Cenário 10 aprovado!');

    // =========================================================================
    // CENÁRIO 11: Atualização automática da conta e dos contadores operacionais
    // =========================================================================
    console.log('\n[Cenário 11] Verificando atualização automática da conta e dos contadores operacionais...');
    // Consumo total agora: 166 + 40 = 206. Desconto = 14 -> Líquido = 192. Pago = 50 -> Pendente = 142.
    const overviewTables = await restaurantAnalyticsService.getEnrichedTablesOverview(TENANT_A_ID, {
      period: 'today',
    });
    const enrichedTableA = overviewTables.find((t) => t.id === tableA.id);
    assert.ok(enrichedTableA, 'Mesa deve constar no overview enriquecido');
    assert.equal(enrichedTableA.currentSessionId, openSessionId, 'Overview deve apontar para a sessão aberta');
    assert.equal(enrichedTableA.currentSessionTotal, 192.0, 'Overview deve refletir o novo total líquido R$ 192,00');
    assert.equal(enrichedTableA.currentSessionPaidAmount, 50.0, 'Overview deve refletir R$ 50,00 pagos');
    assert.equal(enrichedTableA.currentSessionPendingAmount, 142.0, 'Overview deve refletir R$ 142,00 pendentes');
    assert.equal(enrichedTableA.currentSessionOrdersCount, 5, 'Overview deve contabilizar os 5 pedidos válidos da sessão');

    const summary = await restaurantRepo.getRestaurantSummary(TENANT_A_ID);
    assert.ok(summary.occupiedTables >= 1, 'Resumo operacional deve contabilizar a mesa ocupada');
    console.log('✅ Cenário 11 aprovado!');

    // =========================================================================
    // CENÁRIO 7: Bloqueio da inclusão após o encerramento da sessão
    // =========================================================================
    console.log('\n[Cenário 7] Testando bloqueio da inclusão de itens após o encerramento da sessão...');
    // Encerrar a sessão quitando o saldo restante
    await restaurantRepo.closeSession(
      TENANT_A_ID,
      tableA.id,
      WAITER_USER_A,
      'Fechamento total para teste do Cenário 7',
      'Cartão de Crédito',
      openSessionId,
      { settleRemainingBalance: true }
    );

    // 7A: Garçom estava com o modal aberto (tinha o sessionId antigo) e clicou em confirmar após o caixa encerrar a conta
    await assert.rejects(
      async () => {
        await restaurantRepo.addOrderToActiveSession(
          TENANT_A_ID,
          tableA.id,
          {
            sessionId: openSessionId,
            items: [{ productId: prod2.id, quantity: 1 }],
          },
          WAITER_USER_A
        );
      },
      /encerrada|não possui uma conta aberta/i,
      'Deve bloquear adição de itens quando a sessão foi encerrada entre abrir o catálogo e confirmar'
    );

    // 7B: Tentativa de adicionar itens em mesa livre sem sessão aberta
    await assert.rejects(
      async () => {
        await restaurantRepo.addOrderToActiveSession(
          TENANT_A_ID,
          tableA.id,
          {
            items: [{ productId: prod2.id, quantity: 1 }],
          },
          WAITER_USER_A
        );
      },
      /Não há nenhuma conta aberta|não possui uma conta aberta/i,
      'Deve bloquear adição de itens quando a mesa está livre sem sessão aberta'
    );
    console.log('✅ Cenário 7 aprovado!');

    // =========================================================================
    // CENÁRIO 12: Funcionamento em uma nova sessão aberta na mesma mesa após o encerramento da sessão anterior
    // =========================================================================
    console.log('\n[Cenário 12] Testando funcionamento em uma nova sessão aberta na mesma mesa...');
    // Abrir nova sessão na mesma mesa (novo cliente sentou na mesa)
    const newSessionFirstOrder = await restaurantRepo.createOrderFromTable(
      {
        tenantSlug: tenantA.slug,
        tableToken: tableA.qrCodeToken,
        customerName: 'Novo Cliente Sessão 2',
        items: [{ productId: prod2.id, quantity: 2 }], // 2 x 12 = R$ 24,00
      },
      '127.0.0.202'
    );

    const newSessionId = newSessionFirstOrder.sessionId;
    assert.notEqual(newSessionId, openSessionId, 'A nova sessão deve ter um ID diferente da sessão anterior encerrada');

    // Adicionar pedido adicional na nova sessão pelo garçom
    const newSessionAddResult = await restaurantRepo.addOrderToActiveSession(
      TENANT_A_ID,
      tableA.id,
      {
        sessionId: newSessionId,
        idempotencyKey: `idem-test-12-${suffix}`,
        items: [{ productId: prod1.id, quantity: 1 }], // + R$ 40,00
      },
      WAITER_USER_A
    );

    assert.equal(newSessionAddResult.session.id, newSessionId, 'Deve vincular à nova sessão aberta');
    assert.equal(newSessionAddResult.session.totalAmount, 64.0, 'Total da nova sessão deve ser R$ 64,00 (24 + 40), sem misturar com a sessão anterior');
    assert.equal(newSessionAddResult.order.sessionOrderSequence, 2, 'O adicional na nova sessão deve ser o 2º pedido (1º adicional) da nova sessão');
    assert.equal(newSessionAddResult.order.isAdditionalOrder, true, 'Deve ser marcado como adicional na nova sessão');

    // Verificar no KDS operacional que apenas os 2 pedidos da nova sessão aparecem para a mesa
    const kdsOrdersForTable = await restaurantRepo.listOrders(TENANT_A_ID, {
      tableId: tableA.id,
      sessionStatus: 'open',
      includeClosedSessions: false,
    });
    assert.equal(
      kdsOrdersForTable.length,
      2,
      'KDS operacional deve exibir apenas os 2 pedidos da nova sessão aberta, sem exibir os 5 da sessão anterior encerrada'
    );
    assert.equal(kdsOrdersForTable.find((o) => o.id === newSessionFirstOrder.id)?.sessionOrderSequence, 1);
    assert.equal(kdsOrdersForTable.find((o) => o.id === newSessionAddResult.order.id)?.sessionOrderSequence, 2);
    console.log('✅ Cenário 12 aprovado!');

    // =========================================================================
    // CENÁRIO 13: Persistência e recuperação de produtos, variações, observações e quantidades após atualizar a página
    // =========================================================================
    console.log('\n[Cenário 13] Verificando persistência e recuperação completa após recarregar a página...');
    const reloadedOrder2 = await restaurantRepo.getOrderById(TENANT_A_ID, add2Result.order.id);
    assert.ok(reloadedOrder2, 'Pedido adicional 2 deve ser recuperado integralmente do banco');
    assert.equal(reloadedOrder2.tenantId, TENANT_A_ID, 'Deve pertencer ao Tenant A');
    assert.equal(reloadedOrder2.sessionId, openSessionId, 'Deve estar vinculado à sessão original');
    assert.equal(reloadedOrder2.notes, 'Segundo pedido adicional da mesa', 'Observação geral do pedido deve persistir');
    assert.equal(reloadedOrder2.customerName, 'Cliente Cadeira 3', 'Nome do cliente na mesa deve persistir');
    assert.equal(reloadedOrder2.items.length, 2, 'Os 2 itens devem persistir');

    const persistedItem1 = reloadedOrder2.items.find((i) => i.productId === prod1.id);
    const persistedItem2 = reloadedOrder2.items.find((i) => i.productId === prod2.id);
    assert.ok(persistedItem1, 'Item 1 deve persistir');
    assert.equal(persistedItem1.quantity, 2, 'Quantidade (2) do Item 1 deve persistir');
    assert.equal(persistedItem1.unitPrice, 40.0, 'Preço oficial (R$ 40,00) do Item 1 deve persistir');
    assert.equal(persistedItem1.subtotal, 80.0, 'Subtotal (R$ 80,00) do Item 1 deve persistir');
    assert.equal(persistedItem1.notes, 'Bem passado', 'Observação ("Bem passado") do Item 1 deve persistir');

    assert.ok(persistedItem2, 'Item 2 com variação deve persistir');
    assert.equal(persistedItem2.variantId, variant2.id, 'variantId deve persistir');
    assert.equal(persistedItem2.variantName, 'Jarra 1L', 'Nome da variação ("Jarra 1L") deve persistir');
    assert.equal(persistedItem2.quantity, 1, 'Quantidade (1) do Item 2 deve persistir');
    assert.equal(persistedItem2.unitPrice, 22.0, 'Preço oficial da variação (R$ 22,00) deve persistir');
    assert.equal(persistedItem2.notes, 'Sem açúcar', 'Observação ("Sem açúcar") do Item 2 deve persistir');
    console.log('✅ Cenário 13 aprovado!');

    // =========================================================================
    // CENÁRIO 14: Revisão de subtotal, taxa percentual, desconto, pagamento parcial, remoção de item e cancelamento de pedido adicional
    // =========================================================================
    console.log('\n[Cenário 14] Testando recálculo com taxa de serviço (10%), desconto, pagamento parcial, edição de itens e cancelamento de pedido...');
    // Na nova sessão aberta (newSessionId):
    // Já tem: Pedido 1 (R$ 24,00) + Pedido Adicional 2 (R$ 40,00) = Subtotal R$ 64,00
    // 14.1: Adicionar taxa de serviço de 10% (deve calcular R$ 6,40 -> Total = R$ 70,40)
    await restaurantRepo.addFeeToSession(
      TENANT_A_ID,
      newSessionId,
      {
        name: 'Taxa de Serviço 10%',
        type: 'percentage',
        rateOrAmount: 10,
      },
      WAITER_USER_A
    );

    let s2Details = await restaurantRepo.getSessionDetails(TENANT_A_ID, newSessionId);
    assert.ok(s2Details);
    assert.equal(s2Details.ordersSubtotal, 64.0, 'Subtotal de pedidos deve ser R$ 64,00');
    assert.equal(s2Details.feesTotal, 6.4, 'Taxa de 10% sobre R$ 64,00 deve ser R$ 6,40');
    assert.equal(s2Details.totalAmount, 70.4, 'Total com taxa deve ser R$ 70,40');

    // 14.2: Aplicar desconto de R$ 10,40 (Total líquido = R$ 60,00) e registrar pagamento parcial de R$ 45,00 (Pendente = R$ 15,00)
    await restaurantAnalyticsService.updateSessionFinancialsAndPayments(
      TENANT_A_ID,
      newSessionId,
      { action: 'set_discount', discount: 10.4 },
      WAITER_USER_A
    );
    await restaurantAnalyticsService.updateSessionFinancialsAndPayments(
      TENANT_A_ID,
      newSessionId,
      { action: 'add_payment', amount: 45.0, paymentMethod: 'PIX' },
      WAITER_USER_A
    );

    s2Details = await restaurantRepo.getSessionDetails(TENANT_A_ID, newSessionId);
    assert.ok(s2Details);
    assert.equal(s2Details.totalAmount, 60.0, 'Total líquido deve ser R$ 60,00 (64 + 6,40 - 10,40)');
    assert.equal(s2Details.paidAmount, 45.0, 'Valor pago deve ser R$ 45,00');
    assert.equal(s2Details.pendingAmount, 15.0, 'Saldo pendente deve ser R$ 15,00');
    assert.equal(s2Details.paymentStatus, 'partial', 'Status deve ser partial');

    // 14.3: Adicionar 3º pedido na sessão (2x prod2 = R$ 24,00 + 1x prod1 = R$ 40,00 -> Subtotal pedido = R$ 64,00)
    // Novo subtotal sessão = 64 + 64 = 128,00. Taxa 10% recalcula para R$ 12,80. Bruto = 140,80.
    // Desconto preservado = 10,40 -> Líquido = 130,40. Pago = 45,00 -> Pendente = 85,40.
    const add3InNewSession = await restaurantRepo.addOrderToActiveSession(
      TENANT_A_ID,
      tableA.id,
      {
        sessionId: newSessionId,
        idempotencyKey: `idem-test-14-add-${suffix}`,
        items: [
          { productId: prod2.id, quantity: 2 },
          { productId: prod1.id, quantity: 1 },
        ],
      },
      WAITER_USER_A
    );
    assert.equal(add3InNewSession.session.ordersSubtotal, 128.0, 'Subtotal deve subir para R$ 128,00');
    assert.equal(add3InNewSession.session.feesTotal, 12.8, 'Taxa de 10% deve recalcular para R$ 12,80');
    assert.equal(add3InNewSession.session.totalAmount, 130.4, 'Total líquido deve ser R$ 130,40');
    assert.equal(add3InNewSession.session.paidAmount, 45.0, 'Pagamento parcial de R$ 45,00 preservado');
    assert.equal(add3InNewSession.session.pendingAmount, 85.4, 'Saldo pendente deve ser R$ 85,40');

    // 14.4: Remover 1 item (prod1 = R$ 40,00) de dentro do 3º pedido via updateRestaurantOrder (mantendo apenas 2x prod2 = R$ 24,00)
    // Novo subtotal sessão = 64 + 24 = 88,00. Taxa 10% = 8,80. Bruto = 96,80. Desconto = 10,40 -> Líquido = 86,40. Pendente = 41,40.
    await restaurantRepo.updateRestaurantOrder(
      TENANT_A_ID,
      add3InNewSession.order.id,
      {
        items: [{ productId: prod2.id, quantity: 2 }],
      },
      WAITER_USER_A
    );
    s2Details = await restaurantRepo.getSessionDetails(TENANT_A_ID, newSessionId);
    assert.ok(s2Details);
    assert.equal(s2Details.ordersSubtotal, 88.0, 'Após remover item do pedido, subtotal deve ser R$ 88,00');
    assert.equal(s2Details.feesTotal, 8.8, 'Taxa de 10% deve recalcular para R$ 8,80');
    assert.equal(s2Details.totalAmount, 86.4, 'Total líquido deve recalcular para R$ 86,40');
    assert.equal(s2Details.pendingAmount, 41.4, 'Saldo pendente deve recalcular para R$ 41,40');

    // 14.5: Cancelar integralmente o 3º pedido adicional (cancelOrder)
    // Subtotal volta para R$ 64,00. Taxa 10% volta para R$ 6,40. Líquido volta para R$ 60,00. Pendente volta para R$ 15,00.
    await restaurantRepo.cancelOrder(
      TENANT_A_ID,
      add3InNewSession.order.id,
      WAITER_USER_A,
      'Cliente desistiu do 3º pedido adicional'
    );
    s2Details = await restaurantRepo.getSessionDetails(TENANT_A_ID, newSessionId);
    assert.ok(s2Details);
    assert.equal(s2Details.ordersSubtotal, 64.0, 'Após cancelar 3º pedido, subtotal volta para R$ 64,00');
    assert.equal(s2Details.feesTotal, 6.4, 'Taxa de 10% volta para R$ 6,40');
    assert.equal(s2Details.totalAmount, 60.0, 'Total líquido volta para R$ 60,00');
    assert.equal(s2Details.paidAmount, 45.0, 'Pago permanece R$ 45,00');
    assert.equal(s2Details.pendingAmount, 15.0, 'Pendente volta para R$ 15,00');
    console.log('✅ Cenário 14 aprovado!');

    // =========================================================================
    // CENÁRIO 15: Idempotência sob requisições simultâneas concorrentes (Promise.all)
    // =========================================================================
    console.log('\n[Cenário 15] Testando idempotência sob 3 requisições simultâneas concorrentes...');
    const concurrentKey = `idem-concurrent-${suffix}`;
    const [conc1, conc2, conc3] = await Promise.all([
      restaurantRepo.addOrderToActiveSession(
        TENANT_A_ID,
        tableA.id,
        {
          sessionId: newSessionId,
          idempotencyKey: concurrentKey,
          items: [{ productId: prod2.id, quantity: 1 }], // + R$ 12,00
        },
        WAITER_USER_A
      ),
      restaurantRepo.addOrderToActiveSession(
        TENANT_A_ID,
        tableA.id,
        {
          sessionId: newSessionId,
          idempotencyKey: concurrentKey,
          items: [{ productId: prod2.id, quantity: 1 }],
        },
        WAITER_USER_A
      ),
      restaurantRepo.addOrderToActiveSession(
        TENANT_A_ID,
        tableA.id,
        {
          sessionId: newSessionId,
          idempotencyKey: concurrentKey,
          items: [{ productId: prod2.id, quantity: 1 }],
        },
        WAITER_USER_A
      ),
    ]);

    assert.equal(conc1.order.id, conc2.order.id, 'Requisições simultâneas 1 e 2 devem retornar o mesmo order.id');
    assert.equal(conc2.order.id, conc3.order.id, 'Requisições simultâneas 2 e 3 devem retornar o mesmo order.id');

    const { data: dbConcurrentOrders } = await supabaseAdmin
      .from('restaurant_orders')
      .select('id')
      .eq('tenant_id', TENANT_A_ID)
      .eq('idempotency_key', concurrentKey);
    assert.equal(
      (dbConcurrentOrders || []).length,
      1,
      'Apenas 1 registro deve existir no banco para a mesma chave de idempotência mesmo sob concorrência'
    );
    console.log('✅ Cenário 15 aprovado!');

    // =========================================================================
    // CENÁRIO 16: Auditoria de integridade de IDs únicos em server/supabaseAdmin.ts
    // =========================================================================
    console.log('\n[Cenário 16] Auditando preservação de IDs únicos em tabelas multi-registro...');
    assert.notEqual(prod1.id, prod2.id, 'Produtos distintos do mesmo tenant devem ter IDs únicos');
    assert.notEqual(prod2.id, prodInactive.id, 'Produtos distintos do mesmo tenant jamais devem colidir');
    assert.notEqual(initialOrder.id, add1Result.order.id, 'Pedidos distintos na mesma sessão devem ter IDs únicos');
    assert.notEqual(add1Result.order.id, add2Result.order.id, 'Pedidos adicionais distintos devem ter IDs únicos');
    console.log('✅ Cenário 16 aprovado!');

    console.log('\n===================================================================');
    console.log('🎉 TODOS OS 16 CENÁRIOS DE VERIFICAÇÃO E AUDITORIA FORAM APROVADOS!');
    console.log('===================================================================');
  } finally {
    // Limpeza segura dos dados de teste criados (incluindo taxas e ledger das sessões de teste)
    for (const tableId of createdTableIds) {
      const { data: sessionRows } = await supabaseAdmin
        .from('restaurant_sessions')
        .select('id, tenant_id')
        .eq('table_id', tableId);
      const sessionIds = (sessionRows || []).map((s: any) => s.id);
      if (sessionIds.length > 0) {
        await supabaseAdmin.from('restaurant_session_fees').delete().in('session_id', sessionIds);
      }

      const { data: orderRows } = await supabaseAdmin
        .from('restaurant_orders')
        .select('id')
        .eq('table_id', tableId);
      const orderIds = (orderRows || []).map((r: any) => r.id);
      if (orderIds.length > 0) {
        await supabaseAdmin.from('restaurant_order_status_history').delete().in('order_id', orderIds);
        await supabaseAdmin.from('restaurant_order_items').delete().in('order_id', orderIds);
      }
      await supabaseAdmin.from('restaurant_orders').delete().eq('table_id', tableId);
      await supabaseAdmin.from('restaurant_sessions').delete().eq('table_id', tableId);
      await supabaseAdmin.from('restaurant_tables').delete().eq('id', tableId);
    }
    if (createdVariantIds.length > 0) {
      await supabaseAdmin.from('product_variants').delete().in('id', createdVariantIds);
    }
    if (createdProductIds.length > 0) {
      await supabaseAdmin.from('products').delete().in('id', createdProductIds);
    }
  }
}

runVerification().catch((err) => {
  console.error('❌ FALHA NA SUÍTE DE TESTES:', err);
  process.exit(1);
});
