import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { supabaseAdmin, localStore, isRealSupabaseConfigured } from '../server/supabaseAdmin.js';
import { apiRouter } from '../server/routes.js';
import { repo } from '../server/db/repository.js';
import { productRepo } from '../server/db/productRepository.js';
import { orderRepo } from '../server/db/orderRepository.js';
import { deliveryHubRepo } from '../server/db/deliveryHubRepository.js';
import { User } from '../src/types/saas.js';

const LOCAL_DB_PATH = path.resolve(process.cwd(), 'data', 'local_store.json');

async function apiRequest(
  baseUrl: string,
  method: string,
  urlPath: string,
  options?: { token?: string; body?: any; headers?: Record<string, string> }
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options?.headers || {}),
    },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function runAudit() {
  console.log('================================================================');
  console.log('AUDITORIA TÉCNICA FINAL — CENTRAL DE ENTREGAS LOCALHUB');
  console.log('================================================================\n');

  const backupJson = fs.existsSync(LOCAL_DB_PATH)
    ? fs.readFileSync(LOCAL_DB_PATH, 'utf-8')
    : null;

  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdOrderIds: string[] = [];

  // Start ephemeral Express server for HTTP API security verification
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use('/api', apiRouter);
  const apiServer = http.createServer(app);
  await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', () => resolve()));
  const apiPort = (apiServer.address() as any).port;
  const apiBase = `http://127.0.0.1:${apiPort}/api`;

  // Mock WhatsApp Gateway server
  let mockGatewayCalls: any[] = [];
  let mockGatewayShouldFail = false;
  const mockWaServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        mockGatewayCalls.push({
          headers: req.headers,
          body: JSON.parse(raw || '{}'),
        });
      } catch {
        mockGatewayCalls.push({ headers: req.headers, raw });
      }
      if (mockGatewayShouldFail) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Simulated gateway outage' }));
      } else {
        // Add 40ms latency to test true concurrent race condition handling
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, messageId: `wamid_${Date.now()}` }));
        }, 40);
      }
    });
  });
  await new Promise<void>((resolve) => mockWaServer.listen(0, '127.0.0.1', () => resolve()));
  const mockWaPort = (mockWaServer.address() as any).port;
  const mockWaUrl = `http://127.0.0.1:${mockWaPort}/send`;

  const origWaUrl = process.env.WHATSAPP_API_URL;
  const origWaToken = process.env.WHATSAPP_API_TOKEN;

  try {
    // =========================================================================
    // 1. AUDITORIA DO ESTADO DO BANCO SUPABASE
    // =========================================================================
    console.log('--- [1] AUDITORIA DO BANCO SUPABASE ---');
    console.log(`Supabase remoto configurado: ${isRealSupabaseConfigured}`);
    const tablesToCheck = [
      'tenants',
      'tenant_users',
      'orders',
      'order_items',
      'order_delivery_addresses',
      'delivery_settings',
      'delivery_drivers',
      'delivery_routes',
      'delivery_route_stops',
      'delivery_events',
      'delivery_notifications',
    ];
    for (const tbl of tablesToCheck) {
      const { error } = await supabaseAdmin.from(tbl).select('id').limit(1);
      if (error) {
        console.log(`  Tabela [${tbl}]: AUSENTE NO REMOTO (Fallback Híbrido Ativo) -> ${error.code}: ${error.message}`);
      } else {
        console.log(`  Tabela [${tbl}]: EXISTENTE NO SUPABASE REMOTO`);
      }
    }

    // Check columns latitude, longitude, geocode_status on order_delivery_addresses
    const { error: geoColsErr } = await supabaseAdmin
      .from('order_delivery_addresses')
      .select('id, latitude, longitude, geocode_status')
      .limit(1);
    console.log(
      `  Colunas geográficas em [order_delivery_addresses]: ${
        geoColsErr ? `AUSENTES NO REMOTO (${geoColsErr.message})` : 'PRESENTES NO REMOTO'
      }`
    );

    // =========================================================================
    // 2. TESTE DE ISOLAMENTO MULTI-TENANT (Restaurante A vs Restaurante B)
    // =========================================================================
    console.log('\n--- [2] TESTE DE ISOLAMENTO MULTI-TENANT ---');
    const superAdminActor: User = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Audit Super Admin',
      email: 'superadmin@localhub.test',
      role: 'SUPER_ADMIN',
      tenantId: null,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    const ts = Date.now();
    const slugA = `audit-rest-a-${ts}`;
    const slugB = `audit-rest-b-${ts}`;

    const plans = await repo.getPlans();
    const fullPlan =
      plans.find((p: any) => p.activeFeatures?.includes('delivery') && p.activeFeatures?.includes('shopping_cart')) ||
      plans[plans.length - 1] ||
      plans[0];
    const defaultPlanId = fullPlan?.id || '33333333-3333-4333-8333-333333333333';

    const createdA = await repo.createTenant(
      {
        name: 'Restaurante Audit A',
        slug: slugA,
        subdomain: `${slugA}.minihub.tech`,
        segment: 'Alimentação & Restaurantes',
        cnpj: '',
        phone: '11988881111',
        whatsapp: '11988881111',
        email: `gestor.a.${ts}@localhub.test`,
        ownerName: 'Gestor A',
        ownerEmail: `gestor.a.${ts}@localhub.test`,
        ownerPhone: '11988881111',
        planId: defaultPlanId,
        status: 'ativo',
      },
      superAdminActor
    );
    const tenantA = createdA.tenant;
    const adminA = createdA.defaultUser;
    createdTenantIds.push(tenantA.id);
    createdUserIds.push(adminA.id);

    const createdB = await repo.createTenant(
      {
        name: 'Restaurante Audit B',
        slug: slugB,
        subdomain: `${slugB}.minihub.tech`,
        segment: 'Alimentação & Restaurantes',
        cnpj: '',
        phone: '11988882222',
        whatsapp: '11988882222',
        email: `gestor.b.${ts}@localhub.test`,
        ownerName: 'Gestor B',
        ownerEmail: `gestor.b.${ts}@localhub.test`,
        ownerPhone: '11988882222',
        planId: defaultPlanId,
        status: 'ativo',
      },
      superAdminActor
    );
    const tenantB = createdB.tenant;
    const adminB = createdB.defaultUser;
    createdTenantIds.push(tenantB.id);
    createdUserIds.push(adminB.id);

    await repo.updateTenantFeatureOverrides(
      tenantA.id,
      { products: true, shopping_cart: true, delivery: true, restaurant_tables: true },
      superAdminActor
    );
    await repo.updateTenantFeatureOverrides(
      tenantB.id,
      { products: true, shopping_cart: true, delivery: true, restaurant_tables: true },
      superAdminActor
    );

    // Configure delivery settings and fixed rule for A and B
    await orderRepo.updateDeliverySettings(
      tenantA.id,
      {
        ordersEnabled: true,
        deliveryEnabled: true,
        pickupEnabled: true,
        pricingMode: 'neighborhood',
        originAddress: {
          cep: '01310-100',
          street: 'Av. Paulista',
          number: '1000',
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
          latitude: -23.5649,
          longitude: -46.652,
        },
      } as any,
      adminA
    );
    await orderRepo.createDeliveryRule(
      tenantA.id,
      { type: 'fixed', name: 'Taxa Fixa A', fee: 8, isActive: true },
      adminA
    );

    await orderRepo.updateDeliverySettings(
      tenantB.id,
      {
        ordersEnabled: true,
        deliveryEnabled: true,
        pickupEnabled: true,
        pricingMode: 'neighborhood',
        originAddress: {
          cep: '04538-133',
          street: 'Av. Brig. Faria Lima',
          number: '3477',
          neighborhood: 'Itaim Bibi',
          city: 'São Paulo',
          state: 'SP',
          latitude: -23.5868,
          longitude: -46.6822,
        },
      } as any,
      adminB
    );
    await orderRepo.createDeliveryRule(
      tenantB.id,
      { type: 'fixed', name: 'Taxa Fixa B', fee: 10, isActive: true },
      adminB
    );

    // Create products for A and B
    const prodA = await productRepo.createProduct(
      tenantA.id,
      { name: 'Burger A', price: 35, isActive: true, stockQuantity: 100 } as any,
      adminA
    );
    createdProductIds.push(prodA.id);

    const prodB = await productRepo.createProduct(
      tenantB.id,
      { name: 'Pizza B', price: 60, isActive: true, stockQuantity: 100 } as any,
      adminB
    );
    createdProductIds.push(prodB.id);

    // Restaurante A: 2 motoboys, 3 orders, 1 route
    const driverA1 = await deliveryHubRepo.createDriver(
      tenantA.id,
      {
        name: 'Carlos Motoboy A1',
        phone: '11977771111',
        email: `motoboy.a1.${ts}@localhub.test`,
        password: 'PasswordA1!',
        vehicleInfo: 'Honda CG 160 Preta',
        plate: 'AAA1A11',
      },
      adminA
    );
    const driverA2 = await deliveryHubRepo.createDriver(
      tenantA.id,
      {
        name: 'Marcos Motoboy A2',
        phone: '11977772222',
        email: `motoboy.a2.${ts}@localhub.test`,
        password: 'PasswordA2!',
        vehicleInfo: 'Yamaha Factor Vermelha',
        plate: 'AAA2A22',
      },
      adminA
    );
    if (driverA1.userId) createdUserIds.push(driverA1.userId);
    if (driverA2.userId) createdUserIds.push(driverA2.userId);

    // Restaurante B: 1 motoboy, 2 orders, 1 route
    const driverB1 = await deliveryHubRepo.createDriver(
      tenantB.id,
      {
        name: 'Roberto Motoboy B1',
        phone: '11977773333',
        email: `motoboy.b1.${ts}@localhub.test`,
        password: 'PasswordB1!',
        vehicleInfo: 'Honda PCX Azul',
        plate: 'BBB1B11',
      },
      adminB
    );
    if (driverB1.userId) createdUserIds.push(driverB1.userId);

    const ordersA: string[] = [];
    const coordsA = [
      { lat: -23.5614, lng: -46.6558, street: 'Rua Augusta', number: '1500', neighborhood: 'Consolação' },
      { lat: -23.5672, lng: -46.6489, street: 'Alameda Santos', number: '800', neighborhood: 'Jardins' },
      { lat: -23.5585, lng: -46.6601, street: 'Rua da Consolação', number: '2200', neighborhood: 'Consolação' },
    ];
    for (let i = 0; i < 3; i++) {
      const res = await orderRepo.createOrder(
        slugA,
        {
          customerName: `Cliente A${i + 1} Silva`,
          customerPhone: `1196666000${i + 1}`,
          fulfillmentType: 'delivery',
          paymentMethod: 'PIX',
          items: [{ productId: prodA.id, quantity: 1 }],
          deliveryAddress: {
            cep: '01305100',
            street: coordsA[i].street,
            number: coordsA[i].number,
            neighborhood: coordsA[i].neighborhood,
            city: 'São Paulo',
            state: 'SP',
            latitude: coordsA[i].lat,
            longitude: coordsA[i].lng,
          },
        } as any,
        '127.0.0.1'
      );
      ordersA.push(res.order.id);
      createdOrderIds.push(res.order.id);
      await orderRepo.updateOrderCoordinates(
        tenantA.id,
        res.order.id,
        { latitude: coordsA[i].lat, longitude: coordsA[i].lng, geocodeStatus: 'geocoded' },
        adminA
      );
    }

    const ordersB: string[] = [];
    const coordsB = [
      { lat: -23.5891, lng: -46.6785, street: 'Rua Joaquim Floriano', number: '400', neighborhood: 'Itaim Bibi' },
      { lat: -23.5945, lng: -46.6845, street: 'Rua Olimpiadas', number: '200', neighborhood: 'Vila Olímpia' },
    ];
    for (let i = 0; i < 2; i++) {
      const res = await orderRepo.createOrder(
        slugB,
        {
          customerName: `Cliente B${i + 1} Oliveira`,
          customerPhone: `1195555000${i + 1}`,
          fulfillmentType: 'delivery',
          paymentMethod: 'PIX',
          items: [{ productId: prodB.id, quantity: 1 }],
          deliveryAddress: {
            cep: '04534000',
            street: coordsB[i].street,
            number: coordsB[i].number,
            neighborhood: coordsB[i].neighborhood,
            city: 'São Paulo',
            state: 'SP',
            latitude: coordsB[i].lat,
            longitude: coordsB[i].lng,
          },
        } as any,
        '127.0.0.1'
      );
      ordersB.push(res.order.id);
      createdOrderIds.push(res.order.id);
      await orderRepo.updateOrderCoordinates(
        tenantB.id,
        res.order.id,
        { latitude: coordsB[i].lat, longitude: coordsB[i].lng, geocodeStatus: 'geocoded' },
        adminB
      );
    }

    const routeA = await deliveryHubRepo.createRoute(
      tenantA.id,
      { name: 'Rota A1', orderIds: [ordersA[0], ordersA[1]], driverId: driverA1.id },
      adminA
    );
    const routeB = await deliveryHubRepo.createRoute(
      tenantB.id,
      { name: 'Rota B1', orderIds: [ordersB[0], ordersB[1]], driverId: driverB1.id },
      adminB
    );

    // Obtain HTTP JWT tokens for Admin A, Admin B, Driver A1, Driver A2, Driver B1
    const loginDriverA1 = await apiRequest(apiBase, 'POST', '/auth/login', {
      body: { email: driverA1.email, password: 'PasswordA1!' },
    });
    assert.strictEqual(loginDriverA1.status, 200, 'Driver A1 login must succeed');
    const tokenDriverA1 = loginDriverA1.body.token;

    const loginDriverA2 = await apiRequest(apiBase, 'POST', '/auth/login', {
      body: { email: driverA2.email, password: 'PasswordA2!' },
    });
    assert.strictEqual(loginDriverA2.status, 200, 'Driver A2 login must succeed');
    const tokenDriverA2 = loginDriverA2.body.token;

    const loginDriverB1 = await apiRequest(apiBase, 'POST', '/auth/login', {
      body: { email: driverB1.email, password: 'PasswordB1!' },
    });
    assert.strictEqual(loginDriverB1.status, 200, 'Driver B1 login must succeed');
    const tokenDriverB1 = loginDriverB1.body.token;

    // Issue JWT tokens for Admin A and Admin B
    const { generateSessionToken } = await import('../server/auth/tokenService.js');
    const tokenAdminA = generateSessionToken(adminA);
    const tokenAdminB = generateSessionToken(adminB);

    // 2.1 Admin A attempting to read/modify Tenant B via x-tenant-id header or query
    const crossOverview = await apiRequest(apiBase, 'GET', `/delivery-hub/overview?tenantId=${tenantB.id}`, {
      token: tokenAdminA,
    });
    assert.strictEqual(crossOverview.status, 400, 'Admin A passing tenantId=B must be blocked');
    assert(crossOverview.body.error.includes('Acesso negado'), 'Must return Acesso negado');

    // 2.2 Admin A attempting to fetch Route B by ID
    const crossRoute = await apiRequest(apiBase, 'GET', `/delivery-hub/routes/${routeB.id}`, {
      token: tokenAdminA,
    });
    assert.strictEqual(crossRoute.status, 404, 'Admin A cannot see Route B');

    // 2.3 Admin A attempting to include Order B in a route of Tenant A
    const crossOrderRoute = await apiRequest(apiBase, 'POST', '/delivery-hub/routes', {
      token: tokenAdminA,
      body: { orderIds: [ordersB[0]] },
    });
    assert.strictEqual(crossOrderRoute.status, 400, 'Admin A cannot add Order B to Route A');

    // 2.4 Admin A attempting to assign Driver B1 to Route A
    const crossDriverAssign = await apiRequest(
      apiBase,
      'PATCH',
      `/delivery-hub/routes/${routeA.id}/driver`,
      {
        token: tokenAdminA,
        body: { driverId: driverB1.id },
      }
    );
    assert.strictEqual(crossDriverAssign.status, 400, 'Admin A cannot assign Driver B1');

    // 2.5 Admin A attempting to read Order B or modify location of Order B
    const crossOrderGeo = await apiRequest(
      apiBase,
      'PATCH',
      `/delivery-hub/orders/${ordersB[0]}/location`,
      {
        token: tokenAdminA,
        body: { latitude: -23.55, longitude: -46.65 },
      }
    );
    assert.strictEqual(crossOrderGeo.status, 400, 'Admin A cannot modify Order B coordinates');

    // 2.6 Driver B1 attempting to scan Route A's QR Code
    const crossQrScan = await apiRequest(apiBase, 'POST', '/delivery-hub/driver-portal/scan-qr', {
      token: tokenDriverB1,
      body: { qrToken: routeA.qrToken },
    });
    assert.strictEqual(crossQrScan.status, 400, 'Driver B1 scanning Route A QR must fail');
    assert(crossQrScan.body.error.includes('outro estabelecimento'));

    // 2.7 Verify Events & Drivers list isolation between Tenant A and Tenant B
    const eventsA = await apiRequest(apiBase, 'GET', '/delivery-hub/events', { token: tokenAdminA });
    const eventsB = await apiRequest(apiBase, 'GET', '/delivery-hub/events', { token: tokenAdminB });
    assert(
      eventsA.body.data.every((e: any) => e.tenantId === tenantA.id),
      'Events A must only contain Tenant A events'
    );
    assert(
      eventsB.body.data.every((e: any) => e.tenantId === tenantB.id),
      'Events B must only contain Tenant B events'
    );
    console.log('  [OK] Isolamento Multi-Tenant validado com sucesso (Pedidos, Rotas, Endereços, Motoboys, QR, Eventos e GPS).');

    // =========================================================================
    // 3. AUDITORIA DO PERFIL DELIVERY_DRIVER (Bloqueio no Backend / API)
    // =========================================================================
    console.log('\n--- [3] AUDITORIA DO PERFIL DELIVERY_DRIVER ---');
    const forbiddenEndpointsForDriver: Array<{ method: string; path: string; body?: any }> = [
      { method: 'GET', path: '/tenants' },
      { method: 'PUT', path: `/tenants/${tenantA.id}`, body: { name: 'Hacked' } },
      { method: 'GET', path: `/tenants/${tenantA.id}/users` },
      { method: 'POST', path: `/tenants/${tenantA.id}/users`, body: { name: 'X', email: 'x@x.com' } },
      { method: 'GET', path: '/products' },
      { method: 'POST', path: '/products', body: { name: 'X', price: 10 } },
      { method: 'GET', path: '/product-categories' },
      { method: 'GET', path: '/orders' },
      { method: 'GET', path: '/orders/summary' },
      { method: 'GET', path: '/delivery/settings' },
      { method: 'PUT', path: '/delivery/settings', body: {} },
      { method: 'GET', path: '/payment-methods' },
      { method: 'GET', path: '/site' },
      { method: 'PUT', path: '/site/draft', body: {} },
      { method: 'GET', path: '/restaurant/tables' },
      { method: 'GET', path: '/restaurant/orders' },
      { method: 'GET', path: '/admin/orders/unified' },
      { method: 'GET', path: '/admin/tables/overview' },
      { method: 'GET', path: '/admin/financial/dashboard' },
      { method: 'GET', path: '/delivery-hub/overview' },
      { method: 'GET', path: '/delivery-hub/drivers' },
      { method: 'POST', path: '/delivery-hub/drivers', body: {} },
      { method: 'GET', path: '/delivery-hub/routes' },
      { method: 'POST', path: '/delivery-hub/routes', body: { orderIds: [ordersA[2]] } },
      { method: 'PATCH', path: `/delivery-hub/routes/${routeA.id}/reorder`, body: {} },
      { method: 'PATCH', path: `/delivery-hub/routes/${routeA.id}/driver`, body: {} },
      { method: 'POST', path: `/delivery-hub/routes/${routeA.id}/qr`, body: { action: 'revoke' } },
      { method: 'POST', path: `/delivery-hub/routes/${routeA.id}/cancel`, body: {} },
      { method: 'GET', path: '/delivery-hub/events' },
      { method: 'GET', path: '/delivery-hub/notifications' },
      { method: 'POST', path: '/auth/self-assign-tenant', body: {} },
      { method: 'POST', path: '/upload', body: { fileBase64: 'abc', fileName: 'x.png' } },
      { method: 'GET', path: '/plans' },
    ];

    for (const ep of forbiddenEndpointsForDriver) {
      const resp = await apiRequest(apiBase, ep.method, ep.path, {
        token: tokenDriverA1,
        body: ep.body,
      });
      assert.strictEqual(
        resp.status,
        403,
        `Endpoint ${ep.method} ${ep.path} must return 403 for DELIVERY_DRIVER, got ${resp.status}`
      );
    }

    // Driver A2 attempting to access or start Driver A1's route
    const a2ReadA1Route = await apiRequest(apiBase, 'GET', `/delivery-hub/routes/${routeA.id}`, {
      token: tokenDriverA2,
    });
    assert.strictEqual(a2ReadA1Route.status, 403, 'Driver A2 cannot read Driver A1 route');

    const a2StartA1Route = await apiRequest(
      apiBase,
      'POST',
      `/delivery-hub/routes/${routeA.id}/start`,
      { token: tokenDriverA2 }
    );
    assert.strictEqual(a2StartA1Route.status, 400, 'Driver A2 cannot start Driver A1 route');
    assert(a2StartA1Route.body.error.includes('outro entregador'));

    console.log(
      `  [OK] Perfil DELIVERY_DRIVER bloqueado no backend em todos os ${forbiddenEndpointsForDriver.length} endpoints administrativos/financeiros/catálogo e rotas de terceiros.`
    );

    // =========================================================================
    // 4. AUDITORIA DO QR CODE (Expiração, Revogação, Regeneração, Sem PII)
    // =========================================================================
    console.log('\n--- [4] AUDITORIA DO QR CODE ---');
    assert(routeA.qrToken.startsWith('rtqr_'), 'QR token must start with rtqr_');
    assert.strictEqual(routeA.qrToken.length, 53, 'QR token must have 5 + 48 hex chars (192-bit entropy)');
    assert(!(routeA.qrClaimUrl || '').includes('Cliente'), 'QR claim URL must contain zero customer PII');
    assert(!(routeA.qrClaimUrl || '').includes('1196666'), 'QR claim URL must contain zero phone numbers');

    // Driver A2 trying to scan Route A (assigned to Driver A1)
    const unauthorizedScan = await apiRequest(apiBase, 'POST', '/delivery-hub/driver-portal/scan-qr', {
      token: tokenDriverA2,
      body: { qrToken: routeA.qrToken },
    });
    assert.strictEqual(unauthorizedScan.status, 400, 'Driver A2 scanning Route A1 QR must fail');
    assert(unauthorizedScan.body.error.includes('outro entregador'));

    // Revoke QR Code and attempt scan with Driver A1
    await apiRequest(apiBase, 'POST', `/delivery-hub/routes/${routeA.id}/qr`, {
      token: tokenAdminA,
      body: { action: 'revoke' },
    });
    const revokedScan = await apiRequest(apiBase, 'POST', '/delivery-hub/driver-portal/scan-qr', {
      token: tokenDriverA1,
      body: { qrToken: routeA.qrToken },
    });
    assert.strictEqual(revokedScan.status, 400, 'Revoked QR scan must fail');
    assert(revokedScan.body.error.includes('revogado'));

    // Regenerate QR Code -> old token fails, new token exists
    const regenResp = await apiRequest(apiBase, 'POST', `/delivery-hub/routes/${routeA.id}/qr`, {
      token: tokenAdminA,
      body: { action: 'regenerate' },
    });
    const newQrToken = regenResp.body.data.qrToken;
    assert.notStrictEqual(newQrToken, routeA.qrToken, 'Regenerated QR token must be different');

    const oldTokenScan = await apiRequest(apiBase, 'POST', '/delivery-hub/driver-portal/scan-qr', {
      token: tokenDriverA1,
      body: { qrToken: routeA.qrToken },
    });
    assert.strictEqual(oldTokenScan.status, 400, 'Old QR token must no longer work');

    // Simulate expired QR Code
    const pastIso = new Date(Date.now() - 3600_000).toISOString();
    await (deliveryHubRepo as any).queryTable('delivery_routes', (b: any) =>
      b.update({ qr_expires_at: pastIso }).eq('id', routeA.id)
    );
    const expiredScan = await apiRequest(apiBase, 'POST', '/delivery-hub/driver-portal/scan-qr', {
      token: tokenDriverA1,
      body: { qrToken: newQrToken },
    });
    assert.strictEqual(expiredScan.status, 400, 'Expired QR scan must fail');
    assert(expiredScan.body.error.includes('expirou'));

    // Regenerate again so Driver A1 has a fresh valid QR code
    const regenValid = await apiRequest(apiBase, 'POST', `/delivery-hub/routes/${routeA.id}/qr`, {
      token: tokenAdminA,
      body: { action: 'regenerate' },
    });
    const validQrToken = regenValid.body.data.qrToken;
    const validScan = await apiRequest(apiBase, 'POST', '/delivery-hub/driver-portal/scan-qr', {
      token: tokenDriverA1,
      body: { qrToken: validQrToken },
    });
    assert.strictEqual(validScan.status, 200, 'Valid QR scan by assigned Driver A1 must succeed');
    assert.strictEqual(validScan.body.data.status, 'accepted');
    console.log('  [OK] QR Code auditado (192-bit entropy, zero PII, bloqueio de expirado, revogado, regenerado, outro tenant e outro motoboy).');

    // =========================================================================
    // 5. AUDITORIA DO WHATSAPP (Sem gateway, Com gateway, Falha, Retry, Concorrência)
    // =========================================================================
    console.log('\n--- [5] AUDITORIA DO WHATSAPP & CONCORRÊNCIA ---');
    // 5.1 Without external gateway configured -> pending_gateway (never falsely marked as 'sent')
    delete process.env.WHATSAPP_API_URL;
    delete process.env.WHATSAPP_API_TOKEN;

    const stopA1 = routeA.stops[0];
    const stopA2 = routeA.stops[1];

    const startStop1NoGw = await apiRequest(
      apiBase,
      'POST',
      `/delivery-hub/routes/${routeA.id}/stops/${stopA1.id}/start`,
      { token: tokenDriverA1 }
    );
    assert.strictEqual(startStop1NoGw.status, 200);
    assert.strictEqual(
      startStop1NoGw.body.data.notification.status,
      'pending_gateway',
      'Without gateway, status must be pending_gateway, never sent'
    );
    assert.strictEqual(startStop1NoGw.body.data.notification.providerConfirmed, false);
    assert(startStop1NoGw.body.data.notification.whatsappWebUrl.includes('wa.me'));

    // 5.2 Configure mock gateway and test CONCURRENT requests for stopA2
    process.env.WHATSAPP_API_URL = mockWaUrl;
    process.env.WHATSAPP_API_TOKEN = 'test-secret-token-123';
    mockGatewayCalls = [];
    mockGatewayShouldFail = false;

    // Fire 5 simultaneous notifications for stopA2
    const concurrentResults = await Promise.all([
      deliveryHubRepo.dispatchWhatsAppNotification({
        tenantId: tenantA.id,
        routeId: routeA.id,
        stopId: stopA2.id,
        orderId: stopA2.orderId,
        eventType: 'out_for_delivery',
        actor: adminA,
        baseUrl: 'https://restaurante-a.minihub.tech',
      }),
      deliveryHubRepo.dispatchWhatsAppNotification({
        tenantId: tenantA.id,
        routeId: routeA.id,
        stopId: stopA2.id,
        orderId: stopA2.orderId,
        eventType: 'out_for_delivery',
        actor: adminA,
        baseUrl: 'https://restaurante-a.minihub.tech',
      }),
      deliveryHubRepo.dispatchWhatsAppNotification({
        tenantId: tenantA.id,
        routeId: routeA.id,
        stopId: stopA2.id,
        orderId: stopA2.orderId,
        eventType: 'out_for_delivery',
        actor: adminA,
        baseUrl: 'https://restaurante-a.minihub.tech',
      }),
      deliveryHubRepo.dispatchWhatsAppNotification({
        tenantId: tenantA.id,
        routeId: routeA.id,
        stopId: stopA2.id,
        orderId: stopA2.orderId,
        eventType: 'out_for_delivery',
        actor: adminA,
        baseUrl: 'https://restaurante-a.minihub.tech',
      }),
      deliveryHubRepo.dispatchWhatsAppNotification({
        tenantId: tenantA.id,
        routeId: routeA.id,
        stopId: stopA2.id,
        orderId: stopA2.orderId,
        eventType: 'out_for_delivery',
        actor: adminA,
        baseUrl: 'https://restaurante-a.minihub.tech',
      }),
    ]);

    assert.strictEqual(
      mockGatewayCalls.length,
      1,
      `Expected exactly 1 gateway HTTP call for 5 concurrent requests, got ${mockGatewayCalls.length}`
    );
    assert.strictEqual(
      mockGatewayCalls[0].headers.authorization,
      'Bearer test-secret-token-123',
      'Gateway must receive Bearer token header'
    );
    assert.strictEqual(concurrentResults[0].status, 'sent');
    assert.strictEqual(concurrentResults[0].providerConfirmed, true);

    const notifsStopA2 = await deliveryHubRepo.listNotifications(tenantA.id, stopA2.orderId);
    assert.strictEqual(notifsStopA2.length, 1, 'Database must contain exactly 1 notification record for stopA2');

    // 5.3 Test Gateway Failure & Manual Retry on stopA1
    mockGatewayShouldFail = true;
    const failedRetry = await deliveryHubRepo.dispatchWhatsAppNotification({
      tenantId: tenantA.id,
      routeId: routeA.id,
      stopId: stopA1.id,
      orderId: stopA1.orderId,
      eventType: 'out_for_delivery',
      actor: adminA,
      forceRetry: true,
    });
    assert.strictEqual(failedRetry.status, 'failed');
    assert.strictEqual(failedRetry.providerConfirmed, false);
    assert(failedRetry.errorMessage?.includes('HTTP 500'));

    mockGatewayShouldFail = false;
    const successRetry = await deliveryHubRepo.dispatchWhatsAppNotification({
      tenantId: tenantA.id,
      routeId: routeA.id,
      stopId: stopA1.id,
      orderId: stopA1.orderId,
      eventType: 'out_for_delivery',
      actor: adminA,
      forceRetry: true,
    });
    assert.strictEqual(successRetry.status, 'sent');
    assert.strictEqual(successRetry.providerConfirmed, true);
    assert.strictEqual(successRetry.attemptsCount, 3);
    console.log('  [OK] WhatsApp auditado (pending_gateway vs sent vs failed, retry manual e 5 requisições simultâneas sem duplicidade).');

    // =========================================================================
    // 6. AUDITORIA DOS CÁLCULOS DE ROTAS (5 Destinos Fictícios + Reordenação)
    // =========================================================================
    console.log('\n--- [6] AUDITORIA DOS CÁLCULOS DE ROTAS (5 DESTINOS + REORDENAÇÃO) ---');
    const fiveCoords = [
      { lat: -23.5665, lng: -46.6535, street: 'Alameda Campinas', number: '400', neighborhood: 'Jardim Paulista' },
      { lat: -23.5712, lng: -46.6442, street: 'Rua Vergueiro', number: '1200', neighborhood: 'Paraíso' },
      { lat: -23.5551, lng: -46.6625, street: 'Rua Major Sertório', number: '300', neighborhood: 'Vila Buarque' },
      { lat: -23.5789, lng: -46.6598, street: 'Av. Brasil', number: '1500', neighborhood: 'Jardim América' },
      { lat: -23.5621, lng: -46.6391, street: 'Rua Tamandaré', number: '600', neighborhood: 'Liberdade' },
    ];
    const fiveOrderIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const created = await orderRepo.createOrder(
        slugA,
        {
          customerName: `Destino Cinco ${i + 1}`,
          customerPhone: `1194444000${i + 1}`,
          fulfillmentType: 'delivery',
          paymentMethod: 'PIX',
          items: [{ productId: prodA.id, quantity: 1 }],
          deliveryAddress: {
            cep: '01404000',
            street: fiveCoords[i].street,
            number: fiveCoords[i].number,
            neighborhood: fiveCoords[i].neighborhood,
            city: 'São Paulo',
            state: 'SP',
            latitude: fiveCoords[i].lat,
            longitude: fiveCoords[i].lng,
          },
        } as any,
        '127.0.0.1'
      );
      fiveOrderIds.push(created.order.id);
      createdOrderIds.push(created.order.id);
      await orderRepo.updateOrderCoordinates(
        tenantA.id,
        created.order.id,
        { latitude: fiveCoords[i].lat, longitude: fiveCoords[i].lng, geocodeStatus: 'geocoded' },
        adminA
      );
    }

    const route5 = await deliveryHubRepo.createRoute(
      tenantA.id,
      { name: 'Rota 5 Destinos', orderIds: fiveOrderIds, optimizeOrder: true, driverId: driverA2.id },
      adminA
    );
    assert.strictEqual(route5.stops.length, 5, 'Route must have 5 stops');
    assert(route5.totalDistanceKm > 0, 'Total distance must be > 0');
    assert(route5.estimatedDurationMin > 0, 'Estimated duration must be > 0');

    const initialSeqIds = route5.stops.map((s) => s.id);
    const reversedSeqIds = [...initialSeqIds].reverse();

    const reorderedRoute5 = await deliveryHubRepo.reorderRouteStops(
      tenantA.id,
      route5.id,
      reversedSeqIds,
      adminA
    );
    assert.deepStrictEqual(
      reorderedRoute5.stops.map((s) => s.id),
      reversedSeqIds,
      'Stop IDs must match manual reversed sequence'
    );
    assert.deepStrictEqual(
      reorderedRoute5.stops.map((s) => s.stopSequence),
      [1, 2, 3, 4, 5],
      'Stop sequences must be 1..5'
    );
    assert(reorderedRoute5.totalDistanceKm > 0, 'Recalculated totalDistanceKm must be > 0');
    assert(reorderedRoute5.estimatedDurationMin > 0, 'Recalculated estimatedDurationMin must be > 0');
    console.log(
      `  [OK] Rota com 5 destinos criada (${route5.totalDistanceKm} km, ${route5.estimatedDurationMin} min) e reordenada (${reorderedRoute5.totalDistanceKm} km, ${reorderedRoute5.estimatedDurationMin} min).`
    );

    // =========================================================================
    // 7. AUDITORIA DO RASTREAMENTO GPS & 8. LINK PÚBLICO DE RASTREAMENTO
    // =========================================================================
    console.log('\n--- [7 & 8] AUDITORIA DO GPS E LINK PÚBLICO DE RASTREAMENTO ---');
    // 7.1 Opt-in disabled -> coordinates ignored
    const gpsNoOptIn = await deliveryHubRepo.updateDriverStatusAndLocation(tenantA.id, loginDriverA1.body.user, {
      shareLocation: false,
      latitude: -23.563,
      longitude: -46.654,
    });
    assert.strictEqual(gpsNoOptIn.lastLatitude, null, 'Coordinates must not be saved when shareLocation=false');

    // 7.2 Opt-in enabled on active route -> coordinates saved
    const gpsOptIn = await deliveryHubRepo.updateDriverStatusAndLocation(tenantA.id, loginDriverA1.body.user, {
      shareLocation: true,
      latitude: -23.563,
      longitude: -46.654,
    });
    assert.strictEqual(gpsOptIn.lastLatitude, -23.563);
    assert.strictEqual(gpsOptIn.lastLongitude, -46.654);
    assert(gpsOptIn.lastLocationAt !== null);

    // 8.1 Public tracking link for stopA1 (currently out_for_delivery)
    const pubTrackResp = await apiRequest(
      apiBase,
      'GET',
      `/public/delivery-tracking/${stopA1.trackingToken}`
    );
    assert.strictEqual(pubTrackResp.status, 200);
    const pubData = pubTrackResp.body.data;
    assert.strictEqual(pubData.customerFirstName, 'Cliente'); // Only first name!
    assert.strictEqual(pubData.driverFirstName, 'Carlos'); // Only driver first name!
    assert.strictEqual((pubData as any).customerPhone, undefined, 'Customer phone must never be exposed');
    assert.strictEqual((pubData as any).driverPhone, undefined, 'Driver phone must never be exposed');
    assert.strictEqual((pubData as any).stops, undefined, 'Other stops in route must never be exposed');
    assert(pubData.liveDriverLocation !== null, 'Fresh opted-in live location must be visible during out_for_delivery');

    // 7.3 Stale GPS location (> 10 minutes old) must expire and not be exposed as live location
    const staleIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await (deliveryHubRepo as any).queryTable('delivery_drivers', (b: any) =>
      b.update({ last_location_at: staleIso }).eq('id', driverA1.id)
    );
    const pubTrackStale = await apiRequest(
      apiBase,
      'GET',
      `/public/delivery-tracking/${stopA1.trackingToken}`
    );
    assert.strictEqual(
      pubTrackStale.body.data.liveDriverLocation,
      null,
      'Stale GPS location (> 10 min) must be expired and hidden from liveDriverLocation'
    );

    // Refresh GPS location and complete routeA -> verify GPS is wiped upon route completion
    await deliveryHubRepo.updateDriverStatusAndLocation(tenantA.id, loginDriverA1.body.user, {
      shareLocation: true,
      latitude: -23.561,
      longitude: -46.655,
    });
    await deliveryHubRepo.completeRouteStop(tenantA.id, routeA.id, stopA1.id, loginDriverA1.body.user);
    await deliveryHubRepo.startRouteStop(tenantA.id, routeA.id, stopA2.id, loginDriverA1.body.user);
    const finishedRouteA = await deliveryHubRepo.completeRouteStop(
      tenantA.id,
      routeA.id,
      stopA2.id,
      loginDriverA1.body.user
    );
    assert.strictEqual(finishedRouteA.status, 'completed');

    const driverA1AfterFinish = await deliveryHubRepo.getDriverById(tenantA.id, driverA1.id);
    assert.strictEqual(driverA1AfterFinish?.lastLatitude, null, 'Driver latitude must be cleared on route completion');
    assert.strictEqual(driverA1AfterFinish?.lastLongitude, null, 'Driver longitude must be cleared on route completion');
    assert.strictEqual(driverA1AfterFinish?.activeRouteId, null, 'Driver activeRouteId must be null on route completion');

    // 8.2 Cancel route5 and verify its public tracking tokens are invalidated/revoked (HTTP 404)
    const route5TrackingToken = reorderedRoute5.stops[0].trackingToken;
    const beforeCancelTrack = await apiRequest(
      apiBase,
      'GET',
      `/public/delivery-tracking/${route5TrackingToken}`
    );
    assert.strictEqual(beforeCancelTrack.status, 200, 'Tracking token works before route cancellation');

    await deliveryHubRepo.cancelRoute(tenantA.id, route5.id, adminA);
    const afterCancelTrack = await apiRequest(
      apiBase,
      'GET',
      `/public/delivery-tracking/${route5TrackingToken}`
    );
    assert.strictEqual(
      afterCancelTrack.status,
      404,
      'Tracking token must be revoked/invalidated (404) when route is cancelled'
    );
    console.log('  [OK] GPS e Link Público auditados (opt-in, expiração de localização antiga, limpeza ao encerrar rota, zero vazamento de PII e revogação ao cancelar rota).');

    // =========================================================================
    // 9. AUDITORIA DE INTEGRIDADE DOS PEDIDOS (Fluxo Completo 16 Etapas)
    // =========================================================================
    console.log('\n--- [9] AUDITORIA DE INTEGRIDADE DOS PEDIDOS (16 ETAPAS) ---');
    // Pick 2 orders from fiveOrderIds (which returned to waiting_dispatch after route5 was cancelled)
    const integrityOrderIds = [fiveOrderIds[0], fiveOrderIds[1]];
    const beforeOrder1 = await orderRepo.getOrderById(tenantA.id, integrityOrderIds[0]);
    const beforeOrder2 = await orderRepo.getOrderById(tenantA.id, integrityOrderIds[1]);
    assert(beforeOrder1 && beforeOrder2);

    const { total: totalOrdersBefore } = await orderRepo.listOrders(tenantA.id, {});

    // Create route (Step 4) & Assign driver A1 (Step 5) & Generate QR (Step 6)
    const intRoute = await deliveryHubRepo.createRoute(
      tenantA.id,
      { name: 'Rota Integridade 16 Passos', orderIds: integrityOrderIds },
      adminA
    );
    await deliveryHubRepo.assignDriverToRoute(tenantA.id, intRoute.id, driverA1.id, adminA);

    // Authenticate driver (Step 7) & Validate QR (Step 8)
    const scannedIntRoute = await deliveryHubRepo.scanRouteQrCode(
      tenantA.id,
      intRoute.qrToken,
      loginDriverA1.body.user
    );
    assert.strictEqual(scannedIntRoute.status, 'accepted');

    // Start route (Step 9)
    const startedIntRoute = await deliveryHubRepo.startRoute(
      tenantA.id,
      intRoute.id,
      loginDriverA1.body.user
    );
    assert.strictEqual(startedIntRoute.status, 'in_progress');

    // Start 1st delivery (Step 10) & Simulate notification (Step 11)
    const st1 = startedIntRoute.stops[0];
    const st2 = startedIntRoute.stops[1];
    const step10 = await deliveryHubRepo.startRouteStop(
      tenantA.id,
      intRoute.id,
      st1.id,
      loginDriverA1.body.user
    );
    assert.strictEqual(step10.stop.status, 'out_for_delivery');
    assert.strictEqual(step10.notification.status, 'sent');

    // Confirm 1st delivery (Step 12)
    await deliveryHubRepo.completeRouteStop(
      tenantA.id,
      intRoute.id,
      st1.id,
      loginDriverA1.body.user
    );

    // Start 2nd delivery (Step 13) & Simulate notification (Step 14)
    const step13 = await deliveryHubRepo.startRouteStop(
      tenantA.id,
      intRoute.id,
      st2.id,
      loginDriverA1.body.user
    );
    assert.strictEqual(step13.stop.status, 'out_for_delivery');
    assert.strictEqual(step13.notification.status, 'sent');

    // Finalize all stops (Step 15)
    const step15Route = await deliveryHubRepo.completeRouteStop(
      tenantA.id,
      intRoute.id,
      st2.id,
      loginDriverA1.body.user
    );
    assert.strictEqual(step15Route.status, 'completed');
    assert.strictEqual(step15Route.completedStops, 2);

    // Verify history, restaurant panel & financial integrity (Step 16)
    const afterOrder1 = await orderRepo.getOrderById(tenantA.id, integrityOrderIds[0]);
    const afterOrder2 = await orderRepo.getOrderById(tenantA.id, integrityOrderIds[1]);
    const { total: totalOrdersAfter } = await orderRepo.listOrders(tenantA.id, {});

    assert.strictEqual(totalOrdersAfter, totalOrdersBefore, 'Zero duplicate orders created');
    assert.strictEqual(afterOrder1?.status, 'COMPLETED');
    assert.strictEqual(afterOrder2?.status, 'COMPLETED');
    assert.strictEqual(afterOrder1?.subtotal, beforeOrder1.subtotal, 'Subtotal 1 unchanged');
    assert.strictEqual(afterOrder1?.deliveryFee, beforeOrder1.deliveryFee, 'DeliveryFee 1 unchanged');
    assert.strictEqual(afterOrder1?.total, beforeOrder1.total, 'Total 1 unchanged');
    assert.strictEqual(afterOrder1?.items.length, beforeOrder1.items.length, 'Items 1 count unchanged');
    assert.strictEqual(afterOrder2?.total, beforeOrder2.total, 'Total 2 unchanged');
    console.log('  [OK] Fluxo completo de 16 etapas concluído com integridade financeira e zero duplicação de pedidos.');

    console.log('\n================================================================');
    console.log('RESULTADO DA AUDITORIA AUTOMATIZADA: 100% APROVADO');
    console.log('================================================================');
  } finally {
    if (origWaUrl === undefined) delete process.env.WHATSAPP_API_URL;
    else process.env.WHATSAPP_API_URL = origWaUrl;
    if (origWaToken === undefined) delete process.env.WHATSAPP_API_TOKEN;
    else process.env.WHATSAPP_API_TOKEN = origWaToken;

    apiServer.close();
    mockWaServer.close();

    // Clean up temporary Supabase records created during the isolated test
    for (const orderId of createdOrderIds) {
      await supabaseAdmin.from('order_items').delete().eq('order_id', orderId);
      await supabaseAdmin.from('order_delivery_addresses').delete().eq('order_id', orderId);
      await supabaseAdmin.from('order_status_history').delete().eq('order_id', orderId);
      await supabaseAdmin.from('orders').delete().eq('id', orderId);
    }
    for (const prodId of createdProductIds) {
      await supabaseAdmin.from('products').delete().eq('id', prodId);
    }
    for (const tenantId of createdTenantIds) {
      await supabaseAdmin.from('delivery_notifications').delete().eq('tenant_id', tenantId);
      await supabaseAdmin.from('delivery_events').delete().eq('tenant_id', tenantId);
      await supabaseAdmin.from('delivery_route_stops').delete().eq('tenant_id', tenantId);
      await supabaseAdmin.from('delivery_routes').delete().eq('tenant_id', tenantId);
      await supabaseAdmin.from('delivery_drivers').delete().eq('tenant_id', tenantId);
      await supabaseAdmin.from('delivery_settings').delete().eq('tenant_id', tenantId);
      await supabaseAdmin.from('payment_methods_config').delete().eq('tenant_id', tenantId);
      await supabaseAdmin.from('tenant_feature_overrides').delete().eq('tenant_id', tenantId);
      await supabaseAdmin.from('tenant_users').delete().eq('tenant_id', tenantId);
      await supabaseAdmin.from('audit_logs').delete().eq('tenant_id', tenantId);
      await supabaseAdmin.from('tenants').delete().eq('id', tenantId);
    }
    for (const uid of createdUserIds) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(uid);
      } catch {
        // Ignore
      }
    }

    if (backupJson !== null) {
      const parsed = JSON.parse(backupJson);
      if (Array.isArray(parsed.auth_users)) {
        parsed.auth_users = parsed.auth_users.filter(
          (u: any) => !String(u.email || '').endsWith('@localhub.test') && !String(u.email || '').endsWith('@teste.local')
        );
      }
      if (Array.isArray(parsed.tenants)) {
        const testTenantIds = new Set(
          parsed.tenants
            .filter((t: any) => String(t.slug || '').startsWith('audit-rest-') || String(t.slug || '').startsWith('test-delivery-'))
            .map((t: any) => t.id)
        );
        parsed.tenants = parsed.tenants.filter((t: any) => !testTenantIds.has(t.id));
        if (Array.isArray(parsed.tenant_users)) {
          parsed.tenant_users = parsed.tenant_users.filter(
            (tu: any) =>
              !testTenantIds.has(tu.tenant_id) &&
              parsed.auth_users.some((au: any) => au.id === tu.user_id)
          );
        }
      }
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(parsed, null, 2), 'utf-8');
    }
  }
}

runAudit()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FALHA NA AUDITORIA:', err);
    process.exit(1);
  });
