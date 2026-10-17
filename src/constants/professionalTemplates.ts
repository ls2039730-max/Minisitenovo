import { Tenant } from '../types/saas';
import { generateUUID } from "../utils/uuid";
import { SiteData, SiteSection, SiteAppearance, SiteTemplateId, SectionType } from '../types/site';

export interface TemplateCategory {
  id: string;
  label: string;
  description: string;
  iconName: string;
}

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    id: 'todas',
    label: 'Todos os Templates',
    description: 'Explore todos os modelos profissionais do catálogo',
    iconName: 'LayoutGrid',
  },
  {
    id: 'barbearias',
    label: 'Barbearias',
    description: 'Estilo masculino, visual marcante, cortes e agendamento rápido',
    iconName: 'Scissors',
  },
  {
    id: 'beleza',
    label: 'Salões & Estética',
    description: 'Composição editorial de alto padrão, mechas, tratamentos e spa',
    iconName: 'Sparkles',
  },
  {
    id: 'gastronomia',
    label: 'Restaurantes & Gastronomia',
    description: 'Fotografia gastronômica, cardápio visual e pedidos no WhatsApp',
    iconName: 'Utensils',
  },
  {
    id: 'clinicas',
    label: 'Clínicas & Consultórios',
    description: 'Comunicação clínica humanizada, especialidades e confiança médica',
    iconName: 'Stethoscope',
  },
  {
    id: 'oficinas',
    label: 'Estética Automotiva & Oficinas',
    description: 'Visual moderno, detalhamento automotivo, vitrificação e serviços mecânicos',
    iconName: 'Car',
  },
  {
    id: 'lojas',
    label: 'Lojas & Boutiques',
    description: 'Lookbooks sofisticados, destaques de coleções e catálogo direto',
    iconName: 'ShoppingBag',
  },
  {
    id: 'otica_moda',
    label: 'Ótica e Moda',
    description: 'Design editorial, armações conceituais, catálogo de óculos e alto impacto visual',
    iconName: 'Glasses',
  },
];

export interface ProfessionalTemplate {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  styleName: string;
  badge?: string;
  isReady: boolean; // Identifies fully functional vs preview demo
  description: string;
  highlights: string[];
  previewImage: string;
  baseTemplateId: SiteTemplateId;
  defaultAppearance: SiteAppearance;
  buildSections: (tenant: Partial<Tenant>, existingSections?: SiteSection[]) => SiteSection[];
}

/**
 * Separates presentation and commercial content cleanly:
 * Adapts tenant sections to a new template WITHOUT losing, wiping, or overwriting
 * existing database IDs, user-written texts, product catalogs, prices, images, or configurations.
 */
export function adaptSectionsForTemplate(
  templateId: string,
  preferredTypes: SectionType[],
  starterSections: SiteSection[],
  tenant: Partial<Tenant>,
  existingSections?: SiteSection[]
): SiteSection[] {
  // If there are no existing sections (first time setup for a brand new site), use starter sections
  if (!existingSections || existingSections.length === 0) {
    return starterSections;
  }

  // 1. PRESERVE EVERY SINGLE EXISTING SECTION (IDs, user texts, images, settings)
  const usedIds = new Set<string>();
  const result: SiteSection[] = [];

  // A. Place existing sections matching the template's preferred flow in order
  for (const pType of preferredTypes) {
    const existing = existingSections.find((s) => s.type === pType && !usedIds.has(s.id));
    if (existing) {
      const mergedSettings = { ...existing.settings };

      // Apply layout presentation hint without touching content
      if (existing.type === 'hero') {
        if (templateId === 'otica_editorial') {
          mergedSettings.layoutVariant = 'otica_editorial';
        } else if (templateId === 'restaurante_moderno') {
          mergedSettings.layoutVariant = 'culinary_bistro';
        } else if (templateId === 'barbearia_premium') {
          mergedSettings.layoutVariant = 'vintage_barber';
        } else if (templateId === 'salao_luxury') {
          mergedSettings.layoutVariant = 'luxury_salon';
        } else {
          mergedSettings.layoutVariant = undefined;
        }
      }

      result.push({
        ...existing,
        position: result.length,
        settings: mergedSettings,
      });
      usedIds.add(existing.id);
    }
  }

  // B. Preserve ALL other existing sections that were not in preferredTypes
  // (e.g. quick_buttons, social_links, hours, location, reviews, custom blocks)
  for (const s of existingSections) {
    if (!usedIds.has(s.id)) {
      result.push({
        ...s,
        position: result.length,
      });
      usedIds.add(s.id);
    }
  }

  // C. If the template contains a key section type that the user does not have yet (e.g. gallery),
  // add it with starter settings without replacing any existing content
  const fallbackSiteId = existingSections?.[0]?.siteId || 'site-preview';
  const fallbackTenantId = (tenant.id as string) || existingSections?.[0]?.tenantId || 'tenant-preview';

  for (const starter of starterSections) {
    const alreadyHas = result.some((s) => s.type === starter.type);
    if (!alreadyHas) {
      result.push({
        ...starter,
        id: starter.id && /^[0-9a-f-]{36}$/i.test(starter.id) ? starter.id : generateUUID(),
        siteId: fallbackSiteId,
        tenantId: fallbackTenantId,
        position: result.length,
      });
    }
  }

  return result;
}

export const PROFESSIONAL_TEMPLATES: ProfessionalTemplate[] = [
  // 0. Ótica Editorial Premium (Template Editorial Avant-Garde)
  {
    id: 'otica_editorial',
    name: 'Ótica Editorial Premium',
    category: 'otica_moda',
    categoryLabel: 'Ótica e Moda',
    styleName: 'Editorial, contemporâneo, experimental e sofisticado',
    badge: 'Exclusivo & Tendência',
    isReady: true,
    description: 'Design editorial avant-garde inspirado na alta alfaiataria de eyewear. Tipografia display de alto impacto, composição assimétrica, microanimações fluidas e vitrine interativa com recomendação por estilo.',
    highlights: [
      'Hero de campanha em tela cheia com tipografia monumental',
      'Faixa tipográfica infinita contínua em loop ("ENCONTRE SEU ESTILO • OLHE DIFERENTE • VIVA SUA IDENTIDADE •")',
      'Quiz interativo "Descubra seu Estilo" com 5 arquétipos (Clássico, Minimalista, Retrô, Moderno, Ousado)',
      'Grade editorial de produtos reais com variação assimétrica',
      'Manifesto de marca, lookbook visual e ateliê com credenciais técnicas',
      'Integração direta com WhatsApp comercial e sacola de compras',
    ],
    previewImage: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1200&q=80',
    baseTemplateId: 'otica_editorial',
    defaultAppearance: {
      templateId: 'otica_editorial',
      primaryColor: '#101010',
      secondaryColor: '#C7F36B',
      accentColor: '#C7F36B',
      backgroundColor: '#101010',
      textColor: '#F8F8F5',
      fontFamily: 'Syne',
      borderRadius: 'none',
      buttonStyle: 'filled',
      spacing: 'spacious',
    },
    buildSections: (tenant, existingSections) => {
      const siteId = existingSections?.[0]?.siteId || 'site-preview';
      const tenantId = tenant.id || 'tenant-preview';
      const now = new Date().toISOString();
      const phoneDigits = tenant.whatsapp
        ? tenant.whatsapp.replace(/\D/g, '')
        : tenant.phone
        ? tenant.phone.replace(/\D/g, '')
        : '';
      const waUrl = phoneDigits ? `https://wa.me/55${phoneDigits}` : '#contato';

      const starterSections: SiteSection[] = [
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'hero',
          position: 0,
          isEnabled: true,
          settings: {
            headline: 'SEU OLHAR. SUAS REGRAS.',
            subtitle: 'Óculos que expressam quem você é.',
            shortText: 'Curadoria exclusiva de armações autorais e alta precisão ótica para transformar sua identidade.',
            coverImage: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1920&q=85',
            bgType: 'image',
            overlayOpacity: 60,
            alignment: 'left',
            layoutVariant: 'otica_editorial',
            tagline: 'COLEÇÃO AUTORAL 2026 · ALTA PRECISÃO ÓTICA',
            primaryButton: {
              text: 'EXPLORE A COLEÇÃO',
              url: '#colecao',
              enabled: true,
            },
            secondaryButton: {
              text: 'CONSULTORIA NO WHATSAPP',
              url: waUrl,
              enabled: true,
            },
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'about',
          position: 1,
          isEnabled: true,
          settings: {
            title: 'NÃO É APENAS VISÃO. É IDENTIDADE.',
            subtitle: 'A armação certa não esconde o seu rosto. Ela traduz a sua essência.',
            text: 'Nossa ótica opera no ponto de convergência entre a moda autoral e a tecnologia óptica mais avançada do mundo. Selecionamos armações esculpidas em acetato italiano e titânio puro para quem entende que o óculos é a moldura viva da sua personalidade.',
            image: 'https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=1200&q=80',
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'products',
          position: 2,
          isEnabled: true,
          settings: {
            title: 'Coleção em Destaque',
            subtitle: 'Armações e óculos solares com procedência garantida e estética internacional.',
            displayMode: 'grid',
            limit: 8,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'gallery',
          position: 3,
          isEnabled: true,
          settings: {
            title: 'Campanha Visual',
            subtitle: 'Expressão, atitude e elegância em cada ângulo e iluminação.',
            items: [
              {
                id: 'g1',
                url: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=800&q=80',
                caption: 'Geometrias arquiteturais e lentes fotocromáticas',
              },
              {
                id: 'g2',
                url: 'https://images.unsplash.com/photo-1591076482161-42ce6da69f67?auto=format&fit=crop&w=800&q=80',
                caption: 'Acabamentos acetinados e detalhes em titânio fosco',
              },
              {
                id: 'g3',
                url: 'https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?auto=format&fit=crop&w=800&q=80',
                caption: 'Edição limitada Solar Avant-Garde',
              },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'google_reviews',
          position: 4,
          isEnabled: true,
          settings: {
            title: 'O Que Nossos Clientes Dizem',
            subtitle: 'A experiência de quem encontrou a armação perfeita.',
            badge: 'AVALIAÇÕES REAIS',
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'cta',
          position: 5,
          isEnabled: true,
          settings: {
            title: 'SEU NOVO OLHAR COMEÇA AQUI',
            subtitle: 'Converse com nossos consultores pelo WhatsApp para receber recomendações exclusivas ou tirar dúvidas sobre armações e lentes.',
            buttonText: 'Iniciar Atendimento no WhatsApp',
            buttonUrl: waUrl,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'business_hours',
          position: 6,
          isEnabled: true,
          settings: {
            title: 'Horário do Showroom',
            subtitle: 'Atendimento presencial e consultas sob medida.',
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'location',
          position: 7,
          isEnabled: true,
          settings: {
            title: 'Onde Estamos',
            subtitle: 'Venha nos visitar ou trace a rota no seu aplicativo preferido.',
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'footer',
          position: 8,
          isEnabled: true,
          settings: {
            showSocial: true,
            showSchedule: true,
            showAddress: true,
          },
          createdAt: now,
          updatedAt: now,
        },
      ];

      return adaptSectionsForTemplate(
        'otica_editorial',
        ['hero', 'about', 'products', 'gallery', 'google_reviews', 'cta', 'business_hours', 'location'],
        starterSections,
        tenant,
        existingSections
      );
    },
  },
  // 1. Barbearia Premium (Referência 1)
  {
    id: 'barbearia_premium',
    name: 'Barbearia Vintage & Black Gold',
    category: 'barbearias',
    categoryLabel: 'Barbearias',
    styleName: 'Dark Metálico & Clássico',
    badge: 'Mais Escolhido',
    isReady: true,
    description: 'Visual cinematográfico escuro com detalhes metálicos e dourados. Foco em cortes clássicos e contemporâneos, barboterapia e atendimento prático via WhatsApp.',
    highlights: ['Hero de alto impacto dark', 'Menu de acesso rápido', 'Tabela de serviços e combos', 'Equipe de barbeiros', 'Galeria de cortes'],
    previewImage: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1200&q=80',
    baseTemplateId: 'impacto',
    defaultAppearance: {
      templateId: 'impacto',
      primaryColor: '#0f172a',
      secondaryColor: '#d97706',
      accentColor: '#f59e0b',
      backgroundColor: '#090d16',
      textColor: '#f8fafc',
      fontFamily: 'Montserrat',
      borderRadius: 'lg',
      buttonStyle: 'filled',
      spacing: 'normal',
    },
    buildSections: (tenant, existingSections) => {
      const siteId = existingSections?.[0]?.siteId || 'site-preview';
      const tenantId = tenant.id || 'tenant-preview';
      const now = new Date().toISOString();
      const phoneDigits = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';
      const waUrl = phoneDigits ? `https://wa.me/55${phoneDigits}` : '#contato';

      const starterSections: SiteSection[] = [
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'hero',
          position: 0,
          isEnabled: true,
          settings: {
            headline: `${tenant.name || 'Barbearia Premium'} — Tradição & Estilo`,
            subtitle: 'Cortes clássicos e modernos, barboterapia relaxante e ambiente exclusivo.',
            shortText: 'Atendimento pontual com profissionais dedicados e foco no seu bem-estar.',
            coverImage: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1920&q=85',
            bgType: 'image',
            overlayOpacity: 70,
            alignment: 'center',
            layoutVariant: 'vintage_barber',
            tagline: 'TRADIÇÃO · VISAGISMO MASCULINO · EXPERIÊNCIA DE QUALIDADE',
            features: [
              '✂️ Visagismo & Estilo Personalizado',
              '💈 Barboterapia com Toalha Quente',
              '⏱️ Pontualidade com Hora Marcada',
            ],
            primaryButton: {
              text: 'Agendar pelo WhatsApp',
              url: waUrl,
              enabled: true,
            },
            secondaryButton: {
              text: 'Conheça Nossos Serviços',
              url: '#servicos',
              enabled: true,
            },
            showSubBannerVideo: false,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'quick_buttons',
          position: 1,
          isEnabled: true,
          settings: {
            title: 'Acesso Rápido',
            subtitle: 'Escolha como prefere interagir conosco agora',
            buttons: [
              { id: 'b1', title: 'Agendamento WhatsApp', url: waUrl, isEnabled: true },
              { id: 'b2', title: 'Tabela de Serviços', url: '#servicos', isEnabled: true },
              { id: 'b3', title: 'Nossa Equipe', url: '#equipe', isEnabled: true },
              { id: 'b4', title: 'Como Chegar', url: '#localizacao', isEnabled: true },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'about',
          position: 2,
          isEnabled: true,
          settings: {
            title: 'Muito Mais que um Corte',
            subtitle: 'Uma verdadeira experiência de cavalheiro',
            text: `Na ${tenant.name || 'nossa barbearia'}, resgatamos a tradição do barbear clássico com toalha quente e navalha afiada, combinada às técnicas mais inovadoras de visagismo masculino. Nosso espaço foi planejado para você relaxar com tranquilidade e renovar sua autoestima.`,
            image: 'https://images.unsplash.com/photo-1512690459411-b9245aed614b?auto=format&fit=crop&w=800&q=80',
            layout: 'image_right',
            highlights: [
              { title: 'Visagismo Masculino', desc: 'Análise do formato do rosto para o corte ideal.' },
              { title: 'Barboterapia & Toalha Quente', desc: 'Relaxamento profundo com óleos essenciais.' },
              { title: 'Pontualidade Britânica', desc: 'Respeito absoluto ao seu tempo e compromissos.' },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'services',
          position: 3,
          isEnabled: true,
          settings: {
            title: 'Nossos Serviços & Combos',
            subtitle: 'Serviços especializados com produtos profissionais premium',
            layout: 'grid',
            showPrices: true,
            showDuration: true,
            buttonText: 'Agendar este Serviço',
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'team',
          position: 4,
          isEnabled: true,
          settings: {
            title: 'Nossos Mestres Barbeiros',
            subtitle: 'Profissionais certificados e especialistas em visagismo',
            members: [
              {
                id: 'm1',
                name: 'Carlos Silva',
                role: 'Master Barber & Visagista',
                bio: '10 anos de experiência em cortes clássicos e fades de alta precisão.',
                photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
              },
              {
                id: 'm2',
                name: 'Rodrigo Santana',
                role: 'Especialista em Barboterapia',
                bio: 'Referência em alinhamento de barba, hidratação e navalhados.',
                photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
              },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'gallery',
          position: 5,
          isEnabled: true,
          settings: {
            title: 'Galeria de Trabalhos & Espaço',
            subtitle: 'Confira os últimos cortes e o ambiente da nossa unidade',
            columns: 3,
            items: [
              { id: 'g1', url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=600&q=80', caption: 'Estrutura premium e confortável' },
              { id: 'g2', url: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=600&q=80', caption: 'Corte fade militar com acabamento perfeito' },
              { id: 'g3', url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=600&q=80', caption: 'Barboterapia com toalha quente e hidratação' },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'business_hours',
          position: 6,
          isEnabled: true,
          settings: {
            title: 'Horários de Atendimento',
            subtitle: 'Planeje sua visita e agende com antecedência',
            showStatusBadge: true,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'location',
          position: 7,
          isEnabled: true,
          settings: {
            title: 'Nossa Localização',
            subtitle: 'Fácil acesso com estacionamento conveniado',
            showMap: true,
            showDirectionsButton: true,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'cta',
          position: 8,
          isEnabled: true,
          settings: {
            title: 'Pronto para elevar seu estilo?',
            subtitle: 'Garanta seu horário com nossos mestres barbeiros pelo WhatsApp.',
            buttonText: 'Garantir Meu Horário no WhatsApp',
            buttonUrl: waUrl,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'footer',
          position: 9,
          isEnabled: true,
          settings: {
            showSocial: true,
            showSchedule: true,
            showAddress: true,
          },
          createdAt: now,
          updatedAt: now,
        },
      ];

      return adaptSectionsForTemplate(
        'barbearia_premium',
        ['hero', 'quick_buttons', 'services', 'team', 'gallery', 'about', 'google_reviews', 'cta', 'footer'],
        starterSections,
        tenant,
        existingSections
      );
    },
  },

  // 2. Salão de Beleza Luxury (Referência 2)
  {
    id: 'salao_luxury',
    name: 'Salão de Beleza & Estética Luxury',
    category: 'beleza',
    categoryLabel: 'Salões & Estética',
    styleName: 'Editorial Sofisticado & Champanhe',
    badge: 'Alta Conversão',
    isReady: true,
    description: 'Composição editorial requintada com tons suaves de champanhe, rosé e vinho nobre. Tipografia refinada, galeria de procedimentos e destaque para especialistas.',
    highlights: ['Design editorial refinado', 'Tons champanhe e rosé', 'Procedimentos capilares e estéticos', 'Galeria de transformações', 'Contato direto no WhatsApp'],
    previewImage: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80',
    baseTemplateId: 'elegante',
    defaultAppearance: {
      templateId: 'elegante',
      primaryColor: '#831843',
      secondaryColor: '#db2777',
      accentColor: '#d97706',
      backgroundColor: '#fdfbf7',
      textColor: '#292524',
      fontFamily: 'Playfair Display',
      borderRadius: 'md',
      buttonStyle: 'filled',
      spacing: 'spacious',
    },
    buildSections: (tenant, existingSections) => {
      const siteId = existingSections?.[0]?.siteId || 'site-preview';
      const tenantId = tenant.id || 'tenant-preview';
      const now = new Date().toISOString();
      const phoneDigits = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';
      const waUrl = phoneDigits ? `https://wa.me/55${phoneDigits}` : '#contato';

      const starterSections: SiteSection[] = [
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'hero',
          position: 0,
          isEnabled: true,
          settings: {
            headline: `${tenant.name || 'Studio Luxury'} — Cuidado & Elegância`,
            subtitle: 'Especialistas em mechas iluminadas, tratamentos capilares e estética avançada.',
            shortText: 'Um refúgio de bem-estar pensado para realçar sua beleza natural.',
            coverImage: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1920&q=85',
            bgType: 'image',
            overlayOpacity: 55,
            alignment: 'center',
            layoutVariant: 'luxury_salon',
            tagline: 'HAIR CONCEPT · ESTÉTICA AVANÇADA · BEM-ESTAR',
            features: [
              '✨ Avaliação Capilar Personalizada',
              '🌿 Produtos & Tratamentos Selecionados',
              '🛋️ Ambiente Confortável & Acolhedor',
            ],
            primaryButton: {
              text: 'Agendar pelo WhatsApp',
              url: waUrl,
              enabled: true,
            },
            secondaryButton: {
              text: 'Ver Procedimentos',
              url: '#servicos',
              enabled: true,
            },
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'quick_buttons',
          position: 1,
          isEnabled: true,
          settings: {
            title: 'Atendimento Exclusivo',
            subtitle: 'Conecte-se conosco em poucos toques',
            buttons: [
              { id: 'b1', title: 'Consultoria pelo WhatsApp', url: waUrl, isEnabled: true },
              { id: 'b2', title: 'Catálogo de Serviços', url: '#servicos', isEnabled: true },
              { id: 'b3', title: 'Antes e Depois', url: '#galeria', isEnabled: true },
              { id: 'b4', title: 'Endereço do Espaço', url: '#localizacao', isEnabled: true },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'about',
          position: 2,
          isEnabled: true,
          settings: {
            title: 'Sua Beleza em Primeiro Lugar',
            subtitle: 'Cuidados dedicados e técnicas modernas',
            text: `No ${tenant.name || 'nosso espaço'}, cada cliente é atendida com atenção individualizada. Nossa equipe combina conhecimento técnico e tendências contemporâneas para oferecer resultados harmônicos, duradouros e que valorizam sua beleza autêntica. Desfrute de um ambiente climatizado e acolhedor.`,
            image: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=800&q=80',
            layout: 'image_left',
            highlights: [
              { title: 'Avaliação Individualizada', desc: 'Análise atenta das necessidades dos fios e da pele.' },
              { title: 'Técnicas Contemporâneas', desc: 'Procedimentos executados com precisão e produtos de qualidade.' },
              { title: 'Conforto & Bem-estar', desc: 'Espaço pensado para você relaxar durante todo o seu atendimento.' },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'services',
          position: 3,
          isEnabled: true,
          settings: {
            title: 'Procedimentos & Experiências',
            subtitle: 'Técnicas exclusivas executadas por especialistas dedicados',
            layout: 'cards',
            showPrices: true,
            showDuration: true,
            buttonText: 'Consultar Disponibilidade',
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'gallery',
          position: 4,
          isEnabled: true,
          settings: {
            title: 'Transformações & Espaço',
            subtitle: 'Inspire-se com os resultados de nossas clientes',
            columns: 3,
            items: [
              { id: 'g1', url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=600&q=80', caption: 'Loiras e iluminadas de alta definição' },
              { id: 'g2', url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=600&q=80', caption: 'Tratamentos de nutrição e brilho intenso' },
              { id: 'g3', url: 'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?auto=format&fit=crop&w=600&q=80', caption: 'Penteados e maquiagens para ocasiões especiais' },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'google_reviews',
          position: 5,
          isEnabled: true,
          settings: {
            title: 'Avaliações de Quem Ama Nosso Espaço',
            subtitle: 'Satisfação comprovada com nota máxima no Google',
            rating: 5.0,
            reviewCount: 184,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'business_hours',
          position: 6,
          isEnabled: true,
          settings: {
            title: 'Horário de Funcionamento',
            subtitle: 'Atendimento exclusivo mediante agendamento prévio',
            showStatusBadge: true,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'location',
          position: 7,
          isEnabled: true,
          settings: {
            title: 'Localização & Contato',
            subtitle: 'Ambiente nobre com manobrista na porta',
            showMap: true,
            showDirectionsButton: true,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'cta',
          position: 8,
          isEnabled: true,
          settings: {
            title: 'Reserve Seu Momento Especial',
            subtitle: 'Fale com nossa concierge e escolha o melhor dia e horário.',
            buttonText: 'Falar com a Concierge no WhatsApp',
            buttonUrl: waUrl,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'footer',
          position: 9,
          isEnabled: true,
          settings: {
            showSocial: true,
            showSchedule: true,
            showAddress: true,
          },
          createdAt: now,
          updatedAt: now,
        },
      ];

      return adaptSectionsForTemplate(
        'salao_luxury',
        ['hero', 'quick_buttons', 'services', 'gallery', 'about', 'team', 'google_reviews', 'cta', 'footer'],
        starterSections,
        tenant,
        existingSections
      );
    },
  },

  // 3. Restaurante Moderno (Referência 3)
  {
    id: 'restaurante_moderno',
    name: 'Bistrô & Gastronomia Contemporânea',
    category: 'gastronomia',
    categoryLabel: 'Restaurantes & Gastronomia',
    styleName: 'Vibrante Gastronômico & Cardápio',
    badge: 'Destaque',
    isReady: true,
    description: 'Visual apetitoso com fotografia culinária expressiva, cardápio organizado por categorias, destaques do chef e canal direto no WhatsApp.',
    highlights: ['Fotografia de pratos em alta definição', 'Cardápio visual e categorias', 'Horários e localização', 'Galeria de fotos do espaço', 'Contato direto no WhatsApp'],
    previewImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
    baseTemplateId: 'moderno',
    defaultAppearance: {
      templateId: 'moderno',
      primaryColor: '#c2410c',
      secondaryColor: '#ea580c',
      accentColor: '#f59e0b',
      backgroundColor: '#ffffff',
      textColor: '#1c1917',
      fontFamily: 'Plus Jakarta Sans',
      borderRadius: 'lg',
      buttonStyle: 'filled',
      spacing: 'normal',
    },
    buildSections: (tenant, existingSections) => {
      const siteId = existingSections?.[0]?.siteId || 'site-preview';
      const tenantId = tenant.id || 'tenant-preview';
      const now = new Date().toISOString();
      const phoneDigits = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';
      const waUrl = phoneDigits ? `https://wa.me/55${phoneDigits}` : '#contato';

      const starterSections: SiteSection[] = [
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'hero',
          position: 0,
          isEnabled: true,
          settings: {
            headline: `${tenant.name || 'Bistrô & Restaurante'} — Experiência Culinária Única`,
            subtitle: 'Ingredientes frescos de produtores artesanais, carnes nobres grelhadas na brasa e carta autoral de vinhos e drinks.',
            shortText: 'Almoço executivo, jantar intimista e carta autoral de vinhos e coquetéis.',
            coverImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1920&q=85',
            bgType: 'image',
            overlayOpacity: 60,
            alignment: 'center',
            layoutVariant: 'culinary_bistro',
            tagline: 'GASTRONOMIA AUTORAL & COQUETELARIA CONTEMPORÂNEA',
            features: [
              '🔥 Receitas Feitas na Hora com Insumos Frescos',
              '🍷 Bebidas & Sobremesas Selecionadas',
              '🍽️ Atendimento no Local e Pedidos Rápidos',
            ],
            primaryButton: {
              text: 'Fazer Pedido no WhatsApp',
              url: waUrl,
              enabled: true,
            },
            secondaryButton: {
              text: 'Ver Cardápio Completo',
              url: '#produtos',
              enabled: true,
            },
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'quick_buttons',
          position: 1,
          isEnabled: true,
          settings: {
            title: 'Acesso Rápido ao Restaurante',
            subtitle: 'Peça atendimento, consulte cardápio ou veja nossa localização',
            buttons: [
              { id: 'b1', title: 'Atendimento WhatsApp', url: waUrl, isEnabled: true },
              { id: 'b2', title: 'Cardápio Digital', url: '#produtos', isEnabled: true },
              { id: 'b3', title: 'Horários de Funcionamento', url: '#horarios', isEnabled: true },
              { id: 'b4', title: 'Como Chegar', url: '#localizacao', isEnabled: true },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'about',
          position: 2,
          isEnabled: true,
          settings: {
            title: 'Da Nossa Cozinha para a Sua Mesa',
            subtitle: 'Paixão por boa comida, hospitalidade e tradição culinária',
            text: `No ${tenant.name || 'nosso restaurante'}, acreditamos que cada refeição deve ser uma celebração. Nossos pratos são preparados diariamente com insumos frescos, combinando sabores reconfortantes e hospitalidade calorosa.`,
            image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
            layout: 'image_right',
            highlights: [
              { title: 'Insumos Frescos', desc: 'Preparo diário priorizando qualidade e sabor em cada prato.' },
              { title: 'Cardápio Variado', desc: 'Opções pensadas para agradar diferentes paladares e ocasiões.' },
              { title: 'Ambiente Confortável', desc: 'Espaço agradável para compartilhar bons momentos à mesa.' },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'products',
          position: 3,
          isEnabled: true,
          settings: {
            title: 'Destaques do Nosso Cardápio',
            subtitle: 'Conheça nossos pratos assinados, entradas e sobremesas',
            layout: 'grid',
            columns: 3,
            showCategoryTabs: true,
            showPrice: true,
            buttonText: 'Pedir pelo WhatsApp',
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'gallery',
          position: 4,
          isEnabled: true,
          settings: {
            title: 'Nosso Espaço & Criações Culinárias',
            subtitle: 'Uma atmosfera envolvente feita para reunir quem você gosta',
            columns: 3,
            items: [
              { id: 'g1', url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80', caption: 'Salão acolhedor com luz suave' },
              { id: 'g2', url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80', caption: 'Pratos preparados na hora pelo nosso chef' },
              { id: 'g3', url: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=600&q=80', caption: 'Carta de vinhos e coquetéis artesanais' },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'business_hours',
          position: 5,
          isEnabled: true,
          settings: {
            title: 'Horário de Funcionamento & Cozinha',
            subtitle: 'Almoço e jantar todos os dias',
            showStatusBadge: true,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'location',
          position: 6,
          isEnabled: true,
          settings: {
            title: 'Onde Estamos',
            subtitle: 'Localização privilegiada com fácil estacionamento',
            showMap: true,
            showDirectionsButton: true,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'cta',
          position: 7,
          isEnabled: true,
          settings: {
            title: 'Deseja atendimento ou consultar o cardápio?',
            subtitle: 'Converse diretamente com a nossa equipe pelo WhatsApp para tirar dúvidas e fazer seu pedido.',
            buttonText: 'Falar com Nossa Equipe no WhatsApp',
            buttonUrl: waUrl,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'footer',
          position: 8,
          isEnabled: true,
          settings: {
            showSocial: true,
            showSchedule: true,
            showAddress: true,
          },
          createdAt: now,
          updatedAt: now,
        },
      ];

      return adaptSectionsForTemplate(
        'restaurante_moderno',
        ['hero', 'quick_buttons', 'products', 'about', 'gallery', 'business_hours', 'google_reviews', 'cta', 'footer'],
        starterSections,
        tenant,
        existingSections
      );
    },
  },

  // 4. Clínicas e Consultórios
  {
    id: 'clinica_saude',
    name: 'Clínica & Consultório Médico Humanizado',
    category: 'clinicas',
    categoryLabel: 'Clínicas & Consultórios',
    styleName: 'Minimalista Clean & Teal Confiança',
    badge: 'Saúde & Bem-Estar',
    isReady: true,
    description: 'Interface clara, acolhedora e confiável. Ideal para médicos, dentistas, psicólogos, fisioterapeutas e clínicas multidisciplinares.',
    highlights: ['Comunicação ética e segura', 'Especialidades e procedimentos', 'Corpo clínico com fotos', 'Depoimentos de pacientes', 'Canal direto de agendamento'],
    previewImage: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1200&q=80',
    baseTemplateId: 'minimalista',
    defaultAppearance: {
      templateId: 'minimalista',
      primaryColor: '#0f766e',
      secondaryColor: '#0284c7',
      accentColor: '#0d9488',
      backgroundColor: '#f8fafc',
      textColor: '#0f172a',
      fontFamily: 'Inter',
      borderRadius: 'lg',
      buttonStyle: 'filled',
      spacing: 'normal',
    },
    buildSections: (tenant, existingSections) => {
      const siteId = existingSections?.[0]?.siteId || 'site-preview';
      const tenantId = tenant.id || 'tenant-preview';
      const now = new Date().toISOString();
      const phoneDigits = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';
      const waUrl = phoneDigits ? `https://wa.me/55${phoneDigits}` : '#contato';

      const starterSections: SiteSection[] = [
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'hero',
          position: 0,
          isEnabled: true,
          settings: {
            headline: `${tenant.name || 'Clínica de Saúde Integrada'}`,
            subtitle: 'Atendimento humanizado, equipe multidisciplinar e tecnologia para o seu bem-estar.',
            shortText: 'Agendamento simplificado e suporte acolhedor do primeiro contato ao pós-consulta.',
            coverImage: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1400&q=80',
            bgType: 'gradient',
            overlayOpacity: 35,
            alignment: 'left',
            layoutVariant: 'split',
            primaryButton: {
              text: 'Agendar Consulta no WhatsApp',
              url: waUrl,
              enabled: true,
            },
            secondaryButton: {
              text: 'Conheça as Especialidades',
              url: '#servicos',
              enabled: true,
            },
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'quick_buttons',
          position: 1,
          isEnabled: true,
          settings: {
            title: 'Canais Rápidos de Atendimento',
            subtitle: 'Tire dúvidas sobre convênios ou agende sua consulta',
            buttons: [
              { id: 'b1', title: 'Agendamento Direto', url: waUrl, isEnabled: true },
              { id: 'b2', title: 'Nossas Especialidades', url: '#servicos', isEnabled: true },
              { id: 'b3', title: 'Corpo Clínico', url: '#equipe', isEnabled: true },
              { id: 'b4', title: 'Endereço & Consultório', url: '#localizacao', isEnabled: true },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'about',
          position: 2,
          isEnabled: true,
          settings: {
            title: 'Compromisso com Sua Saúde e Qualidade de Vida',
            subtitle: 'Estrutura acessível, higienizada e equipada com tecnologia moderna',
            text: `A ${tenant.name || 'nossa clínica'} nasceu com o propósito de oferecer medicina humanizada, na qual cada paciente é ouvido com tempo, empatia e rigor científico. Contamos com consultórios modernos e confortáveis para você e sua família.`,
            image: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80',
            layout: 'image_right',
            highlights: [
              { title: 'Consultas Sem Pressa', desc: 'Tempo dedicado para esclarecer todas as suas dúvidas.' },
              { title: 'Equipamentos Modernos', desc: 'Exames e diagnósticos com alta precisão e segurança.' },
              { title: 'Acessibilidade Total', desc: 'Rampa de acesso, elevador e espaço adaptado para todos.' },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'services',
          position: 3,
          isEnabled: true,
          settings: {
            title: 'Especialidades & Atendimentos',
            subtitle: 'Conheça as áreas de atuação médica e terapêutica disponíveis',
            layout: 'cards',
            showPrices: false,
            showDuration: true,
            buttonText: 'Consultar Horários Disponíveis',
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'business_hours',
          position: 4,
          isEnabled: true,
          settings: {
            title: 'Horário de Atendimento Clínico',
            subtitle: 'Segunda a sábado com horários flexíveis',
            showStatusBadge: true,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'location',
          position: 5,
          isEnabled: true,
          settings: {
            title: 'Endereço do Consultório',
            subtitle: 'Local de fácil localização no centro médico',
            showMap: true,
            showDirectionsButton: true,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'cta',
          position: 6,
          isEnabled: true,
          settings: {
            title: 'Priorize sua saúde hoje mesmo',
            subtitle: 'Fale com nossa recepção pelo WhatsApp e marque sua consulta.',
            buttonText: 'Falar com a Recepção no WhatsApp',
            buttonUrl: waUrl,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'footer',
          position: 7,
          isEnabled: true,
          settings: {
            showSocial: true,
            showSchedule: true,
            showAddress: true,
          },
          createdAt: now,
          updatedAt: now,
        },
      ];

      return adaptSectionsForTemplate(
        'clinica_saude',
        ['hero', 'quick_buttons', 'services', 'team', 'about', 'faq', 'google_reviews', 'cta', 'footer'],
        starterSections,
        tenant,
        existingSections
      );
    },
  },

  // 5. Oficinas e Estética Automotiva
  {
    id: 'estetica_automotiva',
    name: 'Estética Automotiva & Detailer Pro',
    category: 'oficinas',
    categoryLabel: 'Estética Automotiva & Oficinas',
    styleName: 'Dark Carbon Tech & Alto Brilho',
    badge: 'Alta Performance',
    isReady: true,
    description: 'Composição visual de alta energia com contraste escuro, fotos de veículos polidos e vitrificados, pacotes de detalhamento e orçamentos rápidos pelo WhatsApp.',
    highlights: ['Estilo carbon tech esportivo', 'Pacotes de polimento e PPF', 'Antes e depois de pintura', 'Orçamento ágil', 'Avaliações de entusiastas'],
    previewImage: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=1200&q=80',
    baseTemplateId: 'impacto',
    defaultAppearance: {
      templateId: 'impacto',
      primaryColor: '#0f172a',
      secondaryColor: '#2563eb',
      accentColor: '#38bdf8',
      backgroundColor: '#0a0f1d',
      textColor: '#f1f5f9',
      fontFamily: 'Montserrat',
      borderRadius: 'lg',
      buttonStyle: 'filled',
      spacing: 'normal',
    },
    buildSections: (tenant, existingSections) => {
      const siteId = existingSections?.[0]?.siteId || 'site-preview';
      const tenantId = tenant.id || 'tenant-preview';
      const now = new Date().toISOString();
      const phoneDigits = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';
      const waUrl = phoneDigits ? `https://wa.me/55${phoneDigits}` : '#contato';

      const starterSections: SiteSection[] = [
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'hero',
          position: 0,
          isEnabled: true,
          settings: {
            headline: `${tenant.name || 'Studio Automotivo Pro'}`,
            subtitle: 'Vitrificação cerâmica, polimento técnico de alta precisão e estética automotiva premium.',
            shortText: 'Proteja o valor e a beleza do seu veículo com produtos de padrão mundial.',
            coverImage: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=1400&q=80',
            bgType: 'image',
            overlayOpacity: 65,
            alignment: 'center',
            layoutVariant: 'classic',
            primaryButton: {
              text: 'Solicitar Orçamento no WhatsApp',
              url: waUrl,
              enabled: true,
            },
            secondaryButton: {
              text: 'Ver Nossos Serviços',
              url: '#servicos',
              enabled: true,
            },
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'quick_buttons',
          position: 1,
          isEnabled: true,
          settings: {
            title: 'Atendimento Rápido',
            subtitle: 'Tire fotos do seu carro e receba um orçamento personalizado',
            buttons: [
              { id: 'b1', title: 'Orçamento Express WhatsApp', url: waUrl, isEnabled: true },
              { id: 'b2', title: 'Pacotes & Tratamentos', url: '#servicos', isEnabled: true },
              { id: 'b3', title: 'Projetos Realizados', url: '#galeria', isEnabled: true },
              { id: 'b4', title: 'Nossa Oficina', url: '#localizacao', isEnabled: true },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'about',
          position: 2,
          isEnabled: true,
          settings: {
            title: 'Paixão por Carros & Obsessão por Detalhes',
            subtitle: 'Laboratório de iluminação técnica e produtos alemães certificados',
            text: `No ${tenant.name || 'nosso estúdio'}, tratamos cada veículo como uma obra de arte. Utilizamos os melhores compostos polidores, vitrificadores cerâmicos e proteções de película (PPF) do mercado automotivo global para entregar brilho de showroom.`,
            image: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=800&q=80',
            layout: 'image_right',
            highlights: [
              { title: 'Vitrificação com Garantia', desc: 'Proteção de pintura de 1 a 3 anos com laudo técnico.' },
              { title: 'Remoção de Riscos e Hologramas', desc: 'Recuperação do brilho espelhado sem desgastar o verniz.' },
              { title: 'Higienização e Oxi-Sanitização', desc: 'Limpeza profunda com eliminação de bactérias e odores.' },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'services',
          position: 3,
          isEnabled: true,
          settings: {
            title: 'Serviços & Pacotes Automotivos',
            subtitle: 'Tratamentos de ponta para proteger e valorizar seu veículo',
            layout: 'grid',
            showPrices: true,
            showDuration: true,
            buttonText: 'Consultar Orçamento',
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'gallery',
          position: 4,
          isEnabled: true,
          settings: {
            title: 'Galeria de Projetos Entregues',
            subtitle: 'Confira os resultados reais de polimentos e vitrificações',
            columns: 3,
            items: [
              { id: 'g1', url: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=600&q=80', caption: 'Brilho espelhado e vitrificação 9H' },
              { id: 'g2', url: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=600&q=80', caption: 'Tratamento de couro e interior refinado' },
              { id: 'g3', url: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=600&q=80', caption: 'Lavagem técnica detalhada e rodas descarbonizadas' },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'business_hours',
          position: 5,
          isEnabled: true,
          settings: {
            title: 'Horário de Recebimento de Veículos',
            subtitle: 'Atendimento de segunda a sábado com agendamento',
            showStatusBadge: true,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'location',
          position: 6,
          isEnabled: true,
          settings: {
            title: 'Endereço da Oficina',
            subtitle: 'Estrutura segura com seguro e monitoramento 24h',
            showMap: true,
            showDirectionsButton: true,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'cta',
          position: 7,
          isEnabled: true,
          settings: {
            title: 'Deixe seu carro com visual de zero km',
            subtitle: 'Envie fotos do veículo pelo WhatsApp e receba a melhor proposta.',
            buttonText: 'Chamar no WhatsApp Agora',
            buttonUrl: waUrl,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'footer',
          position: 8,
          isEnabled: true,
          settings: {
            showSocial: true,
            showSchedule: true,
            showAddress: true,
          },
          createdAt: now,
          updatedAt: now,
        },
      ];

      return adaptSectionsForTemplate(
        'estetica_automotiva',
        ['hero', 'quick_buttons', 'services', 'gallery', 'about', 'google_reviews', 'cta', 'footer'],
        starterSections,
        tenant,
        existingSections
      );
    },
  },

  // 6. Lojas, Boutiques e Comércio Geral
  {
    id: 'boutique_fashion',
    name: 'Boutique Conceito & Moda Contemporânea',
    category: 'lojas',
    categoryLabel: 'Lojas, Boutiques & Comércio',
    styleName: 'Minimalista Editorial Preto & Branco',
    badge: 'Design Minimal',
    isReady: true,
    description: 'Estética limpa e refinada para vestuário, acessórios, óticas, decoração e comércio em geral. Destaque para produtos, lookbook fotográfico e vendas diretas no WhatsApp.',
    highlights: ['Composição minimalista moderna', 'Catálogo de novidades e destaques', 'Lookbook fotográfico', 'Botão de compra no WhatsApp', 'Atendimento com consultora'],
    previewImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80',
    baseTemplateId: 'minimalista',
    defaultAppearance: {
      templateId: 'minimalista',
      primaryColor: '#18181b',
      secondaryColor: '#3f3f46',
      accentColor: '#18181b',
      backgroundColor: '#ffffff',
      textColor: '#18181b',
      fontFamily: 'Inter',
      borderRadius: 'sm',
      buttonStyle: 'filled',
      spacing: 'spacious',
    },
    buildSections: (tenant, existingSections) => {
      const siteId = existingSections?.[0]?.siteId || 'site-preview';
      const tenantId = tenant.id || 'tenant-preview';
      const now = new Date().toISOString();
      const phoneDigits = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';
      const waUrl = phoneDigits ? `https://wa.me/55${phoneDigits}` : '#contato';

      const starterSections: SiteSection[] = [
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'hero',
          position: 0,
          isEnabled: true,
          settings: {
            headline: `${tenant.name || 'Boutique & Coleções'}`,
            subtitle: 'Peças selecionadas com design autoral, qualidade e estilo atemporal.',
            shortText: 'Confira as novidades da estação e compre com consultoria exclusiva.',
            coverImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1400&q=80',
            bgType: 'gradient',
            overlayOpacity: 30,
            alignment: 'center',
            layoutVariant: 'classic',
            primaryButton: {
              text: 'Comprar pelo WhatsApp',
              url: waUrl,
              enabled: true,
            },
            secondaryButton: {
              text: 'Ver Coleção em Destaque',
              url: '#produtos',
              enabled: true,
            },
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'quick_buttons',
          position: 1,
          isEnabled: true,
          settings: {
            title: 'Acesso Rápido à Loja',
            subtitle: 'Conecte-se com nossa equipe e confira as novidades',
            buttons: [
              { id: 'b1', title: 'Falar com Consultora', url: waUrl, isEnabled: true },
              { id: 'b2', title: 'Catálogo de Produtos', url: '#produtos', isEnabled: true },
              { id: 'b3', title: 'Lookbook & Inspirações', url: '#galeria', isEnabled: true },
              { id: 'b4', title: 'Endereço da Loja Física', url: '#localizacao', isEnabled: true },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'about',
          position: 2,
          isEnabled: true,
          settings: {
            title: 'Identidade, Curadoria & Conforto',
            subtitle: 'Cada detalhe pensado para a sua expressão pessoal',
            text: `Na ${tenant.name || 'nossa loja'}, acreditamos no consumo consciente e na elegância autêntica. Selecionamos marcas e fornecedores com rigor técnico, tecidos nobres e acabamentos duradouros.`,
            image: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=800&q=80',
            layout: 'image_left',
            highlights: [
              { title: 'Curadoria Exclusiva', desc: 'Peças em tiragens limitadas com cortes impecáveis.' },
              { title: 'Consultoria Personalizada', desc: 'Dicas de combinações e tamanhos direto pelo WhatsApp.' },
              { title: 'Envio Rápido ou Retirada', desc: 'Entrega ágil ou experiência de compras na loja física.' },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'products',
          position: 3,
          isEnabled: true,
          settings: {
            title: 'Lançamentos & Destaques da Coleção',
            subtitle: 'Peças em evidência para você conferir e comprar com um clique',
            layout: 'grid',
            columns: 3,
            showCategoryTabs: true,
            showPrice: true,
            buttonText: 'Comprar no WhatsApp',
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'gallery',
          position: 4,
          isEnabled: true,
          settings: {
            title: 'Lookbook & Espaço da Loja',
            subtitle: 'Inspire-se em combinações reais da nossa curadoria',
            columns: 3,
            items: [
              { id: 'g1', url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=600&q=80', caption: 'Ambiente aconchegante e minimalista' },
              { id: 'g2', url: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=600&q=80', caption: 'Acabamentos nobres e tecidos de qualidade' },
              { id: 'g3', url: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=600&q=80', caption: 'Novidades semanais selecionadas' },
            ],
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'business_hours',
          position: 5,
          isEnabled: true,
          settings: {
            title: 'Horário de Funcionamento da Loja',
            subtitle: 'Venha nos visitar ou compre online',
            showStatusBadge: true,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'location',
          position: 6,
          isEnabled: true,
          settings: {
            title: 'Endereço da Loja Física',
            subtitle: 'Venha experimentar as peças no nosso espaço',
            showMap: true,
            showDirectionsButton: true,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'cta',
          position: 7,
          isEnabled: true,
          settings: {
            title: 'Dúvidas sobre tamanho ou disponibilidade?',
            subtitle: 'Nossa equipe atende você em tempo real pelo WhatsApp.',
            buttonText: 'Conversar com Atendimento no WhatsApp',
            buttonUrl: waUrl,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateUUID(),
          siteId,
          tenantId,
          type: 'footer',
          position: 8,
          isEnabled: true,
          settings: {
            showSocial: true,
            showSchedule: true,
            showAddress: true,
          },
          createdAt: now,
          updatedAt: now,
        },
      ];

      return adaptSectionsForTemplate(
        'boutique_fashion',
        ['hero', 'quick_buttons', 'products', 'gallery', 'about', 'google_reviews', 'cta', 'footer'],
        starterSections,
        tenant,
        existingSections
      );
    },
  },
];

/**
 * Generates an in-memory SiteData object for previewing a template
 * WITHOUT modifying any database records or persisting state.
 */
export function generateTemplatePreviewSite(
  template: ProfessionalTemplate,
  tenant: Tenant,
  currentSite?: SiteData | null
): SiteData {
  const sections = template.buildSections(tenant, currentSite?.sections);
  const now = new Date().toISOString();
  const savedPreset = currentSite?.appearance?.templateVisualPresets?.[template.baseTemplateId];

  return {
    id: currentSite?.id || 'preview-site-id',
    tenantId: tenant.id,
    templateId: template.baseTemplateId,
    status: 'draft',
    sections,
    seo: currentSite?.seo || {
      title: `${tenant.name} | ${tenant.segment || 'Atendimento'}`,
      description: `Conheça ${tenant.name}. Atendimento de excelência e serviços exclusivos.`,
      allowIndexing: true,
    },
    appearance: {
      ...template.defaultAppearance,
      ...(savedPreset || {}),
      templateId: template.baseTemplateId,
    },
    settings: currentSite?.settings || {
      floatingWhatsapp: true,
      floatingWhatsappMessage: 'Olá! Vim pelo site e gostaria de informações.',
      headerCtaEnabled: true,
      headerCtaText: 'Falar no WhatsApp',
      headerCtaLink: tenant.whatsapp ? `https://wa.me/55${tenant.whatsapp.replace(/\D/g, '')}` : '#contato',
    },
    hasUnpublishedChanges: true,
    updatedAt: now,
    createdAt: currentSite?.createdAt || now,
  };
}
