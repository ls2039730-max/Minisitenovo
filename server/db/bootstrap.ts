import { supabaseAdmin, isRealSupabaseConfigured, getSupabaseAuthClient } from '../supabaseAdmin.js';
import { SYSTEM_FEATURES } from '../../src/utils/features.js';

let bootstrapDone = false;

export async function bootstrapDatabaseIfNeeded(): Promise<void> {
  if (bootstrapDone) return;
  bootstrapDone = true;

  try {
    console.log('[BOOTSTRAP] Checking database initial state...');

    // 1. Ensure Super Admin users exist in Auth and tenant_users
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
    const superAdminEmails = ['admin@localhub.com', 'ls2039730@gmail.com'];

    for (const email of superAdminEmails) {
      let adminUser = usersData?.users?.find(
        (u: any) => u.email?.toLowerCase().trim() === email
      );

      if (!adminUser) {
        console.log(`[BOOTSTRAP] Creating default Super Admin user (${email})...`);
        const createRes = await supabaseAdmin.auth.admin.createUser({
          email,
          password: 'admin123',
          email_confirm: true,
          user_metadata: {
            name: 'Administrador da Plataforma',
            phone: '(11) 99999-0000',
          },
        });
        adminUser = createRes.data?.user;
      }

      if (adminUser) {
        console.log(`[BOOTSTRAP] Confirming email & updating password for Super Admin ${email}...`);
        await supabaseAdmin.auth.admin.updateUserById(adminUser.id, {
          password: 'admin123',
          email_confirm: true,
        }).catch((e) => console.warn('[BOOTSTRAP] Could not sync admin user in Supabase:', e.message));

        const { data: adminTu } = await supabaseAdmin
          .from('tenant_users')
          .select('*')
          .eq('user_id', adminUser.id);

        if (!adminTu || adminTu.length === 0) {
          console.log(`[BOOTSTRAP] Linking Super Admin ${email} in tenant_users...`);
          const nowIso = new Date().toISOString();
          await supabaseAdmin.from('tenant_users').insert({
            id: crypto.randomUUID(),
            tenant_id: null,
            user_id: adminUser.id,
            role: 'SUPER_ADMIN',
            status: 'active',
            created_at: nowIso,
            updated_at: nowIso,
          });
        }
      }
    }

    // 2. Ensure Plans exist
    const { data: existingPlans } = await supabaseAdmin.from('plans').select('*');
    const planProId = '22222222-2222-4222-8222-222222222222';

    if (!existingPlans || existingPlans.length === 0) {
      console.log('[BOOTSTRAP] Seeding plans...');
      const now = new Date().toISOString();
      await supabaseAdmin.from('plans').insert([
        {
          id: '11111111-1111-4111-8111-111111111111',
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
          id: '33333333-3333-4333-8333-333333333333',
          name: 'Premium',
          description: 'Solução completa com delivery, catálogo de produtos, Wi-Fi marketing e domínio próprio.',
          price: 299.0,
          status: 'active',
          created_at: now,
          updated_at: now,
        },
      ]);
    }

    // 3. Ensure Barbearia Prime Tenant exists (unless explicitly deleted by user)
    const { data: existingTenants } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('slug', 'barbearia-prime');

    const tenantDeleted = existingTenants && existingTenants.length > 0 && existingTenants[0].deleted_at !== null;
    
    let wasExplicitlyDeleted = tenantDeleted;
    if (!wasExplicitlyDeleted) {
      try {
        const { data: deleteAudit } = await supabaseAdmin
          .from('audit_logs')
          .select('*')
          .eq('action', 'TENANT_SOFT_DELETE')
          .eq('tenant_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
          .limit(1);
        if (deleteAudit && deleteAudit.length > 0) {
          wasExplicitlyDeleted = true;
        }
      } catch (e) {
        // audit logs table might not exist or query error
      }
    }

    const tenant1Id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const now = new Date().toISOString();

    if (!wasExplicitlyDeleted && (!existingTenants || existingTenants.length === 0)) {
      console.log('[BOOTSTRAP] Creating default tenant Barbearia Prime...');
      await supabaseAdmin.from('tenants').insert({
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
        street: 'Rua Augusta',
        number: '1500',
        neighborhood: 'Consolação',
        city: 'São Paulo',
        state: 'SP',
        cep: '01304-001',
        notes: 'Cliente pioneiro com contrato anual assinado.',
        deleted_at: null,
        created_at: now,
        updated_at: now,
      });

      await supabaseAdmin.from('tenant_settings').insert({
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

      // Enable sales & catalog features on Barbearia Prime
      await supabaseAdmin.from('tenant_features').insert([
        { tenant_id: tenant1Id, feature_key: 'products', is_enabled: true },
        { tenant_id: tenant1Id, feature_key: 'shopping_cart', is_enabled: true },
        { tenant_id: tenant1Id, feature_key: 'delivery', is_enabled: true },
        { tenant_id: tenant1Id, feature_key: 'whatsapp', is_enabled: true },
        { tenant_id: tenant1Id, feature_key: 'site_editor', is_enabled: true },
      ]);
    }

    // 4. Ensure Barbearia Prime User exists in Auth and tenant_users
    let clientUser = usersData?.users?.find(
      (u: any) => u.email?.toLowerCase().trim() === 'contato@barbeariaprime.com'
    );

    if (!clientUser) {
      console.log('[BOOTSTRAP] Creating default Client Admin user (contato@barbeariaprime.com)...');
      const createClientRes = await supabaseAdmin.auth.admin.createUser({
        email: 'contato@barbeariaprime.com',
        password: 'cliente123',
        email_confirm: true,
        user_metadata: {
          name: 'Carlos Eduardo Silva',
          phone: '(11) 98765-4321',
        },
      });
      clientUser = createClientRes.data?.user;
    }

    if (clientUser) {
      console.log('[BOOTSTRAP] Updating Client Admin password & confirming email in Supabase Auth...');
      await supabaseAdmin.auth.admin.updateUserById(clientUser.id, {
        password: 'cliente123',
        email_confirm: true,
      }).catch((e) => console.warn('[BOOTSTRAP] Could not sync client user in Supabase:', e.message));

      const { data: clientTu } = await supabaseAdmin
        .from('tenant_users')
        .select('*')
        .eq('user_id', clientUser.id);

      if (!clientTu || clientTu.length === 0) {
        console.log('[BOOTSTRAP] Linking Client Admin in tenant_users...');
        await supabaseAdmin.from('tenant_users').insert({
          id: crypto.randomUUID(),
          tenant_id: tenant1Id,
          user_id: clientUser.id,
          role: 'CLIENT_ADMIN',
          status: 'active',
          created_at: now,
          updated_at: now,
        });
      }
    }

    // 4b. Ensure Professional user exists (carlos@barbeariaprime.com) with role PROFESSIONAL
    let profUser = usersData?.users?.find(
      (u: any) => u.email?.toLowerCase().trim() === 'carlos@barbeariaprime.com'
    );

    if (!profUser) {
      console.log('[BOOTSTRAP] Creating default Professional user (carlos@barbeariaprime.com)...');
      const createProfRes = await supabaseAdmin.auth.admin.createUser({
        email: 'carlos@barbeariaprime.com',
        password: 'pro123',
        email_confirm: true,
        user_metadata: {
          name: 'Carlos Oliveira (Barbeiro)',
          phone: '(11) 98111-2233',
        },
      });
      profUser = createProfRes.data?.user;
    }

    if (profUser) {
      await supabaseAdmin.auth.admin.updateUserById(profUser.id, {
        password: 'pro123',
        email_confirm: true,
      }).catch(() => {});

      const { data: profTu } = await supabaseAdmin
        .from('tenant_users')
        .select('*')
        .eq('user_id', profUser.id);

      if (!profTu || profTu.length === 0) {
        console.log('[BOOTSTRAP] Linking Professional user in tenant_users...');
        await supabaseAdmin.from('tenant_users').insert({
          id: crypto.randomUUID(),
          tenant_id: tenant1Id,
          user_id: profUser.id,
          role: 'PROFESSIONAL',
          status: 'active',
          created_at: now,
          updated_at: now,
        });
      }
    }

    // 5. Ensure Delivery Settings & Payment Methods exist for Barbearia Prime
    const { data: existingDS } = await supabaseAdmin
      .from('delivery_settings')
      .select('*')
      .eq('tenant_id', tenant1Id);

    if (!existingDS || existingDS.length === 0) {
      console.log('[BOOTSTRAP] Seeding delivery settings and rules for Barbearia Prime...');
      await supabaseAdmin.from('delivery_settings').insert({
        tenant_id: tenant1Id,
        orders_enabled: true,
        accept_orders_when_closed: true,
        pickup_enabled: true,
        delivery_enabled: true,
        minimum_order: 30.0,
        free_delivery_above: 120.0,
        pickup_instructions: 'Retire no balcão da Barbearia Prime apresentando o número do seu pedido.',
        delivery_estimate_text: '30 a 50 minutos',
        order_whatsapp_number: '11987654321',
        created_at: now,
        updated_at: now,
      });

      await supabaseAdmin.from('delivery_rules').insert([
        {
          id: '88888888-1111-4888-8111-111111111111',
          tenant_id: tenant1Id,
          type: 'neighborhood',
          name: 'Consolação e Bela Vista',
          neighborhood: 'Consolação',
          fee: 8.0,
          minimum_order: 30.0,
          is_active: true,
          position: 0,
          created_at: now,
          updated_at: now,
        },
        {
          id: '88888888-2222-4888-8222-222222222222',
          tenant_id: tenant1Id,
          type: 'fixed',
          name: 'Demais Bairros Centro Expandido',
          fee: 14.0,
          minimum_order: 40.0,
          is_active: true,
          position: 1,
          created_at: now,
          updated_at: now,
        },
      ]);

      await supabaseAdmin.from('payment_methods').insert([
        { tenant_id: tenant1Id, type: 'PIX', label: 'Pix (Pagamento Imediato)', is_active: true, position: 0 },
        { tenant_id: tenant1Id, type: 'CASH', label: 'Dinheiro na Entrega / Balcão', is_active: true, position: 1 },
        { tenant_id: tenant1Id, type: 'CREDIT_CARD_ON_DELIVERY', label: 'Cartão de Crédito na Entrega', is_active: true, position: 2 },
        { tenant_id: tenant1Id, type: 'DEBIT_CARD_ON_DELIVERY', label: 'Cartão de Débito na Entrega', is_active: true, position: 3 },
        { tenant_id: tenant1Id, type: 'PAYMENT_ON_PICKUP', label: 'Pagar na Retirada no Local', is_active: true, position: 4 },
      ]);
    }

    // 6. Ensure Categories & Products exist for Barbearia Prime
    const { data: existingProds } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('tenant_id', tenant1Id);

    if (!existingProds || existingProds.length === 0) {
      console.log('[BOOTSTRAP] Seeding categories and products for Barbearia Prime...');
      const cat1Id = '55555555-1111-4555-8111-111111111111';
      const cat2Id = '55555555-2222-4555-8222-222222222222';
      const cat3Id = '55555555-3333-4555-8333-333333333333';

      await supabaseAdmin.from('product_categories').insert([
        {
          id: cat1Id,
          tenant_id: tenant1Id,
          name: 'Pomadas & Ceras',
          slug: 'pomadas-ceras',
          description: 'Finalizadores e fixadores profissionais de alta durabilidade.',
          image_url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=400&q=80',
          position: 0,
          is_active: true,
        },
        {
          id: cat2Id,
          tenant_id: tenant1Id,
          name: 'Óleos & Cuidados',
          slug: 'oleos-cuidados',
          description: 'Hidratação e nutrição para barba e pele.',
          image_url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=400&q=80',
          position: 1,
          is_active: true,
        },
        {
          id: cat3Id,
          tenant_id: tenant1Id,
          name: 'Shampoos & Tratamentos',
          slug: 'shampoos-tratamentos',
          description: 'Limpeza profunda com controle de oleosidade e caspa.',
          image_url: 'https://images.unsplash.com/photo-1517832606589-715753d4be37?auto=format&fit=crop&w=400&q=80',
          position: 2,
          is_active: true,
        },
      ]);

      const prod1Id = '66666666-1111-4666-8111-111111111111';
      const prod2Id = '66666666-2222-4666-8222-222222222222';
      const prod3Id = '66666666-3333-4666-8333-333333333333';

      await supabaseAdmin.from('products').insert([
        {
          id: prod1Id,
          tenant_id: tenant1Id,
          category_id: cat1Id,
          name: 'Pomada Modeladora Efeito Matte 100g',
          slug: 'pomada-modeladora-efeito-matte-100g',
          short_description: 'Fixação forte e acabamento natural sem brilho.',
          description: 'Pomada à base d água com fixação média-forte. Ideal para penteados estruturados com aspecto natural e sem resíduos.',
          sku: 'POM-MATTE-100',
          barcode: '7891000100011',
          price: 59.9,
          promotional_price: 49.9,
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
          description: 'Combinação de óleos nobres de argan, jojoba e semente de uva. Alinha os fios rebeldes e hidrata a pele.',
          sku: 'OLEO-BARBA-30',
          barcode: '7891000100028',
          price: 45.0,
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
          short_description: 'Sensação refrescante imediata com ação anticaspa e antifúngica.',
          description: 'Fórmula com extrato de menta e piritionato de zinco. Controla a descamação sem ressecar o couro cabeludo.',
          sku: 'SHAMP-ICE-250',
          barcode: '7891000100035',
          price: 38.0,
          promotional_price: 32.9,
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
      ]);

      await supabaseAdmin.from('product_images').insert([
        {
          tenant_id: tenant1Id,
          product_id: prod1Id,
          storage_path: 'products/pomada.jpg',
          public_url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=80',
          alt_text: 'Pomada Efeito Matte',
          position: 0,
          is_primary: true,
        },
        {
          tenant_id: tenant1Id,
          product_id: prod2Id,
          storage_path: 'products/oleo.jpg',
          public_url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=80',
          alt_text: 'Óleo para Barba',
          position: 0,
          is_primary: true,
        },
        {
          tenant_id: tenant1Id,
          product_id: prod3Id,
          storage_path: 'products/shampoo.jpg',
          public_url: 'https://images.unsplash.com/photo-1517832606589-715753d4be37?auto=format&fit=crop&w=800&q=80',
          alt_text: 'Shampoo Ice',
          position: 0,
          is_primary: true,
        },
      ]);
    }

    // 7. Ensure Site exists for Barbearia Prime
    const { data: existingSites } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('tenant_id', tenant1Id);

    if (!existingSites || existingSites.length === 0) {
      console.log('[BOOTSTRAP] Seeding mini site for Barbearia Prime...');
      const site1Id = '99999999-1111-4999-8111-999999999991';
      await supabaseAdmin.from('sites').insert({
        id: site1Id,
        tenant_id: tenant1Id,
        template_id: 'moderno',
        status: 'published',
        published_at: now,
        created_at: now,
        updated_at: now,
      });

      await supabaseAdmin.from('site_seo').insert({
        site_id: site1Id,
        tenant_id: tenant1Id,
        title: 'Barbearia Prime | Barbearia & Estética Masculina em São Paulo',
        description: 'Corte tradicional, barba com toalha quente e cuidados modernos para o homem exigente. Agende seu horário pelo WhatsApp!',
        keywords: 'barbearia, corte masculino, barba, são paulo, estética masculina',
        og_title: 'Barbearia Prime - Tradição e Estilo em São Paulo',
        og_description: 'Ambiente climatizado, atendimento exclusivo e profissionais premiados.',
        og_image: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1200&q=80',
        allow_indexing: true,
        created_at: now,
        updated_at: now,
      });

      await supabaseAdmin.from('site_sections').insert([
        {
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
          site_id: site1Id,
          tenant_id: tenant1Id,
          section_type: 'products',
          position: 1,
          is_enabled: true,
          settings: {
            title: 'Nossos Produtos',
            subtitle: 'Leve a experiência da Barbearia Prime para casa',
            layoutStyle: 'grid',
            filterType: 'all',
            showPrice: true,
            showCategory: true,
            showShortDesc: true,
            maxItems: 8,
          },
        },
        {
          site_id: site1Id,
          tenant_id: tenant1Id,
          section_type: 'business_hours',
          position: 2,
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
      ]);
    }

    // 6. Ensure all Auth users have a tenant_users relationship
    const { data: allUsersRes } = await supabaseAdmin.auth.admin.listUsers();
    if (allUsersRes?.users && allUsersRes.users.length > 0) {
      const { data: allTu } = await supabaseAdmin.from('tenant_users').select('*');
      const tuMap = new Set((allTu || []).map((t: any) => t.user_id));

      for (const u of allUsersRes.users) {
        if (!tuMap.has(u.id)) {
          const emailLower = u.email?.toLowerCase().trim() || '';
          const isSuperAdminEmail =
            emailLower === 'admin@localhub.com' ||
            emailLower === 'ls2039730@gmail.com' ||
            emailLower.includes('superadmin') ||
            emailLower.includes('admin');

          const role = isSuperAdminEmail ? 'SUPER_ADMIN' : 'CLIENT_ADMIN';
          const tenant_id = isSuperAdminEmail ? null : tenant1Id;

          console.log(`[BOOTSTRAP] Linking unattached user ${emailLower} as ${role}...`);
          await supabaseAdmin.from('tenant_users').insert({
            id: crypto.randomUUID(),
            tenant_id,
            user_id: u.id,
            role,
            status: 'active',
            created_at: now,
            updated_at: now,
          });
        }
      }
    }

    // 8. Ensure Services, Professionals & Appointment Settings exist for Barbearia Prime
    const { data: existingServices } = await supabaseAdmin
      .from('services')
      .select('*')
      .eq('tenant_id', tenant1Id);

    if (!existingServices || existingServices.length === 0) {
      console.log('[BOOTSTRAP] Seeding services, professionals, and appointment settings for Barbearia Prime...');
      const scat1Id = '77777777-1111-4777-8111-111111111111';
      const scat2Id = '77777777-2222-4777-8222-222222222222';

      await supabaseAdmin.from('service_categories').insert([
        {
          id: scat1Id,
          tenant_id: tenant1Id,
          name: 'Cabelo & Barba',
          slug: 'cabelo-barba',
          description: 'Cortes masculinos modernos, barboterapia tradicional e combos exclusivos.',
          display_order: 0,
          active: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: scat2Id,
          tenant_id: tenant1Id,
          name: 'Estética & Tratamentos',
          slug: 'estetica-tratamentos',
          description: 'Cuidados capilares, selagem e hidratação facial.',
          display_order: 1,
          active: true,
          created_at: now,
          updated_at: now,
        },
      ]);

      const srv1Id = '33333333-1111-4333-8111-111111111111';
      const srv2Id = '33333333-2222-4333-8222-222222222222';
      const srv3Id = '33333333-3333-4333-8333-333333333333';
      const srv4Id = '33333333-4444-4333-8444-444444444444';

      await supabaseAdmin.from('services').insert([
        {
          id: srv1Id,
          tenant_id: tenant1Id,
          category_id: scat1Id,
          name: 'Corte de Cabelo Masculino',
          slug: 'corte-de-cabelo-masculino',
          description: 'Corte moderno ou clássico com tesoura e máquina, acabamento com navalha e lavagem.',
          image_url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=600&q=80',
          pricing_type: 'fixed',
          price: 50.0,
          duration_minutes: 40,
          active: true,
          featured: true,
          display_order: 0,
          booking_enabled: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: srv2Id,
          tenant_id: tenant1Id,
          category_id: scat1Id,
          name: 'Barba Tradicional com Toalha Quente',
          slug: 'barba-tradicional-com-toalha-quente',
          description: 'Barboterapia com toalha quente, óleos essenciais, massagem facial e navalha afiada.',
          image_url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=600&q=80',
          pricing_type: 'fixed',
          price: 40.0,
          duration_minutes: 30,
          active: true,
          featured: true,
          display_order: 1,
          booking_enabled: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: srv3Id,
          tenant_id: tenant1Id,
          category_id: scat1Id,
          name: 'Combo Prime (Corte + Barba)',
          slug: 'combo-prime-corte-barba',
          description: 'A experiência completa: corte personalizado + barboterapia com toalha quente e bebidas cortesia.',
          image_url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=600&q=80',
          pricing_type: 'fixed',
          price: 80.0,
          duration_minutes: 60,
          active: true,
          featured: true,
          display_order: 2,
          booking_enabled: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: srv4Id,
          tenant_id: tenant1Id,
          category_id: scat2Id,
          name: 'Selagem Capilar Masculina',
          slug: 'selagem-capilar-masculina',
          description: 'Alinhamento dos fios, redução de volume e nutrição profunda.',
          image_url: 'https://images.unsplash.com/photo-1517832606589-715753d4be37?auto=format&fit=crop&w=600&q=80',
          pricing_type: 'fixed',
          price: 90.0,
          duration_minutes: 50,
          active: true,
          featured: false,
          display_order: 3,
          booking_enabled: true,
          created_at: now,
          updated_at: now,
        },
      ]);

      const prof1Id = '44444444-1111-4444-8111-111111111111';
      const prof2Id = '44444444-2222-4444-8222-222222222222';

      await supabaseAdmin.from('professionals').insert([
        {
          id: prof1Id,
          tenant_id: tenant1Id,
          name: 'Carlos Eduardo (Mestre Barbeiro)',
          bio: 'Mais de 10 anos de experiência em visagismo masculino e cortes clássicos na navalha.',
          phone: '(11) 98765-4321',
          photo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
          active: true,
          display_order: 0,
          specialties: ['Cortes Clássicos', 'Barboterapia', 'Visagismo'],
          created_at: now,
          updated_at: now,
        },
        {
          id: prof2Id,
          tenant_id: tenant1Id,
          name: 'Lucas Andrade (Especialista em Degradê)',
          bio: 'Especialista em fade moderno, freestyle e selagem capilar.',
          phone: '(11) 98765-4322',
          photo_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
          active: true,
          display_order: 1,
          specialties: ['Fade / Degradê', 'Selagem', 'Barba Quadrada'],
          created_at: now,
          updated_at: now,
        },
      ]);

      // Link professionals to services
      const allSrvIds = [srv1Id, srv2Id, srv3Id, srv4Id];
      for (const sId of allSrvIds) {
        await supabaseAdmin.from('service_professionals').insert([
          { id: crypto.randomUUID(), tenant_id: tenant1Id, service_id: sId, professional_id: prof1Id, created_at: now },
          { id: crypto.randomUUID(), tenant_id: tenant1Id, service_id: sId, professional_id: prof2Id, created_at: now },
        ]);
      }

      // Appointment settings for Barbearia Prime
      await supabaseAdmin.from('appointment_settings').insert({
        id: crypto.randomUUID(),
        tenant_id: tenant1Id,
        timezone: 'America/Sao_Paulo',
        min_booking_notice_hours: 1,
        max_booking_advance_days: 30,
        buffer_between_appointments_minutes: 0,
        business_hours: {
          seg: { isOpen: true, intervals: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '20:00' }] },
          ter: { isOpen: true, intervals: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '20:00' }] },
          qua: { isOpen: true, intervals: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '20:00' }] },
          qui: { isOpen: true, intervals: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '20:00' }] },
          sex: { isOpen: true, intervals: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '21:00' }] },
          sab: { isOpen: true, intervals: [{ start: '08:30', end: '18:00' }] },
          dom: { isOpen: false, intervals: [] },
        },
        allow_customer_cancellation: true,
        cancellation_notice_hours: 2,
        public_booking_enabled: true,
        auto_confirm_bookings: true,
        notification_instructions: 'Chegue com 10 minutos de antecedência. Cerveja ou café cortesia inclusos!',
        created_at: now,
        updated_at: now,
      });
    }

    // Ensure tenant-media bucket exists in Supabase Storage if remote
    if (isRealSupabaseConfigured && typeof supabaseAdmin.storage.createBucket === 'function') {
      try {
        await supabaseAdmin.storage.createBucket('tenant-media', { public: true });
        console.log('[BOOTSTRAP] Verified/Created tenant-media storage bucket in remote Supabase.');
      } catch (bucketE) {
        // Bucket may already exist
      }
    }

    console.log('[BOOTSTRAP] Database verification & bootstrap completed successfully!');
  } catch (err: any) {
    console.error('[BOOTSTRAP] Error during database bootstrap:', err.message);
  }
}
