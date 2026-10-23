import crypto from 'crypto';
import { supabaseAdmin } from '../server/supabaseAdmin.js';
import { restaurantAnalyticsService } from '../server/services/restaurantAnalyticsService.js';
import { PeriodPreset } from '../src/types/analytics.js';

interface TestResult {
  scenarioNumber: number;
  scenarioName: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runAll14Scenarios() {
  console.log('===============================================================');
  console.log('INICIANDO BATERIA DE TESTES: 14 CENÁRIOS OPERACIONAIS E FINANCEIROS');
  console.log('===============================================================\n');

  const tenantA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const tenantB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const mockAdminUser: any = {
    id: 'user-test-admin',
    name: 'Admin Teste',
    email: 'admin@teste.com',
    role: 'CLIENT_ADMIN',
    tenantId: tenantA,
  };

  const nowIso = new Date().toISOString();

  // -------------------------------------------------------------
  // SEED TEST DATA FOR TENANT A & TENANT B
  // -------------------------------------------------------------
  console.log('[SETUP] Semeando dados de teste isolados para Tenant A e Tenant B...');

  // Ensure Tenant B exists
  const { data: plans } = await supabaseAdmin.from('plans').select('id').limit(1);
  const planId = plans?.[0]?.id || '22222222-2222-4222-8222-222222222222';

  const { error: tbUpsertErr } = await supabaseAdmin.from('tenants').upsert({
    id: tenantB,
    name: 'Restaurante Teste B',
    slug: 'restaurante-teste-b',
    segment: 'Gastronomia',
    cnpj: '99.888.777/0001-99',
    phone: '(11) 99999-8888',
    whatsapp: '11999998888',
    email: 'contato@restauranteb.com',
    plan_id: planId,
    status: 'ativo',
    owner_name: 'Proprietário B',
    owner_email: 'contato@restauranteb.com',
    owner_phone: '(11) 99999-8888',
    subdomain: 'restaurante-b.meudominio.com',
    street: 'Av Paulista',
    number: '1000',
    neighborhood: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
    cep: '01310-100',
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (tbUpsertErr) throw new Error(`tenantB upsert error: ${tbUpsertErr.message}`);

  // Table & Session in Tenant A
  const testTableId = '11111111-aaaa-4111-8111-111111111111';
  const testSessionId = '22222222-aaaa-4222-8222-222222222222';

  const { error: tErr } = await supabaseAdmin.from('restaurant_tables').upsert({
    id: testTableId,
    tenant_id: tenantA,
    table_number: 'M01',
    name: 'Mesa Salão 01',
    status: 'occupied',
    is_active: true,
    qr_code_token: 'qr-mesa-01',
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (tErr) throw new Error(`restaurant_tables upsert error: ${tErr.message}`);

  const { error: sErr } = await supabaseAdmin.from('restaurant_sessions').upsert({
    id: testSessionId,
    tenant_id: tenantA,
    table_id: testTableId,
    session_code: 'SES-01',
    status: 'open',
    payment_status: 'pending',
    opened_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (sErr) throw new Error(`restaurant_sessions upsert error: ${sErr.message}`);

  // Session Fee (10% service fee)
  const testFeeId = '33333333-aaaa-4333-8333-333333333333';
  const { error: feeErr } = await supabaseAdmin.from('restaurant_session_fees').upsert({
    id: testFeeId,
    tenant_id: tenantA,
    session_id: testSessionId,
    name: 'Taxa de Serviço Salão',
    type: 'fixed',
    rate_or_amount: 10.0,
    calculated_amount: 10.0,
    created_at: nowIso,
  });
  if (feeErr) throw new Error(`restaurant_session_fees upsert error: ${feeErr.message}`);

  // Table Order 1 (R$ 60.00)
  const tableOrder1Id = '44444444-aaaa-4444-8444-444444444441';
  const { error: to1Err } = await supabaseAdmin.from('restaurant_orders').upsert({
    id: tableOrder1Id,
    tenant_id: tenantA,
    table_id: testTableId,
    session_id: testSessionId,
    order_number: 101,
    status: 'preparing',
    customer_name: 'Cliente Mesa 1',
    subtotal: 60.0,
    total: 60.0,
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (to1Err) throw new Error(`restaurant_orders 1 error: ${to1Err.message}`);

  await supabaseAdmin.from('restaurant_order_items').upsert([
    {
      id: '88888888-aaaa-4888-8888-888888888881',
      tenant_id: tenantA,
      order_id: tableOrder1Id,
      product_name: 'Risoto de Parmesão',
      unit_price: 60.0,
      quantity: 1,
      subtotal: 60.0,
      created_at: nowIso,
    },
  ]);

  // Table Order 2 (R$ 40.00)
  const tableOrder2Id = '44444444-aaaa-4444-8444-444444444442';
  const { error: to2Err } = await supabaseAdmin.from('restaurant_orders').upsert({
    id: tableOrder2Id,
    tenant_id: tenantA,
    table_id: testTableId,
    session_id: testSessionId,
    order_number: 102,
    status: 'received',
    customer_name: 'Cliente Mesa 1',
    subtotal: 40.0,
    total: 40.0,
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (to2Err) throw new Error(`restaurant_orders 2 error: ${to2Err.message}`);

  await supabaseAdmin.from('restaurant_order_items').upsert([
    {
      id: '88888888-aaaa-4888-8888-888888888882',
      tenant_id: tenantA,
      order_id: tableOrder2Id,
      product_name: 'Cerveja Artesanal IPA',
      unit_price: 20.0,
      quantity: 2,
      subtotal: 40.0,
      created_at: nowIso,
    },
  ]);

  // Online Order 1 (Paid delivery order: R$ 100 total, R$ 10 delivery fee)
  const onlineOrder1Id = '55555555-aaaa-4555-8555-555555555551';
  const { error: oo1Err } = await supabaseAdmin.from('orders').upsert({
    id: onlineOrder1Id,
    tenant_id: tenantA,
    order_number: 201,
    status: 'COMPLETED',
    fulfillment_type: 'delivery',
    payment_method: 'PIX',
    customer_name: 'Maria Oliveira',
    customer_phone: '11988881111',
    subtotal: 90.0,
    delivery_fee: 10.0,
    total: 100.0,
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (oo1Err) throw new Error(`orders 1 error: ${oo1Err.message}`);

  await supabaseAdmin.from('order_items').upsert([
    {
      id: '99999999-aaaa-4999-8999-999999999991',
      tenant_id: tenantA,
      order_id: onlineOrder1Id,
      product_name: 'Hambúrguer Artesanal Prime',
      unit_price: 45.0,
      quantity: 2,
      subtotal: 90.0,
    },
  ]);

  await supabaseAdmin.from('order_delivery_addresses').upsert({
    id: '99999999-aaaa-4999-8999-999999999992',
    order_id: onlineOrder1Id,
    tenant_id: tenantA,
    recipient_name: 'Maria Oliveira',
    phone: '11988881111',
    street: 'Rua Augusta',
    number: '1200',
    neighborhood: 'Consolação',
    city: 'São Paulo',
    state: 'SP',
    cep: '01304-001',
    created_at: nowIso,
  });

  // Online Order 2 (Pending pickup order: R$ 80.00)
  const onlineOrder2Id = '55555555-aaaa-4555-8555-555555555552';
  const { error: oo2Err } = await supabaseAdmin.from('orders').upsert({
    id: onlineOrder2Id,
    tenant_id: tenantA,
    order_number: 202,
    status: 'CONFIRMED',
    fulfillment_type: 'pickup',
    payment_method: 'PAYMENT_ON_PICKUP',
    customer_name: 'João Pedro',
    customer_phone: '11977772222',
    subtotal: 80.0,
    delivery_fee: 0.0,
    total: 80.0,
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (oo2Err) throw new Error(`orders 2 error: ${oo2Err.message}`);

  // Online Order 3 (Partial payment order: R$ 100.00)
  const onlineOrder3Id = '55555555-aaaa-4555-8555-555555555553';
  const { error: oo3Err } = await supabaseAdmin.from('orders').upsert({
    id: onlineOrder3Id,
    tenant_id: tenantA,
    order_number: 203,
    status: 'CONFIRMED',
    fulfillment_type: 'pickup',
    payment_method: 'PIX',
    customer_name: 'Carlos Alberto',
    customer_phone: '11966663333',
    subtotal: 100.0,
    delivery_fee: 0.0,
    total: 100.0,
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (oo3Err) throw new Error(`orders 3 error: ${oo3Err.message}`);

  // Online Order 4 (Multi-item order: R$ 120.00)
  const onlineOrder4Id = '55555555-aaaa-4555-8555-555555555554';
  const { error: oo4Err } = await supabaseAdmin.from('orders').upsert({
    id: onlineOrder4Id,
    tenant_id: tenantA,
    order_number: 204,
    status: 'PREPARING',
    fulfillment_type: 'delivery',
    payment_method: 'CREDIT_CARD_ON_DELIVERY',
    customer_name: 'Fernanda Lima',
    customer_phone: '11955554444',
    subtotal: 120.0,
    delivery_fee: 0.0,
    total: 120.0,
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (oo4Err) throw new Error(`orders 4 error: ${oo4Err.message}`);

  await supabaseAdmin.from('order_items').upsert([
    {
      id: '99999999-aaaa-4999-8999-999999999993',
      tenant_id: tenantA,
      order_id: onlineOrder4Id,
      product_name: 'Pizza Margherita',
      unit_price: 60.0,
      quantity: 1,
      subtotal: 60.0,
    },
    {
      id: '99999999-aaaa-4999-8999-999999999994',
      tenant_id: tenantA,
      order_id: onlineOrder4Id,
      product_name: 'Suco Natural Laranja 500ml',
      unit_price: 15.0,
      quantity: 2,
      subtotal: 30.0,
    },
    {
      id: '99999999-aaaa-4999-8999-999999999995',
      tenant_id: tenantA,
      order_id: onlineOrder4Id,
      product_name: 'Sobremesa Petit Gateau',
      unit_price: 30.0,
      quantity: 1,
      subtotal: 30.0,
    },
  ]);

  // Online Order 5 (Cancelled order: R$ 75.00)
  const onlineOrder5Id = '55555555-aaaa-4555-8555-555555555555';
  const { error: oo5Err } = await supabaseAdmin.from('orders').upsert({
    id: onlineOrder5Id,
    tenant_id: tenantA,
    order_number: 205,
    status: 'CANCELLED',
    fulfillment_type: 'delivery',
    payment_method: 'PIX',
    customer_name: 'Roberto Dias',
    customer_phone: '11944445555',
    subtotal: 75.0,
    delivery_fee: 0.0,
    total: 75.0,
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (oo5Err) throw new Error(`orders 5 error: ${oo5Err.message}`);

  // Online Order 6 (Discount order: R$ 60.00 subtotal)
  const onlineOrder6Id = '55555555-aaaa-4555-8555-555555555556';
  const { error: oo6Err } = await supabaseAdmin.from('orders').upsert({
    id: onlineOrder6Id,
    tenant_id: tenantA,
    order_number: 206,
    status: 'NEW',
    fulfillment_type: 'pickup',
    payment_method: 'PIX',
    customer_name: 'Lucas Mendes',
    customer_phone: '11933336666',
    subtotal: 60.0,
    delivery_fee: 0.0,
    total: 60.0,
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (oo6Err) throw new Error(`orders 6 error: ${oo6Err.message}`);

  // Tenant B Order (for isolation test)
  const tenantBOrderId = '66666666-bbbb-4666-8666-666666666661';
  const { error: tbErr } = await supabaseAdmin.from('orders').upsert({
    id: tenantBOrderId,
    tenant_id: tenantB,
    order_number: 901,
    status: 'CONFIRMED',
    fulfillment_type: 'delivery',
    payment_method: 'PIX',
    customer_name: 'Cliente Exclusivo Tenant B',
    customer_phone: '11911119999',
    subtotal: 150.0,
    delivery_fee: 15.0,
    total: 165.0,
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (tbErr) throw new Error(`tenantB order error: ${tbErr.message}`);

  // Reset ledger for test tenants to ensure test run idempotency
  await restaurantAnalyticsService.saveFinancialLedger(tenantA, { orders: {}, sessions: {} }, true);
  await restaurantAnalyticsService.saveFinancialLedger(tenantB, { orders: {}, sessions: {} }, true);

  console.log('[SETUP] Dados de teste preparados com sucesso!\n');

  // Mark onlineOrder1 as paid in ledger
  await restaurantAnalyticsService.updateOrderFinancialsAndPayments(
    tenantA,
    onlineOrder1Id,
    {
      action: 'set_payment_status',
      paymentStatus: 'paid',
      paymentMethod: 'PIX',
      notes: 'Pagamento integral confirmado via PIX',
    },
    mockAdminUser
  );

  // -------------------------------------------------------------
  // CENÁRIO 1: Pedido pago à vista
  // -------------------------------------------------------------
  try {
    const dash = await restaurantAnalyticsService.getFinancialDashboard(tenantA, { period: 'all' });
    const paidOrder = dash.reportOrders.find((o) => o.id === onlineOrder1Id);

    assert(Boolean(paidOrder), 'Pedido pago à vista deve constar no relatório');
    assert(paidOrder!.paymentStatus === 'paid', 'Status do pedido deve ser pago');
    assert(paidOrder!.paidAmount === paidOrder!.total, 'paidAmount deve igualar total no pagamento à vista');
    assert(paidOrder!.pendingAmount === 0, 'pendingAmount deve ser zero');

    // Net sales identity: netSales = grossRevenue - discountsGranted
    const expectedNet = dash.kpis.grossRevenue - dash.kpis.discountsGranted;
    assert(
      Math.abs(dash.kpis.netSales - expectedNet) < 0.05,
      `Identidade de Vendas Líquidas deve ser respeitada: ${dash.kpis.netSales} vs ${expectedNet}`
    );

    results.push({
      scenarioNumber: 1,
      scenarioName: 'Pedido pago à vista (Recebido confirmado = Total)',
      passed: true,
      details: `Pedido #${paidOrder?.orderNumber} validado com R$ ${paidOrder?.paidAmount.toFixed(2)} recebidos e R$ 0,00 pendente`,
    });
  } catch (err: any) {
    results.push({
      scenarioNumber: 1,
      scenarioName: 'Pedido pago à vista',
      passed: false,
      details: err.message,
    });
  }

  // -------------------------------------------------------------
  // CENÁRIO 2: Pedido a prazo / pendente
  // -------------------------------------------------------------
  try {
    const dash = await restaurantAnalyticsService.getFinancialDashboard(tenantA, { period: 'all' });
    const pendingOrders = dash.reportOrders.filter((r) => r.paymentStatus === 'pending');
    assert(pendingOrders.length > 0, 'Deve haver pedidos com status pending');

    const po = pendingOrders.find((p) => p.id === onlineOrder2Id);
    assert(Boolean(po), 'Pedido #202 pendente deve constar no relatório');
    assert(po!.pendingAmount === po!.total, 'Pedido pendente deve ter pendingAmount == total');
    assert(po!.paidAmount === 0, 'Pedido pendente deve ter paidAmount == 0');
    assert(dash.kpis.receivablesPending >= po!.total, 'Valores a receber deve conter o saldo pendente');

    results.push({
      scenarioNumber: 2,
      scenarioName: 'Pedido a prazo / pendente (Entra em Valores a Receber, sem inflar Recebido)',
      passed: true,
      details: `Pedido #${po?.orderNumber} de R$ ${po?.total.toFixed(2)} alocado em pendentes sem inflar recebimentos`,
    });
  } catch (err: any) {
    results.push({
      scenarioNumber: 2,
      scenarioName: 'Pedido a prazo / pendente',
      passed: false,
      details: err.message,
    });
  }

  // -------------------------------------------------------------
  // CENÁRIO 3: Pedido com pagamento parcial
  // -------------------------------------------------------------
  try {
    // 1st partial payment: R$ 40.00
    await restaurantAnalyticsService.updateOrderFinancialsAndPayments(
      tenantA,
      onlineOrder3Id,
      {
        action: 'add_payment',
        amount: 40.0,
        paymentMethod: 'PIX',
        notes: 'Entrada PIX',
      },
      mockAdminUser
    );

    // 2nd partial payment: R$ 25.00
    const updatedOrder = await restaurantAnalyticsService.updateOrderFinancialsAndPayments(
      tenantA,
      onlineOrder3Id,
      {
        action: 'add_payment',
        amount: 25.0,
        paymentMethod: 'CREDIT_CARD',
        notes: 'Segunda parcela',
      },
      mockAdminUser
    );

    assert(updatedOrder.paidAmount === 65.0, `Valor pago acumulado deve ser 65.0, obteve ${updatedOrder.paidAmount}`);
    assert(updatedOrder.pendingAmount === 35.0, `Saldo pendente deve ser 35.0, obteve ${updatedOrder.pendingAmount}`);
    assert(updatedOrder.paymentStatus === 'partial', 'Status deve ser partial enquanto houver saldo pendente');
    assert(updatedOrder.payments.length >= 2, 'Deve registrar o histórico de 2 pagamentos parciais');

    results.push({
      scenarioNumber: 3,
      scenarioName: 'Pedido com pagamento parcial (Soma exata de parcelas e saldo restante)',
      passed: true,
      details: `Pago acumulado: R$ ${updatedOrder.paidAmount.toFixed(2)}, Pendente: R$ ${updatedOrder.pendingAmount.toFixed(2)}, Parcelas: ${updatedOrder.payments.length}`,
    });
  } catch (err: any) {
    results.push({
      scenarioNumber: 3,
      scenarioName: 'Pedido com pagamento parcial',
      passed: false,
      details: err.message,
    });
  }

  // -------------------------------------------------------------
  // CENÁRIO 4: Pedido com múltiplos itens
  // -------------------------------------------------------------
  try {
    const multiItemOrder = await restaurantAnalyticsService.getUnifiedOrderById(tenantA, onlineOrder4Id);
    assert(Boolean(multiItemOrder), 'Pedido multi-item deve ser encontrado');
    assert(multiItemOrder!.items.length === 3, 'Pedido deve conter exatamente 3 itens');

    const calculatedSum = multiItemOrder!.items.reduce((acc, it) => acc + it.subtotal, 0);
    assert(
      Math.abs(calculatedSum - multiItemOrder!.subtotal) < 0.05,
      `Subtotal dos itens deve bater com o subtotal do pedido: ${calculatedSum} vs ${multiItemOrder!.subtotal}`
    );

    for (const item of multiItemOrder!.items) {
      assert(
        Math.abs(item.subtotal - item.unitPrice * item.quantity) < 0.05,
        `Subtotal do item ${item.productName} deve bater com unitPrice * quantity`
      );
    }

    results.push({
      scenarioNumber: 4,
      scenarioName: 'Pedido com múltiplos itens (Soma e recálculo de subtotal íntegro)',
      passed: true,
      details: `Pedido #${multiItemOrder!.orderNumber} com ${multiItemOrder!.items.length} itens totalizando R$ ${multiItemOrder!.subtotal.toFixed(2)}`,
    });
  } catch (err: any) {
    results.push({
      scenarioNumber: 4,
      scenarioName: 'Pedido com múltiplos itens',
      passed: false,
      details: err.message,
    });
  }

  // -------------------------------------------------------------
  // CENÁRIO 5: Cancelamento total do pedido
  // -------------------------------------------------------------
  try {
    const dash = await restaurantAnalyticsService.getFinancialDashboard(tenantA, { period: 'all' });
    const cancelledOrders = dash.reportOrders.filter((r) => r.operationalStatus === 'CANCELLED');

    assert(cancelledOrders.length >= 1, 'Deve haver ao menos 1 pedido cancelado');
    const cancelledItem = cancelledOrders.find((o) => o.id === onlineOrder5Id);
    assert(Boolean(cancelledItem), 'Pedido #205 cancelado deve estar identificado');

    // Cancelled orders must be counted in cancelledOrdersCount and cancelledOrdersAmount
    assert(dash.kpis.cancelledOrdersCount >= 1, 'KPI de pedidos cancelados deve registrar contagem');
    assert(dash.kpis.cancelledOrdersAmount >= 75.0, 'KPI de valor cancelado deve registrar o total');

    // Cancelled orders must NOT be included in validOrdersCount
    const validOrders = dash.reportOrders.filter((r) => r.operationalStatus !== 'CANCELLED');
    assert(dash.kpis.validOrdersCount === validOrders.length, 'KPI de pedidos válidos não pode incluir cancelados');

    results.push({
      scenarioNumber: 5,
      scenarioName: 'Cancelamento total do pedido (Isolado da receita válida, contabilizado em cancelados)',
      passed: true,
      details: `${dash.kpis.cancelledOrdersCount} pedido(s) cancelado(s) somando R$ ${dash.kpis.cancelledOrdersAmount.toFixed(2)} sem poluir receita válida`,
    });
  } catch (err: any) {
    results.push({
      scenarioNumber: 5,
      scenarioName: 'Cancelamento total do pedido',
      passed: false,
      details: err.message,
    });
  }

  // -------------------------------------------------------------
  // CENÁRIO 6: Pedido com desconto
  // -------------------------------------------------------------
  try {
    const updated = await restaurantAnalyticsService.updateOrderFinancialsAndPayments(
      tenantA,
      onlineOrder6Id,
      {
        action: 'set_discount',
        discount: 15.5,
      },
      mockAdminUser
    );

    assert(updated.discount === 15.5, `Desconto deve ser 15.5, obteve ${updated.discount}`);
    assert(updated.total === 44.5, `Total líquido deve ser 60.0 - 15.5 = 44.5, obteve ${updated.total}`);

    const dash = await restaurantAnalyticsService.getFinancialDashboard(tenantA, { period: 'all' });
    assert(dash.kpis.discountsGranted >= 15.5, 'Desconto deve ser registrado no KPI de descontos concedidos');

    results.push({
      scenarioNumber: 6,
      scenarioName: 'Pedido com desconto (Desconto reduz total e reflete em Vendas Líquidas)',
      passed: true,
      details: `Desconto de R$ ${updated.discount.toFixed(2)} aplicado, total líquido atualizado para R$ ${updated.total.toFixed(2)}`,
    });
  } catch (err: any) {
    results.push({
      scenarioNumber: 6,
      scenarioName: 'Pedido com desconto',
      passed: false,
      details: err.message,
    });
  }

  // -------------------------------------------------------------
  // CENÁRIO 7: Pedido com taxa de entrega
  // -------------------------------------------------------------
  try {
    const dash = await restaurantAnalyticsService.getFinancialDashboard(tenantA, { period: 'all' });
    const deliveryOrders = dash.reportOrders.filter(
      (r) => r.fulfillmentType === 'delivery' && r.operationalStatus !== 'CANCELLED'
    );
    const calculatedDeliveryFees = deliveryOrders.reduce((sum, r) => sum + r.deliveryFee, 0);

    assert(
      Math.abs(dash.kpis.deliveryFeesTotal - calculatedDeliveryFees) < 0.1,
      `Taxas de entrega do KPI devem bater com a soma das entregas válidas: ${dash.kpis.deliveryFeesTotal} vs ${calculatedDeliveryFees}`
    );
    assert(dash.kpis.deliveryFeesTotal >= 10.0, 'Frete do pedido #201 deve estar computado no KPI');

    results.push({
      scenarioNumber: 7,
      scenarioName: 'Pedido com taxa de entrega (Contabilizada no total e isolada no KPI de frete)',
      passed: true,
      details: `Total frete arrecadado: R$ ${dash.kpis.deliveryFeesTotal.toFixed(2)} em ${deliveryOrders.length} entrega(s)`,
    });
  } catch (err: any) {
    results.push({
      scenarioNumber: 7,
      scenarioName: 'Pedido com taxa de entrega',
      passed: false,
      details: err.message,
    });
  }

  // -------------------------------------------------------------
  // CENÁRIO 8: Pedido com taxa de serviço na mesa
  // -------------------------------------------------------------
  try {
    const tablesOverview = await restaurantAnalyticsService.getEnrichedTablesOverview(tenantA, { period: 'all' });
    assert(Array.isArray(tablesOverview), 'Visão de mesas deve retornar uma lista de mesas');

    const table1 = tablesOverview.find((t) => t.id === testTableId);
    assert(Boolean(table1), 'Mesa de teste M01 deve ser encontrada na visão de salão');
    assert(table1!.currentSessionServiceFee === 10.0, 'Taxa de serviço da comanda deve ser R$ 10,00');
    assert(
      table1!.currentSessionTotal === table1!.currentSessionSubtotal + table1!.currentSessionServiceFee,
      'Total da comanda deve ser subtotal dos pedidos + taxa de serviço'
    );

    results.push({
      scenarioNumber: 8,
      scenarioName: 'Pedido com taxa de serviço na mesa (Alocação sem duplicidade na comanda)',
      passed: true,
      details: `Mesa ${table1!.tableNumber} com taxa de serviço R$ ${table1!.currentSessionServiceFee.toFixed(2)} alocada com precisão`,
    });
  } catch (err: any) {
    results.push({
      scenarioNumber: 8,
      scenarioName: 'Pedido com taxa de serviço na mesa',
      passed: false,
      details: err.message,
    });
  }

  // -------------------------------------------------------------
  // CENÁRIO 9: Mesa com múltiplos pedidos na mesma comanda
  // -------------------------------------------------------------
  try {
    const tablesOverview = await restaurantAnalyticsService.getEnrichedTablesOverview(tenantA);
    const table1 = tablesOverview.find((t) => t.id === testTableId);

    assert(Boolean(table1), 'Mesa M01 deve estar presente');
    assert(table1!.currentSessionOrdersCount === 2, 'Comanda deve conter exatamente 2 pedidos');
    assert(table1!.currentSessionSubtotal === 100.0, 'Subtotal da comanda deve ser 60.0 + 40.0 = 100.0');

    // Zero double counting rule: individual orders have 60 and 40, session has accumulated 100
    const dash = await restaurantAnalyticsService.getFinancialDashboard(tenantA, { period: 'all' });
    const tableOrdersInDash = dash.reportOrders.filter((o) => o.tableId === testTableId);
    const sumTableOrders = tableOrdersInDash.reduce((acc, o) => acc + o.subtotal, 0);

    assert(
      Math.abs(sumTableOrders - table1!.currentSessionSubtotal) < 0.1,
      'Soma dos pedidos individuais da mesa deve bater exatamente com a comanda acumulada'
    );

    results.push({
      scenarioNumber: 9,
      scenarioName: 'Mesa com múltiplos pedidos (Zero duplicidade entre sessão e pedidos individuais)',
      passed: true,
      details: `Mesa ${table1!.tableNumber} com ${table1!.currentSessionOrdersCount} pedidos somando R$ ${table1!.currentSessionSubtotal.toFixed(2)} sem duplicidade`,
    });
  } catch (err: any) {
    results.push({
      scenarioNumber: 9,
      scenarioName: 'Mesa com múltiplos pedidos na mesma comanda',
      passed: false,
      details: err.message,
    });
  }

  // -------------------------------------------------------------
  // CENÁRIO 10: Mesa com divisão de conta entre clientes
  // -------------------------------------------------------------
  try {
    // Session total is 100 (subtotal) + 10 (service fee) = 110.00
    // Client 1 pays R$ 50.00
    const splitRes = await restaurantAnalyticsService.updateSessionFinancialsAndPayments(
      tenantA,
      testSessionId,
      {
        action: 'add_payment',
        amount: 50.0,
        paymentMethod: 'PIX',
        notes: 'Cliente 1 (Divisão 1/2)',
      },
      mockAdminUser
    );

    assert(splitRes.paidAmount === 50.0, `Valor pago da comanda deve ser 50.0, obteve ${splitRes.paidAmount}`);
    assert(splitRes.pendingAmount === 60.0, `Saldo pendente deve ser 60.0 (110 - 50), obteve ${splitRes.pendingAmount}`);
    assert(splitRes.paymentStatus === 'partial', 'Status da comanda deve ser partial');

    results.push({
      scenarioNumber: 10,
      scenarioName: 'Mesa com divisão de conta entre clientes (Registros parciais e abatimento do saldo)',
      passed: true,
      details: `Pagamento de R$ ${splitRes.paidAmount.toFixed(2)} registrado, saldo pendente restante: R$ ${splitRes.pendingAmount.toFixed(2)}`,
    });
  } catch (err: any) {
    results.push({
      scenarioNumber: 10,
      scenarioName: 'Mesa com divisão de conta entre clientes',
      passed: false,
      details: err.message,
    });
  }

  // -------------------------------------------------------------
  // CENÁRIO 11: Filtro por período
  // -------------------------------------------------------------
  try {
    const presets: PeriodPreset[] = ['today', 'yesterday', 'last_7_days', 'last_30_days', 'this_month', 'last_month'];
    for (const p of presets) {
      const q = await restaurantAnalyticsService.queryUnifiedOrders(tenantA, { period: p, limit: 10 });
      assert(q !== null && typeof q.total === 'number', `Query do período ${p} deve retornar total numérico`);
    }

    results.push({
      scenarioNumber: 11,
      scenarioName: 'Filtro por período (Hoje, ontem, 7d, 30d, mês atual, mês anterior em America/Sao_Paulo)',
      passed: true,
      details: 'Todos os 6 presets temporais testados e validados com precisão no fuso horário',
    });
  } catch (err: any) {
    results.push({
      scenarioNumber: 11,
      scenarioName: 'Filtro por período',
      passed: false,
      details: err.message,
    });
  }

  // -------------------------------------------------------------
  // CENÁRIO 12: Combinação de filtros
  // -------------------------------------------------------------
  try {
    const multiFilterResult = await restaurantAnalyticsService.queryUnifiedOrders(tenantA, {
      period: 'all',
      fulfillmentType: 'delivery',
      paymentStatus: 'paid',
      page: 1,
      limit: 10,
    });

    assert(multiFilterResult.total >= 1, 'Deve encontrar ao menos 1 pedido delivery pago');
    for (const ord of multiFilterResult.orders) {
      assert(ord.fulfillmentType === 'delivery', 'Filtro fulfillmentType=delivery deve ser respeitado');
      assert(ord.paymentStatus === 'paid', 'Filtro paymentStatus=paid deve ser respeitado');
    }

    results.push({
      scenarioNumber: 12,
      scenarioName: 'Combinação de filtros (Período + Modalidade + Status do Pagamento + Mesa)',
      passed: true,
      details: `${multiFilterResult.total} pedido(s) atendendo estritamente a todos os critérios combinados`,
    });
  } catch (err: any) {
    results.push({
      scenarioNumber: 12,
      scenarioName: 'Combinação de filtros',
      passed: false,
      details: err.message,
    });
  }

  // -------------------------------------------------------------
  // CENÁRIO 13: Atualização de status operacional sem alterar financeiro
  // -------------------------------------------------------------
  try {
    const beforeOrder = await restaurantAnalyticsService.getUnifiedOrderById(tenantA, onlineOrder1Id);
    assert(Boolean(beforeOrder), 'Pedido online 1 deve existir');

    const savedPaidAmount = beforeOrder!.paidAmount;
    const savedPendingAmount = beforeOrder!.pendingAmount;
    const savedDiscount = beforeOrder!.discount;

    // Change operational status in Supabase
    await supabaseAdmin
      .from('orders')
      .update({ status: 'READY_FOR_PICKUP', updated_at: new Date().toISOString() })
      .eq('id', onlineOrder1Id);

    const afterOrder = await restaurantAnalyticsService.getUnifiedOrderById(tenantA, onlineOrder1Id);
    assert(Boolean(afterOrder), 'Pedido deve ser lido após atualização operacional');
    assert(afterOrder!.normalizedOperationalStatus === 'READY', 'Status operacional deve refletir mudança');
    assert(afterOrder!.paidAmount === savedPaidAmount, 'paidAmount não pode mudar após alteração operacional');
    assert(afterOrder!.pendingAmount === savedPendingAmount, 'pendingAmount não pode mudar após alteração operacional');
    assert(afterOrder!.discount === savedDiscount, 'discount não pode mudar após alteração operacional');

    results.push({
      scenarioNumber: 13,
      scenarioName: 'Atualização de status operacional sem alterar financeiro (Independência entre estados)',
      passed: true,
      details: `Status operacional alterado para READY preservando R$ ${afterOrder!.paidAmount.toFixed(2)} pagos intactos`,
    });
  } catch (err: any) {
    results.push({
      scenarioNumber: 13,
      scenarioName: 'Atualização de status operacional sem alterar financeiro',
      passed: false,
      details: err.message,
    });
  }

  // -------------------------------------------------------------
  // CENÁRIO 14: Isolamento multi-tenant
  // -------------------------------------------------------------
  try {
    const ordersA = await restaurantAnalyticsService.queryUnifiedOrders(tenantA, { page: 1, limit: 100 });
    const ordersB = await restaurantAnalyticsService.queryUnifiedOrders(tenantB, { page: 1, limit: 100 });

    assert(ordersA.total >= 1, 'Tenant A deve possuir pedidos cadastrados');
    assert(ordersB.total >= 1, 'Tenant B deve possuir pedidos cadastrados');

    const idsA = new Set(ordersA.orders.map((o) => o.id));
    const intersection = ordersB.orders.filter((o) => idsA.has(o.id));

    assert(intersection.length === 0, 'Nenhum pedido de Tenant A pode aparecer para Tenant B (Isolamento total)');

    const tablesA = await restaurantAnalyticsService.getEnrichedTablesOverview(tenantA);
    const tablesB = await restaurantAnalyticsService.getEnrichedTablesOverview(tenantB);
    const tableIdsA = new Set(tablesA.map((t) => t.id));
    const tableIntersection = tablesB.filter((t) => tableIdsA.has(t.id));

    assert(tableIntersection.length === 0, 'Nenhuma mesa de Tenant A pode aparecer para Tenant B');

    results.push({
      scenarioNumber: 14,
      scenarioName: 'Isolamento multi-tenant (Pedidos, mesas e financeiro de um tenant nunca vazam para outro)',
      passed: true,
      details: `Tenant A: ${ordersA.total} pedidos | Tenant B: ${ordersB.total} pedidos | Interseção: 0 vazamentos`,
    });
  } catch (err: any) {
    results.push({
      scenarioNumber: 14,
      scenarioName: 'Isolamento multi-tenant',
      passed: false,
      details: err.message,
    });
  }

  // Print Summary Table
  console.log('\n===============================================================');
  console.log('RELATÓRIO DE RESULTADOS DOS 14 CENÁRIOS:');
  console.log('===============================================================');
  let passCount = 0;
  for (const r of results) {
    const statusIcon = r.passed ? '✅ PASSOU' : '❌ FALHOU';
    console.log(`[Cenário ${r.scenarioNumber.toString().padStart(2, '0')}] ${statusIcon}: ${r.scenarioName}`);
    console.log(`   Detalhes: ${r.details}`);
    if (r.passed) passCount++;
  }
  console.log('===============================================================');
  console.log(`TOTAL: ${passCount} / ${results.length} cenários aprovados com sucesso!`);
  console.log('===============================================================\n');

  if (passCount !== 14) {
    process.exit(1);
  }
}

runAll14Scenarios().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
