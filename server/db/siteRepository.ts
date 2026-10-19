import crypto from 'crypto';
import { supabaseAdmin } from '../supabaseAdmin.js';
import { User, Tenant } from '../../src/types/saas.js';
import { SiteData, SiteSection, SiteSeo, SiteAppearance, SiteSettings, SiteTemplateId } from '../../src/types/site.js';
import { BLOCK_REGISTRY } from '../../src/constants/blockRegistry.js';
import { SITE_TEMPLATES } from '../../src/constants/templates.js';
import { repo } from './repository.js';
import { canTenantOperate } from '../tenantResolver.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ensureValidUUID(id?: string | null): string {
  if (id && UUID_REGEX.test(id)) return id;
  if (id) {
    // Generate a deterministic valid UUIDv4-like hash from the existing string
    const hash = crypto.createHash('sha256').update(String(id)).digest('hex');
    return [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '4' + hash.substring(13, 16),
      'a' + hash.substring(17, 20),
      hash.substring(20, 32),
    ].join('-');
  }
  return crypto.randomUUID();
}

export class SiteRepository {
  /**
   * Retrieves or initializes the site for a specific tenant.
   */
  public async getTenantSite(tenantId: string, requester: User): Promise<SiteData> {
    if (requester.role !== 'SUPER_ADMIN' && requester.tenantId !== tenantId) {
      throw new Error('Acesso negado aos dados deste site.');
    }

    const tenant = await repo.getTenantById(tenantId, requester);
    if (!tenant) throw new Error('Estabelecimento não encontrado.');

    // 1. Fetch site
    let { data: site } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    const now = new Date().toISOString();

    // 2. Initialize if doesn't exist
    if (!site) {
      const siteId = crypto.randomUUID();
      site = {
        id: siteId,
        tenant_id: tenantId,
        template_id: 'moderno',
        status: 'draft',
        draft_data: {},
        published_data: null,
        published_at: null,
        created_at: now,
        updated_at: now,
      };

      await supabaseAdmin.from('sites').insert(site);

      // Generate default SEO
      const autoTitle = `${tenant.name} | ${tenant.segment}`;
      const autoDesc = `Conheça ${tenant.name}. Atendimento de qualidade, conveniência e os melhores serviços. Fale conosco pelo WhatsApp!`;
      await supabaseAdmin.from('site_seo').insert({
        site_id: siteId,
        tenant_id: tenantId,
        title: autoTitle,
        description: autoDesc,
        keywords: `${tenant.name}, ${tenant.segment}`,
        og_title: autoTitle,
        og_description: autoDesc,
        og_image: tenant.appearance?.logoUrl || '',
        favicon: '',
        allow_indexing: true,
        created_at: now,
        updated_at: now,
      });

      // Generate default starter sections
      const starterTypes = [
        'hero',
        'quick_buttons',
        'about',
        'services',
        'gallery',
        'business_hours',
        'google_reviews',
        'location',
        'cta',
        'footer',
      ];

      for (let i = 0; i < starterTypes.length; i++) {
        const secType = starterTypes[i];
        const def = BLOCK_REGISTRY[secType as keyof typeof BLOCK_REGISTRY];
        if (def) {
          await supabaseAdmin.from('site_sections').insert({
            id: crypto.randomUUID(),
            site_id: siteId,
            tenant_id: tenantId,
            section_type: secType,
            position: i,
            is_enabled: true,
            settings: def.defaultSettings(tenant),
            created_at: now,
            updated_at: now,
          });
        }
      }
    }

    // 3. Load sections
    const { data: rawSections } = await supabaseAdmin
      .from('site_sections')
      .select('*')
      .eq('site_id', site.id)
      .order('position', { ascending: true });

    let sections: SiteSection[] = (rawSections || []).map((s: any) => ({
      id: s.id,
      siteId: s.site_id,
      tenantId: s.tenant_id,
      type: s.section_type,
      position: s.position,
      isEnabled: s.is_enabled,
      settings: s.settings || {},
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));

    // If site exists in database but sections became empty (e.g. from previously failed template publish),
    // seed standard starter sections so the user never gets an empty blank site
    if (sections.length === 0) {
      const starterTypes = [
        'hero',
        'quick_buttons',
        'about',
        'services',
        'gallery',
        'business_hours',
        'google_reviews',
        'location',
        'cta',
        'footer',
      ];

      for (let i = 0; i < starterTypes.length; i++) {
        const secType = starterTypes[i];
        const def = BLOCK_REGISTRY[secType as keyof typeof BLOCK_REGISTRY];
        if (def) {
          const newId = crypto.randomUUID();
          await supabaseAdmin.from('site_sections').insert({
            id: newId,
            site_id: site.id,
            tenant_id: tenantId,
            section_type: secType,
            position: i,
            is_enabled: true,
            settings: def.defaultSettings(tenant),
            created_at: now,
            updated_at: now,
          });

          sections.push({
            id: newId,
            siteId: site.id,
            tenantId,
            type: secType as any,
            position: i,
            isEnabled: true,
            settings: def.defaultSettings(tenant),
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    // 4. Load SEO
    const { data: rawSeo } = await supabaseAdmin
      .from('site_seo')
      .select('*')
      .eq('site_id', site.id)
      .single();

    const seo: SiteSeo = {
      title: rawSeo?.title || `${tenant.name} | ${tenant.segment}`,
      description: rawSeo?.description || `Conheça ${tenant.name}. Atendimento personalizado e os melhores serviços.`,
      keywords: rawSeo?.keywords || '',
      ogTitle: rawSeo?.og_title || rawSeo?.title || tenant.name,
      ogDescription: rawSeo?.og_description || rawSeo?.description || '',
      ogImage: rawSeo?.og_image || tenant.appearance?.logoUrl || '',
      favicon: rawSeo?.favicon || '',
      allowIndexing: rawSeo?.allow_indexing !== false,
    };

    // 5. Load Appearance & Settings from site draft_data & tenant appearance
    const draftData = site.draft_data || {};
    const templateDef = SITE_TEMPLATES[(site.template_id as SiteTemplateId) || 'moderno'] || SITE_TEMPLATES.moderno;

    const appearance: SiteAppearance = {
      templateId: (site.template_id as SiteTemplateId) || 'moderno',
      primaryColor: draftData.appearance?.primaryColor || tenant.appearance?.primaryColor || '#1e293b',
      secondaryColor: draftData.appearance?.secondaryColor || tenant.appearance?.secondaryColor || '#3b82f6',
      accentColor: draftData.appearance?.accentColor || tenant.appearance?.accentColor || '#f59e0b',
      backgroundColor: draftData.appearance?.backgroundColor || templateDef.defaultAppearance.backgroundColor,
      textColor: draftData.appearance?.textColor || templateDef.defaultAppearance.textColor,
      fontFamily: draftData.appearance?.fontFamily || tenant.appearance?.fontFamily || templateDef.defaultAppearance.fontFamily,
      borderRadius: draftData.appearance?.borderRadius || templateDef.defaultAppearance.borderRadius,
      buttonStyle: draftData.appearance?.buttonStyle || templateDef.defaultAppearance.buttonStyle,
      spacing: draftData.appearance?.spacing || templateDef.defaultAppearance.spacing,
      templateVisualPresets: draftData.appearance?.templateVisualPresets || {},
      motion: draftData.appearance?.motion || undefined,
    };

    const settings: SiteSettings = {
      floatingWhatsapp: draftData.settings?.floatingWhatsapp !== false,
      floatingWhatsappMessage: draftData.settings?.floatingWhatsappMessage || 'Olá! Vim pelo site e gostaria de informações.',
      headerCtaEnabled: draftData.settings?.headerCtaEnabled !== false,
      headerCtaText: draftData.settings?.headerCtaText || 'Falar no WhatsApp',
      headerCtaLink: draftData.settings?.headerCtaLink || (tenant.whatsapp ? `https://wa.me/55${tenant.whatsapp.replace(/\D/g, '')}` : '#contato'),
    };

    // Check if there are unpublished changes
    const hasUnpublishedChanges =
      site.status !== 'published' ||
      !site.published_data ||
      JSON.stringify(site.published_data.sections) !== JSON.stringify(sections) ||
      site.published_data.templateId !== site.template_id ||
      JSON.stringify(site.published_data.appearance) !== JSON.stringify(appearance) ||
      JSON.stringify(site.published_data.seo) !== JSON.stringify(seo) ||
      JSON.stringify(site.published_data.settings) !== JSON.stringify(settings);

    return {
      id: site.id,
      tenantId: site.tenant_id,
      templateId: (site.template_id as SiteTemplateId) || 'moderno',
      status: site.status,
      sections,
      seo,
      appearance,
      settings,
      hasUnpublishedChanges,
      publishedAt: site.published_at,
      updatedAt: site.updated_at,
      createdAt: site.created_at,
    };
  }

  /**
   * Saves draft alterations without updating the public published version.
   */
  public async saveDraft(
    tenantId: string,
    payload: {
      templateId?: SiteTemplateId;
      sections?: SiteSection[];
      seo?: Partial<SiteSeo>;
      appearance?: Partial<SiteAppearance>;
      settings?: Partial<SiteSettings>;
    },
    requester: User
  ): Promise<SiteData> {
    if (requester.role !== 'SUPER_ADMIN' && requester.tenantId !== tenantId) {
      throw new Error('Acesso negado para salvar rascunho.');
    }

    const currentSite = await this.getTenantSite(tenantId, requester);
    const now = new Date().toISOString();

    // 1. Update template & draft_data on site record
    const draftData = {
      appearance: { ...currentSite.appearance, ...(payload.appearance || {}) },
      settings: { ...currentSite.settings, ...(payload.settings || {}) },
    };

    await supabaseAdmin
      .from('sites')
      .update({
        template_id: payload.templateId || currentSite.templateId,
        draft_data: draftData,
        updated_at: now,
      })
      .eq('id', currentSite.id);

    // 2. Update sections if provided
    if (payload.sections) {
      // Normalize and sanitize all section IDs to valid UUIDs
      const sanitizedSections: SiteSection[] = payload.sections.map((sec, idx) => ({
        ...sec,
        id: ensureValidUUID(sec.id),
        position: idx,
      }));

      // Delete sections that were removed
      const sanitizedSectionIds = new Set(sanitizedSections.map((s) => s.id));
      for (const oldSec of currentSite.sections) {
        if (!sanitizedSectionIds.has(oldSec.id)) {
          await supabaseAdmin.from('site_sections').delete().eq('id', oldSec.id);
        }
      }

      // Upsert/Update sections
      for (let i = 0; i < sanitizedSections.length; i++) {
        const sec = sanitizedSections[i];
        const existing = currentSite.sections.find((s) => s.id === sec.id);

        if (existing) {
          await supabaseAdmin
            .from('site_sections')
            .update({
              section_type: sec.type,
              position: i,
              is_enabled: sec.isEnabled,
              settings: sec.settings,
              updated_at: now,
            })
            .eq('id', sec.id);
        } else {
          await supabaseAdmin.from('site_sections').insert({
            id: sec.id,
            site_id: currentSite.id,
            tenant_id: tenantId,
            section_type: sec.type,
            position: i,
            is_enabled: sec.isEnabled,
            settings: sec.settings,
            created_at: now,
            updated_at: now,
          });
        }
      }
    }

    // 3. Update SEO if provided
    if (payload.seo) {
      const mergedSeo = { ...currentSite.seo, ...payload.seo };
      await supabaseAdmin
        .from('site_seo')
        .update({
          title: mergedSeo.title,
          description: mergedSeo.description,
          keywords: mergedSeo.keywords || '',
          og_title: mergedSeo.ogTitle || mergedSeo.title,
          og_description: mergedSeo.ogDescription || mergedSeo.description,
          og_image: mergedSeo.ogImage || '',
          favicon: mergedSeo.favicon || '',
          allow_indexing: mergedSeo.allowIndexing,
          updated_at: now,
        })
        .eq('site_id', currentSite.id);
    }

    await repo.logAudit({
      actorUserId: requester.id,
      actorUserName: requester.name,
      tenantId,
      action: 'SITE_DRAFT_SAVE',
      entity: 'sites',
      entityId: currentSite.id,
    });

    return this.getTenantSite(tenantId, requester);
  }

  /**
   * Publishes the current draft to the public site and creates a version snapshot.
   */
  public async publishSite(tenantId: string, requester: User): Promise<SiteData> {
    if (requester.role !== 'SUPER_ADMIN' && requester.tenantId !== tenantId) {
      throw new Error('Acesso negado para publicar este site.');
    }

    const currentSite = await this.getTenantSite(tenantId, requester);
    const now = new Date().toISOString();

    // Snapshot payload for public serving and version history
    const publicSnapshot = {
      templateId: currentSite.templateId,
      sections: currentSite.sections,
      seo: currentSite.seo,
      appearance: currentSite.appearance,
      settings: currentSite.settings,
      publishedAt: now,
    };

    // 1. Update site record to published
    await supabaseAdmin
      .from('sites')
      .update({
        status: 'published',
        published_data: publicSnapshot,
        published_at: now,
        updated_at: now,
      })
      .eq('id', currentSite.id);

    // 2. Count current versions and store snapshot
    const { data: existingVersions } = await supabaseAdmin
      .from('site_versions')
      .select('version_number')
      .eq('site_id', currentSite.id);

    const nextVer = (existingVersions?.length || 0) + 1;

    await supabaseAdmin.from('site_versions').insert({
      id: crypto.randomUUID(),
      site_id: currentSite.id,
      tenant_id: tenantId,
      version_number: nextVer,
      snapshot: publicSnapshot,
      published_by_user_id: requester.id,
      created_at: now,
    });

    await repo.logAudit({
      actorUserId: requester.id,
      actorUserName: requester.name,
      tenantId,
      action: 'SITE_PUBLISH',
      entity: 'sites',
      entityId: currentSite.id,
      metadata: { version: nextVer },
    });

    return this.getTenantSite(tenantId, requester);
  }

  /**
   * Resolves and serves public site for visitor by tenant slug.
   * Checks operational availability and published state.
   */
  public async getPublicSiteBySlug(
    slug: string,
    options?: { isDraftPreview?: boolean; requester?: User }
  ): Promise<{
    success: boolean;
    isPublished: boolean;
    tenant: Tenant | null;
    site: SiteData | null;
    operationStatus?: any;
    error?: string;
  }> {
    const tenant = await repo.getTenantBySlug(slug);
    if (!tenant) {
      return {
        success: false,
        isPublished: false,
        tenant: null,
        site: null,
        error: `Nenhum estabelecimento encontrado para o endereço "${slug}".`,
      };
    }

    // Check operational status
    const op = canTenantOperate(tenant.status);
    if (!op.canOperate) {
      return {
        success: false,
        isPublished: false,
        tenant,
        site: null,
        operationStatus: op,
        error: op.blockedReason || 'Este estabelecimento encontra-se indisponível no momento.',
      };
    }

    // Fetch site
    const { data: rawSite } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('tenant_id', tenant.id)
      .single();

    if (!rawSite) {
      return {
        success: true,
        isPublished: false,
        tenant,
        site: null,
        operationStatus: op,
      };
    }

    // If draft preview requested by authorized user
    if (options?.isDraftPreview && options.requester) {
      const draftSite = await this.getTenantSite(tenant.id, options.requester);
      return {
        success: true,
        isPublished: true,
        tenant,
        site: draftSite,
        operationStatus: op,
      };
    }

    // Public visitor access: serve published_data or fallback to current draft site data so it's instantly live
    let pub = rawSite.published_data;
    if (!pub || !pub.sections || pub.sections.length === 0) {
      const draftSite = await this.getTenantSite(tenant.id, { id: 'public-visitor', role: 'CLIENT_ADMIN', tenantId: tenant.id } as User);
      pub = {
        templateId: pub?.templateId || draftSite.templateId,
        sections: (pub?.sections && pub.sections.length > 0) ? pub.sections : draftSite.sections,
        seo: pub?.seo || draftSite.seo,
        appearance: pub?.appearance || draftSite.appearance,
        settings: pub?.settings || draftSite.settings,
      };
    }
    const features = await repo.resolveTenantFeatures(tenant.id);

    const publishedSiteData: SiteData = {
      id: rawSite.id,
      tenantId: rawSite.tenant_id,
      templateId: pub.templateId || rawSite.template_id || 'moderno',
      status: 'published',
      sections: (pub.sections || []).filter((s: SiteSection) => {
        if (!s.isEnabled) return false;
        if (s.type === 'products' && !features.products) return false;
        return true;
      }),
      seo: pub.seo || {
        title: `${tenant.name} | ${tenant.segment}`,
        description: `Conheça ${tenant.name}`,
        allowIndexing: true,
      },
      appearance: pub.appearance || {
        templateId: pub.templateId || 'moderno',
        primaryColor: tenant.appearance?.primaryColor || '#1e293b',
        secondaryColor: tenant.appearance?.secondaryColor || '#3b82f6',
        accentColor: tenant.appearance?.accentColor || '#f59e0b',
        backgroundColor: '#ffffff',
        textColor: '#0f172a',
        fontFamily: tenant.appearance?.fontFamily || 'Inter',
        borderRadius: 'lg',
        buttonStyle: 'filled',
        spacing: 'normal',
      },
      settings: pub.settings || {
        floatingWhatsapp: true,
        headerCtaEnabled: true,
      },
      hasUnpublishedChanges: false,
      publishedAt: rawSite.published_at,
      updatedAt: rawSite.updated_at,
      createdAt: rawSite.created_at,
    };

    return {
      success: true,
      isPublished: true,
      tenant,
      site: publishedSiteData,
      operationStatus: op,
    };
  }
}

export const siteRepo = new SiteRepository();
