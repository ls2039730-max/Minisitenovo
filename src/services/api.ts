import { FeatureKey, Plan, Tenant, TenantStatus, User, UserRole, FeatureDefinition } from '../types/saas';
import { SiteData, SiteSection, SiteSeo, SiteAppearance, SiteSettings, SiteTemplateId } from '../types/site';
import { Product, ProductCategory, ProductImage, ProductFilterParams, PublicCatalogResponse } from '../types/product';
import {
  Order,
  OrderStatus,
  DeliverySettings,
  DeliveryRule,
  DeliveryOriginAddress,
  DeliveryQuoteRequest,
  DeliveryQuoteResponse,
  PaymentMethodConfig,
  ValidatedCartResponse,
  CartItemInput,
  CreateOrderPayload,
  OrderFilterParams,
  OrdersSummary,
} from '../types/order';
import {
  Service,
  ServicePayload,
  ServiceCategory,
  ServiceCategoryPayload,
  Professional,
  ProfessionalPayload,
  ServiceFilterParams,
  ProfessionalFilterParams,
  PublicServicesResponse,
  PublicProfessionalsResponse,
} from '../types/service';
import {
  Appointment,
  AppointmentSettings,
  AppointmentStatus,
  AvailableSlotsResponse,
  CreateAppointmentPayload,
  CreateScheduleBlockPayload,
  ProfessionalSchedule,
  PublicBookingPayload,
  PublicBookingResult,
  RescheduleAppointmentPayload,
  SaveProfessionalSchedulePayload,
  ScheduleBlock,
  UpdateAppointmentSettingsPayload,
} from '../types/appointment';
import {
  RestaurantTable,
  RestaurantSession,
  RestaurantOrder,
  RestaurantOrderStatus,
  CreateTablePayload,
  CreateTablesBatchPayload,
  CreateTableOrderPayload,
  PublicTableInfoResponse,
  RestaurantSummary,
  RestaurantFeeTemplate,
  RestaurantSessionFee,
  AddSessionFeePayload,
} from '../types/restaurant';

class ApiService {
  private getHeaders(): HeadersInit {
    const token = localStorage.getItem('saas_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, retries = 2): Promise<T> {
    let lastError: any = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(endpoint, {
          ...options,
          credentials: 'include', // sends HttpOnly cookie automatically in all topologies
          headers: {
            ...this.getHeaders(),
            ...options.headers,
          },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Ocorreu um erro no servidor.');
        }
        return data as T;
      } catch (err: any) {
        lastError = err;
        // If it's an HTTP error (4xx/5xx returned by server with a message), do not retry
        if (err.message && err.message !== 'Failed to fetch' && !err.message.includes('NetworkError') && !err.message.includes('fetch')) {
          throw err;
        }
        // Transient network failure or server restart, retry if attempts remain
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 350 * Math.pow(2, attempt)));
        }
      }
    }

    throw lastError || new Error('Falha de conexão com o servidor.');
  }

  // --- Runtime Config ---
  async getConfig(): Promise<{ isDevelopment: boolean; baseDomain: string }> {
    return this.request<{ isDevelopment: boolean; baseDomain: string }>('/api/config');
  }

  // --- Auth ---
  async login(email: string, password: string): Promise<{ token: string; user: User; tenant?: Tenant | null; linkedProfessional?: Professional | null }> {
    const res = await this.request<{ success: boolean; token: string; user: User; tenant?: Tenant | null; linkedProfessional?: Professional | null }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('saas_token', res.token);
    return res;
  }

  async getCurrentSession(): Promise<{
    user: User;
    tenant?: Tenant | null;
    isImpersonating?: boolean;
    originalAdminUserName?: string;
    resolvedFeatures?: Record<FeatureKey, boolean>;
    linkedProfessional?: Professional | null;
  }> {
    return this.request('/api/auth/me');
  }

  async logout(): Promise<void> {
    await this.request('/api/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('saas_token');
  }

  async selfAssignTenant(): Promise<{ user: User; tenant?: Tenant | null }> {
    return this.request<{ success: boolean; user: User; tenant?: Tenant | null }>(
      '/api/auth/self-assign-tenant',
      { method: 'POST' }
    );
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    return this.request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  // --- Impersonation ---
  async impersonateTenant(tenantId: string): Promise<{ token: string; user: User; tenant: Tenant; message: string }> {
    const res = await this.request<{ success: boolean; token: string; user: User; tenant: Tenant; message: string }>(
      `/api/auth/impersonate/${tenantId}`,
      { method: 'POST' }
    );
    localStorage.setItem('saas_token', res.token);
    return res;
  }

  async exitImpersonation(): Promise<{ user: User }> {
    const res = await this.request<{ success: boolean; token: string; user: User }>(
      '/api/auth/impersonate/exit',
      { method: 'POST' }
    );
    localStorage.setItem('saas_token', res.token);
    return res;
  }

  // --- Stats & Overview ---
  async getSuperAdminStats(): Promise<{
    totalTenants: number;
    activeTenants: number;
    suspendedTenants: number;
    trialTenants: number;
    pendingTenants: number;
    overdueTenants: number;
    totalClientUsers: number;
    recentTenants: Tenant[];
  }> {
    return this.request('/api/stats/superadmin');
  }

  // --- Tenants ---
  async getTenants(): Promise<Tenant[]> {
    const res = await this.request<{ success: boolean; data: Tenant[] }>('/api/tenants');
    return res.data;
  }

  async getTenant(id: string): Promise<Tenant> {
    const res = await this.request<{ success: boolean; data: Tenant }>(`/api/tenants/${id}`);
    return res.data;
  }

  async checkSlug(slug: string, excludeId?: string): Promise<{ available: boolean; slug: string; error?: string }> {
    const query = excludeId ? `?exclude=${encodeURIComponent(excludeId)}` : '';
    return this.request(`/api/tenants/check-slug/${encodeURIComponent(slug)}${query}`);
  }

  async createTenant(payload: {
    name: string;
    slug: string;
    subdomain?: string;
    baseDomain?: string;
    segment: string;
    cnpj?: string;
    phone: string;
    whatsapp: string;
    email: string;
    ownerName: string;
    ownerEmail: string;
    ownerPhone: string;
    planId: string;
    status: TenantStatus;
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    fontFamily?: string;
  }): Promise<{ tenant: Tenant; defaultUser: User }> {
    const res = await this.request<{ success: boolean; tenant: Tenant; defaultUser: User }>('/api/tenants', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  }

  async updateTenant(id: string, payload: Partial<Tenant>): Promise<Tenant> {
    const res = await this.request<{ success: boolean; data: Tenant }>(`/api/tenants/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async updateTenantStatus(id: string, status: TenantStatus): Promise<Tenant> {
    const res = await this.request<{ success: boolean; data: Tenant }>(`/api/tenants/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return res.data;
  }

  async updateTenantFeatures(id: string, overrides: Partial<Record<FeatureKey, boolean>>): Promise<Tenant> {
    const res = await this.request<{ success: boolean; data: Tenant }>(`/api/tenants/${id}/features`, {
      method: 'PUT',
      body: JSON.stringify({ overrides }),
    });
    return res.data;
  }

  async resetTenantFeature(id: string, featureKey: FeatureKey): Promise<Tenant> {
    const res = await this.request<{ success: boolean; data: Tenant }>(`/api/tenants/${id}/features/${featureKey}`, {
      method: 'DELETE',
    });
    return res.data;
  }

  async deleteTenant(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/tenants/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Tenant Users ---
  async getTenantUsers(tenantId: string): Promise<User[]> {
    const res = await this.request<{ success: boolean; data: User[] }>(`/api/tenants/${tenantId}/users`);
    return res.data;
  }

  async createTenantUser(
    tenantId: string,
    payload: { name: string; email: string; phone?: string; role?: UserRole; password?: string }
  ): Promise<User> {
    const res = await this.request<{ success: boolean; data: User }>(`/api/tenants/${tenantId}/users`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async updateTenantUser(
    tenantId: string,
    userId: string,
    payload: { name?: string; phone?: string; status?: 'active' | 'inactive'; role?: UserRole; password?: string }
  ): Promise<User> {
    const res = await this.request<{ success: boolean; data: User }>(`/api/tenants/${tenantId}/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async deleteTenantUser(tenantId: string, userId: string): Promise<{ success: boolean }> {
    return this.request(`/api/tenants/${tenantId}/users/${userId}`, {
      method: 'DELETE',
    });
  }

  async resendInvite(tenantId: string, userId: string): Promise<{ message: string }> {
    return this.request(`/api/tenants/${tenantId}/users/${userId}/resend-invite`, {
      method: 'POST',
    });
  }

  // --- Global Users ---
  async getAllUsers(): Promise<User[]> {
    const res = await this.request<{ success: boolean; data: User[] }>('/api/users');
    return res.data;
  }

  // --- Plans & Features ---
  async getPlans(): Promise<Plan[]> {
    const res = await this.request<{ success: boolean; data: Plan[] }>('/api/plans');
    return res.data;
  }

  async updatePlan(id: string, payload: Partial<Plan>): Promise<Plan> {
    const res = await this.request<{ success: boolean; data: Plan }>(`/api/plans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async getFeatures(): Promise<FeatureDefinition[]> {
    const res = await this.request<{ success: boolean; data: FeatureDefinition[] }>('/api/features');
    return res.data;
  }

  // --- Media Upload ---
  async uploadMedia(fileBase64: string, fileName: string, mimeType?: string): Promise<{ url: string }> {
    const res = await this.request<{ success: boolean; url: string }>('/api/upload', {
      method: 'POST',
      body: JSON.stringify({ fileBase64, fileName, mimeType }),
    });
    return { url: res.url };
  }

  // --- Mini-Site Builder & Public Pages ---
  async getSite(): Promise<SiteData> {
    const res = await this.request<{ success: boolean; data: SiteData }>('/api/site');
    return res.data;
  }

  async saveSiteDraft(payload: {
    templateId?: SiteTemplateId;
    sections?: SiteSection[];
    seo?: Partial<SiteSeo>;
    appearance?: Partial<SiteAppearance>;
    settings?: Partial<SiteSettings>;
  }): Promise<SiteData> {
    const res = await this.request<{ success: boolean; data: SiteData; message: string }>('/api/site/draft', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async publishSite(): Promise<SiteData> {
    const res = await this.request<{ success: boolean; data: SiteData; message: string }>('/api/site/publish', {
      method: 'POST',
    });
    return res.data;
  }

  async getPublicSite(slug: string): Promise<{
    success: boolean;
    isPublished: boolean;
    tenant: Tenant | null;
    site: SiteData | null;
    operationStatus?: any;
    error?: string;
  }> {
    return this.request(`/api/site/public/${slug}`);
  }

  async getSiteDraftPreview(slug: string): Promise<{
    success: boolean;
    isPublished: boolean;
    tenant: Tenant | null;
    site: SiteData | null;
    operationStatus?: any;
    error?: string;
  }> {
    return this.request(`/api/site/preview/${slug}`);
  }

  async uploadSiteMedia(
    fileBase64: string,
    fileName: string,
    mimeType?: string,
    subfolder: string = 'general'
  ): Promise<string> {
    const res = await this.request<{ success: boolean; url: string }>('/api/site/upload-media', {
      method: 'POST',
      body: JSON.stringify({ fileBase64, fileName, mimeType, subfolder }),
    });
    return res.url;
  }

  async getSignedUploadUrl(
    fileName: string,
    mimeType?: string,
    subfolder: string = 'general'
  ): Promise<{ success: boolean; signedUrl: string; token: string; path: string; publicUrl: string }> {
    return this.request('/api/site/get-signed-upload-url', {
      method: 'POST',
      body: JSON.stringify({ fileName, mimeType, subfolder }),
    });
  }


  // ==========================================
  // PRODUCTS & CATEGORIES API
  // ==========================================

  async getProducts(filters?: ProductFilterParams): Promise<Product[]> {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.categoryId) params.set('category_id', filters.categoryId);
    if (filters?.isActive !== undefined && filters.isActive !== 'all') {
      params.set('is_active', String(filters.isActive));
    }
    if (filters?.isFeatured) params.set('is_featured', 'true');
    if (filters?.stockStatus && filters.stockStatus !== 'all') params.set('stock_status', filters.stockStatus);
    if (filters?.sort && filters.sort !== 'manual') params.set('sort', filters.sort);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<{ success: boolean; data: Product[] }>(`/api/products${qs}`);
    return res.data;
  }

  async getProduct(id: string): Promise<Product> {
    const res = await this.request<{ success: boolean; data: Product }>(`/api/products/${id}`);
    return res.data;
  }

  async createProduct(payload: any): Promise<Product> {
    const res = await this.request<{ success: boolean; data: Product; message: string }>('/api/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async updateProduct(id: string, payload: any): Promise<Product> {
    const res = await this.request<{ success: boolean; data: Product; message: string }>(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async deleteProduct(id: string): Promise<void> {
    await this.request(`/api/products/${id}`, { method: 'DELETE' });
  }

  async duplicateProduct(id: string): Promise<Product> {
    const res = await this.request<{ success: boolean; data: Product }>(`/api/products/${id}/duplicate`, {
      method: 'POST',
    });
    return res.data;
  }

  async toggleProductStatus(id: string, isActive: boolean): Promise<Product> {
    const res = await this.request<{ success: boolean; data: Product }>(`/api/products/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
    return res.data;
  }

  async uploadProductImage(
    productId: string,
    fileBase64: string,
    fileName: string,
    mimeType: string,
    isPrimary?: boolean
  ): Promise<ProductImage> {
    const res = await this.request<{ success: boolean; data: ProductImage }>(`/api/products/${productId}/images`, {
      method: 'POST',
      body: JSON.stringify({ fileBase64, fileName, mimeType, isPrimary }),
    });
    return res.data;
  }

  async setPrimaryProductImage(productId: string, imageId: string): Promise<void> {
    await this.request(`/api/products/${productId}/images/${imageId}/primary`, { method: 'PATCH' });
  }

  async deleteProductImage(productId: string, imageId: string): Promise<void> {
    await this.request(`/api/products/${productId}/images/${imageId}`, { method: 'DELETE' });
  }

  async getCategories(): Promise<ProductCategory[]> {
    const res = await this.request<{ success: boolean; data: ProductCategory[] }>('/api/product-categories');
    return res.data;
  }

  async createCategory(payload: { name: string; description?: string; imageUrl?: string; isActive?: boolean }): Promise<ProductCategory> {
    const res = await this.request<{ success: boolean; data: ProductCategory }>('/api/product-categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async updateCategory(id: string, payload: any): Promise<ProductCategory> {
    const res = await this.request<{ success: boolean; data: ProductCategory }>(`/api/product-categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async deleteCategory(id: string): Promise<void> {
    await this.request(`/api/product-categories/${id}`, { method: 'DELETE' });
  }

  async reorderCategories(orderedIds: string[]): Promise<void> {
    await this.request('/api/product-categories/reorder', {
      method: 'PUT',
      body: JSON.stringify({ orderedIds }),
    });
  }

  async getPublicCatalog(slug: string, options?: { categoryId?: string; search?: string; featured?: boolean; sort?: string; limit?: number }): Promise<PublicCatalogResponse> {
    const params = new URLSearchParams();
    if (options?.categoryId) params.set('category_id', options.categoryId);
    if (options?.search) params.set('search', options.search);
    if (options?.featured) params.set('featured', 'true');
    if (options?.sort) params.set('sort', options.sort);
    if (options?.limit) params.set('limit', String(options.limit));

    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/site/public/${slug}/products${qs}`);
  }

  async getTenantProductsSummary(tenantId: string): Promise<{
    totalProducts: number;
    activeProducts: number;
    outOfStockProducts: number;
    categoriesCount: number;
  }> {
    const res = await this.request<{ success: boolean; data: any }>(`/api/tenants/${tenantId}/products-summary`);
    return res.data;
  }

  // ==========================================
  // SHOPPING CART & PUBLIC CHECKOUT (ETAPA 3B)
  // ==========================================

  async validateCart(slug: string, items: CartItemInput[]): Promise<ValidatedCartResponse> {
    const res = await this.request<{ success: boolean; data: ValidatedCartResponse }>(
      `/api/site/public/${slug}/cart/validate`,
      {
        method: 'POST',
        body: JSON.stringify({ items }),
      }
    );
    return res.data;
  }

  async calculateDeliveryQuote(
    slug: string,
    payload: DeliveryQuoteRequest
  ): Promise<DeliveryQuoteResponse> {
    const res = await this.request<{ success: boolean; data: DeliveryQuoteResponse }>(
      `/api/site/public/${slug}/delivery/quote`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return res.data;
  }

  async createOrder(
    slug: string,
    payload: CreateOrderPayload
  ): Promise<{ order: Order; whatsappUrl: string; message: string }> {
    const res = await this.request<{
      success: boolean;
      data: Order;
      whatsappUrl: string;
      message: string;
    }>(`/api/site/public/${slug}/orders`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return {
      order: res.data,
      whatsappUrl: res.whatsappUrl,
      message: res.message,
    };
  }

  async markOrderWhatsAppSent(slug: string, orderId: string): Promise<void> {
    await this.request(`/api/site/public/${slug}/orders/${orderId}/whatsapp-sent`, {
      method: 'PATCH',
    });
  }

  // ==========================================
  // ORDERS MANAGEMENT (CLIENT ADMIN)
  // ==========================================

  async getOrders(filters?: OrderFilterParams): Promise<{ orders: Order[]; total: number }> {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.fulfillmentType) params.set('fulfillment_type', filters.fulfillmentType);
    if (filters?.startDate) params.set('start_date', filters.startDate);
    if (filters?.endDate) params.set('end_date', filters.endDate);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<{ success: boolean; data: Order[]; total: number }>(`/api/orders${qs}`);
    return { orders: res.data, total: res.total };
  }

  async getOrdersSummary(): Promise<OrdersSummary> {
    const res = await this.request<{ success: boolean; data: OrdersSummary }>('/api/orders/summary');
    return res.data;
  }

  async getOrder(id: string): Promise<Order> {
    const res = await this.request<{ success: boolean; data: Order }>(`/api/orders/${id}`);
    return res.data;
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
    const res = await this.request<{ success: boolean; data: Order; message: string }>(`/api/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return res.data;
  }

  async updateOrder(id: string, payload: any): Promise<Order> {
    const res = await this.request<{ success: boolean; data: Order; message: string }>(`/api/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async deleteOrder(id: string): Promise<void> {
    await this.request(`/api/orders/${id}`, { method: 'DELETE' });
  }

  // ==========================================
  // DELIVERY CONFIGURATION (CLIENT ADMIN)
  // ==========================================

  async getDeliverySettings(): Promise<DeliverySettings> {
    const res = await this.request<{ success: boolean; data: DeliverySettings }>('/api/delivery/settings');
    return res.data;
  }

  async updateDeliverySettings(payload: Partial<DeliverySettings>): Promise<DeliverySettings> {
    const res = await this.request<{ success: boolean; data: DeliverySettings; message: string }>(
      '/api/delivery/settings',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
    return res.data;
  }

  async getDeliveryRules(): Promise<DeliveryRule[]> {
    const res = await this.request<{ success: boolean; data: DeliveryRule[] }>('/api/delivery/rules');
    return res.data;
  }

  async createDeliveryRule(payload: Partial<DeliveryRule>): Promise<DeliveryRule> {
    const res = await this.request<{ success: boolean; data: DeliveryRule; message: string }>(
      '/api/delivery/rules',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return res.data;
  }

  async updateDeliveryRule(id: string, payload: Partial<DeliveryRule>): Promise<DeliveryRule> {
    const res = await this.request<{ success: boolean; data: DeliveryRule; message: string }>(
      `/api/delivery/rules/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
    return res.data;
  }

  async deleteDeliveryRule(id: string): Promise<void> {
    await this.request(`/api/delivery/rules/${id}`, { method: 'DELETE' });
  }

  async reorderDeliveryRules(ruleIds: string[]): Promise<void> {
    await this.request('/api/delivery/rules/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ruleIds }),
    });
  }

  async geocodeOriginAddress(
    address: Partial<DeliveryOriginAddress>
  ): Promise<{
    latitude: number;
    longitude: number;
    formattedAddress?: string;
    precision?: string;
    provider?: string;
  }> {
    const res = await this.request<{
      success: boolean;
      data: {
        latitude: number;
        longitude: number;
        formattedAddress?: string;
        precision?: string;
        provider?: string;
      };
    }>('/api/delivery/geocode-origin', {
      method: 'POST',
      body: JSON.stringify({ address }),
    });
    return res.data;
  }

  async simulateDeliveryFee(payload: {
    address: Partial<DeliveryOriginAddress>;
    subtotal?: number;
    selectedRuleId?: string | null;
    overrideSettings?: Partial<DeliverySettings>;
  }): Promise<DeliveryQuoteResponse> {
    const res = await this.request<{ success: boolean; data: DeliveryQuoteResponse }>(
      '/api/delivery/simulate',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return res.data;
  }

  // ==========================================
  // PAYMENT METHODS (CLIENT ADMIN)
  // ==========================================

  async getPaymentMethods(): Promise<PaymentMethodConfig[]> {
    const res = await this.request<{ success: boolean; data: PaymentMethodConfig[] }>('/api/payment-methods');
    return res.data;
  }

  async updatePaymentMethod(id: string, payload: { isActive?: boolean; label?: string }): Promise<PaymentMethodConfig> {
    const res = await this.request<{ success: boolean; data: PaymentMethodConfig; message: string }>(
      `/api/payment-methods/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
    return res.data;
  }

  async getTenantOrdersSummary(tenantId: string): Promise<OrdersSummary> {
    const res = await this.request<{ success: boolean; data: OrdersSummary }>(
      `/api/tenants/${tenantId}/orders-summary`
    );
    return res.data;
  }

  // ==========================================
  // SERVICES & CATEGORIES (ETAPA 4A)
  // ==========================================

  async getServices(filters?: ServiceFilterParams): Promise<Service[]> {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.categoryId) params.set('category_id', filters.categoryId);
    if (filters?.active !== undefined && filters.active !== 'all') params.set('active', String(filters.active));
    if (filters?.featured !== undefined) params.set('featured', String(filters.featured));
    if (filters?.pricingType) params.set('pricing_type', filters.pricingType);
    if (filters?.sort) params.set('sort', filters.sort);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<{ success: boolean; data: Service[] }>(`/api/services${qs}`);
    return res.data;
  }

  async getService(id: string): Promise<Service> {
    const res = await this.request<{ success: boolean; data: Service }>(`/api/services/${id}`);
    return res.data;
  }

  async createService(payload: ServicePayload): Promise<Service> {
    const res = await this.request<{ success: boolean; data: Service; message: string }>('/api/services', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async updateService(id: string, payload: Partial<ServicePayload>): Promise<Service> {
    const res = await this.request<{ success: boolean; data: Service; message: string }>(`/api/services/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async deleteService(id: string): Promise<void> {
    await this.request(`/api/services/${id}`, { method: 'DELETE' });
  }

  async duplicateService(id: string): Promise<Service> {
    const res = await this.request<{ success: boolean; data: Service; message: string }>(`/api/services/${id}/duplicate`, {
      method: 'POST',
    });
    return res.data;
  }

  async toggleServiceStatus(id: string, active: boolean): Promise<Service> {
    const res = await this.request<{ success: boolean; data: Service; message: string }>(`/api/services/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    });
    return res.data;
  }

  async reorderServices(orderedIds: string[]): Promise<void> {
    await this.request('/api/services/reorder', {
      method: 'PUT',
      body: JSON.stringify({ orderedIds }),
    });
  }

  // --- Service Categories ---
  async getServiceCategories(): Promise<ServiceCategory[]> {
    const res = await this.request<{ success: boolean; data: ServiceCategory[] }>('/api/service-categories');
    return res.data;
  }

  async createServiceCategory(payload: ServiceCategoryPayload): Promise<ServiceCategory> {
    const res = await this.request<{ success: boolean; data: ServiceCategory; message: string }>('/api/service-categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async updateServiceCategory(id: string, payload: Partial<ServiceCategoryPayload>): Promise<ServiceCategory> {
    const res = await this.request<{ success: boolean; data: ServiceCategory; message: string }>(`/api/service-categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async deleteServiceCategory(id: string): Promise<void> {
    await this.request(`/api/service-categories/${id}`, { method: 'DELETE' });
  }

  async reorderServiceCategories(orderedIds: string[]): Promise<void> {
    await this.request('/api/service-categories/reorder', {
      method: 'PUT',
      body: JSON.stringify({ orderedIds }),
    });
  }

  // ==========================================
  // PROFESSIONALS (ETAPA 4A)
  // ==========================================

  async getProfessionals(filters?: ProfessionalFilterParams): Promise<Professional[]> {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.active !== undefined && filters.active !== 'all') params.set('active', String(filters.active));
    if (filters?.serviceId) params.set('service_id', filters.serviceId);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<{ success: boolean; data: Professional[] }>(`/api/professionals${qs}`);
    return res.data;
  }

  async getProfessional(id: string): Promise<Professional> {
    const res = await this.request<{ success: boolean; data: Professional }>(`/api/professionals/${id}`);
    return res.data;
  }

  async createProfessional(payload: ProfessionalPayload): Promise<Professional> {
    const res = await this.request<{ success: boolean; data: Professional; message: string }>('/api/professionals', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async updateProfessional(id: string, payload: Partial<ProfessionalPayload>): Promise<Professional> {
    const res = await this.request<{ success: boolean; data: Professional; message: string }>(`/api/professionals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async deleteProfessional(id: string): Promise<void> {
    await this.request(`/api/professionals/${id}`, { method: 'DELETE' });
  }

  async toggleProfessionalStatus(id: string, active: boolean): Promise<Professional> {
    const res = await this.request<{ success: boolean; data: Professional; message: string }>(`/api/professionals/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    });
    return res.data;
  }

  async reorderProfessionals(orderedIds: string[]): Promise<void> {
    await this.request('/api/professionals/reorder', {
      method: 'PUT',
      body: JSON.stringify({ orderedIds }),
    });
  }

  // ==========================================
  // PUBLIC LIVE SERVICES & PROFESSIONALS
  // ==========================================

  async getPublicServices(
    slug: string,
    options?: { categoryId?: string; search?: string; featuredOnly?: boolean; limit?: number }
  ): Promise<PublicServicesResponse> {
    const params = new URLSearchParams();
    if (options?.categoryId) params.set('category_id', options.categoryId);
    if (options?.search) params.set('search', options.search);
    if (options?.featuredOnly) params.set('featured', 'true');
    if (options?.limit) params.set('limit', String(options.limit));

    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/site/public/${slug}/services${qs}`);
  }

  async getPublicProfessionals(slug: string): Promise<PublicProfessionalsResponse> {
    return this.request(`/api/site/public/${slug}/professionals`);
  }

  // ==========================================
  // APPOINTMENTS & SCHEDULING (ETAPA 4B)
  // ==========================================

  async getAppointmentSettings(): Promise<AppointmentSettings> {
    const res = await this.request<{ success: boolean; data: AppointmentSettings }>('/api/appointment-settings');
    return res.data;
  }

  async updateAppointmentSettings(payload: UpdateAppointmentSettingsPayload): Promise<AppointmentSettings> {
    const res = await this.request<{ success: boolean; data: AppointmentSettings; message: string }>('/api/appointment-settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async getProfessionalSchedules(): Promise<ProfessionalSchedule[]> {
    const res = await this.request<{ success: boolean; data: ProfessionalSchedule[] }>('/api/professional-schedules');
    return res.data;
  }

  async saveProfessionalSchedule(payload: SaveProfessionalSchedulePayload): Promise<ProfessionalSchedule> {
    const res = await this.request<{ success: boolean; data: ProfessionalSchedule; message: string }>('/api/professional-schedules', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async getScheduleBlocks(professionalId?: string): Promise<ScheduleBlock[]> {
    const qs = professionalId ? `?professional_id=${professionalId}` : '';
    const res = await this.request<{ success: boolean; data: ScheduleBlock[] }>(`/api/schedule-blocks${qs}`);
    return res.data;
  }

  async createScheduleBlock(payload: CreateScheduleBlockPayload): Promise<ScheduleBlock> {
    const res = await this.request<{ success: boolean; data: ScheduleBlock; message: string }>('/api/schedule-blocks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async deleteScheduleBlock(id: string): Promise<void> {
    await this.request(`/api/schedule-blocks/${id}`, { method: 'DELETE' });
  }

  async getAppointments(filters?: {
    date?: string;
    startDate?: string;
    endDate?: string;
    professionalId?: string;
    status?: string;
    search?: string;
  }): Promise<Appointment[]> {
    const params = new URLSearchParams();
    if (filters?.date) params.set('date', filters.date);
    if (filters?.startDate) params.set('start_date', filters.startDate);
    if (filters?.endDate) params.set('end_date', filters.endDate);
    if (filters?.professionalId && filters.professionalId !== 'all') params.set('professional_id', filters.professionalId);
    if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters?.search) params.set('search', filters.search);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<{ success: boolean; data: Appointment[] }>(`/api/appointments${qs}`);
    return res.data;
  }

  async listAppointments(filters?: {
    date?: string;
    startDate?: string;
    endDate?: string;
    professionalId?: string;
    status?: string;
    search?: string;
  }): Promise<Appointment[]> {
    return this.getAppointments(filters);
  }

  async createAppointment(payload: CreateAppointmentPayload): Promise<Appointment> {
    const res = await this.request<{ success: boolean; data: Appointment; message: string }>('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async getAppointment(id: string): Promise<Appointment> {
    const res = await this.request<{ success: boolean; data: Appointment }>(`/api/appointments/${id}`);
    return res.data;
  }

  async updateAppointmentStatus(id: string, status: AppointmentStatus, cancellationReason?: string): Promise<Appointment> {
    const res = await this.request<{ success: boolean; data: Appointment; message: string }>(`/api/appointments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, cancellationReason }),
    });
    return res.data;
  }

  async rescheduleAppointment(id: string, payload: RescheduleAppointmentPayload): Promise<Appointment> {
    const res = await this.request<{ success: boolean; data: Appointment; message: string }>(`/api/appointments/${id}/reschedule`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async updateAppointmentNotes(id: string, internalNotes: string | null): Promise<Appointment> {
    const res = await this.request<{ success: boolean; data: Appointment; message: string }>(`/api/appointments/${id}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ internalNotes }),
    });
    return res.data;
  }

  async getCustomerAppointmentsHistory(phone: string): Promise<Appointment[]> {
    const res = await this.request<{ success: boolean; data: Appointment[] }>(`/api/appointments/customer/${encodeURIComponent(phone)}`);
    return res.data;
  }

  // --- Public Booking Methods ---
  async getPublicAppointmentSettings(slug: string): Promise<Partial<AppointmentSettings>> {
    const res = await this.request<{ success: boolean; data: Partial<AppointmentSettings> }>(`/api/site/public/${slug}/appointments/settings`);
    return res.data;
  }

  async getPublicAvailableSlots(slug: string, serviceId: string, date: string, professionalId?: string): Promise<AvailableSlotsResponse> {
    const params = new URLSearchParams({ service_id: serviceId, date });
    if (professionalId) params.set('professional_id', professionalId);
    const res = await this.request<{ success: boolean; data: AvailableSlotsResponse }>(`/api/site/public/${slug}/appointments/available-slots?${params.toString()}`);
    return res.data;
  }

  async bookPublicAppointment(slug: string, payload: PublicBookingPayload): Promise<PublicBookingResult> {
    return this.request<PublicBookingResult>(`/api/site/public/${slug}/appointments/book`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async lookupPublicAppointment(slug: string, token: string): Promise<Appointment> {
    const res = await this.request<{ success: boolean; data: Appointment }>(`/api/site/public/${slug}/appointments/lookup/${token}`);
    return res.data;
  }

  async cancelPublicAppointment(slug: string, token: string, reason?: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/api/site/public/${slug}/appointments/cancel/${token}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // ==========================================
  // RESTAURANT DIGITAL CATALOG & TABLES API
  // ==========================================

  async getRestaurantTables(): Promise<RestaurantTable[]> {
    const res = await this.request<{ success: boolean; data: RestaurantTable[] }>('/api/restaurant/tables');
    return res.data;
  }

  async createRestaurantTable(payload: CreateTablePayload): Promise<RestaurantTable> {
    const res = await this.request<{ success: boolean; data: RestaurantTable }>('/api/restaurant/tables', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async createRestaurantTablesBatch(payload: CreateTablesBatchPayload): Promise<{ createdCount: number; skippedCount: number }> {
    return this.request('/api/restaurant/tables/batch', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateRestaurantTable(id: string, payload: Partial<RestaurantTable>): Promise<RestaurantTable> {
    const res = await this.request<{ success: boolean; data: RestaurantTable }>(`/api/restaurant/tables/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async deleteRestaurantTable(id: string): Promise<void> {
    await this.request(`/api/restaurant/tables/${id}`, { method: 'DELETE' });
  }

  async regenerateTableQrToken(id: string): Promise<string> {
    const res = await this.request<{ success: boolean; qrCodeToken: string }>(`/api/restaurant/tables/${id}/regenerate-token`, {
      method: 'POST',
    });
    return res.qrCodeToken;
  }

  async getTableSession(tableId: string): Promise<RestaurantSession | null> {
    const res = await this.request<{ success: boolean; data: RestaurantSession | null }>(`/api/restaurant/tables/${tableId}/session`);
    return res.data;
  }

  async closeTableSession(tableId: string, notes?: string, paymentMethod?: string): Promise<{ session: RestaurantSession; totalAmount: number }> {
    return this.request(`/api/restaurant/tables/${tableId}/close-session`, {
      method: 'POST',
      body: JSON.stringify({ notes, paymentMethod }),
    });
  }

  async cancelTableClosing(tableId: string): Promise<RestaurantSession> {
    const res = await this.request<{ success: boolean; session: RestaurantSession }>(`/api/restaurant/tables/${tableId}/cancel-closing`, {
      method: 'POST',
    });
    return res.session;
  }

  // Fees Template Management
  async getRestaurantFeeTemplates(): Promise<RestaurantFeeTemplate[]> {
    const res = await this.request<{ success: boolean; data: RestaurantFeeTemplate[] }>('/api/restaurant/fees');
    return res.data;
  }

  async createRestaurantFeeTemplate(payload: {
    name: string;
    description?: string;
    type: 'percentage' | 'fixed';
    value: number;
    isActive?: boolean;
    isDefault?: boolean;
  }): Promise<RestaurantFeeTemplate> {
    const res = await this.request<{ success: boolean; data: RestaurantFeeTemplate }>('/api/restaurant/fees', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async updateRestaurantFeeTemplate(id: string, payload: Partial<RestaurantFeeTemplate>): Promise<RestaurantFeeTemplate> {
    const res = await this.request<{ success: boolean; data: RestaurantFeeTemplate }>(`/api/restaurant/fees/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async deleteRestaurantFeeTemplate(id: string): Promise<void> {
    await this.request(`/api/restaurant/fees/${id}`, { method: 'DELETE' });
  }

  // Session Fees
  async getSessionFees(sessionId: string): Promise<RestaurantSessionFee[]> {
    const res = await this.request<{ success: boolean; data: RestaurantSessionFee[] }>(`/api/restaurant/sessions/${sessionId}/fees`);
    return res.data;
  }

  async addSessionFee(sessionId: string, payload: AddSessionFeePayload): Promise<RestaurantSessionFee> {
    const res = await this.request<{ success: boolean; data: RestaurantSessionFee }>(`/api/restaurant/sessions/${sessionId}/fees`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async removeSessionFee(sessionId: string, feeId: string): Promise<void> {
    await this.request(`/api/restaurant/sessions/${sessionId}/fees/${feeId}`, { method: 'DELETE' });
  }

  async getRestaurantOrders(filters?: {
    status?: string;
    tableId?: string;
    sessionId?: string;
    date?: string;
    search?: string;
  }): Promise<RestaurantOrder[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.tableId) params.set('tableId', filters.tableId);
    if (filters?.sessionId) params.set('sessionId', filters.sessionId);
    if (filters?.date) params.set('date', filters.date);
    if (filters?.search) params.set('search', filters.search);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<{ success: boolean; data: RestaurantOrder[] }>(`/api/restaurant/orders${qs}`);
    return res.data;
  }

  async getRestaurantOrder(id: string): Promise<RestaurantOrder> {
    const res = await this.request<{ success: boolean; data: RestaurantOrder }>(`/api/restaurant/orders/${id}`);
    return res.data;
  }

  async updateRestaurantOrderStatus(id: string, status: RestaurantOrderStatus, notes?: string): Promise<RestaurantOrder> {
    const res = await this.request<{ success: boolean; data: RestaurantOrder }>(`/api/restaurant/orders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, notes }),
    });
    return res.data;
  }

  async cancelRestaurantOrder(id: string, reason: string): Promise<RestaurantOrder> {
    const res = await this.request<{ success: boolean; data: RestaurantOrder }>(`/api/restaurant/orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return res.data;
  }

  async updateRestaurantOrder(id: string, payload: any): Promise<RestaurantOrder> {
    const res = await this.request<{ success: boolean; data: RestaurantOrder; message: string }>(`/api/restaurant/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  }

  async deleteRestaurantOrder(id: string): Promise<void> {
    await this.request(`/api/restaurant/orders/${id}`, { method: 'DELETE' });
  }

  async getRestaurantSummary(): Promise<RestaurantSummary> {
    const res = await this.request<{ success: boolean; data: RestaurantSummary }>('/api/restaurant/summary');
    return res.data;
  }

  // --- Public Table & Catalog Methods ---
  async getPublicTableInfo(slug: string, token: string): Promise<PublicTableInfoResponse> {
    return this.request<PublicTableInfoResponse>(`/api/public/restaurant/table-info?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`);
  }

  async getPublicTableCatalog(slug: string, token: string, categoryId?: string, search?: string): Promise<PublicCatalogResponse> {
    const params = new URLSearchParams({ slug, token });
    if (categoryId) params.set('categoryId', categoryId);
    if (search) params.set('search', search);
    return this.request<PublicCatalogResponse>(`/api/public/restaurant/catalog?${params.toString()}`);
  }

  async submitPublicTableOrder(payload: CreateTableOrderPayload): Promise<RestaurantOrder> {
    const res = await this.request<{ success: boolean; order: RestaurantOrder }>('/api/public/restaurant/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.order;
  }

  async getPublicTableSession(slug: string, token: string): Promise<{ success: boolean; session: RestaurantSession | null; orders: RestaurantOrder[]; totalAmount: number }> {
    return this.request(`/api/public/restaurant/table-session?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`);
  }

  async requestPublicTableClosing(payload: { tenantSlug: string; tableToken: string }): Promise<{ success: boolean; message: string; session: RestaurantSession }> {
    return this.request('/api/public/restaurant/request-closing', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

export const api = new ApiService();
