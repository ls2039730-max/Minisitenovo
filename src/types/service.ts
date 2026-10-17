export type PricingType = 'fixed' | 'starting_at' | 'on_request';

export interface ServiceCategory {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  displayOrder: number;
  active: boolean;
  servicesCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceCategoryPayload {
  name: string;
  slug?: string;
  description?: string | null;
  displayOrder?: number;
  active?: boolean;
}

export interface Professional {
  id: string;
  tenantId: string;
  userId?: string | null;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  specialties: string[];
  phone?: string | null;
  email?: string | null;
  showContactPublicly: boolean;
  active: boolean;
  displayOrder: number;
  servicesCount?: number;
  serviceIds?: string[];
  services?: Array<{ id: string; name: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ProfessionalPayload {
  name: string;
  userId?: string | null;
  bio?: string | null;
  photoUrl?: string | null;
  specialties?: string[];
  phone?: string | null;
  email?: string | null;
  showContactPublicly?: boolean;
  active?: boolean;
  displayOrder?: number;
  serviceIds?: string[];
}

export interface Service {
  id: string;
  tenantId: string;
  categoryId: string | null;
  category?: ServiceCategory | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  pricingType: PricingType;
  price: number | null;
  durationMinutes: number | null;
  active: boolean;
  featured: boolean;
  displayOrder: number;
  bookingEnabled: boolean;
  professionalIds?: string[];
  professionals?: Professional[];
  createdAt: string;
  updatedAt: string;
}

export interface ServicePayload {
  name: string;
  slug?: string;
  categoryId?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  pricingType: PricingType;
  price?: number | null;
  durationMinutes?: number | null;
  active?: boolean;
  featured?: boolean;
  displayOrder?: number;
  bookingEnabled?: boolean;
  professionalIds?: string[];
}

export interface ServiceFilterParams {
  search?: string;
  categoryId?: string;
  active?: 'all' | boolean;
  featured?: boolean;
  pricingType?: PricingType;
  sort?: 'order' | 'name_asc' | 'price_asc' | 'price_desc' | 'duration_asc' | 'recent';
}

export interface ProfessionalFilterParams {
  search?: string;
  active?: 'all' | boolean;
  serviceId?: string;
}

export interface PublicService {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  pricingType: PricingType;
  price: number | null;
  durationMinutes: number | null;
  featured: boolean;
  displayOrder: number;
  bookingEnabled: boolean;
  professionals: Array<{
    id: string;
    name: string;
    photoUrl: string | null;
    specialties: string[];
  }>;
}

export interface PublicProfessional {
  id: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  specialties: string[];
  phone?: string | null;
  email?: string | null;
  displayOrder: number;
  services: Array<{
    id: string;
    name: string;
    pricingType: PricingType;
    price: number | null;
  }>;
}

export interface PublicServicesResponse {
  success: boolean;
  services: PublicService[];
  categories: Array<{ id: string; name: string; slug: string }>;
  tenant: {
    id: string;
    name: string;
    slug: string;
    whatsapp: string | null;
    phone: string | null;
  };
}

export interface PublicProfessionalsResponse {
  success: boolean;
  professionals: PublicProfessional[];
  tenant: {
    id: string;
    name: string;
    slug: string;
    whatsapp: string | null;
    phone: string | null;
  };
}
