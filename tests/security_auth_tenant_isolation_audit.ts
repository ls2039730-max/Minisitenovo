import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { apiRouter } from '../server/routes.js';
import { repo } from '../server/db/repository.js';
import { productRepo } from '../server/db/productRepository.js';
import { orderRepo } from '../server/db/orderRepository.js';
import { deliveryHubRepo } from '../server/db/deliveryHubRepository.js';
import { generateSessionToken } from '../server/auth/tokenService.js';
import { supabaseAdmin, localStore } from '../server/supabaseAdmin.js';

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordResult(id: string, name: string, passed: boolean, details: string) {
  results.push({ id, name, passed, details });
  const badge = passed ? 'PASS' : 'FAIL';
  console.log(`[${badge}] ${id} - ${name}: ${details}`);
}

async function startTestServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use('/api', apiRouter);

  return new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      const baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve({
        baseUrl,
        close: () => new Promise<void>((resClose) => server.close(() => resClose())),
      });
    });
  });
}

async function apiReq(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    token?: string;
    cookie?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.cookie) {
    headers['Cookie'] = options.cookie;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const setCookie = res.headers.get('set-cookie') || '';
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, setCookie };
}

async function runSecurityAudit() {
  console.log('================================================================================');
  console.log('AUDITORIA DE SEGURANÇA: AUTENTICAÇÃO, SESSÃO E ISOLAMENTO MULTI-TENANT (A - G)');
  console.log('================================================================================\n');

  const { baseUrl, close } = await startTestServer();

  const TENANT_A_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // Barbearia Prime
  const TENANT_B_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; // Bistrô Dona Maria

  try {
    // Snapshot initial users count to verify no phantom users are created during failed logins
    const { data: initialUsersList } = await supabaseAdmin.auth.admin.listUsers();
    const initialUserCount = initialUsersList?.users?.length || 0;

    // =========================================================================
    // TESTE A — Login inválido após login válido (Cenário exato do incidente)
    // =========================================================================
    {
      // 1. Valid login on Tenant A
      const validLogin = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'contato@barbeariaprime.com', password: 'cliente123' },
      });

      const tokenA = validLogin.data?.token;
      const cookieMatch = validLogin.setCookie.match(/saas_auth_token=([^;]+)/);
      const cookieA = cookieMatch ? `saas_auth_token=${cookieMatch[1]}` : '';

      const step1Ok =
        validLogin.status === 200 &&
        Boolean(tokenA) &&
        validLogin.data?.user?.tenantId === TENANT_A_ID;

      // 2. Scenario A1: User returns to login screen (even if prior token/cookie is still present in request)
      // and enters a random email + wrong password
      const randomEmail = `invasor.${Date.now()}@dominioaleatorio.com`;
      const invalidAfterValid = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        token: tokenA,
        cookie: cookieA,
        body: { email: randomEmail, password: 'senha_totalmente_incorreta_123' },
      });

      // Verify login is rejected with 401 and no token/user/tenant is returned
      const rejectedOk =
        invalidAfterValid.status === 401 &&
        invalidAfterValid.data?.success === false &&
        !invalidAfterValid.data?.token &&
        !invalidAfterValid.data?.user &&
        !invalidAfterValid.data?.tenant;

      // Verify that the previous tokenA was automatically revoked when the new login was attempted!
      const meWithOldToken = await apiReq(baseUrl, '/api/auth/me', {
        token: tokenA,
        cookie: cookieA,
      });

      // 3. Scenario A2: Valid login -> explicit Logout -> invalid login with random email + wrong password
      const validLogin2 = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'contato@barbeariaprime.com', password: 'cliente123' },
      });
      const tokenA2 = validLogin2.data?.token;

      const logoutRes = await apiReq(baseUrl, '/api/auth/logout', {
        method: 'POST',
        token: tokenA2,
      });

      const invalidAfterLogout = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: `outro.aleatorio.${Date.now()}@teste.com`, password: 'errada999' },
      });

      const passed =
        step1Ok &&
        rejectedOk &&
        meWithOldToken.status === 401 &&
        logoutRes.status === 200 &&
        invalidAfterLogout.status === 401 &&
        !invalidAfterLogout.data?.token &&
        !invalidAfterLogout.data?.user;

      recordResult(
        'Teste A',
        'Login inválido após login válido (com e sem logout explícito)',
        passed,
        `Login válido HTTP ${validLogin.status} -> Tentativa inválida HTTP ${invalidAfterValid.status} (token anterior revogado HTTP ${meWithOldToken.status}) -> Pós-logout inválido HTTP ${invalidAfterLogout.status}`
      );
    }

    // =========================================================================
    // TESTE B — Login inválido sem sessão anterior (E-mail inexistente, senha errada, tentativa de escalonamento "admin")
    // =========================================================================
    {
      // B1: Non-existent random email
      const resRandom = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: `inexistente.${Date.now()}@naoexiste.org`, password: 'qualquer_senha' },
      });

      // B2: Non-existent email containing "admin" (testing former substring escalation vulnerability)
      const resFakeAdmin = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: `hacker.superadmin.${Date.now()}@evil.com`, password: 'admin123' },
      });

      // B3: Legitimate tenant user email with wrong password (testing former password-overwrite vulnerability)
      const resWrongPassClient = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'contato@barbeariaprime.com', password: 'SENHA_ERRADA_NAO_SOBRESCREVER' },
      });

      // B4: Legitimate Super Admin email with wrong password
      const resWrongPassAdmin = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'admin@localhub.com', password: 'SENHA_ERRADA_ADMIN' },
      });

      // B5: Verify legitimate user's password was NOT overwritten and still works
      const verifyLegitStillWorks = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'contato@barbeariaprime.com', password: 'cliente123' },
      });
      if (verifyLegitStillWorks.data?.token) {
        await apiReq(baseUrl, '/api/auth/logout', {
          method: 'POST',
          token: verifyLegitStillWorks.data.token,
        });
      }

      // B6: Verify no new users were auto-created in auth.users
      const { data: afterUsersList } = await supabaseAdmin.auth.admin.listUsers();
      const afterUserCount = afterUsersList?.users?.length || 0;

      const passed =
        resRandom.status === 401 &&
        resFakeAdmin.status === 401 &&
        resWrongPassClient.status === 401 &&
        resWrongPassAdmin.status === 401 &&
        verifyLegitStillWorks.status === 200 &&
        afterUserCount === initialUserCount;

      recordResult(
        'Teste B',
        'Login inválido sem sessão anterior (bloqueio de auto-criação e proteção de senha)',
        passed,
        `E-mail inexistente HTTP ${resRandom.status}, Fake admin HTTP ${resFakeAdmin.status}, Senha incorreta cliente HTTP ${resWrongPassClient.status}, Senha incorreta admin HTTP ${resWrongPassAdmin.status}, Senha original preservada HTTP ${verifyLegitStillWorks.status}, Usuários no banco: antes=${initialUserCount} / depois=${afterUserCount}`
      );
    }

    // =========================================================================
    // TESTE C — Troca de usuário (Empresa A -> Logout -> Empresa B)
    // =========================================================================
    {
      // 1. Login in Empresa A (Barbearia Prime)
      const loginA = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'contato@barbeariaprime.com', password: 'cliente123' },
      });
      const tokenA = loginA.data?.token;
      const meA = await apiReq(baseUrl, '/api/auth/me', { token: tokenA });
      const prodsA = await apiReq(baseUrl, '/api/products', { token: tokenA });

      const allProdsBelongToA =
        Array.isArray(prodsA.data?.data) &&
        prodsA.data.data.every((p: any) => p.tenantId === TENANT_A_ID);

      // 2. Logout from Empresa A
      const logoutA = await apiReq(baseUrl, '/api/auth/logout', {
        method: 'POST',
        token: tokenA,
      });

      // 3. Login in Empresa B (Bistrô Dona Maria)
      const loginB = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'maria@bistro.com', password: 'cliente123' },
      });
      const tokenB = loginB.data?.token;
      const meB = await apiReq(baseUrl, '/api/auth/me', { token: tokenB });
      const prodsB = await apiReq(baseUrl, '/api/products', { token: tokenB });
      const ordersB = await apiReq(baseUrl, '/api/orders', { token: tokenB });

      const allProdsBelongToB =
        Array.isArray(prodsB.data?.data) &&
        prodsB.data.data.every((p: any) => p.tenantId === TENANT_B_ID);
      const allOrdersBelongToB =
        Array.isArray(ordersB.data?.data) &&
        ordersB.data.data.every((o: any) => o.tenantId === TENANT_B_ID);

      await apiReq(baseUrl, '/api/auth/logout', { method: 'POST', token: tokenB });

      const passed =
        loginA.status === 200 &&
        meA.data?.tenant?.id === TENANT_A_ID &&
        meA.data?.tenant?.name === 'Barbearia Prime' &&
        allProdsBelongToA &&
        logoutA.status === 200 &&
        loginB.status === 200 &&
        meB.data?.user?.tenantId === TENANT_B_ID &&
        meB.data?.tenant?.id === TENANT_B_ID &&
        meB.data?.tenant?.name === 'Bistrô Dona Maria' &&
        allProdsBelongToB &&
        allOrdersBelongToB;

      recordResult(
        'Teste C',
        'Troca de usuário entre empresas (Empresa A -> Logout -> Empresa B)',
        passed,
        `Sessão A: ${meA.data?.tenant?.name} (${TENANT_A_ID}) -> Logout HTTP ${logoutA.status} -> Sessão B: ${meB.data?.tenant?.name} (${TENANT_B_ID}), Zero vazamento de produtos/pedidos de A em B`
      );
    }

    // =========================================================================
    // TESTE D — Tentativa de reutilizar sessão antiga ou cookie após logout
    // =========================================================================
    {
      const loginRes = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'contato@barbeariaprime.com', password: 'cliente123' },
      });
      const oldToken = loginRes.data?.token;
      const oldCookie = `saas_auth_token=${oldToken}`;

      // Perform logout
      await apiReq(baseUrl, '/api/auth/logout', {
        method: 'POST',
        token: oldToken,
        cookie: oldCookie,
      });

      // Attempt to reuse oldToken via Bearer header AND Cookie across private routes
      const tryMe = await apiReq(baseUrl, '/api/auth/me', { token: oldToken, cookie: oldCookie });
      const tryTenant = await apiReq(baseUrl, `/api/tenants/${TENANT_A_ID}`, { token: oldToken, cookie: oldCookie });
      const tryOrders = await apiReq(baseUrl, '/api/orders', { token: oldToken, cookie: oldCookie });
      const tryProducts = await apiReq(baseUrl, '/api/products', { token: oldToken, cookie: oldCookie });
      const tryDeliveryHub = await apiReq(baseUrl, '/api/delivery-hub/overview', { token: oldToken, cookie: oldCookie });
      const tryNoToken = await apiReq(baseUrl, '/api/orders');

      const passed =
        tryMe.status === 401 &&
        tryTenant.status === 401 &&
        tryOrders.status === 401 &&
        tryProducts.status === 401 &&
        tryDeliveryHub.status === 401 &&
        tryNoToken.status === 401;

      recordResult(
        'Teste D',
        'Bloqueio de reutilização de token/cookie revogado após logout em rotas privadas',
        passed,
        `/auth/me=${tryMe.status}, /tenants=${tryTenant.status}, /orders=${tryOrders.status}, /products=${tryProducts.status}, /delivery-hub/overview=${tryDeliveryHub.status}, sem token=${tryNoToken.status}`
      );
    }

    // =========================================================================
    // TESTE E — Falha durante autenticação e bloqueio de auto-vínculo (zero fallback)
    // =========================================================================
    {
      // 1. Missing password / empty credentials
      const emptyLogin = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'contato@barbeariaprime.com', password: '' },
      });

      // 2. Create an auth_user in localStore without any tenant_users link, and verify login does NOT auto-link to Tenant 1!
      const orphanEmail = `orphan.${Date.now()}@semtenant.com`;
      const { data: orphanCreated } = await supabaseAdmin.auth.admin.createUser({
        email: orphanEmail,
        password: 'OrphanPass!123',
        email_confirm: true,
        user_metadata: { name: 'Usuário Sem Empresa' },
      });
      const orphanId = orphanCreated?.user?.id;

      const orphanLogin = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: orphanEmail, password: 'OrphanPass!123' },
      });

      // Verify no tenant_users record was created for orphanId
      const { data: orphanTu } = await supabaseAdmin
        .from('tenant_users')
        .select('*')
        .eq('user_id', orphanId);

      // Clean up orphan user
      if (orphanId) {
        await supabaseAdmin.auth.admin.deleteUser(orphanId);
      }

      // 3. Verify /api/auth/self-assign-tenant is blocked (403)
      const loginClient = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'contato@barbeariaprime.com', password: 'cliente123' },
      });
      const tokenClient = loginClient.data?.token;
      const selfAssignRes = await apiReq(baseUrl, '/api/auth/self-assign-tenant', {
        method: 'POST',
        token: tokenClient,
      });
      await apiReq(baseUrl, '/api/auth/logout', { method: 'POST', token: tokenClient });

      const passed =
        emptyLogin.status === 400 &&
        orphanLogin.status === 401 &&
        (!orphanTu || orphanTu.length === 0) &&
        selfAssignRes.status === 403;

      recordResult(
        'Teste E',
        'Zero fallback para última sessão ou primeira empresa ativa em falhas de autenticação',
        passed,
        `Credenciais vazias HTTP ${emptyLogin.status}, Usuário sem empresa HTTP ${orphanLogin.status} (vínculos criados=${orphanTu?.length || 0}), /auth/self-assign-tenant HTTP ${selfAssignRes.status}`
      );
    }

    // =========================================================================
    // TESTE F — Isolamento Multi-Tenant completo (Empresa A vs Empresa B)
    // =========================================================================
    {
      // Ensure Empresa B has a product, an order, and a delivery route to test direct ID & cross-tenant access
      const userBObj = await repo.findUserByEmail('maria@bistro.com');
      const prodB = await productRepo.createProduct(
        TENANT_B_ID,
        {
          name: 'Prato Executivo Secreto Bistrô',
          price: 89.9,
          isActive: true,
          trackStock: false,
          stockQuantity: 10,
          allowOutOfStock: true,
        },
        userBObj!
      );

      // Ensure delivery & shopping_cart features are enabled for both A and B during test
      const superAdmin = await repo.findUserByEmail('admin@localhub.com');
      await repo.updateTenantFeatureOverrides(
        TENANT_A_ID,
        { products: true, shopping_cart: true, delivery: true, site_editor: true },
        superAdmin!
      );
      await repo.updateTenantFeatureOverrides(
        TENANT_B_ID,
        { products: true, shopping_cart: true, delivery: true, site_editor: true },
        superAdmin!
      );

      await orderRepo.updateDeliverySettings(
        TENANT_B_ID,
        {
          ordersEnabled: true,
          acceptOrdersWhenClosed: true,
          pickupEnabled: true,
          deliveryEnabled: true,
          minimumOrder: 0,
        },
        userBObj!
      );

      await orderRepo.createDeliveryRule(
        TENANT_B_ID,
        {
          type: 'fixed',
          name: 'Taxa Fixa Bistrô',
          fee: 10,
          minimumOrder: 0,
          isActive: true,
        },
        userBObj!
      );

      const orderBCreated = await orderRepo.createOrder(
        'bistro-dona-maria',
        {
          customerName: 'Cliente Exclusivo Bistrô B',
          customerPhone: '21999998888',
          fulfillmentType: 'delivery',
          paymentMethod: 'PIX',
          items: [{ productId: prodB.id, quantity: 1 }],
          deliveryAddress: {
            street: 'Avenida Atlântica',
            number: '1702',
            neighborhood: 'Copacabana',
            city: 'Rio de Janeiro',
            state: 'RJ',
            cep: '22021-001',
            latitude: -22.9694,
            longitude: -43.1785,
          },
        },
        '127.0.0.1'
      );
      const orderBId = orderBCreated.order.id;

      const routeB = await deliveryHubRepo.createRoute(
        TENANT_B_ID,
        {
          name: 'Rota Exclusiva Bistrô B',
          orderIds: [orderBId],
          optimizeOrder: false,
        },
        userBObj!
      );

      // Login as User A (Barbearia Prime)
      const loginA = await apiReq(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'contato@barbeariaprime.com', password: 'cliente123' },
      });
      const tokenA = loginA.data?.token;

      // 1. Attempt to read/modify Tenant B profile & users
      const getTenantB = await apiReq(baseUrl, `/api/tenants/${TENANT_B_ID}`, { token: tokenA });
      const putTenantB = await apiReq(baseUrl, `/api/tenants/${TENANT_B_ID}`, {
        method: 'PUT',
        token: tokenA,
        body: { name: 'Tentativa Invasão' },
      });
      const getUsersB = await apiReq(baseUrl, `/api/tenants/${TENANT_B_ID}/users`, { token: tokenA });

      // 2. Attempt to inject Tenant B ID via query, header, or body on protected endpoints
      const queryInjectOrders = await apiReq(baseUrl, `/api/orders?tenantId=${TENANT_B_ID}`, { token: tokenA });
      const headerInjectProducts = await apiReq(baseUrl, '/api/products', {
        token: tokenA,
        headers: { 'x-tenant-id': TENANT_B_ID },
      });
      const bodyInjectSettings = await apiReq(baseUrl, '/api/delivery/settings', {
        method: 'PUT',
        token: tokenA,
        body: { tenantId: TENANT_B_ID, minimumOrder: 999 },
      });
      const bodyInjectUpload = await apiReq(baseUrl, '/api/upload', {
        method: 'POST',
        token: tokenA,
        body: {
          tenantId: TENANT_B_ID,
          fileName: 'hack.png',
          fileBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
      });

      // 3. Attempt direct ID access to Tenant B's Order, Product, and Delivery Route using User A's token
      const getOrderBByA = await apiReq(baseUrl, `/api/orders/${orderBId}`, { token: tokenA });
      const patchOrderBByA = await apiReq(baseUrl, `/api/orders/${orderBId}/status`, {
        method: 'PATCH',
        token: tokenA,
        body: { status: 'cancelled' },
      });
      const getProdBByA = await apiReq(baseUrl, `/api/products/${prodB.id}`, { token: tokenA });
      const putProdBByA = await apiReq(baseUrl, `/api/products/${prodB.id}`, {
        method: 'PUT',
        token: tokenA,
        body: { name: 'Hackeado', price: 1 },
      });
      const getRouteBByA = await apiReq(baseUrl, `/api/delivery-hub/routes/${routeB.id}`, { token: tokenA });
      const previewDraftBByA = await apiReq(baseUrl, '/api/site/preview/bistro-dona-maria', { token: tokenA });

      // 4. Attempt Super Admin endpoints using User A's token
      const getGlobalTenantsByA = await apiReq(baseUrl, '/api/tenants', { token: tokenA });
      const getGlobalUsersByA = await apiReq(baseUrl, '/api/users', { token: tokenA });
      const getAuditLogsByA = await apiReq(baseUrl, '/api/audit-logs', { token: tokenA });
      const impersonateBByA = await apiReq(baseUrl, `/api/auth/impersonate/${TENANT_B_ID}`, {
        method: 'POST',
        token: tokenA,
      });

      await apiReq(baseUrl, '/api/auth/logout', { method: 'POST', token: tokenA });

      // Clean up test artifacts in Tenant B
      await deliveryHubRepo.cancelRoute(TENANT_B_ID, routeB.id, userBObj!).catch(() => {});
      localStore.delivery_routes = localStore.delivery_routes.filter((r: any) => r.id !== routeB.id);
      await orderRepo.deleteOrder(TENANT_B_ID, orderBId, userBObj!).catch(() => {});
      await productRepo.deleteProduct(prodB.id, TENANT_B_ID, userBObj!).catch(() => {});

      const passed =
        getTenantB.status === 403 &&
        putTenantB.status === 403 &&
        getUsersB.status === 403 &&
        queryInjectOrders.status === 403 &&
        headerInjectProducts.status === 403 &&
        bodyInjectSettings.status === 403 &&
        bodyInjectUpload.status === 403 &&
        getOrderBByA.status === 404 &&
        patchOrderBByA.status === 400 &&
        getProdBByA.status === 404 &&
        putProdBByA.status === 400 &&
        getRouteBByA.status === 404 &&
        previewDraftBByA.status === 403 &&
        getGlobalTenantsByA.status === 403 &&
        getGlobalUsersByA.status === 403 &&
        getAuditLogsByA.status === 403 &&
        impersonateBByA.status === 403;

      recordResult(
        'Teste F',
        'Isolamento Multi-Tenant estrito (bloqueio cruzado de pedidos, produtos, rotas, arquivos, rascunho e Super Admin)',
        passed,
        `TenantB=${getTenantB.status}/${putTenantB.status}, UsersB=${getUsersB.status}, Query/Header/Body Inject=${queryInjectOrders.status}/${headerInjectProducts.status}/${bodyInjectSettings.status}/${bodyInjectUpload.status}, OrderB=${getOrderBByA.status}, ProdB=${getProdBByA.status}, RouteB=${getRouteBByA.status}, DraftB=${previewDraftBByA.status}, SuperAdmin=${getGlobalTenantsByA.status}/${impersonateBByA.status}`
      );
    }

    // =========================================================================
    // TESTE G — Expiração, adulteração de token, inconsistência de claim e revogação
    // =========================================================================
    {
      const userA = await repo.findUserByEmail('contato@barbeariaprime.com');

      // 1. Expired JWT token (-5s)
      const expiredToken = generateSessionToken(userA!, undefined, -5);
      const resExpired = await apiReq(baseUrl, '/api/auth/me', { token: expiredToken });

      // 2. Forged JWT token signed with wrong secret
      const forgedToken = jwt.sign(
        { userId: userA!.id, email: userA!.email, role: 'SUPER_ADMIN', tenantId: null },
        'wrong-secret-key-attacker',
        { expiresIn: '1h' }
      );
      const resForged = await apiReq(baseUrl, '/api/auth/me', { token: forgedToken });

      // 3. Token with mismatched tenantId claim (User A claiming Tenant B)
      const mismatchedClaimToken = generateSessionToken({
        ...userA!,
        tenantId: TENANT_B_ID,
      });
      const resMismatchedClaim = await apiReq(baseUrl, '/api/auth/me', { token: mismatchedClaimToken });

      // 4. Token for non-existent / deleted user ID
      const phantomToken = generateSessionToken({
        id: '99999999-9999-4999-8999-999999999999',
        name: 'Fantasma',
        email: 'fantasma@teste.com',
        role: 'CLIENT_ADMIN',
        tenantId: TENANT_A_ID,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
      const resPhantom = await apiReq(baseUrl, '/api/auth/me', { token: phantomToken });

      const passed =
        resExpired.status === 401 &&
        resForged.status === 401 &&
        resMismatchedClaim.status === 401 &&
        resPhantom.status === 401;

      recordResult(
        'Teste G',
        'Expiração de JWT, assinatura inválida, claim de tenant adulterada e usuário inexistente',
        passed,
        `Expirado HTTP ${resExpired.status}, Assinatura inválida HTTP ${resForged.status}, Claim tenantId adulterada HTTP ${resMismatchedClaim.status}, Usuário inexistente HTTP ${resPhantom.status}`
      );
    }

    console.log('\n================================================================================');
    const passedCount = results.filter((r) => r.passed).length;
    console.log(`RESULTADO FINAL: ${passedCount}/${results.length} testes de segurança aprovados.`);
    console.log('================================================================================');

    if (passedCount !== results.length) {
      process.exitCode = 1;
    }
  } finally {
    await close();
  }
}

runSecurityAudit().catch((err) => {
  console.error('Erro fatal na auditoria de segurança:', err);
  process.exit(1);
});
