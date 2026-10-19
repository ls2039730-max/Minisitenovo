import crypto from 'crypto';
import { supabaseAdmin } from '../supabaseAdmin.js';
import { repo } from './repository.js';
import { canTenantOperate } from '../tenantResolver.js';
import { User } from '../../src/types/saas.js';
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
  PublicService,
  PublicProfessional,
} from '../../src/types/service.js';

// Helper to normalize and generate clean URL slugs
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

export class ServiceRepository {
  // ==========================================
  // SERVICE CATEGORIES MANAGEMENT
  // ==========================================

  public async listCategories(tenantId: string): Promise<ServiceCategory[]> {
    const { data: rawCategories } = await supabaseAdmin
      .from('service_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('display_order', { ascending: true });

    const categories = rawCategories || [];

    // Count services per category for the tenant
    const { data: rawServices } = await supabaseAdmin
      .from('services')
      .select('id, category_id')
      .eq('tenant_id', tenantId);

    const services = rawServices || [];
    const countMap: Record<string, number> = {};
    services.forEach((s: any) => {
      if (s.category_id) {
        countMap[s.category_id] = (countMap[s.category_id] || 0) + 1;
      }
    });

    return categories.map((c: any) => ({
      id: c.id,
      tenantId: c.tenant_id,
      name: c.name,
      slug: c.slug,
      description: c.description || null,
      displayOrder: c.display_order ?? 0,
      active: c.active !== false,
      servicesCount: countMap[c.id] || 0,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));
  }

  public async getCategoryById(id: string, tenantId: string): Promise<ServiceCategory | null> {
    const { data } = await supabaseAdmin
      .from('service_categories')
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
      displayOrder: data.display_order ?? 0,
      active: data.active !== false,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  public async createCategory(
    tenantId: string,
    payload: ServiceCategoryPayload,
    actor: User
  ): Promise<ServiceCategory> {
    if (!payload.name || !payload.name.trim()) {
      throw new Error('O nome da categoria é obrigatório.');
    }

    const cleanName = payload.name.trim();
    let baseSlug = payload.slug ? slugify(payload.slug) : slugify(cleanName);
    if (!baseSlug) baseSlug = 'categoria';

    // Verify uniqueness of slug for the tenant
    let uniqueSlug = baseSlug;
    let counter = 1;
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from('service_categories')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('slug', uniqueSlug)
        .single();

      if (!existing) break;
      uniqueSlug = `${baseSlug}-${counter++}`;
    }

    const { data: existingCats } = await supabaseAdmin
      .from('service_categories')
      .select('display_order')
      .eq('tenant_id', tenantId);

    const maxOrder = (existingCats || []).reduce(
      (max: number, c: any) => Math.max(max, c.display_order || 0),
      -1
    );

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    const insertRecord = {
      id: newId,
      tenant_id: tenantId,
      name: cleanName,
      slug: uniqueSlug,
      description: payload.description ? payload.description.trim() : null,
      display_order: payload.displayOrder !== undefined ? payload.displayOrder : maxOrder + 1,
      active: payload.active !== false,
      created_at: now,
      updated_at: now,
    };

    const { error } = await supabaseAdmin
      .from('service_categories')
      .insert(insertRecord);

    if (error) {
      throw new Error(`Erro ao criar categoria de serviço: ${error.message}`);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'SERVICE_CATEGORY_CREATE' as any,
      entity: 'service_categories',
      entityId: newId,
      metadata: { name: cleanName, slug: uniqueSlug },
    });

    return {
      id: newId,
      tenantId,
      name: cleanName,
      slug: uniqueSlug,
      description: insertRecord.description,
      displayOrder: insertRecord.display_order,
      active: insertRecord.active,
      servicesCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  public async updateCategory(
    id: string,
    tenantId: string,
    payload: Partial<ServiceCategoryPayload>,
    actor: User
  ): Promise<ServiceCategory> {
    const existing = await this.getCategoryById(id, tenantId);
    if (!existing) {
      throw new Error('Categoria não encontrada.');
    }

    const patch: any = { updated_at: new Date().toISOString() };

    if (payload.name !== undefined) {
      const trimmed = payload.name.trim();
      if (!trimmed) throw new Error('O nome da categoria não pode ser vazio.');
      patch.name = trimmed;
    }

    if (payload.slug !== undefined) {
      const candidateSlug = slugify(payload.slug);
      if (candidateSlug && candidateSlug !== existing.slug) {
        const { data: conflict } = await supabaseAdmin
          .from('service_categories')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('slug', candidateSlug)
          .single();

        if (conflict && conflict.id !== id) {
          throw new Error(`O slug "${candidateSlug}" já está em uso por outra categoria nesta empresa.`);
        }
        patch.slug = candidateSlug;
      }
    }

    if (payload.description !== undefined) {
      patch.description = payload.description ? payload.description.trim() : null;
    }

    if (payload.displayOrder !== undefined) {
      patch.display_order = Number(payload.displayOrder);
    }

    if (payload.active !== undefined) {
      patch.active = !!payload.active;
    }

    const { data, error } = await supabaseAdmin
      .from('service_categories')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      throw new Error(`Erro ao atualizar categoria: ${error.message}`);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'SERVICE_CATEGORY_UPDATE' as any,
      entity: 'service_categories',
      entityId: id,
      metadata: patch,
    });

    return {
      ...existing,
      ...patch,
      id,
      tenantId,
    };
  }

  public async deleteCategory(id: string, tenantId: string, actor: User): Promise<void> {
    const existing = await this.getCategoryById(id, tenantId);
    if (!existing) {
      throw new Error('Categoria não encontrada.');
    }

    // Check if category has associated services
    const { data: servicesWithCat } = await supabaseAdmin
      .from('services')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('category_id', id);

    if (servicesWithCat && servicesWithCat.length > 0) {
      throw new Error(
        `Não é possível excluir esta categoria porque ela possui ${servicesWithCat.length} serviço(s) associado(s). Remova ou altere a categoria desses serviços antes de excluir.`
      );
    }

    const { error } = await supabaseAdmin
      .from('service_categories')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new Error(`Erro ao excluir categoria: ${error.message}`);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'SERVICE_CATEGORY_DELETE' as any,
      entity: 'service_categories',
      entityId: id,
      metadata: { name: existing.name },
    });
  }

  public async reorderCategories(tenantId: string, orderedIds: string[], actor: User): Promise<void> {
    for (let index = 0; index < orderedIds.length; index++) {
      const catId = orderedIds[index];
      await supabaseAdmin
        .from('service_categories')
        .update({ display_order: index, updated_at: new Date().toISOString() })
        .eq('id', catId)
        .eq('tenant_id', tenantId);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'SERVICE_CATEGORIES_REORDER' as any,
      entity: 'service_categories',
      metadata: { count: orderedIds.length },
    });
  }

  // ==========================================
  // PROFESSIONALS MANAGEMENT
  // ==========================================

  public async listProfessionals(
    tenantId: string,
    filters?: ProfessionalFilterParams
  ): Promise<Professional[]> {
    const query = supabaseAdmin
      .from('professionals')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('display_order', { ascending: true });

    const { data: rawProfessionals } = await query;
    let list = rawProfessionals || [];

    // Filter by active status
    if (filters?.active !== undefined && filters.active !== 'all') {
      list = list.filter((p: any) => p.active === (filters.active === true));
    }

    // Filter by search
    if (filters?.search) {
      const term = filters.search.toLowerCase().trim();
      list = list.filter(
        (p: any) =>
          p.name.toLowerCase().includes(term) ||
          (p.bio && p.bio.toLowerCase().includes(term)) ||
          (Array.isArray(p.specialties) &&
            p.specialties.some((s: string) => s.toLowerCase().includes(term)))
      );
    }

    // Fetch service relationships for each professional
    const { data: rawLinks } = await supabaseAdmin
      .from('service_professionals')
      .select('service_id, professional_id')
      .eq('tenant_id', tenantId);

    const links = rawLinks || [];
    const profToServiceIds: Record<string, string[]> = {};
    links.forEach((l: any) => {
      if (!profToServiceIds[l.professional_id]) {
        profToServiceIds[l.professional_id] = [];
      }
      profToServiceIds[l.professional_id].push(l.service_id);
    });

    // Fetch services to include names
    const { data: rawServices } = await supabaseAdmin
      .from('services')
      .select('id, name')
      .eq('tenant_id', tenantId);

    const serviceNameMap: Record<string, string> = {};
    (rawServices || []).forEach((s: any) => {
      serviceNameMap[s.id] = s.name;
    });

    // If filter by serviceId
    if (filters?.serviceId) {
      list = list.filter((p: any) =>
        (profToServiceIds[p.id] || []).includes(filters.serviceId!)
      );
    }

    return list.map((p: any) => {
      const sIds = profToServiceIds[p.id] || [];
      const sList = sIds.map((sid) => ({
        id: sid,
        name: serviceNameMap[sid] || 'Serviço',
      }));

      return {
        id: p.id,
        tenantId: p.tenant_id,
        userId: p.user_id || null,
        name: p.name,
        bio: p.bio || null,
        photoUrl: p.photo_url || null,
        specialties: Array.isArray(p.specialties) ? p.specialties : [],
        phone: p.phone || null,
        email: p.email || null,
        showContactPublicly: p.show_contact_publicly === true,
        active: p.active !== false,
        displayOrder: p.display_order ?? 0,
        servicesCount: sIds.length,
        serviceIds: sIds,
        services: sList,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      };
    });
  }

  public async getProfessionalById(id: string, tenantId: string): Promise<Professional | null> {
    const { data } = await supabaseAdmin
      .from('professionals')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (!data) return null;

    // Fetch associated service IDs
    const { data: rawLinks } = await supabaseAdmin
      .from('service_professionals')
      .select('service_id')
      .eq('tenant_id', tenantId)
      .eq('professional_id', id);

    const serviceIds = (rawLinks || []).map((l: any) => l.service_id);

    // Fetch service names
    const { data: rawServices } = await supabaseAdmin
      .from('services')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .in('id', serviceIds.length > 0 ? serviceIds : ['__none__']);

    const services = (rawServices || []).map((s: any) => ({
      id: s.id,
      name: s.name,
    }));

    return {
      id: data.id,
      tenantId: data.tenant_id,
      userId: data.user_id || null,
      name: data.name,
      bio: data.bio || null,
      photoUrl: data.photo_url || null,
      specialties: Array.isArray(data.specialties) ? data.specialties : [],
      phone: data.phone || null,
      email: data.email || null,
      showContactPublicly: data.show_contact_publicly === true,
      active: data.active !== false,
      displayOrder: data.display_order ?? 0,
      servicesCount: serviceIds.length,
      serviceIds,
      services,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  public async getProfessionalByUserId(userId: string, tenantId: string): Promise<Professional | null> {
    // 1. Direct query by user_id
    const { data: rawList } = await supabaseAdmin
      .from('professionals')
      .select('id, user_id, email')
      .eq('tenant_id', tenantId);

    const list = rawList || [];
    const directMatch = list.find((p: any) => p.user_id === userId);
    if (directMatch) {
      return this.getProfessionalById(directMatch.id, tenantId);
    }

    // 2. Query user email to check match and auto-associate
    const user = await repo.findUserById(userId);
    if (user?.email) {
      const emailLower = user.email.toLowerCase().trim();
      const emailMatch = list.find((p: any) => p.email && p.email.toLowerCase().trim() === emailLower);
      if (emailMatch) {
        if (!emailMatch.user_id) {
          await supabaseAdmin
            .from('professionals')
            .update({ user_id: userId, updated_at: new Date().toISOString() })
            .eq('id', emailMatch.id)
            .eq('tenant_id', tenantId);
        }
        return this.getProfessionalById(emailMatch.id, tenantId);
      }
    }

    return null;
  }

  public async createProfessional(
    tenantId: string,
    payload: ProfessionalPayload,
    actor: User
  ): Promise<Professional> {
    if (!payload.name || !payload.name.trim()) {
      throw new Error('O nome do profissional é obrigatório.');
    }

    const { data: existingProfs } = await supabaseAdmin
      .from('professionals')
      .select('display_order')
      .eq('tenant_id', tenantId);

    const maxOrder = (existingProfs || []).reduce(
      (max: number, p: any) => Math.max(max, p.display_order || 0),
      -1
    );

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    const insertRecord = {
      id: newId,
      tenant_id: tenantId,
      user_id: payload.userId ? payload.userId.trim() : null,
      name: payload.name.trim(),
      bio: payload.bio ? payload.bio.trim() : null,
      photo_url: payload.photoUrl ? payload.photoUrl.trim() : null,
      specialties: Array.isArray(payload.specialties)
        ? payload.specialties.map((s) => s.trim()).filter(Boolean)
        : [],
      phone: payload.phone ? payload.phone.trim() : null,
      email: payload.email ? payload.email.trim().toLowerCase() : null,
      show_contact_publicly: payload.showContactPublicly === true,
      active: payload.active !== false,
      display_order: payload.displayOrder !== undefined ? payload.displayOrder : maxOrder + 1,
      created_at: now,
      updated_at: now,
    };

    const { error } = await supabaseAdmin
      .from('professionals')
      .insert(insertRecord);

    if (error) {
      throw new Error(`Erro ao cadastrar profissional: ${error.message}`);
    }

    // Link services if provided
    if (payload.serviceIds && Array.isArray(payload.serviceIds) && payload.serviceIds.length > 0) {
      // Validate that services belong to this tenant
      const { data: validServices } = await supabaseAdmin
        .from('services')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('id', payload.serviceIds);

      const validServiceIds = (validServices || []).map((s: any) => s.id);

      for (const serviceId of validServiceIds) {
        await supabaseAdmin.from('service_professionals').insert({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          service_id: serviceId,
          professional_id: newId,
          created_at: now,
        });
      }
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'PROFESSIONAL_CREATE' as any,
      entity: 'professionals',
      entityId: newId,
      metadata: { name: insertRecord.name },
    });

    return (await this.getProfessionalById(newId, tenantId))!;
  }

  public async updateProfessional(
    id: string,
    tenantId: string,
    payload: Partial<ProfessionalPayload>,
    actor: User
  ): Promise<Professional> {
    const existing = await this.getProfessionalById(id, tenantId);
    if (!existing) {
      throw new Error('Profissional não encontrado.');
    }

    const patch: any = { updated_at: new Date().toISOString() };

    if (payload.userId !== undefined) {
      patch.user_id = payload.userId ? payload.userId.trim() : null;
    }

    if (payload.name !== undefined) {
      const trimmed = payload.name.trim();
      if (!trimmed) throw new Error('O nome do profissional não pode ser vazio.');
      patch.name = trimmed;
    }

    if (payload.bio !== undefined) {
      patch.bio = payload.bio ? payload.bio.trim() : null;
    }

    if (payload.photoUrl !== undefined) {
      patch.photo_url = payload.photoUrl ? payload.photoUrl.trim() : null;
    }

    if (payload.specialties !== undefined) {
      patch.specialties = Array.isArray(payload.specialties)
        ? payload.specialties.map((s) => s.trim()).filter(Boolean)
        : [];
    }

    if (payload.phone !== undefined) {
      patch.phone = payload.phone ? payload.phone.trim() : null;
    }

    if (payload.email !== undefined) {
      patch.email = payload.email ? payload.email.trim().toLowerCase() : null;
    }

    if (payload.showContactPublicly !== undefined) {
      patch.show_contact_publicly = !!payload.showContactPublicly;
    }

    if (payload.active !== undefined) {
      patch.active = !!payload.active;
    }

    if (payload.displayOrder !== undefined) {
      patch.display_order = Number(payload.displayOrder);
    }

    const { error } = await supabaseAdmin
      .from('professionals')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      throw new Error(`Erro ao atualizar profissional: ${error.message}`);
    }

    // Sync services if provided
    if (payload.serviceIds !== undefined && Array.isArray(payload.serviceIds)) {
      // Validate that services belong to this tenant
      const { data: validServices } = await supabaseAdmin
        .from('services')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('id', payload.serviceIds.length > 0 ? payload.serviceIds : ['__none__']);

      const validServiceIds = (validServices || []).map((s: any) => s.id);

      // Remove previous links
      await supabaseAdmin
        .from('service_professionals')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('professional_id', id);

      // Insert new links
      const now = new Date().toISOString();
      for (const serviceId of validServiceIds) {
        await supabaseAdmin.from('service_professionals').insert({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          service_id: serviceId,
          professional_id: id,
          created_at: now,
        });
      }
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'PROFESSIONAL_UPDATE' as any,
      entity: 'professionals',
      entityId: id,
      metadata: { name: patch.name || existing.name },
    });

    return (await this.getProfessionalById(id, tenantId))!;
  }

  public async deleteProfessional(id: string, tenantId: string, actor: User): Promise<void> {
    const existing = await this.getProfessionalById(id, tenantId);
    if (!existing) {
      throw new Error('Profissional não encontrado.');
    }

    // Check associated services
    const { data: linkedServices } = await supabaseAdmin
      .from('service_professionals')
      .select('service_id')
      .eq('tenant_id', tenantId)
      .eq('professional_id', id);

    const countLinks = (linkedServices || []).length;

    // Delete relationships
    await supabaseAdmin
      .from('service_professionals')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('professional_id', id);

    // Delete professional record
    const { error } = await supabaseAdmin
      .from('professionals')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new Error(`Erro ao excluir profissional: ${error.message}`);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'PROFESSIONAL_DELETE' as any,
      entity: 'professionals',
      entityId: id,
      metadata: { name: existing.name, unlinkedServicesCount: countLinks },
    });
  }

  public async toggleProfessionalStatus(
    id: string,
    tenantId: string,
    active: boolean,
    actor: User
  ): Promise<Professional> {
    const updated = await this.updateProfessional(id, tenantId, { active }, actor);
    return updated;
  }

  public async reorderProfessionals(
    tenantId: string,
    orderedIds: string[],
    actor: User
  ): Promise<void> {
    for (let index = 0; index < orderedIds.length; index++) {
      const profId = orderedIds[index];
      await supabaseAdmin
        .from('professionals')
        .update({ display_order: index, updated_at: new Date().toISOString() })
        .eq('id', profId)
        .eq('tenant_id', tenantId);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'PROFESSIONALS_REORDER' as any,
      entity: 'professionals',
      metadata: { count: orderedIds.length },
    });
  }

  // ==========================================
  // SERVICES MANAGEMENT
  // ==========================================

  public async listServices(
    tenantId: string,
    filters?: ServiceFilterParams
  ): Promise<Service[]> {
    const query = supabaseAdmin
      .from('services')
      .select('*')
      .eq('tenant_id', tenantId);

    const { data: rawServices } = await query;
    let list = rawServices || [];

    // Filter by category
    if (filters?.categoryId) {
      list = list.filter((s: any) => s.category_id === filters.categoryId);
    }

    // Filter by active status
    if (filters?.active !== undefined && filters.active !== 'all') {
      list = list.filter((s: any) => s.active === (filters.active === true));
    }

    // Filter by featured
    if (filters?.featured !== undefined) {
      list = list.filter((s: any) => s.featured === filters.featured);
    }

    // Filter by pricing type
    if (filters?.pricingType) {
      list = list.filter((s: any) => s.pricing_type === filters.pricingType);
    }

    // Filter by search
    if (filters?.search) {
      const term = filters.search.toLowerCase().trim();
      list = list.filter(
        (s: any) =>
          s.name.toLowerCase().includes(term) ||
          (s.description && s.description.toLowerCase().includes(term))
      );
    }

    // Sort
    const sort = filters?.sort || 'order';
    list.sort((a: any, b: any) => {
      if (sort === 'order') return (a.display_order ?? 0) - (b.display_order ?? 0);
      if (sort === 'name_asc') return a.name.localeCompare(b.name);
      if (sort === 'price_asc') return (a.price ?? 999999) - (b.price ?? 999999);
      if (sort === 'price_desc') return (b.price ?? 0) - (a.price ?? 0);
      if (sort === 'duration_asc') return (a.duration_minutes ?? 9999) - (b.duration_minutes ?? 9999);
      if (sort === 'recent') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return 0;
    });

    // Fetch categories to populate
    const categories = await this.listCategories(tenantId);
    const categoryMap: Record<string, ServiceCategory> = {};
    categories.forEach((c) => {
      categoryMap[c.id] = c;
    });

    // Fetch professionals relationships
    const { data: rawLinks } = await supabaseAdmin
      .from('service_professionals')
      .select('service_id, professional_id')
      .eq('tenant_id', tenantId);

    const serviceToProfIds: Record<string, string[]> = {};
    (rawLinks || []).forEach((l: any) => {
      if (!serviceToProfIds[l.service_id]) {
        serviceToProfIds[l.service_id] = [];
      }
      serviceToProfIds[l.service_id].push(l.professional_id);
    });

    // Fetch professionals
    const allProfs = await this.listProfessionals(tenantId);
    const profMap: Record<string, Professional> = {};
    allProfs.forEach((p) => {
      profMap[p.id] = p;
    });

    return list.map((s: any) => {
      const pIds = serviceToProfIds[s.id] || [];
      const assignedProfs = pIds.map((pid) => profMap[pid]).filter(Boolean);

      return {
        id: s.id,
        tenantId: s.tenant_id,
        categoryId: s.category_id || null,
        category: s.category_id ? categoryMap[s.category_id] || null : null,
        name: s.name,
        slug: s.slug,
        description: s.description || null,
        imageUrl: s.image_url || null,
        pricingType: s.pricing_type || 'fixed',
        price: s.price !== null && s.price !== undefined ? Number(s.price) : null,
        durationMinutes: s.duration_minutes ? Number(s.duration_minutes) : null,
        active: s.active !== false,
        featured: s.featured === true,
        displayOrder: s.display_order ?? 0,
        bookingEnabled: s.booking_enabled !== false,
        professionalIds: pIds,
        professionals: assignedProfs,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      };
    });
  }

  public async getServiceById(id: string, tenantId: string): Promise<Service | null> {
    const { data } = await supabaseAdmin
      .from('services')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (!data) return null;

    let category: ServiceCategory | null = null;
    if (data.category_id) {
      category = await this.getCategoryById(data.category_id, tenantId);
    }

    // Fetch assigned professional IDs
    const { data: rawLinks } = await supabaseAdmin
      .from('service_professionals')
      .select('professional_id')
      .eq('tenant_id', tenantId)
      .eq('service_id', id);

    const profIds = (rawLinks || []).map((l: any) => l.professional_id);

    // Fetch assigned professionals
    const { data: rawProfs } = await supabaseAdmin
      .from('professionals')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('id', profIds.length > 0 ? profIds : ['__none__']);

    const professionals = (rawProfs || []).map((p: any) => ({
      id: p.id,
      tenantId: p.tenant_id,
      name: p.name,
      bio: p.bio || null,
      photoUrl: p.photo_url || null,
      specialties: Array.isArray(p.specialties) ? p.specialties : [],
      phone: p.phone || null,
      email: p.email || null,
      showContactPublicly: p.show_contact_publicly === true,
      active: p.active !== false,
      displayOrder: p.display_order ?? 0,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

    return {
      id: data.id,
      tenantId: data.tenant_id,
      categoryId: data.category_id || null,
      category,
      name: data.name,
      slug: data.slug,
      description: data.description || null,
      imageUrl: data.image_url || null,
      pricingType: data.pricing_type || 'fixed',
      price: data.price !== null && data.price !== undefined ? Number(data.price) : null,
      durationMinutes: data.duration_minutes ? Number(data.duration_minutes) : null,
      active: data.active !== false,
      featured: data.featured === true,
      displayOrder: data.display_order ?? 0,
      bookingEnabled: data.booking_enabled !== false,
      professionalIds: profIds,
      professionals,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  public async createService(
    tenantId: string,
    payload: ServicePayload,
    actor: User
  ): Promise<Service> {
    if (!payload.name || !payload.name.trim()) {
      throw new Error('O nome do serviço é obrigatório.');
    }

    const cleanName = payload.name.trim();

    // Validate pricing type & price
    const pricingType = payload.pricingType || 'fixed';
    if (!['fixed', 'starting_at', 'on_request'].includes(pricingType)) {
      throw new Error('Tipo de preço inválido. Escolha: Preço fixo, A partir de ou Sob consulta.');
    }

    let effectivePrice: number | null = null;
    if (pricingType === 'fixed' || pricingType === 'starting_at') {
      if (payload.price === undefined || payload.price === null || isNaN(Number(payload.price))) {
        throw new Error('O valor do serviço é obrigatório para preços fixos ou a partir de.');
      }
      effectivePrice = Number(payload.price);
      if (effectivePrice < 0) {
        throw new Error('O valor do serviço não pode ser negativo.');
      }
    } else {
      // on_request: price must be null
      effectivePrice = null;
    }

    // Validate duration
    let effectiveDuration: number | null = null;
    if (payload.durationMinutes !== undefined && payload.durationMinutes !== null && (payload.durationMinutes as any) !== '') {
      const dur = Number(payload.durationMinutes);
      if (isNaN(dur) || dur <= 0) {
        throw new Error('A duração estimada deve ser um número positivo em minutos.');
      }
      effectiveDuration = dur;
    }

    // Validate category belongs to this tenant
    let effectiveCategoryId: string | null = null;
    if (payload.categoryId) {
      const cat = await this.getCategoryById(payload.categoryId, tenantId);
      if (!cat) {
        throw new Error('A categoria informada não pertence a esta empresa ou não existe.');
      }
      effectiveCategoryId = cat.id;
    }

    // Generate unique slug per tenant
    let baseSlug = payload.slug ? slugify(payload.slug) : slugify(cleanName);
    if (!baseSlug) baseSlug = 'servico';

    let uniqueSlug = baseSlug;
    let counter = 1;
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from('services')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('slug', uniqueSlug)
        .single();

      if (!existing) break;
      uniqueSlug = `${baseSlug}-${counter++}`;
    }

    const { data: existingServices } = await supabaseAdmin
      .from('services')
      .select('display_order')
      .eq('tenant_id', tenantId);

    const maxOrder = (existingServices || []).reduce(
      (max: number, s: any) => Math.max(max, s.display_order || 0),
      -1
    );

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    const insertRecord = {
      id: newId,
      tenant_id: tenantId,
      category_id: effectiveCategoryId,
      name: cleanName,
      slug: uniqueSlug,
      description: payload.description ? payload.description.trim() : null,
      image_url: payload.imageUrl ? payload.imageUrl.trim() : null,
      pricing_type: pricingType,
      price: effectivePrice,
      duration_minutes: effectiveDuration,
      active: payload.active !== false,
      featured: payload.featured === true,
      display_order: payload.displayOrder !== undefined ? payload.displayOrder : maxOrder + 1,
      booking_enabled: payload.bookingEnabled !== false,
      created_at: now,
      updated_at: now,
    };

    const { error } = await supabaseAdmin
      .from('services')
      .insert(insertRecord);

    if (error) {
      throw new Error(`Erro ao cadastrar serviço: ${error.message}`);
    }

    // Link professionals if specified
    if (payload.professionalIds && Array.isArray(payload.professionalIds) && payload.professionalIds.length > 0) {
      // Validate professionals belong to this tenant
      const { data: validProfs } = await supabaseAdmin
        .from('professionals')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('id', payload.professionalIds);

      const validProfIds = (validProfs || []).map((p: any) => p.id);

      for (const profId of validProfIds) {
        await supabaseAdmin.from('service_professionals').insert({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          service_id: newId,
          professional_id: profId,
          created_at: now,
        });
      }
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'SERVICE_CREATE' as any,
      entity: 'services',
      entityId: newId,
      metadata: { name: cleanName, pricingType, price: effectivePrice },
    });

    return (await this.getServiceById(newId, tenantId))!;
  }

  public async updateService(
    id: string,
    tenantId: string,
    payload: Partial<ServicePayload>,
    actor: User
  ): Promise<Service> {
    const existing = await this.getServiceById(id, tenantId);
    if (!existing) {
      throw new Error('Serviço não encontrado.');
    }

    const patch: any = { updated_at: new Date().toISOString() };

    if (payload.name !== undefined) {
      const trimmed = payload.name.trim();
      if (!trimmed) throw new Error('O nome do serviço não pode ser vazio.');
      patch.name = trimmed;
    }

    if (payload.slug !== undefined) {
      const candidate = slugify(payload.slug);
      if (candidate && candidate !== existing.slug) {
        const { data: conflict } = await supabaseAdmin
          .from('services')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('slug', candidate)
          .single();

        if (conflict && conflict.id !== id) {
          throw new Error(`O slug "${candidate}" já está em uso por outro serviço nesta empresa.`);
        }
        patch.slug = candidate;
      }
    }

    if (payload.categoryId !== undefined) {
      if (payload.categoryId) {
        const cat = await this.getCategoryById(payload.categoryId, tenantId);
        if (!cat) throw new Error('Categoria não encontrada ou não pertence a esta empresa.');
        patch.category_id = cat.id;
      } else {
        patch.category_id = null;
      }
    }

    if (payload.description !== undefined) {
      patch.description = payload.description ? payload.description.trim() : null;
    }

    if (payload.imageUrl !== undefined) {
      patch.image_url = payload.imageUrl ? payload.imageUrl.trim() : null;
    }

    const currentPricingType = payload.pricingType || existing.pricingType;
    if (payload.pricingType !== undefined) {
      if (!['fixed', 'starting_at', 'on_request'].includes(payload.pricingType)) {
        throw new Error('Tipo de cobrança inválido.');
      }
      patch.pricing_type = payload.pricingType;
    }

    if (payload.price !== undefined || payload.pricingType !== undefined) {
      if (currentPricingType === 'on_request') {
        patch.price = null;
      } else {
        const priceVal = payload.price !== undefined ? payload.price : existing.price;
        if (priceVal === null || priceVal === undefined || isNaN(Number(priceVal))) {
          throw new Error('Preço obrigatório para cobrança fixa ou a partir de.');
        }
        const num = Number(priceVal);
        if (num < 0) throw new Error('Preço não pode ser negativo.');
        patch.price = num;
      }
    }

    if (payload.durationMinutes !== undefined) {
      if (payload.durationMinutes === null || (payload.durationMinutes as any) === '') {
        patch.duration_minutes = null;
      } else {
        const dur = Number(payload.durationMinutes);
        if (isNaN(dur) || dur <= 0) {
          throw new Error('A duração estimada deve ser um número positivo em minutos.');
        }
        patch.duration_minutes = dur;
      }
    }

    if (payload.active !== undefined) {
      patch.active = !!payload.active;
    }

    if (payload.featured !== undefined) {
      patch.featured = !!payload.featured;
    }

    if (payload.displayOrder !== undefined) {
      patch.display_order = Number(payload.displayOrder);
    }

    if (payload.bookingEnabled !== undefined) {
      patch.booking_enabled = !!payload.bookingEnabled;
    }

    const { error } = await supabaseAdmin
      .from('services')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      throw new Error(`Erro ao atualizar serviço: ${error.message}`);
    }

    // Sync professionals if provided
    if (payload.professionalIds !== undefined && Array.isArray(payload.professionalIds)) {
      // Validate professionals belong to this tenant
      const { data: validProfs } = await supabaseAdmin
        .from('professionals')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('id', payload.professionalIds.length > 0 ? payload.professionalIds : ['__none__']);

      const validProfIds = (validProfs || []).map((p: any) => p.id);

      // Remove previous links
      await supabaseAdmin
        .from('service_professionals')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('service_id', id);

      // Insert new links
      const now = new Date().toISOString();
      for (const profId of validProfIds) {
        await supabaseAdmin.from('service_professionals').insert({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          service_id: id,
          professional_id: profId,
          created_at: now,
        });
      }
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'SERVICE_UPDATE' as any,
      entity: 'services',
      entityId: id,
      metadata: { name: patch.name || existing.name },
    });

    return (await this.getServiceById(id, tenantId))!;
  }

  public async deleteService(id: string, tenantId: string, actor: User): Promise<void> {
    const existing = await this.getServiceById(id, tenantId);
    if (!existing) {
      throw new Error('Serviço não encontrado.');
    }

    // Remove relationships
    await supabaseAdmin
      .from('service_professionals')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('service_id', id);

    // Delete service
    const { error } = await supabaseAdmin
      .from('services')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new Error(`Erro ao excluir serviço: ${error.message}`);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'SERVICE_DELETE' as any,
      entity: 'services',
      entityId: id,
      metadata: { name: existing.name },
    });
  }

  public async toggleServiceStatus(
    id: string,
    tenantId: string,
    active: boolean,
    actor: User
  ): Promise<Service> {
    const updated = await this.updateService(id, tenantId, { active }, actor);
    return updated;
  }

  public async duplicateService(id: string, tenantId: string, actor: User): Promise<Service> {
    const existing = await this.getServiceById(id, tenantId);
    if (!existing) {
      throw new Error('Serviço não encontrado.');
    }

    const copyPayload: ServicePayload = {
      name: `${existing.name} (Cópia)`,
      categoryId: existing.categoryId,
      description: existing.description,
      imageUrl: existing.imageUrl,
      pricingType: existing.pricingType,
      price: existing.price,
      durationMinutes: existing.durationMinutes,
      active: false, // Inactive by default for safety
      featured: false,
      bookingEnabled: existing.bookingEnabled,
      professionalIds: existing.professionalIds,
    };

    const created = await this.createService(tenantId, copyPayload, actor);

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'SERVICE_DUPLICATE' as any,
      entity: 'services',
      entityId: created.id,
      metadata: { originalId: id, name: created.name },
    });

    return created;
  }

  public async reorderServices(
    tenantId: string,
    orderedIds: string[],
    actor: User
  ): Promise<void> {
    for (let index = 0; index < orderedIds.length; index++) {
      const sId = orderedIds[index];
      await supabaseAdmin
        .from('services')
        .update({ display_order: index, updated_at: new Date().toISOString() })
        .eq('id', sId)
        .eq('tenant_id', tenantId);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'SERVICES_REORDER' as any,
      entity: 'services',
      metadata: { count: orderedIds.length },
    });
  }

  // ==========================================
  // PUBLIC ENDPOINTS (SLUG-RESOLVED & SANITIZED)
  // ==========================================

  public async getPublicServices(
    slug: string,
    options?: { categoryId?: string; search?: string; featuredOnly?: boolean; limit?: number }
  ): Promise<PublicServicesResponse> {
    const tenant = await repo.getTenantBySlug(slug);
    if (!tenant) {
      throw new Error('Empresa não encontrada.');
    }

    const op = canTenantOperate(tenant.status);
    if (!op.canOperate) {
      throw new Error(op.blockedReason || 'Este estabelecimento não está disponível no momento.');
    }

    // Check if services feature is enabled for the tenant
    const { data: featRow } = await supabaseAdmin
      .from('tenant_features')
      .select('is_enabled')
      .eq('tenant_id', tenant.id)
      .eq('feature_key', 'services')
      .single();

    // If explicit row exists and is false, block
    if (featRow && featRow.is_enabled === false) {
      return {
        success: true,
        services: [],
        categories: [],
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          whatsapp: tenant.whatsapp || null,
          phone: tenant.phone || null,
        },
      };
    }

    // Fetch active categories
    const categories = await this.listCategories(tenant.id);
    const activeCategories = categories.filter((c) => c.active);
    const catMap: Record<string, string> = {};
    activeCategories.forEach((c) => {
      catMap[c.id] = c.name;
    });

    // Fetch active services
    const services = await this.listServices(tenant.id, {
      active: true,
      categoryId: options?.categoryId,
      search: options?.search,
      featured: options?.featuredOnly ? true : undefined,
    });

    // Sanitize professionals (strictly omit private phone and email)
    const publicServices: PublicService[] = services.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      description: s.description,
      imageUrl: s.imageUrl,
      categoryId: s.categoryId,
      categoryName: s.categoryId ? catMap[s.categoryId] || null : null,
      pricingType: s.pricingType,
      price: s.price,
      durationMinutes: s.durationMinutes,
      featured: s.featured,
      displayOrder: s.displayOrder,
      bookingEnabled: s.bookingEnabled,
      professionals: (s.professionals || [])
        .filter((p) => p.active)
        .map((p) => ({
          id: p.id,
          name: p.name,
          photoUrl: p.photoUrl,
          specialties: p.specialties,
        })),
    }));

    const finalServices = options?.limit
      ? publicServices.slice(0, options.limit)
      : publicServices;

    return {
      success: true,
      services: finalServices,
      categories: activeCategories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
      })),
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        whatsapp: tenant.whatsapp || null,
        phone: tenant.phone || null,
      },
    };
  }

  public async getPublicProfessionals(slug: string): Promise<PublicProfessionalsResponse> {
    const tenant = await repo.getTenantBySlug(slug);
    if (!tenant) {
      throw new Error('Empresa não encontrada.');
    }

    const op = canTenantOperate(tenant.status);
    if (!op.canOperate) {
      throw new Error(op.blockedReason || 'Este estabelecimento não está disponível no momento.');
    }

    // Check if professionals feature is enabled for the tenant
    const { data: featRow } = await supabaseAdmin
      .from('tenant_features')
      .select('is_enabled')
      .eq('tenant_id', tenant.id)
      .eq('feature_key', 'professionals')
      .single();

    if (featRow && featRow.is_enabled === false) {
      return {
        success: true,
        professionals: [],
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          whatsapp: tenant.whatsapp || null,
          phone: tenant.phone || null,
        },
      };
    }

    // Fetch active professionals
    const professionals = await this.listProfessionals(tenant.id, { active: true });

    // Sanitize private data: phone and email are omitted unless showContactPublicly is explicitly true
    const publicProfs: PublicProfessional[] = professionals.map((p) => ({
      id: p.id,
      name: p.name,
      bio: p.bio,
      photoUrl: p.photoUrl,
      specialties: p.specialties,
      phone: p.showContactPublicly ? p.phone : null,
      email: p.showContactPublicly ? p.email : null,
      displayOrder: p.displayOrder,
      services: (p.services || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        pricingType: s.pricingType || 'fixed',
        price: s.price ?? null,
      })),
    }));

    return {
      success: true,
      professionals: publicProfs,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        whatsapp: tenant.whatsapp || null,
        phone: tenant.phone || null,
      },
    };
  }
}

export const serviceRepo = new ServiceRepository();
