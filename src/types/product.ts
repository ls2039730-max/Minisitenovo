export interface ProductCategory {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  position: number;
  isActive: boolean;
  productsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  id: string;
  tenantId: string;
  productId: string;
  storagePath: string;
  publicUrl: string;
  altText?: string | null;
  position: number;
  isPrimary: boolean;
  createdAt: string;
}

export interface ProductVariant {
  id: string;
  tenantId: string;
  productId: string;
  name: string;
  sku?: string | null;
  price?: number | null;
  promotionalPrice?: number | null;
  trackStock: boolean;
  stockQuantity: number;
  isActive: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  tenantId: string;
  categoryId?: string | null;
  category?: ProductCategory | null;
  name: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
  sku?: string | null;
  barcode?: string | null;
  price?: number | null;
  promotionalPrice?: number | null;
  priceOnRequest: boolean;
  isActive: boolean;
  isFeatured: boolean;
  trackStock: boolean;
  stockQuantity: number;
  allowOutOfStock: boolean;
  position: number;
  images: ProductImage[];
  primaryImage?: ProductImage | null;
  variants: ProductVariant[];
  availabilityDays?: ProductAvailabilityConfig | null;
  createdAt: string;
  updatedAt: string;
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ProductAvailabilityConfig {
  sameChannels: boolean;
  tableDays: DayOfWeek[];
  deliveryDays: DayOfWeek[];
}

export interface ProductFilterParams {
  search?: string;
  categoryId?: string;
  isActive?: boolean | 'all';
  isFeatured?: boolean;
  stockStatus?: 'all' | 'in_stock' | 'out_of_stock';
  sort?: 'manual' | 'recent' | 'price_asc' | 'price_desc' | 'name_asc' | 'featured_first';
}

export interface PublicCatalogResponse {
  success: boolean;
  tenant: {
    id: string;
    name: string;
    slug: string;
    whatsapp?: string;
    phone?: string;
  };
  categories: ProductCategory[];
  products: Product[];
  total: number;
}
