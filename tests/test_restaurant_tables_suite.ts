import { repo } from '../server/db/repository.js';
import { productRepo } from '../server/db/productRepository.js';
import { restaurantRepo } from '../server/db/restaurantRepository.js';
import { supabaseAdmin } from '../server/supabaseAdmin.js';
import { generateSessionToken } from '../server/auth/tokenService.js';
import { User } from '../src/types/saas.js';

export async function runRestaurantTestSuite() {
  console.log('================================================================');
  console.log('🚀 INICIANDO BATERIA DE TESTES DO CATÁLOGO DIGITAL PARA RESTAURANTES');
  console.log('================================================================');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✅ [PASS] ${testName}`);
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${detail ? `-> ${detail}` : ''}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  // 1. Setup Tenant & Mock User
  console.log('\n[1/10] Verificando Estabelecimento e Catálogo Existente...');
  let tenant1 = await repo.getTenantBySlug('costela-mania');
  if (!tenant1 || tenant1.status !== 'ativo') {
    tenant1 = await repo.getTenantBySlug('barbearia-prime');
  }
  assert(!!tenant1, `Tenant (${tenant1?.name || 'Restaurante'}) carregado com sucesso`);

  const tenantAdminUser: User = {
    id: 'user_admin_test_1',
    name: 'Gerente do Restaurante',
    email: 'gerente@restaurante.com',
    role: 'CLIENT_ADMIN',
    tenantId: tenant1!.id,
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  // Reusabilidade: verificar se produtos do catálogo existente estão disponíveis
  const products = await productRepo.listProducts(tenant1!.id);
  assert(products.length >= 2, `Reutilização do catálogo existente confirmada (${products.length} produtos encontrados sem duplicar tabelas)`);
  const prod1 = products[0];
  const prod2 = products[1];

  // 2. Cadastro individual de mesa
  console.log('\n[2/10] Testando Cadastro Individual e em Lote de Mesas...');
  const uniqueTableNumber = `TEST-${Date.now().toString().slice(-4)}`;
  const createdTable = await restaurantRepo.createTable(tenant1!.id, {
    tableNumber: uniqueTableNumber,
    name: 'Área Panorâmica',
    notes: 'Mesa de testes automatizados',
    isActive: true,
  }, tenantAdminUser);

  assert(!!createdTable.id, 'Mesa criada com UUID único');
  assert(createdTable.tableNumber === uniqueTableNumber, 'Número da mesa persistido corretamente');
  assert(createdTable.status === 'available', 'Status inicial da mesa é "available" (disponível)');
  assert(createdTable.qrCodeToken.startsWith('tab_'), 'Token opaco de QR Code gerado com segurança');

  // Cadastro em lote
  const batchStart = Math.floor(100 + Math.random() * 800);
  const batchRes = await restaurantRepo.createTablesBatch(tenant1!.id, {
    startNumber: batchStart,
    endNumber: batchStart + 2,
    prefix: 'T-',
    namePrefix: 'Varanda',
  }, tenantAdminUser);
  assert(batchRes.createdCount >= 1, `Cadastro em lote executado com sucesso (${batchRes.createdCount} mesas criadas)`);

  // 3. Consulta Pública e Validação do QR Code
  console.log('\n[3/10] Testando Resolução Pública via QR Code Token...');
  const publicInfo = await restaurantRepo.getPublicTableInfo(tenant1!.slug, createdTable.qrCodeToken);
  assert(publicInfo.success === true, 'Leitura pública do QR Code com sucesso');
  assert(publicInfo.table.tableNumber === uniqueTableNumber, 'Mesa correta identificada a partir do token');
  assert(!publicInfo.tenant.hasOwnProperty('password'), 'Segurança: Nenhuma credencial ou dado administrativo vazado no retorno público');

  // Token inválido deve ser rejeitado
  let tokenRejected = false;
  try {
    await restaurantRepo.getPublicTableInfo(tenant1!.slug, 'token_invalido_hacker');
  } catch (e: any) {
    tokenRejected = true;
  }
  assert(tokenRejected, 'Tentativa de token forjado/inválido foi rejeitada pelo servidor');

  // 4. Criação do Primeiro Pedido na Mesa & Abertura Automática da Comanda (Sessão)
  console.log('\n[4/10] Testando Criação de Pedido na Mesa & Abertura de Sessão...');
  const order1 = await restaurantRepo.createOrderFromTable({
    tenantSlug: tenant1!.slug,
    tableToken: createdTable.qrCodeToken,
    customerName: 'Cliente A',
    notes: 'Por favor, trazer rápido',
    items: [
      { productId: prod1.id, quantity: 2, notes: 'Sem gelo' },
      { productId: prod2.id, quantity: 1 },
    ],
  }, '127.0.0.1');

  assert(!!order1.id, 'Pedido #1 criado com sucesso');
  assert(order1.status === 'received', 'Status inicial do pedido é "received" (Recebido)');
  assert(order1.items.length === 2, 'Dois itens registrados no pedido');
  assert(order1.tableId === createdTable.id, 'Pedido vinculado à mesa correta');
  assert(!!order1.sessionId, 'Comanda (sessão) aberta e vinculada ao pedido');

  // Verificar recálculo de preço no servidor (produtos reais)
  const expectedTotal1 = Math.round(((prod1.promotionalPrice || prod1.price || 0) * 2 + (prod2.promotionalPrice || prod2.price || 0) * 1) * 100) / 100;
  assert(order1.total === expectedTotal1, `Preço total calculado e validado estritamente pelo servidor: R$ ${order1.total}`);

  // Verificar que a mesa foi atualizada para "occupied"
  const tableAfterOrder1 = await restaurantRepo.getTableById(createdTable.id, tenant1!.id);
  assert(tableAfterOrder1?.status === 'occupied', 'Status físico da mesa atualizado automaticamente para "occupied" (Ocupada)');
  assert(tableAfterOrder1?.currentSessionId === order1.sessionId, 'Mesa associada à sessão de consumo ativa');

  // 5. Inclusão de um Segundo Pedido na Mesma Sessão de Consumo
  console.log('\n[5/10] Testando Segundo Pedido na Mesma Sessão (Consumo Acumulado)...');
  const order2 = await restaurantRepo.createOrderFromTable({
    tenantSlug: tenant1!.slug,
    tableToken: createdTable.qrCodeToken,
    customerName: 'Cliente B (mesma mesa)',
    items: [
      { productId: prod1.id, quantity: 1, notes: 'Mais uma unidade' },
    ],
  }, '127.0.0.1');

  assert(order2.sessionId === order1.sessionId, 'Segundo pedido vinculado à MESMA sessão/comanda aberta');

  // Verificar consumo acumulado da sessão
  const sessionDetails = await restaurantRepo.getSessionDetails(tenant1!.id, order1.sessionId);
  assert(!!sessionDetails, 'Detalhes da comanda obtidos');
  assert(sessionDetails?.ordersCount === 2, 'Comanda contabiliza 2 pedidos');
  const expectedSessionTotal = Math.round((order1.total + order2.total) * 100) / 100;
  assert(sessionDetails?.totalAmount === expectedSessionTotal, `Total acumulado da comanda calculado com exatidão: R$ ${sessionDetails?.totalAmount}`);

  // 6. Prevenção de Duplo Clique & Idempotência
  console.log('\n[6/10] Testando Idempotência contra Duplo Clique...');
  const testIdempotencyKey = `idem_${Date.now()}`;
  const orderWithKey1 = await restaurantRepo.createOrderFromTable({
    tenantSlug: tenant1!.slug,
    tableToken: createdTable.qrCodeToken,
    customerName: 'Cliente C',
    items: [{ productId: prod1.id, quantity: 1 }],
    idempotencyKey: testIdempotencyKey,
  }, '127.0.0.1');

  const orderWithKey2 = await restaurantRepo.createOrderFromTable({
    tenantSlug: tenant1!.slug,
    tableToken: createdTable.qrCodeToken,
    customerName: 'Cliente C',
    items: [{ productId: prod1.id, quantity: 1 }],
    idempotencyKey: testIdempotencyKey,
  }, '127.0.0.1');

  assert(orderWithKey1.id === orderWithKey2.id, 'Idempotência: requisição repetida com mesma chave retornou o mesmo pedido sem duplicar');

  // 7. Atualização de Ciclo de Vida do Pedido (KDS / Comandas)
  console.log('\n[7/10] Testando Avanço de Status dos Pedidos e Histórico...');
  const confirmed = await restaurantRepo.updateOrderStatus(tenant1!.id, order1.id, 'confirmed', tenantAdminUser);
  assert(confirmed.status === 'confirmed', 'Pedido avançado para "confirmed"');

  const preparing = await restaurantRepo.updateOrderStatus(tenant1!.id, order1.id, 'preparing', tenantAdminUser);
  assert(preparing.status === 'preparing', 'Pedido avançado para "preparing"');

  const ready = await restaurantRepo.updateOrderStatus(tenant1!.id, order1.id, 'ready', tenantAdminUser);
  assert(ready.status === 'ready', 'Pedido avançado para "ready"');

  const delivered = await restaurantRepo.updateOrderStatus(tenant1!.id, order1.id, 'delivered', tenantAdminUser);
  assert(delivered.status === 'delivered', 'Pedido avançado para "delivered"');

  const orderAfterLifecycle = await restaurantRepo.getOrderById(tenant1!.id, order1.id);
  assert((orderAfterLifecycle?.history?.length || 0) >= 4, 'Histórico completo de auditoria das transições de status gravado');

  // 8. Cancelamento de Pedido e Dedução do Total da Sessão
  console.log('\n[8/10] Testando Cancelamento de Pedido e Ajuste Automático da Comanda...');
  const beforeCancelSession = await restaurantRepo.getSessionDetails(tenant1!.id, order1.sessionId);
  const totalBeforeCancel = beforeCancelSession!.totalAmount;

  await restaurantRepo.cancelOrder(tenant1!.id, orderWithKey1.id, tenantAdminUser, 'Cliente pediu para cancelar item extra');
  const afterCancelSession = await restaurantRepo.getSessionDetails(tenant1!.id, order1.sessionId);
  const expectedAfterCancel = Math.round((totalBeforeCancel - orderWithKey1.total) * 100) / 100;

  assert(afterCancelSession!.totalAmount === expectedAfterCancel, `Valor cancelado deduzido com precisão da comanda: antes R$ ${totalBeforeCancel}, agora R$ ${afterCancelSession!.totalAmount}`);

  // 9. Fechamento da Conta e Liberação da Mesa
  console.log('\n[9/10] Testando Fechamento da Conta & Liberação da Mesa...');
  const closeResult = await restaurantRepo.closeSession(tenant1!.id, createdTable.id, tenantAdminUser, 'Conta paga no balcão');
  assert(closeResult.session.status === 'closed', 'Status da sessão atualizado para "closed"');
  assert(!!closeResult.session.closedAt, 'Data e hora de fechamento registradas');

  const tableAfterClose = await restaurantRepo.getTableById(createdTable.id, tenant1!.id);
  assert(tableAfterClose?.status === 'available', 'Mesa liberada com sucesso (status "available")');
  assert(tableAfterClose?.currentSessionId === null, 'Mesa desvinculada de sessão ativa');

  // 10. Segurança e Isolamento Multi-Tenant
  console.log('\n[10/10] Testando Isolamento Estrito entre Tenants...');
  const tenant2AdminUser: User = {
    id: 'user_tenant_2',
    name: 'Admin de Outra Empresa',
    email: 'outro@empresa.com',
    role: 'CLIENT_ADMIN',
    tenantId: '99999999-9999-9999-9999-999999999999', // Outro tenant
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  let crossTenantTableAccess = await restaurantRepo.getTableById(createdTable.id, tenant2AdminUser.tenantId!);
  assert(crossTenantTableAccess === null, 'Isolamento: Tenant B não consegue consultar mesas do Tenant A');

  let crossTenantOrderAccess = await restaurantRepo.getOrderById(tenant2AdminUser.tenantId!, order1.id);
  assert(crossTenantOrderAccess === null, 'Isolamento: Tenant B não consegue ler pedidos do Tenant A');

  console.log('\n================================================================');
  console.log(`🎉 TODOS OS TESTES FORAM CONCLUÍDOS COM SUCESSO! (${passedTests}/${totalTests} aprovados)`);
  console.log('================================================================\n');

  return { passed: passedTests, total: totalTests };
}

// Execute directly if run via tsx
runRestaurantTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
