import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { apiRouter } from '../server/routes.js';
import { repo } from '../server/db/repository.js';
import { generateSessionToken } from '../server/auth/tokenService.js';
import { isTenantFeatureEnabled } from '../src/utils/features.js';
import { Plan, Tenant } from '../src/types/saas.js';

const UNA_OTICA_ID = '9d315c84-65d5-4a7c-b64d-4ce6e4f7f6e2';

async function runTests() {
  console.log('==================================================================');
  console.log('TEST SUITE: CENTRALIZED MULTI-TENANT FEATURE OVERRIDE VERIFICATION');
  console.log('==================================================================\n');

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', apiRouter);

  const server = await new Promise<any>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    if (condition) {
      passed++;
      console.log(`✅ [PASS] ${name}${detail ? ` — ${detail}` : ''}`);
    } else {
      failed++;
      console.error(`❌ [FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
    }
  }

  try {
    // 1. Setup tokens for Super Admin, Una Ótica (restaurant_tables disabled), and a tenant with restaurant_tables enabled
    const superAdmin = await repo.findUserByEmail('admin@localhub.com');
    if (!superAdmin) throw new Error('Super Admin user not found');
    const superAdminToken = generateSessionToken(superAdmin);

    const unaOtica = await repo.getTenantById(UNA_OTICA_ID, superAdmin);
    if (!unaOtica) throw new Error('Una Ótica tenant not found');

    const unaOticaUsers = await repo.getTenantUsers(UNA_OTICA_ID, superAdmin);
    const unaOticaAdmin = unaOticaUsers.find((u) => u.role === 'CLIENT_ADMIN') || unaOticaUsers[0];
    if (!unaOticaAdmin) throw new Error('Una Ótica admin user not found');

    const unaOticaToken = generateSessionToken(unaOticaAdmin);

    // Find another active tenant where restaurant_tables is enabled (e.g., Costela Mania or Padaria Sabor Real)
    const allTenants = await repo.getAllTenants(superAdmin);
    let enabledTenant: Tenant | null = null;
    for (const t of allTenants) {
      if (t.id === UNA_OTICA_ID) continue;
      const feats = await repo.resolveTenantFeatures(t.id);
      if (feats.restaurant_tables === true) {
        enabledTenant = t;
        break;
      }
    }
    if (!enabledTenant) throw new Error('No reference tenant with restaurant_tables enabled found');

    const enabledTenantUsers = await repo.getTenantUsers(enabledTenant.id, superAdmin);
    const enabledTenantAdmin =
      enabledTenantUsers.find((u) => u.role === 'CLIENT_ADMIN') || enabledTenantUsers[0];
    const enabledTenantToken = enabledTenantAdmin
      ? generateSessionToken(enabledTenantAdmin)
      : generateSessionToken(
          { ...superAdmin, role: 'CLIENT_ADMIN', tenantId: enabledTenant.id },
          { impersonatedTenantId: enabledTenant.id, originalAdmin: superAdmin }
        );

    const plans = await repo.getPlans();
    const unaPlan: Plan | undefined = plans.find((p) => p.id === unaOtica.planId);
    const enabledPlan: Plan | undefined = plans.find((p) => p.id === enabledTenant!.planId);

    // Ensure Una Ótica starts with restaurant_tables: false (its real configured state)
    await repo.updateTenantFeatureOverrides(
      UNA_OTICA_ID,
      { restaurant_tables: false },
      superAdmin
    );

    // Helper for computing sidebar items identically to ClientLayout.tsx
    function computeClientMenuKeys(
      resolvedFeatures: Record<string, boolean>,
      tenantObj: Tenant,
      planObj: Plan | undefined
    ) {
      const hasShoppingCart = isTenantFeatureEnabled('shopping_cart', resolvedFeatures as any, tenantObj, planObj);
      const hasRestaurantCatalog = isTenantFeatureEnabled('restaurant_tables', resolvedFeatures as any, tenantObj, planObj);
      const hasProducts = isTenantFeatureEnabled('products', resolvedFeatures as any, tenantObj, planObj);

      return [
        { key: 'home', baseLabel: 'Visão Geral', enabled: true },
        { key: 'orders', baseLabel: 'Pedidos', enabled: hasShoppingCart || hasRestaurantCatalog },
        { key: 'restaurant', baseLabel: 'Mesas & Salão', enabled: hasRestaurantCatalog },
        { key: 'financial', baseLabel: 'Financeiro', enabled: true },
        { key: 'top_products', baseLabel: 'Mais Vendidos', enabled: hasProducts || hasShoppingCart || hasRestaurantCatalog },
        { key: 'reports', baseLabel: 'Relatórios', enabled: true },
      ]
        .filter((i) => i.enabled)
        .map((i, idx) => ({ key: i.key, label: `${idx + 1}. ${i.baseLabel}` }));
    }

    // =========================================================================
    // TEST 1: "restaurant_tables" habilitado: a opção aparece no menu e a rota autorizada funciona
    // =========================================================================
    console.log('\n--- Teste 1: "restaurant_tables" habilitado ---');
    const enabledMeRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${enabledTenantToken}` },
    }).then((r) => r.json());

    const enabledMenu = computeClientMenuKeys(
      enabledMeRes.resolvedFeatures,
      enabledMeRes.tenant,
      enabledPlan
    );
    assert(
      enabledMeRes.resolvedFeatures?.restaurant_tables === true,
      'T1.1 Tenant com restaurant_tables habilitado retorna resolvedFeatures.restaurant_tables === true',
      `Tenant: ${enabledTenant.name}`
    );
    assert(
      enabledMenu.some((m) => m.key === 'restaurant' && m.label.includes('Mesas & Salão')),
      'T1.2 Opção "Mesas & Salão" aparece no menu lateral para tenant habilitado',
      `Menu: ${enabledMenu.map((m) => m.label).join(' | ')}`
    );

    const enabledTablesApi = await fetch(`${baseUrl}/restaurant/tables`, {
      headers: { Authorization: `Bearer ${enabledTenantToken}` },
    });
    assert(
      enabledTablesApi.status === 200,
      'T1.3 Rota autorizada /api/restaurant/tables responde HTTP 200 para tenant habilitado',
      `Status: ${enabledTablesApi.status}`
    );

    // =========================================================================
    // TEST 2: "restaurant_tables" desativado para a Una Ótica: a opção não aparece e a rota é bloqueada
    // =========================================================================
    console.log('\n--- Teste 2: "restaurant_tables" desativado para a Una Ótica ---');
    const unaMeRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${unaOticaToken}` },
    }).then((r) => r.json());

    const unaMenu = computeClientMenuKeys(
      unaMeRes.resolvedFeatures,
      unaMeRes.tenant,
      unaPlan
    );

    assert(
      unaPlan?.includedFeatures?.includes('restaurant_tables') === true,
      'T2.1 Plano da Una Ótica inclui "restaurant_tables" originalmente (comprovando precedência do override)',
      `Plano: ${unaPlan?.name}`
    );
    assert(
      unaMeRes.tenant?.featureOverrides?.restaurant_tables === false &&
        unaMeRes.resolvedFeatures?.restaurant_tables === false,
      'T2.2 Override do Super Admin prevalece sobre o plano (restaurant_tables === false)',
      `featureOverrides.restaurant_tables=${unaMeRes.tenant?.featureOverrides?.restaurant_tables}, resolvedFeatures.restaurant_tables=${unaMeRes.resolvedFeatures?.restaurant_tables}`
    );
    assert(
      !unaMenu.some((m) => m.key === 'restaurant'),
      'T2.3 Opção "Mesas & Salão" NÃO aparece no menu lateral (celular e desktop) da Una Ótica',
      `Itens visíveis numerados sem lacunas: ${unaMenu.map((m) => m.label).join(' | ')}`
    );
    assert(
      unaMenu.every((m, i) => m.label.startsWith(`${i + 1}. `)),
      'T2.4 Numeração sequencial do menu lateral permanece íntegra e sem saltos',
      unaMenu.map((m) => m.label).join(', ')
    );

    // Check route guard condition (previously broken by `|| hasProducts`)
    const hasRestaurantCatalogForUna = isTenantFeatureEnabled(
      'restaurant_tables',
      unaMeRes.resolvedFeatures,
      unaMeRes.tenant,
      unaPlan
    );
    assert(
      hasRestaurantCatalogForUna === false && unaMeRes.resolvedFeatures?.products === true,
      'T2.5 Mesmo com "products" ativo, a guarda da rota ?tab=restaurant bloqueia acesso à funcionalidade desativada',
      `products=${unaMeRes.resolvedFeatures?.products}, restaurant_tables=${hasRestaurantCatalogForUna}`
    );

    // =========================================================================
    // TEST 3: Acesso direto por URL à funcionalidade desativada: o servidor não permite a operação
    // =========================================================================
    console.log('\n--- Teste 3: Acesso direto por URL / QR Code à funcionalidade desativada ---');
    const publicTableRes = await fetch(
      `${baseUrl}/public/restaurant/table-info?slug=${unaOtica.slug}&token=qualquer-token`
    );
    const publicTableJson = await publicTableRes.json();
    assert(
      publicTableRes.status === 403 && publicTableJson.code === 'FEATURE_DISABLED',
      'T3.1 Acesso direto público à mesa (/m/una-otica/:token -> /api/public/restaurant/table-info) é bloqueado pelo servidor com HTTP 403',
      `Status: ${publicTableRes.status}, Error: ${publicTableJson.error}`
    );

    const publicCatalogRes = await fetch(
      `${baseUrl}/public/restaurant/catalog?slug=${unaOtica.slug}&token=qualquer-token`
    );
    assert(
      publicCatalogRes.status === 403,
      'T3.2 Acesso direto ao catálogo de mesa (/api/public/restaurant/catalog) é bloqueado com HTTP 403',
      `Status: ${publicCatalogRes.status}`
    );

    // =========================================================================
    // TEST 4: Requisições às APIs relacionadas à funcionalidade desativada: o backend aplica a regra
    // =========================================================================
    console.log('\n--- Teste 4: Bloqueio de todas as APIs de backend relacionadas a "restaurant_tables" ---');
    const endpointsToCheck = [
      { method: 'GET', path: '/restaurant/tables' },
      { method: 'POST', path: '/restaurant/tables', body: { tableNumber: '99' } },
      { method: 'GET', path: '/restaurant/orders' },
      { method: 'GET', path: '/restaurant/fees' },
      { method: 'GET', path: '/restaurant/summary' },
      { method: 'GET', path: '/admin/tables/overview' },
    ];

    for (const ep of endpointsToCheck) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: {
          Authorization: `Bearer ${unaOticaToken}`,
          'Content-Type': 'application/json',
        },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      const data = await res.json();
      assert(
        res.status === 403 && data.success === false,
        `T4 Backend bloqueia ${ep.method} /api${ep.path} para Una Ótica com HTTP 403`,
        `Status: ${res.status} — ${data.error}`
      );
    }

    // =========================================================================
    // TEST 5: Outro tenant que possui o módulo habilitado continua funcionando normalmente
    // =========================================================================
    console.log('\n--- Teste 5: Isolamento Multi-Tenant (outro tenant continua funcionando normalmente) ---');
    const otherOverviewRes = await fetch(`${baseUrl}/admin/tables/overview`, {
      headers: { Authorization: `Bearer ${enabledTenantToken}` },
    });
    const otherOverviewData = await otherOverviewRes.json();
    assert(
      otherOverviewRes.status === 200 && otherOverviewData.success === true,
      `T5.1 Tenant "${enabledTenant.name}" continua acessando /api/admin/tables/overview normalmente`,
      `Status: ${otherOverviewRes.status}`
    );

    // Cross-tenant attempt: Una Ótica trying to pass another tenantId in query/header
    const crossTenantAttempt = await fetch(
      `${baseUrl}/restaurant/tables?tenantId=${enabledTenant.id}`,
      {
        headers: {
          Authorization: `Bearer ${unaOticaToken}`,
          'x-tenant-id': enabledTenant.id,
        },
      }
    );
    assert(
      crossTenantAttempt.status === 403,
      'T5.2 Una Ótica não consegue burlar a permissão enviando tenantId de outra empresa',
      `Status: ${crossTenantAttempt.status}`
    );

    // =========================================================================
    // TEST 6 & 7: Alteração no Super Admin reflete imediatamente na sessão do cliente sem limpar cache
    // =========================================================================
    console.log('\n--- Testes 6 e 7: Atualização pelo Super Admin refletida imediatamente na sessão ---');
    // Temporarily enable restaurant_tables via Super Admin API
    const enablePatchRes = await fetch(`${baseUrl}/tenants/${UNA_OTICA_ID}/features`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ overrides: { restaurant_tables: true } }),
    });
    assert(
      enablePatchRes.status === 200,
      'T6.1 Super Admin ativa temporariamente "restaurant_tables" via PUT /api/tenants/:id/features',
      `Status: ${enablePatchRes.status}`
    );

    // Client session refresh (/api/auth/me) with SAME token (no re-login or cache wipe needed)
    const refreshedSession1 = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${unaOticaToken}` },
    }).then((r) => r.json());

    assert(
      refreshedSession1.resolvedFeatures?.restaurant_tables === true &&
        isTenantFeatureEnabled('restaurant_tables', refreshedSession1.resolvedFeatures, refreshedSession1.tenant, unaPlan) === true,
      'T6.2 Painel do cliente recebe imediatamente restaurant_tables=true na atualização de sessão (/api/auth/me) usando o mesmo token',
      `resolvedFeatures.restaurant_tables=${refreshedSession1.resolvedFeatures?.restaurant_tables}`
    );

    // Now Super Admin disables restaurant_tables again (restoring Una Ótica's official state)
    const disablePatchRes = await fetch(`${baseUrl}/tenants/${UNA_OTICA_ID}/features`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ overrides: { restaurant_tables: false } }),
    });
    assert(
      disablePatchRes.status === 200,
      'T7.1 Super Admin desativa novamente "restaurant_tables" para a Una Ótica via API',
      `Status: ${disablePatchRes.status}`
    );

    const refreshedSession2 = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${unaOticaToken}` },
    }).then((r) => r.json());
    const refreshedMenu2 = computeClientMenuKeys(
      refreshedSession2.resolvedFeatures,
      refreshedSession2.tenant,
      unaPlan
    );

    assert(
      refreshedSession2.resolvedFeatures?.restaurant_tables === false &&
        !refreshedMenu2.some((m) => m.key === 'restaurant'),
      'T7.2 Sem limpar cache ou fazer novo login, a sessão atualiza e remove "Mesas & Salão" imediatamente',
      `resolvedFeatures.restaurant_tables=${refreshedSession2.resolvedFeatures?.restaurant_tables}`
    );

    // =========================================================================
    // TEST 8: Funcionalidades de outros módulos continuam acessíveis conforme permissões da Una Ótica
    // =========================================================================
    console.log('\n--- Teste 8: Demais módulos habilitados da Una Ótica continuam funcionando ---');
    const productsRes = await fetch(`${baseUrl}/products`, {
      headers: { Authorization: `Bearer ${unaOticaToken}` },
    });
    const servicesRes = await fetch(`${baseUrl}/services`, {
      headers: { Authorization: `Bearer ${unaOticaToken}` },
    });
    const professionalsRes = await fetch(`${baseUrl}/professionals`, {
      headers: { Authorization: `Bearer ${unaOticaToken}` },
    });
    const appointmentsRes = await fetch(`${baseUrl}/appointments`, {
      headers: { Authorization: `Bearer ${unaOticaToken}` },
    });

    assert(
      productsRes.status === 200 &&
        servicesRes.status === 200 &&
        professionalsRes.status === 200 &&
        appointmentsRes.status === 200,
      'T8.1 Módulos habilitados para a Una Ótica (products, services, professionals, appointments) continuam respondendo HTTP 200',
      `products=${productsRes.status}, services=${servicesRes.status}, professionals=${professionalsRes.status}, appointments=${appointmentsRes.status}`
    );
  } finally {
    // Guarantee Una Ótica remains with restaurant_tables: false
    const superAdmin = await repo.findUserByEmail('admin@localhub.com');
    if (superAdmin) {
      await repo.updateTenantFeatureOverrides(
        UNA_OTICA_ID,
        { restaurant_tables: false },
        superAdmin
      );
    }
    server.close();
  }

  console.log('\n==================================================================');
  console.log(`RESULTADO FINAL: ${passed} testes aprovados, ${failed} falhas.`);
  console.log('==================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Erro fatal na execução dos testes:', err);
  process.exit(1);
});
