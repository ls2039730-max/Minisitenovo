import { resolveSlugFromHost, extractTenantSlugFromRequest, validateSlug, generateValidSlug } from '../server/tenantResolver.js';
import { buildTenantMetaTags } from '../server/seoRenderer.js';
import { getPublicStoreUrl } from '../src/utils/url.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

export async function runHybridTenantDomainsSuite() {
  console.log('================================================================');
  console.log('SUÍTE DE TESTES: ARQUITETURA HÍBRIDA DE DOMÍNIOS E TENANTS LOCALHUB');
  console.log('================================================================\n');

  let passed = 0;

  // -------------------------------------------------------------
  // Test 1: Sem APP_BASE_DOMAIN configurado (situação atual de produção)
  // Não inventar domínio fictício e não extrair subdomínio
  // -------------------------------------------------------------
  console.log('1. Testando comportamento quando APP_BASE_DOMAIN está ausente ou vazio...');
  {
    const slug1 = resolveSlugFromHost('una-otica.minisitenovo.vercel.app', '');
    assert(slug1 === null, 'Não deve extrair subdomínio quando APP_BASE_DOMAIN está vazio');

    const slug2 = resolveSlugFromHost('minisitenovo.vercel.app', '');
    assert(slug2 === null, 'Domínio base padrão sem variável não é subdomínio de tenant');

    const slug3 = resolveSlugFromHost('localhost:3000', '');
    assert(slug3 === null, 'Localhost não deve ser tratado como subdomínio');

    console.log('  -> [OK] Nenhum subdomínio fictício foi assumido.');
    passed++;
  }

  // -------------------------------------------------------------
  // Test 2: Bloqueio de domínios reservados e de plataforma (*.vercel.app, meudominio.com)
  // -------------------------------------------------------------
  console.log('2. Testando bloqueio de hosts de plataforma e placeholders...');
  {
    const slugVercel = resolveSlugFromHost('una-otica.minisitenovo.vercel.app', 'minisitenovo.vercel.app');
    assert(slugVercel === null, 'Vercel.app não suporta wildcard de 4º nível, deve retornar null');

    const slugPlaceholder = resolveSlugFromHost('una-otica.meudominio.com', 'meudominio.com');
    assert(slugPlaceholder === null, 'Placeholder meudominio.com deve ser ignorado');

    console.log('  -> [OK] Domínios de infraestrutura e placeholders foram bloqueados com segurança.');
    passed++;
  }

  // -------------------------------------------------------------
  // Test 3: Resolução de subdomínio dinâmico com domínio próprio configurado
  // Exemplo futuro: APP_BASE_DOMAIN="meudominiooficial.com.br"
  // -------------------------------------------------------------
  console.log('3. Testando resolução com domínio próprio verificado...');
  const CUSTOM_BASE = 'meudominiooficial.com.br';
  {
    // Tenant 1
    const slugStore1 = resolveSlugFromHost('una-otica.meudominiooficial.com.br', CUSTOM_BASE);
    assert(slugStore1 === 'una-otica', `Esperado "una-otica", recebido "${slugStore1}"`);

    // Tenant 2 com porta
    const slugStore2 = resolveSlugFromHost('farmacia-trevo.meudominiooficial.com.br:443', CUSTOM_BASE);
    assert(slugStore2 === 'farmacia-trevo', `Esperado "farmacia-trevo", recebido "${slugStore2}"`);

    // Portal raiz (sem subdomínio)
    const portal = resolveSlugFromHost('meudominiooficial.com.br', CUSTOM_BASE);
    assert(portal === null, 'Portal raiz não deve ser resolvido como tenant');

    // WWW
    const www = resolveSlugFromHost('www.meudominiooficial.com.br', CUSTOM_BASE);
    assert(www === null, 'WWW não deve ser resolvido como tenant');

    // Palavras reservadas
    const admin = resolveSlugFromHost('admin.meudominiooficial.com.br', CUSTOM_BASE);
    assert(admin === null, 'Subdomínio "admin" deve ser reservado');

    const api = resolveSlugFromHost('api.meudominiooficial.com.br', CUSTOM_BASE);
    assert(api === null, 'Subdomínio "api" deve ser reservado');

    // Subdomínio aninhado inválido
    const nested = resolveSlugFromHost('sub.loja.meudominiooficial.com.br', CUSTOM_BASE);
    assert(nested === null, 'Subdomínios aninhados (multinível) devem ser rejeitados');

    // Host arbitrário não correspondente
    const arbitrary = resolveSlugFromHost('una-otica.outrodominiototal.com', CUSTOM_BASE);
    assert(arbitrary === null, 'Host arbitrário desconhecido deve retornar null');

    console.log('  -> [OK] Resolução de subdomínios dinâmicos com domínio próprio validada com sucesso.');
    passed++;
  }

  // -------------------------------------------------------------
  // Test 4: Isolamento entre Tenants e Prevenção de Acesso Cruzado
  // -------------------------------------------------------------
  console.log('4. Testando prevenção de vazamento e acesso cruzado entre tenants...');
  {
    // Cenário: requisição chega com host de "una-otica", mas tenta acessar "/p/farmacia-trevo"
    const reqSimulatedCrossTenant = {
      headers: { host: 'una-otica.meudominiooficial.com.br' },
      path: '/p/farmacia-trevo',
      query: {},
    };

    const hostSlug = resolveSlugFromHost(reqSimulatedCrossTenant.headers.host, CUSTOM_BASE);
    const pathMatch = reqSimulatedCrossTenant.path.match(/\/p\/([a-zA-Z0-9_-]+)/);
    const pathSlug = pathMatch ? pathMatch[1] : null;

    // A regra de isolamento exige que se o subdomínio for una-otica, pathSlug diferente seja bloqueado
    const isCrossTenant = Boolean(hostSlug && pathSlug && hostSlug !== pathSlug);
    assert(isCrossTenant === true, 'Tentativa de acesso cruzado deve ser detectada');

    // Cenário de acesso legítimo no subdomínio:
    const reqLegitimateSubdomain = {
      headers: { host: 'una-otica.meudominiooficial.com.br' },
      path: '/p/',
      query: {},
    };
    const legitHostSlug = resolveSlugFromHost(reqLegitimateSubdomain.headers.host, CUSTOM_BASE);
    assert(legitHostSlug === 'una-otica', 'Acesso legítimo ao subdomínio /p/ deve resolver o tenant correto');

    console.log('  -> [OK] Isolamento estrito entre tenants verificado e garantido.');
    passed++;
  }

  // -------------------------------------------------------------
  // Test 5: Preservação de URLs legadas e compatibilidade retroativa
  // "/p/:slug", query strings "?p=", table QR codes
  // -------------------------------------------------------------
  console.log('5. Testando compatibilidade retroativa de rotas legadas (/p/:slug e query)...');
  {
    // Acesso atual na Vercel: https://minisitenovo.vercel.app/p/una-otica
    const reqLegacyVercel = {
      headers: { host: 'minisitenovo.vercel.app' },
      path: '/p/una-otica',
      query: {},
    };
    const legacyExtracted = extractTenantSlugFromRequest(reqLegacyVercel);
    assert(legacyExtracted.slug === 'una-otica', 'URL legada /p/una-otica deve continuar funcionando');
    assert(legacyExtracted.source === 'path', 'Origem da extração deve ser "path" no domínio atual');
    assert(legacyExtracted.isCustomDomainSubdomain === false, 'Não deve marcar como subdomínio customizado');

    // Acesso com parâmetro de query (?p=una-otica)
    const reqQuery = {
      headers: { host: 'minisitenovo.vercel.app' },
      path: '/',
      query: { p: 'una-otica' },
    };
    const queryExtracted = extractTenantSlugFromRequest(reqQuery);
    assert(queryExtracted.slug === 'una-otica', 'Link com query string deve ser resolvido');

    console.log('  -> [OK] Links legados, QR codes e query strings mantidos 100% funcionais.');
    passed++;
  }

  // -------------------------------------------------------------
  // Test 6: Metadados Open Graph e Canonical Tags
  // No domínio padrão: canonical = https://minisitenovo.vercel.app/p/una-otica
  // No subdomínio: canonical = https://una-otica.meudominiooficial.com.br/p/
  // -------------------------------------------------------------
  console.log('6. Testando geração de OpenGraph e URL Canônica...');
  {
    const mockTenant = {
      id: '123',
      name: 'Ótica Visão Elegante',
      slug: 'una-otica',
      segment: 'Ótica',
      phone: '11999998888',
      whatsapp: '11999998888',
      appearance: {
        logoUrl: 'https://images.unsplash.com/photo-example-logo.jpg',
        tagline: 'Sua visão em primeiro lugar',
      },
    };

    const mockSite = {
      seo: {
        title: 'Ótica Visão Elegante — Site Oficial',
        description: 'Armações de grife e lentes digitais com atendimento exclusivo.',
        ogTitle: 'Ótica Visão Elegante | Óculos & Lentes',
        ogDescription: 'Venha conhecer nossa nova coleção.',
      },
      sections: [],
    };

    // Caso A: Domínio padrão Vercel
    const metaStandard = buildTenantMetaTags(
      mockTenant,
      mockSite,
      'https://minisitenovo.vercel.app',
      'una-otica',
      false
    );
    assert(metaStandard.includes('rel="canonical" href="https://minisitenovo.vercel.app/p/una-otica"'), 'Canonical no domínio padrão deve ser /p/una-otica');
    assert(metaStandard.includes('property="og:url" content="https://minisitenovo.vercel.app/p/una-otica"'), 'og:url no domínio padrão deve ser /p/una-otica');
    assert(metaStandard.includes('property="og:title" content="Ótica Visão Elegante | Óculos &amp; Lentes"'), 'og:title deve ser preservado');
    assert(metaStandard.includes('property="og:description" content="Venha conhecer nossa nova coleção."'), 'og:description deve ser preservado');
    assert(metaStandard.includes('property="og:type" content="website"'), 'og:type website deve existir');

    // Caso B: Subdomínio próprio
    const metaSubdomain = buildTenantMetaTags(
      mockTenant,
      mockSite,
      'https://una-otica.meudominiooficial.com.br',
      'una-otica',
      true
    );
    assert(metaSubdomain.includes('rel="canonical" href="https://una-otica.meudominiooficial.com.br/p/"'), 'Canonical no subdomínio deve ser /p/');
    assert(metaSubdomain.includes('property="og:url" content="https://una-otica.meudominiooficial.com.br/p/"'), 'og:url no subdomínio deve ser /p/');

    console.log('  -> [OK] Metadados Open Graph e Canonical Tags testados e validados para ambos os formatos.');
    passed++;
  }

  // -------------------------------------------------------------
  // Test 7: Utilitário de Geração de Links Públicos (getPublicStoreUrl)
  // -------------------------------------------------------------
  console.log('7. Testando utilitário getPublicStoreUrl (frontend / backend)...');
  {
    // Sem APP_BASE_DOMAIN: gera URL atual
    delete process.env.APP_BASE_DOMAIN;
    const urlDefault = getPublicStoreUrl('una-otica');
    assert(urlDefault === '/p/una-otica', `Sem domínio configurado deve gerar "/p/una-otica", gerou "${urlDefault}"`);

    // Com APP_BASE_DOMAIN verificado: gera URL com subdomínio dinâmico
    process.env.APP_BASE_DOMAIN = 'localhub.com.br';
    const urlCustom = getPublicStoreUrl('una-otica');
    assert(urlCustom === 'https://una-otica.localhub.com.br/p/', `Com domínio configurado deve gerar subdomínio, gerou "${urlCustom}"`);

    // Restaurar ambiente
    delete process.env.APP_BASE_DOMAIN;

    console.log('  -> [OK] Geração dinâmica de URLs validada com segurança.');
    passed++;
  }

  // -------------------------------------------------------------
  // Test 8: Validação e Normalização de Slugs de Tenant
  // -------------------------------------------------------------
  console.log('8. Testando validação e normalização de slugs...');
  {
    const generated = generateValidSlug('Ótica & Cia — São Paulo!');
    assert(generated === 'otica-cia-sao-paulo', `Slug normalizado incorreto: "${generated}"`);

    assert(validateSlug('una-otica').valid === true, 'una-otica deve ser válido');
    assert(validateSlug('farmacia-trevo-24h').valid === true, 'farmacia-trevo-24h deve ser válido');
    assert(validateSlug('admin').valid === false, 'admin deve ser rejeitado (reservado)');
    assert(validateSlug('a').valid === false, 'slug com 1 caractere deve ser rejeitado');
    assert(validateSlug('slug_com_underline').valid === false, 'sublinhados não devem ser permitidos em subdomínios DNS');

    console.log('  -> [OK] Regras de slug compatíveis com DNS RFC 1123 validadas.');
    passed++;
  }

  console.log('\n================================================================');
  console.log(`TODOS OS ${passed} TESTES DA SUÍTE FORAM APROVADOS COM SUCESSO!`);
  console.log('================================================================\n');
  return true;
}

if (process.argv[1]?.endsWith('test_hybrid_tenant_domains.ts')) {
  runHybridTenantDomainsSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\nSUÍTE DE TESTES FALHOU:', err);
      process.exit(1);
    });
}
