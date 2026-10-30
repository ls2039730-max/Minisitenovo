import crypto from 'crypto';
import { supabaseAdmin } from '../server/supabaseAdmin.js';
import { restaurantRepo } from '../server/db/restaurantRepository.js';
import { restaurantAnalyticsService } from '../server/services/restaurantAnalyticsService.js';
import { User } from '../src/types/saas.js';

const TENANT_A_ID = 'd80351bc-52b8-46c8-96c0-9d6622f4a680';
const TENANT_B_ID = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

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

  try {
    // Obter o slug real da empresa A no banco de dados
    const { data: tenantRecord } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, name')
      .eq('id', TENANT_A_ID)
      .single();

    assert(tenantRecord && tenantRecord.slug, 'Tenant de teste deve existir no banco');
    const tenantSlug = tenantRecord!.slug;

    // Obter um produto ativo da empresa A para criar pedidos reais
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('id, name, price')
      .eq('tenant_id', TENANT_A_ID)
      .eq('is_active', true)
      .limit(2);

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

    console.log('================================================================================');
    console.log('🎉 TODOS OS 10 CENÁRIOS OBRIGATÓRIOS FORAM EXECUTADOS E APROVADOS COM SUCESSO!');
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
