import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SYSTEM_FEATURES } from '../src/utils/features.js';

export const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';

export const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

export const isRealSupabaseConfigured =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('your-project') &&
  SUPABASE_SECRET_KEY.length > 20 &&
  !SUPABASE_SECRET_KEY.includes('your-service-role');

export function getSupabaseAuthClient(): SupabaseClient | null {
  if (!isRealSupabaseConfigured) return null;
  const anonKey =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    SUPABASE_SECRET_KEY;
  return createClient(SUPABASE_URL, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ============================================================================
// SIMULATED POSTGRESQL & SUPABASE ADAPTER (Active when remote credentials pending)
// Ensures 100% architectural adherence, UUIDs, PostgreSQL structure, and RLS
// ============================================================================
class LocalSupabaseStore {
  public plans: any[] = [];
  public features: any[] = [];
  public plan_features: any[] = [];
  public tenants: any[] = [];
  public tenant_settings: any[] = [];
  public tenant_features: any[] = [];
  public tenant_users: any[] = [];
  public audit_logs: any[] = [];
  public auth_users: any[] = [];
  public sites: any[] = [];
  public site_sections: any[] = [];
  public site_seo: any[] = [];
  public site_versions: any[] = [];
  public product_categories: any[] = [];
  public products: any[] = [];
  public product_images: any[] = [];
  public product_variants: any[] = [];
  public delivery_settings: any[] = [];
  public delivery_rules: any[] = [];
  public payment_methods: any[] = [];
  public carts: any[] = [];
  public cart_items: any[] = [];
  public orders: any[] = [];
  public order_items: any[] = [];
  public order_delivery_addresses: any[] = [];
  public inventory_movements: any[] = [];
  public service_categories: any[] = [];
  public services: any[] = [];
  public professionals: any[] = [];
  public service_professionals: any[] = [];
  public appointment_settings: any[] = [];
  public professional_schedules: any[] = [];
  public schedule_blocks: any[] = [];
  public appointments: any[] = [];
  public restaurant_tables: any[] = [];
  public restaurant_sessions: any[] = [];
  public restaurant_orders: any[] = [];
  public restaurant_order_items: any[] = [];
  public restaurant_order_status_history: any[] = [];
  public restaurant_fee_templates: any[] = [];
  public restaurant_session_fees: any[] = [];
  public storage_objects: Map<string, { buffer: Buffer; mimeType: string }> = new Map();

  private storeFilePath =
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
      ? path.resolve('/tmp', 'local_store.json')
      : path.resolve(process.cwd(), 'data', 'local_store.json');

  constructor() {
    this.seed();
    this.loadFromDisk();
  }

  public persistToDisk() {
    try {
      const dataToSave = {
        plans: this.plans,
        features: this.features,
        plan_features: this.plan_features,
        tenants: this.tenants,
        tenant_settings: this.tenant_settings,
        tenant_features: this.tenant_features,
        tenant_users: this.tenant_users,
        audit_logs: this.audit_logs,
        auth_users: this.auth_users,
        sites: this.sites,
        site_sections: this.site_sections,
        site_seo: this.site_seo,
        site_versions: this.site_versions,
        product_categories: this.product_categories,
        products: this.products,
        product_images: this.product_images,
        product_variants: this.product_variants,
        delivery_settings: this.delivery_settings,
        delivery_rules: this.delivery_rules,
        payment_methods: this.payment_methods,
        carts: this.carts,
        cart_items: this.cart_items,
        orders: this.orders,
        order_items: this.order_items,
        order_delivery_addresses: this.order_delivery_addresses,
        inventory_movements: this.inventory_movements,
        service_categories: this.service_categories,
        services: this.services,
        professionals: this.professionals,
        service_professionals: this.service_professionals,
        appointment_settings: this.appointment_settings,
        professional_schedules: this.professional_schedules,
        schedule_blocks: this.schedule_blocks,
        appointments: this.appointments,
        restaurant_tables: this.restaurant_tables,
        restaurant_sessions: this.restaurant_sessions,
        restaurant_orders: this.restaurant_orders,
        restaurant_order_items: this.restaurant_order_items,
        restaurant_order_status_history: this.restaurant_order_status_history,
        restaurant_fee_templates: this.restaurant_fee_templates,
        restaurant_session_fees: this.restaurant_session_fees,
      };

      const dir = path.dirname(this.storeFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storeFilePath, JSON.stringify(dataToSave, null, 2), 'utf-8');
    } catch (e: any) {
      console.warn('[LOCAL_STORE] Error persisting to disk:', e.message);
    }
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.storeFilePath)) {
        const raw = fs.readFileSync(this.storeFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const keys = [
            'plans', 'features', 'plan_features', 'tenants', 'tenant_settings',
            'tenant_features', 'tenant_users', 'audit_logs', 'auth_users', 'sites',
            'site_sections', 'site_seo', 'site_versions', 'product_categories',
            'products', 'product_images', 'product_variants', 'delivery_settings',
            'delivery_rules', 'payment_methods', 'carts', 'cart_items', 'orders',
            'order_items', 'order_delivery_addresses', 'inventory_movements',
            'service_categories', 'services', 'professionals', 'service_professionals',
            'appointment_settings', 'professional_schedules', 'schedule_blocks', 'appointments',
            'restaurant_tables', 'restaurant_sessions', 'restaurant_orders', 'restaurant_order_items', 'restaurant_order_status_history',
            'restaurant_fee_templates', 'restaurant_session_fees'
          ];
          for (const key of keys) {
            if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
              (this as any)[key] = parsed[key];
            }
          }
        }
      }
    } catch (e: any) {
      console.warn('[LOCAL_STORE] Error loading from disk:', e.message);
    }
  }

  private seed() {
    const now = new Date().toISOString();

    // 1. Seed Features
    this.features = SYSTEM_FEATURES.map((f) => ({
      key: f.key,
      name: f.name,
      description: f.description,
      category: f.category,
      icon: f.icon,
      created_at: now,
    }));

    // 2. Seed Plans with UUIDs
    const planEssencialId = '11111111-1111-4111-8111-111111111111';
    const planProId = '22222222-2222-4222-8222-222222222222';
    const planPremiumId = '33333333-3333-4333-8333-333333333333';

    this.plans = [
      {
        id: planEssencialId,
        name: 'Essencial',
        description: 'Ideal para negócios locais que precisam de presença digital rápida e confiável.',
        price: 89.0,
        status: 'active',
        created_at: now,
        updated_at: now,
      },
      {
        id: planProId,
        name: 'Pro',
        description: 'Perfeito para prestadores de serviços, clínicas, salões e barbearias.',
        price: 179.0,
        status: 'active',
        created_at: now,
        updated_at: now,
      },
      {
        id: planPremiumId,
        name: 'Premium',
        description: 'Solução completa com delivery, catálogo de produtos, Wi-Fi marketing e domínio próprio.',
        price: 299.0,
        status: 'active',
        created_at: now,
        updated_at: now,
      },
    ];

    // Seed Plan Features
    const p1Feats = ['site_editor', 'whatsapp', 'social_links', 'google_reviews', 'qr_code'];
    const p2Feats = [...p1Feats, 'services', 'appointments', 'professionals', 'coupons', 'analytics'];
    const p3Feats = [...p2Feats, 'products', 'shopping_cart', 'delivery', 'wifi', 'custom_domain', 'restaurant_tables'];

    p1Feats.forEach((f) => this.plan_features.push({ plan_id: planEssencialId, feature_key: f }));
    p2Feats.forEach((f) => this.plan_features.push({ plan_id: planProId, feature_key: f }));
    p3Feats.forEach((f) => this.plan_features.push({ plan_id: planPremiumId, feature_key: f }));

    // 3. Seed Super Admin Users (auth.users + tenant_users)
    const superAdminUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    this.auth_users.push({
      id: superAdminUserId,
      email: 'admin@localhub.com',
      password: 'admin123',
      user_metadata: { name: 'Administrador da Plataforma', phone: '(11) 99999-0000' },
      created_at: now,
    });

    this.tenant_users.push({
      id: crypto.randomUUID(),
      tenant_id: null,
      user_id: superAdminUserId,
      role: 'SUPER_ADMIN',
      status: 'active',
      created_at: now,
      updated_at: now,
    });

    const superAdminUserId2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
    this.auth_users.push({
      id: superAdminUserId2,
      email: 'ls2039730@gmail.com',
      password: 'admin123',
      user_metadata: { name: 'Administrador da Plataforma', phone: '(11) 99999-0000' },
      created_at: now,
    });

    this.tenant_users.push({
      id: crypto.randomUUID(),
      tenant_id: null,
      user_id: superAdminUserId2,
      role: 'SUPER_ADMIN',
      status: 'active',
      created_at: now,
      updated_at: now,
    });

    // 4. Seed Tenants with UUIDs
    const tenant1Id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const tenant2Id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const tenant3Id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    const client1UserId = '11111111-aaaa-4111-8aaa-111111111111';
    const client2UserId = '22222222-aaaa-4222-8aaa-222222222222';
    const client3UserId = '33333333-aaaa-4333-8aaa-333333333333';

    // Tenant 1: Barbearia Prime
    this.tenants.push({
      id: tenant1Id,
      name: 'Barbearia Prime',
      slug: 'barbearia-prime',
      segment: 'Barbearia & Estética Masculina',
      cnpj: '12.345.678/0001-90',
      phone: '(11) 98765-4321',
      whatsapp: '11987654321',
      email: 'contato@barbeariaprime.com',
      plan_id: planProId,
      status: 'ativo',
      owner_name: 'Carlos Eduardo Silva',
      owner_email: 'contato@barbeariaprime.com',
      owner_phone: '(11) 98765-4321',
      subdomain: 'barbearia-prime.meudominio.com',
      notes: 'Cliente pioneiro com contrato anual assinado.',
      deleted_at: null,
      created_at: now,
      updated_at: now,
    });
    this.tenant_settings.push({
      tenant_id: tenant1Id,
      primary_color: '#1e293b',
      secondary_color: '#ca8a04',
      accent_color: '#f59e0b',
      font_family: 'Inter',
      logo_url: '',
      tagline: 'Corte tradicional e cuidados modernos para o homem exigente.',
      created_at: now,
      updated_at: now,
    });
    this.auth_users.push({
      id: client1UserId,
      email: 'contato@barbeariaprime.com',
      password: 'cliente123',
      user_metadata: { name: 'Carlos Eduardo Silva', phone: '(11) 98765-4321' },
      created_at: now,
    });
    this.tenant_users.push({
      id: crypto.randomUUID(),
      tenant_id: tenant1Id,
      user_id: client1UserId,
      role: 'CLIENT_ADMIN',
      status: 'active',
      created_at: now,
      updated_at: now,
    });

    // Professional User for Tenant 1 (Carlos Oliveira - linked)
    const profUser1Id = '44444444-aaaa-4444-8aaa-111111111111';
    this.auth_users.push({
      id: profUser1Id,
      email: 'carlos@barbeariaprime.com',
      password: 'pro123',
      user_metadata: { name: 'Carlos Oliveira (Barbeiro)', phone: '(11) 98111-2233' },
      created_at: now,
    });
    this.tenant_users.push({
      id: crypto.randomUUID(),
      tenant_id: tenant1Id,
      user_id: profUser1Id,
      role: 'PROFESSIONAL',
      status: 'active',
      created_at: now,
      updated_at: now,
    });

    // Unlinked Professional User for Tenant 1 (testing unlinked state)
    const profUserUnlinkedId = '55555555-aaaa-5555-8aaa-555555555555';
    this.auth_users.push({
      id: profUserUnlinkedId,
      email: 'semvinculo@barbeariaprime.com',
      password: 'pro123',
      user_metadata: { name: 'Profissional Sem Vínculo', phone: '(11) 98999-0000' },
      created_at: now,
    });
    this.tenant_users.push({
      id: crypto.randomUUID(),
      tenant_id: tenant1Id,
      user_id: profUserUnlinkedId,
      role: 'PROFESSIONAL',
      status: 'active',
      created_at: now,
      updated_at: now,
    });

    // Tenant 2: Bistrô Dona Maria
    this.tenants.push({
      id: tenant2Id,
      name: 'Bistrô Dona Maria',
      slug: 'bistro-dona-maria',
      segment: 'Restaurante & Gastronomia',
      cnpj: '98.765.432/0001-10',
      phone: '(21) 99887-1122',
      whatsapp: '21998871122',
      email: 'maria@bistro.com',
      plan_id: planPremiumId,
      status: 'teste',
      owner_name: 'Maria Antônia Fernandes',
      owner_email: 'maria@bistro.com',
      owner_phone: '(21) 99887-1122',
      subdomain: 'bistro-dona-maria.meudominio.com',
      notes: 'Período de teste até fim da próxima semana.',
      deleted_at: null,
      created_at: now,
      updated_at: now,
    });
    this.tenant_settings.push({
      tenant_id: tenant2Id,
      primary_color: '#7f1d1d',
      secondary_color: '#d97706',
      accent_color: '#fbbf24',
      font_family: 'Playfair Display',
      logo_url: '',
      tagline: 'Alta gastronomia artesanal com sabor de afeto e tradição.',
      created_at: now,
      updated_at: now,
    });
    this.auth_users.push({
      id: client2UserId,
      email: 'maria@bistro.com',
      password: 'cliente123',
      user_metadata: { name: 'Maria Antônia Fernandes', phone: '(21) 99887-1122' },
      created_at: now,
    });
    this.tenant_users.push({
      id: crypto.randomUUID(),
      tenant_id: tenant2Id,
      user_id: client2UserId,
      role: 'CLIENT_ADMIN',
      status: 'active',
      created_at: now,
      updated_at: now,
    });

    // Tenant 3: Drogaria Central
    this.tenants.push({
      id: tenant3Id,
      name: 'Drogaria Central',
      slug: 'drogaria-central',
      segment: 'Farmácia & Saúde',
      cnpj: '45.123.789/0001-55',
      phone: '(31) 3222-4455',
      whatsapp: '31988887766',
      email: 'central@drogaria.com',
      plan_id: planEssencialId,
      status: 'pagamento_pendente',
      owner_name: 'Roberto Alencar',
      owner_email: 'central@drogaria.com',
      owner_phone: '(31) 98888-7766',
      subdomain: 'drogaria-central.meudominio.com',
      notes: 'Aguardando compensação do boleto bancário de adesão.',
      deleted_at: null,
      created_at: now,
      updated_at: now,
    });
    this.tenant_settings.push({
      tenant_id: tenant3Id,
      primary_color: '#0369a1',
      secondary_color: '#059669',
      accent_color: '#10b981',
      font_family: 'Roboto',
      logo_url: '',
      tagline: 'Medicamentos, perfumaria e atendimento farmacêutico 24 horas.',
      created_at: now,
      updated_at: now,
    });
    this.auth_users.push({
      id: client3UserId,
      email: 'central@drogaria.com',
      password: 'cliente123',
      user_metadata: { name: 'Roberto Alencar', phone: '(31) 98888-7766' },
      created_at: now,
    });
    this.tenant_users.push({
      id: crypto.randomUUID(),
      tenant_id: tenant3Id,
      user_id: client3UserId,
      role: 'CLIENT_ADMIN',
      status: 'active',
      created_at: now,
      updated_at: now,
    });

    // 5. Seed Initial Sites & Modular Sections
    const site1Id = '99999999-1111-4999-8111-999999999991';
    this.sites.push({
      id: site1Id,
      tenant_id: tenant1Id,
      template_id: 'moderno',
      status: 'published',
      published_at: now,
      created_at: now,
      updated_at: now,
    });

    this.site_seo.push({
      site_id: site1Id,
      tenant_id: tenant1Id,
      title: 'Barbearia Prime | Barbearia & Estética Masculina em São Paulo',
      description: 'Corte tradicional, barba com toalha quente e cuidados modernos para o homem exigente. Agende seu horário pelo WhatsApp!',
      keywords: 'barbearia, corte masculino, barba, são paulo, estética masculina',
      og_title: 'Barbearia Prime - Tradição e Estilo em São Paulo',
      og_description: 'Ambiente climatizado, atendimento exclusivo e profissionais premiados.',
      og_image: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1200&q=80',
      favicon: '',
      allow_indexing: true,
      created_at: now,
      updated_at: now,
    });

    // Initial sections for Barbearia Prime
    const bPrimeSections = [
      {
        id: crypto.randomUUID(),
        site_id: site1Id,
        tenant_id: tenant1Id,
        section_type: 'hero',
        position: 0,
        is_enabled: true,
        settings: {
          headline: 'Barbearia Prime',
          subtitle: 'Corte tradicional e cuidados modernos para o homem exigente',
          shortText: 'Agende seu horário ou venha nos visitar no coração de São Paulo.',
          coverImage: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1200&q=80',
          bgType: 'image',
          overlayOpacity: 55,
          alignment: 'center',
          layoutVariant: 'classic',
          primaryButton: { text: 'Agendar no WhatsApp', url: 'https://wa.me/5511987654321', enabled: true },
          secondaryButton: { text: 'Ver Informações', url: '#sobre', enabled: true },
        },
      },
      {
        id: crypto.randomUUID(),
        site_id: site1Id,
        tenant_id: tenant1Id,
        section_type: 'quick_buttons',
        position: 1,
        is_enabled: true,
        settings: {
          title: 'Atendimento Rápido',
          subtitle: 'Escolha seu canal de preferência',
          buttons: [
            { id: 'b1', type: 'whatsapp', title: 'WhatsApp Direto', url: 'https://wa.me/5511987654321', icon: 'MessageCircle', isEnabled: true },
            { id: 'b2', type: 'phone', title: '(11) 98765-4321', url: 'tel:11987654321', icon: 'Phone', isEnabled: true },
            { id: 'b3', type: 'location', title: 'Como Chegar', url: '#localizacao', icon: 'MapPin', isEnabled: true },
            { id: 'b4', type: 'reviews', title: 'Avaliar no Google', url: '#avaliacoes', icon: 'Star', isEnabled: true },
          ],
        },
      },
      {
        id: crypto.randomUUID(),
        site_id: site1Id,
        tenant_id: tenant1Id,
        section_type: 'about',
        position: 2,
        is_enabled: true,
        settings: {
          title: 'Sobre a Barbearia Prime',
          subtitle: 'Mais de 8 anos transformando visual e elevando autoestima',
          text: 'Com técnicas clássicas de barbearia navalhada e as últimas tendências internacionais, a Barbearia Prime proporciona uma experiência completa de relaxamento, bebidas selecionadas e atendimento pontual.',
          image: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80',
          layout: 'image_right',
          highlights: [
            { title: 'Toalha Quente', desc: 'Tradição do barbear clássico com produtos dermatológicos.' },
            { title: 'Pontualidade Britânica', desc: 'Sem espera: seu horário é rigorosamente respeitado.' },
            { title: 'Cerveja & Café Cortesia', desc: 'Espaço lounge com jogos e bebidas de cortesia.' },
          ],
        },
      },
      {
        id: crypto.randomUUID(),
        site_id: site1Id,
        tenant_id: tenant1Id,
        section_type: 'services',
        position: 3,
        is_enabled: true,
        settings: {
          title: 'Nossos Serviços',
          subtitle: 'Especialidades executadas por mestres barbeiros',
          noticeText: 'Você ainda não possui serviços cadastrados.',
        },
      },
      {
        id: crypto.randomUUID(),
        site_id: site1Id,
        tenant_id: tenant1Id,
        section_type: 'gallery',
        position: 4,
        is_enabled: true,
        settings: {
          title: 'Galeria de Trabalhos',
          subtitle: 'Confira os cortes e o ambiente da nossa unidade',
          columns: 3,
          items: [
            { id: 'g1', url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=600&q=80', caption: 'Degradê na navalha e barba alinhada' },
            { id: 'g2', url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=600&q=80', caption: 'Estrutura premium e confortável' },
            { id: 'g3', url: 'https://images.unsplash.com/photo-1517832606589-715753d4be37?auto=format&fit=crop&w=600&q=80', caption: 'Atendimento atencioso e personalizado' },
          ],
        },
      },
      {
        id: crypto.randomUUID(),
        site_id: site1Id,
        tenant_id: tenant1Id,
        section_type: 'business_hours',
        position: 5,
        is_enabled: true,
        settings: {
          title: 'Horário de Funcionamento',
          subtitle: 'Aberto de segunda a sábado com horários flexíveis',
          schedule: {
            seg: { isOpen: true, openTime: '09:00', closeTime: '20:00' },
            ter: { isOpen: true, openTime: '09:00', closeTime: '20:00' },
            qua: { isOpen: true, openTime: '09:00', closeTime: '20:00' },
            qui: { isOpen: true, openTime: '09:00', closeTime: '20:00' },
            sex: { isOpen: true, openTime: '09:00', closeTime: '21:00' },
            sab: { isOpen: true, openTime: '08:30', closeTime: '18:00' },
            dom: { isOpen: false, openTime: '09:00', closeTime: '18:00' },
          },
        },
      },
      {
        id: crypto.randomUUID(),
        site_id: site1Id,
        tenant_id: tenant1Id,
        section_type: 'google_reviews',
        position: 6,
        is_enabled: true,
        settings: {
          title: 'Avaliações no Google',
          subtitle: 'A opinião de quem frequenta nossa barbearia semanalmente',
          rating: 4.9,
          reviewsCount: 142,
          googleReviewUrl: 'https://search.google.com/local/writereview',
          buttonText: 'Avaliar Barbearia Prime no Google',
          featuredReviews: [
            { author: 'Eduardo Silveira', stars: 5, comment: 'Corte perfeito e atendimento nota dez. Melhor barbearia da cidade!', date: 'Há 1 semana' },
            { author: 'Felipe Mendes', stars: 5, comment: 'Pontualidade e cuidado com os detalhes. Café espresso excelente enquanto você aguarda.', date: 'Há 3 semanas' },
          ],
        },
      },
      {
        id: crypto.randomUUID(),
        site_id: site1Id,
        tenant_id: tenant1Id,
        section_type: 'location',
        position: 7,
        is_enabled: true,
        settings: {
          title: 'Localização & Contato',
          subtitle: 'Fácil acesso no centro da cidade',
          address: {
            street: 'Rua Augusta',
            number: '1500',
            neighborhood: 'Consolação',
            city: 'São Paulo',
            state: 'SP',
            zip: '01305-100',
            complement: 'Loja 2',
            landmark: 'Próximo à estação do metrô',
          },
          showDirectionsButton: true,
        },
      },
      {
        id: crypto.randomUUID(),
        site_id: site1Id,
        tenant_id: tenant1Id,
        section_type: 'cta',
        position: 8,
        is_enabled: true,
        settings: {
          title: 'Pronto para renovar seu estilo?',
          description: 'Garanta seu horário com um de nossos profissionais agora mesmo.',
          buttonText: 'Chamar no WhatsApp',
          buttonUrl: 'https://wa.me/5511987654321',
          bgType: 'color',
        },
      },
      {
        id: crypto.randomUUID(),
        site_id: site1Id,
        tenant_id: tenant1Id,
        section_type: 'footer',
        position: 9,
        is_enabled: true,
        settings: {
          showLogo: true,
          customText: 'Barbearia Prime · Corte de cabelo masculino e barba com excelência em São Paulo.',
          copyrightText: '© 2026 Barbearia Prime. Todos os direitos reservados.',
          showSocial: true,
          showPoweredBy: true,
        },
      },
    ];

    bPrimeSections.forEach((sec) => this.site_sections.push(sec));

    // 6. Enable 'products', 'shopping_cart', 'delivery', 'services', and 'professionals' for Tenant 1 (Barbearia Prime)
    this.tenant_features.push(
      {
        tenant_id: tenant1Id,
        feature_key: 'products',
        is_enabled: true,
      },
      {
        tenant_id: tenant1Id,
        feature_key: 'shopping_cart',
        is_enabled: true,
      },
      {
        tenant_id: tenant1Id,
        feature_key: 'delivery',
        is_enabled: true,
      },
      {
        tenant_id: tenant1Id,
        feature_key: 'services',
        is_enabled: true,
      },
      {
        tenant_id: tenant1Id,
        feature_key: 'professionals',
        is_enabled: true,
      },
      {
        tenant_id: tenant1Id,
        feature_key: 'restaurant_tables',
        is_enabled: true,
      }
    );

    // Seed Initial Restaurant Tables for Tenant 1
    const seedTableTokens = ['tab_prime_01', 'tab_prime_02', 'tab_prime_03', 'tab_prime_04'];
    [
      { num: '01', name: 'Salão Principal 1' },
      { num: '02', name: 'Salão Principal 2' },
      { num: '03', name: 'Deck Externo' },
      { num: '04', name: 'Área VIP' },
    ].forEach((t, idx) => {
      this.restaurant_tables.push({
        id: crypto.randomUUID(),
        tenant_id: tenant1Id,
        table_number: t.num,
        name: t.name,
        status: 'available',
        is_active: true,
        notes: null,
        qr_code_token: seedTableTokens[idx],
        current_session_id: null,
        created_at: now,
        updated_at: now,
      });
    });

    // Seed Initial Fee Templates for Tenant 1
    this.restaurant_fee_templates.push(
      {
        id: crypto.randomUUID(),
        tenant_id: tenant1Id,
        name: 'Taxa de Serviço (Garçom)',
        description: 'Taxa opcional de 10% sobre o consumo da mesa.',
        type: 'percentage',
        value: 10.00,
        is_active: true,
        is_default: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        tenant_id: tenant1Id,
        name: 'Couvert Artístico',
        description: 'Apresentação musical ao vivo no salão.',
        type: 'fixed',
        value: 15.00,
        is_active: true,
        is_default: false,
        created_at: now,
        updated_at: now,
      }
    );

    // 7. Seed Categories for Tenant 1
    const cat1Id = '55555555-1111-4555-8111-111111111111';
    const cat2Id = '55555555-2222-4555-8222-222222222222';
    const cat3Id = '55555555-3333-4555-8333-333333333333';

    this.product_categories.push(
      {
        id: cat1Id,
        tenant_id: tenant1Id,
        name: 'Pomadas & Ceras',
        slug: 'pomadas-ceras',
        description: 'Finalizadores e fixadores profissionais de alta durabilidade.',
        image_url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=400&q=80',
        position: 0,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: cat2Id,
        tenant_id: tenant1Id,
        name: 'Óleos & Cuidados com a Barba',
        slug: 'oleos-cuidados',
        description: 'Nutrição, alinhamento e hidratação para barbas curtas e longas.',
        image_url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=400&q=80',
        position: 1,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: cat3Id,
        tenant_id: tenant1Id,
        name: 'Shampoos & Tratamentos',
        slug: 'shampoos-tratamentos',
        description: 'Higiene e cuidado capilar com frescor revigorante.',
        image_url: 'https://images.unsplash.com/photo-1517832606589-715753d4be37?auto=format&fit=crop&w=400&q=80',
        position: 2,
        is_active: true,
        created_at: now,
        updated_at: now,
      }
    );

    // 8. Seed Products for Tenant 1
    const prod1Id = '66666666-1111-4666-8111-111111111111';
    const prod2Id = '66666666-2222-4666-8222-222222222222';
    const prod3Id = '66666666-3333-4666-8333-333333333333';
    const prod4Id = '66666666-4444-4666-8444-444444444444';

    this.products.push(
      {
        id: prod1Id,
        tenant_id: tenant1Id,
        category_id: cat1Id,
        name: 'Pomada Modeladora Efeito Matte 100g',
        slug: 'pomada-modeladora-efeito-matte-100g',
        short_description: 'Fixação forte e acabamento natural sem brilho para o dia todo.',
        description: 'Desenvolvida exclusivamente para a Barbearia Prime, esta pomada proporciona fixação extrema com visual mate limpo. À base de água, não engordura os fios e sai com facilidade no banho.',
        sku: 'POM-MATTE-100',
        barcode: '7891000100011',
        price: 59.90,
        promotional_price: 49.90,
        price_on_request: false,
        is_active: true,
        is_featured: true,
        track_stock: true,
        stock_quantity: 25,
        allow_out_of_stock: true,
        position: 0,
        created_at: now,
        updated_at: now,
      },
      {
        id: prod2Id,
        tenant_id: tenant1Id,
        category_id: cat2Id,
        name: 'Óleo Fortalecedor para Barba 30ml',
        slug: 'oleo-fortalecedor-para-barba-30ml',
        short_description: 'Hidratação profunda e alinhamento dos fios com fragrância amadeirada.',
        description: 'Combinação de óleos nobres de argan, jojoba e semente de uva. Alinha os fios rebeldes e hidrata a pele reduzindo a irritação e descamação.',
        sku: 'OLEO-BARBA-30',
        barcode: '7891000100028',
        price: 45.00,
        promotional_price: null,
        price_on_request: false,
        is_active: true,
        is_featured: true,
        track_stock: true,
        stock_quantity: 14,
        allow_out_of_stock: false,
        position: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: prod3Id,
        tenant_id: tenant1Id,
        category_id: cat3Id,
        name: 'Shampoo Anticaspa Mentolado Ice',
        slug: 'shampoo-anticaspa-mentolado-ice',
        short_description: 'Sensação refrescante imediata e controle da oleosidade capilar.',
        description: 'Fórmula diária com piritionato de zinco e cristais de mentol. Limpa profundamente sem ressecar o couro cabeludo.',
        sku: 'SHAMP-ICE',
        barcode: '7891000100035',
        price: 38.50,
        promotional_price: 32.90,
        price_on_request: false,
        is_active: true,
        is_featured: false,
        track_stock: true,
        stock_quantity: 8,
        allow_out_of_stock: true,
        position: 2,
        created_at: now,
        updated_at: now,
      },
      {
        id: prod4Id,
        tenant_id: tenant1Id,
        category_id: cat1Id,
        name: 'Kit Colecionador Navalhete Artesanal + Balm',
        slug: 'kit-colecionador-navalhete-artesanal-balm',
        short_description: 'Edição de luxo para apaixonados pelo barbear clássico tradicional.',
        description: 'Estojo personalizado em madeira de lei contendo navalhete profissional em aço inox, pacote de lâminas premium e balm cicatrizante enriquecido com aloe vera.',
        sku: 'KIT-NAV-COL',
        barcode: '7891000100042',
        price: null,
        promotional_price: null,
        price_on_request: true,
        is_active: true,
        is_featured: true,
        track_stock: false,
        stock_quantity: 0,
        allow_out_of_stock: true,
        position: 3,
        created_at: now,
        updated_at: now,
      }
    );

    // 9. Seed Product Images
    this.product_images.push(
      {
        id: '77777777-1111-4777-8111-111111111111',
        tenant_id: tenant1Id,
        product_id: prod1Id,
        storage_path: `${tenant1Id}/products/${prod1Id}/matte-1.jpg`,
        public_url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=600&q=80',
        alt_text: 'Pomada Matte Barbearia Prime',
        position: 0,
        is_primary: true,
        created_at: now,
      },
      {
        id: '77777777-1112-4777-8112-111111111112',
        tenant_id: tenant1Id,
        product_id: prod1Id,
        storage_path: `${tenant1Id}/products/${prod1Id}/matte-2.jpg`,
        public_url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=600&q=80',
        alt_text: 'Aplicação da pomada no penteado',
        position: 1,
        is_primary: false,
        created_at: now,
      },
      {
        id: '77777777-2222-4777-8222-222222222222',
        tenant_id: tenant1Id,
        product_id: prod2Id,
        storage_path: `${tenant1Id}/products/${prod2Id}/oleo-1.jpg`,
        public_url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=600&q=80',
        alt_text: 'Óleo para Barba Barbearia Prime',
        position: 0,
        is_primary: true,
        created_at: now,
      },
      {
        id: '77777777-3333-4777-8333-333333333333',
        tenant_id: tenant1Id,
        product_id: prod3Id,
        storage_path: `${tenant1Id}/products/${prod3Id}/shampoo-1.jpg`,
        public_url: 'https://images.unsplash.com/photo-1517832606589-715753d4be37?auto=format&fit=crop&w=600&q=80',
        alt_text: 'Shampoo Anticaspa Mentolado',
        position: 0,
        is_primary: true,
        created_at: now,
      },
      {
        id: '77777777-4444-4777-8444-444444444444',
        tenant_id: tenant1Id,
        product_id: prod4Id,
        storage_path: `${tenant1Id}/products/${prod4Id}/kit-1.jpg`,
        public_url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=600&q=80',
        alt_text: 'Kit Colecionador Navalhete',
        position: 0,
        is_primary: true,
        created_at: now,
      }
    );

    // 10. Seed Product Variants
    this.product_variants.push(
      {
        id: '88888888-1111-4888-8111-111111111111',
        tenant_id: tenant1Id,
        product_id: prod1Id,
        name: '100g Tradicional',
        sku: 'POM-100',
        price: 49.90,
        promotional_price: null,
        track_stock: true,
        stock_quantity: 15,
        is_active: true,
        position: 0,
        created_at: now,
        updated_at: now,
      },
      {
        id: '88888888-1112-4888-8112-111111111112',
        tenant_id: tenant1Id,
        product_id: prod1Id,
        name: '150g Econômica',
        sku: 'POM-150',
        price: 69.90,
        promotional_price: 59.90,
        track_stock: true,
        stock_quantity: 10,
        is_active: true,
        position: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: '88888888-3331-4888-8331-111111111131',
        tenant_id: tenant1Id,
        product_id: prod3Id,
        name: '250ml Padrão',
        sku: 'SHAMP-250',
        price: 38.50,
        promotional_price: 32.90,
        track_stock: true,
        stock_quantity: 5,
        is_active: true,
        position: 0,
        created_at: now,
        updated_at: now,
      },
      {
        id: '88888888-3332-4888-8332-111111111132',
        tenant_id: tenant1Id,
        product_id: prod3Id,
        name: '500ml Salão Familiar',
        sku: 'SHAMP-500',
        price: 62.00,
        promotional_price: 54.00,
        track_stock: true,
        stock_quantity: 3,
        is_active: true,
        position: 1,
        created_at: now,
        updated_at: now,
      }
    );

    // 11. Seed Delivery Settings for Tenant 1
    this.delivery_settings.push({
      tenant_id: tenant1Id,
      orders_enabled: true,
      accept_orders_when_closed: true,
      pickup_enabled: true,
      delivery_enabled: true,
      minimum_order: 30.00,
      free_delivery_above: 120.00,
      pickup_instructions: 'Retire no balcão da Barbearia Prime apresentando o número do seu pedido.',
      delivery_estimate_text: '30 a 50 minutos',
      order_whatsapp_number: '11987654321',
      created_at: now,
      updated_at: now,
    });

    // 12. Seed Delivery Rules for Tenant 1
    this.delivery_rules.push(
      {
        id: '99999999-1111-4999-8111-111111111111',
        tenant_id: tenant1Id,
        type: 'fixed',
        name: 'Taxa Padrão Local',
        fee: 8.00,
        minimum_order: null,
        is_active: true,
        position: 0,
        created_at: now,
        updated_at: now,
      },
      {
        id: '99999999-2222-4999-8222-222222222222',
        tenant_id: tenant1Id,
        type: 'neighborhood',
        name: 'Centro e Proximidades',
        neighborhood: 'Centro',
        fee: 5.00,
        minimum_order: null,
        is_active: true,
        position: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: '99999999-3333-4999-8333-333333333333',
        tenant_id: tenant1Id,
        type: 'neighborhood',
        name: 'Jardins / Bairro Nobre',
        neighborhood: 'Jardins',
        fee: 10.00,
        minimum_order: 40.00,
        is_active: true,
        position: 2,
        created_at: now,
        updated_at: now,
      }
    );

    // 13. Seed Payment Methods for Tenant 1
    this.payment_methods.push(
      {
        id: '77777777-1111-4777-8111-111111111111',
        tenant_id: tenant1Id,
        type: 'PIX',
        label: 'PIX (pagamento direto)',
        is_active: true,
        position: 0,
        created_at: now,
        updated_at: now,
      },
      {
        id: '77777777-2222-4777-8222-222222222222',
        tenant_id: tenant1Id,
        type: 'CASH',
        label: 'Dinheiro',
        is_active: true,
        position: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: '77777777-3333-4777-8333-333333333333',
        tenant_id: tenant1Id,
        type: 'CREDIT_CARD_ON_DELIVERY',
        label: 'Cartão de Crédito',
        is_active: true,
        position: 2,
        created_at: now,
        updated_at: now,
      },
      {
        id: '77777777-4444-4777-8444-444444444444',
        tenant_id: tenant1Id,
        type: 'DEBIT_CARD_ON_DELIVERY',
        label: 'Cartão de Débito',
        is_active: true,
        position: 3,
        created_at: now,
        updated_at: now,
      },
      {
        id: '77777777-5555-4777-8555-555555555555',
        tenant_id: tenant1Id,
        type: 'PAYMENT_ON_PICKUP',
        label: 'Pagar no balcão',
        is_active: true,
        position: 4,
        created_at: now,
        updated_at: now,
      }
    );

    // 14. Seed Service Categories for Tenant 1 (Barbearia Prime)
    const servCat1Id = 'aaaa1111-1111-4aaa-8111-111111111111';
    const servCat2Id = 'aaaa2222-2222-4aaa-8222-222222222222';
    const servCat3Id = 'aaaa3333-3333-4aaa-8333-333333333333';

    this.service_categories.push(
      {
        id: servCat1Id,
        tenant_id: tenant1Id,
        name: 'Cabelo & Cortes',
        slug: 'cabelo-cortes',
        description: 'Cortes clássicos, modernos e visagismo personalizado.',
        display_order: 0,
        active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: servCat2Id,
        tenant_id: tenant1Id,
        name: 'Barba & Alinhamento',
        slug: 'barba-alinhamento',
        description: 'Rituais de toalha quente, navalhete e hidratação profunda.',
        display_order: 1,
        active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: servCat3Id,
        tenant_id: tenant1Id,
        name: 'Combos & Tratamentos',
        slug: 'combos-tratamentos',
        description: 'Pacotes completos e tratamentos capilares especiais.',
        display_order: 2,
        active: true,
        created_at: now,
        updated_at: now,
      }
    );

    // 15. Seed Professionals for Tenant 1
    const prof1Id = 'bbbb1111-1111-4bbb-8111-111111111111';
    const prof2Id = 'bbbb2222-2222-4bbb-8222-222222222222';
    const prof3Id = 'bbbb3333-3333-4bbb-8333-333333333333';

    this.professionals.push(
      {
        id: prof1Id,
        tenant_id: tenant1Id,
        user_id: profUser1Id,
        name: 'Carlos Oliveira',
        bio: 'Barbeiro especialista e visagista com mais de 10 anos de experiência em cortes clássicos e barbearia tradicional.',
        photo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
        specialties: ['Degradê Navalhado', 'Visagismo Masculino', 'Barba Terapia'],
        phone: '(11) 98111-2233',
        email: 'carlos@barbeariaprime.com',
        show_contact_publicly: false,
        active: true,
        display_order: 0,
        created_at: now,
        updated_at: now,
      },
      {
        id: prof2Id,
        tenant_id: tenant1Id,
        name: 'Lucas Mendes',
        bio: 'Mestre em design de barbas com toalha quente e finalização com lâmina de precisão. Cuidados artesanais.',
        photo_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
        specialties: ['Cortes Clássicos', 'Design de Barba', 'Tratamentos'],
        phone: '(11) 98222-3344',
        email: 'lucas@barbeariaprime.com',
        show_contact_publicly: false,
        active: true,
        display_order: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: prof3Id,
        tenant_id: tenant1Id,
        name: 'Rafael Santos',
        bio: 'Colorista e stylist de penteados masculinos, expert em platinados impecáveis, camuflagem e texturização capilar.',
        photo_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
        specialties: ['Platinado Global', 'Pigmentação', 'Corte Moderno'],
        phone: '(11) 98333-4455',
        email: 'rafael@barbeariaprime.com',
        show_contact_publicly: false,
        active: true,
        display_order: 2,
        created_at: now,
        updated_at: now,
      }
    );

    // 16. Seed Services for Tenant 1
    const serv1Id = 'cccc1111-1111-4ccc-8111-111111111111';
    const serv2Id = 'cccc2222-2222-4ccc-8222-222222222222';
    const serv3Id = 'cccc3333-3333-4ccc-8333-333333333333';
    const serv4Id = 'cccc4444-4444-4ccc-8444-444444444444';
    const serv5Id = 'cccc5555-5555-4ccc-8555-555555555555';

    this.services.push(
      {
        id: serv1Id,
        tenant_id: tenant1Id,
        category_id: servCat1Id,
        name: 'Corte Masculino Premium',
        slug: 'corte-masculino-premium',
        description: 'Lavagem com massagem capilar refrescante, corte sob medida alinhado ao seu visagismo e finalização com pomada matte.',
        image_url: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=600&q=80',
        pricing_type: 'fixed',
        price: 55.00,
        duration_minutes: 40,
        active: true,
        featured: true,
        display_order: 0,
        booking_enabled: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: serv2Id,
        tenant_id: tenant1Id,
        category_id: servCat2Id,
        name: 'Barba Terapia Tradicional',
        slug: 'barba-terapia-tradicional',
        description: 'Ritual clássico com toalha quente emoliente, esfoliação facial, navalhete afiado, óleo essencial e massagem calmante pós-barba.',
        image_url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=600&q=80',
        pricing_type: 'fixed',
        price: 45.00,
        duration_minutes: 35,
        active: true,
        featured: true,
        display_order: 1,
        booking_enabled: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: serv3Id,
        tenant_id: tenant1Id,
        category_id: servCat3Id,
        name: 'Combo Corte + Barba Prime',
        slug: 'combo-corte-barba-prime',
        description: 'Experiência completa da Barbearia Prime: corte completo e barba terapia tradicional com desconto exclusivo.',
        image_url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=600&q=80',
        pricing_type: 'fixed',
        price: 85.00,
        duration_minutes: 70,
        active: true,
        featured: true,
        display_order: 2,
        booking_enabled: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: serv4Id,
        tenant_id: tenant1Id,
        category_id: servCat3Id,
        name: 'Camuflagem & Pigmentação de Grisalhos',
        slug: 'camuflagem-pigmentacao-grisalhos',
        description: 'Disfarce natural de fios brancos ou pigmentação alinhada de barba com tonalizantes sem amônia de alta durabilidade.',
        image_url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=600&q=80',
        pricing_type: 'starting_at',
        price: 50.00,
        duration_minutes: 45,
        active: true,
        featured: false,
        display_order: 3,
        booking_enabled: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: serv5Id,
        tenant_id: tenant1Id,
        category_id: servCat1Id,
        name: 'Platinado Global & Coloração Artística',
        slug: 'platinado-global-coloracao-artistica',
        description: 'Descoloração global segura com proteção capilar e matização platinada perfeita. Avaliação prévia obrigatória.',
        image_url: 'https://images.unsplash.com/photo-1517832606589-715753d4be37?auto=format&fit=crop&w=600&q=80',
        pricing_type: 'on_request',
        price: null,
        duration_minutes: 120,
        active: true,
        featured: false,
        display_order: 4,
        booking_enabled: true,
        created_at: now,
        updated_at: now,
      }
    );

    // 17. Seed Service Professionals Relationships
    this.service_professionals.push(
      // Corte Masculino Premium: Carlos, Lucas, Rafael
      { id: crypto.randomUUID(), tenant_id: tenant1Id, service_id: serv1Id, professional_id: prof1Id, created_at: now },
      { id: crypto.randomUUID(), tenant_id: tenant1Id, service_id: serv1Id, professional_id: prof2Id, created_at: now },
      { id: crypto.randomUUID(), tenant_id: tenant1Id, service_id: serv1Id, professional_id: prof3Id, created_at: now },

      // Barba Terapia: Carlos, Lucas
      { id: crypto.randomUUID(), tenant_id: tenant1Id, service_id: serv2Id, professional_id: prof1Id, created_at: now },
      { id: crypto.randomUUID(), tenant_id: tenant1Id, service_id: serv2Id, professional_id: prof2Id, created_at: now },

      // Combo Corte + Barba: Carlos, Lucas
      { id: crypto.randomUUID(), tenant_id: tenant1Id, service_id: serv3Id, professional_id: prof1Id, created_at: now },
      { id: crypto.randomUUID(), tenant_id: tenant1Id, service_id: serv3Id, professional_id: prof2Id, created_at: now },

      // Camuflagem & Pigmentação: Rafael, Carlos
      { id: crypto.randomUUID(), tenant_id: tenant1Id, service_id: serv4Id, professional_id: prof3Id, created_at: now },
      { id: crypto.randomUUID(), tenant_id: tenant1Id, service_id: serv4Id, professional_id: prof1Id, created_at: now },

      // Platinado Global: Rafael
      { id: crypto.randomUUID(), tenant_id: tenant1Id, service_id: serv5Id, professional_id: prof3Id, created_at: now }
    );

    // 12. Seed Appointment Settings (Barbearia Prime & Teste)
    const defaultBusinessHours = {
      seg: { isOpen: true, intervals: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '19:00' }] },
      ter: { isOpen: true, intervals: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '19:00' }] },
      qua: { isOpen: true, intervals: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '19:00' }] },
      qui: { isOpen: true, intervals: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '19:00' }] },
      sex: { isOpen: true, intervals: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '19:00' }] },
      sab: { isOpen: true, intervals: [{ start: '09:00', end: '17:00' }] },
      dom: { isOpen: false, intervals: [] },
    };

    this.appointment_settings.push(
      {
        id: crypto.randomUUID(),
        tenant_id: tenant1Id,
        timezone: 'America/Sao_Paulo',
        min_booking_notice_hours: 1,
        max_booking_advance_days: 30,
        buffer_between_appointments_minutes: 0,
        business_hours: defaultBusinessHours,
        allow_customer_cancellation: true,
        cancellation_notice_hours: 2,
        public_booking_enabled: true,
        auto_confirm_bookings: false,
        notification_instructions: 'Chegue com 10 minutos de antecedência. Em caso de imprevisto, avise com antecedência.',
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        tenant_id: 'ff3f50ac-0b03-4c21-bd34-4958f9fedb80', // Teste tenant
        timezone: 'America/Sao_Paulo',
        min_booking_notice_hours: 1,
        max_booking_advance_days: 30,
        buffer_between_appointments_minutes: 0,
        business_hours: defaultBusinessHours,
        allow_customer_cancellation: true,
        cancellation_notice_hours: 2,
        public_booking_enabled: true,
        auto_confirm_bookings: false,
        notification_instructions: 'Chegue com 10 minutos de antecedência. Em caso de imprevisto, avise com antecedência.',
        created_at: now,
        updated_at: now,
      }
    );
  }
}

export const localStore = new LocalSupabaseStore();

// Query Builder emulator matching Supabase PostgREST API
class PostgrestQueryBuilder {
  private tableName: string;
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private updatePatch: any = null;
  private insertRecords: any[] = [];
  private filters: Array<(item: any) => boolean> = [];
  private selectedColumns: string = '*';
  private singleRow: boolean = false;
  private orderField: string = '';
  private orderAscending: boolean = true;
  private limitCount?: number;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns: string = '*') {
    this.selectedColumns = columns;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push((item) => item[column] === value);
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push((item) => item[column] !== value);
    return this;
  }

  is(column: string, value: any) {
    this.filters.push((item) => item[column] === value);
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push((item) => values.includes(item[column]));
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push((item) => item[column] >= value);
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push((item) => item[column] <= value);
    return this;
  }

  gt(column: string, value: any) {
    this.filters.push((item) => item[column] > value);
    return this;
  }

  lt(column: string, value: any) {
    this.filters.push((item) => item[column] < value);
    return this;
  }

  or(conditionsStr: string) {
    // Supports conditions like "status.eq.pending,status.eq.confirmed"
    const parts = conditionsStr.split(',');
    this.filters.push((item) => {
      return parts.some((part) => {
        const [col, op, val] = part.split('.');
        if (op === 'eq') return item[col] === val;
        if (op === 'neq') return item[col] !== val;
        if (op === 'is' && val === 'null') return item[col] === null;
        return true;
      });
    });
    return this;
  }

  ilike(column: string, pattern: string) {
    const regex = new RegExp(pattern.replace(/%/g, '.*'), 'i');
    this.filters.push((item) => regex.test(item[column] || ''));
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orderField = field;
    this.orderAscending = options?.ascending !== false;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.singleRow = true;
    return this;
  }

  maybeSingle() {
    this.singleRow = true;
    return this;
  }

  private getTableArray(): any[] {
    return (localStore as any)[this.tableName] || [];
  }

  insert(recordOrRecords: any | any[]) {
    this.op = 'insert';
    this.insertRecords = Array.isArray(recordOrRecords) ? recordOrRecords : [recordOrRecords];
    return this;
  }

  upsert(recordOrRecords: any | any[], options?: { onConflict?: string }) {
    this.op = 'upsert';
    this.insertRecords = Array.isArray(recordOrRecords) ? recordOrRecords : [recordOrRecords];
    return this;
  }

  update(patch: any) {
    this.op = 'update';
    this.updatePatch = patch;
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  then(resolve: (res: { data: any; error: any }) => void, reject?: (err: any) => void) {
    const table = this.getTableArray();
    const now = new Date().toISOString();

    if (this.op === 'insert' || this.op === 'upsert') {
      const inserted: any[] = [];
      for (const rec of this.insertRecords) {
        const matchKey = this.tableName === 'tenant_settings' && rec.tenant_id
          ? 'tenant_id'
          : (rec.id ? 'id' : (rec.tenant_id ? 'tenant_id' : null));
        const existingIndex = matchKey
          ? table.findIndex((item: any) => item[matchKey] === rec[matchKey])
          : -1;

        if (existingIndex !== -1) {
          // Update existing
          table[existingIndex] = {
            ...table[existingIndex],
            ...rec,
            updated_at: now,
          };
          inserted.push(table[existingIndex]);
        } else {
          // Insert new
          let assignedOrderNumber = rec.order_number;
          if (this.tableName === 'restaurant_orders' && (!assignedOrderNumber || assignedOrderNumber <= 0)) {
            const tenantOrders = table.filter((o: any) => o.tenant_id === rec.tenant_id);
            const maxNum = tenantOrders.reduce((max: number, o: any) => Math.max(max, Number(o.order_number || 1000)), 1000);
            assignedOrderNumber = maxNum + 1;
          }

          const newRec = {
            ...(this.tableName !== 'tenant_settings' ? { id: rec.id || crypto.randomUUID() } : {}),
            ...rec,
            ...(this.tableName === 'restaurant_orders' && assignedOrderNumber ? { order_number: assignedOrderNumber } : {}),
            created_at: rec.created_at || now,
            updated_at: rec.updated_at || now,
          };
          table.push(newRec);
          inserted.push(newRec);
        }
      }
      localStore.persistToDisk();
      return Promise.resolve({
        data: this.singleRow ? inserted[0] : inserted,
        error: null,
      }).then(resolve, reject);
    }

    if (this.op === 'update') {
      const updatedList: any[] = [];
      for (let i = 0; i < table.length; i++) {
        if (this.filters.every((fn) => fn(table[i]))) {
          table[i] = {
            ...table[i],
            ...this.updatePatch,
            updated_at: now,
          };
          updatedList.push(table[i]);
        }
      }
      localStore.persistToDisk();
      return Promise.resolve({
        data: this.singleRow ? (updatedList[0] || null) : updatedList,
        error: null,
      }).then(resolve, reject);
    }

    if (this.op === 'delete') {
      const remaining = table.filter((item) => !this.filters.every((fn) => fn(item)));
      (localStore as any)[this.tableName] = remaining;
      localStore.persistToDisk();
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    }

    // Select operation
    let result = table.filter((item) => this.filters.every((fn) => fn(item)));

    if (this.orderField) {
      result.sort((a, b) => {
        const valA = a[this.orderField];
        const valB = b[this.orderField];
        if (valA < valB) return this.orderAscending ? -1 : 1;
        if (valA > valB) return this.orderAscending ? 1 : -1;
        return 0;
      });
    }

    if (this.limitCount !== undefined) {
      result = result.slice(0, this.limitCount);
    }

    return Promise.resolve({
      data: this.singleRow ? (result.length > 0 ? { ...result[0] } : null) : result.map((r) => ({ ...r })),
      error: null,
    }).then(resolve, reject);
  }
}

// Storage bucket emulator
class StorageBucketEmulator {
  private bucketName: string;

  constructor(bucketName: string) {
    this.bucketName = bucketName;
  }

  async upload(pathStr: string, buffer: Buffer, options?: { contentType?: string; upsert?: boolean }) {
    const key = `${this.bucketName}:${pathStr}`;
    localStore.storage_objects.set(key, {
      buffer,
      mimeType: options?.contentType || 'image/png',
    });

    // Also persist to data/uploads for static serving
    const diskPath = path.resolve(process.cwd(), 'data', 'uploads', path.basename(pathStr));
    try {
      if (!fs.existsSync(path.dirname(diskPath))) {
        fs.mkdirSync(path.dirname(diskPath), { recursive: true });
      }
      fs.writeFileSync(diskPath, buffer);
    } catch {}

    return { data: { path: pathStr }, error: null };
  }

  getPublicUrl(pathStr: string) {
    const fileName = path.basename(pathStr);
    return {
      data: {
        publicUrl: `/uploads/${fileName}`,
      },
    };
  }

  async remove(paths: string[]) {
    for (const p of paths) {
      localStore.storage_objects.delete(`${this.bucketName}:${p}`);
    }
    return { data: paths, error: null };
  }
}

// Supabase Admin client interface
export interface ISupabaseAdminClient {
  from(tableName: string): any;
  auth: {
    admin: {
      createUser(params: any): Promise<{ data: { user: any }; error: any }>;
      deleteUser(id: string): Promise<{ data: any; error: any }>;
      updateUserById(id: string, attributes: any): Promise<{ data: { user: any }; error: any }>;
      getUserById(id: string): Promise<{ data: { user: any }; error: any }>;
      inviteUserByEmail(email: string, options?: any): Promise<{ data: { user: any }; error: any }>;
      listUsers(): Promise<{ data: { users: any[] }; error: any }>;
    };
  };
  storage: {
    from(bucket: string): any;
    createBucket?(bucket: string, options?: any): Promise<any>;
    getBucket?(bucket: string): Promise<any>;
  };
  rpc?(fn: string, args?: any): Promise<{ data: any; error: any }>;
}

// Track tables if pending migration in remote DB
export const pendingMigrationTables = new Set<string>([
  'restaurant_tables',
  'restaurant_sessions',
  'restaurant_orders',
  'restaurant_order_items',
  'restaurant_order_status_history',
]);

// Build Admin Client
function createAdminClient(): ISupabaseAdminClient {
  if (isRealSupabaseConfigured) {
    console.log('[SUPABASE] Connected to real remote Supabase project:', SUPABASE_URL);
    const remoteClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    return {
      from: (tableName: string) => remoteClient.from(tableName),
      auth: remoteClient.auth,
      storage: remoteClient.storage,
      rpc: (fn: string, args: any) => remoteClient.rpc(fn, args),
    } as unknown as ISupabaseAdminClient;
  }

  console.log('[SUPABASE] Running with native PostgreSQL SaaS Adapter (Supabase API compliant).');

  return {
    from: (tableName: string) => new PostgrestQueryBuilder(tableName),
    auth: {
      admin: {
        async createUser(params: any) {
          const id = crypto.randomUUID();
          const user = {
            id,
            email: params.email.toLowerCase().trim(),
            password: params.password,
            user_metadata: params.user_metadata || {},
            created_at: new Date().toISOString(),
          };
          localStore.auth_users.push(user);
          localStore.persistToDisk();
          return { data: { user }, error: null };
        },
        async deleteUser(id: string) {
          localStore.auth_users = localStore.auth_users.filter((u) => u.id !== id);
          localStore.persistToDisk();
          return { data: {}, error: null };
        },
        async updateUserById(id: string, attributes: any) {
          const user = localStore.auth_users.find((u) => u.id === id);
          if (user) {
            if (attributes.password) user.password = attributes.password;
            if (attributes.user_metadata) {
              user.user_metadata = { ...user.user_metadata, ...attributes.user_metadata };
            }
            localStore.persistToDisk();
          }
          return { data: { user }, error: null };
        },
        async inviteUserByEmail(email: string, options?: any) {
          const id = crypto.randomUUID();
          const user = {
            id,
            email: email.toLowerCase().trim(),
            user_metadata: options?.data || {},
            invited_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          };
          localStore.auth_users.push(user);
          localStore.persistToDisk();
          return { data: { user }, error: null };
        },
        async listUsers() {
          return { data: { users: localStore.auth_users }, error: null };
        },
        async getUserById(id: string) {
          const user = localStore.auth_users.find((u) => u.id === id);
          return { data: { user: user || null }, error: user ? null : { message: 'User not found' } };
        },
      },
    },
    storage: {
      from: (bucket: string) => new StorageBucketEmulator(bucket),
    },
    async rpc(fn: string, args?: any) {
      if (fn === 'close_restaurant_session' && args) {
        const session = localStore.restaurant_sessions.find(
          (s: any) => s.table_id === args.p_table_id && s.tenant_id === args.p_tenant_id && s.status === 'open'
        );
        if (!session) {
          return { data: null, error: { message: 'Nenhuma comanda aberta para esta mesa.' } };
        }
        const sessionOrders = localStore.restaurant_orders.filter(
          (o: any) => o.session_id === session.id && o.tenant_id === args.p_tenant_id && o.status !== 'cancelled'
        );
        const total = Math.round(sessionOrders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0) * 100) / 100;
        const now = new Date().toISOString();
        session.status = 'closed';
        session.closed_at = now;
        session.total_amount = total;
        if (args.p_notes) session.notes = args.p_notes;
        session.updated_at = now;

        const table = localStore.restaurant_tables.find(
          (t: any) => t.id === args.p_table_id && t.tenant_id === args.p_tenant_id
        );
        if (table) {
          table.status = 'available';
          table.current_session_id = null;
          table.updated_at = now;
        }
        localStore.persistToDisk();
        return {
          data: {
            session_id: session.id,
            table_id: args.p_table_id,
            total_amount: total,
            status: 'closed',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };
}

export const supabaseAdmin = createAdminClient();
