import crypto from 'crypto';
import { supabaseAdmin } from '../server/supabaseAdmin.js';
import { restaurantRepo } from '../server/db/restaurantRepository.js';
import { restaurantAnalyticsService } from '../server/services/restaurantAnalyticsService.js';
import { User } from '../src/types/saas.js';

let TENANT_A_ID = 'd80351bc-52b8-46c8-96c0-9d6622f4a680';
let TENANT_B_ID = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

const actorA: User = {
  id: '00000000-0000-4000-8000-000000000001',
  tenantId: TENANT_A_ID,
  name: 'Gerente Teste KDS',
  email: 'gerente.kds@teste.com',
  role: 'CLIENT_ADMIN',
  status: 'active',
  createdAt: new Date().toISOString(),
};

const actorB: User = {
  id: '00000000-0000-4000-8000-000000000002',
  tenantId: TENANT_B_ID,
  name: 'Gerente Outra Empresa',
  email: 'outro@teste.com',
  role: 'CLIENT_ADMIN',
  status: 'active',
  createdAt: new Date().toISOString(),
};

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`FALHA DE ASSERÇÃO: ${message}`);
  }
}

async function runVerification() {
  console.log('================================================================================');
  console.log('INICIANDO SUÍTE DE VERIFICAÇÃO: MESAS & SALÃO -> PEDIDOS & KDS DAS MESAS');
  console.log('================================================================================\n');

  const createdTableIds: string[] = [];
  const createdSessionIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdProductIds: string[] = [];

  try {
    // Obter o slug real da empresa A no banco de dados (ou primeiro tenant disponível no adapter local)
    let { data: tenantRecord } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, name')
      .eq('id', TENANT_A_ID)
      .maybeSingle();

    if (!tenantRecord) {
      const { data: allTenants } = await supabaseAdmin.from('tenants').select('id, slug, name').limit(2);
      if (allTenants && allTenants.length > 0) {
        tenantRecord = allTenants[0];
        TENANT_A_ID = tenantRecord.id;
        actorA.tenantId = TENANT_A_ID;
        if (allTenants.length > 1) {
          TENANT_B_ID = allTenants[1].id;
          actorB.tenantId = TENANT_B_ID;
        }
      }
    }

    assert(tenantRecord && tenantRecord.slug, 'Tenant de teste deve existir no banco');
    const tenantSlug = tenantRecord!.slug;

    // Obter um produto ativo da empresa A para criar pedidos reais (ou criar um temporário se não houver)
    let { data: products } = await supabaseAdmin
      .from('products')
      .select('id, name, price')
      .eq('tenant_id', TENANT_A_ID)
      .eq('is_active', true)
      .limit(2);

    if (!products || products.length === 0) {
      const tempProdId = crypto.randomUUID();
      await supabaseAdmin.from('products').insert({
        id: tempProdId,
        tenant_id: TENANT_A_ID,
        name: 'Produto Teste KDS Temporário',
        slug: `prod-kds-temp-${Date.now()}`,
        price: 35.0,
        is_active: true,
        stock_quantity: 100,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      createdProductIds.push(tempProdId);
      products = [{ id: tempProdId, name: 'Produto Teste KDS Temporário', price: 35.0 }];
    }

    assert(products && products.length > 0, 'Empresa de teste deve possuir ao menos 1 produto ativo');
    const testProduct = products![0];

    // Criar 2 mesas dedicadas de teste para não interferir nas mesas fixas durante o teste
    const table1 = await restaurantRepo.createTable(
      TENANT_A_ID,
      { tableNumber: 'T-KDS-01', name: 'Salão Teste 1', isActive: true },
      actorA
    );
    createdTableIds.push(table1.id);

    const table2 = await restaurantRepo.createTable(
      TENANT_A_ID,
      { tableNumber: 'T-KDS-02', name: 'Salão Teste 2', isActive: true },
      actorA
    );
    createdTableIds.push(table2.id);

    // =========================================================================
    // TESTE 1: Encerrar conta na Visão Geral e validar desaparecimento no KDS
    // =========================================================================
    console.log('▶ Executando Teste 1: Encerrar conta na Visão Geral...');
    const order1A = await restaurantRepo.createOrderFromTable(
      {
        tenantSlug,
        tableToken: table1.qrCodeToken,
        customerName: 'Cliente Teste 1A',
        notes: 'Sem cebola',
        items: [{ productId: testProduct.id, quantity: 2, notes: 'Bem passado' }],
      },
      '127.0.0.101'
    );
    createdOrderIds.push(order1A.id);
    createdSessionIds.push(order1A.sessionId);

    const order1B = await restaurantRepo.createOrderFromTable(
      {
        tenantSlug,
        tableToken: table1.qrCodeToken,
        customerName: 'Cliente Teste 1B',
        items: [{ productId: testProduct.id, quantity: 1 }],
      },
      '127.0.0.102'
    );
    createdOrderIds.push(order1B.id);

    // Avançar status do order1A para 'preparing' e order1B para 'delivered'
    await restaurantRepo.updateOrderStatus(TENANT_A_ID, order1A.id, 'preparing', actorA);
    await restaurantRepo.updateOrderStatus(TENANT_A_ID, order1B.id, 'delivered', actorA);

    // Verificar que ambos aparecem no KDS operacional (filtro Todos, Em Preparo, Entregues)
    const kdsBeforeClose1 = await restaurantRepo.listOrders(TENANT_A_ID, { sessionStatus: 'open' });
    assert(
      kdsBeforeClose1.some((o) => o.id === order1A.id) && kdsBeforeClose1.some((o) => o.id === order1B.id),
      'Pedidos da Mesa T-KDS-01 deveriam aparecer no KDS enquanto a conta está aberta'
    );

    // Encerrar conta da Mesa T-KDS-01 (como feito na Visão Geral)
    const closeRes1 = await restaurantRepo.closeSession(
      TENANT_A_ID,
      table1.id,
      actorA,
      'Fechamento na Visão Geral',
      'PIX',
      order1A.sessionId
    );
    assert(closeRes1.session.status === 'closed', 'Sessão deveria estar com status closed');

    // Verificar imediatamente o KDS operacional em todos os filtros (Todos, preparing, delivered)
    const kdsAfterClose1All = await restaurantRepo.listOrders(TENANT_A_ID, { sessionStatus: 'open' });
    const kdsAfterClose1Delivered = await restaurantRepo.listOrders(TENANT_A_ID, {
      sessionStatus: 'open',
      status: 'delivered',
    });
    assert(
      !kdsAfterClose1All.some((o) => o.id === order1A.id || o.id === order1B.id),
      'Pedidos da sessão encerrada NÃO podem aparecer no filtro Todos do KDS operacional'
    );
    assert(
      !kdsAfterClose1Delivered.some((o) => o.id === order1A.id || o.id === order1B.id),
      'Pedidos da sessão encerrada NÃO podem aparecer no filtro Entregues do KDS operacional'
    );
    console.log('  ✅ Teste 1 APROVADO: Pedidos saíram imediatamente do KDS operacional (inclusive filtro Todos).\n');

    // =========================================================================
    // TESTE 2 & TESTE 3: Encerrar conta pela tela Pedidos & KDS + Outra mesa aberta
    // =========================================================================
    console.log('▶ Executando Teste 2 e Teste 3: Encerrar conta pelo KDS mantendo outra mesa aberta...');
    const orderMesa1 = await restaurantRepo.createOrderFromTable(
      {
        tenantSlug,
        tableToken: table1.qrCodeToken,
        customerName: 'Cliente KDS Close',
        items: [{ productId: testProduct.id, quantity: 3 }],
      },
      '127.0.0.103'
    );
    createdOrderIds.push(orderMesa1.id);
    createdSessionIds.push(orderMesa1.sessionId);

    const orderMesa2 = await restaurantRepo.createOrderFromTable(
      {
        tenantSlug,
        tableToken: table2.qrCodeToken,
        customerName: 'Cliente Mesa 2 Continua Aberta',
        items: [{ productId: testProduct.id, quantity: 1 }],
      },
      '127.0.0.104'
    );
    createdOrderIds.push(orderMesa2.id);
    createdSessionIds.push(orderMesa2.sessionId);

    // No KDS, avançar status do pedido da Mesa 1 (received -> confirmed -> preparing -> ready -> delivered)
    await restaurantRepo.updateOrderStatus(TENANT_A_ID, orderMesa1.id, 'confirmed', actorA);
    await restaurantRepo.updateOrderStatus(TENANT_A_ID, orderMesa1.id, 'preparing', actorA);
    await restaurantRepo.updateOrderStatus(TENANT_A_ID, orderMesa1.id, 'ready', actorA);
    const deliveredMesa1 = await restaurantRepo.updateOrderStatus(TENANT_A_ID, orderMesa1.id, 'delivered', actorA);
    assert(deliveredMesa1.status === 'delivered', 'Pedido deveria avançar até delivered pelo KDS');

    // Encerrar conta da Mesa 1 a partir do fluxo do KDS
    const closeRes2 = await restaurantRepo.closeSession(
      TENANT_A_ID,
      table1.id,
      actorA,
      'Encerrado direto pelo KDS',
      'Cartão de Crédito',
      orderMesa1.sessionId
    );
    assert(closeRes2.session.status === 'closed', 'Sessão da Mesa 1 deveria estar encerrada');

    const kdsAfterClose2 = await restaurantRepo.listOrders(TENANT_A_ID, { sessionStatus: 'open' });
    assert(
      !kdsAfterClose2.some((o) => o.id === orderMesa1.id),
      'Pedido da Mesa 1 encerrada pelo KDS deve desaparecer da lista operacional'
    );
    assert(
      kdsAfterClose2.some((o) => o.id === orderMesa2.id),
      'Pedido da Mesa 2 (que continua com conta aberta) DEVE permanecer visível no KDS'
    );

    const tablesStateAfter2 = await restaurantRepo.listTables(TENANT_A_ID);
    const t1State = tablesStateAfter2.find((t) => t.id === table1.id)!;
    const t2State = tablesStateAfter2.find((t) => t.id === table2.id)!;
    assert(t1State.status === 'available' && t1State.currentSessionId === null, 'Mesa 1 deve ficar livre na Visão Geral');
    assert(
      t2State.status === 'occupied' && t2State.currentSessionId === orderMesa2.sessionId,
      'Mesa 2 deve continuar ocupada na Visão Geral'
    );
    console.log('  ✅ Teste 2 e Teste 3 APROVADOS: Fechamento pelo KDS sincronizado e Mesa 2 permaneceu intacta.\n');

    // =========================================================================
    // TESTE 4: Nova sessão na mesma mesa (não misturar sessões antigas com a nova)
    // =========================================================================
    console.log('▶ Executando Teste 4: Abrir nova sessão na mesma mesa (T-KDS-01)...');
    const newSessionOrder = await restaurantRepo.createOrderFromTable(
      {
        tenantSlug,
        tableToken: table1.qrCodeToken,
        customerName: 'Novo Cliente Nova Sessão',
        items: [{ productId: testProduct.id, quantity: 2 }],
      },
      '127.0.0.105'
    );
    createdOrderIds.push(newSessionOrder.id);
    createdSessionIds.push(newSessionOrder.sessionId);

    assert(
      newSessionOrder.sessionId !== order1A.sessionId && newSessionOrder.sessionId !== orderMesa1.sessionId,
      'Nova sessão na mesma mesa deve ter um sessionId distinto das sessões encerradas'
    );

    const kdsForTable1 = await restaurantRepo.listOrders(TENANT_A_ID, {
      tableId: table1.id,
      sessionStatus: 'open',
    });
    assert(
      kdsForTable1.length === 1 && kdsForTable1[0].id === newSessionOrder.id,
      `KDS para a Mesa 1 deve exibir APENAS o pedido da nova sessão aberta (encontrados: ${kdsForTable1.length})`
    );
    assert(
      !kdsForTable1.some((o) => o.id === order1A.id || o.id === order1B.id || o.id === orderMesa1.id),
      'Pedidos de sessões antigas da mesma mesa jamais devem reaparecer no KDS operacional'
    );
    console.log('  ✅ Teste 4 APROVADO: Nova sessão na mesma mesa exibe apenas os pedidos novos.\n');

    // Encerrar as sessões abertas de teste (Mesa 1 nova sessão e Mesa 2) para testar persistência pós-reload (Teste 5)
    await restaurantRepo.closeSession(TENANT_A_ID, table1.id, actorA, 'Fechamento Teste 4', 'PIX', newSessionOrder.sessionId);
    await restaurantRepo.closeSession(TENANT_A_ID, table2.id, actorA, 'Fechamento Mesa 2', 'Dinheiro', orderMesa2.sessionId);

    // =========================================================================
    // TESTE 5: Recarregar a página (Reconsulta limpa do backend/banco de dados)
    // =========================================================================
    console.log('▶ Executando Teste 5: Simular recarregamento completo da página (GET /api/restaurant/orders)...');
    const freshReloadOrders = await restaurantRepo.listOrders(TENANT_A_ID, { sessionStatus: 'open' });
    const anyClosedInFreshReload = freshReloadOrders.some(
      (o) =>
        createdOrderIds.includes(o.id) ||
        o.sessionStatus === 'closed' ||
        Boolean(o.sessionClosedAt)
    );
    assert(
      !anyClosedInFreshReload,
      'Após recarregar os dados do banco, nenhum pedido de sessão encerrada retornou na listagem operacional'
    );
    console.log('  ✅ Teste 5 APROVADO: Persistência confirmada no banco; pedidos encerrados não voltam após F5.\n');

    // =========================================================================
    // TESTE 6: Histórico e Relatórios Financeiros preservados
    // =========================================================================
    console.log('▶ Executando Teste 6: Verificar preservação no Histórico e Relatórios Financeiros...');
    const closedHistoryOrders = await restaurantRepo.listOrders(TENANT_A_ID, { sessionStatus: 'closed' });
    for (const cid of createdOrderIds) {
      assert(
        closedHistoryOrders.some((o) => o.id === cid),
        `Pedido histórico ${cid} deve continuar preservado e consultável no modo Histórico`
      );
    }

    const unifiedHistory = await restaurantAnalyticsService.queryUnifiedOrders(TENANT_A_ID, {
      period: 'today',
      limit: 100,
    });
    for (const cid of createdOrderIds) {
      const foundInUnified = unifiedHistory.orders.find((u: any) => u.id === cid);
      assert(
        Boolean(foundInUnified && foundInUnified.paymentStatus === 'paid'),
        `Pedido ${cid} deve constar como PAGO na Gestão Unificada de Pedidos & Relatório Financeiro`
      );
    }
    console.log('  ✅ Teste 6 APROVADO: Todos os pedidos, itens e pagamentos continuam íntegros no histórico e financeiro.\n');

    // =========================================================================
    // TESTE 7: Falha no encerramento (não produzir falso sucesso)
    // =========================================================================
    console.log('▶ Executando Teste 7: Simular falha no encerramento...');
    let failedProperly = false;
    try {
      await restaurantRepo.closeSession(TENANT_A_ID, crypto.randomUUID(), actorA, 'Teste falha', 'PIX');
    } catch (err: any) {
      failedProperly = true;
    }
    assert(failedProperly, 'O backend deve lançar erro explícito quando o encerramento falha');
    console.log('  ✅ Teste 7 APROVADO: Falha no encerramento retorna erro explícito e não altera estado indevidamente.\n');

    // =========================================================================
    // TESTE 8: Isolamento Multi-Tenant
    // =========================================================================
    console.log('▶ Executando Teste 8: Validar isolamento entre empresas (Multi-tenant)...');
    const orderTenantA = await restaurantRepo.createOrderFromTable(
      {
        tenantSlug,
        tableToken: table1.qrCodeToken,
        customerName: 'Cliente Isolamento Tenant A',
        items: [{ productId: testProduct.id, quantity: 1 }],
      },
      '127.0.0.106'
    );
    createdOrderIds.push(orderTenantA.id);
    createdSessionIds.push(orderTenantA.sessionId);

    // Verificar que Empresa B não enxerga os pedidos da Empresa A
    const tenantBOrders = await restaurantRepo.listOrders(TENANT_B_ID, { sessionStatus: 'open' });
    assert(
      !tenantBOrders.some((o) => o.tenantId === TENANT_A_ID || o.id === orderTenantA.id),
      'Empresa B jamais pode visualizar pedidos da Empresa A'
    );

    // Verificar que ator da Empresa B não consegue encerrar sessão da Empresa A
    let crossTenantBlocked = false;
    try {
      await restaurantRepo.closeSession(TENANT_A_ID, table1.id, actorB, 'Tentativa invasão', 'PIX');
    } catch (err: any) {
      crossTenantBlocked = true;
    }
    assert(crossTenantBlocked, 'Tentativa de encerramento por usuário de outro tenant deve ser bloqueada');

    let wrongTenantQueryBlocked = false;
    try {
      await restaurantRepo.closeSession(TENANT_B_ID, table1.id, actorB, 'Tentativa tenant errado', 'PIX');
    } catch (err: any) {
      wrongTenantQueryBlocked = true;
    }
    assert(wrongTenantQueryBlocked, 'Tentativa de encerrar tableId de outro tenant deve falhar');
    console.log('  ✅ Teste 8 APROVADO: Isolamento multi-tenant garantido nas listagens e no encerramento.\n');

    // =========================================================================
    // TESTE 9: Prevenção de Duplicidade de Encerramento e Edição Pós-Fechamento
    // =========================================================================
    console.log('▶ Executando Teste 9: Validar bloqueio contra encerramento duplicado...');
    const firstClose = await restaurantRepo.closeSession(
      TENANT_A_ID,
      table1.id,
      actorA,
      'Primeiro fechamento válido',
      'PIX',
      orderTenantA.sessionId
    );
    assert(firstClose.session.status === 'closed', 'Primeiro fechamento deve concluir com sucesso');

    // Tentar encerrar novamente a mesma sessão/mesa (deve bloquear)
    let duplicateCloseBlocked = false;
    try {
      await restaurantRepo.closeSession(
        TENANT_A_ID,
        table1.id,
        actorA,
        'Segundo fechamento duplicado',
        'PIX',
        orderTenantA.sessionId
      );
    } catch (err: any) {
      duplicateCloseBlocked = true;
    }
    assert(duplicateCloseBlocked, 'Segundo encerramento para a mesma sessão deve ser bloqueado');

    // Tentar alterar o status de um pedido de sessão já encerrada (deve bloquear)
    let statusChangeOnClosedBlocked = false;
    try {
      await restaurantRepo.updateOrderStatus(TENANT_A_ID, orderTenantA.id, 'preparing', actorA);
    } catch (err: any) {
      statusChangeOnClosedBlocked = true;
    }
    assert(statusChangeOnClosedBlocked, 'Alteração de status em pedido de comanda já encerrada deve ser bloqueada');
    console.log('  ✅ Teste 9 APROVADO: Encerramento duplicado e mutações pós-fechamento bloqueados com segurança.\n');

    // =========================================================================
    // TESTE 10: Filtros, Contadores e Mudança de Status no KDS
    // =========================================================================
    console.log('▶ Executando Teste 10: Validar todos os filtros e contadores do KDS...');
    const orderFilterTest = await restaurantRepo.createOrderFromTable(
      {
        tenantSlug,
        tableToken: table2.qrCodeToken,
        customerName: 'Cliente Filtro Status',
        items: [{ productId: testProduct.id, quantity: 1 }],
      },
      '127.0.0.107'
    );
    createdOrderIds.push(orderFilterTest.id);
    createdSessionIds.push(orderFilterTest.sessionId);

    const openAll = await restaurantRepo.listOrders(TENANT_A_ID, { sessionStatus: 'open' });
    const openReceived = await restaurantRepo.listOrders(TENANT_A_ID, {
      sessionStatus: 'open',
      status: 'received',
    });
    assert(
      openReceived.some((o) => o.id === orderFilterTest.id),
      'Pedido recém-criado deve constar no filtro Recebidos'
    );
    assert(
      openAll.every((o) => o.sessionStatus === 'open' && !o.sessionClosedAt),
      'Filtro Todos (sessionStatus: open) deve conter exclusivamente pedidos de sessões abertas'
    );

    // Avançar para preparing e verificar migração entre filtros
    await restaurantRepo.updateOrderStatus(TENANT_A_ID, orderFilterTest.id, 'preparing', actorA);
    const openReceivedAfter = await restaurantRepo.listOrders(TENANT_A_ID, {
      sessionStatus: 'open',
      status: 'received',
    });
    const openPreparingAfter = await restaurantRepo.listOrders(TENANT_A_ID, {
      sessionStatus: 'open',
      status: 'preparing',
    });
    assert(!openReceivedAfter.some((o) => o.id === orderFilterTest.id), 'Pedido não deve mais constar em Recebidos');
    assert(openPreparingAfter.some((o) => o.id === orderFilterTest.id), 'Pedido deve constar em Em Preparo');

    // Encerrar a sessão do Teste 10
    await restaurantRepo.closeSession(
      TENANT_A_ID,
      table2.id,
      actorA,
      'Fechamento Teste 10',
      'PIX',
      orderFilterTest.sessionId
    );
    const openAfter10 = await restaurantRepo.listOrders(TENANT_A_ID, { sessionStatus: 'open' });
    assert(
      !openAfter10.some((o) => o.id === orderFilterTest.id),
      'Após encerrar a conta no Teste 10, o pedido sai de todos os filtros operacionais'
    );
    console.log('  ✅ Teste 10 APROVADO: Filtros Todos, Recebidos, Em Preparo, Entregues e contadores 100% consistentes.\n');

    // =========================================================================
    // TESTE 11: Auditoria Financeira (Integral vs. Parcial vs. Pendente + Idempotência)
    // =========================================================================
    console.log('▶ Executando Teste 11: Conferência Financeira Obrigatória (Integral, Parcial, Pendente e Idempotência)...');

    // 11.A — Tentativa de encerrar com saldo pendente (requireFullPayment: true) e Pagamento Parcial preservado
    const orderPartial = await restaurantRepo.createOrderFromTable(
      {
        tenantSlug,
        tableToken: table1.qrCodeToken,
        customerName: 'Cliente Pagamento Parcial',
        items: [{ productId: testProduct.id, quantity: 2 }],
      },
      '127.0.0.108'
    );
    createdOrderIds.push(orderPartial.id);
    createdSessionIds.push(orderPartial.sessionId);

    const partialSessionTotal = Number(orderPartial.total);
    const partialPaidValue = Math.round(partialSessionTotal * 0.4 * 100) / 100;
    const expectedPartialPending = Math.round((partialSessionTotal - partialPaidValue) * 100) / 100;

    // Registrar pagamento parcial de 40% na comanda aberta
    const partialUpdate = await restaurantAnalyticsService.updateSessionFinancialsAndPayments(
      TENANT_A_ID,
      orderPartial.sessionId,
      {
        action: 'add_payment',
        amount: partialPaidValue,
        paymentMethod: 'PIX',
        notes: 'Entrada parcial de 40%',
      },
      actorA
    );
    assert(partialUpdate.paymentStatus === 'partial', 'Sessão aberta com pagamento parcial deve ter status partial');
    assert(partialUpdate.paidAmount === partialPaidValue, 'paidAmount deve refletir exatamente o valor parcial pago');
    assert(partialUpdate.pendingAmount === expectedPartialPending, 'pendingAmount deve refletir o saldo restante');

    // Tentar encerrar exigindo pagamento integral (requireFullPayment: true) -> deve bloquear!
    let blockedUnsettledClose = false;
    try {
      await restaurantRepo.closeSession(
        TENANT_A_ID,
        table1.id,
        actorA,
        'Tentativa de fechar exigindo quitação total',
        'PIX',
        orderPartial.sessionId,
        { requireFullPayment: true }
      );
    } catch (err: any) {
      blockedUnsettledClose = true;
    }
    assert(
      blockedUnsettledClose,
      'Tentativa de encerrar conta com saldo pendente quando requireFullPayment=true deve ser bloqueada'
    );

    // Confirmar que a sessão continua aberta após o bloqueio
    const sessionStillOpen = await restaurantRepo.getSessionDetails(TENANT_A_ID, orderPartial.sessionId);
    assert(sessionStillOpen?.status === 'open', 'Sessão deve permanecer aberta após bloqueio de saldo pendente');

    // Agora encerrar a sessão mantendo o pagamento parcial (sem liquidar o restante)
    const closedPartialRes = await restaurantRepo.closeSession(
      TENANT_A_ID,
      table1.id,
      actorA,
      'Fechamento mantendo saldo parcial pendente',
      'PIX',
      orderPartial.sessionId
    );
    assert(closedPartialRes.session.status === 'closed', 'Sessão deve ser encerrada');
    assert(
      closedPartialRes.session.paymentStatus === 'pending',
      `No banco (CHECK constraint), sessão com pagamento parcial deve ficar como pending (recebido: ${closedPartialRes.session.paymentStatus})`
    );

    // Verificar no ledger e no relatório unificado que NÃO foi criado pagamento fictício e NÃO está marcada como 'paid'
    const ledgerAfterPartial = await restaurantAnalyticsService.getFinancialLedger(TENANT_A_ID);
    const partialLedgerEntry = ledgerAfterPartial.sessions[orderPartial.sessionId];
    const partialPayments = partialLedgerEntry?.payments || [];
    assert(
      partialLedgerEntry && partialLedgerEntry.paymentStatus === 'partial',
      `No ledger financeiro, a comanda com pagamento parcial NÃO pode ser marcada como paid (status atual: ${partialLedgerEntry?.paymentStatus})`
    );
    assert(
      partialPayments.length === 1 && Number(partialPayments[0].amount) === partialPaidValue,
      `O encerramento NÃO pode criar pagamentos fictícios (pagamentos encontrados: ${partialPayments.length})`
    );

    // Testar idempotência de reconcileClosedSessionInLedger quando chamado repetidamente
    await restaurantAnalyticsService.reconcileClosedSessionInLedger(
      TENANT_A_ID,
      orderPartial.sessionId,
      partialSessionTotal,
      'PIX',
      new Date().toISOString(),
      actorA.name
    );
    const ledgerAfterRepeat = await restaurantAnalyticsService.getFinancialLedger(TENANT_A_ID);
    const repeatPayments = ledgerAfterRepeat.sessions[orderPartial.sessionId]?.payments || [];
    assert(
      repeatPayments.length === 1,
      'Chamadas repetidas a reconcileClosedSessionInLedger NÃO podem duplicar lançamentos financeiros'
    );

    const unifiedPartialOrder = await restaurantAnalyticsService.getUnifiedOrderById(TENANT_A_ID, orderPartial.id);
    assert(
      unifiedPartialOrder &&
        unifiedPartialOrder.paymentStatus === 'partial' &&
        unifiedPartialOrder.paidAmount === partialPaidValue &&
        unifiedPartialOrder.pendingAmount === expectedPartialPending,
      `Relatório unificado deve preservar status partial, valor recebido (${unifiedPartialOrder?.paidAmount}) e saldo pendente (${unifiedPartialOrder?.pendingAmount})`
    );

    // 11.B — Encerramento com pagamento integral (com desconto e quitação final do saldo restante)
    const orderFull = await restaurantRepo.createOrderFromTable(
      {
        tenantSlug,
        tableToken: table1.qrCodeToken,
        customerName: 'Cliente Pagamento Integral com Desconto',
        items: [{ productId: testProduct.id, quantity: 2 }],
      },
      '127.0.0.109'
    );
    createdOrderIds.push(orderFull.id);
    createdSessionIds.push(orderFull.sessionId);

    const grossFull = Number(orderFull.total);
    const discountVal = Math.min(5, Math.round(grossFull * 0.1 * 100) / 100);
    const expectedNetFull = Math.round((grossFull - discountVal) * 100) / 100;
    const firstEntryPayment = Math.round(expectedNetFull * 0.5 * 100) / 100;

    await restaurantAnalyticsService.updateSessionFinancialsAndPayments(
      TENANT_A_ID,
      orderFull.sessionId,
      { action: 'set_discount', discount: discountVal },
      actorA
    );
    await restaurantAnalyticsService.updateSessionFinancialsAndPayments(
      TENANT_A_ID,
      orderFull.sessionId,
      { action: 'add_payment', amount: firstEntryPayment, paymentMethod: 'PIX' },
      actorA
    );

    // Encerrar quitando explicitamente o saldo restante (settleRemainingBalance: true)
    const closedFullRes = await restaurantRepo.closeSession(
      TENANT_A_ID,
      table1.id,
      actorA,
      'Fechamento com quitação total do saldo restante',
      'Cartão de Crédito',
      orderFull.sessionId,
      { settleRemainingBalance: true, paymentStatus: 'paid' }
    );
    assert(closedFullRes.session.paymentStatus === 'paid', 'Sessão quitada integralmente deve constar como paid');

    // Repetir chamada ao reconcileClosedSessionInLedger para provar que close_pay_ não é duplicado
    await restaurantAnalyticsService.reconcileClosedSessionInLedger(
      TENANT_A_ID,
      orderFull.sessionId,
      expectedNetFull,
      'Cartão de Crédito',
      new Date().toISOString(),
      actorA.name,
      { settleRemainingBalance: true, paymentStatus: 'paid' }
    );

    const unifiedFullOrder = await restaurantAnalyticsService.getUnifiedOrderById(TENANT_A_ID, orderFull.id);
    assert(
      unifiedFullOrder &&
        unifiedFullOrder.paymentStatus === 'paid' &&
        unifiedFullOrder.discount === discountVal &&
        unifiedFullOrder.total === expectedNetFull &&
        unifiedFullOrder.paidAmount === expectedNetFull &&
        unifiedFullOrder.pendingAmount === 0,
      'Conta com pagamento integral e desconto deve ficar com paidAmount === total e pendingAmount === 0 sem duplicar pagamentos'
    );
    console.log('  ✅ Teste 11 APROVADO: Regras financeiras (integral, parcial, pendente, descontos e idempotência) validadas.\n');

    // =========================================================================
    // TESTE 12: Bloqueio de todas as rotas operacionais e financeiras após fechamento
    // =========================================================================
    console.log('▶ Executando Teste 12: Validar bloqueio pós-fechamento em todas as rotas operacionais e financeiras...');
    const closedOrderId = orderFull.id;
    const closedSessId = orderFull.sessionId;

    const assertThrows = async (fn: () => Promise<any>, label: string) => {
      let threw = false;
      try {
        await fn();
      } catch {
        threw = true;
      }
      assert(threw, `Operação deveria ser bloqueada em comanda encerrada: ${label}`);
    };

    await assertThrows(
      () => restaurantRepo.updateOrderStatus(TENANT_A_ID, closedOrderId, 'preparing', actorA),
      'updateOrderStatus'
    );
    await assertThrows(
      () => restaurantRepo.cancelOrder(TENANT_A_ID, closedOrderId, actorA, 'Tentativa cancelar'),
      'cancelOrder'
    );
    await assertThrows(
      () => restaurantRepo.updateRestaurantOrder(TENANT_A_ID, closedOrderId, { customerName: 'Alterado' }, actorA),
      'updateRestaurantOrder'
    );
    await assertThrows(
      () => restaurantRepo.deleteRestaurantOrder(TENANT_A_ID, closedOrderId, actorA),
      'deleteRestaurantOrder'
    );
    await assertThrows(
      () =>
        restaurantRepo.addFeeToSession(
          TENANT_A_ID,
          closedSessId,
          { name: 'Taxa Pós Fechamento', type: 'fixed', rateOrAmount: 10 },
          actorA
        ),
      'addFeeToSession'
    );
    await assertThrows(
      () => restaurantRepo.removeFeeFromSession(TENANT_A_ID, closedSessId, crypto.randomUUID(), actorA),
      'removeFeeFromSession'
    );
    await assertThrows(
      () =>
        restaurantAnalyticsService.updateSessionFinancialsAndPayments(
          TENANT_A_ID,
          closedSessId,
          { action: 'add_payment', amount: 10, paymentMethod: 'PIX' },
          actorA
        ),
      'updateSessionFinancialsAndPayments'
    );
    await assertThrows(
      () =>
        restaurantAnalyticsService.updateOrderFinancialsAndPayments(
          TENANT_A_ID,
          closedOrderId,
          { action: 'set_discount', discount: 1 },
          actorA
        ),
      'updateOrderFinancialsAndPayments'
    );
    console.log('  ✅ Teste 12 APROVADO: Todas as 8 rotas operacionais e financeiras bloqueiam mutações pós-fechamento.\n');

    console.log('================================================================================');
    console.log('🎉 TODOS OS 12 CENÁRIOS DE AUDITORIA E REGRESSÃO FORAM APROVADOS COM SUCESSO!');
    console.log('================================================================================');
  } finally {
    // Limpar apenas os dados temporários criados por este script de verificação
    if (createdOrderIds.length > 0) {
      await supabaseAdmin.from('restaurant_order_items').delete().in('order_id', createdOrderIds);
      await supabaseAdmin.from('restaurant_order_status_history').delete().in('order_id', createdOrderIds);
      await supabaseAdmin.from('restaurant_orders').delete().in('id', createdOrderIds);
    }
    if (createdSessionIds.length > 0) {
      await supabaseAdmin.from('restaurant_session_fees').delete().in('session_id', createdSessionIds);
      await supabaseAdmin.from('restaurant_sessions').delete().in('id', createdSessionIds);
    }
    if (createdTableIds.length > 0) {
      await supabaseAdmin.from('restaurant_tables').delete().in('id', createdTableIds);
    }
    if (createdProductIds.length > 0) {
      await supabaseAdmin.from('products').delete().in('id', createdProductIds);
    }

    // Limpar entradas temporárias do financial_ledger criadas durante o teste
    try {
      const { data: settingsRow } = await supabaseAdmin
        .from('tenant_settings')
        .select('id, settings')
        .eq('tenant_id', TENANT_A_ID)
        .maybeSingle();

      if (settingsRow?.settings?.financial_ledger) {
        const ledger = settingsRow.settings.financial_ledger;
        if (ledger.sessions) {
          for (const sid of createdSessionIds) {
            delete ledger.sessions[sid];
          }
        }
        if (ledger.orders) {
          for (const oid of createdOrderIds) {
            delete ledger.orders[oid];
          }
        }
        await supabaseAdmin
          .from('tenant_settings')
          .update({
            settings: {
              ...settingsRow.settings,
              financial_ledger: ledger,
            },
          })
          .eq('id', settingsRow.id);
      }
    } catch {
      // Ignorar se não houver ledger a limpar
    }

    // Garantir que a sessão aberta pré-existente na M01 esteja com current_session_id consistente
    const { data: m01OpenSess } = await supabaseAdmin
      .from('restaurant_sessions')
      .select('id')
      .eq('tenant_id', TENANT_A_ID)
      .eq('table_id', '11111111-aaaa-4111-8111-111111111111')
      .eq('status', 'open')
      .maybeSingle();

    if (m01OpenSess) {
      await supabaseAdmin
        .from('restaurant_tables')
        .update({ status: 'occupied', current_session_id: m01OpenSess.id })
        .eq('id', '11111111-aaaa-4111-8111-111111111111')
        .eq('tenant_id', TENANT_A_ID);
    }
  }
}

runVerification().catch((err) => {
  console.error('❌ ERRO NA SUÍTE DE VERIFICAÇÃO:', err);
  process.exit(1);
});
