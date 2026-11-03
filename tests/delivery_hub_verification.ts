import assert from 'node:assert';
import crypto from 'node:crypto';
import { supabaseAdmin, getLocalTableBuilder } from '../server/supabaseAdmin';
import { repo } from '../server/db/repository';
import { orderRepo } from '../server/db/orderRepository';
import { deliveryHubRepo } from '../server/db/deliveryHubRepository';
import { User } from '../src/types/saas';

async function runVerification() {
  console.log('=== INICIANDO BATERIA DE TESTES AUTOMATIZADOS: CENTRAL DE ENTREGAS & DESPACHO ===\n');

  const testRunId = Date.now().toString().slice(-6);
  const tenantASlug = `test-delivery-a-${testRunId}`;
  const tenantBSlug = `test-delivery-b-${testRunId}`;

  const superAdminActor: User = {
    id: 'super-admin-test',
    name: 'Super Admin Test',
    email: 'admin@localhub.com',
    role: 'SUPER_ADMIN',
    tenantId: null,
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  let tenantAId = '';
  let tenantBId = '';
  let adminUserA!: User;
  let adminUserB!: User;
  let driver1User!: User;
  let driver2User!: User;
  let driverBUser!: User;

  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdRuleIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdDriverIds: string[] = [];
  const createdRouteIds: string[] = [];

  try {
    // 0. Create 2 isolated test tenants (Restaurante A & Restaurante B)
    const plans = await repo.getPlans();
    const fullPlan =
      plans.find((p: any) => p.activeFeatures?.includes('delivery') && p.activeFeatures?.includes('shopping_cart')) ||
      plans[plans.length - 1] ||
      plans[0];
    const defaultPlanId = fullPlan?.id || 'plan_enterprise';

    const tenantARes = await repo.createTenant(
      {
        name: `Restaurante Teste Entregas A ${testRunId}`,
        slug: tenantASlug,
        subdomain: `${tenantASlug}.minihub.tech`,
        segment: 'Alimentação & Restaurantes',
        phone: '63999990001',
        whatsapp: '63999990001',
        email: `contato-a-${testRunId}@teste.local`,
        ownerName: 'Admin A',
        ownerEmail: `admin-a-${testRunId}@teste.local`,
        ownerPhone: '63999990001',
        planId: defaultPlanId,
        status: 'ativo',
      },
      superAdminActor
    );
    tenantAId = tenantARes.tenant.id;
    adminUserA = tenantARes.defaultUser;
    createdUserIds.push(adminUserA.id);

    const tenantBRes = await repo.createTenant(
      {
        name: `Restaurante Teste Entregas B ${testRunId}`,
        slug: tenantBSlug,
        subdomain: `${tenantBSlug}.minihub.tech`,
        segment: 'Alimentação & Restaurantes',
        phone: '63999990002',
        whatsapp: '63999990002',
        email: `contato-b-${testRunId}@teste.local`,
        ownerName: 'Admin B',
        ownerEmail: `admin-b-${testRunId}@teste.local`,
        ownerPhone: '63999990002',
        planId: defaultPlanId,
        status: 'ativo',
      },
      superAdminActor
    );
    tenantBId = tenantBRes.tenant.id;
    adminUserB = tenantBRes.defaultUser;
    createdUserIds.push(adminUserB.id);

    // Enable required features & delivery rules for both test tenants
    for (const [tId, actor] of [
      [tenantAId, adminUserA],
      [tenantBId, adminUserB],
    ] as const) {
      await orderRepo.updateDeliverySettings(
        tId,
        {
          ordersEnabled: true,
          deliveryEnabled: true,
          pickupEnabled: true,
          pricingMode: 'neighborhood',
          originAddress: {
            cep: '77804-090',
            street: 'Avenida Cônego João Lima',
            number: '1000',
            neighborhood: 'Centro',
            city: 'Araguaína',
            state: 'TO',
            latitude: -7.1920,
            longitude: -48.2075,
          },
        },
        actor
      );
      const rule = await orderRepo.createDeliveryRule(
        tId,
        {
          type: 'fixed',
          name: 'Taxa Fixa Urbana',
          fee: 8,
          isActive: true,
        },
        actor
      );
      createdRuleIds.push(rule.id);
    }

    // Create 1 active test product for each tenant
    const productAId = crypto.randomUUID();
    const productBId = crypto.randomUUID();
    createdProductIds.push(productAId, productBId);
    const nowIso = new Date().toISOString();

    await supabaseAdmin.from('products').insert([
      {
        id: productAId,
        tenant_id: tenantAId,
        name: 'Combo Burger Artesanal',
        description: 'Burger + Fritas',
        price: 45,
        is_active: true,
        is_featured: false,
        price_on_request: false,
        track_stock: false,
        allow_out_of_stock: true,
        stock_quantity: 100,
        position: 0,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: productBId,
        tenant_id: tenantBId,
        name: 'Prato Executivo B',
        description: 'Executivo',
        price: 40,
        is_active: true,
        is_featured: false,
        price_on_request: false,
        track_stock: false,
        allow_out_of_stock: true,
        stock_quantity: 100,
        position: 0,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ]);

    // =========================================================================
    // TESTE 1: Criação de entregador (Motoboy)
    // =========================================================================
    console.log('1. Testando criação de entregador (Motoboy)...');
    const driver1Email = `motoboy1-${testRunId}@teste.local`;
    const driver1 = await deliveryHubRepo.createDriver(
      tenantAId,
      {
        name: 'Carlos Motoboy',
        phone: '63999991111',
        email: driver1Email,
        vehicleInfo: 'Moto Honda CG 160',
        plate: 'QWE-1234',
        isActive: true,
        password: 'MotoboyPassword123!',
      },
      adminUserA
    );
    createdDriverIds.push(driver1.id);
    if (driver1.userId) createdUserIds.push(driver1.userId);

    assert.ok(driver1.id, 'Entregador 1 deve possuir ID');
    assert.strictEqual(driver1.tenantId, tenantAId, 'Entregador 1 deve pertencer ao Tenant A');
    assert.strictEqual(driver1.name, 'Carlos Motoboy');
    assert.strictEqual(driver1.availabilityStatus, 'available');
    assert.ok(driver1.userId, 'Entregador 1 deve ter conta de acesso vinculada (userId)');

    const driver2Email = `motoboy2-${testRunId}@teste.local`;
    const driver2 = await deliveryHubRepo.createDriver(
      tenantAId,
      {
        name: 'Marcos Entregador',
        phone: '63999992222',
        email: driver2Email,
        vehicleInfo: 'Moto Yamaha Factor',
        plate: 'XYZ-9876',
        isActive: true,
        password: 'MotoboyPassword456!',
      },
      adminUserA
    );
    createdDriverIds.push(driver2.id);
    if (driver2.userId) createdUserIds.push(driver2.userId);

    const driverBEmail = `motoboy-b-${testRunId}@teste.local`;
    const driverTenantB = await deliveryHubRepo.createDriver(
      tenantBId,
      {
        name: 'Motoboy Restaurante B',
        phone: '63999993333',
        email: driverBEmail,
        vehicleInfo: 'Moto',
        isActive: true,
        password: 'MotoboyPassword789!',
      },
      adminUserB
    );
    createdDriverIds.push(driverTenantB.id);
    if (driverTenantB.userId) createdUserIds.push(driverTenantB.userId);
    console.log('   ✔ Criação de entregadores concluída com sucesso.');

    // =========================================================================
    // TESTE 2: Autenticação individual do entregador
    // =========================================================================
    console.log('2. Testando autenticação individual do entregador...');
    const wrongPassAuth = await repo.authenticateUser(driver1Email, 'SenhaErrada!');
    assert.strictEqual(wrongPassAuth, null, 'Não deve autenticar entregador com senha incorreta');

    const validDriverAuth = await repo.authenticateUser(driver1Email, 'MotoboyPassword123!');
    assert.ok(validDriverAuth, 'Deve autenticar entregador com credenciais válidas');
    assert.strictEqual(validDriverAuth.role, 'DELIVERY_DRIVER', 'Role do usuário autenticado deve ser DELIVERY_DRIVER');
    assert.strictEqual(validDriverAuth.tenantId, tenantAId, 'TenantId do entregador deve ser o Restaurante A');
    driver1User = validDriverAuth;

    driver2User = (await repo.authenticateUser(driver2Email, 'MotoboyPassword456!'))!;
    driverBUser = (await repo.authenticateUser(driverBEmail, 'MotoboyPassword789!'))!;
    assert.ok(driver2User && driverBUser);

    const resolvedDriverRecord = await deliveryHubRepo.getDriverByUserId(tenantAId, driver1User.id, driver1User.email);
    assert.ok(resolvedDriverRecord, 'Deve resolver o cadastro do entregador pelo userId');
    assert.strictEqual(resolvedDriverRecord.id, driver1.id);
    console.log('   ✔ Autenticação individual do entregador validada.');

    // =========================================================================
    // TESTE 3: Isolamento multi-tenant entre restaurantes
    // =========================================================================
    console.log('3. Testando isolamento multi-tenant entre restaurantes...');
    const driversA = await deliveryHubRepo.listDrivers(tenantAId);
    const driversB = await deliveryHubRepo.listDrivers(tenantBId);
    assert.strictEqual(driversA.length, 2, 'Restaurante A deve ver apenas seus 2 entregadores');
    assert.strictEqual(driversB.length, 1, 'Restaurante B deve ver apenas seu 1 entregador');
    assert.ok(!driversA.some((d) => d.id === driverTenantB.id), 'Entregador do Restaurante B não pode aparecer no Restaurante A');
    console.log('   ✔ Isolamento multi-tenant de entregadores confirmado.');

    // =========================================================================
    // TESTE 4: Localização de pedidos no mapa e "Localização pendente" sem inventar coordenadas
    // =========================================================================
    console.log('4. Testando geocodificação de pedidos e tratamento de "Localização pendente"...');
    // Pedido 1 (Centro - com coordenadas)
    const order1Res = await orderRepo.createOrder(
      tenantASlug,
      {
        customerName: 'Cliente Ana Silva',
        customerPhone: '63981110001',
        fulfillmentType: 'delivery',
        paymentMethod: 'PIX',
        deliveryAddress: {
          cep: '77804-010',
          street: 'Rua 13 de Maio',
          number: '120',
          neighborhood: 'Centro',
          city: 'Araguaína',
          state: 'TO',
          latitude: -7.1912,
          longitude: -48.2068,
        },
        items: [{ productId: productAId, quantity: 1 }],
      },
      `ip-1-${testRunId}`
    );
    const order1 = order1Res.order;
    createdOrderIds.push(order1.id);

    // Pedido 2 (Centro - próximo ao Pedido 1)
    const order2Res = await orderRepo.createOrder(
      tenantASlug,
      {
        customerName: 'Cliente Bruno Costa',
        customerPhone: '63981110002',
        fulfillmentType: 'delivery',
        paymentMethod: 'PIX',
        deliveryAddress: {
          cep: '77804-020',
          street: 'Rua 15 de Novembro',
          number: '340',
          neighborhood: 'Centro',
          city: 'Araguaína',
          state: 'TO',
          latitude: -7.1935,
          longitude: -48.2055,
        },
        items: [{ productId: productAId, quantity: 2 }],
      },
      `ip-2-${testRunId}`
    );
    const order2 = order2Res.order;
    createdOrderIds.push(order2.id);

    // Pedido 3 (Setor Anhanguera - com coordenadas)
    const order3Res = await orderRepo.createOrder(
      tenantASlug,
      {
        customerName: 'Cliente Carla Mendes',
        customerPhone: '63981110003',
        fulfillmentType: 'delivery',
        paymentMethod: 'CASH',
        deliveryAddress: {
          cep: '77818-520',
          street: 'Rua das Palmeiras',
          number: '85',
          neighborhood: 'Setor Anhanguera',
          city: 'Araguaína',
          state: 'TO',
          latitude: -7.1820,
          longitude: -48.1980,
        },
        items: [{ productId: productAId, quantity: 1 }],
      },
      `ip-3-${testRunId}`
    );
    const order3 = order3Res.order;
    createdOrderIds.push(order3.id);

    // Pedido 4 (Endereço na mesma cidade mas não encontrado pelo geocodificador -> deve ficar "pending" sem inventar coordenadas!)
    const order4Res = await orderRepo.createOrder(
      tenantASlug,
      {
        customerName: 'Cliente Diego Sem Mapa',
        customerPhone: '63981110004',
        fulfillmentType: 'delivery',
        paymentMethod: 'PIX',
        deliveryAddress: {
          cep: '00000-000',
          street: 'Estrada Projetada Inexistente XYZ 99999',
          number: 'S/N',
          neighborhood: 'Loteamento Sem Mapa XYZ',
          city: 'Araguaína',
          state: 'TO',
        },
        items: [{ productId: productAId, quantity: 1 }],
      },
      `ip-4-${testRunId}`
    );
    const order4Pending = order4Res.order;
    createdOrderIds.push(order4Pending.id);

    // Pedido de outro restaurante (Tenant B)
    const orderTenantBRes = await orderRepo.createOrder(
      tenantBSlug,
      {
        customerName: 'Cliente Outro Restaurante',
        customerPhone: '63981119999',
        fulfillmentType: 'delivery',
        paymentMethod: 'PIX',
        deliveryAddress: {
          cep: '77804-010',
          street: 'Rua A',
          number: '10',
          neighborhood: 'Centro',
          city: 'Araguaína',
          state: 'TO',
          latitude: -7.1910,
          longitude: -48.2070,
        },
        items: [{ productId: productBId, quantity: 1 }],
      },
      `ip-b-${testRunId}`
    );
    const orderTenantB = orderTenantBRes.order;
    createdOrderIds.push(orderTenantB.id);

    const overviewInitial = await deliveryHubRepo.getDeliveryHubOverview(tenantAId);
    const foundOrder4 = overviewInitial.orders.find((o) => o.id === order4Pending.id);
    assert.ok(foundOrder4, 'Pedido com endereço pendente deve aparecer na lista operacional');
    assert.strictEqual(foundOrder4.latitude, null, 'Nunca deve inventar latitude quando a geocodificação falha');
    assert.strictEqual(foundOrder4.longitude, null, 'Nunca deve inventar longitude quando a geocodificação falha');
    assert.strictEqual(foundOrder4.geocodeStatus, 'pending', 'Status deve ser marcado como Localização pendente (pending)');

    // Ajuste manual de coordenadas pelo restaurante
    const manualAdjusted = await deliveryHubRepo.updateOrderManualLocation(
      tenantAId,
      order4Pending.id,
      { latitude: -7.1850, longitude: -48.1995 },
      adminUserA
    );
    assert.strictEqual(manualAdjusted?.deliveryAddress?.latitude, -7.1850);
    assert.strictEqual(manualAdjusted?.deliveryAddress?.longitude, -48.1995);
    assert.strictEqual(manualAdjusted?.deliveryAddress?.geocodeStatus, 'manual');
    console.log('   ✔ Geocodificação, "Localização pendente" sem coordenadas falsas e ajuste manual validados.');

    // =========================================================================
    // TESTE 5: Agrupamento inteligente de pedidos próximos
    // =========================================================================
    console.log('5. Testando agrupamento inteligente de pedidos próximos...');
    const overviewAfterGeocode = await deliveryHubRepo.getDeliveryHubOverview(tenantAId);
    assert.ok(overviewAfterGeocode.clusterSuggestions.length >= 1, 'Deve sugerir agrupamento para pedidos próximos');
    const centroCluster = overviewAfterGeocode.clusterSuggestions.find(
      (c) => c.orderIds.includes(order1.id) && c.orderIds.includes(order2.id)
    );
    assert.ok(centroCluster, 'Pedidos 1 e 2 no Centro devem ser agrupados na mesma sugestão geográfica');
    console.log('   ✔ Sugestão de agrupamento geográfico validada.');

    // =========================================================================
    // TESTE 6: Criação de rota com múltiplos pedidos e bloqueios de validação
    // =========================================================================
    console.log('6. Testando criação de rota com múltiplos pedidos e regras de validação...');
    // Deve bloquear criação de rota com pedido de outro restaurante
    await assert.rejects(
      async () => {
        await deliveryHubRepo.createRoute(
          tenantAId,
          { orderIds: [order1.id, orderTenantB.id] },
          adminUserA
        );
      },
      /não encontrado|outro restaurante/i,
      'Deve impedir inclusão de pedido pertencente a outro restaurante'
    );

    const route1 = await deliveryHubRepo.createRoute(
      tenantAId,
      {
        name: 'Rota Centro & Anhanguera #1',
        orderIds: [order1.id, order2.id, order3.id],
        optimizeOrder: true,
      },
      adminUserA
    );
    createdRouteIds.push(route1.id);

    assert.strictEqual(route1.stops.length, 3, 'Rota deve conter 3 paradas');
    assert.strictEqual(route1.status, 'created', 'Rota sem entregador deve iniciar com status created');
    assert.ok(route1.totalDistanceKm >= 0, 'Deve calcular distância estimada da rota');
    assert.ok(route1.estimatedDurationMin > 0, 'Deve calcular tempo estimado da rota');

    // Deve impedir que um pedido já em rota ativa seja incluído em outra rota
    await assert.rejects(
      async () => {
        await deliveryHubRepo.createRoute(
          tenantAId,
          { orderIds: [order1.id, order4Pending.id] },
          adminUserA
        );
      },
      /já está vinculado à rota ativa/i,
      'Não deve permitir incluir pedido que já está em uma rota ativa'
    );
    console.log('   ✔ Criação de rota com múltiplas paradas e bloqueio de duplicidade validados.');

    // =========================================================================
    // TESTE 7: Alteração manual da ordem de entrega e remoção de pedido da rota
    // =========================================================================
    console.log('7. Testando reordenação manual das paradas e remoção de pedido antes do início...');
    const reversedStopIds = [...route1.stops].reverse().map((s) => s.id);
    const reorderedRoute = await deliveryHubRepo.reorderRouteStops(
      tenantAId,
      route1.id,
      reversedStopIds,
      adminUserA
    );
    assert.strictEqual(reorderedRoute.stops[0].id, reversedStopIds[0], 'Primeira parada deve refletir nova ordem manual');
    assert.strictEqual(reorderedRoute.stops[0].stopSequence, 1);
    assert.strictEqual(reorderedRoute.stops[1].stopSequence, 2);
    assert.strictEqual(reorderedRoute.stops[2].stopSequence, 3);

    // Remover a parada referente ao order3 da rota
    const stopForOrder3 = reorderedRoute.stops.find((s) => s.orderId === order3.id)!;
    const routeAfterRemove = await deliveryHubRepo.removeStopFromRoute(
      tenantAId,
      route1.id,
      stopForOrder3.id,
      adminUserA
    );
    assert.strictEqual(routeAfterRemove.stops.length, 2, 'Rota deve ficar com 2 paradas após remoção');
    console.log('   ✔ Reordenação manual e remoção de parada validadas.');

    // =========================================================================
    // TESTE 8: Vinculação de entregador à rota
    // =========================================================================
    console.log('8. Testando vinculação de entregador à rota...');
    // Bloquear vinculação de entregador de outro restaurante
    await assert.rejects(
      async () => {
        await deliveryHubRepo.assignDriverToRoute(tenantAId, route1.id, driverTenantB.id, adminUserA);
      },
      /não encontrado/i,
      'Deve bloquear vinculação de entregador de outro restaurante'
    );

    const assignedRoute = await deliveryHubRepo.assignDriverToRoute(
      tenantAId,
      route1.id,
      driver1.id,
      adminUserA
    );
    assert.strictEqual(assignedRoute.driverId, driver1.id, 'Entregador 1 deve estar vinculado à rota');
    assert.strictEqual(assignedRoute.status, 'assigned', 'Status da rota deve mudar para assigned');
    console.log('   ✔ Vinculação de entregador validada.');

    // =========================================================================
    // TESTE 9: Geração de QR Code da rota sem exposição de dados sensíveis
    // =========================================================================
    console.log('9. Testando geração e segurança do QR Code da rota...');
    assert.ok(assignedRoute.qrToken, 'Rota deve possuir um qrToken exclusivo');
    assert.ok(assignedRoute.qrToken.startsWith('rtqr_'), 'qrToken deve usar prefixo seguro aleatório');
    assert.ok(!assignedRoute.qrToken.includes('Ana'), 'qrToken não deve conter nome de cliente');
    assert.ok(!assignedRoute.qrToken.includes('6398111'), 'qrToken não deve conter telefone de cliente');
    assert.ok(assignedRoute.qrExpiresAt, 'QR Code deve possuir data de expiração');
    console.log('   ✔ Segurança do QR Code da rota validada.');

    // =========================================================================
    // TESTE 10 & 11: Leitura e validação do QR Code + Bloqueio de acesso por outro entregador
    // =========================================================================
    console.log('10 & 11. Testando leitura do QR Code e bloqueio de acesso a rota de outro entregador...');
    // Motoboy de outro restaurante não pode ler QR Code do Restaurante A
    await assert.rejects(
      async () => {
        await deliveryHubRepo.scanRouteQrCode(tenantBId, assignedRoute.qrToken, driverBUser);
      },
      /outro estabelecimento/i,
      'Deve bloquear leitura de QR Code por restaurante diferente'
    );

    // Motoboy 2 (mesmo restaurante, mas rota atribuída ao Motoboy 1) deve ser bloqueado
    await assert.rejects(
      async () => {
        await deliveryHubRepo.scanRouteQrCode(tenantAId, assignedRoute.qrToken, driver2User);
      },
      /atribuída a outro entregador/i,
      'Deve bloquear acesso de entregador diferente daquele atribuído à rota'
    );

    // Motoboy 1 lê o QR Code com sucesso
    const scannedRoute = await deliveryHubRepo.scanRouteQrCode(
      tenantAId,
      assignedRoute.qrToken,
      driver1User
    );
    assert.strictEqual(scannedRoute.id, route1.id);
    assert.strictEqual(scannedRoute.status, 'accepted', 'Status da rota após leitura pelo motoboy deve ser accepted');
    console.log('   ✔ Leitura do QR Code e bloqueio contra acesso indevido validados.');

    // =========================================================================
    // TESTE 12: Início da rota pelo entregador
    // =========================================================================
    console.log('12. Testando início da rota pelo entregador...');
    await assert.rejects(
      async () => {
        await deliveryHubRepo.startRoute(tenantAId, route1.id, driver2User);
      },
      /outro entregador/i,
      'Outro entregador não pode iniciar a rota do Motoboy 1'
    );

    const startedRoute = await deliveryHubRepo.startRoute(tenantAId, route1.id, driver1User);
    assert.strictEqual(startedRoute.status, 'in_progress', 'Rota deve mudar para in_progress');
    assert.ok(startedRoute.startedAt, 'Deve registrar horário de saída (startedAt)');

    const updatedDriver1 = await deliveryHubRepo.getDriverById(tenantAId, driver1.id);
    assert.strictEqual(updatedDriver1?.availabilityStatus, 'in_route', 'Status do entregador deve mudar para in_route');
    console.log('   ✔ Início da rota e atualização do status do motoboy validados.');

    // =========================================================================
    // TESTE 13, 14 & 15: Início da entrega de uma parada + Disparo WhatsApp apenas para o pedido da parada + Idempotência
    // =========================================================================
    console.log('13, 14 & 15. Testando início da parada, disparo individual de WhatsApp e chave de idempotência...');
    const firstStop = startedRoute.stops[0];
    const secondStop = startedRoute.stops[1];

    const startStopResult = await deliveryHubRepo.startRouteStop(
      tenantAId,
      route1.id,
      firstStop.id,
      driver1User
    );
    const updatedStop1 = startStopResult.route.stops.find((s) => s.id === firstStop.id)!;
    const untouchedStop2 = startStopResult.route.stops.find((s) => s.id === secondStop.id)!;

    assert.strictEqual(updatedStop1.status, 'out_for_delivery', 'Parada 1 deve mudar para out_for_delivery');
    assert.strictEqual(untouchedStop2.status, 'waiting', 'Parada 2 deve permanecer como waiting');

    const order1InDb = await orderRepo.getOrderById(tenantAId, firstStop.orderId);
    assert.strictEqual(order1InDb?.status, 'OUT_FOR_DELIVERY', 'Status do pedido da Parada 1 deve ser atualizado para OUT_FOR_DELIVERY');

    // Verificar notificação criada apenas para o pedido da Parada 1
    assert.ok(startStopResult.notification, 'Deve registrar tentativa de notificação para o pedido da Parada 1');
    assert.strictEqual(startStopResult.notification.orderId, firstStop.orderId);
    assert.ok(
      startStopResult.notification.messageBody.includes('saiu para entrega') &&
        startStopResult.notification.messageBody.includes('/rastreio/'),
      'Mensagem do WhatsApp deve conter texto de saída para entrega e link público de rastreamento'
    );
    // Sem provedor externo configurado no ambiente de teste, nunca deve fingir 'sent'
    assert.notStrictEqual(
      startStopResult.notification.status,
      'sent',
      'Sem provedor WhatsApp externo configurado, não deve marcar falsamente como sent'
    );

    // Verificar que nenhuma notificação foi disparada para a Parada 2
    const stop2Notifications = await deliveryHubRepo.listNotifications(tenantAId, secondStop.orderId);
    assert.strictEqual(stop2Notifications.length, 0, 'Não deve enviar notificação para outros pedidos da rota que ainda não iniciaram entrega');

    // Testar idempotência: chamar dispatchWhatsAppNotification novamente para a mesma parada
    const duplicateNotificationCall = await deliveryHubRepo.dispatchWhatsAppNotification({
      tenantId: tenantAId,
      routeId: route1.id,
      stopId: firstStop.id,
      orderId: firstStop.orderId,
      eventType: 'out_for_delivery',
      actor: driver1User,
      forceRetry: false, // forceRetry = false -> deve retornar o registro existente pela chave de idempotência
    });
    assert.strictEqual(
      duplicateNotificationCall.id,
      startStopResult.notification.id,
      'Chave de idempotência deve impedir duplicação da mesma notificação'
    );
    const stop1NotificationsCheck = await deliveryHubRepo.listNotifications(tenantAId, firstStop.orderId);
    assert.strictEqual(stop1NotificationsCheck.length, 1, 'Deve existir apenas 1 registro de notificação para a Parada 1');
    console.log('   ✔ Início de parada, isolamento da notificação por parada e idempotência validados.');

    // =========================================================================
    // TESTE 16 & 17: Confirmação de entrega e Registro de tentativa sem sucesso
    // =========================================================================
    console.log('16 & 17. Testando confirmação de entrega e registro de tentativa sem sucesso...');
    const afterCompleteStop1 = await deliveryHubRepo.completeRouteStop(
      tenantAId,
      route1.id,
      firstStop.id,
      driver1User
    );
    const completedStop1 = afterCompleteStop1.stops.find((s) => s.id === firstStop.id)!;
    assert.strictEqual(completedStop1.status, 'delivered', 'Parada 1 deve ficar com status delivered');
    assert.ok(completedStop1.deliveredAt, 'Deve registrar timestamp deliveredAt');
    assert.strictEqual(afterCompleteStop1.status, 'in_progress', 'Rota ainda possui a Parada 2 pendente, portanto continua in_progress');

    const order1Completed = await orderRepo.getOrderById(tenantAId, firstStop.orderId);
    assert.strictEqual(order1Completed?.status, 'COMPLETED', 'Pedido 1 deve mudar para COMPLETED após entrega confirmada');

    // Testar envio opcional de localização do motoboy enquanto a rota está ativa (Teste 20)
    console.log('20. Testando envio opcional de localização do motoboy durante rota ativa...');
    const updatedLoc = await deliveryHubRepo.updateDriverStatusAndLocation(tenantAId, driver1User, {
      shareLocation: true,
      latitude: -7.1905,
      longitude: -48.2060,
    });
    assert.strictEqual(updatedLoc.shareLocation, true);
    assert.strictEqual(updatedLoc.lastLatitude, -7.1905);
    assert.strictEqual(updatedLoc.lastLongitude, -7.1905 ? -48.2060 : null);

    // Iniciar Parada 2 e registrar tentativa sem sucesso (ex: cliente não atendeu)
    await deliveryHubRepo.startRouteStop(tenantAId, route1.id, secondStop.id, driver1User);
    const afterFailStop2 = await deliveryHubRepo.failRouteStop(
      tenantAId,
      route1.id,
      secondStop.id,
      {
        reason: 'customer_not_answered',
        notes: 'Interfone tocou 3 vezes sem resposta',
      },
      driver1User
    );
    const failedStop2 = afterFailStop2.stops.find((s) => s.id === secondStop.id)!;
    assert.strictEqual(failedStop2.status, 'failed_attempt', 'Parada 2 deve ficar com status failed_attempt');
    assert.strictEqual(failedStop2.failureReason, 'customer_not_answered', 'Motivo da falha deve ser registrado');
    assert.strictEqual(afterFailStop2.status, 'completed', 'Quando todas as paradas foram processadas, a rota deve ser concluída');

    const driver1AfterRoute = await deliveryHubRepo.getDriverById(tenantAId, driver1.id);
    assert.strictEqual(driver1AfterRoute?.availabilityStatus, 'available', 'Motoboy deve voltar para disponível ao concluir a rota');
    assert.strictEqual(driver1AfterRoute?.lastLatitude, null, 'Coordenadas ao vivo do motoboy devem ser limpas ao concluir a rota');
    console.log('   ✔ Confirmação de entrega, tentativa sem sucesso, localização opcional e conclusão automática da rota validados.');

    // =========================================================================
    // TESTE 18: Atualização do painel do restaurante (KPIs e Histórico de Eventos)
    // =========================================================================
    console.log('18. Testando atualização do painel do restaurante e trilha de auditoria (delivery_events)...');
    const overviewFinal = await deliveryHubRepo.getDeliveryHubOverview(tenantAId);
    assert.ok(overviewFinal.stats.deliveredTodayCount >= 1, 'KPI de entregues deve contabilizar a parada entregue');
    assert.ok(overviewFinal.stats.issuesCount >= 1, 'KPI de ocorrências deve contabilizar a tentativa sem sucesso');
    assert.ok(overviewFinal.routes.some((r) => r.id === route1.id && r.status === 'completed'), 'Rota concluída deve constar no painel do restaurante');
    console.log('   ✔ Painel do restaurante e histórico de rotas validados.');

    // =========================================================================
    // TESTE 19: Segurança do link público de rastreamento pelo cliente
    // =========================================================================
    console.log('19. Testando segurança do link público de rastreamento...');
    const publicTracking1 = await deliveryHubRepo.getPublicTrackingByToken(firstStop.trackingToken);
    assert.ok(publicTracking1, 'Link público com token válido deve retornar dados do rastreamento');
    assert.strictEqual(publicTracking1.stopStatus, 'delivered');
    assert.strictEqual(publicTracking1.driverFirstName, 'Carlos', 'Deve exibir apenas o primeiro nome do entregador');
    assert.ok(
      !(publicTracking1 as any).customerPhone && !(publicTracking1 as any).driverPhone,
      'Endpoint público não deve vazar telefone do cliente nem do motoboy'
    );

    const invalidTracking = await deliveryHubRepo.getPublicTrackingByToken('trk_token_inexistente_123456');
    assert.strictEqual(invalidTracking, null, 'Token público inválido não deve retornar dados');
    console.log('   ✔ Segurança do link público de rastreamento validada.');

    console.log('\n=== TODOS OS 20 CENÁRIOS DA CENTRAL DE ENTREGAS PASSARAM COM 100% DE SUCESSO! ===');
  } finally {
    // Limpeza completa dos dados temporários de teste sem tocar em pedidos reais
    console.log('\nLimpando dados temporários de teste...');
    const cleanTable = async (table: string, col: string, ids: string[]) => {
      if (!ids.length) return;
      try {
        await supabaseAdmin.from(table).delete().in(col, ids);
      } catch {
        // ignore
      }
      try {
        await getLocalTableBuilder(table).delete().in(col, ids);
      } catch {
        // ignore
      }
    };

    const tenantIds = [tenantAId, tenantBId].filter(Boolean);
    await cleanTable('delivery_notifications', 'tenant_id', tenantIds);
    await cleanTable('delivery_events', 'tenant_id', tenantIds);
    await cleanTable('delivery_route_stops', 'tenant_id', tenantIds);
    await cleanTable('delivery_routes', 'id', createdRouteIds);
    await cleanTable('delivery_drivers', 'id', createdDriverIds);
    await cleanTable('order_items', 'order_id', createdOrderIds);
    await cleanTable('order_delivery_addresses', 'order_id', createdOrderIds);
    await cleanTable('order_status_history', 'order_id', createdOrderIds);
    await cleanTable('orders', 'id', createdOrderIds);
    await cleanTable('products', 'id', createdProductIds);
    await cleanTable('delivery_rules', 'id', createdRuleIds);
    await cleanTable('delivery_settings', 'tenant_id', tenantIds);
    await cleanTable('payment_methods_config', 'tenant_id', tenantIds);
    await cleanTable('site_sections', 'tenant_id', tenantIds);
    await cleanTable('site_settings', 'tenant_id', tenantIds);
    await cleanTable('tenant_features', 'tenant_id', tenantIds);
    await cleanTable('tenant_settings', 'tenant_id', tenantIds);
    await cleanTable('tenant_users', 'tenant_id', tenantIds);
    await cleanTable('tenants', 'id', tenantIds);
    await cleanTable('auth_users', 'id', createdUserIds);
    for (const uId of createdUserIds) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(uId);
      } catch {
        // ignore
      }
    }
    console.log('Limpeza concluída.');
  }
}

runVerification().catch((err) => {
  console.error('FALHA NA VERIFICAÇÃO DA CENTRAL DE ENTREGAS:', err);
  process.exit(1);
});
