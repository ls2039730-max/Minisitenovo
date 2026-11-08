import 'dotenv/config';
import { bootstrapDatabaseIfNeeded } from '../server/db/bootstrap.js';
import { repo as saasRepo } from '../server/db/repository.js';
import { orderRepo } from '../server/db/orderRepository.js';
import { deliveryHubRepo } from '../server/db/deliveryHubRepository.js';
import { supabaseAdmin } from '../server/supabaseAdmin.js';

interface StepResult {
  step: number;
  title: string;
  passed: boolean;
  details: Record<string, any>;
}

async function runAudit() {
  await bootstrapDatabaseIfNeeded();
  const results: StepResult[] = [];
  const superAdmin = {
    id: 'audit-super-admin',
    name: 'Auditoria Técnica',
    email: 'audit@minihub.local',
    role: 'SUPER_ADMIN' as const,
    tenantId: null,
    status: 'active' as const,
    createdAt: new Date().toISOString(),
  };

  // Locate Mania de Costela and Una Ótica (or seed temporary test fixtures if running in isolated local store)
  let tenants = await saasRepo.getAllTenants(superAdmin);
  let mania = tenants.find(
    (t) =>
      t.slug.includes('mania-de-costela') ||
      t.name.toLowerCase().includes('mania de costela')
  );
  let unaOtica = tenants.find(
    (t) =>
      t.slug.includes('una-otica') ||
      t.name.toLowerCase().includes('una ótica') ||
      t.name.toLowerCase().includes('una otica')
  );

  let createdTempFixtures = false;
  const tempIds: {
    maniaId?: string;
    unaId?: string;
    orderIds: string[];
    routeId?: string;
  } = { orderIds: [] };

  if (!mania) {
    createdTempFixtures = true;
    const plans = await supabaseAdmin.from('plans').select('id').limit(1);
    const planId = plans.data?.[0]?.id || '00000000-0000-0000-0000-000000000001';
    const created = await saasRepo.createTenant(
      {
        name: 'Mania de Costela',
        slug: 'mania-de-costela-audit',
        segment: 'Restaurante',
        phone: '22999990001',
        whatsapp: '22999990001',
        email: 'maniadecostela@audit.local',
        ownerName: 'Gestor Mania',
        ownerEmail: 'gestor.mania@audit.local',
        ownerPhone: '22999990001',
        planId,
        status: 'ativo',
      },
      superAdmin
    );
    mania = await saasRepo.updateTenant(
      created.tenant.id,
      {
        cep: '28929519',
        street: 'Avenida Independência',
        number: '5019',
        complement: '',
        neighborhood: 'Centro',
        city: 'Rio das Ostras',
        state: 'RJ',
      },
      superAdmin
    );
    tempIds.maniaId = mania.id;
  }

  if (!unaOtica) {
    createdTempFixtures = true;
    const plans = await supabaseAdmin.from('plans').select('id').limit(1);
    const planId = plans.data?.[0]?.id || '00000000-0000-0000-0000-000000000001';
    const created = await saasRepo.createTenant(
      {
        name: 'Una Ótica',
        slug: 'una-otica-audit',
        segment: 'Ótica',
        phone: '22999990002',
        whatsapp: '22999990002',
        email: 'unaotica@audit.local',
        ownerName: 'Gestor Una',
        ownerEmail: 'gestor.una@audit.local',
        ownerPhone: '22999990002',
        planId,
        status: 'ativo',
      },
      superAdmin
    );
    unaOtica = await saasRepo.updateTenant(
      created.tenant.id,
      {
        cep: '28928506',
        street: 'Avenida Independência',
        number: '103',
        complement: 'Loja 2',
        neighborhood: 'Unamar',
        city: 'Cabo Frio',
        state: 'RJ',
      },
      superAdmin
    );
    await orderRepo.syncOriginAddressFromTenantProfile(unaOtica.id, {
      cep: '28928506',
      street: 'Avenida Independência',
      number: '103',
      complement: 'Loja 2',
      neighborhood: 'Unamar',
      city: 'Cabo Frio',
      state: 'RJ',
      latitude: -22.630984,
      longitude: -42.001668,
      geocodeStatus: 'manual',
      forceManualPinSave: true,
    });
    tempIds.unaId = unaOtica.id;
  }

  // Ensure Mania de Costela has customer orders and route RT-101 if running in local test store
  let existingOrders = await orderRepo.listOrders(mania.id, { limit: 10 });
  if (existingOrders.orders.length === 0) {
    const sampleCustomers = [
      {
        num: 1004,
        name: 'Cliente Teste 1',
        street: 'Rua das Pacas',
        number: '25',
        neighborhood: 'Aquarius (Tamoios)',
        city: 'Cabo Frio',
        state: 'RJ',
        cep: '28929520',
        lat: -22.617758,
        lng: -41.999982,
      },
      {
        num: 1003,
        name: 'Cliente Teste 2',
        street: 'Rua Orlando Bragança',
        number: '84',
        neighborhood: 'Unamar (Tamoios)',
        city: 'Cabo Frio',
        state: 'RJ',
        cep: '28928692',
        lat: -22.641023,
        lng: -42.009689,
      },
      {
        num: 1002,
        name: 'Cliente Teste 3',
        street: 'Avenida Independência',
        number: '120',
        neighborhood: 'Unamar',
        city: 'Cabo Frio',
        state: 'RJ',
        cep: '28928000',
        lat: -22.625836,
        lng: -42.003152,
      },
    ];
    for (const c of sampleCustomers) {
      const orderId = `00000000-0000-4000-8000-${String(c.num).padStart(12, '0')}`;
      tempIds.orderIds.push(orderId);
      await supabaseAdmin.from('orders').insert({
        id: orderId,
        tenant_id: mania.id,
        order_number: c.num,
        customer_name: c.name,
        customer_phone: '22999991111',
        fulfillment_type: 'delivery',
        status: 'ready',
        subtotal: 85,
        delivery_fee: 10,
        total: 95,
        payment_method_label: 'PIX',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await supabaseAdmin.from('order_delivery_addresses').insert({
        id: `00000000-0000-4000-9000-${String(c.num).padStart(12, '0')}`,
        order_id: orderId,
        tenant_id: mania.id,
        cep: c.cep,
        street: c.street,
        number: c.number,
        neighborhood: c.neighborhood,
        city: c.city,
        state: c.state,
        latitude: c.lat,
        longitude: c.lng,
        created_at: new Date().toISOString(),
      });
    }
    existingOrders = await orderRepo.listOrders(mania.id, { limit: 10 });
  }

  let existingRoutes = await deliveryHubRepo.listRoutes(mania.id);
  if (!existingRoutes.some((r) => r.routeCode === 'RT-101')) {
    const route = await deliveryHubRepo.createRoute(
      mania.id,
      {
        name: 'Rota Tamoios / Unamar',
        orderIds: existingOrders.orders.slice(0, 2).map((o) => o.id),
      },
      superAdmin
    );
    tempIds.routeId = route.id;
  }

  // Snapshot original state of Mania de Costela, delivery settings, orders, and routes so we restore cleanly at the end
  const originalTenant = await saasRepo.getTenantById(mania.id, superAdmin);
  const originalOrigin = await orderRepo.resolveTenantOriginAddress(mania.id);
  const { data: originalTenantSettingsRow } = await supabaseAdmin
    .from('tenant_settings')
    .select('theme_Settings')
    .eq('tenant_id', mania.id)
    .maybeSingle();
  const originalRoutes = await deliveryHubRepo.listRoutes(mania.id);
  const originalRt101 = originalRoutes.find((r) => r.routeCode === 'RT-101') || originalRoutes[0];
  const { data: originalRt101Row } = originalRt101
    ? await supabaseAdmin
        .from('delivery_routes')
        .select('*')
        .eq('id', originalRt101.id)
        .maybeSingle()
    : { data: null };

  // Snapshot customer orders for Mania de Costela
  const { orders: customerOrdersBefore } = await orderRepo.listOrders(mania.id, { limit: 10 });
  const customerOrderCoordsBefore = customerOrdersBefore.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    street: o.deliveryAddress?.street,
    number: o.deliveryAddress?.number,
    latitude: o.deliveryAddress?.latitude,
    longitude: o.deliveryAddress?.longitude,
  }));

  // Snapshot Una Ótica
  const unaOriginBefore = await orderRepo.resolveTenantOriginAddress(unaOtica.id);

  try {
    // Prepare initial state: set a manual pin on the old address first so Step 4 can prove that changing the address invalidates even a previous manual pin
    const initialPinLat = -22.521111;
    const initialPinLng = -41.942222;
    await orderRepo.syncOriginAddressFromTenantProfile(mania.id, {
      cep: originalOrigin?.cep || '28929519',
      street: originalOrigin?.street || 'Avenida Independência',
      number: originalOrigin?.number || '5019',
      complement: originalOrigin?.complement || '',
      neighborhood: originalOrigin?.neighborhood || 'Centro',
      city: originalOrigin?.city || 'Rio das Ostras',
      state: originalOrigin?.state || 'RJ',
      latitude: initialPinLat,
      longitude: initialPinLng,
      geocodeStatus: 'manual',
      forceManualPinSave: true,
    });

    const beforeChangeOrigin = await orderRepo.resolveTenantOriginAddress(mania.id);

    // =========================================================================
    // TESTE 1 & 2: Alterar o endereço em Minha Empresa e Salvar
    // =========================================================================
    const newAddressPayload = {
      cep: '28928-000',
      street: 'Avenida Independência',
      number: '5019',
      complement: 'Loja 1',
      neighborhood: 'Unamar (Tamoios)',
      city: 'Cabo Frio',
      state: 'RJ',
      // Simulate frontend sending stale coordinates when address text changes — backend must invalidate them!
      latitude: initialPinLat,
      longitude: initialPinLng,
      geocodeStatus: 'manual' as const,
      forceManualPinSave: false,
    };

    await saasRepo.updateTenant(
      mania.id,
      {
        cep: newAddressPayload.cep,
        street: newAddressPayload.street,
        number: newAddressPayload.number,
        complement: newAddressPayload.complement,
        neighborhood: newAddressPayload.neighborhood,
        city: newAddressPayload.city,
        state: newAddressPayload.state,
      },
      superAdmin
    );

    const syncedAfterAddressChange = await orderRepo.syncOriginAddressFromTenantProfile(
      mania.id,
      newAddressPayload
    );

    results.push({
      step: 1,
      title: '1. Alterar o endereço em Minha Empresa',
      passed:
        syncedAfterAddressChange?.city === 'Cabo Frio' &&
        syncedAfterAddressChange?.neighborhood === 'Unamar (Tamoios)' &&
        syncedAfterAddressChange?.cep === '28928000',
      details: {
        oldAddress: `${beforeChangeOrigin?.street}, ${beforeChangeOrigin?.number} - ${beforeChangeOrigin?.neighborhood}, ${beforeChangeOrigin?.city}/${beforeChangeOrigin?.state} (${beforeChangeOrigin?.cep})`,
        newAddress: `${syncedAfterAddressChange?.street}, ${syncedAfterAddressChange?.number} - ${syncedAfterAddressChange?.neighborhood}, ${syncedAfterAddressChange?.city}/${syncedAfterAddressChange?.state} (${syncedAfterAddressChange?.cep})`,
      },
    });

    const savedTenantInDb = await saasRepo.getTenantById(mania.id, superAdmin);
    results.push({
      step: 2,
      title: '2. Salvar em public.tenants',
      passed:
        savedTenantInDb?.city === 'Cabo Frio' &&
        savedTenantInDb?.neighborhood === 'Unamar (Tamoios)' &&
        (savedTenantInDb?.cep || '').replace(/\D/g, '') === '28928000',
      details: {
        tenantsTableCity: savedTenantInDb?.city,
        tenantsTableNeighborhood: savedTenantInDb?.neighborhood,
        tenantsTableCep: savedTenantInDb?.cep,
      },
    });

    // =========================================================================
    // TESTE 3: Verificar se o endereço foi atualizado em Configurações de Entrega
    // =========================================================================
    const deliverySettings = await orderRepo.getDeliverySettings(mania.id);
    const settingsOrigin = deliverySettings.originAddress;
    results.push({
      step: 3,
      title: '3. Verificar se o endereço foi atualizado em Configurações de Entrega',
      passed:
        settingsOrigin?.city === 'Cabo Frio' &&
        settingsOrigin?.neighborhood === 'Unamar (Tamoios)' &&
        settingsOrigin?.cep === '28928000' &&
        settingsOrigin?.street === 'Avenida Independência',
      details: {
        deliverySettingsOrigin: {
          street: settingsOrigin?.street,
          number: settingsOrigin?.number,
          neighborhood: settingsOrigin?.neighborhood,
          city: settingsOrigin?.city,
          state: settingsOrigin?.state,
          cep: settingsOrigin?.cep,
        },
      },
    });

    // =========================================================================
    // TESTE 4: Confirmar que o pino antigo foi invalidado
    // =========================================================================
    const oldPinInvalidated =
      syncedAfterAddressChange?.latitude !== initialPinLat &&
      syncedAfterAddressChange?.longitude !== initialPinLng &&
      syncedAfterAddressChange?.geocodeStatus !== 'manual';

    results.push({
      step: 4,
      title: '4. Confirmar que o pino antigo foi invalidado após mudança de endereço',
      passed: oldPinInvalidated,
      details: {
        previousManualPin: { lat: initialPinLat, lng: initialPinLng, status: 'manual' },
        afterAddressEdit: {
          lat: syncedAfterAddressChange?.latitude,
          lng: syncedAfterAddressChange?.longitude,
          status: syncedAfterAddressChange?.geocodeStatus,
          precision: syncedAfterAddressChange?.geocodePrecision,
        },
      },
    });

    // =========================================================================
    // TESTE 5: Executar nova geocodificação ("Atualizar localização no mapa")
    // =========================================================================
    const refreshedGeoOrigin = await orderRepo.syncOriginAddressFromTenantProfile(mania.id, {
      cep: '28928000',
      street: 'Avenida Independência',
      number: '5019',
      complement: 'Loja 1',
      neighborhood: 'Unamar (Tamoios)',
      city: 'Cabo Frio',
      state: 'RJ',
      forceGeocodeRefresh: true,
    });

    const validNewGeo =
      typeof refreshedGeoOrigin?.latitude === 'number' &&
      typeof refreshedGeoOrigin?.longitude === 'number' &&
      refreshedGeoOrigin.latitude !== initialPinLat;

    results.push({
      step: 5,
      title: '5. Executar nova geocodificação ignorando cache anterior',
      passed: validNewGeo,
      details: {
        geocodedLatitude: refreshedGeoOrigin?.latitude,
        geocodedLongitude: refreshedGeoOrigin?.longitude,
        geocodeStatus: refreshedGeoOrigin?.geocodeStatus,
        geocodePrecision: refreshedGeoOrigin?.geocodePrecision,
        isApproximate: refreshedGeoOrigin?.isApproximate,
        formattedAddress: refreshedGeoOrigin?.formattedAddress,
        geocodedAt: refreshedGeoOrigin?.geocodedAt,
      },
    });

    // =========================================================================
    // TESTE 6: Ajustar manualmente o pino no mapa
    // =========================================================================
    const chosenManualLat = -22.63485;
    const chosenManualLng = -42.00812;

    const manualSavedOrigin = await orderRepo.syncOriginAddressFromTenantProfile(mania.id, {
      cep: '28928000',
      street: 'Avenida Independência',
      number: '5019',
      complement: 'Loja 1',
      neighborhood: 'Unamar (Tamoios)',
      city: 'Cabo Frio',
      state: 'RJ',
      latitude: chosenManualLat,
      longitude: chosenManualLng,
      geocodeStatus: 'manual',
      forceManualPinSave: true,
    });

    const routeSyncResult = await deliveryHubRepo.syncActiveRoutesWithCompanyOrigin(
      mania.id,
      manualSavedOrigin,
      superAdmin
    );

    results.push({
      step: 6,
      title: '6. Ajustar manualmente o pino no mapa e confirmar ponto exato',
      passed:
        manualSavedOrigin?.latitude === chosenManualLat &&
        manualSavedOrigin?.longitude === chosenManualLng &&
        manualSavedOrigin?.geocodeStatus === 'manual' &&
        manualSavedOrigin?.isApproximate === false,
      details: {
        manualLatitude: manualSavedOrigin?.latitude,
        manualLongitude: manualSavedOrigin?.longitude,
        geocodeStatus: manualSavedOrigin?.geocodeStatus,
        geocodePrecision: manualSavedOrigin?.geocodePrecision,
        geocodedAt: manualSavedOrigin?.geocodedAt,
        activeRoutesRecalculated: routeSyncResult.updatedRoutesCount,
      },
    });

    // =========================================================================
    // TESTE 7 & 8: Salvar, recarregar e confirmar persistência do pino manual
    // =========================================================================
    const reloadedOrigin = await orderRepo.resolveTenantOriginAddress(mania.id);
    const reloadedSettings = await orderRepo.getDeliverySettings(mania.id);

    const pinPersistedOnReload =
      reloadedOrigin?.latitude === chosenManualLat &&
      reloadedOrigin?.longitude === chosenManualLng &&
      reloadedOrigin?.geocodeStatus === 'manual' &&
      reloadedSettings.originAddress?.latitude === chosenManualLat &&
      reloadedSettings.originAddress?.longitude === chosenManualLng;

    results.push({
      step: 7,
      title: '7. Salvar e recarregar os dados de Minha Empresa e Configurações de Entrega',
      passed: pinPersistedOnReload,
      details: {
        reloadedMinhaEmpresa: {
          lat: reloadedOrigin?.latitude,
          lng: reloadedOrigin?.longitude,
          status: reloadedOrigin?.geocodeStatus,
          geocodedAt: reloadedOrigin?.geocodedAt,
        },
        reloadedDeliverySettings: {
          lat: reloadedSettings.originAddress?.latitude,
          lng: reloadedSettings.originAddress?.longitude,
          status: reloadedSettings.originAddress?.geocodeStatus,
        },
      },
    });

    results.push({
      step: 8,
      title: '8. Confirmar que o pino permanece no ponto escolhido após recarregar',
      passed:
        reloadedOrigin?.latitude === chosenManualLat &&
        reloadedOrigin?.longitude === chosenManualLng &&
        reloadedOrigin?.geocodeStatus === 'manual',
      details: {
        expected: { lat: chosenManualLat, lng: chosenManualLng, status: 'manual' },
        actual: {
          lat: reloadedOrigin?.latitude,
          lng: reloadedOrigin?.longitude,
          status: reloadedOrigin?.geocodeStatus,
          addressFingerprint: reloadedOrigin?.addressFingerprint,
        },
      },
    });

    // =========================================================================
    // TESTE 9 & 10: Abrir Central de Entregas e conferir origem da rota RT-101
    // =========================================================================
    const hubOverview = await deliveryHubRepo.getDeliveryHubOverview(mania.id);
    const hubRoutes = await deliveryHubRepo.listRoutes(mania.id);
    const rt101After = hubRoutes.find((r) => r.routeCode === 'RT-101') || hubRoutes[0];

    const hubOriginMatches =
      hubOverview.originAddress?.latitude === chosenManualLat &&
      hubOverview.originAddress?.longitude === chosenManualLng;

    const rt101OriginMatches =
      rt101After?.originAddress?.latitude === chosenManualLat &&
      rt101After?.originAddress?.longitude === chosenManualLng;

    results.push({
      step: 9,
      title: '9. Abrir Central de Entregas e verificar origem no Mapa Operacional',
      passed: hubOriginMatches,
      details: {
        operationalMapOrigin: hubOverview.originAddress,
      },
    });

    results.push({
      step: 10,
      title: '10. Conferir que a origem da rota RT-101 utiliza a nova coordenada da empresa',
      passed: Boolean(rt101OriginMatches),
      details: {
        routeCode: rt101After?.routeCode,
        routeOrigin: rt101After?.originAddress,
        routeTotalDistanceKm: rt101After?.totalDistanceKm,
        routeTotalDurationMinutes: rt101After?.estimatedDurationMin,
        stopsCount: rt101After?.stops?.length,
        driverId: rt101After?.driverId,
      },
    });

    // =========================================================================
    // TESTE 11: Verificar que as coordenadas dos clientes permaneceram intactas
    // =========================================================================
    const { orders: customerOrdersAfter } = await orderRepo.listOrders(mania.id, { limit: 10 });
    const customerCoordsIntact = customerOrderCoordsBefore.every((beforeOrder) => {
      const afterOrder = customerOrdersAfter.find((o) => o.id === beforeOrder.id);
      return (
        afterOrder &&
        afterOrder.deliveryAddress?.latitude === beforeOrder.latitude &&
        afterOrder.deliveryAddress?.longitude === beforeOrder.longitude &&
        afterOrder.deliveryAddress?.street === beforeOrder.street
      );
    });

    // Also verify RT-101 stops preserved customer coordinates and order sequence
    const stopsPreserved =
      !originalRt101 ||
      originalRt101.stops.every((origStop, idx) => {
        const afterStop = rt101After?.stops[idx];
        return (
          afterStop &&
          afterStop.orderId === origStop.orderId &&
          afterStop.stopSequence === origStop.stopSequence &&
          afterStop.latitude === origStop.latitude &&
          afterStop.longitude === origStop.longitude
        );
      });

    results.push({
      step: 11,
      title: '11. Verificar que as coordenadas dos clientes e paradas permaneceram intactas',
      passed: customerCoordsIntact && stopsPreserved,
      details: {
        ordersChecked: customerOrderCoordsBefore.length,
        customerCoordsIntact,
        routeStopsSequenceAndCoordsPreserved: stopsPreserved,
        sampleOrders: customerOrderCoordsBefore.slice(0, 3),
      },
    });

    // =========================================================================
    // TESTE 12: Testar com outro tenant (Una Ótica) para garantir isolamento
    // =========================================================================
    const unaOriginAfter = await orderRepo.resolveTenantOriginAddress(unaOtica.id);
    const unaHubOverview = await deliveryHubRepo.getDeliveryHubOverview(unaOtica.id);

    const tenantIsolated =
      unaOriginAfter?.latitude === unaOriginBefore?.latitude &&
      unaOriginAfter?.longitude === unaOriginBefore?.longitude &&
      unaOriginAfter?.latitude !== chosenManualLat &&
      unaHubOverview.originAddress?.latitude === unaOriginBefore?.latitude;

    results.push({
      step: 12,
      title: '12. Testar com outro tenant (Una Ótica) para garantir isolamento multi-tenant',
      passed: tenantIsolated,
      details: {
        unaOticaBefore: {
          street: unaOriginBefore?.street,
          number: unaOriginBefore?.number,
          city: unaOriginBefore?.city,
          lat: unaOriginBefore?.latitude,
          lng: unaOriginBefore?.longitude,
        },
        unaOticaAfter: {
          street: unaOriginAfter?.street,
          number: unaOriginAfter?.number,
          city: unaOriginAfter?.city,
          lat: unaOriginAfter?.latitude,
          lng: unaOriginAfter?.longitude,
        },
        maniaDeCostelaTestPin: {
          lat: chosenManualLat,
          lng: chosenManualLng,
        },
      },
    });
  } finally {
    if (createdTempFixtures) {
      if (tempIds.routeId) {
        await supabaseAdmin.from('delivery_route_stops').delete().eq('route_id', tempIds.routeId);
        await supabaseAdmin.from('delivery_routes').delete().eq('id', tempIds.routeId);
      }
      for (const oid of tempIds.orderIds) {
        await supabaseAdmin.from('order_delivery_addresses').delete().eq('order_id', oid);
        await supabaseAdmin.from('orders').delete().eq('id', oid);
      }
      if (tempIds.maniaId) {
        await supabaseAdmin.from('tenant_settings').delete().eq('tenant_id', tempIds.maniaId);
        await supabaseAdmin.from('tenants').delete().eq('id', tempIds.maniaId);
      }
      if (tempIds.unaId) {
        await supabaseAdmin.from('tenant_settings').delete().eq('tenant_id', tempIds.unaId);
        await supabaseAdmin.from('tenants').delete().eq('id', tempIds.unaId);
      }
    } else {
      // Restore original Mania de Costela state so production/homologation data is never altered without user authorization
      if (originalTenant) {
        await saasRepo.updateTenant(
          mania.id,
          {
            cep: originalTenant.cep || '',
            street: originalTenant.street || '',
            number: originalTenant.number || '',
            complement: originalTenant.complement || '',
            neighborhood: originalTenant.neighborhood || '',
            city: originalTenant.city || '',
            state: originalTenant.state || '',
          },
          superAdmin
        );
      }
      if (originalTenantSettingsRow?.theme_Settings) {
        await supabaseAdmin
          .from('tenant_settings')
          .update({ theme_Settings: originalTenantSettingsRow.theme_Settings })
          .eq('tenant_id', mania.id);
      }
      if (originalRt101Row) {
        await supabaseAdmin
          .from('delivery_routes')
          .update({
            origin_address: originalRt101Row.origin_address,
            total_distance_km: originalRt101Row.total_distance_km,
            total_duration_minutes: originalRt101Row.total_duration_minutes,
            geometry_json: originalRt101Row.geometry_json,
          })
          .eq('id', originalRt101Row.id);
      }
    }
  }

  console.log('\n====================================================================');
  console.log('RELATÓRIO DE AUDITORIA — 12 TESTES OBRIGATÓRIOS DE SINCRONIZAÇÃO');
  console.log('====================================================================');
  for (const r of results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.title}`);
    console.log(JSON.stringify(r.details, null, 2));
  }

  const allPassed = results.every((r) => r.passed);
  console.log(`\nRESULTADO FINAL: ${results.filter((r) => r.passed).length}/${results.length} APROVADOS`);
  if (!allPassed) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Erro na auditoria:', err);
  process.exit(1);
});
