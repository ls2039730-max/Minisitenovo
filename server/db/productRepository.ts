import crypto from 'crypto';
import { supabaseAdmin } from '../supabaseAdmin.js';
import { repo } from './repository.js';
import { canTenantOperate } from '../tenantResolver.js';
import { storageService } from '../storage/storageService.js';
import { User } from '../../src/types/saas.js';
import {
  Product,
  ProductCategory,
  ProductImage,
  ProductVariant,
  ProductFilterParams,
  PublicCatalogResponse,
  DayOfWeek,
  ProductAvailabilityConfig,
} from '../../src/types/product.js';
import {
  isProductAvailableOnDay,
  getCurrentDayOfWeek,
  ALL_DAYS_OF_WEEK,
} from '../../src/utils/productAvailability.js';

// Helper to generate a clean URL slug from text
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseCurrency(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const str = String(val).trim();
  if (!str) return null;
  if (str.includes(',')) {
    const cleaned = str.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  const cleaned = str.replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export class ProductRepository {
  // ==========================================
  // CATEGORIES MANAGEMENT
  // ==========================================

  public async listCategories(tenantId: string): Promise<ProductCategory[]> {
    const { data: rawCategories } = await supabaseAdmin
      .from('product_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('position', { ascending: true });

    const categories = rawCategories || [];

    // Calculate product counts per category
    const { data: rawProducts } = await supabaseAdmin
      .from('products')
      .select('id, category_id')
      .eq('tenant_id', tenantId);

    const products = rawProducts || [];
    const countMap: Record<string, number> = {};
    products.forEach((p: any) => {
      if (p.category_id) {
        countMap[p.category_id] = (countMap[p.category_id] || 0) + 1;
      }
    });

    return categories.map((c: any) => ({
      id: c.id,
      tenantId: c.tenant_id,
      name: c.name,
      slug: c.slug,
      description: c.description || null,
      imageUrl: c.image_url || null,
      position: c.position || 0,
      isActive: c.is_active !== false,
      productsCount: countMap[c.id] || 0,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));
  }

  public async getCategoryById(id: string, tenantId: string): Promise<ProductCategory | null> {
    const { data } = await supabaseAdmin
      .from('product_categories')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (!data) return null;

    return {
      id: data.id,
      tenantId: data.tenant_id,
      name: data.name,
      slug: data.slug,
      description: data.description || null,
      imageUrl: data.image_url || null,
      position: data.position || 0,
      isActive: data.is_active !== false,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  public async createCategory(
    tenantId: string,
    payload: { name: string; description?: string; imageUrl?: string; isActive?: boolean },
    actor: User
  ): Promise<ProductCategory> {
    if (!payload.name || payload.name.trim().length === 0) {
      throw new Error('O nome da categoria é obrigatório.');
    }

    const baseSlug = slugify(payload.name);
    let finalSlug = baseSlug;
    let counter = 1;

    // Check slug uniqueness within tenant
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from('product_categories')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('slug', finalSlug)
        .single();

      if (!existing) break;
      finalSlug = `${baseSlug}-${counter++}`;
    }

    const { data: allCategories } = await supabaseAdmin
      .from('product_categories')
      .select('position')
      .eq('tenant_id', tenantId);

    const position = allCategories?.length || 0;
    const now = new Date().toISOString();

    const newCategory = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      name: payload.name.trim(),
      slug: finalSlug,
      description: payload.description?.trim() || null,
      image_url: payload.imageUrl || null,
      position,
      is_active: payload.isActive !== false,
      created_at: now,
      updated_at: now,
    };

    const { data: inserted } = await supabaseAdmin
      .from('product_categories')
      .insert(newCategory)
      .select()
      .single();

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'CATEGORY_CREATE' as any,
      entity: 'product_categories',
      entityId: inserted.id,
      metadata: { name: inserted.name, slug: inserted.slug },
    });

    return {
      id: inserted.id,
      tenantId: inserted.tenant_id,
      name: inserted.name,
      slug: inserted.slug,
      description: inserted.description,
      imageUrl: inserted.image_url,
      position: inserted.position,
      isActive: inserted.is_active,
      productsCount: 0,
      createdAt: inserted.created_at,
      updatedAt: inserted.updated_at,
    };
  }

  public async updateCategory(
    id: string,
    tenantId: string,
    payload: { name?: string; description?: string; imageUrl?: string; isActive?: boolean },
    actor: User
  ): Promise<ProductCategory> {
    const existing = await this.getCategoryById(id, tenantId);
    if (!existing) {
      throw new Error('Categoria não encontrada.');
    }

    const patch: any = {};
    if (payload.name && payload.name.trim() !== existing.name) {
      patch.name = payload.name.trim();
      const baseSlug = slugify(payload.name);
      let finalSlug = baseSlug;
      let counter = 1;

      while (true) {
        const { data: dup } = await supabaseAdmin
          .from('product_categories')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('slug', finalSlug)
          .neq('id', id)
          .single();

        if (!dup) break;
        finalSlug = `${baseSlug}-${counter++}`;
      }
      patch.slug = finalSlug;
    }

    if (payload.description !== undefined) {
      patch.description = payload.description?.trim() || null;
    }
    if (payload.imageUrl !== undefined) {
      patch.image_url = payload.imageUrl || null;
    }
    if (payload.isActive !== undefined) {
      patch.is_active = payload.isActive;
    }

    patch.updated_at = new Date().toISOString();

    const { data: updated } = await supabaseAdmin
      .from('product_categories')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'CATEGORY_UPDATE' as any,
      entity: 'product_categories',
      entityId: id,
      metadata: patch,
    });

    return {
      id: updated.id,
      tenantId: updated.tenant_id,
      name: updated.name,
      slug: updated.slug,
      description: updated.description,
      imageUrl: updated.image_url,
      position: updated.position,
      isActive: updated.is_active,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  }

  public async deleteCategory(id: string, tenantId: string, actor: User): Promise<boolean> {
    const existing = await this.getCategoryById(id, tenantId);
    if (!existing) {
      throw new Error('Categoria não encontrada.');
    }

    // Dissociate category from products (do not delete the products!)
    await supabaseAdmin
      .from('products')
      .update({ category_id: null, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('category_id', id);

    // Delete category
    await supabaseAdmin
      .from('product_categories')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'CATEGORY_DELETE' as any,
      entity: 'product_categories',
      entityId: id,
      metadata: { deletedName: existing.name },
    });

    return true;
  }

  public async reorderCategories(tenantId: string, orderedIds: string[], actor: User): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await supabaseAdmin
        .from('product_categories')
        .update({ position: i, updated_at: new Date().toISOString() })
        .eq('id', orderedIds[i])
        .eq('tenant_id', tenantId);
    }
  }

  // ==========================================
  // PRODUCTS MANAGEMENT
  // ==========================================

  public async listProducts(tenantId: string, filters?: ProductFilterParams): Promise<Product[]> {
    const { data: rawProducts } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId);

    let list: any[] = rawProducts || [];

    // Filter by category
    if (filters?.categoryId) {
      list = list.filter((p: any) => p.category_id === filters.categoryId);
    }

    // Filter by isActive
    if (filters?.isActive !== undefined && filters.isActive !== 'all' && (filters.isActive as any) !== 'ALL') {
      const activeBool = filters.isActive === true || String(filters.isActive) === 'true';
      list = list.filter((p: any) => (p.is_active !== false) === activeBool);
    }

    // Filter by isFeatured
    if (filters?.isFeatured) {
      list = list.filter((p: any) => !!p.is_featured);
    }

    // Filter by stock status
    if (filters?.stockStatus === 'in_stock') {
      list = list.filter((p: any) => !p.track_stock || p.stock_quantity > 0 || p.allow_out_of_stock);
    } else if (filters?.stockStatus === 'out_of_stock') {
      list = list.filter((p: any) => p.track_stock && p.stock_quantity <= 0 && !p.allow_out_of_stock);
    }

    // Text search
    if (filters?.search && filters.search.trim().length > 0) {
      const q = filters.search.toLowerCase().trim();
      list = list.filter(
        (p: any) =>
          p.name.toLowerCase().includes(q) ||
          (p.short_description && p.short_description.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q))
      );
    }

    // Sorting
    const sort = filters?.sort || 'manual';
    if (sort === 'manual') {
      list.sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
    } else if (sort === 'recent') {
      list.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sort === 'price_asc') {
      list.sort((a: any, b: any) => (a.price ?? 999999) - (b.price ?? 999999));
    } else if (sort === 'price_desc') {
      list.sort((a: any, b: any) => (b.price ?? 0) - (a.price ?? 0));
    } else if (sort === 'name_asc') {
      list.sort((a: any, b: any) => a.name.localeCompare(b.name));
    } else if (sort === 'featured_first') {
      list.sort((a: any, b: any) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0));
    }

    // Fetch related images, variants and categories for all products
    const categories = await this.listCategories(tenantId);
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const { data: allImages } = await supabaseAdmin
      .from('product_images')
      .select('*')
      .eq('tenant_id', tenantId);

    const { data: allVariants } = await supabaseAdmin
      .from('product_variants')
      .select('*')
      .eq('tenant_id', tenantId);

    const imagesByProduct = new Map<string, ProductImage[]>();
    (allImages || []).forEach((img: any) => {
      const pImages = imagesByProduct.get(img.product_id) || [];
      pImages.push({
        id: img.id,
        tenantId: img.tenant_id,
        productId: img.product_id,
        storagePath: img.storage_path,
        publicUrl: img.public_url,
        altText: img.alt_text || null,
        position: img.position || 0,
        isPrimary: !!img.is_primary,
        createdAt: img.created_at,
      });
      imagesByProduct.set(img.product_id, pImages);
    });

    const variantsByProduct = new Map<string, ProductVariant[]>();
    (allVariants || []).forEach((v: any) => {
      const pVariants = variantsByProduct.get(v.product_id) || [];
      pVariants.push({
        id: v.id,
        tenantId: v.tenant_id,
        productId: v.product_id,
        name: v.name,
        sku: v.sku || null,
        price: v.price !== null ? Number(v.price) : null,
        promotionalPrice: v.promotional_price !== null ? Number(v.promotional_price) : null,
        trackStock: !!v.track_stock,
        stockQuantity: Number(v.stock_quantity || 0),
        isActive: v.is_active !== false,
        position: v.position || 0,
        createdAt: v.created_at,
        updatedAt: v.updated_at,
      });
      variantsByProduct.set(v.product_id, pVariants);
    });

    return list.map((p: any) => {
      const pImages = (imagesByProduct.get(p.id) || []).sort(
        (a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || a.position - b.position
      );
      const primary = pImages.find((img) => img.isPrimary) || pImages[0] || null;
      const pVariants = (variantsByProduct.get(p.id) || []).sort((a, b) => a.position - b.position);

      return {
        id: p.id,
        tenantId: p.tenant_id,
        categoryId: p.category_id || null,
        category: p.category_id ? categoryMap.get(p.category_id) || null : null,
        name: p.name,
        slug: p.slug,
        shortDescription: p.short_description || null,
        description: p.description || null,
        sku: p.sku || null,
        barcode: p.barcode || null,
        price: p.price !== null ? Number(p.price) : null,
        promotionalPrice: p.promotional_price !== null ? Number(p.promotional_price) : null,
        priceOnRequest: !!p.price_on_request,
        isActive: p.is_active !== false,
        isFeatured: !!p.is_featured,
        trackStock: !!p.track_stock,
        stockQuantity: Number(p.stock_quantity || 0),
        allowOutOfStock: p.allow_out_of_stock !== false,
        position: p.position || 0,
        images: pImages,
        primaryImage: primary,
        variants: pVariants,
        availabilityDays: p.availability_days
          ? {
              sameChannels: p.availability_days.sameChannels !== false,
              tableDays: Array.isArray(p.availability_days.tableDays)
                ? p.availability_days.tableDays
                : ALL_DAYS_OF_WEEK,
              deliveryDays: Array.isArray(p.availability_days.deliveryDays)
                ? p.availability_days.deliveryDays
                : ALL_DAYS_OF_WEEK,
            }
          : null,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      };
    });
  }

  public async getProductById(id: string, tenantId: string): Promise<Product | null> {
    const list = await this.listProducts(tenantId);
    return list.find((p) => p.id === id) || null;
  }

  public async createProduct(
    tenantId: string,
    payload: {
      name: string;
      categoryId?: string | null;
      shortDescription?: string;
      description?: string;
      sku?: string;
      barcode?: string;
      price?: number | null;
      promotionalPrice?: number | null;
      priceOnRequest?: boolean;
      isActive?: boolean;
      isFeatured?: boolean;
      trackStock?: boolean;
      stockQuantity?: number;
      allowOutOfStock?: boolean;
      availabilityDays?: ProductAvailabilityConfig | null;
      images?: Array<{ publicUrl: string; storagePath?: string; altText?: string; isPrimary?: boolean }>;
      variants?: Array<{
        name: string;
        sku?: string;
        price?: number | null;
        promotionalPrice?: number | null;
        trackStock?: boolean;
        stockQuantity?: number;
        isActive?: boolean;
      }>;
    },
    actor: User
  ): Promise<Product> {
    if (!payload.name || payload.name.trim().length === 0) {
      throw new Error('O nome do produto é obrigatório.');
    }

    const priceOnRequest = !!payload.priceOnRequest;
    const parsedPrice = priceOnRequest ? null : parseCurrency(payload.price);
    const parsedPromoPrice = priceOnRequest ? null : parseCurrency(payload.promotionalPrice);

    if (!priceOnRequest) {
      if (parsedPrice === null || parsedPrice < 0) {
        throw new Error('Preço do produto deve ser maior ou igual a zero (ou marque "Consultar Preço").');
      }
      if (parsedPromoPrice !== null && parsedPromoPrice < 0) {
        throw new Error('Preço promocional não pode ser negativo.');
      }
    }

    // Generate unique slug for tenant
    const baseSlug = slugify(payload.name);
    let finalSlug = baseSlug;
    let counter = 1;

    while (true) {
      const { data: existing } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('slug', finalSlug)
        .single();

      if (!existing) break;
      finalSlug = `${baseSlug}-${counter++}`;
    }

    const { data: allProds } = await supabaseAdmin
      .from('products')
      .select('position')
      .eq('tenant_id', tenantId);

    const position = allProds?.length || 0;
    const now = new Date().toISOString();
    const productId = crypto.randomUUID();

    const validCategoryId = payload.categoryId && UUID_REGEX.test(payload.categoryId)
      ? payload.categoryId
      : null;

    const availabilityConfig = payload.availabilityDays
      ? {
          sameChannels: payload.availabilityDays.sameChannels !== false,
          tableDays: Array.isArray(payload.availabilityDays.tableDays)
            ? payload.availabilityDays.tableDays
            : ALL_DAYS_OF_WEEK,
          deliveryDays: Array.isArray(payload.availabilityDays.deliveryDays)
            ? payload.availabilityDays.deliveryDays
            : ALL_DAYS_OF_WEEK,
        }
      : {
          sameChannels: true,
          tableDays: ALL_DAYS_OF_WEEK,
          deliveryDays: ALL_DAYS_OF_WEEK,
        };

    const newProd = {
      id: productId,
      tenant_id: tenantId,
      category_id: validCategoryId,
      name: payload.name.trim(),
      slug: finalSlug,
      short_description: payload.shortDescription?.trim() || null,
      description: payload.description?.trim() || null,
      sku: payload.sku?.trim() || null,
      barcode: payload.barcode?.trim() || null,
      price: priceOnRequest ? null : parsedPrice,
      promotional_price: priceOnRequest ? null : parsedPromoPrice,
      price_on_request: priceOnRequest,
      is_active: payload.isActive !== false,
      is_featured: !!payload.isFeatured,
      track_stock: !!payload.trackStock,
      stock_quantity: payload.trackStock ? Number(payload.stockQuantity || 0) : 0,
      allow_out_of_stock: payload.allowOutOfStock !== false,
      availability_days: availabilityConfig,
      position,
      created_at: now,
      updated_at: now,
    };

    await supabaseAdmin.from('products').insert(newProd);

    // Save images if supplied
    if (payload.images && payload.images.length > 0) {
      for (let i = 0; i < payload.images.length; i++) {
        const img = payload.images[i];
        await supabaseAdmin.from('product_images').insert({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          product_id: productId,
          storage_path: img.storagePath || `${tenantId}/products/${productId}/img-${i}.jpg`,
          public_url: img.publicUrl,
          alt_text: img.altText || payload.name,
          position: i,
          is_primary: i === 0 || !!img.isPrimary,
          created_at: now,
        });
      }
    }

    // Save variants if supplied
    if (payload.variants && payload.variants.length > 0) {
      for (let i = 0; i < payload.variants.length; i++) {
        const v = payload.variants[i];
        const vPrice = parseCurrency(v.price);
        const vPromo = parseCurrency(v.promotionalPrice ?? (v as any).promotional_price);
        await supabaseAdmin.from('product_variants').insert({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          product_id: productId,
          name: v.name.trim(),
          sku: v.sku?.trim() || null,
          price: vPrice,
          promotional_price: vPromo,
          track_stock: !!(v.trackStock ?? (v as any).track_stock),
          stock_quantity: (v.trackStock ?? (v as any).track_stock) ? Number(v.stockQuantity ?? (v as any).stock_quantity ?? 0) : 0,
          is_active: (v.isActive ?? (v as any).is_active) !== false,
          position: i,
          created_at: now,
          updated_at: now,
        });
      }
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'PRODUCT_CREATE' as any,
      entity: 'products',
      entityId: productId,
      metadata: { name: newProd.name, price: newProd.price, priceOnRequest },
    });

    const created = await this.getProductById(productId, tenantId);
    return created!;
  }

  public async updateProduct(
    id: string,
    tenantId: string,
    payload: {
      name?: string;
      categoryId?: string | null;
      shortDescription?: string;
      description?: string;
      sku?: string;
      barcode?: string;
      price?: number | null;
      promotionalPrice?: number | null;
      priceOnRequest?: boolean;
      isActive?: boolean;
      isFeatured?: boolean;
      trackStock?: boolean;
      stockQuantity?: number;
      allowOutOfStock?: boolean;
      position?: number;
      availabilityDays?: ProductAvailabilityConfig | null;
      images?: Array<{ id?: string; publicUrl: string; storagePath?: string; altText?: string; isPrimary?: boolean }>;
      variants?: Array<{
        id?: string;
        name: string;
        sku?: string;
        price?: number | null;
        promotionalPrice?: number | null;
        trackStock?: boolean;
        stockQuantity?: number;
        isActive?: boolean;
      }>;
    },
    actor: User
  ): Promise<Product> {
    const existing = await this.getProductById(id, tenantId);
    if (!existing) {
      throw new Error('Produto não encontrado.');
    }

    const patch: any = {};
    if (payload.name && payload.name.trim() !== existing.name) {
      patch.name = payload.name.trim();
      const baseSlug = slugify(payload.name);
      let finalSlug = baseSlug;
      let counter = 1;

      while (true) {
        const { data: dup } = await supabaseAdmin
          .from('products')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('slug', finalSlug)
          .neq('id', id)
          .single();

        if (!dup) break;
        finalSlug = `${baseSlug}-${counter++}`;
      }
      patch.slug = finalSlug;
    }

    if (payload.categoryId !== undefined) {
      patch.category_id = payload.categoryId && UUID_REGEX.test(payload.categoryId)
        ? payload.categoryId
        : null;
    }
    if (payload.shortDescription !== undefined) patch.short_description = payload.shortDescription?.trim() || null;
    if (payload.description !== undefined) patch.description = payload.description?.trim() || null;
    if (payload.sku !== undefined) patch.sku = payload.sku?.trim() || null;
    if (payload.barcode !== undefined) patch.barcode = payload.barcode?.trim() || null;

    if (payload.priceOnRequest !== undefined) {
      patch.price_on_request = payload.priceOnRequest;
      if (payload.priceOnRequest) {
        patch.price = null;
        patch.promotional_price = null;
      }
    }

    if (!patch.price_on_request && !existing.priceOnRequest) {
      if (payload.price !== undefined) {
        const p = parseCurrency(payload.price);
        if (p !== null && p < 0) throw new Error('Preço não pode ser negativo.');
        patch.price = p;
      }
      if (payload.promotionalPrice !== undefined) {
        const pp = parseCurrency(payload.promotionalPrice);
        if (pp !== null && pp < 0) throw new Error('Preço promocional não pode ser negativo.');
        patch.promotional_price = pp;
      }
    }

    if (payload.isActive !== undefined) patch.is_active = payload.isActive;
    if (payload.isFeatured !== undefined) patch.is_featured = payload.isFeatured;
    if (payload.trackStock !== undefined) patch.track_stock = payload.trackStock;
    if (payload.stockQuantity !== undefined) patch.stock_quantity = Math.max(0, Number(payload.stockQuantity || 0));
    if (payload.allowOutOfStock !== undefined) patch.allow_out_of_stock = payload.allowOutOfStock;
    if (payload.position !== undefined) patch.position = payload.position;

    if (payload.availabilityDays !== undefined) {
      if (payload.availabilityDays === null) {
        patch.availability_days = null;
      } else {
        patch.availability_days = {
          sameChannels: payload.availabilityDays.sameChannels !== false,
          tableDays: Array.isArray(payload.availabilityDays.tableDays)
            ? payload.availabilityDays.tableDays
            : ALL_DAYS_OF_WEEK,
          deliveryDays: Array.isArray(payload.availabilityDays.deliveryDays)
            ? payload.availabilityDays.deliveryDays
            : ALL_DAYS_OF_WEEK,
        };
      }
    }

    patch.updated_at = new Date().toISOString();

    await supabaseAdmin
      .from('products')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId);

    // Update images if sent
    if (payload.images !== undefined) {
      // Delete old images
      await supabaseAdmin.from('product_images').delete().eq('product_id', id).eq('tenant_id', tenantId);
      for (let i = 0; i < payload.images.length; i++) {
        const img = payload.images[i];
        await supabaseAdmin.from('product_images').insert({
          id: img.id || crypto.randomUUID(),
          tenant_id: tenantId,
          product_id: id,
          storage_path: img.storagePath || `${tenantId}/products/${id}/img-${i}.jpg`,
          public_url: img.publicUrl,
          alt_text: img.altText || patch.name || existing.name,
          position: i,
          is_primary: i === 0 || !!img.isPrimary,
          created_at: new Date().toISOString(),
        });
      }
    }

    // Update variants if sent
    if (payload.variants !== undefined) {
      await supabaseAdmin.from('product_variants').delete().eq('product_id', id).eq('tenant_id', tenantId);
      for (let i = 0; i < payload.variants.length; i++) {
        const v = payload.variants[i];
        await supabaseAdmin.from('product_variants').insert({
          id: v.id || crypto.randomUUID(),
          tenant_id: tenantId,
          product_id: id,
          name: v.name.trim(),
          sku: v.sku?.trim() || null,
          price: v.price !== undefined && v.price !== null ? Number(v.price) : null,
          promotional_price: v.promotionalPrice !== undefined && v.promotionalPrice !== null ? Number(v.promotionalPrice) : null,
          track_stock: !!(v.trackStock ?? (v as any).track_stock),
          stock_quantity: (v.trackStock ?? (v as any).track_stock) ? Number(v.stockQuantity ?? (v as any).stock_quantity ?? 0) : 0,
          is_active: (v.isActive ?? (v as any).is_active) !== false,
          position: i,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'PRODUCT_UPDATE' as any,
      entity: 'products',
      entityId: id,
      metadata: patch,
    });

    const updated = await this.getProductById(id, tenantId);
    return updated!;
  }

  public async duplicateProduct(id: string, tenantId: string, actor: User): Promise<Product> {
    const original = await this.getProductById(id, tenantId);
    if (!original) {
      throw new Error('Produto a duplicar não encontrado.');
    }

    const newName = `${original.name} (Cópia)`;
    const duplicated = await this.createProduct(
      tenantId,
      {
        name: newName,
        categoryId: original.categoryId,
        shortDescription: original.shortDescription || undefined,
        description: original.description || undefined,
        sku: original.sku ? `${original.sku}-COPY` : undefined,
        barcode: undefined,
        price: original.price,
        promotionalPrice: original.promotionalPrice,
        priceOnRequest: original.priceOnRequest,
        isActive: false, // duplicados começam como inativos por padrão
        isFeatured: original.isFeatured,
        trackStock: original.trackStock,
        stockQuantity: original.stockQuantity,
        allowOutOfStock: original.allowOutOfStock,
        images: original.images.map((img) => ({
          publicUrl: img.publicUrl,
          storagePath: img.storagePath,
          altText: img.altText || undefined,
          isPrimary: img.isPrimary,
        })),
        variants: original.variants.map((v) => ({
          name: v.name,
          sku: v.sku ? `${v.sku}-COPY` : undefined,
          price: v.price,
          promotionalPrice: v.promotionalPrice,
          trackStock: v.trackStock,
          stockQuantity: v.stockQuantity,
          isActive: v.isActive,
        })),
        availabilityDays: original.availabilityDays
          ? {
              sameChannels: original.availabilityDays.sameChannels,
              tableDays: [...original.availabilityDays.tableDays],
              deliveryDays: [...original.availabilityDays.deliveryDays],
            }
          : undefined,
      },
      actor
    );

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'PRODUCT_DUPLICATE' as any,
      entity: 'products',
      entityId: duplicated.id,
      metadata: { originalId: id, duplicatedName: newName },
    });

    return duplicated;
  }

  public async toggleProductStatus(id: string, tenantId: string, isActive: boolean, actor: User): Promise<Product> {
    const existing = await this.getProductById(id, tenantId);
    if (!existing) {
      throw new Error('Produto não encontrado.');
    }

    const now = new Date().toISOString();
    await supabaseAdmin
      .from('products')
      .update({ is_active: isActive, updated_at: now })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'PRODUCT_STATUS_CHANGE' as any,
      entity: 'products',
      entityId: id,
      metadata: { oldStatus: existing.isActive, newStatus: isActive },
    });

    const updated = await this.getProductById(id, tenantId);
    return updated!;
  }

  public async deleteProduct(id: string, tenantId: string, actor: User): Promise<boolean> {
    const existing = await this.getProductById(id, tenantId);
    if (!existing) {
      throw new Error('Produto não encontrado.');
    }

    // 1. Attempt to delete product record first BEFORE deleting images or variants.
    // This prevents the bug where images were deleted first but product deletion failed due to FK constraints.
    const { error: deleteError } = await supabaseAdmin
      .from('products')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (deleteError) {
      if (
        deleteError.code === '23503' ||
        deleteError.message?.includes('violates foreign key constraint') ||
        deleteError.message?.includes('RESTRICT') ||
        deleteError.details?.includes('is still referenced')
      ) {
        throw new Error(
          'Este produto possui pedidos, comandas ou registros históricos associados e não pode ser excluído. Recomendamos inativar o produto para ocultá-lo do catálogo.'
        );
      }
      throw new Error(`Erro ao excluir produto: ${deleteError.message}`);
    }

    // 2. Clean up variants and images if not cascaded
    await supabaseAdmin.from('product_variants').delete().eq('product_id', id).eq('tenant_id', tenantId);
    await supabaseAdmin.from('product_images').delete().eq('product_id', id).eq('tenant_id', tenantId);

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'PRODUCT_DELETE' as any,
      entity: 'products',
      entityId: id,
      metadata: { deletedName: existing.name },
    });

    return true;
  }

  // ==========================================
  // IMAGE HELPERS
  // ==========================================

  public async addProductImage(
    productId: string,
    tenantId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    isPrimary: boolean,
    actor: User
  ): Promise<ProductImage> {
    const existing = await this.getProductById(productId, tenantId);
    if (!existing) {
      throw new Error('Produto não encontrado.');
    }

    // Upload to Supabase Storage via storageService
    const publicUrl = await storageService.uploadFile(
      fileBuffer,
      originalName,
      mimeType,
      `${tenantId}/products/${productId}`
    );

    const now = new Date().toISOString();
    const imageId = crypto.randomUUID();

    // If this image is primary, remove primary status from existing images
    if (isPrimary || existing.images.length === 0) {
      await supabaseAdmin
        .from('product_images')
        .update({ is_primary: false })
        .eq('product_id', productId)
        .eq('tenant_id', tenantId);
    }

    const newImage = {
      id: imageId,
      tenant_id: tenantId,
      product_id: productId,
      storage_path: `${tenantId}/products/${productId}/${originalName}`,
      public_url: publicUrl,
      alt_text: existing.name,
      position: existing.images.length,
      is_primary: isPrimary || existing.images.length === 0,
      created_at: now,
    };

    await supabaseAdmin.from('product_images').insert(newImage);

    return {
      id: newImage.id,
      tenantId: newImage.tenant_id,
      productId: newImage.product_id,
      storagePath: newImage.storage_path,
      publicUrl: newImage.public_url,
      altText: newImage.alt_text,
      position: newImage.position,
      isPrimary: newImage.is_primary,
      createdAt: newImage.created_at,
    };
  }

  public async setPrimaryImage(productId: string, imageId: string, tenantId: string): Promise<void> {
    // Demote all
    await supabaseAdmin
      .from('product_images')
      .update({ is_primary: false })
      .eq('product_id', productId)
      .eq('tenant_id', tenantId);

    // Promote target
    await supabaseAdmin
      .from('product_images')
      .update({ is_primary: true })
      .eq('id', imageId)
      .eq('product_id', productId)
      .eq('tenant_id', tenantId);
  }

  public async deleteProductImage(productId: string, imageId: string, tenantId: string): Promise<void> {
    await supabaseAdmin
      .from('product_images')
      .delete()
      .eq('id', imageId)
      .eq('product_id', productId)
      .eq('tenant_id', tenantId);
  }

  // ==========================================
  // PUBLIC LIVE CATALOG (NOT SNAPSHOT FROZEN)
  // ==========================================

  public async getPublicCatalog(
    tenantSlug: string,
    options?: {
      categoryId?: string;
      search?: string;
      featuredOnly?: boolean;
      sort?: string;
      limit?: number;
      channel?: 'table' | 'delivery';
      dayOfWeek?: DayOfWeek;
    }
  ): Promise<PublicCatalogResponse> {
    const tenant = await repo.getTenantBySlug(tenantSlug);
    if (!tenant) {
      throw new Error(`Estabelecimento não encontrado para o endereço "${tenantSlug}".`);
    }

    // 1. Verify tenant can operate
    const op = canTenantOperate(tenant.status);
    if (!op.canOperate) {
      throw new Error(op.blockedReason || 'Este estabelecimento não está disponível no momento.');
    }

    // 2. Verify tenant has 'products' feature active
    const features = await repo.resolveTenantFeatures(tenant.id);
    if (!features.products) {
      throw new Error('O módulo de catálogo de produtos não está ativo para este estabelecimento.');
    }

    // 3. Fetch active categories
    const allCategories = await this.listCategories(tenant.id);
    const activeCategories = allCategories.filter((c) => c.isActive);

    // 4. Fetch only active products
    const products = await this.listProducts(tenant.id, {
      isActive: true,
      categoryId: options?.categoryId,
      isFeatured: options?.featuredOnly,
      search: options?.search,
      sort: (options?.sort as any) || 'manual',
    });

    // 5. Filter by channel and day of the week
    const targetChannel = options?.channel || 'delivery';
    const targetDay = options?.dayOfWeek !== undefined ? options.dayOfWeek : getCurrentDayOfWeek();
    const availableProducts = products.filter((p) => isProductAvailableOnDay(p, targetDay, targetChannel));

    const limited = options?.limit ? availableProducts.slice(0, options.limit) : availableProducts;

    return {
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        whatsapp: tenant.whatsapp,
        phone: tenant.phone,
      },
      categories: activeCategories,
      products: limited,
      total: availableProducts.length,
    };
  }

  // Super Admin stats summary
  public async getTenantProductsSummary(tenantId: string): Promise<{
    totalProducts: number;
    activeProducts: number;
    outOfStockProducts: number;
    categoriesCount: number;
  }> {
    const products = await this.listProducts(tenantId);
    const categories = await this.listCategories(tenantId);

    const active = products.filter((p) => p.isActive).length;
    const outOfStock = products.filter((p) => p.trackStock && p.stockQuantity <= 0 && !p.allowOutOfStock).length;

    return {
      totalProducts: products.length,
      activeProducts: active,
      outOfStockProducts: outOfStock,
      categoriesCount: categories.length,
    };
  }
}

export const productRepo = new ProductRepository();
