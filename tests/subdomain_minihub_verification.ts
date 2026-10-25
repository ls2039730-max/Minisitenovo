import assert from 'node:assert/strict';
import {
  DEFAULT_BASE_DOMAIN,
  getConfiguredBaseDomain,
  getTenantSubdomain,
  getPublicStoreUrl,
  getLegacyPublicStoreUrl,
  resolveSlugFromHostname,
} from '../src/utils/url.js';
import {
  getServerBaseDomain,
  resolveSlugFromHost,
  extractTenantSlugFromRequest,
} from '../server/tenantResolver.js';
import { handlePublicSiteHtml, buildTenantMetaTags } from '../server/seoRenderer.js';
import { buildTableCatalogUrl } from '../src/utils/qrCodeGenerator.js';
import { repo } from '../server/db/repository.js';
import { siteRepo } from '../server/db/siteRepository.js';

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
  console.log('TEST SUITE: SUBDOMÍNIOS PERSONALIZADOS COM MINIHUB.TECH');
  console.log('================================================================\n');

  let passed = 0;

  // 1. Geração de URL a partir do slug
  console.log('1. Testando geração centralizada de URLs a partir do slug...');
  assert.equal(DEFAULT_BASE_DOMAIN, 'minihub.tech');
  assert.equal(getConfiguredBaseDomain(), 'minihub.tech');
  assert.equal(getServerBaseDomain(), 'minihub.tech');

  assert.equal(getPublicStoreUrl('una-otica'), 'https://una-otica.minihub.tech');
  assert.equal(getPublicStoreUrl('drogaria-central'), 'https://drogaria-central.minihub.tech');
  assert.equal(getPublicStoreUrl('costela-mania'), 'https://costela-mania.minihub.tech');
  assert.equal(getPublicStoreUrl('restaurante-exemplo'), 'https://restaurante-exemplo.minihub.tech');
  assert.equal(getTenantSubdomain('una-otica'), 'una-otica.minihub.tech');

  // Garantir que NÃO acrescenta /p/una-otica ou /p/ ao final da URL do subdomínio
  assert.equal(getPublicStoreUrl('una-otica').endsWith('/p/una-otica'), false);
  assert.equal(getPublicStoreUrl('una-otica').endsWith('/p/'), false);
  passed++;
  console.log('   [OK] URLs geradas exatamente no formato https://{slug}.minihub.tech (sem /p/).\n');

  // 2. Resolução de tenant a partir de "una-otica.minihub.tech"
  console.log('2. Testando resolução de tenant a partir de "una-otica.minihub.tech"...');
  assert.equal(resolveSlugFromHost('una-otica.minihub.tech'), 'una-otica');
  assert.equal(resolveSlugFromHost('UNA-OTICA.MINIHUB.TECH:443'), 'una-otica');
  assert.equal(resolveSlugFromHostname('una-otica.minihub.tech'), 'una-otica');
  assert.equal(resolveSlugFromHostname('drogaria-central.minihub.tech'), 'drogaria-central');
  assert.equal(resolveSlugFromHostname('costela-mania.minihub.tech'), 'costela-mania');

  const extracted = extractTenantSlugFromRequest({
    headers: { host: 'una-otica.minihub.tech' },
    path: '/',
    query: {},
  });
  assert.equal(extracted.slug, 'una-otica');
  assert.equal(extracted.source, 'subdomain');
  assert.equal(extracted.isCustomDomainSubdomain, true);

  const unaOticaTenant = await repo.getTenantBySlug('una-otica');
  assert.ok(unaOticaTenant, 'Tenant "una-otica" deve existir no banco de dados');
  assert.equal(unaOticaTenant.slug, 'una-otica');
  assert.equal(unaOticaTenant.subdomain, 'una-otica.minihub.tech');

  const resSubdomainOk = createMockRes();
  await handlePublicSiteHtml(
    {
      headers: { host: 'una-otica.minihub.tech', 'x-forwarded-proto': 'https' },
      get: (h: string) => (h.toLowerCase() === 'host' ? 'una-otica.minihub.tech' : ''),
      path: '/',
      originalUrl: '/',
      url: '/',
      query: {},
    } as any,
    resSubdomainOk as any
  );
  assert.equal(resSubdomainOk.getStatusCode(), 200);
  assert.ok(resSubdomainOk.getBody().includes('Una Ótica'), 'HTML público deve conter os dados da Una Ótica');
  passed++;
  console.log('   [OK] Host "una-otica.minihub.tech" resolve o slug "una-otica" e carrega a Una Ótica do banco.\n');

  // 3. Subdomínio inexistente
  console.log('3. Testando comportamento para subdomínio inexistente...');
  const nonExistentHost = 'empresa-inexistente-99999.minihub.tech';
  assert.equal(resolveSlugFromHost(nonExistentHost), 'empresa-inexistente-99999');

  const resNotFound = createMockRes();
  await handlePublicSiteHtml(
    {
      headers: { host: nonExistentHost, 'x-forwarded-proto': 'https' },
      get: (h: string) => (h.toLowerCase() === 'host' ? nonExistentHost : ''),
      path: '/',
      originalUrl: '/',
      url: '/',
      query: {},
    } as any,
    resNotFound as any
  );
  assert.equal(resNotFound.getStatusCode(), 404);
  assert.ok(
    resNotFound.getBody().includes('Página não encontrada'),
    'Subdomínio inexistente deve retornar 404 Página não encontrada'
  );
  passed++;
  console.log('   [OK] Subdomínio inexistente retorna HTTP 404 com página apropriada.\n');

  // 4. Isolamento entre dois tenants diferentes
  console.log('4. Testando isolamento estrito entre dois tenants diferentes...');
  const resCrossTenant = createMockRes();
  await handlePublicSiteHtml(
    {
      headers: { host: 'una-otica.minihub.tech', 'x-forwarded-proto': 'https' },
      get: (h: string) => (h.toLowerCase() === 'host' ? 'una-otica.minihub.tech' : ''),
      path: '/p/costela-mania',
      originalUrl: '/p/costela-mania',
      url: '/p/costela-mania',
      query: {},
    } as any,
    resCrossTenant as any,
    'costela-mania'
  );
  assert.equal(resCrossTenant.getStatusCode(), 404);
  assert.ok(
    resCrossTenant.getBody().includes('Estabelecimento não encontrado'),
    'Acesso cruzado una-otica.minihub.tech/p/costela-mania deve ser bloqueado com 404'
  );
  assert.equal(
    resCrossTenant.getBody().includes('Costela Mania'),
    false,
    'Não deve vazar dados de outro tenant'
  );
  passed++;
  console.log('   [OK] Tentativa de acessar outro slug via subdomínio de um tenant é bloqueada com 404.\n');

  // 5. Compatibilidade com "/p/:slug"
  console.log('5. Testando compatibilidade retroativa com "/p/:slug"...');
  assert.equal(
    getLegacyPublicStoreUrl('una-otica', 'https://minisitenovo.vercel.app'),
    'https://minisitenovo.vercel.app/p/una-otica'
  );

  const resLegacyPath = createMockRes();
  await handlePublicSiteHtml(
    {
      headers: { host: 'minisitenovo.vercel.app', 'x-forwarded-proto': 'https' },
      get: (h: string) => (h.toLowerCase() === 'host' ? 'minisitenovo.vercel.app' : ''),
      path: '/p/una-otica',
      originalUrl: '/p/una-otica',
      url: '/p/una-otica',
      query: {},
    } as any,
    resLegacyPath as any,
    'una-otica'
  );
  assert.equal(resLegacyPath.getStatusCode(), 200);
  assert.ok(
    resLegacyPath.getBody().includes('Una Ótica'),
    'Rota legada /p/una-otica em minisitenovo.vercel.app deve continuar funcionando'
  );
  passed++;
  console.log('   [OK] Rota legada "/p/:slug" preservada e funcionando normalmente.\n');

  // 6. Geração de metadados Open Graph por empresa
  console.log('6. Testando geração de metadados SEO e Open Graph por empresa...');
  const htmlUnaOtica = resSubdomainOk.getBody();
  assert.ok(
    htmlUnaOtica.includes('<link rel="canonical" href="https://una-otica.minihub.tech" />'),
    'Canonical URL deve ser https://una-otica.minihub.tech sem /p/'
  );
  assert.ok(
    htmlUnaOtica.includes('<meta property="og:url" content="https://una-otica.minihub.tech" />'),
    'og:url deve ser https://una-otica.minihub.tech sem /p/'
  );
  assert.ok(
    htmlUnaOtica.includes('Una Ótica'),
    'og:title e og:site_name devem conter o nome da empresa Una Ótica'
  );
  assert.equal(
    resSubdomainOk.getHeaders()['vary'],
    'Host, X-Forwarded-Host',
    'Header Vary deve isolar cache por Host'
  );
  passed++;
  console.log('   [OK] Metadados Open Graph, Canonical URL e Vary: Host gerados corretamente por tenant.\n');

  // 7. Preservação das rotas de produtos, pedidos, agendamentos e QR Codes
  console.log('7. Testando preservação dos dados públicos (produtos, serviços, QR Codes)...');
  const publicSiteData = await siteRepo.getPublicSiteBySlug('una-otica');
  assert.ok(publicSiteData && publicSiteData.tenant && publicSiteData.site, 'getPublicSiteBySlug("una-otica") deve retornar dados do site');
  assert.equal(publicSiteData.tenant.slug, 'una-otica');
  assert.ok(Array.isArray(publicSiteData.site.sections), 'Seções do site público devem ser carregadas');

  const qrUrl = buildTableCatalogUrl('una-otica', 'mesa-01-token');
  assert.equal(qrUrl, 'https://una-otica.minihub.tech/?mesa=mesa-01-token&r=una-otica');
  passed++;
  console.log('   [OK] Site público, seções e gerador de QR Code preservados com sucesso.\n');

  // 8. Comportamento para "minihub.tech", "www.minihub.tech" e "*.vercel.app"
  console.log('8. Testando exclusão de domínios raiz, www, reservados e internos da Vercel...');
  const nonTenantHosts = [
    'minihub.tech',
    'www.minihub.tech',
    'minisitenovo.vercel.app',
    'minisitenovo-git-main.vercel.app',
    'ais-dev-xyz.run.app',
    'localhost:3000',
    '127.0.0.1:3000',
    'admin.minihub.tech',
    'api.minihub.tech',
    'app.minihub.tech',
    'login.minihub.tech',
    'dashboard.minihub.tech',
    'painel.minihub.tech',
    'superadmin.minihub.tech',
    'sub.nivel.una-otica.minihub.tech',
  ];

  for (const h of nonTenantHosts) {
    assert.equal(
      resolveSlugFromHost(h),
      null,
      `Host "${h}" NÃO deve ser interpretado como slug de empresa no backend`
    );
    assert.equal(
      resolveSlugFromHostname(h),
      null,
      `Host "${h}" NÃO deve ser interpretado como slug de empresa no frontend`
    );
  }
  passed++;
  console.log('   [OK] Todos os 15 hosts reservados/sistema/Vercel retornaram null com segurança.\n');

  console.log('================================================================');
  console.log(`TODOS OS ${passed}/8 CENÁRIOS PASSARAM COM 100% DE SUCESSO!`);
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('FALHA NOS TESTES:', err);
  process.exit(1);
});
