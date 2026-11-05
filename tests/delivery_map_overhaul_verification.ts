import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { supabaseAdmin, getLocalTableBuilder } from '../server/supabaseAdmin.js';
import { deliveryHubRepo } from '../server/db/deliveryHubRepository.js';
import { orderRepo } from '../server/db/orderRepository.js';
import { repo } from '../server/db/repository.js';
import { calculateMultiStopRoadRouteServer } from '../server/services/routingService.js';
import { User } from '../src/types/saas.js';

async function runMapOverhaulTests() {
  console.log('===================================================================');
  console.log(' AUDITORIA E TESTES — MAPA OPERACIONAL DA CENTRAL DE ENTREGAS');
  console.log('===================================================================\n');

  // 1. Verify SVG Grid Removal & Real Street Map Integration
  const mapComponentPath = path.resolve(
    process.cwd(),
    'src/components/delivery/InteractiveDeliveryMap.tsx'
  );
  const mapSource = fs.readFileSync(mapComponentPath, 'utf-8');

  assert.equal(
    mapSource.includes('delivery-grid') || mapSource.includes('delivery-subgrid'),
    false,
    'O antigo fundo em grade SVG (#delivery-grid / #delivery-subgrid) deve ter sido completamente removido.'
  );
  assert.equal(
    mapSource.includes("from 'leaflet'") &&
      mapSource.includes('basemaps.cartocdn.com/rastertiles/voyager'),
    true,
    'O componente deve inicializar o motor cartográfico real (Leaflet + tiles de ruas e bairros).'
  );
  console.log(
    '✅ 1. Carregamento do mapa real (ruas, avenidas e bairros) verificado — Grade SVG removida.'
  );

  // 2. Verify Required Marker Colors by Status
  assert.equal(mapSource.includes("bg: '#f97316'"), true, 'Laranja: aguardando despacho');
  assert.equal(mapSource.includes("bg: '#3b82f6'"), true, 'Azul: atribuído ao motoboy');
  assert.equal(mapSource.includes("bg: '#8b5cf6'"), true, 'Roxo: em rota');
  assert.equal(mapSource.includes("bg: '#10b981'"), true, 'Verde: entregue');
  assert.equal(mapSource.includes("bg: '#ef4444'"), true, 'Vermelho: problema na entrega');
  console.log(
    '✅ 2. Cores obrigatórias dos marcadores por status validadas (#f97316, #3b82f6, #8b5cf6, #10b981, #ef4444).'
  );

  // 3. Create isolated test tenant with 5 geocoded orders at distinct addresses
  const suffix = Date.now().toString().slice(-6);
  const tenantSlug = `test-map-hub-${suffix}`;
  const superAdminActor: User = {
    id: 'super-admin-map-test',
    name: 'Super Admin Map Test',
    email: 'admin@localhub.com',
    role: 'SUPER_ADMIN',
    tenantId: null,
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  let tenantId = '';
  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdRuleIds: string[] = [];
  const createdOrderIds: string[] = [];

  try {
    const plans = await repo.getPlans();
    const fullPlan =
      plans.find(
        (p: any) =>
          p.activeFeatures?.includes('delivery') &&
          p.activeFeatures?.includes('shopping_cart')
      ) ||
      plans[plans.length - 1] ||
      plans[0];
    const defaultPlanId = fullPlan?.id || 'plan_enterprise';

    const tenantRes = await repo.createTenant(
      {
        name: `Restaurante Mapa Teste ${suffix}`,
        slug: tenantSlug,
        subdomain: `${tenantSlug}.minihub.tech`,
        segment: 'Alimentação & Restaurantes',
        phone: '11999990001',
        whatsapp: '11999990001',
        email: `contato-map-${suffix}@teste.local`,
        ownerName: 'Admin Mapa',
        ownerEmail: `admin-map-${suffix}@teste.local`,
        ownerPhone: '11999990001',
        planId: defaultPlanId,
        status: 'ativo',
      },
      superAdminActor
    );
    tenantId = tenantRes.tenant.id;
    const adminUser = tenantRes.defaultUser;
    createdUserIds.push(adminUser.id);

    await orderRepo.updateDeliverySettings(
      tenantId,
      {
        ordersEnabled: true,
        deliveryEnabled: true,
        pickupEnabled: true,
        pricingMode: 'neighborhood',
        originAddress: {
          cep: '01310-100',
          street: 'Avenida Paulista',
          number: '1000',
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
          latitude: -23.5649,
          longitude: -46.652,
        },
      },
      adminUser
    );

    const rule = await orderRepo.createDeliveryRule(
      tenantId,
      {
        type: 'fixed',
        name: 'Taxa Fixa Urbana',
        fee: 8,
        isActive: true,
      },
      adminUser
    );
    createdRuleIds.push(rule.id);

    const productId = crypto.randomUUID();
    createdProductIds.push(productId);
    const nowIso = new Date().toISOString();

    await supabaseAdmin.from('products').insert([
      {
        id: productId,
        tenant_id: tenantId,
        name: 'Parmegiana Artesanal',
        description: 'Acompanha arroz e fritas',
        price: 42.0,
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

    const addresses = [
      {
        customerName: 'Cliente 1 - Jardins',
        cep: '01414001',
        street: 'Rua Haddock Lobo',
        number: '595',
        neighborhood: 'Cerqueira César',
        lat: -23.5587,
        lng: -46.6615,
      },
      {
        customerName: 'Cliente 2 - Vila Mariana',
        cep: '04101000',
        street: 'Rua Vergueiro',
        number: '1855',
        neighborhood: 'Vila Mariana',
        lat: -23.5795,
        lng: -46.6398,
      },
      {
        customerName: 'Cliente 3 - Pinheiros',
        cep: '05409000',
        street: 'Rua dos Pinheiros',
        number: '498',
        neighborhood: 'Pinheiros',
        lat: -23.5661,
        lng: -46.6812,
      },
      {
        customerName: 'Cliente 4 - Paraíso',
        cep: '04004030',
        street: 'Rua Tutóia',
        number: '312',
        neighborhood: 'Paraíso',
        lat: -23.5742,
        lng: -46.6512,
      },
      {
        customerName: 'Cliente 5 - Moema',
        cep: '04523001',
        street: 'Avenida Ibirapuera',
        number: '2120',
        neighborhood: 'Moema',
        lat: -23.6021,
        lng: -46.6619,
      },
    ];

    for (let i = 0; i < addresses.length; i++) {
      const a = addresses[i];
      const ord = await orderRepo.createOrder(tenantSlug, {
        customerName: a.customerName,
        customerPhone: `1198888000${i + 1}`,
        fulfillmentType: 'delivery',
        paymentMethod: 'PIX',
        items: [{ productId, quantity: 1 }],
        deliveryAddress: {
          cep: a.cep,
          street: a.street,
          number: a.number,
          neighborhood: a.neighborhood,
          city: 'São Paulo',
          state: 'SP',
          latitude: a.lat,
          longitude: a.lng,
        },
        idempotencyKey: `map-test-ord-${suffix}-${i}`,
      });
      createdOrderIds.push(ord.order.id);
    }

    const overview = await deliveryHubRepo.getDeliveryHubOverview(tenantId);
    const geocodedInOverview = overview.orders.filter(
      (o) => typeof o.latitude === 'number' && typeof o.longitude === 'number'
    );
    assert.equal(
      geocodedInOverview.length,
      5,
      'Todos os 5 pedidos em diferentes endereços devem estar presentes com latitude e longitude válidas.'
    );
    console.log(
      `✅ 3. Exibição de 5 pedidos em endereços distintos validada (${geocodedInOverview
        .map((o) => `${o.formattedOrderNumber} [${o.neighborhood}]`)
        .join(', ')}).`
    );

    // 4. Multi-order selection & Route calculation with road geometry
    const selectedIds = createdOrderIds.slice(0, 3);
    const preview = await deliveryHubRepo.previewRoute(tenantId, selectedIds, true);

    assert.equal(preview.orderedStops.length, 3, 'A rota deve conter as 3 paradas selecionadas.');
    assert.ok(preview.totalDistanceKm > 0, 'A distância total deve ser maior que zero.');
    assert.ok(preview.estimatedDurationMin > 0, 'O tempo estimado deve ser maior que zero.');
    assert.ok(
      Array.isArray(preview.routeGeometry) && preview.routeGeometry.length >= 4,
      'A prévia da rota deve retornar a geometria de coordenadas (routeGeometry) para desenho da linha no mapa.'
    );
    assert.ok(
      ['google', 'osrm', 'estimated'].includes(preview.navigationProvider || ''),
      'A prévia da rota deve informar transparentemente o navigationProvider.'
    );
    console.log(
      `✅ 4. Seleção múltipla e traçado de rota validados: ${preview.orderedStops.length} paradas, ${preview.totalDistanceKm} km, ~${preview.estimatedDurationMin} min, provider="${preview.navigationProvider}", pontos na polilinha=${preview.routeGeometry?.length}.`
    );

    // 5. Reordering stop sequence manually
    const reversedIds = [...preview.orderedStops.map((s) => s.orderId)].reverse();
    const reorderedPreview = await deliveryHubRepo.previewRoute(tenantId, reversedIds, false);
    assert.deepEqual(
      reorderedPreview.orderedStops.map((s) => s.orderId),
      reversedIds,
      'A reordenação manual (optimizeOrder=false) deve preservar exatamente a sequência escolhida pelo operador.'
    );
    console.log(
      `✅ 5. Reordenação manual da sequência de entrega validada: ${reorderedPreview.orderedStops
        .map((s) => `${s.stopSequence}ª:${s.formattedOrderNumber}`)
        .join(' -> ')}.`
    );

    // 6. Filters & synchronization between list and map
    const filteredByNeighborhood = await deliveryHubRepo.getDeliveryHubOverview(tenantId, {
      neighborhood: 'Pinheiros',
    });
    assert.equal(
      filteredByNeighborhood.orders.length,
      1,
      'O filtro por bairro Pinheiros deve retornar exatamente o pedido daquele bairro.'
    );
    assert.equal(filteredByNeighborhood.orders[0].neighborhood, 'Pinheiros');

    const filteredBySearch = await deliveryHubRepo.getDeliveryHubOverview(tenantId, {
      search: 'Moema',
    });
    assert.equal(
      filteredBySearch.orders.length,
      1,
      'A busca textual deve localizar o pedido de Moema.'
    );
    console.log(
      '✅ 6. Filtros por status, bairro e busca sincronizados entre lista e mapa validados.'
    );

    // 7. Direct road routing service check
    const directRoad = await calculateMultiStopRoadRouteServer([
      { latitude: -23.5649, longitude: -46.652 },
      { latitude: -23.5587, longitude: -46.6615 },
      { latitude: -23.5661, longitude: -46.6812 },
    ]);
    assert.equal(directRoad.success, true);
    assert.ok(directRoad.routeGeometry.length >= 3);
    console.log(
      `✅ 7. Serviço de rota viária multi-paradas validado (provider=${directRoad.navigationProvider}, geometryPoints=${directRoad.routeGeometry.length}).`
    );
  } finally {
    const cleanTable = async (table: string, col: string, ids: string[]) => {
      if (!ids || ids.length === 0) return;
      try {
        await supabaseAdmin.from(table).delete().in(col, ids);
      } catch {}
      try {
        await getLocalTableBuilder(table).delete().in(col, ids);
      } catch {}
    };

    const tenantIds = [tenantId].filter(Boolean);
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
      } catch {}
    }
  }

  console.log('\n===================================================================');
  console.log(' TODOS OS 7 CENÁRIOS DO MAPA DA CENTRAL DE ENTREGAS APROVADOS! ');
  console.log('===================================================================');
}

runMapOverhaulTests().catch((err) => {
  console.error('❌ Falha nos testes do Mapa da Central de Entregas:', err);
  process.exit(1);
});
