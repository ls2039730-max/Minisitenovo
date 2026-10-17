import { SiteAppearance, SiteTemplateId } from '../types/site';

export interface TemplateDefinition {
  id: SiteTemplateId;
  name: string;
  badge: string;
  description: string;
  previewImage: string;
  recommendedSegments: string[];
  defaultAppearance: Omit<SiteAppearance, 'primaryColor' | 'secondaryColor' | 'accentColor'>;
}

export const SITE_TEMPLATES: Record<SiteTemplateId, TemplateDefinition> = {
  moderno: {
    id: 'moderno',
    name: 'Moderno',
    badge: 'Popular',
    description: 'Equilíbrio visual perfeito com curvas suaves, contrastes modernos e hierarquia limpa.',
    previewImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80',
    recommendedSegments: ['Clínicas', 'Barbearias', 'Prestadores de Serviços', 'Tecnologia'],
    defaultAppearance: {
      templateId: 'moderno',
      backgroundColor: '#f8fafc',
      textColor: '#0f172a',
      fontFamily: 'Inter',
      borderRadius: 'lg',
      buttonStyle: 'filled',
      spacing: 'normal',
    },
  },

  minimalista: {
    id: 'minimalista',
    name: 'Minimalista',
    badge: 'Clean',
    description: 'Espaços generosos, foco absoluto na leitura e sutileza nas bordas e botões.',
    previewImage: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=600&q=80',
    recommendedSegments: ['Estética', 'Arquitetura & Design', 'Consultorias', 'Moda'],
    defaultAppearance: {
      templateId: 'minimalista',
      backgroundColor: '#ffffff',
      textColor: '#18181b',
      fontFamily: 'Roboto',
      borderRadius: 'sm',
      buttonStyle: 'outline',
      spacing: 'spacious',
    },
  },

  elegante: {
    id: 'elegante',
    name: 'Elegante',
    badge: 'Premium',
    description: 'Tipografia serifada nobre, tons acolhedores e sofisticação para negócios de alto padrão.',
    previewImage: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80',
    recommendedSegments: ['Restaurantes & Bistrôs', 'Joalherias', 'Spas & Bem-Estar', 'Salões Conceito'],
    defaultAppearance: {
      templateId: 'elegante',
      backgroundColor: '#fdfbf7',
      textColor: '#292524',
      fontFamily: 'Playfair Display',
      borderRadius: 'sm',
      buttonStyle: 'filled',
      spacing: 'normal',
    },
  },

  impacto: {
    id: 'impacto',
    name: 'Impacto',
    badge: 'Alta Conversão',
    description: 'Contraste visual marcante, botões em destaque e layout direto para conversão imediata.',
    previewImage: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=600&q=80',
    recommendedSegments: ['Academias', 'Hamburguerias & Delivery', 'Drogarias 24h', 'Autopeças & Oficinas'],
    defaultAppearance: {
      templateId: 'impacto',
      backgroundColor: '#f1f5f9',
      textColor: '#020617',
      fontFamily: 'Montserrat',
      borderRadius: 'full',
      buttonStyle: 'filled',
      spacing: 'compact',
    },
  },

  otica_editorial: {
    id: 'otica_editorial',
    name: 'Ótica Editorial Premium',
    badge: 'Editorial & Moda',
    description: 'Estética contemporânea avant-garde com tipografia display, contraste marcante, animações fluidas e vitrine focada em conversão.',
    previewImage: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=800&q=80',
    recommendedSegments: ['Óticas & Eyewear', 'Marcas de Moda & Acessórios', 'Boutiques Conceito', 'Design de Produto'],
    defaultAppearance: {
      templateId: 'otica_editorial',
      backgroundColor: '#101010',
      textColor: '#F8F8F5',
      fontFamily: 'Syne',
      borderRadius: 'none',
      buttonStyle: 'filled',
      spacing: 'spacious',
    },
  },
};
