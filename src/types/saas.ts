export type UserRole =
  | 'SUPER_ADMIN'
  | 'CLIENT_ADMIN'
  | 'OWNER'
  | 'MANAGER'
  | 'EMPLOYEE'
  | 'PROFESSIONAL';

export type UserStatus = 'active' | 'inactive' | 'invited';

export interface User {
  id: string; // UUID (matches auth.users.id)
  name: string;
  email: string;
  role: UserRole;
  tenantId: string | null; // UUID (null for SUPER_ADMIN)
  phone?: string;
  status: UserStatus;
  createdAt: string;
  lastLogin?: string;
}

export interface TenantUser {
  id: string; // UUID
  tenantId: string | null; // UUID
  userId: string; // UUID
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export type TenantStatus =
  | 'teste'
  | 'ativo'
  | 'pagamento_pendente'
  | 'atrasado'
  | 'suspenso'
  | 'cancelado';

export type FeatureKey =
  | 'site_editor'
  | 'products'
  | 'services'
  | 'shopping_cart'
  | 'delivery'
  | 'appointments'
  | 'professionals'
  | 'wifi'
  | 'qr_code'
  | 'google_reviews'
  | 'analytics'
  | 'custom_domain'
  | 'coupons'
  | 'whatsapp'
  | 'social_links'
  | 'restaurant_tables';

export interface FeatureDefinition {
  key: FeatureKey;
  name: string;
  description: string;
  category: 'core' | 'vendas' | 'atendimento' | 'marketing';
  icon: string;
}

export interface Plan {
  id: string; // UUID
  name: string;
  description: string;
  price: number; // in BRL
  status: 'active' | 'inactive';
  includedFeatures: FeatureKey[];
  createdAt: string;
  updatedAt: string;
}

export interface TenantAppearance {
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  tagline?: string;
}

export interface Tenant {
  id: string; // UUID (tenant_id)
  name: string;
  slug: string;
  segment: string;
  cnpj?: string;
  phone: string;
  whatsapp: string;
  email: string;
  planId: string; // UUID
  status: TenantStatus;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  appearance: TenantAppearance;
  featureOverrides: Partial<Record<FeatureKey, boolean>>;
  subdomain: string; // preview e.g. "barbearia-prime.meudominio.com"
  notes?: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string; // UUID
  actorUserId: string | null;
  actorUserName: string | null;
  tenantId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata?: any;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  user: User;
  tenant?: Tenant | null;
  isImpersonating?: boolean;
}
