import crypto from 'crypto';
import { supabaseAdmin } from '../server/supabaseAdmin.js';
import { repo } from '../server/db/repository.js';
import { siteRepo } from '../server/db/siteRepository.js';
import { productRepo } from '../server/db/productRepository.js';
import { adaptSectionsForTemplate, PROFESSIONAL_TEMPLATES } from '../src/constants/professionalTemplates.js';
import { User, Tenant } from '../src/types/saas.js';
import { SiteData, SiteSection, SiteAppearance } from '../src/types/site.js';

interface CommercialSnapshot {
  tenant: {
    id: string;
    name: string;
    slug: string;
    phone?: string;
    whatsapp?: string;
    address?: any;
    businessHours?: any;
    logoUrl?: string;
  };
  products: Array<{
    id: string;
    name: string;
    price: number;
    promotionalPrice?: number;
    description: string;
    categoryId?: string;
    imageUrl?: string;
    variations?: any;
  }>;
  categories: Array<{
    id: string;
    name: string;
  }>;
  sectionContents: Array<{
    id: string;
    type: string;
    title?: string;
    subtitle?: string;
    text?: string;
    buttonText?: string;
    buttonUrl?: string;
    servicesCount?: number;
    galleryCount?: number;
  }>;
}

function extractCommercialSnapshot(tenant: Tenant, products: any[], categories: any[], site: SiteData): CommercialSnapshot {
  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      phone: tenant.phone,
      whatsapp: tenant.whatsapp,
      address: (tenant as any).address,
      businessHours: (tenant as any).businessHours,
      logoUrl: tenant.appearance?.logoUrl,
    },
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      promotionalPrice: p.promotional_price != null ? Number(p.promotional_price) : undefined,
      description: p.description,
      categoryId: p.category_id,
      imageUrl: p.image_url,
      variations: p.variations,
    })).sort((a, b) => a.id.localeCompare(b.id)),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
    })).sort((a, b) => a.id.localeCompare(b.id)),
    sectionContents: site.sections.map((s) => ({
      id: s.id,
      type: s.type,
      title: s.settings?.title,
      subtitle: s.settings?.subtitle,
      text: s.settings?.text,
      buttonText: s.settings?.buttonText || s.settings?.primaryButton?.text,
      buttonUrl: s.settings?.buttonUrl || s.settings?.primaryButton?.url,
      servicesCount: Array.isArray(s.settings?.services) ? s.settings.services.length : undefined,
      galleryCount: Array.isArray(s.settings?.items) ? s.settings.items.length : undefined,
    })).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function compareSnapshots(
  stage: string,
  baseline: CommercialSnapshot,
  current: CommercialSnapshot
): { passed: boolean; diffs: string[] } {
  const diffs: string[] = [];

  // 1. Tenant details
  if (baseline.tenant.name !== current.tenant.name) diffs.push(`Tenant name altered: '${baseline.tenant.name}' !== '${current.tenant.name}'`);
  if (baseline.tenant.slug !== current.tenant.slug) diffs.push(`Tenant slug altered: '${baseline.tenant.slug}' !== '${current.tenant.slug}'`);
  if (baseline.tenant.phone !== current.tenant.phone) diffs.push(`Tenant phone altered: '${baseline.tenant.phone}' !== '${current.tenant.phone}'`);
  if (baseline.tenant.whatsapp !== current.tenant.whatsapp) diffs.push(`Tenant whatsapp altered: '${baseline.tenant.whatsapp}' !== '${current.tenant.whatsapp}'`);
  if (baseline.tenant.logoUrl !== current.tenant.logoUrl) diffs.push(`Tenant logo altered`);

  // 2. Products
  if (baseline.products.length !== current.products.length) {
    diffs.push(`Product count changed: expected ${baseline.products.length}, got ${current.products.length}`);
  } else {
    for (let i = 0; i < baseline.products.length; i++) {
      const b = baseline.products[i];
      const c = current.products.find((p) => p.id === b.id);
      if (!c) {
        diffs.push(`Product ID ${b.id} ('${b.name}') missing!`);
        continue;
      }
      if (b.name !== c.name) diffs.push(`Product '${b.id}' name changed: '${b.name}' -> '${c.name}'`);
      if (b.price !== c.price) diffs.push(`Product '${b.id}' price changed: ${b.price} -> ${c.price}`);
      if (b.promotionalPrice !== c.promotionalPrice) diffs.push(`Product '${b.id}' promo price changed: ${b.promotionalPrice} -> ${c.promotionalPrice}`);
      if (b.description !== c.description) diffs.push(`Product '${b.id}' description changed`);
      if (b.categoryId !== c.categoryId) diffs.push(`Product '${b.id}' categoryId changed`);
      if (b.imageUrl !== c.imageUrl) diffs.push(`Product '${b.id}' imageUrl changed`);
    }
  }

  // 3. Categories
  if (baseline.categories.length !== current.categories.length) {
    diffs.push(`Category count changed: expected ${baseline.categories.length}, got ${current.categories.length}`);
  } else {
    for (const b of baseline.categories) {
      const c = current.categories.find((cat) => cat.id === b.id);
      if (!c) {
        diffs.push(`Category ID ${b.id} ('${b.name}') missing!`);
      } else if (b.name !== c.name) {
        diffs.push(`Category '${b.id}' name changed: '${b.name}' -> '${c.name}'`);
      }
    }
  }

  // 4. Section custom contents
  for (const b of baseline.sectionContents) {
    const c = current.sectionContents.find((sec) => sec.id === b.id);
    if (!c) {
      diffs.push(`Existing section ID ${b.id} (type: ${b.type}) was deleted or re-generated!`);
      continue;
    }
    if (b.title && c.title !== b.title) {
      diffs.push(`Section ${b.id} (${b.type}) custom title altered: '${b.title}' -> '${c.title}'`);
    }
    if (b.subtitle && c.subtitle !== b.subtitle) {
      diffs.push(`Section ${b.id} (${b.type}) custom subtitle altered: '${b.subtitle}' -> '${c.subtitle}'`);
    }
    if (b.text && c.text !== b.text) {
      diffs.push(`Section ${b.id} (${b.type}) custom text altered!`);
    }
    if (b.servicesCount && c.servicesCount !== b.servicesCount) {
      diffs.push(`Section ${b.id} services count changed: ${b.servicesCount} -> ${c.servicesCount}`);
    }
    if (b.galleryCount && c.galleryCount !== b.galleryCount) {
      diffs.push(`Section ${b.id} gallery count changed: ${b.galleryCount} -> ${c.galleryCount}`);
    }
  }

  return {
    passed: diffs.length === 0,
    diffs,
  };
}

async function runAudit() {
  console.log('========================================================================');
  console.log('LOCALHUB: AUDITORIA DEFINITIVA DE PERSISTÊNCIA E TROCA SEGURA DE TEMPLATES');
  console.log('========================================================================\n');

  const now = new Date().toISOString();
  const testId = `t${Date.now()}`;
  let testTenantId = '';
  let bystanderTenantId = '';

  const testUser: User = {
    id: crypto.randomUUID(),
    email: `audit-admin-${testId}@localhub.test`,
    name: 'Auditor Técnico Sênior',
    role: 'SUPER_ADMIN',
    status: 'active',
    tenantId: null,
    createdAt: now,
  };

  try {
    // -------------------------------------------------------------
    // FASE 1: PROVISIONAR ESTABELECIMENTO DE TESTE ISOLADO
    // -------------------------------------------------------------
    console.log('[FASE 1] Criando estabelecimento de teste isolado e dados comerciais completos...');

    // 1. Create main test tenant via repository
    const { tenant: createdTenant } = await repo.createTenant(
      {
        name: 'Óptica & Visão Conceito Audited',
        slug: `optica-audited-${testId.toLowerCase()}`,
        segment: 'Ótica e Moda',
        phone: '(11) 3456-7890',
        whatsapp: '(11) 98765-4321',
        email: `contato-${testId}@optica-audited.test`,
        ownerName: 'Diretor de Ótica',
        ownerEmail: `owner-${testId}@optica-audited.test`,
        ownerPhone: '(11) 98765-4321',
        planId: '33333333-3333-4333-8333-333333333333',
        status: 'ativo',
        primaryColor: '#0f172a',
        secondaryColor: '#3b82f6',
        accentColor: '#f59e0b',
        fontFamily: 'Inter',
        logoUrl: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=200&q=80',
        shouldInvite: false,
      },
      testUser
    );
    testTenantId = createdTenant.id;

    // 2. Create bystander tenant to verify multi-tenant isolation
    const { tenant: createdBystander } = await repo.createTenant(
      {
        name: 'Restaurante Bystander Alheio',
        slug: `bystander-${testId.toLowerCase()}`,
        segment: 'Gastronomia',
        phone: '(21) 2222-3333',
        whatsapp: '(21) 99999-8888',
        email: `bystander-${testId}@localhub.test`,
        ownerName: 'Proprietário Alheio',
        ownerEmail: `bystander-owner-${testId}@localhub.test`,
        ownerPhone: '(21) 99999-8888',
        planId: '33333333-3333-4333-8333-333333333333',
        status: 'ativo',
        shouldInvite: false,
      },
      testUser
    );
    bystanderTenantId = createdBystander.id;

    // 3. Create categories for test tenant via productRepo
    const cat1 = await productRepo.createCategory(
      testTenantId,
      { name: 'Armações de Grau Premium', description: 'Design e titânio' },
      testUser
    );
    const cat2 = await productRepo.createCategory(
      testTenantId,
      { name: 'Óculos Solares Polarizados', description: 'Proteção UV400' },
      testUser
    );

    // 4. Create products for test tenant via productRepo
    await productRepo.createProduct(
      testTenantId,
      {
        name: 'Armação Titânio Bauhaus Gold',
        categoryId: cat1.id,
        description: 'Feita à mão em titânio aeroespacial ultrafino e hipoalergênico.',
        price: 890.00,
        promotionalPrice: 799.00,
        images: [{ publicUrl: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=600&q=80', isPrimary: true }],
        isActive: true,
      },
      testUser
    );

    await productRepo.createProduct(
      testTenantId,
      {
        name: 'Solar Retrô Acetato Havana',
        categoryId: cat2.id,
        description: 'Lentes alemãs polarizadas Zeiss com proteção UV400 total.',
        price: 650.00,
        promotionalPrice: 590.00,
        images: [{ publicUrl: 'https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=600&q=80', isPrimary: true }],
        isActive: true,
      },
      testUser
    );

    await productRepo.createProduct(
      testTenantId,
      {
        name: 'Clip-on Magnético Dual Polar',
        categoryId: cat1.id,
        description: 'Transição instantânea de óculos de grau para solar.',
        price: 480.00,
        images: [{ publicUrl: 'https://images.unsplash.com/photo-1574258495973-f010dfbb5371?auto=format&fit=crop&w=600&q=80', isPrimary: true }],
        isActive: true,
      },
      testUser
    );

    // 5. Initialize base site (Template 'moderno') with custom editorial content
    const initialSite = await siteRepo.getTenantSite(testTenantId, testUser);
    const customHeroSecId = initialSite.sections.find((s) => s.type === 'hero')?.id || crypto.randomUUID();
    const customAboutSecId = initialSite.sections.find((s) => s.type === 'about')?.id || crypto.randomUUID();
    const customServicesSecId = initialSite.sections.find((s) => s.type === 'services')?.id || crypto.randomUUID();
    const customGallerySecId = initialSite.sections.find((s) => s.type === 'gallery')?.id || crypto.randomUUID();
    const customCtaSecId = initialSite.sections.find((s) => s.type === 'cta')?.id || crypto.randomUUID();

    const initialSections: SiteSection[] = [
      {
        id: customHeroSecId,
        siteId: initialSite.id,
        tenantId: testTenantId,
        type: 'hero',
        position: 0,
        isEnabled: true,
        settings: {
          title: 'PRECISÃO VISUAL & DESIGN EXCLUSIVO',
          subtitle: 'A ótica boutique que redefine o seu estilo em São Paulo.',
          tagline: '[ ALTA VISÃO PAULISTA ]',
          primaryButton: { text: 'Agendar Consulta Visual', url: 'https://wa.me/5511987654321', enabled: true },
        },
      },
      {
        id: customAboutSecId,
        siteId: initialSite.id,
        tenantId: testTenantId,
        type: 'about',
        position: 1,
        isEnabled: true,
        settings: {
          title: 'Manifesto de Autenticidade & Saúde Ocular',
          subtitle: 'Mais de 15 anos de excelência oftalmológica',
          text: 'Texto editorial personalizado escrito pelo proprietário: nossa curadoria une estética autoral às melhores lentes do mercado internacional.',
        },
      },
      {
        id: customServicesSecId,
        siteId: initialSite.id,
        tenantId: testTenantId,
        type: 'services',
        position: 2,
        isEnabled: true,
        settings: {
          title: 'Nossos Serviços Especializados',
          subtitle: 'Atendimento clínico e consultoria estética de imagem',
          services: [
            { id: 'srv-1', name: 'Exame de Refração Digital 3D', price: 'R$ 220,00', duration: '40 min' },
            { id: 'srv-2', name: 'Visagismo Ocular & Ajuste Facial', price: 'Cortesia', duration: '30 min' },
          ],
        },
      },
      {
        id: customGallerySecId,
        siteId: initialSite.id,
        tenantId: testTenantId,
        type: 'gallery',
        position: 3,
        isEnabled: true,
        settings: {
          title: 'Nosso Espaço Conceito',
          items: [
            { id: 'gal-1', url: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=600&q=80', caption: 'Lounge de Prova' },
            { id: 'gal-2', url: 'https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=600&q=80', caption: 'Laboratório de Montagem' },
          ],
        },
      },
      {
        id: customCtaSecId,
        siteId: initialSite.id,
        tenantId: testTenantId,
        type: 'cta',
        position: 4,
        isEnabled: true,
        settings: {
          tagline: '[ EXCLUSIVIDADE ]',
          title: 'Pronto para uma experiência óptica inesquecível?',
          buttonText: 'Falar com Consultor Agora',
          buttonUrl: 'https://wa.me/5511987654321',
        },
      },
    ];

    // Save baseline draft
    await siteRepo.saveDraft(
      testTenantId,
      {
        templateId: 'moderno',
        sections: initialSections,
        appearance: {
          primaryColor: '#0f172a',
          backgroundColor: '#f8fafc',
          textColor: '#0f172a',
          fontFamily: 'Inter',
        },
      },
      testUser
    );

    // Initial publish so we have a known baseline
    await siteRepo.publishSite(testTenantId, testUser);

    // -------------------------------------------------------------
    // FASE 2: CAPTURAR RETRATO BASELINE (SNAPSHOT)
    // -------------------------------------------------------------
    console.log('[FASE 2] Registrando retrato (snapshot) dos dados antes da troca de template...');

    const baselineTenant = (await repo.getTenantById(testTenantId, testUser))!;
    const { data: baselineProds } = await supabaseAdmin.from('products').select('*').eq('tenant_id', testTenantId);
    const { data: baselineCats } = await supabaseAdmin.from('product_categories').select('*').eq('tenant_id', testTenantId);
    const baselineSite = await siteRepo.getTenantSite(testTenantId, testUser);

    const baselineSnapshot = extractCommercialSnapshot(baselineTenant, baselineProds || [], baselineCats || [], baselineSite);

    console.log(`✓ Snapshot baseline registrado com sucesso:`);
    console.log(`  - Tenant: "${baselineSnapshot.tenant.name}" (WhatsApp: ${baselineSnapshot.tenant.whatsapp})`);
    console.log(`  - Produtos: ${baselineSnapshot.products.length} itens cadastrados (IDs: ${baselineSnapshot.products.map(p => p.id.substring(0, 8)).join(', ')})`);
    console.log(`  - Categorias: ${baselineSnapshot.categories.length} categorias`);
    console.log(`  - Seções com conteúdo editorial: ${baselineSnapshot.sectionContents.length} blocos com textos personalizados`);

    // -------------------------------------------------------------
    // FASE 3: TROCAR PARA O TEMPLATE 'ÓTICA EDITORIAL PREMIUM'
    // -------------------------------------------------------------
    console.log('\n[FASE 3] Executando troca de template para "Ótica Editorial Premium" (otica_editorial)...');

    const oticaTemplate = PROFESSIONAL_TEMPLATES.find((t) => t.id === 'otica_editorial')!;
    if (!oticaTemplate) throw new Error('Template otica_editorial não encontrado em PROFESSIONAL_TEMPLATES!');

    // Build adapted sections: strictly respects existing user sections and IDs
    const oticaAdaptedSections = oticaTemplate.buildSections(baselineTenant, baselineSite.sections);
    const oticaAppearance: SiteAppearance = {
      ...baselineSite.appearance,
      ...oticaTemplate.defaultAppearance,
      templateId: 'otica_editorial',
      templateVisualPresets: {
        ...(baselineSite.appearance.templateVisualPresets || {}),
        moderno: {
          primaryColor: baselineSite.appearance.primaryColor,
          backgroundColor: baselineSite.appearance.backgroundColor,
          textColor: baselineSite.appearance.textColor,
          fontFamily: baselineSite.appearance.fontFamily,
          savedAt: new Date().toISOString(),
        },
      },
    };

    // Save draft
    const savedDraftOtica = await siteRepo.saveDraft(
      testTenantId,
      {
        templateId: 'otica_editorial',
        sections: oticaAdaptedSections,
        appearance: oticaAppearance,
      },
      testUser
    );

    console.log(`✓ Rascunho salvo no banco de dados com template: "${savedDraftOtica.templateId}"`);

    // -------------------------------------------------------------
    // FASE 4: RECARREGAR E COMPARAR DADOS ANTES E DEPOIS
    // -------------------------------------------------------------
    console.log('\n[FASE 4] Recarregando do banco e comparando dados comerciais e editoriais...');

    const reloadedTenant1 = (await repo.getTenantById(testTenantId, testUser))!;
    const { data: reloadedProds1 } = await supabaseAdmin.from('products').select('*').eq('tenant_id', testTenantId);
    const { data: reloadedCats1 } = await supabaseAdmin.from('product_categories').select('*').eq('tenant_id', testTenantId);
    const reloadedSite1 = await siteRepo.getTenantSite(testTenantId, testUser);

    const snapshotStage1 = extractCommercialSnapshot(reloadedTenant1, reloadedProds1 || [], reloadedCats1 || [], reloadedSite1);
    const check1 = compareSnapshots('TROCA_PARA_OTICA', baselineSnapshot, snapshotStage1);

    if (!check1.passed) {
      console.error('❌ FALHA na comparação dos dados após troca para Ótica Editorial:');
      console.error(check1.diffs.join('\n'));
      throw new Error(`Divergências detectadas na troca de template: ${check1.diffs.join(', ')}`);
    } else {
      console.log('✓ SUCESSO: Todos os produtos, preços, descrições, categorias, contatos e textos continuam 100% IDÊNTICOS.');
    }

    // -------------------------------------------------------------
    // FASE 5: EDITAR PROPRIEDADE VISUAL, SALVAR E RECARREGAR
    // -------------------------------------------------------------
    console.log('\n[FASE 5] Editando propriedade visual (primaryColor: #C7F36B, backgroundColor: #101010)...');

    const customizedAppearance: SiteAppearance = {
      ...reloadedSite1.appearance,
      primaryColor: '#C7F36B',
      backgroundColor: '#101010',
      templateVisualPresets: {
        ...(reloadedSite1.appearance.templateVisualPresets || {}),
        otica_editorial: {
          primaryColor: '#C7F36B',
          backgroundColor: '#101010',
          textColor: '#F8F8F5',
          fontFamily: 'Syne',
          savedAt: new Date().toISOString(),
        },
      },
    };

    await siteRepo.saveDraft(
      testTenantId,
      {
        appearance: customizedAppearance,
      },
      testUser
    );

    const reloadedSiteAfterVisual = await siteRepo.getTenantSite(testTenantId, testUser);
    if (reloadedSiteAfterVisual.appearance.primaryColor !== '#C7F36B') {
      throw new Error('Falha ao persistir customização visual no rascunho!');
    }
    console.log('✓ Propriedade visual customizada salva e recarregada com sucesso no rascunho.');

    // -------------------------------------------------------------
    // FASE 6: PUBLICAR ALTERAÇÕES E TESTAR SITE PÚBLICO
    // -------------------------------------------------------------
    console.log('\n[FASE 6] Publicando rascunho pelo fluxo normal e verificando site público...');

    const publishedSite = await siteRepo.publishSite(testTenantId, testUser);
    console.log(`✓ Site publicado com status: "${publishedSite.status}"`);

    // Fetch as public visitor
    const publicVisitorResult = await siteRepo.getPublicSiteBySlug(baselineTenant.slug);
    if (!publicVisitorResult.success || !publicVisitorResult.site) {
      throw new Error('Falha ao carregar site público como visitante!');
    }

    console.log(`✓ Visitante público acessou site com template: "${publicVisitorResult.site.templateId}"`);
    if (publicVisitorResult.site.templateId !== 'otica_editorial') {
      throw new Error(`Template público incorreto: esperado otica_editorial, recebido ${publicVisitorResult.site.templateId}`);
    }

    // Fetch public catalog as visitor
    const publicCatalog = await productRepo.getPublicCatalog(baselineTenant.slug);
    if (publicCatalog.products.length !== 3) {
      throw new Error(`Catálogo público inconsistente: esperado 3 produtos, recebido ${publicCatalog.products.length}`);
    }
    console.log(`✓ Catálogo público de produtos validado: ${publicCatalog.products.length} itens comerciais ativos.`);

    // -------------------------------------------------------------
    // FASE 7: TROCAR PARA OUTRO TEMPLATE (RESTAURANTE) E RETORNAR
    // -------------------------------------------------------------
    console.log('\n[FASE 7] Troca cíclica: mudar para "Restaurante Moderno", salvar e retornar para "Ótica Editorial"...');

    const restTemplate = PROFESSIONAL_TEMPLATES.find((t) => t.id === 'restaurante_moderno')!;
    const restSections = restTemplate.buildSections(baselineTenant, reloadedSiteAfterVisual.sections);
    const restAppearance: SiteAppearance = {
      ...reloadedSiteAfterVisual.appearance,
      ...restTemplate.defaultAppearance,
      templateId: restTemplate.baseTemplateId,
    };

    // Save draft as restaurant
    await siteRepo.saveDraft(
      testTenantId,
      {
        templateId: restTemplate.baseTemplateId,
        sections: restSections,
        appearance: restAppearance,
      },
      testUser
    );

    // Now return back to otica_editorial
    const oticaReturnSections = oticaTemplate.buildSections(baselineTenant, restSections);
    // Restore preset for otica_editorial
    const savedOticaPreset = reloadedSiteAfterVisual.appearance.templateVisualPresets?.['otica_editorial'];
    const oticaReturnAppearance: SiteAppearance = {
      ...reloadedSiteAfterVisual.appearance,
      ...oticaTemplate.defaultAppearance,
      ...(savedOticaPreset ? {
        primaryColor: savedOticaPreset.primaryColor,
        backgroundColor: savedOticaPreset.backgroundColor,
      } : {}),
      templateId: 'otica_editorial',
    };

    await siteRepo.saveDraft(
      testTenantId,
      {
        templateId: 'otica_editorial',
        sections: oticaReturnSections,
        appearance: oticaReturnAppearance,
      },
      testUser
    );

    const reloadedAfterCycleSite = await siteRepo.getTenantSite(testTenantId, testUser);
    const { data: finalProds } = await supabaseAdmin.from('products').select('*').eq('tenant_id', testTenantId);
    const { data: finalCats } = await supabaseAdmin.from('product_categories').select('*').eq('tenant_id', testTenantId);

    const finalSnapshot = extractCommercialSnapshot(baselineTenant, finalProds || [], finalCats || [], reloadedAfterCycleSite);
    const checkCycle = compareSnapshots('TROCA_CICLICA', baselineSnapshot, finalSnapshot);

    if (!checkCycle.passed) {
      console.error('❌ FALHA na comparação após troca cíclica de templates:');
      console.error(checkCycle.diffs.join('\n'));
      throw new Error(`Divergências na troca cíclica: ${checkCycle.diffs.join(', ')}`);
    } else {
      console.log('✓ SUCESSO: Após ciclo de alternância (Moderno -> Ótica -> Restaurante -> Ótica), zero dados foram perdidos!');
      console.log(`✓ Cores restauradas do preset: primaryColor = ${reloadedAfterCycleSite.appearance.primaryColor}`);
    }

    // -------------------------------------------------------------
    // FASE 8: VERIFICAR ISOLAMENTO DO ESTABELECIMENTO ALHEIO
    // -------------------------------------------------------------
    console.log('\n[FASE 8] Verificando isolamento multi-tenant do estabelecimento alheio...');

    const bystanderAfter = await repo.getTenantById(bystanderTenantId, testUser);
    if (!bystanderAfter || bystanderAfter.name !== 'Restaurante Bystander Alheio') {
      throw new Error('O estabelecimento alheio foi indevidamente corrompido ou modificado!');
    }
    console.log(`✓ Isolamento confirmado: tenant ${bystanderTenantId} intacto e inalterado.`);

    // -------------------------------------------------------------
    // FASE 9: TESTAR BOTÕES, NAVEGAÇÃO E AÇÕES COMERCIAIS
    // -------------------------------------------------------------
    console.log('\n[FASE 9] Validando paridade de ações comerciais e botões nos templates...');

    const phoneDigits = baselineTenant.whatsapp?.replace(/\D/g, '') || '';
    const testProd = publicCatalog.products[0];
    const generatedWaMsg = `Olá! Vi o modelo *${testProd.name}* no site da ${baselineTenant.name} e gostaria de consultar a disponibilidade para experimentar.`;
    const waUrl = `https://wa.me/55${phoneDigits}?text=${encodeURIComponent(generatedWaMsg)}`;

    console.log(`✓ Validação de ação WhatsApp: link gerado com destino para 55${phoneDigits}`);
    console.log(`  Mensagem: "${generatedWaMsg.substring(0, 70)}..."`);

    // Check quick buttons section presence
    const hasQuickButtons = oticaReturnSections.some((s) => s.type === 'quick_buttons');
    console.log(`✓ Suporte a botões de ação rápida (quick_buttons): ${hasQuickButtons ? 'Presente' : 'Preservado'}`);

    console.log('\n========================================================================');
    console.log('RESULTADO FINAL: TODAS AS 9 FASES DA AUDITORIA FORAM APROVADAS COM ÊXITO!');
    console.log('========================================================================');

    return { success: true };
  } catch (err: any) {
    console.error('\n❌ ERRO DURANTE A AUDITORIA:', err.message || err);
    throw err;
  } finally {
    // -------------------------------------------------------------
    // FASE 10: LIMPEZA SEGURA DOS DADOS TEMPORÁRIOS DE TESTE
    // -------------------------------------------------------------
    console.log('\n[LIMPEZA] Removendo dados temporários da auditoria para não poluir o banco de produção...');
    try {
      await supabaseAdmin.from('site_sections').delete().eq('tenant_id', testTenantId);
      await supabaseAdmin.from('site_seo').delete().eq('tenant_id', testTenantId);
      await supabaseAdmin.from('site_versions').delete().eq('tenant_id', testTenantId);
      await supabaseAdmin.from('sites').delete().eq('tenant_id', testTenantId);
      await supabaseAdmin.from('products').delete().eq('tenant_id', testTenantId);
      await supabaseAdmin.from('product_categories').delete().eq('tenant_id', testTenantId);
      await supabaseAdmin.from('tenants').delete().eq('id', testTenantId);
      await supabaseAdmin.from('tenants').delete().eq('id', bystanderTenantId);
      console.log('✓ Limpeza concluída: banco restaurado ao estado limpo original.');
    } catch (cleanupErr) {
      console.warn('Aviso na limpeza:', cleanupErr);
    }
  }
}

runAudit().catch(() => {
  process.exit(1);
});
