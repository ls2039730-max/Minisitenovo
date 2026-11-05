import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { supabaseAdmin, getLocalTableBuilder } from '../server/supabaseAdmin.js';
import { repo } from '../server/db/repository.js';
import { orderRepo } from '../server/db/orderRepository.js';
import { deliveryHubRepo } from '../server/db/deliveryHubRepository.js';
import { User } from '../src/types/saas.js';
import {
  decodeQrFromRgbaBuffer,
  extractRouteQrToken,
  mapCameraErrorToPortuguese,
} from '../src/utils/qrScannerUtils.js';

/**
 * Renders a QRCode text payload into a synthetic RGBA pixel buffer (Uint8ClampedArray)
 * with quiet zone, simulating a real camera frame captured from a screen.
 */
function renderQrToRgbaFrame(text: string, scale = 8, margin = 4): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const totalModules = size + margin * 2;
  const width = totalModules * scale;
  const height = totalModules * scale;
  const data = new Uint8ClampedArray(width * height * 4);

  // Fill white background
  data.fill(255);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const isDark = qr.modules.get(r, c);
      if (isDark) {
        const startY = (r + margin) * scale;
        const startX = (c + margin) * scale;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const idx = ((startY + dy) * width + (startX + dx)) * 4;
            data[idx] = 15; // R
            data[idx + 1] = 23; // G
            data[idx + 2] = 42; // B
            data[idx + 3] = 255; // A
          }
        }
      }
    }
  }

  return { data, width, height };
}

async function runQrScannerTests() {
  console.log('===================================================================');
  console.log(' AUDITORIA E TESTES — LEITOR DE QR CODE DA ROTA (CÂMERA + BACKEND)');
  console.log('===================================================================\n');

  // 1. Verify DriverPortalView Camera Implementation & Lifecycle Controls
  const portalPath = path.resolve(
    process.cwd(),
    'src/components/delivery/DriverPortalView.tsx'
  );
  const portalSource = fs.readFileSync(portalPath, 'utf-8');

  assert.equal(
    portalSource.includes('navigator.mediaDevices.getUserMedia'),
    true,
    'DriverPortalView deve utilizar navigator.mediaDevices.getUserMedia para acesso real à câmera.'
  );
  assert.equal(
    portalSource.includes('facingMode: { ideal: targetFacing }'),
    true,
    'DriverPortalView deve priorizar a câmera traseira via facingMode: { ideal: "environment" }.'
  );
  assert.equal(
    portalSource.includes('Posicione o QR Code dentro da moldura'),
    true,
    'DriverPortalView deve exibir a moldura visual de posicionamento do QR Code.'
  );
  assert.equal(
    portalSource.includes('track.stop()') && portalSource.includes('visibilitychange'),
    true,
    'DriverPortalView deve interromper as tracks da câmera ao fechar o modal, concluir leitura ou ocultar a aba.'
  );
  console.log(
    '✅ 1. Implementação de getUserMedia, facingMode environment, moldura visual e ciclo de vida da câmera verificados.'
  );

  // 2. Test Camera Error Mapping in Portuguese (Permission Denied, No Camera, Camera in Use, Unsupported, HTTP)
  const deniedErr = mapCameraErrorToPortuguese({ name: 'NotAllowedError' }, true);
  assert.equal(deniedErr.code, 'PERMISSION_DENIED');
  assert.ok(deniedErr.instructions?.includes('Permitir'));

  const noCamErr = mapCameraErrorToPortuguese({ name: 'NotFoundError' }, true);
  assert.equal(noCamErr.code, 'NO_CAMERA_FOUND');

  const inUseErr = mapCameraErrorToPortuguese({ name: 'NotReadableError' }, true);
  assert.equal(inUseErr.code, 'CAMERA_IN_USE');

  const unsupportedErr = mapCameraErrorToPortuguese({ name: 'UNSUPPORTED_BROWSER' }, true);
  assert.equal(unsupportedErr.code, 'UNSUPPORTED_BROWSER');

  const insecureErr = mapCameraErrorToPortuguese(null, false);
  assert.equal(insecureErr.code, 'INSECURE_CONTEXT');
  assert.ok(insecureErr.title.includes('HTTPS'));

  console.log(
    '✅ 2. Tratamento de erros de câmera (recusa de permissão, sem câmera, câmera ocupada, navegador sem suporte e HTTP) validado.'
  );

  // 3. Full End-to-End Flow: Create Route -> Render QR Frame -> Decode via jsQR -> Identify Route -> Claim Route -> Verify in Driver Portal
  const suffix = Date.now().toString().slice(-6);
  const tenantSlug = `test-qr-scan-${suffix}`;
  const superAdminActor: User = {
    id: 'super-admin-qr-test',
    name: 'Super Admin QR Test',
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
  const createdDriverIds: string[] = [];
  const createdRouteIds: string[] = [];

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
        name: `Restaurante QR Teste ${suffix}`,
        slug: tenantSlug,
        subdomain: `${tenantSlug}.minihub.tech`,
        segment: 'Alimentação & Restaurantes',
        phone: '11999990011',
        whatsapp: '11999990011',
        email: `contato-qr-${suffix}@teste.local`,
        ownerName: 'Admin QR',
        ownerEmail: `admin-qr-${suffix}@teste.local`,
        ownerPhone: '11999990011',
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
        name: 'Taxa Fixa',
        fee: 7,
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
        name: 'Burger Duplo',
        description: 'Artesanal',
        price: 38,
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

    // Create 2 drivers
    const driver1 = await deliveryHubRepo.createDriver(
      tenantId,
      {
        name: 'Rafael Motoboy 1',
        phone: '11988881111',
        email: `rafael.qr1.${suffix}@teste.local`,
        password: 'DriverPassword123!',
        vehicleInfo: 'Honda CG 160',
        plate: 'QRX-1001',
      },
      adminUser
    );
    createdDriverIds.push(driver1.id);
    if (driver1.userId) createdUserIds.push(driver1.userId);

    const driver2 = await deliveryHubRepo.createDriver(
      tenantId,
      {
        name: 'Lucas Motoboy 2',
        phone: '11988882222',
        email: `lucas.qr2.${suffix}@teste.local`,
        password: 'DriverPassword123!',
        vehicleInfo: 'Yamaha Factor',
        plate: 'QRX-2002',
      },
      adminUser
    );
    createdDriverIds.push(driver2.id);
    if (driver2.userId) createdUserIds.push(driver2.userId);

    const driver1User = (await repo.findUserById(driver1.userId!))!;
    const driver2User = (await repo.findUserById(driver2.userId!))!;

    // Create 2 delivery orders and an unassigned route
    const ord1 = await orderRepo.createOrder(tenantSlug, {
      customerName: 'Cliente QR 1',
      customerPhone: '11977770001',
      fulfillmentType: 'delivery',
      paymentMethod: 'PIX',
      items: [{ productId, quantity: 1 }],
      deliveryAddress: {
        cep: '01414001',
        street: 'Rua Haddock Lobo',
        number: '595',
        neighborhood: 'Cerqueira César',
        city: 'São Paulo',
        state: 'SP',
        latitude: -23.5587,
        longitude: -46.6615,
      },
      idempotencyKey: `qr-ord-1-${suffix}`,
    });
    const ord2 = await orderRepo.createOrder(tenantSlug, {
      customerName: 'Cliente QR 2',
      customerPhone: '11977770002',
      fulfillmentType: 'delivery',
      paymentMethod: 'PIX',
      items: [{ productId, quantity: 1 }],
      deliveryAddress: {
        cep: '04101000',
        street: 'Rua Vergueiro',
        number: '1855',
        neighborhood: 'Vila Mariana',
        city: 'São Paulo',
        state: 'SP',
        latitude: -23.5795,
        longitude: -46.6398,
      },
      idempotencyKey: `qr-ord-2-${suffix}`,
    });
    createdOrderIds.push(ord1.order.id, ord2.order.id);

    const route = await deliveryHubRepo.createRoute(
      tenantId,
      {
        name: 'Rota Expressa QR',
        orderIds: [ord1.order.id, ord2.order.id],
        optimizeOrder: true,
      },
      adminUser
    );
    createdRouteIds.push(route.id);

    // 3A. Simulate camera frame containing the Route QR Code URL and decode with jsQR
    const qrUrlPayload = `https://minihub.tech/?routeQr=${encodeURIComponent(route.qrToken)}`;
    const frame = renderQrToRgbaFrame(qrUrlPayload);
    const decodedPayload = decodeQrFromRgbaBuffer(frame.data, frame.width, frame.height);
    assert.equal(
      decodedPayload,
      qrUrlPayload,
      'O decodificador de imagem/câmera (jsQR) deve ler exatamente a URL codificada no QR Code.'
    );

    const extractedToken = extractRouteQrToken(decodedPayload!);
    assert.equal(
      extractedToken,
      route.qrToken,
      'extractRouteQrToken deve extrair o token rtqr_... a partir do link escaneado.'
    );

    // Also test blank frame (unrecognized QR code)
    const blankFrame = new Uint8ClampedArray(100 * 100 * 4).fill(255);
    assert.equal(
      decodeQrFromRgbaBuffer(blankFrame, 100, 100),
      null,
      'Quadro sem QR Code deve retornar null.'
    );
    console.log(
      '✅ 3. Decodificação real de quadro de vídeo QR Code via jsQR e extração de token validadas.'
    );

    // 4. Identify Route (dryRun: true) before claiming
    const identified = await deliveryHubRepo.scanRouteQrCode(
      tenantId,
      extractedToken,
      driver1User,
      { dryRun: true }
    );
    assert.equal(identified.id, route.id);
    assert.equal(
      identified.status,
      'created',
      'A validação prévia (dryRun: true) deve identificar a rota sem alterar seu status antes da confirmação.'
    );
    console.log(
      `✅ 4. Identificação prévia da rota via QR Code validada (${identified.routeCode}, ${identified.totalStops} paradas).`
    );

    // 5. Claim Route (dryRun: false) and confirm it appears in Driver Portal
    const claimed = await deliveryHubRepo.scanRouteQrCode(
      tenantId,
      extractedToken,
      driver1User,
      { dryRun: false }
    );
    assert.equal(claimed.status, 'accepted');
    assert.equal(claimed.driverId, driver1.id);

    const portalData = await deliveryHubRepo.getDriverPortalData(tenantId, driver1User);
    assert.equal(
      portalData.activeRoutes.some((r) => r.id === route.id),
      true,
      'A rota assumida via QR Code deve aparecer imediatamente nas rotas ativas do portal do motoboy.'
    );
    console.log(
      '✅ 5. Assunção da rota pelo motoboy e exibição imediata no Portal do Motoboy validadas.'
    );

    // 6. Test Security Rejections: Already claimed by another driver, Invalid Code, Revoked Code, Expired Code
    await assert.rejects(
      async () => {
        await deliveryHubRepo.scanRouteQrCode(tenantId, extractedToken, driver2User);
      },
      /outro entregador/i,
      'Deve bloquear quando outro motoboy tenta escanear uma rota já assumida.'
    );

    await assert.rejects(
      async () => {
        await deliveryHubRepo.scanRouteQrCode(tenantId, 'rtqr_codigo_inexistente_123', driver1User);
      },
      /inválido|não localizada/i,
      'Deve rejeitar código QR inválido/inexistente.'
    );

    // Test Revoked QR Code
    await deliveryHubRepo.revokeOrRegenerateRouteQr(tenantId, route.id, 'revoke', adminUser);
    await assert.rejects(
      async () => {
        await deliveryHubRepo.scanRouteQrCode(tenantId, extractedToken, driver1User);
      },
      /revogado/i,
      'Deve rejeitar QR Code revogado.'
    );

    // Regenerate and test Expired QR Code
    const regenerated = await deliveryHubRepo.revokeOrRegenerateRouteQr(
      tenantId,
      route.id,
      'regenerate',
      adminUser
    );
    const pastIso = new Date(Date.now() - 3600_000).toISOString();
    await supabaseAdmin
      .from('delivery_routes')
      .update({ qr_expires_at: pastIso })
      .eq('id', route.id);
    try {
      await getLocalTableBuilder('delivery_routes')
        .update({ qr_expires_at: pastIso })
        .eq('id', route.id);
    } catch {}

    await assert.rejects(
      async () => {
        await deliveryHubRepo.scanRouteQrCode(tenantId, regenerated.qrToken, driver1User);
      },
      /expirou/i,
      'Deve rejeitar QR Code expirado.'
    );
    console.log(
      '✅ 6. Bloqueios de segurança (rota já assumida por outro motoboy, QR inválido, QR revogado e QR expirado) validados.'
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
      } catch {}
    }
  }

  console.log('\n===================================================================');
  console.log(' TODOS OS CENÁRIOS DO LEITOR DE QR CODE APROVADOS COM SUCESSO! ');
  console.log('===================================================================');
}

runQrScannerTests().catch((err) => {
  console.error('❌ Falha nos testes do Leitor de QR Code:', err);
  process.exit(1);
});
