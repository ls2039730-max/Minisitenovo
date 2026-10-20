import crypto from 'crypto';
import { supabaseAdmin } from '../supabaseAdmin.js';
import { repo } from './repository.js';
import { canTenantOperate } from '../tenantResolver.js';
import { User } from '../../src/types/saas.js';
import {
  Order,
  OrderItem,
  OrderStatus,
  OrderDeliveryAddress,
  DeliverySettings,
  DeliveryRule,
  PaymentMethodConfig,
  ValidatedCartResponse,
  ValidatedCartItem,
  CartItemInput,
  CreateOrderPayload,
  OrderFilterParams,
  OrdersSummary,
} from '../../src/types/order.js';
import { calculateDeliveryFee } from '../../src/utils/deliveryFeeCalculator.js';
import { buildWhatsAppOrderMessage, buildWhatsAppUrl } from '../../src/utils/whatsappMessageBuilder.js';
import {
  isProductAvailableOnDay,
  getCurrentDayOfWeek,
  getDayName,
} from '../../src/utils/productAvailability.js';
import { calculateScheduleStatus } from '../../src/utils/businessHours.js';

// Rate limiting and idempotency memory storage
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitEntry>();

export class OrderRepository {
  // ==========================================
  // 1. DELIVERY SETTINGS & RULES
  // ==========================================

  public async getDeliverySettings(tenantId: string): Promise<DeliverySettings> {
    const { data } = await supabaseAdmin
      .from('delivery_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (data) {
      return {
        tenantId: data.tenant_id,
        ordersEnabled: data.orders_enabled !== false,
        acceptOrdersWhenClosed: data.accept_orders_when_closed !== false,
        pickupEnabled: data.pickup_enabled !== false,
        deliveryEnabled: data.delivery_enabled !== false,
        minimumOrder: Number(data.minimum_order || 0),
        freeDeliveryAbove: data.free_delivery_above !== null && data.free_delivery_above !== undefined ? Number(data.free_delivery_above) : null,
        pickupInstructions: data.pickup_instructions || 'Retire no balcão apresentando o número do pedido.',
        deliveryEstimateText: data.delivery_estimate_text || '40 a 60 minutos',
        orderWhatsappNumber: data.order_whatsapp_number || null,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }

    // Default configuration if not yet created in table
    const now = new Date().toISOString();
    const defaultSettings: DeliverySettings = {
      tenantId,
      ordersEnabled: true,
      acceptOrdersWhenClosed: true,
      pickupEnabled: true,
      deliveryEnabled: true,
      minimumOrder: 0,
      freeDeliveryAbove: null,
      pickupInstructions: 'Retire no balcão apresentando o número do pedido.',
      deliveryEstimateText: '40 a 60 minutos',
      orderWhatsappNumber: null,
      createdAt: now,
      updatedAt: now,
    };

    await supabaseAdmin.from('delivery_settings').insert({
      tenant_id: tenantId,
      orders_enabled: true,
      accept_orders_when_closed: true,
      pickup_enabled: true,
      delivery_enabled: true,
      minimum_order: 0,
      free_delivery_above: null,
      pickup_instructions: defaultSettings.pickupInstructions,
      delivery_estimate_text: defaultSettings.deliveryEstimateText,
      order_whatsapp_number: null,
      created_at: now,
      updated_at: now,
    });

    return defaultSettings;
  }

  public async updateDeliverySettings(
    tenantId: string,
    payload: Partial<DeliverySettings>,
    actor: User
  ): Promise<DeliverySettings> {
    const existing = await this.getDeliverySettings(tenantId);
    const now = new Date().toISOString();

    const updateData: any = {
      updated_at: now,
    };

    if (payload.ordersEnabled !== undefined) updateData.orders_enabled = !!payload.ordersEnabled;
    if (payload.acceptOrdersWhenClosed !== undefined) updateData.accept_orders_when_closed = !!payload.acceptOrdersWhenClosed;
    if (payload.pickupEnabled !== undefined) updateData.pickup_enabled = !!payload.pickupEnabled;
    if (payload.deliveryEnabled !== undefined) updateData.delivery_enabled = !!payload.deliveryEnabled;
    if (payload.minimumOrder !== undefined) updateData.minimum_order = Math.max(0, Number(payload.minimumOrder || 0));
    if (payload.freeDeliveryAbove !== undefined) {
      updateData.free_delivery_above = payload.freeDeliveryAbove !== null ? Math.max(0, Number(payload.freeDeliveryAbove)) : null;
    }
    if (payload.pickupInstructions !== undefined) updateData.pickup_instructions = payload.pickupInstructions?.trim() || null;
    if (payload.deliveryEstimateText !== undefined) updateData.delivery_estimate_text = payload.deliveryEstimateText?.trim() || null;
    if (payload.orderWhatsappNumber !== undefined) updateData.order_whatsapp_number = payload.orderWhatsappNumber?.replace(/\D/g, '') || null;

    await supabaseAdmin
      .from('delivery_settings')
      .update(updateData)
      .eq('tenant_id', tenantId);

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'DELIVERY_SETTINGS_UPDATE' as any,
      entity: 'delivery_settings',
      entityId: tenantId,
      diff: { before: existing, after: { ...existing, ...payload } },
    });

    return this.getDeliverySettings(tenantId);
  }

  public async listDeliveryRules(tenantId: string): Promise<DeliveryRule[]> {
    const { data } = await supabaseAdmin
      .from('delivery_rules')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('position', { ascending: true });

    return (data || []).map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      type: r.type,
      name: r.name,
      neighborhood: r.neighborhood || null,
      cepStart: r.cep_start || null,
      cepEnd: r.cep_end || null,
      fee: Number(r.fee || 0),
      minimumOrder: r.minimum_order !== null && r.minimum_order !== undefined ? Number(r.minimum_order) : null,
      isActive: r.is_active !== false,
      position: r.position || 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  public async createDeliveryRule(
    tenantId: string,
    payload: {
      type: 'fixed' | 'neighborhood' | 'cep_range';
      name: string;
      neighborhood?: string;
      cepStart?: string;
      cepEnd?: string;
      fee: number;
      minimumOrder?: number | null;
      isActive?: boolean;
    },
    actor: User
  ): Promise<DeliveryRule> {
    const now = new Date().toISOString();
    const rules = await this.listDeliveryRules(tenantId);
    const newId = crypto.randomUUID();

    const insertData = {
      id: newId,
      tenant_id: tenantId,
      type: payload.type,
      name: payload.name.trim(),
      neighborhood: payload.neighborhood?.trim() || null,
      cep_start: payload.cepStart ? payload.cepStart.replace(/\D/g, '') : null,
      cep_end: payload.cepEnd ? payload.cepEnd.replace(/\D/g, '') : null,
      fee: Math.max(0, Number(payload.fee || 0)),
      minimum_order: payload.minimumOrder !== null && payload.minimumOrder !== undefined ? Math.max(0, Number(payload.minimumOrder)) : null,
      is_active: payload.isActive !== false,
      position: rules.length,
      created_at: now,
      updated_at: now,
    };

    await supabaseAdmin.from('delivery_rules').insert(insertData);

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'DELIVERY_RULE_CREATE' as any,
      entity: 'delivery_rules',
      entityId: newId,
      diff: { created: insertData },
    });

    return {
      id: newId,
      tenantId,
      type: payload.type,
      name: payload.name.trim(),
      neighborhood: insertData.neighborhood,
      cepStart: insertData.cep_start,
      cepEnd: insertData.cep_end,
      fee: insertData.fee,
      minimumOrder: insertData.minimum_order,
      isActive: insertData.is_active,
      position: insertData.position,
      createdAt: now,
      updatedAt: now,
    };
  }

  public async updateDeliveryRule(
    tenantId: string,
    ruleId: string,
    payload: Partial<DeliveryRule>,
    actor: User
  ): Promise<DeliveryRule> {
    const rules = await this.listDeliveryRules(tenantId);
    const existing = rules.find((r) => r.id === ruleId);
    if (!existing) {
      throw new Error('Regra de entrega não encontrada.');
    }

    const now = new Date().toISOString();
    const updateData: any = { updated_at: now };

    if (payload.name !== undefined) updateData.name = payload.name.trim();
    if (payload.type !== undefined) updateData.type = payload.type;
    if (payload.neighborhood !== undefined) updateData.neighborhood = payload.neighborhood?.trim() || null;
    if (payload.cepStart !== undefined) updateData.cep_start = payload.cepStart ? payload.cepStart.replace(/\D/g, '') : null;
    if (payload.cepEnd !== undefined) updateData.cep_end = payload.cepEnd ? payload.cepEnd.replace(/\D/g, '') : null;
    if (payload.fee !== undefined) updateData.fee = Math.max(0, Number(payload.fee));
    if (payload.minimumOrder !== undefined) {
      updateData.minimum_order = payload.minimumOrder !== null ? Math.max(0, Number(payload.minimumOrder)) : null;
    }
    if (payload.isActive !== undefined) updateData.is_active = !!payload.isActive;

    await supabaseAdmin.from('delivery_rules').update(updateData).eq('id', ruleId).eq('tenant_id', tenantId);

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'DELIVERY_RULE_UPDATE' as any,
      entity: 'delivery_rules',
      entityId: ruleId,
      diff: { before: existing, after: { ...existing, ...payload } },
    });

    const updatedList = await this.listDeliveryRules(tenantId);
    return updatedList.find((r) => r.id === ruleId)!;
  }

  public async deleteDeliveryRule(tenantId: string, ruleId: string, actor: User): Promise<boolean> {
    const rules = await this.listDeliveryRules(tenantId);
    const existing = rules.find((r) => r.id === ruleId);
    if (!existing) return false;

    await supabaseAdmin.from('delivery_rules').delete().eq('id', ruleId).eq('tenant_id', tenantId);

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'DELIVERY_RULE_DELETE' as any,
      entity: 'delivery_rules',
      entityId: ruleId,
      diff: { deleted: existing },
    });

    return true;
  }

  public async reorderDeliveryRules(tenantId: string, ruleIds: string[], actor: User): Promise<void> {
    for (let i = 0; i < ruleIds.length; i++) {
      await supabaseAdmin
        .from('delivery_rules')
        .update({ position: i, updated_at: new Date().toISOString() })
        .eq('id', ruleIds[i])
        .eq('tenant_id', tenantId);
    }
  }

  // ==========================================
  // 2. PAYMENT METHODS
  // ==========================================

  public async listPaymentMethods(tenantId: string): Promise<PaymentMethodConfig[]> {
    const { data } = await supabaseAdmin
      .from('payment_methods')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('position', { ascending: true });

    if (data && data.length > 0) {
      return data.map((pm: any) => ({
        id: pm.id,
        tenantId: pm.tenant_id,
        type: pm.type,
        label: pm.label,
        isActive: pm.is_active !== false,
        position: pm.position || 0,
        createdAt: pm.created_at,
        updatedAt: pm.updated_at,
      }));
    }

    // Default payment methods if none initialized
    const now = new Date().toISOString();
    const defaults: Array<{ type: any; label: string }> = [
      { type: 'PIX', label: 'PIX (pagamento direto)' },
      { type: 'CASH', label: 'Dinheiro' },
      { type: 'CREDIT_CARD_ON_DELIVERY', label: 'Cartão de Crédito' },
      { type: 'DEBIT_CARD_ON_DELIVERY', label: 'Cartão de Débito' },
      { type: 'PAYMENT_ON_PICKUP', label: 'Pagar no balcão' },
    ];

    const created: PaymentMethodConfig[] = [];
    for (let i = 0; i < defaults.length; i++) {
      const id = crypto.randomUUID();
      const rec = {
        id,
        tenant_id: tenantId,
        type: defaults[i].type,
        label: defaults[i].label,
        is_active: true,
        position: i,
        created_at: now,
        updated_at: now,
      };
      await supabaseAdmin.from('payment_methods').insert(rec);
      created.push({
        id,
        tenantId,
        type: defaults[i].type,
        label: defaults[i].label,
        isActive: true,
        position: i,
        createdAt: now,
        updatedAt: now,
      });
    }

    return created;
  }

  public async updatePaymentMethod(
    tenantId: string,
    methodId: string,
    payload: { isActive?: boolean; label?: string },
    actor: User
  ): Promise<PaymentMethodConfig> {
    const methods = await this.listPaymentMethods(tenantId);
    const existing = methods.find((m) => m.id === methodId);
    if (!existing) {
      throw new Error('Forma de pagamento não encontrada.');
    }

    const updateData: any = { updated_at: new Date().toISOString() };
    if (payload.isActive !== undefined) updateData.is_active = !!payload.isActive;
    if (payload.label !== undefined) updateData.label = payload.label.trim();

    await supabaseAdmin.from('payment_methods').update(updateData).eq('id', methodId).eq('tenant_id', tenantId);

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'PAYMENT_METHOD_UPDATE' as any,
      entity: 'payment_methods',
      entityId: methodId,
      diff: { before: existing, after: { ...existing, ...payload } },
    });

    const updatedList = await this.listPaymentMethods(tenantId);
    return updatedList.find((m) => m.id === methodId)!;
  }

  // ==========================================
  // 3. CART VALIDATION & SYNCHRONIZATION (PUBLIC)
  // ==========================================

  public async validateCart(tenantSlug: string, items: CartItemInput[]): Promise<ValidatedCartResponse> {
    const tenant = await repo.getTenantBySlug(tenantSlug);
    if (!tenant) {
      throw new Error(`Estabelecimento "${tenantSlug}" não encontrado.`);
    }

    const op = canTenantOperate(tenant.status);
    if (!op.canOperate) {
      throw new Error(op.blockedReason || 'Este estabelecimento não está disponível no momento.');
    }

    const features = await repo.resolveTenantFeatures(tenant.id);
    if (!features.products) {
      throw new Error('O catálogo de produtos não está ativo para este estabelecimento.');
    }
    if (!features.shopping_cart) {
      throw new Error('O carrinho de compras não está habilitado para este estabelecimento.');
    }

    const [deliverySettings, deliveryRules, paymentMethods] = await Promise.all([
      this.getDeliverySettings(tenant.id),
      this.listDeliveryRules(tenant.id),
      this.listPaymentMethods(tenant.id),
    ]);

    // Check store open status from business hours if site is published
    const { data: rawSite } = await supabaseAdmin.from('sites').select('*').eq('tenant_id', tenant.id).single();
    let isOpen = true;
    let closedNotice = '';

    if (rawSite && rawSite.published_data?.sections) {
      const hoursSection = rawSite.published_data.sections.find((s: any) => s.type === 'business_hours');
      if (hoursSection?.settings?.schedule) {
        const scheduleStatus = calculateScheduleStatus(hoursSection.settings.schedule);
        isOpen = scheduleStatus.isOpen;
      }
    }

    if (!isOpen) {
      closedNotice = deliverySettings.acceptOrdersWhenClosed
        ? 'Estamos fechados no momento. Seu pedido será recebido e atendido assim que abrirmos!'
        : 'Estamos fechados no momento e não estamos recebendo pedidos agora.';
    }

    const canAcceptOrders = deliverySettings.ordersEnabled && (isOpen || deliverySettings.acceptOrdersWhenClosed);

    const validatedItems: ValidatedCartItem[] = [];
    const warnings: string[] = [];

    // Query all relevant products in batch
    const productIds = Array.from(new Set(items.map((i) => i.productId)));
    const { data: rawProducts } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('tenant_id', tenant.id)
      .in('id', productIds);

    const productMap = new Map<string, any>((rawProducts || []).map((p: any) => [p.id, p]));

    // Query images & variants
    const { data: allImages } = await supabaseAdmin
      .from('product_images')
      .select('*')
      .eq('tenant_id', tenant.id)
      .in('product_id', productIds);

    const { data: allVariants } = await supabaseAdmin
      .from('product_variants')
      .select('*')
      .eq('tenant_id', tenant.id)
      .in('product_id', productIds);

    const imagesByProduct = new Map<string, any[]>();
    (allImages || []).forEach((img: any) => {
      const list = imagesByProduct.get(img.product_id) || [];
      list.push(img);
      imagesByProduct.set(img.product_id, list);
    });

    const variantsById = new Map<string, any>();
    (allVariants || []).forEach((v: any) => variantsById.set(v.id, v));

    let subtotal = 0;
    let itemCount = 0;

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product || !product.is_active) {
        warnings.push(`O produto "${product?.name || 'selecionado'}" não está mais disponível.`);
        continue;
      }

      if (product.price_on_request) {
        warnings.push(`O produto "${product.name}" requer consulta de preço e não pode ser comprado no carrinho.`);
        continue;
      }

      // Check weekly availability for delivery
      const currentDay = getCurrentDayOfWeek();
      if (!isProductAvailableOnDay(product, currentDay, 'delivery')) {
        warnings.push(`O produto "${product.name}" não está disponível para pedidos delivery hoje (${getDayName(currentDay)}).`);
        continue;
      }

      let variant: any = null;
      if (item.variantId) {
        variant = variantsById.get(item.variantId);
        if (!variant || !variant.is_active || variant.product_id !== product.id) {
          warnings.push(`A opção selecionada para "${product.name}" não está mais disponível.`);
          continue;
        }
      }

      // Determine price
      const basePrice = variant?.price !== null && variant?.price !== undefined ? Number(variant.price) : Number(product.price);
      const promoPrice =
        variant?.promotional_price !== null && variant?.promotional_price !== undefined
          ? Number(variant.promotional_price)
          : product.promotional_price !== null && product.promotional_price !== undefined
          ? Number(product.promotional_price)
          : null;

      const hasDiscount = promoPrice !== null && promoPrice < basePrice;
      const unitPrice = hasDiscount && promoPrice !== null ? promoPrice : basePrice;

      // Stock validation
      const trackStock = variant ? !!variant.track_stock : !!product.track_stock;
      const allowOutOfStock = product.allow_out_of_stock !== false;
      const availableStock = variant ? Number(variant.stock_quantity || 0) : Number(product.stock_quantity || 0);

      let qty = Math.max(1, Math.min(99, Math.floor(Number(item.quantity || 1))));

      if (trackStock && !allowOutOfStock) {
        if (availableStock <= 0) {
          warnings.push(`O item "${product.name}" está esgotado no estoque.`);
          continue;
        }
        if (qty > availableStock) {
          warnings.push(`Quantidade de "${product.name}" ajustada de ${qty} para ${availableStock} (limite em estoque).`);
          qty = availableStock;
        }
      }

      const itemImages = imagesByProduct.get(product.id) || [];
      const primaryImg = itemImages.find((img) => img.is_primary) || itemImages[0];

      const itemSubtotal = Math.round(unitPrice * qty * 100) / 100;
      subtotal += itemSubtotal;
      itemCount += qty;

      validatedItems.push({
        id: `${item.productId}_${item.variantId || 'base'}`,
        productId: product.id,
        variantId: variant?.id || null,
        productName: product.name,
        variantName: variant?.name || null,
        imageUrl: primaryImg?.public_url || null,
        unitPrice,
        originalPrice: hasDiscount ? basePrice : null,
        hasDiscount,
        quantity: qty,
        subtotal: itemSubtotal,
        maxAvailableQuantity: trackStock && !allowOutOfStock ? availableStock : 99,
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;

    return {
      items: validatedItems,
      subtotal,
      itemCount,
      warnings,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        address: `${(tenant as any).street || ''}, ${(tenant as any).number || ''} - ${(tenant as any).neighborhood || ''}, ${(tenant as any).city || ''}/${(tenant as any).state || ''}`.replace(/^,\s*|\s*,\s*$/g, ''),
      },
      deliverySettings,
      deliveryRules,
      paymentMethods,
      isOpen,
      canAcceptOrders,
      closedNotice,
    };
  }

  // ==========================================
  // 4. ORDER CREATION (TRANSACTIONAL & SECURE)
  // ==========================================

  public async createOrder(
    tenantSlug: string,
    payload: CreateOrderPayload,
    clientIp: string = 'unknown'
  ): Promise<{ order: Order; whatsappUrl: string; message: string }> {
    // 1. Rate Limiting Check
    const rateKey = `${clientIp}_${payload.customerPhone || 'unknown'}`;
    const nowMs = Date.now();
    const rateEntry = rateLimitMap.get(rateKey) || { count: 0, resetAt: nowMs + 60000 };

    if (nowMs > rateEntry.resetAt) {
      rateEntry.count = 0;
      rateEntry.resetAt = nowMs + 60000;
    }

    rateEntry.count++;
    rateLimitMap.set(rateKey, rateEntry);

    if (rateEntry.count > 12) {
      throw new Error('Muitas tentativas em pouco tempo. Por favor, aguarde um instante antes de enviar novamente.');
    }

    // 2. Resolve Tenant & Feature Checks
    const tenant = await repo.getTenantBySlug(tenantSlug);
    if (!tenant) {
      throw new Error(`Estabelecimento "${tenantSlug}" não encontrado.`);
    }

    const op = canTenantOperate(tenant.status);
    if (!op.canOperate) {
      throw new Error(op.blockedReason || 'Este estabelecimento não pode receber pedidos no momento.');
    }

    const features = await repo.resolveTenantFeatures(tenant.id);
    if (!features.products) {
      throw new Error('O módulo de catálogo de produtos não está ativo.');
    }
    if (!features.shopping_cart) {
      throw new Error('O carrinho de compras não está ativo para este estabelecimento.');
    }

    // Check delivery feature gate: if delivery is selected, the tenant MUST have the 'delivery' feature!
    if (payload.fulfillmentType === 'delivery' && !features.delivery) {
      throw new Error('A opção de entrega não está habilitada para o plano desta empresa.');
    }

    const [deliverySettings, deliveryRules, paymentMethods] = await Promise.all([
      this.getDeliverySettings(tenant.id),
      this.listDeliveryRules(tenant.id),
      this.listPaymentMethods(tenant.id),
    ]);

    if (!deliverySettings.ordersEnabled) {
      throw new Error('Este estabelecimento pausou temporariamente o recebimento de novos pedidos.');
    }

    if (payload.fulfillmentType === 'pickup' && !deliverySettings.pickupEnabled) {
      throw new Error('A opção de retirada não está habilitada.');
    }

    if (payload.fulfillmentType === 'delivery' && !deliverySettings.deliveryEnabled) {
      throw new Error('A opção de entrega no endereço não está habilitada.');
    }

    // 3. Idempotency Key check: prevent accidental double-clicks from duplicating orders
    if (payload.idempotencyKey) {
      const { data: existingOrder } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('idempotency_key', payload.idempotencyKey)
        .single();

      if (existingOrder) {
        const fullExisting = await this.getOrderById(tenant.id, existingOrder.id);
        if (fullExisting) {
          const destPhone = deliverySettings.orderWhatsappNumber || tenant.whatsapp || tenant.phone || '';
          const msg = buildWhatsAppOrderMessage(fullExisting, tenant.name);
          const url = buildWhatsAppUrl(destPhone, msg);
          return { order: fullExisting, whatsappUrl: url, message: msg };
        }
      }
    }

    // 4. Validate Customer Information
    const custName = payload.customerName?.trim();
    if (!custName || custName.length < 3) {
      throw new Error('Por favor, informe seu nome completo para identificação do pedido.');
    }

    const cleanPhone = (payload.customerPhone || '').replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 13) {
      throw new Error('Por favor, informe um número de telefone/WhatsApp válido com DDD.');
    }

    // 5. Revalidate and Recalculate Items from Database
    if (!payload.items || payload.items.length === 0) {
      throw new Error('Seu carrinho está vazio.');
    }

    const productIds = Array.from(new Set(payload.items.map((i) => i.productId)));
    const { data: rawProducts } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('tenant_id', tenant.id)
      .in('id', productIds);

    const productMap = new Map<string, any>((rawProducts || []).map((p: any) => [p.id, p]));

    const { data: allVariants } = await supabaseAdmin
      .from('product_variants')
      .select('*')
      .eq('tenant_id', tenant.id)
      .in('product_id', productIds);

    const variantMap = new Map<string, any>((allVariants || []).map((v: any) => [v.id, v]));

    const orderItemsToInsert: Array<{
      productId: string;
      variantId?: string | null;
      productName: string;
      variantName?: string | null;
      unitPrice: number;
      quantity: number;
      subtotal: number;
      trackStock: boolean;
      currentStock: number;
      isVariant: boolean;
      targetId: string;
    }> = [];

    let subtotal = 0;

    for (const item of payload.items) {
      const product = productMap.get(item.productId);
      if (!product || !product.is_active) {
        throw new Error(`O produto "${product?.name || 'selecionado'}" não está mais disponível.`);
      }

      if (product.price_on_request) {
        throw new Error(`O produto "${product.name}" não permite compra direta pelo carrinho.`);
      }

      // Check weekly availability for delivery
      const currentDay = getCurrentDayOfWeek();
      if (!isProductAvailableOnDay(product, currentDay, 'delivery')) {
        throw new Error(
          `Este produto não está disponível para pedidos neste dia. O produto "${product.name}" não está disponível para delivery hoje (${getDayName(currentDay)}). Atualize o cardápio para consultar as opções disponíveis.`
        );
      }

      let variant: any = null;
      if (item.variantId) {
        variant = variantMap.get(item.variantId);
        if (!variant || !variant.is_active || variant.product_id !== product.id) {
          throw new Error(`A opção selecionada para o produto "${product.name}" não está mais disponível.`);
        }
      }

      const basePrice = variant?.price !== null && variant?.price !== undefined ? Number(variant.price) : Number(product.price);
      const promoPrice =
        variant?.promotional_price !== null && variant?.promotional_price !== undefined
          ? Number(variant.promotional_price)
          : product.promotional_price !== null && product.promotional_price !== undefined
          ? Number(product.promotional_price)
          : null;

      const hasDiscount = promoPrice !== null && promoPrice < basePrice;
      const unitPrice = hasDiscount && promoPrice !== null ? promoPrice : basePrice;

      const qty = Math.max(1, Math.min(99, Math.floor(Number(item.quantity))));

      // Stock check
      const trackStock = variant ? !!variant.track_stock : !!product.track_stock;
      const allowOutOfStock = product.allow_out_of_stock !== false;
      const currentStock = variant ? Number(variant.stock_quantity || 0) : Number(product.stock_quantity || 0);

      if (trackStock && !allowOutOfStock && currentStock < qty) {
        throw new Error(`Estoque insuficiente para "${product.name}". Temos apenas ${currentStock} unidade(s) disponível(is).`);
      }

      const itemSubtotal = Math.round(unitPrice * qty * 100) / 100;
      subtotal += itemSubtotal;

      orderItemsToInsert.push({
        productId: product.id,
        variantId: variant?.id || null,
        productName: product.name,
        variantName: variant?.name || null,
        unitPrice,
        quantity: qty,
        subtotal: itemSubtotal,
        trackStock: trackStock && !allowOutOfStock,
        currentStock,
        isVariant: !!variant,
        targetId: variant ? variant.id : product.id,
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;

    // 6. Minimum Order Check
    if (deliverySettings.minimumOrder > 0 && subtotal < deliverySettings.minimumOrder) {
      throw new Error(
        `O pedido mínimo deste estabelecimento é de R$ ${deliverySettings.minimumOrder.toFixed(2).replace('.', ',')}. Faltam R$ ${(deliverySettings.minimumOrder - subtotal).toFixed(2).replace('.', ',')} para atingir o valor.`
      );
    }

    // 7. Delivery Address & Fee Calculation
    let deliveryFee = 0;
    let deliveryAddressRecord: any = null;

    if (payload.fulfillmentType === 'delivery') {
      const addr = payload.deliveryAddress;
      if (!addr || !addr.street?.trim() || !addr.number?.trim() || !addr.neighborhood?.trim() || !addr.city?.trim() || !addr.state?.trim()) {
        throw new Error('Por favor, preencha todos os campos obrigatórios do endereço de entrega.');
      }

      const cleanCep = (addr.cep || '').replace(/\D/g, '');
      if (cleanCep.length !== 8) {
        throw new Error('Por favor, informe um CEP válido com 8 dígitos.');
      }

      const deliveryResult = calculateDeliveryFee(
        subtotal,
        { cep: cleanCep, neighborhood: addr.neighborhood },
        deliverySettings,
        deliveryRules
      );

      if (!deliveryResult.isCovered) {
        throw new Error(deliveryResult.reason || 'Este endereço ainda não está na nossa área de entrega. Escolha a opção de retirada no local.');
      }

      deliveryFee = deliveryResult.fee;
      deliveryAddressRecord = {
        id: crypto.randomUUID(),
        tenant_id: tenant.id,
        cep: cleanCep,
        street: addr.street.trim(),
        number: addr.number.trim(),
        complement: addr.complement?.trim() || null,
        neighborhood: addr.neighborhood.trim(),
        city: addr.city.trim(),
        state: addr.state.trim().toUpperCase(),
        reference: addr.reference?.trim() || null,
        delivery_rule_id: deliveryResult.ruleMatched?.id || null,
      };
    }

    const total = Math.round((subtotal + deliveryFee) * 100) / 100;

    // 8. Payment Method Validation
    const activePaymentMethods = paymentMethods.filter((pm) => pm.isActive);
    const chosenMethod = activePaymentMethods.find((pm) => pm.type === payload.paymentMethod);
    if (!chosenMethod) {
      throw new Error('A forma de pagamento escolhida não está disponível.');
    }

    let changeFor: number | null = null;
    if (payload.paymentMethod === 'CASH' && payload.changeFor) {
      changeFor = Number(payload.changeFor);
      if (changeFor < total) {
        throw new Error(`O valor para troco (R$ ${changeFor.toFixed(2).replace('.', ',')}) não pode ser menor que o total do pedido (R$ ${total.toFixed(2).replace('.', ',')}).`);
      }
    }

    // 9. Generate Sequential Order Number (#1001, #1002, ...)
    const { data: lastOrder } = await supabaseAdmin
      .from('orders')
      .select('order_number')
      .eq('tenant_id', tenant.id)
      .order('order_number', { ascending: false })
      .limit(1);

    const nextOrderNumber = lastOrder && lastOrder.length > 0 && lastOrder[0].order_number
      ? Number(lastOrder[0].order_number) + 1
      : 1001;

    // 10. Atomic Execution: Create Order, Order Items, Delivery Address, Decrement Stock
    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();

    const orderRow = {
      id: orderId,
      tenant_id: tenant.id,
      order_number: nextOrderNumber,
      customer_name: custName,
      customer_phone: cleanPhone,
      customer_email: payload.customerEmail?.trim() || null,
      fulfillment_type: payload.fulfillmentType,
      payment_method: payload.paymentMethod,
      change_for: changeFor,
      subtotal,
      delivery_fee: deliveryFee,
      total,
      status: 'NEW',
      notes: payload.notes?.trim() ? payload.notes.trim().slice(0, 500) : null,
      idempotency_key: payload.idempotencyKey || null,
      whatsapp_sent_at: null,
      created_at: now,
      updated_at: now,
    };

    await supabaseAdmin.from('orders').insert(orderRow);

    // Insert Order Items snapshot
    for (const item of orderItemsToInsert) {
      const orderItemId = crypto.randomUUID();
      await supabaseAdmin.from('order_items').insert({
        id: orderItemId,
        order_id: orderId,
        tenant_id: tenant.id,
        product_id: item.productId,
        variant_id: item.variantId || null,
        product_name: item.productName,
        variant_name: item.variantName || null,
        unit_price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.subtotal,
        created_at: now,
      });

      // Atomic stock decrement
      if (item.trackStock) {
        const remaining = Math.max(0, item.currentStock - item.quantity);
        if (item.isVariant) {
          await supabaseAdmin
            .from('product_variants')
            .update({ stock_quantity: remaining, updated_at: now })
            .eq('id', item.targetId)
            .eq('tenant_id', tenant.id);
        } else {
          await supabaseAdmin
            .from('products')
            .update({ stock_quantity: remaining, updated_at: now })
            .eq('id', item.targetId)
            .eq('tenant_id', tenant.id);
        }

        // Record inventory movement for stock history & audit
        await supabaseAdmin.from('inventory_movements').insert({
          id: crypto.randomUUID(),
          tenant_id: tenant.id,
          product_id: item.productId,
          variant_id: item.variantId || null,
          type: 'ORDER',
          quantity: -item.quantity,
          reference_type: 'order',
          reference_id: orderId,
          created_at: now,
        });
      }
    }

    // Insert Address if delivery
    if (deliveryAddressRecord) {
      deliveryAddressRecord.order_id = orderId;
      await supabaseAdmin.from('order_delivery_addresses').insert(deliveryAddressRecord);
    }

    // Audit log
    await repo.logAudit({
      actorUserId: '00000000-0000-0000-0000-000000000000',
      actorUserName: `Cliente: ${custName} (Checkout)`,
      tenantId: tenant.id,
      action: 'ORDER_CREATE' as any,
      entity: 'orders',
      entityId: orderId,
      diff: { orderNumber: nextOrderNumber, total, fulfillmentType: payload.fulfillmentType },
    });

    const fullOrder = (await this.getOrderById(tenant.id, orderId))!;

    // 11. Generate Structured WhatsApp message & URL
    const destinationPhone = deliverySettings.orderWhatsappNumber || tenant.whatsapp || tenant.phone || '';
    const message = buildWhatsAppOrderMessage(fullOrder, tenant.name);
    const whatsappUrl = buildWhatsAppUrl(destinationPhone, message);

    return {
      order: fullOrder,
      whatsappUrl,
      message,
    };
  }

  // ==========================================
  // 5. ORDERS MANAGEMENT (CLIENT ADMIN)
  // ==========================================

  public async listOrders(
    tenantId: string,
    filters?: OrderFilterParams
  ): Promise<{ orders: Order[]; total: number }> {
    const { data: rawOrders } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId);

    let list = rawOrders || [];

    // Filter by status
    if (filters?.status && filters.status !== 'all') {
      list = list.filter((o: any) => o.status === filters.status);
    }

    // Filter by fulfillment type
    if (filters?.fulfillmentType && filters.fulfillmentType !== 'all') {
      list = list.filter((o: any) => o.fulfillment_type === filters.fulfillmentType);
    }

    // Search query
    if (filters?.search && filters.search.trim().length > 0) {
      const q = filters.search.toLowerCase().trim();
      list = list.filter(
        (o: any) =>
          String(o.order_number).includes(q) ||
          o.customer_name?.toLowerCase().includes(q) ||
          o.customer_phone?.includes(q) ||
          o.customer_email?.toLowerCase().includes(q)
      );
    }

    // Date filters
    if (filters?.startDate) {
      const start = new Date(filters.startDate).getTime();
      list = list.filter((o: any) => new Date(o.created_at).getTime() >= start);
    }
    if (filters?.endDate) {
      const end = new Date(filters.endDate).getTime();
      list = list.filter((o: any) => new Date(o.created_at).getTime() <= end);
    }

    // Sort by created_at desc
    list.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = list.length;
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const paginated = list.slice((page - 1) * limit, page * limit);

    // Fetch related items & addresses for paginated orders
    const orderIds = paginated.map((o: any) => o.id);

    const { data: allItems } = await supabaseAdmin
      .from('order_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('order_id', orderIds);

    const { data: allAddresses } = await supabaseAdmin
      .from('order_delivery_addresses')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('order_id', orderIds);

    const itemsMap = new Map<string, any[]>();
    (allItems || []).forEach((item: any) => {
      const arr = itemsMap.get(item.order_id) || [];
      arr.push(item);
      itemsMap.set(item.order_id, arr);
    });

    const addressMap = new Map<string, any>();
    (allAddresses || []).forEach((addr: any) => addressMap.set(addr.order_id, addr));

    const orders: Order[] = paginated.map((o: any) => {
      const items = (itemsMap.get(o.id) || []).map((item: any) => ({
        id: item.id,
        orderId: item.order_id,
        tenantId: item.tenant_id,
        productId: item.product_id,
        variantId: item.variant_id,
        productName: item.product_name,
        variantName: item.variant_name,
        unitPrice: Number(item.unit_price),
        quantity: Number(item.quantity),
        subtotal: Number(item.subtotal),
        createdAt: item.created_at,
      }));

      const rawAddr = addressMap.get(o.id);
      const deliveryAddress: OrderDeliveryAddress | null = rawAddr
        ? {
            id: rawAddr.id,
            orderId: rawAddr.order_id,
            cep: rawAddr.cep,
            street: rawAddr.street,
            number: rawAddr.number,
            complement: rawAddr.complement,
            neighborhood: rawAddr.neighborhood,
            city: rawAddr.city,
            state: rawAddr.state,
            reference: rawAddr.reference,
            deliveryRuleId: rawAddr.delivery_rule_id,
          }
        : null;

      return {
        id: o.id,
        tenantId: o.tenant_id,
        orderNumber: Number(o.order_number),
        formattedOrderNumber: `#${o.order_number}`,
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        customerEmail: o.customer_email,
        fulfillmentType: o.fulfillment_type,
        paymentMethod: o.payment_method,
        changeFor: o.change_for !== null && o.change_for !== undefined ? Number(o.change_for) : null,
        subtotal: Number(o.subtotal),
        deliveryFee: Number(o.delivery_fee || 0),
        total: Number(o.total),
        status: o.status,
        notes: o.notes,
        idempotencyKey: o.idempotency_key,
        whatsappSentAt: o.whatsapp_sent_at,
        items,
        deliveryAddress,
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      };
    });

    return { orders, total };
  }

  public async getOrderById(tenantId: string, orderId: string): Promise<Order | null> {
    const { data: rawOrder } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', orderId)
      .single();

    if (!rawOrder) return null;

    const { data: rawItems } = await supabaseAdmin
      .from('order_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('order_id', orderId);

    const { data: rawAddr } = await supabaseAdmin
      .from('order_delivery_addresses')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('order_id', orderId)
      .single();

    return {
      id: rawOrder.id,
      tenantId: rawOrder.tenant_id,
      orderNumber: Number(rawOrder.order_number),
      formattedOrderNumber: `#${rawOrder.order_number}`,
      customerName: rawOrder.customer_name,
      customerPhone: rawOrder.customer_phone,
      customerEmail: rawOrder.customer_email,
      fulfillmentType: rawOrder.fulfillment_type,
      paymentMethod: rawOrder.payment_method,
      changeFor: rawOrder.change_for !== null && rawOrder.change_for !== undefined ? Number(rawOrder.change_for) : null,
      subtotal: Number(rawOrder.subtotal),
      deliveryFee: Number(rawOrder.delivery_fee || 0),
      total: Number(rawOrder.total),
      status: rawOrder.status,
      notes: rawOrder.notes,
      idempotencyKey: rawOrder.idempotency_key,
      whatsappSentAt: rawOrder.whatsapp_sent_at,
      items: (rawItems || []).map((i: any) => ({
        id: i.id,
        orderId: i.order_id,
        tenantId: i.tenant_id,
        productId: i.product_id,
        variantId: i.variant_id,
        productName: i.product_name,
        variantName: i.variant_name,
        unitPrice: Number(i.unit_price),
        quantity: Number(i.quantity),
        subtotal: Number(i.subtotal),
        createdAt: i.created_at,
      })),
      deliveryAddress: rawAddr
        ? {
            id: rawAddr.id,
            orderId: rawAddr.order_id,
            cep: rawAddr.cep,
            street: rawAddr.street,
            number: rawAddr.number,
            complement: rawAddr.complement,
            neighborhood: rawAddr.neighborhood,
            city: rawAddr.city,
            state: rawAddr.state,
            reference: rawAddr.reference,
            deliveryRuleId: rawAddr.delivery_rule_id,
          }
        : null,
      createdAt: rawOrder.created_at,
      updatedAt: rawOrder.updated_at,
    };
  }

  public async updateOrderStatus(
    tenantId: string,
    orderId: string,
    newStatus: OrderStatus,
    actor: User
  ): Promise<Order> {
    const existing = await this.getOrderById(tenantId, orderId);
    if (!existing) {
      throw new Error('Pedido não encontrado.');
    }

    if (existing.status === newStatus) {
      return existing;
    }

    const now = new Date().toISOString();

    // Cancellation stock restoration logic:
    // If transitioning to CANCELLED, restore stock once if not already restored
    if (newStatus === 'CANCELLED' && existing.status !== 'CANCELLED') {
      const { data: existingCancelMovements } = await supabaseAdmin
        .from('inventory_movements')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('reference_id', orderId)
        .eq('type', 'ORDER_CANCEL');

      if (!existingCancelMovements || existingCancelMovements.length === 0) {
        for (const item of existing.items) {
          if (item.productId) {
            if (item.variantId) {
              const { data: v } = await supabaseAdmin.from('product_variants').select('*').eq('id', item.variantId).single();
              if (v && v.track_stock) {
                await supabaseAdmin
                  .from('product_variants')
                  .update({ stock_quantity: (v.stock_quantity || 0) + item.quantity, updated_at: now })
                  .eq('id', item.variantId);
              }
            } else {
              const { data: p } = await supabaseAdmin.from('products').select('*').eq('id', item.productId).single();
              if (p && p.track_stock) {
                await supabaseAdmin
                  .from('products')
                  .update({ stock_quantity: (p.stock_quantity || 0) + item.quantity, updated_at: now })
                  .eq('id', item.productId);
              }
            }

            // Record cancellation movement
            await supabaseAdmin.from('inventory_movements').insert({
              id: crypto.randomUUID(),
              tenant_id: tenantId,
              product_id: item.productId,
              variant_id: item.variantId || null,
              type: 'ORDER_CANCEL',
              quantity: item.quantity,
              reference_type: 'order',
              reference_id: orderId,
              created_at: now,
            });
          }
        }
      }
    }

    await supabaseAdmin
      .from('orders')
      .update({ status: newStatus, updated_at: now })
      .eq('id', orderId)
      .eq('tenant_id', tenantId);

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'ORDER_STATUS_CHANGE' as any,
      entity: 'orders',
      entityId: orderId,
      diff: { before: existing.status, after: newStatus },
    });

    return (await this.getOrderById(tenantId, orderId))!;
  }

  public async getOrdersSummary(tenantId: string): Promise<OrdersSummary> {
    const { data: rawOrders } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId);

    const orders = rawOrders || [];
    const today = new Date().toISOString().slice(0, 10);

    let ordersTodayCount = 0;
    let ordersNewCount = 0;
    let ordersCompletedCount = 0;
    let ordersTodayTotal = 0;

    orders.forEach((o: any) => {
      const orderDate = (o.created_at || '').slice(0, 10);
      if (orderDate === today) {
        ordersTodayCount++;
        if (o.status !== 'CANCELLED') {
          ordersTodayTotal += Number(o.total || 0);
        }
      }
      if (o.status === 'NEW') ordersNewCount++;
      if (o.status === 'COMPLETED') ordersCompletedCount++;
    });

    return {
      ordersTodayCount,
      ordersNewCount,
      ordersCompletedCount,
      ordersTodayTotal: Math.round(ordersTodayTotal * 100) / 100,
      totalOrdersCount: orders.length,
    };
  }

  public async recordWhatsAppSent(tenantId: string, orderId: string): Promise<void> {
    const now = new Date().toISOString();
    await supabaseAdmin
      .from('orders')
      .update({ whatsapp_sent_at: now, updated_at: now })
      .eq('id', orderId)
      .eq('tenant_id', tenantId);
  }

  public async updateOrder(
    tenantId: string,
    orderId: string,
    payload: {
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      notes?: string;
      items?: Array<{
        productId: string;
        variantId?: string | null;
        quantity: number;
      }>;
      deliveryFee?: number;
    },
    actor: User
  ): Promise<Order> {
    const existing = await this.getOrderById(tenantId, orderId);
    if (!existing) {
      throw new Error('Pedido não encontrado.');
    }

    const now = new Date().toISOString();
    let newSubtotal = existing.subtotal;
    let newDeliveryFee = payload.deliveryFee !== undefined ? Number(payload.deliveryFee) : existing.deliveryFee;
    let updatedItems = existing.items;

    if (payload.items && Array.isArray(payload.items)) {
      newSubtotal = 0;
      updatedItems = [];

      for (const itemInput of payload.items) {
        if (itemInput.quantity <= 0) continue;

        const { data: product } = await supabaseAdmin
          .from('products')
          .select('*')
          .eq('id', itemInput.productId)
          .eq('tenant_id', tenantId)
          .single();

        if (!product) {
          throw new Error('Produto não encontrado ou inválido para este estabelecimento.');
        }

        let unitPrice =
          product.promotional_price !== null && product.promotional_price !== undefined
            ? Number(product.promotional_price)
            : Number(product.price || 0);
        let variantName: string | null = null;

        if (itemInput.variantId) {
          const { data: variant } = await supabaseAdmin
            .from('product_variants')
            .select('*')
            .eq('id', itemInput.variantId)
            .eq('product_id', product.id)
            .eq('tenant_id', tenantId)
            .single();

          if (variant) {
            variantName = variant.name;
            if (variant.promotional_price !== null && variant.promotional_price !== undefined) {
              unitPrice = Number(variant.promotional_price);
            } else if (variant.price !== null && variant.price !== undefined) {
              unitPrice = Number(variant.price);
            }
          }
        }

        const itemSubtotal = Math.round(unitPrice * itemInput.quantity * 100) / 100;
        newSubtotal += itemSubtotal;

        updatedItems.push({
          id: crypto.randomUUID(),
          orderId,
          tenantId,
          productId: product.id,
          variantId: itemInput.variantId || null,
          productName: product.name,
          variantName,
          unitPrice,
          quantity: itemInput.quantity,
          subtotal: itemSubtotal,
          createdAt: now,
        });
      }

      newSubtotal = Math.round(newSubtotal * 100) / 100;
    }

    const newTotal = Math.round((newSubtotal + newDeliveryFee) * 100) / 100;

    const orderUpdate: any = {
      subtotal: newSubtotal,
      delivery_fee: newDeliveryFee,
      total: newTotal,
      updated_at: now,
    };

    if (payload.customerName !== undefined) orderUpdate.customer_name = payload.customerName.trim();
    if (payload.customerPhone !== undefined) orderUpdate.customer_phone = payload.customerPhone.trim();
    if (payload.customerEmail !== undefined) orderUpdate.customer_email = payload.customerEmail?.trim() || null;
    if (payload.notes !== undefined) orderUpdate.notes = payload.notes?.trim() || null;

    await supabaseAdmin
      .from('orders')
      .update(orderUpdate)
      .eq('id', orderId)
      .eq('tenant_id', tenantId);

    if (payload.items && Array.isArray(payload.items)) {
      await supabaseAdmin.from('order_items').delete().eq('order_id', orderId).eq('tenant_id', tenantId);
      if (updatedItems.length > 0) {
        await supabaseAdmin.from('order_items').insert(
          updatedItems.map((i) => ({
            id: i.id,
            order_id: orderId,
            tenant_id: tenantId,
            product_id: i.productId,
            variant_id: i.variantId,
            product_name: i.productName,
            variant_name: i.variantName,
            unit_price: i.unitPrice,
            quantity: i.quantity,
            subtotal: i.subtotal,
            created_at: i.createdAt,
          }))
        );
      }
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'ORDER_UPDATE' as any,
      entity: 'orders',
      entityId: orderId,
      diff: { before: existing, after: { ...existing, ...orderUpdate } },
    });

    return (await this.getOrderById(tenantId, orderId))!;
  }

  public async deleteOrder(tenantId: string, orderId: string, actor: User): Promise<boolean> {
    const existing = await this.getOrderById(tenantId, orderId);
    if (!existing) {
      throw new Error('Pedido não encontrado.');
    }

    await supabaseAdmin.from('order_items').delete().eq('order_id', orderId).eq('tenant_id', tenantId);
    await supabaseAdmin.from('order_delivery_addresses').delete().eq('order_id', orderId).eq('tenant_id', tenantId);

    const { error: delErr } = await supabaseAdmin
      .from('orders')
      .delete()
      .eq('id', orderId)
      .eq('tenant_id', tenantId);

    if (delErr) {
      throw new Error(`Erro ao excluir pedido: ${delErr.message}`);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'ORDER_DELETE' as any,
      entity: 'orders',
      entityId: orderId,
      metadata: { orderNumber: existing.orderNumber, customerName: existing.customerName },
    });

    return true;
  }
}

export const orderRepo = new OrderRepository();
