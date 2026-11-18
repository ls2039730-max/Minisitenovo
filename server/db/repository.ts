import crypto from 'crypto';
import { supabaseAdmin, localStore, getSupabaseAuthClient, isRealSupabaseConfigured } from '../supabaseAdmin.js';
import { bootstrapDatabaseIfNeeded } from './bootstrap.js';
import { revokeAllUserSessions } from '../auth/tokenService.js';
import {
  Tenant,
  User,
  Plan,
  FeatureKey,
  TenantStatus,
  UserRole,
  AuditLog,
} from '../../src/types/saas.js';
import { validateSlug, getServerBaseDomain, getTenantSubdomain } from '../tenantResolver.js';
import { SYSTEM_FEATURES } from '../../src/utils/features.js';

const PLATFORM_SUPER_ADMIN_ALLOWLIST = new Set<string>([
  'admin@localhub.com',
  'ls2039730@gmail.com',
]);

export function isAllowlistedSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return PLATFORM_SUPER_ADMIN_ALLOWLIST.has(email.toLowerCase().trim());
}

export class SaasRepository {
  private userSessionCache = new Map<string, { user: User; expiresAt: number }>();
  private tenantCache = new Map<string, { tenant: Tenant; expiresAt: number }>();
  private featuresCache = new Map<string, { features: Record<FeatureKey, boolean>; expiresAt: number }>();
  private readonly USER_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
  private readonly TENANT_CACHE_TTL_MS = 15 * 1000; // 15 seconds
  private readonly FEATURES_CACHE_TTL_MS = 30 * 1000; // 30 seconds

  private cacheUser(user: User, aliasId?: string): void {
    const entry = {
      user,
      expiresAt: Date.now() + this.USER_CACHE_TTL_MS,
    };
    this.userSessionCache.set(user.id, entry);
    if (aliasId && aliasId !== user.id) {
      this.userSessionCache.set(aliasId, entry);
    }
  }

  public invalidateUserCache(userId?: string): void {
    if (userId) {
      this.userSessionCache.delete(userId);
    } else {
      this.userSessionCache.clear();
    }
  }

  public invalidateTenantCache(tenantId?: string): void {
    if (tenantId) {
      this.tenantCache.delete(tenantId);
      this.featuresCache.delete(tenantId);
    } else {
      this.tenantCache.clear();
      this.featuresCache.clear();
    }
  }

  // ==========================================
  // AUDIT LOGS (Stored in Supabase audit_logs table)
  // ==========================================
  public async logAudit(entry: {
    actorUserId?: string | null;
    actorUserName?: string | null;
    tenantId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    metadata?: any;
    diff?: any;
  }): Promise<void> {
    try {
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        actor_user_id: entry.actorUserId || null,
        actor_user_name: entry.actorUserName || null,
        tenant_id: entry.tenantId || null,
        action: entry.action,
        entity: entry.entity,
        entity_id: entry.entityId || null,
        metadata: { ...(entry.metadata || {}), ...(entry.diff ? { diff: entry.diff } : {}) },
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[AUDIT] Failed to write audit log to Supabase:', err);
    }
  }

  public async getAuditLogs(requester: User, limit = 50): Promise<AuditLog[]> {
    if (requester.role !== 'SUPER_ADMIN') {
      throw new Error('Acesso negado: apenas Super Admin pode visualizar logs de auditoria.');
    }

    const { data, error } = await supabaseAdmin
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((r: any) => ({
      id: r.id,
      actorUserId: r.actor_user_id,
      actorUserName: r.actor_user_name,
      tenantId: r.tenant_id,
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id,
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
  }

  // ==========================================
  // AUTHENTICATION & USERS (Supabase Auth)
  // ==========================================
  public async authenticateUser(email: string, password: string): Promise<User | null> {
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return null;
    }

    const cleanEmail = email.toLowerCase().trim();
    if (!cleanEmail || !password) {
      return null;
    }

    // Ensure initial demo data exists in database
    await bootstrapDatabaseIfNeeded();

    // Check if the user exists in localStore with an explicit password
    const localExplicitUser = localStore.auth_users.find(
      (u: any) => u.email?.toLowerCase().trim() === cleanEmail
    );
    if (localExplicitUser && typeof localExplicitUser.password === 'string' && localExplicitUser.password.length > 0) {
      if (localExplicitUser.password !== password) {
        return null;
      }
    }

    let authUser: any = null;
    const authClient = getSupabaseAuthClient();

    if (authClient) {
      // 1. Authenticate strictly with real Supabase Auth (NEVER auto-create users or overwrite passwords!)
      let { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      // Only if 'Email not confirmed' for an already-existing user, confirm email WITHOUT modifying password and retry
      if (signInError && signInError.message?.toLowerCase().includes('email not confirmed')) {
        try {
          const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 } as any);
          const target = usersData?.users?.find(
            (u: any) => u.email?.toLowerCase().trim() === cleanEmail
          );
          if (target) {
            await supabaseAdmin.auth.admin.updateUserById(target.id, {
              email_confirm: true,
            });
            const retryRes = await authClient.auth.signInWithPassword({
              email: cleanEmail,
              password,
            });
            signInData = retryRes.data;
            signInError = retryRes.error;
          }
        } catch (confirmErr: any) {
          console.warn('[AUTH] Email confirmation check failed:', confirmErr.message);
        }
      }

      // Sign out from the ephemeral server auth client immediately so no session is retained in server memory
      await authClient.auth.signOut().catch(() => {});

      if (!signInError && signInData?.user) {
        authUser = signInData.user;
      } else if (
        localExplicitUser &&
        typeof localExplicitUser.password === 'string' &&
        localExplicitUser.password.length > 0 &&
        localExplicitUser.password === password
      ) {
        // Hybrid/local seeded user whose password matched strictly
        authUser = localExplicitUser;
      } else {
        // Authentication failed: NEVER create user, NEVER overwrite password, NEVER fallback to another user!
        return null;
      }
    } else {
      // 2. Local / Simulated store strict authentication
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      const candidate = usersData?.users?.find(
        (u: any) => u.email?.toLowerCase().trim() === cleanEmail
      );

      // Strict check: user MUST exist and have a matching password
      if (!candidate || typeof candidate.password !== 'string' || !candidate.password || candidate.password !== password) {
        return null;
      }

      authUser = candidate;
    }

    if (!authUser || !authUser.id) return null;

    // 3. Verify explicit tenant_users relationship (NEVER fallback to first active tenant!)
    const tu = await this.resolveOrEnsureTenantUser(authUser);
    if (!tu) {
      return null;
    }

    const role: UserRole = tu.role;
    const tenantId: string | null = tu.tenant_id ?? null;
    const status = tu.status || 'active';

    // Non-SuperAdmin users MUST belong to a specific tenantId
    if (role !== 'SUPER_ADMIN' && !tenantId) {
      return null;
    }

    const resolvedUser: User = {
      id: authUser.id,
      name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Usuário',
      email: authUser.email!,
      phone: authUser.user_metadata?.phone || undefined,
      role,
      tenantId,
      status,
      createdAt: authUser.created_at,
    };

    this.invalidateUserCache(resolvedUser.id);
    this.cacheUser(resolvedUser);
    return resolvedUser;
  }

  private async resolveOrEnsureTenantUser(authUser: any) {
    if (!authUser || !authUser.id) return null;

    let { data: tuList } = await supabaseAdmin
      .from('tenant_users')
      .select('*')
      .eq('user_id', authUser.id);

    if ((!tuList || tuList.length === 0) && localStore.tenant_users.length > 0) {
      const localMatches = localStore.tenant_users.filter((r: any) => r.user_id === authUser.id);
      if (localMatches.length > 0) {
        tuList = localMatches;
      }
    }

    let tu =
      tuList && tuList.length > 0
        ? tuList.find((r: any) => r.status === 'active') ||
          tuList.find((r: any) => r.status === 'invited') ||
          tuList[0]
        : null;

    if (tu && tu.status === 'invited') {
      await supabaseAdmin
        .from('tenant_users')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', tu.id);
      tu.status = 'active';
    }

    if (!tu) {
      const emailLower = authUser.email?.toLowerCase().trim() || '';
      if (!emailLower) return null;

      const isSuperAdminEmail = isAllowlistedSuperAdminEmail(emailLower);

      let role: UserRole | null = isSuperAdminEmail ? 'SUPER_ADMIN' : null;
      let tenantId: string | null = null;

      if (!isSuperAdminEmail) {
        // 1. Check if there is an explicit delivery driver record for this user ID or email
        try {
          const localDriver = localStore.delivery_drivers.find(
            (d: any) =>
              d.user_id === authUser.id ||
              String(d.email || '').toLowerCase().trim() === emailLower
          );
          if (localDriver && localDriver.tenant_id) {
            role = 'DELIVERY_DRIVER';
            tenantId = localDriver.tenant_id;
          } else {
            const { data: drivers } = await supabaseAdmin
              .from('delivery_drivers')
              .select('id, tenant_id, email, user_id')
              .or(`email.ilike.${emailLower},user_id.eq.${authUser.id}`);
            const exactDriver = (drivers || []).find(
              (d: any) =>
                d.user_id === authUser.id ||
                String(d.email || '').toLowerCase().trim() === emailLower
            );
            if (exactDriver && exactDriver.tenant_id) {
              role = 'DELIVERY_DRIVER';
              tenantId = exactDriver.tenant_id;
            } else if (authUser.user_metadata?.role === 'DELIVERY_DRIVER' && authUser.user_metadata?.tenant_id) {
              role = 'DELIVERY_DRIVER';
              tenantId = authUser.user_metadata.tenant_id;
            }
          }
        } catch {
          if (authUser.user_metadata?.role === 'DELIVERY_DRIVER' && authUser.user_metadata?.tenant_id) {
            role = 'DELIVERY_DRIVER';
            tenantId = authUser.user_metadata.tenant_id;
          }
        }

        // 2. Check if there is an explicit professional record for this user ID or email
        if (!role) {
          try {
            const { data: profs } = await supabaseAdmin
              .from('professionals')
              .select('id, tenant_id, email, user_id')
              .or(`email.ilike.${emailLower},user_id.eq.${authUser.id}`);
            const exactProf = (profs || []).find(
              (p: any) =>
                p.user_id === authUser.id ||
                String(p.email || '').toLowerCase().trim() === emailLower
            );

            if (exactProf && exactProf.tenant_id) {
              role = 'PROFESSIONAL';
              tenantId = exactProf.tenant_id;
              await supabaseAdmin
                .from('professionals')
                .update({ user_id: authUser.id })
                .eq('id', exactProf.id);
            }
          } catch (profLookupErr) {
            console.warn('[AUTH] Could not check professional records:', profLookupErr);
          }
        }

        // 3. Check if this user is the explicit registered owner_email or email of a non-deleted tenant
        if (!role && !tenantId) {
          const { data: ownedTenants } = await supabaseAdmin
            .from('tenants')
            .select('id, email, owner_email')
            .or(`owner_email.ilike.${emailLower},email.ilike.${emailLower}`)
            .is('deleted_at', null)
            .limit(1);

          const exactMatch = (ownedTenants || []).find(
            (t: any) =>
              String(t.owner_email || '').toLowerCase().trim() === emailLower ||
              String(t.email || '').toLowerCase().trim() === emailLower
          );

          if (exactMatch) {
            role = 'CLIENT_ADMIN';
            tenantId = exactMatch.id;
          }
        }

        // SECURITY HARDENING: NEVER fallback to defaultTenants or anyTenants!
        if (!role || !tenantId) {
          return null;
        }
      }

      const now = new Date().toISOString();
      const insertData = {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        user_id: authUser.id,
        role: role!,
        status: 'active',
        created_at: now,
        updated_at: now,
      };

      const { data: inserted, error } = await supabaseAdmin
        .from('tenant_users')
        .insert(insertData)
        .select()
        .single();

      if (!error && inserted) {
        tu = inserted;
      } else {
        tu = insertData;
      }
    }

    return tu;
  }

  public async linkUserTenant(userId: string, tenantId: string | null, role: UserRole = 'CLIENT_ADMIN'): Promise<void> {
    this.invalidateUserCache(userId);
    const { data: tuList } = await supabaseAdmin
      .from('tenant_users')
      .select('*')
      .eq('user_id', userId);

    if (tuList && tuList.length > 0) {
      await supabaseAdmin
        .from('tenant_users')
        .update({
          tenant_id: tenantId,
          role,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    } else {
      await supabaseAdmin.from('tenant_users').insert({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        user_id: userId,
        role,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  public async findUserById(
    id: string,
    _fallbackClaims?: {
      email?: string;
      name?: string;
      role?: string;
      tenantId?: string | null;
    }
  ): Promise<User | null> {
    if (!id || typeof id !== 'string') return null;

    const cached = this.userSessionCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }

    // Query getUserById and tenant_users in parallel
    const [authUserRes, tuRes] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(id).catch(() => ({ data: null, error: true })),
      supabaseAdmin
        .from('tenant_users')
        .select('*')
        .eq('user_id', id)
        .then((r: any) => r)
        .catch(() => ({ data: null })),
    ]);

    let authUser: any = !authUserRes.error && authUserRes.data?.user ? authUserRes.data.user : null;
    if (!authUser) {
      authUser = localStore.auth_users.find((u: any) => u.id === id) || null;
    }

    if (!authUser) {
      try {
        const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 } as any);
        authUser = usersData?.users?.find((u: any) => u.id === id) || null;
      } catch {}
    }

    // SECURITY HARDENING: If the user does not exist in auth.users, reject immediately!
    if (!authUser || !authUser.id) {
      return null;
    }

    let tuList: any[] | null = tuRes?.data || null;
    if ((!tuList || tuList.length === 0) && localStore.tenant_users.length > 0) {
      const localMatches = localStore.tenant_users.filter((r: any) => r.user_id === id);
      if (localMatches.length > 0) {
        tuList = localMatches;
      }
    }

    const directTu =
      tuList && tuList.length > 0
        ? tuList.find((r: any) => r.status === 'active') ||
          tuList.find((r: any) => r.status === 'invited') ||
          tuList[0]
        : null;

    const tu = directTu || (await this.resolveOrEnsureTenantUser(authUser));
    if (!tu) {
      return null;
    }

    const role: UserRole = tu.role;
    const tenantId: string | null = tu.tenant_id ?? null;
    const status = tu.status || 'active';

    if (role !== 'SUPER_ADMIN' && !tenantId) {
      return null;
    }

    const resolvedUser: User = {
      id: authUser.id,
      name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Usuário',
      email: authUser.email!,
      phone: authUser.user_metadata?.phone || undefined,
      role,
      tenantId,
      status,
      createdAt: authUser.created_at,
    };

    this.cacheUser(resolvedUser, id);
    return resolvedUser;
  }

  public async findUserByEmail(email: string): Promise<User | null> {
    if (!email || typeof email !== 'string') return null;
    const cleanEmail = email.toLowerCase().trim();
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 } as any);
    const authUser = usersData?.users?.find(
      (u: any) => u.email?.toLowerCase().trim() === cleanEmail
    );
    if (!authUser) return null;

    const tu = await this.resolveOrEnsureTenantUser(authUser);
    if (!tu) return null;

    return {
      id: authUser.id,
      name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Usuário',
      email: authUser.email!,
      phone: authUser.user_metadata?.phone || undefined,
      role: tu.role,
      tenantId: tu.tenant_id ?? null,
      status: tu.status || 'active',
      createdAt: authUser.created_at,
    };
  }

  public async getAllUsers(requester: User): Promise<User[]> {
    if (requester.role !== 'SUPER_ADMIN') {
      throw new Error('Acesso negado: apenas Super Admin pode listar todos os usuários globais.');
    }

    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
    const { data: tuList } = await supabaseAdmin.from('tenant_users').select('*');

    const tuMap = new Map<string, any>();
    tuList?.forEach((tu: any) => tuMap.set(tu.user_id, tu));

    return (usersData?.users || []).map((u: any) => {
      const tu = tuMap.get(u.id);
      return {
        id: u.id,
        name: u.user_metadata?.name || u.email?.split('@')[0] || 'Usuário',
        email: u.email!,
        phone: u.user_metadata?.phone || undefined,
        role: tu ? tu.role : 'CLIENT_ADMIN',
        tenantId: tu ? tu.tenant_id : null,
        status: tu ? tu.status : 'active',
        createdAt: u.created_at,
      };
    });
  }

  public async getTenantUsers(tenantId: string, requester: User): Promise<User[]> {
    // Multi-tenant defense: ensure requester is Super Admin or belongs to this tenant
    if (requester.role !== 'SUPER_ADMIN' && requester.tenantId !== tenantId) {
      throw new Error('Acesso negado: você não tem permissão para acessar usuários deste tenant.');
    }

    const { data: tuList } = await supabaseAdmin
      .from('tenant_users')
      .select('*')
      .eq('tenant_id', tenantId);

    if (!tuList || tuList.length === 0) return [];

    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
    const userMap = new Map<string, any>();
    usersData?.users?.forEach((u: any) => userMap.set(u.id, u));

    return tuList.map((tu: any) => {
      const u = userMap.get(tu.user_id);
      return {
        id: tu.user_id,
        name: u?.user_metadata?.name || u?.email?.split('@')[0] || 'Colaborador',
        email: u?.email || '',
        phone: u?.user_metadata?.phone || undefined,
        role: tu.role as UserRole,
        tenantId: tu.tenant_id,
        status: tu.status as any,
        createdAt: tu.created_at,
      };
    });
  }

  public async createTenantUser(
    tenantId: string,
    data: {
      name: string;
      email: string;
      phone?: string;
      role?: UserRole;
      password?: string;
      shouldInvite?: boolean;
    },
    requester: User
  ): Promise<User> {
    if (requester.role !== 'SUPER_ADMIN' && requester.tenantId !== tenantId) {
      throw new Error('Acesso negado para adicionar usuário a este tenant.');
    }

    const cleanEmail = data.email.toLowerCase().trim();
    const existing = await this.findUserByEmail(cleanEmail);
    let authUser: any;
    const initialStatus = data.shouldInvite ? 'invited' : 'active';

    if (existing) {
      authUser = { id: existing.id, email: existing.email, created_at: existing.createdAt };
    } else {
      if (data.shouldInvite) {
        // Use Supabase Admin invite user by email
        const { data: inviteRes, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(cleanEmail, {
          data: { name: data.name.trim(), phone: data.phone || '' },
        });
        if (error) {
          if (error.message?.includes('already been registered') || error.message?.includes('already registered')) {
            const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
            const found = usersData?.users?.find((u: any) => u.email?.toLowerCase().trim() === cleanEmail);
            if (found) authUser = found;
            else throw new Error(error.message);
          } else {
            throw new Error(error.message || 'Erro ao enviar convite via Supabase Auth.');
          }
        } else {
          authUser = inviteRes.user;
        }
      } else {
        // Create user directly
        const { data: createRes, error } = await supabaseAdmin.auth.admin.createUser({
          email: cleanEmail,
          password: data.password || 'cliente123',
          email_confirm: true,
          user_metadata: { name: data.name.trim(), phone: data.phone || '' },
        });
        if (error) {
          if (error.message?.includes('already been registered') || error.message?.includes('already registered')) {
            const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
            const found = usersData?.users?.find((u: any) => u.email?.toLowerCase().trim() === cleanEmail);
            if (found) authUser = found;
            else throw new Error(error.message);
          } else {
            throw new Error(error.message || 'Erro ao criar usuário no Supabase Auth.');
          }
        } else {
          authUser = createRes.user;
        }
      }
    }

    // Link in tenant_users table if not already linked
    const { data: existingTu } = await supabaseAdmin
      .from('tenant_users')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', authUser.id);

    if (!existingTu || existingTu.length === 0) {
      await supabaseAdmin.from('tenant_users').insert({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        user_id: authUser.id,
        role: data.role || 'CLIENT_ADMIN',
        status: initialStatus,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    await this.logAudit({
      actorUserId: requester.id,
      actorUserName: requester.name,
      tenantId,
      action: data.shouldInvite ? 'USER_INVITE' : 'USER_CREATE',
      entity: 'tenant_users',
      entityId: authUser.id,
      metadata: { email: cleanEmail, role: data.role || 'CLIENT_ADMIN', status: initialStatus },
    });

    return {
      id: authUser.id,
      name: data.name.trim(),
      email: cleanEmail,
      phone: data.phone || undefined,
      role: data.role || 'CLIENT_ADMIN',
      tenantId,
      status: initialStatus,
      createdAt: authUser.created_at || new Date().toISOString(),
    };
  }

  public async updateTenantUser(
    tenantId: string,
    userId: string,
    data: {
      name?: string;
      phone?: string;
      status?: 'active' | 'inactive';
      role?: UserRole;
      password?: string;
    },
    requester: User
  ): Promise<User> {
    if (requester.role !== 'SUPER_ADMIN' && requester.tenantId !== tenantId) {
      throw new Error('Acesso negado para modificar usuário deste tenant.');
    }

    const now = new Date().toISOString();

    // 1. Update Supabase Auth user metadata or password
    if (data.name !== undefined || data.phone !== undefined || data.password) {
      const updatePayload: any = {};
      if (data.password) updatePayload.password = data.password;
      if (data.name || data.phone) {
        updatePayload.user_metadata = {
          ...(data.name ? { name: data.name.trim() } : {}),
          ...(data.phone ? { phone: data.phone } : {}),
        };
      }
      await supabaseAdmin.auth.admin.updateUserById(userId, updatePayload);
    }

    // 2. Update tenant_users status or role
    const patch: any = { updated_at: now };
    if (data.status) patch.status = data.status;
    if (data.role && requester.role === 'SUPER_ADMIN') patch.role = data.role;

    await supabaseAdmin
      .from('tenant_users')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('user_id', userId);

    await this.logAudit({
      actorUserId: requester.id,
      actorUserName: requester.name,
      tenantId,
      action: 'USER_UPDATE',
      entity: 'tenant_users',
      entityId: userId,
      metadata: data,
    });

    this.invalidateUserCache(userId);
    if (data.status === 'inactive' || data.password || data.role) {
      revokeAllUserSessions(userId);
    }
    const updated = await this.findUserById(userId);
    return updated!;
  }

  public async deleteTenantUser(tenantId: string, userId: string, requester: User): Promise<boolean> {
    if (requester.role !== 'SUPER_ADMIN' && requester.tenantId !== tenantId) {
      throw new Error('Acesso negado para remover usuário.');
    }

    this.invalidateUserCache(userId);
    revokeAllUserSessions(userId);
    await supabaseAdmin
      .from('tenant_users')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('user_id', userId);

    await supabaseAdmin.auth.admin.deleteUser(userId);

    await this.logAudit({
      actorUserId: requester.id,
      actorUserName: requester.name,
      tenantId,
      action: 'USER_DELETE',
      entity: 'tenant_users',
      entityId: userId,
    });

    return true;
  }

  public async resendInvite(tenantId: string, userId: string, requester: User): Promise<string> {
    if (requester.role !== 'SUPER_ADMIN' && requester.tenantId !== tenantId) {
      throw new Error('Acesso negado.');
    }

    const user = await this.findUserById(userId);
    if (!user) throw new Error('Usuário não encontrado.');

    await supabaseAdmin.auth.admin.inviteUserByEmail(user.email);
    await supabaseAdmin
      .from('tenant_users')
      .update({ status: 'invited', updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId);

    await this.logAudit({
      actorUserId: requester.id,
      actorUserName: requester.name,
      tenantId,
      action: 'INVITE_RESEND',
      entity: 'tenant_users',
      entityId: userId,
      metadata: { email: user.email },
    });

    return `Convite de acesso do Supabase Auth reenviado para ${user.email}.`;
  }

  // ==========================================
  // TENANTS MANAGEMENT (PostgreSQL on Supabase)
  // ==========================================
  public async getAllTenants(requester: User): Promise<Tenant[]> {
    if (requester.role !== 'SUPER_ADMIN') {
      throw new Error('Apenas Super Admin pode listar todas as empresas.');
    }

    const { data: tenantsData } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (!tenantsData) return [];

    const { data: settingsData } = await supabaseAdmin.from('tenant_settings').select('*');
    const { data: featuresData } = await supabaseAdmin.from('tenant_features').select('*');

    const settingsMap = new Map<string, any>();
    settingsData?.forEach((s: any) => settingsMap.set(s.tenant_id, s));

    const featuresMap = new Map<string, any>();
    featuresData?.forEach((f: any) => {
      if (!featuresMap.has(f.tenant_id)) featuresMap.set(f.tenant_id, {});
      featuresMap.get(f.tenant_id)[f.feature_key] = f.is_enabled;
    });

    return tenantsData.map((t: any) =>
      this.formatTenant(t, settingsMap.get(t.id), featuresMap.get(t.id))
    );
  }

  public async getTenantById(id: string, requester?: User): Promise<Tenant | null> {
    // Multi-tenant check when requester is provided
    if (requester && requester.role !== 'SUPER_ADMIN' && requester.tenantId !== id) {
      throw new Error('Acesso negado: você não tem permissão para acessar os dados deste tenant.');
    }

    const cached = this.tenantCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.tenant;
    }

    const [{ data: t }, { data: s }, { data: fList }] = await Promise.all([
      supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .single(),
      supabaseAdmin
        .from('tenant_settings')
        .select('*')
        .eq('tenant_id', id)
        .maybeSingle(),
      supabaseAdmin
        .from('tenant_features')
        .select('*')
        .eq('tenant_id', id),
    ]);

    if (!t) return null;

    const overrides: any = {};
    fList?.forEach((f: any) => {
      overrides[f.feature_key] = f.is_enabled;
    });

    const formatted = this.formatTenant(t, s, overrides);
    this.tenantCache.set(id, {
      tenant: formatted,
      expiresAt: Date.now() + this.TENANT_CACHE_TTL_MS,
    });
    return formatted;
  }

  public async getTenantBySlug(slug: string): Promise<Tenant | null> {
    const { data: t } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .ilike('slug', slug.trim())
      .is('deleted_at', null)
      .single();

    if (!t) return null;

    const { data: s } = await supabaseAdmin
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', t.id)
      .maybeSingle();

    const { data: fList } = await supabaseAdmin
      .from('tenant_features')
      .select('*')
      .eq('tenant_id', t.id);

    const overrides: any = {};
    fList?.forEach((f: any) => {
      overrides[f.feature_key] = f.is_enabled;
    });

    return this.formatTenant(t, s, overrides);
  }

  public async isSlugAvailable(
    slug: string,
    excludeId?: string
  ): Promise<{ available: boolean; error?: string }> {
    const val = validateSlug(slug);
    if (!val.valid) return { available: false, error: val.error };

    const clean = slug.toLowerCase().trim();
    let query = supabaseAdmin.from('tenants').select('id').ilike('slug', clean).is('deleted_at', null);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data } = await query;
    if (data && data.length > 0) {
      return { available: false, error: `O slug "${clean}" já está em uso por outro estabelecimento.` };
    }

    return { available: true };
  }

  public async createTenant(
    payload: {
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
      shouldInvite?: boolean;
    },
    requester: User
  ): Promise<{ tenant: Tenant; defaultUser: User }> {
    if (requester.role !== 'SUPER_ADMIN') {
      throw new Error('Apenas Super Admin pode cadastrar novas empresas.');
    }

    const check = await this.isSlugAvailable(payload.slug);
    if (!check.available) {
      throw new Error(check.error || 'Slug indisponível.');
    }

    const tenantId = crypto.randomUUID(); // Clean PostgreSQL UUID
    const cleanSlug = payload.slug.trim().toLowerCase();
    const effectiveBaseDomain = getServerBaseDomain(payload.baseDomain);
    const subdomain = getTenantSubdomain(cleanSlug, effectiveBaseDomain);
    const now = new Date().toISOString();

    // Resolve target plan ID (ensure valid UUID)
    let targetPlanId = payload.planId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetPlanId);
    if (!isUuid) {
      const { data: plans } = await supabaseAdmin.from('plans').select('*');
      const found = plans?.find((p: any) =>
        p.id === targetPlanId ||
        p.name?.toLowerCase() === targetPlanId.toLowerCase() ||
        (targetPlanId.includes('pro') && p.name?.toLowerCase().includes('pro')) ||
        (targetPlanId.includes('essencial') && p.name?.toLowerCase().includes('essencial')) ||
        (targetPlanId.includes('premium') && p.name?.toLowerCase().includes('premium'))
      );
      if (found) {
        targetPlanId = found.id;
      } else if (plans && plans.length > 0) {
        targetPlanId = plans[0].id;
      }
    }

    try {
      // 1. Insert into tenants table
      const { error: tenantInsertErr } = await supabaseAdmin.from('tenants').insert({
        id: tenantId,
        name: payload.name.trim(),
        slug: cleanSlug,
        segment: payload.segment.trim(),
        cnpj: payload.cnpj?.trim() || '',
        phone: payload.phone.trim(),
        whatsapp: payload.whatsapp.trim(),
        email: payload.email.toLowerCase().trim(),
        plan_id: targetPlanId,
        status: payload.status || 'teste',
        owner_name: payload.ownerName.trim(),
        owner_email: payload.ownerEmail.toLowerCase().trim(),
        owner_phone: payload.ownerPhone.trim(),
        subdomain,
        notes: '',
        deleted_at: null,
        created_at: now,
        updated_at: now,
      });

      if (tenantInsertErr) {
        throw new Error(`Erro ao salvar empresa no banco de dados: ${tenantInsertErr.message}`);
      }

      // 2. Insert into tenant_settings table
      const { error: settingsErr } = await supabaseAdmin.from('tenant_settings').insert({
        tenant_id: tenantId,
        primary_color: payload.primaryColor || '#1e293b',
        secondary_color: payload.secondaryColor || '#3b82f6',
        accent_color: payload.accentColor || '#f59e0b',
        font_family: payload.fontFamily || 'Inter',
        logo_url: payload.logoUrl || '',
        tagline: '',
        created_at: now,
        updated_at: now,
      });

      if (settingsErr) {
        console.warn('[TENANT_CREATE] Settings insert notice:', settingsErr.message);
      }

      // 3. Register or invite client owner via Supabase Auth
      let ownerUser: User;
      try {
        ownerUser = await this.createTenantUser(
          tenantId,
          {
            name: payload.ownerName,
            email: payload.ownerEmail,
            phone: payload.ownerPhone,
            role: 'CLIENT_ADMIN',
            shouldInvite: payload.shouldInvite,
          },
          requester
        );
      } catch (userErr: any) {
        console.warn('[TENANT_CREATE] Owner user linking notice:', userErr.message);
        // Fallback user link
        const cleanOwnerEmail = payload.ownerEmail.toLowerCase().trim();
        const existing = await this.findUserByEmail(cleanOwnerEmail);
        if (existing) {
          ownerUser = existing;
          const { data: existingTu } = await supabaseAdmin
            .from('tenant_users')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('user_id', existing.id);

          if (!existingTu || existingTu.length === 0) {
            await supabaseAdmin.from('tenant_users').insert({
              id: crypto.randomUUID(),
              tenant_id: tenantId,
              user_id: existing.id,
              role: 'CLIENT_ADMIN',
              status: 'active',
              created_at: now,
              updated_at: now,
            });
          }
        } else {
          ownerUser = {
            id: crypto.randomUUID(),
            name: payload.ownerName.trim(),
            email: cleanOwnerEmail,
            phone: payload.ownerPhone,
            role: 'CLIENT_ADMIN',
            tenantId,
            status: 'active',
            createdAt: now,
          };
        }
      }

      await this.logAudit({
        actorUserId: requester.id,
        actorUserName: requester.name,
        tenantId,
        action: 'TENANT_CREATE',
        entity: 'tenants',
        entityId: tenantId,
        metadata: { name: payload.name, slug: cleanSlug, planId: targetPlanId },
      });

      const tenant = await this.getTenantById(tenantId, requester);
      if (!tenant) {
        throw new Error('Empresa cadastrada com sucesso, mas não foi possível carregá-la.');
      }
      return { tenant, defaultUser: ownerUser };
    } catch (err: any) {
      // Rollback on fatal failure so tenant slug does not remain blocked
      try {
        await supabaseAdmin.from('tenants').delete().eq('id', tenantId);
      } catch (rollbackErr) {
        // ignore rollback error
      }
      throw err;
    }
  }

  public async updateTenant(id: string, payload: Partial<Tenant>, requester: User, correlationId?: string): Promise<Tenant> {
    const cid = correlationId || `repo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const implType = isRealSupabaseConfigured ? 'remote_supabase' : 'local_adapter';

    console.log(`[${cid}] [STAGE:VALIDATION] Validating permissions for tenant_id=${id}, requester_role=${requester.role}`);
    if (requester.role !== 'SUPER_ADMIN' && requester.tenantId !== id) {
      console.error(`[${cid}] [STAGE:VALIDATION:ERROR] Access denied for tenant_id=${id}`);
      throw new Error('Acesso negado para modificar esta empresa.');
    }

    const existing = await this.getTenantById(id, requester);
    if (!existing) {
      console.error(`[${cid}] [STAGE:VALIDATION:ERROR] Tenant not found for id=${id}`);
      throw new Error('Empresa não encontrada.');
    }

    console.log(`[${cid}] [STAGE:REPOSITORY] Repository update initialized. Implementation=${implType}`);

    const now = new Date().toISOString();
    const tenantPatch: any = { updated_at: now };

    if (payload.slug && payload.slug !== existing.slug) {
      if (requester.role !== 'SUPER_ADMIN') {
        throw new Error('Apenas Super Admin pode alterar o slug.');
      }
      const check = await this.isSlugAvailable(payload.slug, id);
      if (!check.available) throw new Error(check.error || 'Slug indisponível.');
      const cleanSlug = payload.slug.trim().toLowerCase();
      tenantPatch.slug = cleanSlug;
      tenantPatch.subdomain = getTenantSubdomain(cleanSlug, getServerBaseDomain());
    }

    if (payload.name) tenantPatch.name = payload.name.trim();
    if (payload.segment) tenantPatch.segment = payload.segment.trim();
    if (payload.cnpj !== undefined) tenantPatch.cnpj = payload.cnpj;
    if (payload.phone) tenantPatch.phone = payload.phone;
    if (payload.whatsapp) tenantPatch.whatsapp = payload.whatsapp;
    if (payload.email) tenantPatch.email = payload.email.toLowerCase().trim();
    if (payload.ownerName) tenantPatch.owner_name = payload.ownerName;
    if (payload.ownerEmail) tenantPatch.owner_email = payload.ownerEmail.toLowerCase().trim();
    if (payload.ownerPhone) tenantPatch.owner_phone = payload.ownerPhone;
    if (payload.notes !== undefined) tenantPatch.notes = payload.notes;
    if (payload.cep !== undefined) tenantPatch.cep = payload.cep;
    if (payload.street !== undefined) tenantPatch.street = payload.street;
    if (payload.number !== undefined) tenantPatch.number = payload.number;
    if (payload.complement !== undefined) tenantPatch.complement = payload.complement;
    if (payload.neighborhood !== undefined) tenantPatch.neighborhood = payload.neighborhood;
    if (payload.city !== undefined) tenantPatch.city = payload.city;
    if (payload.state !== undefined) tenantPatch.state = payload.state;

    if (requester.role === 'SUPER_ADMIN') {
      if (payload.planId) tenantPatch.plan_id = payload.planId;
      if (payload.status) tenantPatch.status = payload.status;
    }

    console.log(`[${cid}] [STAGE:PERSISTENCE] Table=tenants, Op=update, id=${id}, Implementation=${implType}`);
    const { data: tenantUpdateData, error: tenantUpdateErr } = await supabaseAdmin
      .from('tenants')
      .update(tenantPatch)
      .eq('id', id)
      .select();

    if (tenantUpdateErr) {
      console.error(`[${cid}] [STAGE:PERSISTENCE:ERROR] Table=tenants, Op=update, error=${tenantUpdateErr.message}`);
      throw new Error(`Erro ao atualizar dados cadastrais da empresa: ${tenantUpdateErr.message}`);
    }
    console.log(`[${cid}] [STAGE:PERSISTENCE:SUCCESS] Table=tenants, Op=update, rowsAffected=${tenantUpdateData?.length ?? 1}`);

    // Appearance updates
    if (payload.appearance) {
      const app = payload.appearance;
      console.log(`[${cid}] [STAGE:PERSISTENCE] Table=tenant_settings, Op=select, tenant_id=${id}, Implementation=${implType}`);
      const { data: existingSettings, error: selectErr } = await supabaseAdmin
        .from('tenant_settings')
        .select('*')
        .eq('tenant_id', id)
        .maybeSingle();

      if (selectErr) {
        console.warn(`[${cid}] [STAGE:PERSISTENCE:WARN] Table=tenant_settings, Op=select error: ${selectErr.message}`);
      }

      const settingsPatch: any = {
        tenant_id: id,
        primary_color: app.primaryColor !== undefined ? app.primaryColor : (existingSettings?.primary_color || '#1e293b'),
        secondary_color: app.secondaryColor !== undefined ? app.secondaryColor : (existingSettings?.secondary_color || '#3b82f6'),
        accent_color: app.accentColor !== undefined ? app.accentColor : (existingSettings?.accent_color || '#f59e0b'),
        font_family: app.fontFamily !== undefined ? app.fontFamily : (existingSettings?.font_family || 'Inter'),
        logo_url: app.logoUrl !== undefined ? app.logoUrl : (existingSettings?.logo_url || ''),
        tagline: app.tagline !== undefined ? app.tagline : (existingSettings?.tagline || ''),
        updated_at: now,
      };

      console.log(`[${cid}] [STAGE:PERSISTENCE] Table=tenant_settings, Op=upsert, tenant_id=${id}, Implementation=${implType}`);

      const { data: upsertData, error: upsertErr } = await supabaseAdmin
        .from('tenant_settings')
        .upsert(settingsPatch, { onConflict: 'tenant_id' })
        .select();

      if (upsertErr) {
        console.error(`[${cid}] [STAGE:PERSISTENCE:ERROR] Table=tenant_settings, Op=upsert, error=${upsertErr.message}`);
        throw new Error(`Erro ao persistir identidade visual no banco: ${upsertErr.message}`);
      }

      const rowsAffected = upsertData?.length ?? 1;
      console.log(`[${cid}] [STAGE:PERSISTENCE:SUCCESS] Table=tenant_settings, Op=upsert, rowsAffected=${rowsAffected}`);

      // Synchronize appearance with the tenant's site draft and published snapshot
      try {
        console.log(`[${cid}] [STAGE:PERSISTENCE] Table=sites, Op=select, tenant_id=${id}, Implementation=${implType}`);
        const { data: siteRecord } = await supabaseAdmin
          .from('sites')
          .select('id, draft_data, published_data, status')
          .eq('tenant_id', id)
          .maybeSingle();

        if (siteRecord) {
          const draftData = siteRecord.draft_data || {};
          const currentApp = draftData.appearance || {};
          const updatedSiteApp = {
            ...currentApp,
            primaryColor: settingsPatch.primary_color,
            secondaryColor: settingsPatch.secondary_color,
            accentColor: settingsPatch.accent_color,
            fontFamily: settingsPatch.font_family,
          };

          const sitePatch: any = {
            draft_data: { ...draftData, appearance: updatedSiteApp },
            updated_at: now,
          };

          if (siteRecord.published_data) {
            sitePatch.published_data = {
              ...siteRecord.published_data,
              appearance: {
                ...(siteRecord.published_data.appearance || {}),
                primaryColor: settingsPatch.primary_color,
                secondaryColor: settingsPatch.secondary_color,
                accentColor: settingsPatch.accent_color,
                fontFamily: settingsPatch.font_family,
              },
            };
          }

          console.log(`[${cid}] [STAGE:PERSISTENCE] Table=sites, Op=update, site_id=${siteRecord.id}, Implementation=${implType}`);
          const { error: siteUpdateErr } = await supabaseAdmin.from('sites').update(sitePatch).eq('id', siteRecord.id);
          if (siteUpdateErr) {
            console.warn(`[${cid}] [STAGE:PERSISTENCE:WARN] Table=sites, Op=update error: ${siteUpdateErr.message}`);
          } else {
            console.log(`[${cid}] [STAGE:PERSISTENCE:SUCCESS] Table=sites, Op=update, site_id=${siteRecord.id}`);
          }
        }
      } catch (siteSyncErr: any) {
        console.warn(`[${cid}] [STAGE:PERSISTENCE:WARN] Site sync notice: ${siteSyncErr.message}`);
      }
    }

    await this.logAudit({
      actorUserId: requester.id,
      actorUserName: requester.name,
      tenantId: id,
      action: 'TENANT_UPDATE',
      entity: 'tenants',
      entityId: id,
      metadata: payload,
    });

    this.invalidateTenantCache(id);
    console.log(`[${cid}] [STAGE:CONFIRMATION] Persistence confirmed, fetching updated record for tenant_id=${id}`);
    const freshTenant = await this.getTenantById(id, requester);
    if (!freshTenant) {
      console.error(`[${cid}] [STAGE:CONFIRMATION:ERROR] Failed to reload tenant after write: tenant_id=${id}`);
      throw new Error('Falha ao confirmar gravação dos dados no banco.');
    }
    console.log(`[${cid}] [STAGE:CONFIRMATION:SUCCESS] Confirmed persistence for tenant_id=${id}`);
    return freshTenant;
  }

  public async updateTenantStatus(id: string, status: TenantStatus, requester: User): Promise<Tenant> {
    if (requester.role !== 'SUPER_ADMIN') {
      throw new Error('Apenas Super Admin pode alterar status da empresa.');
    }
    const now = new Date().toISOString();
    await supabaseAdmin.from('tenants').update({ status, updated_at: now }).eq('id', id);
    this.invalidateTenantCache(id);

    await this.logAudit({
      actorUserId: requester.id,
      actorUserName: requester.name,
      tenantId: id,
      action: 'TENANT_STATUS_CHANGE',
      entity: 'tenants',
      entityId: id,
      metadata: { newStatus: status },
    });

    return (await this.getTenantById(id, requester))!;
  }

  public async softDeleteTenant(id: string, requester: User): Promise<boolean> {
    if (requester.role !== 'SUPER_ADMIN') {
      throw new Error('Apenas Super Admin pode excluir empresas.');
    }

    const now = new Date().toISOString();
    await supabaseAdmin
      .from('tenants')
      .update({ deleted_at: now, status: 'cancelado', updated_at: now })
      .eq('id', id);

    await supabaseAdmin
      .from('tenant_users')
      .update({ status: 'inactive', updated_at: now })
      .eq('tenant_id', id);

    this.invalidateTenantCache(id);

    await this.logAudit({
      actorUserId: requester.id,
      actorUserName: requester.name,
      tenantId: id,
      action: 'TENANT_SOFT_DELETE',
      entity: 'tenants',
      entityId: id,
    });

    return true;
  }

  // ==========================================
  // FEATURES RESOLUTION
  // ==========================================
  public async resolveTenantFeatures(tenantId: string): Promise<Record<FeatureKey, boolean>> {
    const cached = this.featuresCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.features;
    }

    const [{ data: tenant }, { data: tfList }, { data: allFeats }] = await Promise.all([
      supabaseAdmin
        .from('tenants')
        .select('plan_id')
        .eq('id', tenantId)
        .single(),
      supabaseAdmin
        .from('tenant_features')
        .select('feature_key, is_enabled')
        .eq('tenant_id', tenantId),
      supabaseAdmin.from('features').select('key'),
    ]);

    if (!tenant) throw new Error('Tenant não encontrado para resolução de features.');

    const { data: pfList } = await supabaseAdmin
      .from('plan_features')
      .select('feature_key')
      .eq('plan_id', tenant.plan_id);

    const planSet = new Set<string>(pfList?.map((p: any) => String(p.feature_key)) || []);

    const overrideMap = new Map<string, boolean>();
    tfList?.forEach((t: any) => {
      if (typeof t.is_enabled === 'boolean') {
        overrideMap.set(String(t.feature_key), t.is_enabled);
      }
    });

    const allFeatureKeys = new Set<string>(SYSTEM_FEATURES.map((f) => f.key));
    allFeats?.forEach((f: any) => {
      if (f?.key) allFeatureKeys.add(String(f.key));
    });
    planSet.forEach((k) => {
      if (k) allFeatureKeys.add(k);
    });
    overrideMap.forEach((_v, k) => {
      if (k) allFeatureKeys.add(k);
    });

    const result: Record<string, boolean> = {};

    allFeatureKeys.forEach((key) => {
      // Strict precedence: Explicit Super Admin override in tenant_features ALWAYS prevails over plan_features
      if (overrideMap.has(key)) {
        result[key] = overrideMap.get(key)!;
      } else {
        result[key] = planSet.has(key);
      }
    });

    const typedResult = result as Record<FeatureKey, boolean>;
    this.featuresCache.set(tenantId, {
      features: typedResult,
      expiresAt: Date.now() + this.FEATURES_CACHE_TTL_MS,
    });
    return typedResult;
  }

  public async updateTenantFeatureOverrides(
    tenantId: string,
    overrides: Partial<Record<FeatureKey, boolean>>,
    requester: User
  ): Promise<void> {
    if (requester.role !== 'SUPER_ADMIN') {
      throw new Error('Apenas Super Admin pode alterar overrides de features.');
    }

    const now = new Date().toISOString();

    for (const [key, val] of Object.entries(overrides)) {
      if (typeof val === 'boolean') {
        const { data: existing } = await supabaseAdmin
          .from('tenant_features')
          .select('feature_key')
          .eq('tenant_id', tenantId)
          .eq('feature_key', key);

        if (existing && existing.length > 0) {
          await supabaseAdmin
            .from('tenant_features')
            .update({ is_enabled: val, updated_at: now })
            .eq('tenant_id', tenantId)
            .eq('feature_key', key);
        } else {
          await supabaseAdmin.from('tenant_features').insert({
            tenant_id: tenantId,
            feature_key: key,
            is_enabled: val,
            created_at: now,
            updated_at: now,
          });
        }
      }
    }

    this.invalidateTenantCache(tenantId);

    await this.logAudit({
      actorUserId: requester.id,
      actorUserName: requester.name,
      tenantId,
      action: 'FEATURE_OVERRIDE_UPDATE',
      entity: 'tenant_features',
      entityId: tenantId,
      metadata: overrides,
    });
  }

  public async resetTenantFeatureOverride(
    tenantId: string,
    featureKey: FeatureKey,
    requester: User
  ): Promise<void> {
    if (requester.role !== 'SUPER_ADMIN') {
      throw new Error('Apenas Super Admin pode restaurar overrides.');
    }

    await supabaseAdmin
      .from('tenant_features')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('feature_key', featureKey);

    this.invalidateTenantCache(tenantId);

    await this.logAudit({
      actorUserId: requester.id,
      actorUserName: requester.name,
      tenantId,
      action: 'FEATURE_OVERRIDE_RESET',
      entity: 'tenant_features',
      entityId: tenantId,
      metadata: { featureKey },
    });
  }

  // ==========================================
  // PLANS MANAGEMENT
  // ==========================================
  public async getPlans(): Promise<Plan[]> {
    const { data: plansData } = await supabaseAdmin.from('plans').select('*').order('price', { ascending: true });
    if (!plansData) return [];

    const { data: pfData } = await supabaseAdmin.from('plan_features').select('*');
    const pfMap = new Map<string, FeatureKey[]>();

    pfData?.forEach((pf: any) => {
      if (!pfMap.has(pf.plan_id)) pfMap.set(pf.plan_id, []);
      pfMap.get(pf.plan_id)!.push(pf.feature_key);
    });

    return plansData.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: parseFloat(p.price) || 0,
      status: p.status,
      includedFeatures: pfMap.get(p.id) || [],
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));
  }

  public async updatePlan(id: string, payload: Partial<Plan>, requester: User): Promise<Plan> {
    if (requester.role !== 'SUPER_ADMIN') {
      throw new Error('Apenas Super Admin pode alterar planos.');
    }

    const now = new Date().toISOString();
    const patch: any = { updated_at: now };
    if (payload.name) patch.name = payload.name;
    if (payload.description) patch.description = payload.description;
    if (payload.price !== undefined) patch.price = payload.price;
    if (payload.status) patch.status = payload.status;

    await supabaseAdmin.from('plans').update(patch).eq('id', id);

    if (payload.includedFeatures) {
      await supabaseAdmin.from('plan_features').delete().eq('plan_id', id);
      for (const fk of payload.includedFeatures) {
        await supabaseAdmin.from('plan_features').insert({
          plan_id: id,
          feature_key: fk,
          created_at: now,
        });
      }
    }

    await this.logAudit({
      actorUserId: requester.id,
      actorUserName: requester.name,
      action: 'PLAN_UPDATE',
      entity: 'plans',
      entityId: id,
      metadata: payload,
    });

    const plans = await this.getPlans();
    return plans.find((p) => p.id === id)!;
  }

  // ==========================================
  // SUPABASE STORAGE (Bucket: tenant-media)
  // Path pattern: {tenant_id}/branding/{filename}
  // ==========================================
  public async uploadTenantMedia(
    tenantId: string,
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    subfolder = 'branding'
  ): Promise<string> {
    const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '.png';
    const cleanFileName = `${crypto.randomUUID()}${ext}`;
    const storagePath = `${tenantId}/${subfolder}/${cleanFileName}`;

    const { error } = await supabaseAdmin
      .storage
      .from('tenant-media')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Erro ao enviar arquivo para o Supabase Storage: ${error.message}`);
    }

    const { data } = supabaseAdmin.storage.from('tenant-media').getPublicUrl(storagePath);
    return data.publicUrl;
  }

  public async deleteTenantMedia(tenantId: string, fileUrl: string): Promise<boolean> {
    try {
      const fileName = fileUrl.split('/').pop();
      if (!fileName) return false;
      const storagePath = `${tenantId}/branding/${fileName}`;
      await supabaseAdmin.storage.from('tenant-media').remove([storagePath]);
      return true;
    } catch {
      return false;
    }
  }

  private formatTenant(t: any, s: any, overrides: any): Tenant {
    const cleanSlug = String(t.slug || '').trim().toLowerCase();
    const canonicalSubdomain = cleanSlug
      ? getTenantSubdomain(cleanSlug, getServerBaseDomain())
      : t.subdomain;

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      segment: t.segment,
      cnpj: t.cnpj || undefined,
      phone: t.phone,
      whatsapp: t.whatsapp,
      email: t.email,
      planId: t.plan_id,
      status: t.status as TenantStatus,
      ownerName: t.owner_name,
      ownerEmail: t.owner_email,
      ownerPhone: t.owner_phone,
      subdomain: canonicalSubdomain,
      cep: t.cep || undefined,
      street: t.street || undefined,
      number: t.number || undefined,
      complement: t.complement || undefined,
      neighborhood: t.neighborhood || undefined,
      city: t.city || undefined,
      state: t.state || undefined,
      notes: t.notes || undefined,
      deletedAt: t.deleted_at || null,
      appearance: {
        primaryColor: s?.primary_color || '#1e293b',
        secondaryColor: s?.secondary_color || '#3b82f6',
        accentColor: s?.accent_color || '#f59e0b',
        fontFamily: s?.font_family || 'Inter',
        logoUrl: s?.logo_url || '',
        tagline: s?.tagline || '',
      },
      featureOverrides: overrides || {},
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    };
  }
}

export const repo = new SaasRepository();
