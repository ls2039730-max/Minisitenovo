import { Tenant } from './saas.js';

export type SiteTemplateId = 'moderno' | 'minimalista' | 'elegante' | 'impacto' | 'otica_editorial';

export type SectionType =
  | 'hero'
  | 'about'
  | 'gallery'
  | 'video'
  | 'quick_buttons'
  | 'social_links'
  | 'whatsapp'
  | 'business_hours'
  | 'location'
  | 'google_maps'
  | 'google_reviews'
  | 'faq'
  | 'contact'
  | 'team'
  | 'cta'
  | 'footer'
  | 'products'
  | 'services';

export type SectionCategory = 'info' | 'conversion' | 'content' | 'commercial';

export interface SiteSection {
  id: string;
  siteId: string;
  tenantId: string;
  type: SectionType;
  position: number;
  isEnabled: boolean;
  settings: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface SiteSeo {
  title: string;
  description: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  favicon?: string;
  allowIndexing: boolean;
}

import { MotionStudioSettings } from './motion.js';
export * from './motion.js';

export interface SiteAppearance {
  templateId: SiteTemplateId;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'full';
  buttonStyle: 'filled' | 'outline' | 'soft';
  spacing: 'compact' | 'normal' | 'spacious';
  motion?: MotionStudioSettings;
  templateVisualPresets?: Record<
    string,
    {
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
      backgroundColor?: string;
      textColor?: string;
      fontFamily?: string;
      borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'full';
      buttonStyle?: 'filled' | 'outline' | 'soft';
      spacing?: 'compact' | 'normal' | 'spacious';
      savedAt?: string;
    }
  >;
}

export interface SocialLinkItem {
  id?: string;
  platform: string;
  name?: string;
  url: string;
  handle?: string;
  isEnabled: boolean;
}

export interface SiteSettings {
  floatingWhatsapp: boolean;
  floatingWhatsappMessage?: string;
  headerCtaEnabled?: boolean;
  headerCtaText?: string;
  headerCtaLink?: string;
  heroWhatsappButtonEnabled?: boolean;
  socialLinks?: SocialLinkItem[];
}

export interface SiteData {
  id: string;
  tenantId: string;
  templateId: SiteTemplateId;
  status: 'draft' | 'published';
  sections: SiteSection[];
  seo: SiteSeo;
  appearance: SiteAppearance;
  settings: SiteSettings;
  hasUnpublishedChanges: boolean;
  publishedAt?: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface SectionDefinition {
  type: SectionType;
  name: string;
  description: string;
  category: SectionCategory;
  iconName: string;
  isSingleton?: boolean;
  defaultSettings: (tenant: Partial<Tenant>) => Record<string, any>;
}

export interface SiteVersion {
  id: string;
  siteId: string;
  tenantId: string;
  versionNumber: number;
  snapshot: {
    templateId: SiteTemplateId;
    sections: SiteSection[];
    seo: SiteSeo;
    appearance: SiteAppearance;
    settings: SiteSettings;
  };
  publishedByUserId?: string | null;
  createdAt: string;
}
