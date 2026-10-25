import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_BASE_DOMAIN,
  getConfiguredBaseDomain,
  getTenantSubdomain,
  getPublicStoreUrl,
  getLegacyPublicStoreUrl,
  resolveSlugFromHostname,
} from '../src/utils/url.js';
import {
  getTenantSubdomainSlug,
  getPublicSlugFromUrl,
  CROSS_TENANT_BLOCKED_SENTINEL,
} from '../src/App.js';
import {
  getServerBaseDomain,
  resolveSlugFromHost,
  extractTenantSlugFromRequest,
} from '../server/tenantResolver.js';
import { handlePublicSiteHtml } from '../server/seoRenderer.js';
import { buildTableCatalogUrl } from '../src/utils/qrCodeGenerator.js';
import { repo } from '../server/db/repository.js';
import { siteRepo } from '../server/db/siteRepository.js';
import { bootstrapDatabaseIfNeeded } from '../server/db/bootstrap.js';
import { supabaseAdmin } from '../server/supabaseAdmin.js';

function createMockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body = '';
  return {
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    send(payload: string) {
      body = payload;
      return this;
    },
    getStatusCode: () => statusCode,
    getBody: () => body,
    getHeaders: () => headers,
  };
}

async function runTests() {
  console.log('================================================================');
  console.log('SUITE DE TESTES E2E — SUBDOMÍNIOS MINIHUB.TECH (10 CENÁRIOS)');
  console.log('================================================================\n');

  // Execute bootstrap to ensure Supabase tenant subdomains are normalized to {slug}.minihub.tech
  await bootstrapDatabaseIfNeeded();

  let passed = 0;

  // TESTE 1: "https://una-otica.minihub.tech/" abre o site público sem login
  console.log('Teste 1: "https://una-otica.minihub.tech/" abre o site público sem exigir login...');
  assert.equal(getTenantSubdomainSlug('una-otica.minihub.tech'), 'una-otica');
  assert.equal(getPublicSlugFromUrl('una-otica.minihub.tech', '/'), 'una-otica');

  const resPublicSubdomain = createMockRes();
  await handlePublicSiteHtml(
    {
      headers: { host: 'una-otica.minihub.tech', 'x-forwarded-proto': 'https' },
      get: (h: string) => (h.toLowerCase() === 'host' ? 'una-otica.minihub.tech' : ''),
      path: '/',
      originalUrl: '/',
      url: '/',
      query: {},
    } as any,
    resPublicSubdomain as any
  );
  assert.equal(resPublicSubdomain.getStatusCode(), 200);
  const htmlUnaOtica = resPublicSubdomain.getBody();
  assert.ok(htmlUnaOtica.includes('Una Ótica'), 'Deve renderizar o HTML público da Una Ótica');
  assert.ok(
    htmlUnaOtica.includes('window.__INITIAL_TENANT_SLUG__ = "una-otica"'),
    'Deve injetar __INITIAL_TENANT_SLUG__ para inicialização imediata sem login'
  );

  // Testar também via requisição HTTP real ao servidor Express local na porta 3000
  const httpRes1 = await fetch('http://127.0.0.1:3000/', {
    headers: {
      Host: 'una-otica.minihub.tech',
      'X-Forwarded-Host': 'una-otica.minihub.tech',
      'X-Forwarded-Proto': 'https',
    },
  });
  assert.equal(httpRes1.status, 200);
  const httpHtml1 = await httpRes1.text();
  assert.ok(httpHtml1.includes('Una Ótica'), 'Servidor HTTP na porta 3000 deve responder com o site da Una Ótica sem login');

  // E a API pública do site responde 200 sem token de autenticação
  const publicApiRes = await fetch('http://127.0.0.1:3000/api/site/public/una-otica', {
    headers: { Host: 'una-otica.minihub.tech' },
  });
  assert.equal(publicApiRes.status, 200);
  const publicApiJson: any = await publicApiRes.json();
  assert.equal(publicApiJson.success, true);
  assert.equal(publicApiJson.tenant.slug, 'una-otica');
  passed++;
  console.log('   ✅ [PASS] "https://una-otica.minihub.tech/" identifica "una-otica" e abre o site público sem login.\n');

  // TESTE 2: "https://minihub.tech/" continua abrindo a plataforma principal
  console.log('Teste 2: "https://minihub.tech/" continua abrindo a plataforma principal...');
  assert.equal(resolveSlugFromHost('minihub.tech'), null);
  assert.equal(resolveSlugFromHost('www.minihub.tech'), null);
  assert.equal(resolveSlugFromHostname('minihub.tech'), null);
  assert.equal(resolveSlugFromHostname('www.minihub.tech'), null);
  assert.equal(getPublicSlugFromUrl('minihub.tech', '/'), null);
  assert.equal(getPublicSlugFromUrl('www.minihub.tech', '/'), null);

  const mainHttpRes = await fetch('http://127.0.0.1:3000/', {
    headers: {
      Host: 'minihub.tech',
      'X-Forwarded-Host': 'minihub.tech',
      'X-Forwarded-Proto': 'https',
    },
  });
  assert.equal(mainHttpRes.status, 200);
  const mainHtml = await mainHttpRes.text();
  assert.equal(
    mainHtml.includes('window.__INITIAL_TENANT_SLUG__'),
    false,
    'Domínio raiz minihub.tech NÃO deve injetar tenant público na raiz'
  );
  passed++;
  console.log('   ✅ [PASS] "https://minihub.tech/" e "https://www.minihub.tech/" abrem a plataforma principal.\n');

  // TESTE 3: A área administrativa continua protegida por autenticação
  console.log('Teste 3: A área administrativa continua protegida por autenticação...');
  const unauthTenantsRes = await fetch('http://127.0.0.1:3000/api/tenants');
  assert.equal(unauthTenantsRes.status, 401, 'GET /api/tenants sem token deve retornar 401');

  const unauthMeRes = await fetch('http://127.0.0.1:3000/api/auth/me');
  assert.equal(unauthMeRes.status, 401, 'GET /api/auth/me sem token deve retornar 401');

  const unauthOrdersRes = await fetch('http://127.0.0.1:3000/api/orders');
  assert.equal(unauthOrdersRes.status, 401, 'GET /api/orders administrativo sem token deve retornar 401');
  passed++;
  console.log('   ✅ [PASS] Rotas administrativas (/api/tenants, /api/auth/me, /api/orders) bloqueiam acesso não autenticado com HTTP 401.\n');

  // TESTE 4: Uma empresa inexistente retorna uma página 404 apropriada
  console.log('Teste 4: Subdomínio de empresa inexistente retorna página 404 apropriada...');
  const nonExistentHost = 'empresa-inexistente-99999.minihub.tech';
  assert.equal(getPublicSlugFromUrl(nonExistentHost, '/'), 'empresa-inexistente-99999');

  const http404Res = await fetch('http://127.0.0.1:3000/', {
    headers: {
      Host: nonExistentHost,
      'X-Forwarded-Host': nonExistentHost,
      'X-Forwarded-Proto': 'https',
    },
  });
  assert.equal(http404Res.status, 404);
  const html404 = await http404Res.text();
  assert.ok(html404.includes('Página não encontrada'), 'Deve retornar 404 Página não encontrada');

  const api404Res = await fetch('http://127.0.0.1:3000/api/site/public/empresa-inexistente-99999');
  assert.equal(api404Res.status, 404);
  passed++;
  console.log('   ✅ [PASS] Subdomínio inexistente retorna HTTP 404 no servidor e na API pública.\n');

  // TESTE 5: Os dados públicos carregados pertencem ao slug identificado pelo hostname (e isolamento entre tenants)
  console.log('Teste 5: Dados públicos carregados pertencem estritamente ao hostname e bloqueiam acesso cruzado...');
  const unaSite = await siteRepo.getPublicSiteBySlug('una-otica');
  const costelaSite = await siteRepo.getPublicSiteBySlug('costela-mania');
  assert.ok(unaSite && unaSite.tenant);
  assert.ok(costelaSite && costelaSite.tenant);
  assert.notEqual(unaSite.tenant.id, costelaSite.tenant.id);
  assert.equal(unaSite.tenant.slug, 'una-otica');
  assert.equal(costelaSite.tenant.slug, 'costela-mania');

  // Bloqueio de tentativa de acesso cruzado no frontend e no backend
  assert.equal(
    getPublicSlugFromUrl('una-otica.minihub.tech', '/p/costela-mania'),
    CROSS_TENANT_BLOCKED_SENTINEL
  );
  assert.equal(
    getPublicSlugFromUrl('una-otica.minihub.tech', '/costela-mania'),
    CROSS_TENANT_BLOCKED_SENTINEL
  );

  const crossHttpRes = await fetch('http://127.0.0.1:3000/p/costela-mania', {
    headers: {
      Host: 'una-otica.minihub.tech',
      'X-Forwarded-Host': 'una-otica.minihub.tech',
      'X-Forwarded-Proto': 'https',
    },
  });
  assert.equal(crossHttpRes.status, 404, 'Acesso cruzado via subdomínio deve retornar 404');
  passed++;
  console.log('   ✅ [PASS] Dados isolados por tenant e acesso cruzado bloqueado com 404.\n');

  // TESTE 6: "getPublicStoreUrl('una-otica')" retorna "https://una-otica.minihub.tech"
  console.log('Teste 6: Verificando getPublicStoreUrl("una-otica")...');
  assert.equal(DEFAULT_BASE_DOMAIN, 'minihub.tech');
  assert.equal(getConfiguredBaseDomain(), 'minihub.tech');
  assert.equal(getServerBaseDomain(), 'minihub.tech');
  assert.equal(getPublicStoreUrl('una-otica'), 'https://una-otica.minihub.tech');
  assert.equal(getPublicStoreUrl('costela-mania'), 'https://costela-mania.minihub.tech');
  assert.equal(getPublicStoreUrl('drogaria-central'), 'https://drogaria-central.minihub.tech');
  passed++;
  console.log('   ✅ [PASS] getPublicStoreUrl("una-otica") === "https://una-otica.minihub.tech".\n');

  // TESTE 7: Os links gerados pelo Super Admin (e registros no banco Supabase) utilizam o novo padrão
  console.log('Teste 7: Verificando links e subdomínios de todas as empresas no Super Admin e no Supabase...');
  const { data: dbTenants } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, subdomain')
    .is('deleted_at', null);

  assert.ok(dbTenants && dbTenants.length > 0, 'Deve haver empresas ativas no Supabase');
  for (const t of dbTenants) {
    const expectedSubdomain = `${t.slug}.minihub.tech`;
    assert.equal(
      t.subdomain,
      expectedSubdomain,
      `Tenant "${t.name}" (${t.slug}) no Supabase deve ter subdomain="${expectedSubdomain}"`
    );
    assert.equal(getTenantSubdomain(t.slug), expectedSubdomain);
    assert.equal(getPublicStoreUrl(t.slug), `https://${expectedSubdomain}`);
  }
  passed++;
  console.log(`   ✅ [PASS] Todas as ${dbTenants.length} empresas no Supabase e no Super Admin usam {slug}.minihub.tech.\n`);

  // TESTE 8: Os links gerados pelo painel do cliente e QR Codes utilizam o novo padrão
  console.log('Teste 8: Verificando links gerados pelo painel do cliente e QR Codes...');
  const unaTenantFormatted = await repo.getTenantBySlug('una-otica');
  assert.ok(unaTenantFormatted);
  assert.equal(unaTenantFormatted.subdomain, 'una-otica.minihub.tech');
  assert.equal(getPublicStoreUrl(unaTenantFormatted.slug), 'https://una-otica.minihub.tech');
  assert.equal(
    buildTableCatalogUrl(unaTenantFormatted.slug, 'tok-mesa-1'),
    'https://una-otica.minihub.tech/?mesa=tok-mesa-1&r=una-otica'
  );
  passed++;
  console.log('   ✅ [PASS] Painel do cliente e QR Codes utilizam https://{slug}.minihub.tech.\n');

  // TESTE 9: As URLs antigas ("/p/:slug") continuam funcionando quando acessadas
  console.log('Teste 9: Verificando compatibilidade com URLs antigas ("/p/:slug")...');
  assert.equal(
    getLegacyPublicStoreUrl('una-otica', 'https://minisitenovo.vercel.app'),
    'https://minisitenovo.vercel.app/p/una-otica'
  );
  assert.equal(getPublicSlugFromUrl('minisitenovo.vercel.app', '/p/una-otica'), 'una-otica');
  assert.equal(getPublicSlugFromUrl('minihub.tech', '/p/una-otica'), 'una-otica');

  const legacyHttpRes = await fetch('http://127.0.0.1:3000/p/una-otica', {
    headers: {
      Host: 'minisitenovo.vercel.app',
      'X-Forwarded-Host': 'minisitenovo.vercel.app',
      'X-Forwarded-Proto': 'https',
    },
  });
  assert.equal(legacyHttpRes.status, 200);
  const legacyHtml = await legacyHttpRes.text();
  assert.ok(legacyHtml.includes('Una Ótica'), 'URL legada /p/una-otica deve continuar renderizando a Una Ótica');
  passed++;
  console.log('   ✅ [PASS] URLs antigas (/p/una-otica) continuam funcionando perfeitamente.\n');

  // TESTE 10: Os metadados Open Graph e a URL canônica pertencem à empresa correta
  console.log('Teste 10: Verificando metadados Open Graph e URL canônica para una-otica.minihub.tech...');
  assert.ok(
    htmlUnaOtica.includes('<link rel="canonical" href="https://una-otica.minihub.tech" />'),
    'Canonical deve ser https://una-otica.minihub.tech'
  );
  assert.ok(
    htmlUnaOtica.includes('<meta property="og:url" content="https://una-otica.minihub.tech" />'),
    'og:url deve ser https://una-otica.minihub.tech'
  );
  assert.ok(
    htmlUnaOtica.includes('<meta property="og:site_name" content="Una Ótica" />'),
    'og:site_name deve ser Una Ótica'
  );
  assert.equal(
    resPublicSubdomain.getHeaders()['vary'],
    'Host, X-Forwarded-Host',
    'Header Vary deve isolar cache por Host'
  );
  passed++;
  console.log('   ✅ [PASS] Open Graph, Canonical URL e Vary: Host validados para Una Ótica.\n');

  console.log('================================================================');
  console.log(`RESULTADO FINAL: ${passed}/10 TESTES OBRIGATÓRIOS APROVADOS COM SUCESSO!`);
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('FALHA NOS TESTES:', err);
  process.exit(1);
});
