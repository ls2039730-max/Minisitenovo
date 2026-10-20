import { SectionCategory, SectionDefinition, SectionType } from '../types/site';
import { Tenant } from '../types/saas';

export const SECTION_CATEGORIES: Record<SectionCategory, { label: string; description: string }> = {
  info: {
    label: 'INFORMAÇÕES',
    description: 'Apresente sua história, contatos, horários e endereço.',
  },
  conversion: {
    label: 'CONVERSÃO',
    description: 'Facilite contatos imediatos, avaliações e chamadas para ação.',
  },
  content: {
    label: 'CONTEÚDO',
    description: 'Mostre fotos, vídeos, equipe e diferenciais da sua empresa.',
  },
  commercial: {
    label: 'COMERCIAL',
    description: 'Apresente seus produtos e serviços disponíveis.',
  },
};

export const BLOCK_REGISTRY: Record<SectionType, SectionDefinition> = {
  hero: {
    type: 'hero',
    name: 'Hero / Capa',
    description: 'Apresentação principal de grande impacto com título, chamada e botões.',
    category: 'conversion',
    iconName: 'Sparkles',
    isSingleton: true,
    defaultSettings: (tenant) => ({
      tagline: tenant.appearance?.tagline || '',
      taglineIcon: 'utensils',
      headline: tenant.name || 'Seu Negócio Local de Confiança',
      subtitle: tenant.segment || 'Atendimento humanizado, qualidade superior e conveniência.',
      shortText: tenant.appearance?.tagline || 'Descubra nossos diferenciais e fale conosco em poucos cliques.',
      logoUrl: tenant.appearance?.logoUrl || '',
      coverImage: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1200&q=80',
      bgType: 'gradient', // 'image' | 'gradient' | 'clean'
      overlayOpacity: 40,
      alignment: 'center', // 'left' | 'center'
      layoutVariant: 'classic', // 'classic' | 'split' | 'minimal'
      primaryButton: {
        text: 'Falar no WhatsApp',
        url: tenant.whatsapp ? `https://wa.me/55${tenant.whatsapp.replace(/\D/g, '')}` : '#contato',
        enabled: true,
      },
      secondaryButton: {
        text: 'Conheça Nossos Serviços',
        url: '#sobre',
        enabled: true,
      },
      // Opção de vídeo logo abaixo do banner principal
      showSubBannerVideo: false,
      subBannerVideoUrl: '',
      subBannerVideoTitle: '',
      subBannerVideoDescription: '',
      // Enquadramento perfeito de imagem para mobile
      mobileImageFit: 'cover_smart', // 'cover_smart' | 'banner_featured'
    }),
  },

  about: {
    type: 'about',
    name: 'Sobre a Empresa',
    description: 'Conte a trajetória, missão e o diferencial do seu estabelecimento.',
    category: 'info',
    iconName: 'Building2',
    isSingleton: true,
    defaultSettings: (tenant) => ({
      title: 'Quem Somos',
      subtitle: 'Tradição, dedicação e compromisso com nossos clientes',
      text: `${tenant.name || 'Nossa empresa'} nasceu com a missão de transformar o atendimento local em uma experiência de excelência e confiabilidade. Contamos com profissionais capacitados e ambiente acolhedor.`,
      image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80',
      layout: 'image_right', // 'image_left' | 'image_right' | 'text_only'
      highlights: [
        { title: 'Atendimento Ágil', desc: 'Respostas rápidas e suporte direto pelo WhatsApp.' },
        { title: 'Ambiente Seguro', desc: 'Espaço higienizado e estrutura preparada para você.' },
        { title: 'Satisfação Garantida', desc: 'Foco total nas suas necessidades e expectativas.' },
      ],
    }),
  },

  gallery: {
    type: 'gallery',
    name: 'Galeria de Fotos',
    description: 'Exiba fotos do espaço, trabalhos realizados e ambiente do negócio.',
    category: 'content',
    iconName: 'Image',
    isSingleton: false,
    defaultSettings: () => ({
      title: 'Galeria & Ambiente',
      subtitle: 'Conheça um pouco mais do nosso dia a dia e da nossa estrutura',
      columns: 3, // 2 | 3 | 4
      items: [
        {
          id: 'gal-1',
          url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=600&q=80',
          caption: 'Estrutura aconchegante e moderna',
        },
        {
          id: 'gal-2',
          url: 'https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=600&q=80',
          caption: 'Cuidado nos mínimos detalhes',
        },
        {
          id: 'gal-3',
          url: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=600&q=80',
          caption: 'Atendimento personalizado',
        },
      ],
    }),
  },

  video: {
    type: 'video',
    name: 'Vídeo Institucional',
    description: 'Incorpore vídeos do YouTube ou Vimeo para engajar visitantes.',
    category: 'content',
    iconName: 'Video',
    isSingleton: false,
    defaultSettings: () => ({
      title: 'Conheça Mais Sobre Nós',
      description: 'Assista a uma rápida apresentação do nosso espaço e serviços.',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      platform: 'youtube',
    }),
  },

  quick_buttons: {
    type: 'quick_buttons',
    name: 'Botões Rápidos',
    description: 'Links diretos para canais de contato, redes e ações imediatas.',
    category: 'conversion',
    iconName: 'Compass',
    isSingleton: false,
    defaultSettings: (tenant) => ({
      title: 'Acesso Rápido',
      subtitle: 'Escolha como prefere interagir conosco hoje',
      buttons: [
        {
          id: 'btn-wa',
          type: 'whatsapp',
          title: 'WhatsApp Direto',
          url: tenant.whatsapp ? `https://wa.me/55${tenant.whatsapp.replace(/\D/g, '')}` : '',
          icon: 'MessageCircle',
          isEnabled: true,
        },
        {
          id: 'btn-phone',
          type: 'phone',
          title: 'Ligue Agora',
          url: tenant.phone ? `tel:${tenant.phone.replace(/\D/g, '')}` : '',
          icon: 'Phone',
          isEnabled: true,
        },
        {
          id: 'btn-loc',
          type: 'location',
          title: 'Como Chegar',
          url: '#localizacao',
          icon: 'MapPin',
          isEnabled: true,
        },
        {
          id: 'btn-rev',
          type: 'reviews',
          title: 'Avaliar no Google',
          url: '#avaliacoes',
          icon: 'Star',
          isEnabled: true,
        },
      ],
    }),
  },

  social_links: {
    type: 'social_links',
    name: 'Redes Sociais',
    description: 'Conecte seus perfis do Instagram, Facebook, TikTok e YouTube.',
    category: 'info',
    iconName: 'Share2',
    isSingleton: true,
    defaultSettings: () => ({
      title: 'Siga Nossas Redes',
      subtitle: 'Acompanhe novidades, promoções e conteúdos exclusivos',
      links: [
        { platform: 'instagram', url: 'https://instagram.com', isEnabled: true },
        { platform: 'facebook', url: 'https://facebook.com', isEnabled: true },
        { platform: 'tiktok', url: '', isEnabled: false },
        { platform: 'youtube', url: '', isEnabled: false },
        { platform: 'linkedin', url: '', isEnabled: false },
      ],
    }),
  },

  whatsapp: {
    type: 'whatsapp',
    name: 'Destaque WhatsApp',
    description: 'Cartão de conversa direta com mensagem pré-configurada.',
    category: 'conversion',
    iconName: 'MessageCircle',
    isSingleton: false,
    defaultSettings: (tenant) => ({
      title: 'Fale Conosco Diretamente',
      subtitle: 'Tire suas dúvidas ou solicite orçamento direto pelo WhatsApp oficial',
      phone: tenant.whatsapp || tenant.phone || '',
      initialMessage: 'Olá! Vim pelo site e gostaria de saber mais informações.',
      buttonText: 'Iniciar Conversa no WhatsApp',
    }),
  },

  business_hours: {
    type: 'business_hours',
    name: 'Horário de Funcionamento',
    description: 'Quadro completo de horários com indicador inteligente de aberto/fechado.',
    category: 'info',
    iconName: 'Clock',
    isSingleton: true,
    defaultSettings: () => ({
      title: 'Horário de Funcionamento',
      subtitle: 'Confira os horários em que nossa equipe está pronta para atendê-lo',
      schedule: {
        seg: { isOpen: true, openTime: '08:00', closeTime: '18:00', hasSplit: false },
        ter: { isOpen: true, openTime: '08:00', closeTime: '18:00', hasSplit: false },
        qua: { isOpen: true, openTime: '08:00', closeTime: '18:00', hasSplit: false },
        qui: { isOpen: true, openTime: '08:00', closeTime: '18:00', hasSplit: false },
        sex: { isOpen: true, openTime: '08:00', closeTime: '18:00', hasSplit: false },
        sab: { isOpen: true, openTime: '09:00', closeTime: '13:00', hasSplit: false },
        dom: { isOpen: false, openTime: '08:00', closeTime: '18:00', hasSplit: false },
      },
    }),
  },

  location: {
    type: 'location',
    name: 'Localização & Endereço',
    description: 'Endereço estruturado, mapa de orientação e botão "Como Chegar".',
    category: 'info',
    iconName: 'MapPin',
    isSingleton: true,
    defaultSettings: () => ({
      title: 'Onde Estamos',
      subtitle: 'Venha nos visitar ou trace a rota no seu aplicativo preferido',
      address: {
        street: 'Avenida Principal',
        number: '1000',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zip: '01000-000',
        complement: 'Sala 102',
        landmark: 'Em frente à praça central',
      },
      showDirectionsButton: true,
    }),
  },

  google_maps: {
    type: 'google_maps',
    name: 'Google Maps Interativo',
    description: 'Mapa integrado com endereço para navegação no Waze e Google Maps.',
    category: 'info',
    iconName: 'Map',
    isSingleton: true,
    defaultSettings: () => ({
      title: 'Como Chegar',
      subtitle: 'Localize facilmente nosso estabelecimento no mapa',
      searchQuery: 'Centro, São Paulo - SP',
      showDirectionsButton: true,
      zoom: 15,
    }),
  },

  google_reviews: {
    type: 'google_reviews',
    name: 'Avaliações do Google',
    description: 'Estrelas de avaliação e link direto para incentivar novas avaliações.',
    category: 'conversion',
    iconName: 'Star',
    isSingleton: true,
    defaultSettings: () => ({
      title: 'O que dizem sobre nós',
      subtitle: 'A confiança de quem já conhece nossos serviços',
      rating: 4.9,
      reviewsCount: 128,
      googleReviewUrl: 'https://search.google.com/local/writereview',
      buttonText: 'Deixar uma Avaliação no Google',
      featuredReviews: [
        {
          author: 'Mariana Costa',
          stars: 5,
          comment: 'Atendimento impecável! Profissionais extremamente cuidadosos e ambiente super agradável.',
          date: 'Há 2 semanas',
        },
        {
          author: 'Rodrigo Lima',
          stars: 5,
          comment: 'Melhor experiência da região. Pontualidade, simpatia e qualidade de ponta.',
          date: 'Há 1 mês',
        },
      ],
    }),
  },

  faq: {
    type: 'faq',
    name: 'Perguntas Frequentes (FAQ)',
    description: 'Esclareça as dúvidas mais comuns dos seus clientes em formato de sanfona.',
    category: 'info',
    iconName: 'HelpCircle',
    isSingleton: false,
    defaultSettings: () => ({
      title: 'Dúvidas Frequentes',
      subtitle: 'Respostas rápidas para as principais questões sobre nossos serviços',
      items: [
        {
          id: 'faq-1',
          question: 'Como faço para agendar ou pedir informações?',
          answer: 'Você pode entrar em contato direto pelo nosso WhatsApp clicando nos botões disponíveis na página.',
          isEnabled: true,
        },
        {
          id: 'faq-2',
          question: 'Quais são as formas de pagamento aceitas?',
          answer: 'Aceitamos cartões de crédito e débito, Pix e dinheiro no local.',
          isEnabled: true,
        },
        {
          id: 'faq-3',
          question: 'Possui estacionamento no local ou próximo?',
          answer: 'Sim, há vagas para clientes e opções de estacionamento conveniado nas proximidades.',
          isEnabled: true,
        },
      ],
    }),
  },

  contact: {
    type: 'contact',
    name: 'Canais de Contato',
    description: 'Bloco completo reunindo telefone, WhatsApp, e-mail e endereço.',
    category: 'info',
    iconName: 'PhoneCall',
    isSingleton: true,
    defaultSettings: (tenant) => ({
      title: 'Fale com a Gente',
      subtitle: 'Estamos prontos para atender você com toda a atenção',
      phone: tenant.phone || '',
      whatsapp: tenant.whatsapp || tenant.phone || '',
      email: tenant.email || '',
      showPhone: true,
      showWhatsapp: true,
      showEmail: true,
      showAddress: true,
      showSocial: true,
    }),
  },

  team: {
    type: 'team',
    name: 'Nossa Equipe / Profissionais',
    description: 'Apresentação dos profissionais e especialistas do seu negócio.',
    category: 'content',
    iconName: 'Users',
    isSingleton: true,
    defaultSettings: () => ({
      title: 'Nossos Profissionais',
      subtitle: 'Especialistas qualificados prontos para oferecer o melhor atendimento',
      showBio: true,
      showSpecialties: true,
      showServices: true,
      maxItems: 8,
      contactButtonText: 'Consultar Disponibilidade',
    }),
  },

  cta: {
    type: 'cta',
    name: 'Chamada para Ação (CTA)',
    description: 'Destaque visual para incentivar contato, pedido ou visita.',
    category: 'conversion',
    iconName: 'Megaphone',
    isSingleton: false,
    defaultSettings: (tenant) => ({
      title: 'Pronto para viver essa experiência?',
      description: 'Entre em contato agora mesmo e aproveite nossas condições especiais.',
      buttonText: 'Chamar no WhatsApp',
      buttonUrl: tenant.whatsapp ? `https://wa.me/55${tenant.whatsapp.replace(/\D/g, '')}` : '#contato',
      bgType: 'color', // 'color' | 'image'
      bgImage: '',
    }),
  },

  footer: {
    type: 'footer',
    name: 'Rodapé',
    description: 'Encerramento da página com copyright, links, contatos e créditos.',
    category: 'info',
    iconName: 'Layout',
    isSingleton: true,
    defaultSettings: (tenant) => ({
      showLogo: true,
      customText: `${tenant.name} · Excelência e dedicação ao cliente local.`,
      copyrightText: `© ${new Date().getFullYear()} ${tenant.name}. Todos os direitos reservados.`,
      showSocial: true,
      showPoweredBy: false,
    }),
  },

  products: {
    type: 'products',
    name: 'Catálogo de Produtos',
    description: 'Vitrine dinâmica conectada ao seu módulo real de produtos.',
    category: 'commercial',
    iconName: 'ShoppingBag',
    isSingleton: true,
    defaultSettings: () => ({
      title: 'Nossos Produtos',
      subtitle: 'Itens selecionados com qualidade premium para você',
      filterType: 'all', // 'all' | 'featured' | 'category'
      selectedCategoryId: '',
      maxItems: 12,
      layout: 'grid', // 'grid' | 'list' | 'carousel'
      showPrice: true,
      showShortDesc: true,
      showCategory: true,
      showOutOfStock: true,
      defaultSort: 'manual', // 'manual' | 'recent' | 'price_asc' | 'price_desc' | 'name_asc' | 'featured_first'
      showSearch: true,
      showCategoryFilter: true,
    }),
  },

  services: {
    type: 'services',
    name: 'Serviços & Procedimentos',
    description: 'Apresentação dinâmica dos serviços cadastrados no módulo comercial.',
    category: 'commercial',
    iconName: 'Briefcase',
    isSingleton: true,
    defaultSettings: () => ({
      title: 'Nossos Serviços',
      subtitle: 'Conheça nossos procedimentos e soluções sob medida',
      filterType: 'all', // 'all' | 'featured' | 'category'
      selectedCategoryId: '',
      maxItems: 12,
      layout: 'grid', // 'grid' | 'cards' | 'list'
      showPrice: true,
      showDuration: true,
      showProfessionals: true,
      showCategoryTabs: true,
      buttonText: 'Consultar Disponibilidade',
    }),
  },
};

/**
 * Centralized business hours and schedule status utilities:
 */
export {
  calculateScheduleStatus,
  normalizeSchedule,
  DAY_KEYS,
  DAY_NAMES,
  SHORT_DAY_NAMES,
  getSaoPauloTime,
} from '../utils/businessHours';
export type {
  DayKey,
  NormalizedDaySchedule,
  NormalizedWeeklySchedule,
  ScheduleStatus,
} from '../utils/businessHours';
