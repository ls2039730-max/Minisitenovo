import crypto from 'crypto';
import {
  supabaseAdmin,
  localStore,
  markTableAsLocalFallback,
  getLocalTableBuilder,
} from '../supabaseAdmin.js';
import { repo } from './repository.js';
import { orderRepo } from './orderRepository.js';
import {
  calculateRouteDistanceServer,
  geocodeAddressServer,
} from '../services/routingService.js';
import {
  calculateHaversineDistanceKm,
  formatAddressSummary,
  hasValidCoordinates,
} from '../../src/utils/deliveryFeeCalculator.js';
import { buildWhatsAppUrl } from '../../src/utils/whatsappMessageBuilder.js';
import { buildPublicTenantUrl } from '../../src/utils/url.js';
import { User } from '../../src/types/saas.js';
import {
  DeliveryDriver,
  CreateDeliveryDriverPayload,
  UpdateDeliveryDriverPayload,
  DriverAvailabilityStatus,
  DeliveryRoute,
  DeliveryRouteStop,
  DeliveryRouteStatus,
  DeliveryStopStatus,
  DeliveryFailureReason,
  FAILURE_REASON_LABELS,
  STOP_STATUS_LABELS,
  DeliveryEvent,
  DeliveryNotification,
  DispatchOrderItem,
  RouteClusterSuggestion,
  DeliveryHubFilters,
  DeliveryHubOverview,
  CreateDeliveryRoutePayload,
  RoutePreviewResult,
  PublicDeliveryTrackingInfo,
} from '../../src/types/deliveryHub.js';
import { Order, OrderDispatchStatus, GeocodeStatus } from '../../src/types/order.js';

function isMissingTableError(error: any): boolean {
  if (!error) return false;
  const msg = String(error.message || error || '').toLowerCase();
  const code = String(error.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    (msg.includes('relation') && msg.includes('does not exist')) ||
    (msg.includes('table') && msg.includes('does not exist')) ||
    msg.includes('schema cache')
  );
}

export class DeliveryHubRepository {
  private inFlightNotifications = new Map<string, Promise<DeliveryNotification>>();

  // ==========================================
  // 0. RESILIENT MULTI-LAYER TABLE ACCESS
  // ==========================================
  private async queryTable<T = any>(
    tableName:
      | 'delivery_drivers'
      | 'delivery_routes'
      | 'delivery_route_stops'
      | 'delivery_events'
      | 'delivery_notifications',
    execFn: (builder: any) => Promise<{ data: T | null; error: any }>
  ): Promise<{ data: T | null; error: any }> {
    const res = await execFn(supabaseAdmin.from(tableName));
    if (res.error && isMissingTableError(res.error)) {
      markTableAsLocalFallback(tableName);
      return execFn(getLocalTableBuilder(tableName));
    }
    return res;
  }

  private async logEvent(params: {
    tenantId: string;
    routeId?: string | null;
    stopId?: string | null;
    orderId?: string | null;
    driverId?: string | null;
    actorUserId?: string | null;
    actorName?: string | null;
    eventType: DeliveryEvent['eventType'];
    previousStatus?: string | null;
    newStatus?: string | null;
    metadata?: Record<string, any> | null;
  }): Promise<DeliveryEvent> {
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      tenant_id: params.tenantId,
      route_id: params.routeId || null,
      stop_id: params.stopId || null,
      order_id: params.orderId || null,
      driver_id: params.driverId || null,
      actor_user_id: params.actorUserId || null,
      actor_name: params.actorName || null,
      event_type: params.eventType,
      previous_status: params.previousStatus || null,
      new_status: params.newStatus || null,
      metadata: params.metadata || null,
      created_at: now,
    };

    await this.queryTable('delivery_events', (b) => b.insert(record));

    return {
      id: record.id,
      tenantId: record.tenant_id,
      routeId: record.route_id,
      stopId: record.stop_id,
      orderId: record.order_id,
      driverId: record.driver_id,
      actorUserId: record.actor_user_id,
      actorName: record.actor_name,
      eventType: record.event_type,
      previousStatus: record.previous_status,
      newStatus: record.new_status,
      metadata: record.metadata,
      createdAt: record.created_at,
    };
  }

  public async listEvents(
    tenantId: string,
    filters?: { routeId?: string; orderId?: string; limit?: number }
  ): Promise<DeliveryEvent[]> {
    const { data } = await this.queryTable<any[]>('delivery_events', (b) => {
      let q = b.select('*').eq('tenant_id', tenantId);
      if (filters?.routeId) q = q.eq('route_id', filters.routeId);
      if (filters?.orderId) q = q.eq('order_id', filters.orderId);
      return q.order('created_at', { ascending: false }).limit(filters?.limit || 100);
    });

    return (data || []).map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      routeId: r.route_id,
      stopId: r.stop_id,
      orderId: r.order_id,
      driverId: r.driver_id,
      actorUserId: r.actor_user_id,
      actorName: r.actor_name,
      eventType: r.event_type,
      previousStatus: r.previous_status,
      newStatus: r.new_status,
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
  }

  // ==========================================
  // 1. ETAPA B — DRIVERS (MOTOBOYS) & INDIVIDUAL AUTH
  // ==========================================
  private mapDriver(
    row: any,
    activeRoute?: { id: string; route_code: string } | null,
    completedCount = 0
  ): DeliveryDriver {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id || null,
      name: row.name,
      phone: row.phone,
      email: row.email,
      photoUrl: row.photo_url || null,
      vehicleInfo: row.vehicle_info || null,
      plate: row.plate || null,
      isActive: row.is_active !== false,
      availabilityStatus: (row.availability_status || 'available') as DriverAvailabilityStatus,
      shareLocation: Boolean(row.share_location),
      lastLatitude:
        row.last_latitude !== null && row.last_latitude !== undefined
          ? Number(row.last_latitude)
          : null,
      lastLongitude:
        row.last_longitude !== null && row.last_longitude !== undefined
          ? Number(row.last_longitude)
          : null,
      lastLocationAt: row.last_location_at || null,
      activeRouteId: activeRoute?.id || null,
      activeRouteCode: activeRoute?.route_code || null,
      completedDeliveriesCount: completedCount,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public async listDrivers(tenantId: string): Promise<DeliveryDriver[]> {
    const [{ data: rawDrivers }, { data: rawRoutes }, { data: rawStops }] = await Promise.all([
      this.queryTable<any[]>('delivery_drivers', (b) =>
        b.select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
      ),
      this.queryTable<any[]>('delivery_routes', (b) =>
        b.select('*').eq('tenant_id', tenantId)
      ),
      this.queryTable<any[]>('delivery_route_stops', (b) =>
        b.select('route_id, status').eq('tenant_id', tenantId)
      ),
    ]);

    const activeRouteByDriver = new Map<string, { id: string; route_code: string }>();
    const routeDriverMap = new Map<string, string>();
    (rawRoutes || []).forEach((r: any) => {
      if (r.driver_id) {
        routeDriverMap.set(r.id, r.driver_id);
        if (['assigned', 'accepted', 'in_progress'].includes(r.status)) {
          activeRouteByDriver.set(r.driver_id, { id: r.id, route_code: r.route_code });
        }
      }
    });

    const completedCountByDriver = new Map<string, number>();
    (rawStops || []).forEach((s: any) => {
      if (s.status === 'delivered') {
        const dId = routeDriverMap.get(s.route_id);
        if (dId) {
          completedCountByDriver.set(dId, (completedCountByDriver.get(dId) || 0) + 1);
        }
      }
    });

    return (rawDrivers || []).map((d: any) =>
      this.mapDriver(
        d,
        activeRouteByDriver.get(d.id) || null,
        completedCountByDriver.get(d.id) || 0
      )
    );
  }

  public async getDriverById(tenantId: string, driverId: string): Promise<DeliveryDriver | null> {
    const drivers = await this.listDrivers(tenantId);
    return drivers.find((d) => d.id === driverId) || null;
  }

  public async getDriverByUserId(tenantId: string, userId: string, userEmail?: string): Promise<DeliveryDriver | null> {
    const drivers = await this.listDrivers(tenantId);
    const byUserId = drivers.find((d) => d.userId === userId);
    if (byUserId) return byUserId;
    if (userEmail) {
      const normalized = userEmail.toLowerCase().trim();
      return drivers.find((d) => d.email.toLowerCase().trim() === normalized) || null;
    }
    return null;
  }

  private async syncDriverAuthAccount(params: {
    tenantId: string;
    name: string;
    email: string;
    phone: string;
    password?: string;
    isActive: boolean;
    existingUserId?: string | null;
  }): Promise<string> {
    const cleanEmail = params.email.toLowerCase().trim();
    const status = params.isActive ? 'active' : 'inactive';
    let userId = params.existingUserId || null;

    const { data: listed } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = listed?.users?.find(
      (u: any) => u.email?.toLowerCase() === cleanEmail
    );

    if (existingAuthUser) {
      userId = existingAuthUser.id;
      const updateAttrs: any = {
        user_metadata: {
          ...(existingAuthUser.user_metadata || {}),
          name: params.name,
          phone: params.phone,
        },
      };
      if (params.password && params.password.trim().length >= 6) {
        updateAttrs.password = params.password.trim();
      }
      await supabaseAdmin.auth.admin.updateUserById(userId!, updateAttrs);
    } else if (userId) {
      const updateAttrs: any = {
        email: cleanEmail,
        user_metadata: {
          name: params.name,
          phone: params.phone,
        },
      };
      if (params.password && params.password.trim().length >= 6) {
        updateAttrs.password = params.password.trim();
      }
      await supabaseAdmin.auth.admin.updateUserById(userId, updateAttrs);
    } else {
      const pwd =
        params.password && params.password.trim().length >= 6
          ? params.password.trim()
          : crypto.randomBytes(8).toString('hex');

      const { data: createdAuth, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: pwd,
        email_confirm: true,
        user_metadata: {
          name: params.name,
          phone: params.phone,
          role: 'DELIVERY_DRIVER',
          tenant_id: params.tenantId,
        },
      });

      if (createdAuth?.user?.id) {
        userId = createdAuth.user.id;
      } else {
        // Fallback to localStore.auth_users if remote auth failed or rejected
        userId = crypto.randomUUID();
        localStore.auth_users.push({
          id: userId,
          email: cleanEmail,
          password: pwd,
          user_metadata: {
            name: params.name,
            phone: params.phone,
            role: 'DELIVERY_DRIVER',
            tenant_id: params.tenantId,
          },
          created_at: new Date().toISOString(),
        });
        localStore.persistToDisk();
        if (authErr) {
          console.warn('[DeliveryHubRepository] Remote auth user fallback used:', authErr.message);
        }
      }
    }

    // Ensure localStore.auth_users also has password for immediate login in hybrid/local mode
    if (params.password && params.password.trim().length >= 6 && userId) {
      const localAuth = localStore.auth_users.find(
        (u: any) => u.id === userId || u.email?.toLowerCase() === cleanEmail
      );
      if (localAuth) {
        localAuth.id = userId;
        localAuth.email = cleanEmail;
        localAuth.password = params.password.trim();
        localAuth.user_metadata = {
          ...(localAuth.user_metadata || {}),
          name: params.name,
          phone: params.phone,
          role: 'DELIVERY_DRIVER',
          tenant_id: params.tenantId,
        };
      } else {
        localStore.auth_users.push({
          id: userId,
          email: cleanEmail,
          password: params.password.trim(),
          user_metadata: {
            name: params.name,
            phone: params.phone,
            role: 'DELIVERY_DRIVER',
            tenant_id: params.tenantId,
          },
          created_at: new Date().toISOString(),
        });
      }
      localStore.persistToDisk();
    }

    // Upsert into tenant_users with role DELIVERY_DRIVER
    const now = new Date().toISOString();
    const { data: existingTu } = await supabaseAdmin
      .from('tenant_users')
      .select('*')
      .eq('tenant_id', params.tenantId)
      .eq('user_id', userId)
      .single();

    if (existingTu) {
      await supabaseAdmin
        .from('tenant_users')
        .update({ status, updated_at: now })
        .eq('id', existingTu.id);
    } else {
      const { error: tuErr } = await supabaseAdmin.from('tenant_users').insert({
        id: crypto.randomUUID(),
        tenant_id: params.tenantId,
        user_id: userId,
        role: 'DELIVERY_DRIVER',
        status,
        created_at: now,
        updated_at: now,
      });
      if (tuErr) {
        // If remote DB has an enum check on tenant_users.role that hasn't added DELIVERY_DRIVER yet, store in localStore.tenant_users as well
        const existingLocalTu = localStore.tenant_users.find(
          (tu: any) => tu.tenant_id === params.tenantId && tu.user_id === userId
        );
        if (!existingLocalTu) {
          localStore.tenant_users.push({
            id: crypto.randomUUID(),
            tenant_id: params.tenantId,
            user_id: userId,
            role: 'DELIVERY_DRIVER',
            status,
            created_at: now,
            updated_at: now,
          });
          localStore.persistToDisk();
        }
      }
    }

    return userId!;
  }

  public async createDriver(
    tenantId: string,
    payload: CreateDeliveryDriverPayload,
    actor: User
  ): Promise<DeliveryDriver> {
    const name = payload.name?.trim();
    const phone = (payload.phone || '').replace(/\D/g, '');
    const email = payload.email?.toLowerCase().trim();

    if (!name || name.length < 2) {
      throw new Error('Informe o nome completo do entregador.');
    }
    if (phone.length < 10 || phone.length > 13) {
      throw new Error('Informe um telefone/WhatsApp válido com DDD para o entregador.');
    }
    if (!email || !email.includes('@')) {
      throw new Error('Informe um e-mail válido para o login individual do entregador.');
    }
    if (payload.password !== undefined && payload.password.trim().length > 0 && payload.password.trim().length < 6) {
      throw new Error('A senha do entregador deve ter pelo menos 6 caracteres.');
    }

    const existingDrivers = await this.listDrivers(tenantId);
    if (existingDrivers.some((d) => d.email.toLowerCase() === email)) {
      throw new Error('Já existe um entregador cadastrado com este e-mail neste restaurante.');
    }

    const isActive = payload.isActive !== false;
    const userId = await this.syncDriverAuthAccount({
      tenantId,
      name,
      email,
      phone,
      password: payload.password,
      isActive,
    });

    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      user_id: userId,
      name,
      phone,
      email,
      photo_url: payload.photoUrl?.trim() || null,
      vehicle_info: payload.vehicleInfo?.trim() || null,
      plate: payload.plate?.trim().toUpperCase() || null,
      is_active: isActive,
      availability_status: isActive ? payload.availabilityStatus || 'available' : 'unavailable',
      share_location: false,
      last_latitude: null,
      last_longitude: null,
      last_location_at: null,
      created_at: now,
      updated_at: now,
    };

    const { error } = await this.queryTable('delivery_drivers', (b) => b.insert(row));
    if (error) {
      throw new Error(`Erro ao cadastrar entregador: ${error.message || 'Erro desconhecido'}`);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'CREATE' as any,
      entity: 'delivery_drivers',
      entityId: row.id,
      metadata: { name, email, phone, vehicleInfo: row.vehicle_info, plate: row.plate },
    });

    return this.mapDriver(row, null, 0);
  }

  public async updateDriver(
    tenantId: string,
    driverId: string,
    payload: UpdateDeliveryDriverPayload,
    actor: User
  ): Promise<DeliveryDriver> {
    const existing = await this.getDriverById(tenantId, driverId);
    if (!existing) {
      throw new Error('Entregador não encontrado neste restaurante.');
    }

    const name = payload.name !== undefined ? payload.name.trim() : existing.name;
    const phone =
      payload.phone !== undefined ? payload.phone.replace(/\D/g, '') : existing.phone;
    const email =
      payload.email !== undefined ? payload.email.toLowerCase().trim() : existing.email;
    const isActive = payload.isActive !== undefined ? Boolean(payload.isActive) : existing.isActive;

    if (!name || name.length < 2) {
      throw new Error('Informe o nome completo do entregador.');
    }
    if (phone.length < 10 || phone.length > 13) {
      throw new Error('Informe um telefone/WhatsApp válido com DDD.');
    }
    if (!email || !email.includes('@')) {
      throw new Error('Informe um e-mail válido.');
    }

    if (email !== existing.email.toLowerCase()) {
      const allDrivers = await this.listDrivers(tenantId);
      if (allDrivers.some((d) => d.id !== driverId && d.email.toLowerCase() === email)) {
        throw new Error('Já existe outro entregador cadastrado com este e-mail.');
      }
    }

    const userId = await this.syncDriverAuthAccount({
      tenantId,
      name,
      email,
      phone,
      password: payload.password,
      isActive,
      existingUserId: existing.userId,
    });

    const availabilityStatus: DriverAvailabilityStatus = !isActive
      ? 'unavailable'
      : payload.availabilityStatus || existing.availabilityStatus;

    const now = new Date().toISOString();
    const patch: Record<string, any> = {
      user_id: userId,
      name,
      phone,
      email,
      photo_url: payload.photoUrl !== undefined ? payload.photoUrl?.trim() || null : existing.photoUrl,
      vehicle_info:
        payload.vehicleInfo !== undefined ? payload.vehicleInfo?.trim() || null : existing.vehicleInfo,
      plate:
        payload.plate !== undefined ? payload.plate?.trim().toUpperCase() || null : existing.plate,
      is_active: isActive,
      availability_status: availabilityStatus,
      updated_at: now,
    };

    await this.queryTable('delivery_drivers', (b) =>
      b.update(patch).eq('id', driverId).eq('tenant_id', tenantId)
    );

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'UPDATE' as any,
      entity: 'delivery_drivers',
      entityId: driverId,
      diff: { before: existing, after: patch },
    });

    return (await this.getDriverById(tenantId, driverId))!;
  }

  public async deleteDriver(tenantId: string, driverId: string, actor: User): Promise<boolean> {
    const existing = await this.getDriverById(tenantId, driverId);
    if (!existing) {
      throw new Error('Entregador não encontrado neste restaurante.');
    }
    if (existing.activeRouteId) {
      throw new Error(
        `Não é possível excluir o entregador "${existing.name}" pois ele possui uma rota ativa (${existing.activeRouteCode}). Conclua ou reatribua a rota antes.`
      );
    }

    await this.queryTable('delivery_drivers', (b) =>
      b.delete().eq('id', driverId).eq('tenant_id', tenantId)
    );

    if (existing.userId) {
      await supabaseAdmin
        .from('tenant_users')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('user_id', existing.userId);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'DELETE' as any,
      entity: 'delivery_drivers',
      entityId: driverId,
      metadata: { name: existing.name, email: existing.email },
    });

    return true;
  }

  // ==========================================
  // 2. ETAPA A & C — DISPATCH ORDERS, CLUSTERS & ROUTE OPTIMIZATION
  // ==========================================
  public async listRoutes(
    tenantId: string,
    filters?: { driverId?: string; status?: DeliveryRouteStatus | 'active' | 'all' }
  ): Promise<DeliveryRoute[]> {
    const [{ data: rawRoutes }, { data: rawStops }, { data: rawDrivers }, { data: rawNotifs }] =
      await Promise.all([
        this.queryTable<any[]>('delivery_routes', (b) =>
          b.select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
        ),
        this.queryTable<any[]>('delivery_route_stops', (b) =>
          b.select('*').eq('tenant_id', tenantId).order('stop_sequence', { ascending: true })
        ),
        this.queryTable<any[]>('delivery_drivers', (b) =>
          b.select('*').eq('tenant_id', tenantId)
        ),
        this.queryTable<any[]>('delivery_notifications', (b) =>
          b.select('*').eq('tenant_id', tenantId)
        ),
      ]);

    const driverMap = new Map<string, any>();
    (rawDrivers || []).forEach((d: any) => driverMap.set(d.id, d));

    const notifByOrder = new Map<string, any>();
    (rawNotifs || []).forEach((n: any) => {
      if (n.event_type === 'out_for_delivery') {
        notifByOrder.set(n.order_id, n);
      }
    });

    const stopsByRoute = new Map<string, DeliveryRouteStop[]>();
    (rawStops || []).forEach((s: any) => {
      const notif = notifByOrder.get(s.order_id);
      const mappedStop: DeliveryRouteStop = {
        id: s.id,
        tenantId: s.tenant_id,
        routeId: s.route_id,
        orderId: s.order_id,
        orderNumber: Number(s.order_number),
        formattedOrderNumber: `#${s.order_number}`,
        stopSequence: Number(s.stop_sequence),
        status: s.status as DeliveryStopStatus,
        customerName: s.customer_name,
        customerPhone: s.customer_phone,
        addressSummary: s.address_summary,
        street: s.street,
        number: s.number,
        complement: s.complement || null,
        neighborhood: s.neighborhood,
        city: s.city,
        state: s.state,
        cep: s.cep,
        reference: s.reference || null,
        notes: s.notes || null,
        orderTotal: Number(s.order_total || 0),
        paymentMethod: s.payment_method,
        changeFor: s.change_for !== null && s.change_for !== undefined ? Number(s.change_for) : null,
        latitude: s.latitude !== null && s.latitude !== undefined ? Number(s.latitude) : null,
        longitude: s.longitude !== null && s.longitude !== undefined ? Number(s.longitude) : null,
        distanceFromPrevKm:
          s.distance_from_prev_km !== null && s.distance_from_prev_km !== undefined
            ? Number(s.distance_from_prev_km)
            : null,
        durationFromPrevMin:
          s.duration_from_prev_min !== null && s.duration_from_prev_min !== undefined
            ? Number(s.duration_from_prev_min)
            : null,
        cumulativeEtaMin:
          s.cumulative_eta_min !== null && s.cumulative_eta_min !== undefined
            ? Number(s.cumulative_eta_min)
            : null,
        trackingToken: s.tracking_token,
        trackingUrl: `/rastreio/${s.tracking_token}`,
        startedAt: s.started_at || null,
        deliveredAt: s.delivered_at || null,
        failedAt: s.failed_at || null,
        failureReason: s.failure_reason || null,
        failureNotes: s.failure_notes || null,
        whatsappNotificationStatus: notif?.status || null,
        whatsappNotificationUrl: notif?.whatsapp_web_url || null,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      };
      const list = stopsByRoute.get(s.route_id) || [];
      list.push(mappedStop);
      stopsByRoute.set(s.route_id, list);
    });

    let routes: DeliveryRoute[] = (rawRoutes || []).map((r: any) => {
      const stops = (stopsByRoute.get(r.id) || []).sort((a, b) => a.stopSequence - b.stopSequence);
      const driver = r.driver_id ? driverMap.get(r.driver_id) : null;
      const completedStops = stops.filter((st) => st.status === 'delivered').length;
      const failedStops = stops.filter((st) => st.status === 'failed_attempt').length;
      return {
        id: r.id,
        tenantId: r.tenant_id,
        routeCode: r.route_code,
        name: r.name || null,
        driverId: r.driver_id || null,
        driverName: driver?.name || null,
        driverPhone: driver?.phone || null,
        status: r.status as DeliveryRouteStatus,
        totalStops: stops.length,
        completedStops,
        failedStops,
        totalDistanceKm: Number(r.total_distance_km || 0),
        estimatedDurationMin: Number(r.estimated_duration_min || 0),
        originAddress: r.origin_address || null,
        qrToken: r.qr_token,
        qrClaimUrl: `/?routeQr=${encodeURIComponent(r.qr_token)}`,
        qrExpiresAt: r.qr_expires_at,
        qrRevokedAt: r.qr_revoked_at || null,
        assignedAt: r.assigned_at || null,
        acceptedAt: r.accepted_at || null,
        startedAt: r.started_at || null,
        completedAt: r.completed_at || null,
        cancelledAt: r.cancelled_at || null,
        createdByUserId: r.created_by_user_id || null,
        stops,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    if (filters?.driverId) {
      routes = routes.filter((r) => r.driverId === filters.driverId);
    }
    if (filters?.status && filters.status !== 'all') {
      if (filters.status === 'active') {
        routes = routes.filter((r) =>
          ['created', 'assigned', 'accepted', 'in_progress'].includes(r.status)
        );
      } else {
        routes = routes.filter((r) => r.status === filters.status);
      }
    }

    return routes;
  }

  public async getRouteById(tenantId: string, routeId: string): Promise<DeliveryRoute | null> {
    const routes = await this.listRoutes(tenantId);
    return routes.find((r) => r.id === routeId) || null;
  }

  public async getDeliveryHubOverview(
    tenantId: string,
    filters?: DeliveryHubFilters
  ): Promise<DeliveryHubOverview> {
    const [originAddress, { orders: allOrders }, routes, drivers] = await Promise.all([
      orderRepo.resolveTenantOriginAddress(tenantId),
      orderRepo.listOrders(tenantId, { fulfillmentType: 'delivery', limit: 300 }),
      this.listRoutes(tenantId),
      this.listDrivers(tenantId),
    ]);

    // Map each order to its latest stop / active route
    const activeStopByOrderId = new Map<
      string,
      { route: DeliveryRoute; stop: DeliveryRouteStop }
    >();
    const latestStopByOrderId = new Map<
      string,
      { route: DeliveryRoute; stop: DeliveryRouteStop }
    >();

    // Routes are sorted newest first
    for (const route of routes) {
      for (const stop of route.stops) {
        if (!latestStopByOrderId.has(stop.orderId)) {
          latestStopByOrderId.set(stop.orderId, { route, stop });
        }
        if (
          route.status !== 'cancelled' &&
          route.status !== 'completed' &&
          stop.status !== 'cancelled'
        ) {
          activeStopByOrderId.set(stop.orderId, { route, stop });
        }
      }
    }

    const nowMs = Date.now();
    const neighborhoodsSet = new Set<string>();

    const dispatchOrders: DispatchOrderItem[] = allOrders
      .filter((o) => o.fulfillmentType === 'delivery' && o.status !== 'CANCELLED')
      .map((o) => {
        const addr = o.deliveryAddress;
        const neighborhood = addr?.neighborhood?.trim() || 'Sem bairro';
        neighborhoodsSet.add(neighborhood);

        const hasCoords = hasValidCoordinates(addr?.latitude, addr?.longitude);
        const latitude = hasCoords ? Number(addr!.latitude) : null;
        const longitude = hasCoords ? Number(addr!.longitude) : null;
        const geocodeStatus: GeocodeStatus = hasCoords
          ? addr?.geocodeStatus || 'geocoded'
          : 'pending';

        const activeLink = activeStopByOrderId.get(o.id);
        const latestLink = latestStopByOrderId.get(o.id);
        const refLink = activeLink || latestLink;

        let dispatchStatus: OrderDispatchStatus = 'waiting_dispatch';
        if (o.status === 'COMPLETED' || refLink?.stop.status === 'delivered') {
          dispatchStatus = 'delivered';
        } else if (refLink?.stop.status === 'failed_attempt') {
          dispatchStatus = 'delivery_issue';
        } else if (
          o.status === 'OUT_FOR_DELIVERY' ||
          activeLink?.stop.status === 'out_for_delivery' ||
          activeLink?.route.status === 'in_progress'
        ) {
          dispatchStatus = 'in_route';
        } else if (activeLink) {
          dispatchStatus = 'assigned';
        }

        const addressSummary = addr
          ? formatAddressSummary({
              street: addr.street,
              number: addr.number,
              complement: addr.complement,
              neighborhood: addr.neighborhood,
              city: addr.city,
              state: addr.state,
              cep: addr.cep,
            })
          : 'Endereço não informado';

        const waitingMinutes = Math.max(
          0,
          Math.round((nowMs - new Date(o.createdAt).getTime()) / 60000)
        );

        return {
          ...o,
          dispatchStatus,
          geocodeStatus,
          latitude,
          longitude,
          neighborhood,
          addressSummary,
          waitingMinutes,
          assignedDriverId: refLink?.route.driverId || null,
          assignedDriverName: refLink?.route.driverName || null,
          activeRouteId: activeLink?.route.id || refLink?.route.id || null,
          activeRouteCode: activeLink?.route.routeCode || refLink?.route.routeCode || null,
          activeStopId: activeLink?.stop.id || refLink?.stop.id || null,
          activeStopSequence: activeLink?.stop.stopSequence || refLink?.stop.stopSequence || null,
          activeStopStatus: activeLink?.stop.status || refLink?.stop.status || null,
          trackingToken: refLink?.stop.trackingToken || null,
          failureReason: refLink?.stop.failureReason || null,
          failureNotes: refLink?.stop.failureNotes || null,
        };
      });

    // Compute global stats before applying UI filter
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const waitingDispatchCount = dispatchOrders.filter(
      (o) => o.dispatchStatus === 'waiting_dispatch'
    ).length;
    const readyForDispatchCount = dispatchOrders.filter(
      (o) =>
        o.dispatchStatus === 'waiting_dispatch' &&
        ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'].includes(o.status)
    ).length;
    const assignedCount = dispatchOrders.filter((o) => o.dispatchStatus === 'assigned').length;
    const inRouteCount = dispatchOrders.filter((o) => o.dispatchStatus === 'in_route').length;
    const deliveredTodayCount = dispatchOrders.filter(
      (o) =>
        o.dispatchStatus === 'delivered' &&
        (o.updatedAt?.slice(0, 10) === todayPrefix || o.createdAt?.slice(0, 10) === todayPrefix)
    ).length;
    const issuesCount = dispatchOrders.filter((o) => o.dispatchStatus === 'delivery_issue').length;
    const pendingGeocodeCount = dispatchOrders.filter(
      (o) => o.dispatchStatus !== 'delivered' && o.geocodeStatus === 'pending'
    ).length;

    const availableDriversCount = drivers.filter(
      (d) => d.isActive && d.availabilityStatus === 'available'
    ).length;
    const driversInRouteCount = drivers.filter(
      (d) => d.isActive && d.availabilityStatus === 'in_route'
    ).length;
    const activeRoutesCount = routes.filter((r) =>
      ['created', 'assigned', 'accepted', 'in_progress'].includes(r.status)
    ).length;

    // Suggest geographic clusters for orders awaiting dispatch
    const clusterSuggestions = this.computeClusterSuggestions(
      dispatchOrders.filter((o) => o.dispatchStatus === 'waiting_dispatch'),
      originAddress
    );

    // Apply UI filters
    let filteredOrders = dispatchOrders;
    if (filters?.dispatchFilter && filters.dispatchFilter !== 'all') {
      if (filters.dispatchFilter === 'ready_only') {
        filteredOrders = filteredOrders.filter(
          (o) =>
            o.dispatchStatus === 'waiting_dispatch' &&
            ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'].includes(o.status)
        );
      } else {
        filteredOrders = filteredOrders.filter(
          (o) => o.dispatchStatus === filters.dispatchFilter
        );
      }
    }
    if (filters?.neighborhood && filters.neighborhood !== 'all') {
      const targetN = filters.neighborhood.toLowerCase().trim();
      filteredOrders = filteredOrders.filter(
        (o) => o.neighborhood.toLowerCase().trim() === targetN
      );
    }
    if (filters?.driverId && filters.driverId !== 'all') {
      filteredOrders = filteredOrders.filter((o) => o.assignedDriverId === filters.driverId);
    }
    if (filters?.search && filters.search.trim().length > 0) {
      const q = filters.search.toLowerCase().trim();
      filteredOrders = filteredOrders.filter(
        (o) =>
          o.formattedOrderNumber.toLowerCase().includes(q) ||
          String(o.orderNumber).includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.neighborhood.toLowerCase().includes(q) ||
          o.addressSummary.toLowerCase().includes(q)
      );
    }

    return {
      originAddress,
      orders: filteredOrders,
      routes,
      drivers,
      clusterSuggestions,
      neighborhoods: Array.from(neighborhoodsSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      stats: {
        waitingDispatchCount,
        readyForDispatchCount,
        assignedCount,
        inRouteCount,
        deliveredTodayCount,
        issuesCount,
        pendingGeocodeCount,
        availableDriversCount,
        driversInRouteCount,
        activeRoutesCount,
      },
    };
  }

  /**
   * Smart geographic grouping (Etapa 3)
   * Groups waiting_dispatch orders that are within MAX_CLUSTER_RADIUS_KM (3.0 km)
   * or share the same neighborhood without violating waiting-time SLA.
   */
  public computeClusterSuggestions(
    waitingOrders: DispatchOrderItem[],
    originAddress: any
  ): RouteClusterSuggestion[] {
    if (waitingOrders.length < 2) return [];

    const MAX_CLUSTER_RADIUS_KM = 3.0;
    const MAX_ORDERS_PER_CLUSTER = 5;
    const visited = new Set<string>();
    const suggestions: RouteClusterSuggestion[] = [];

    // Sort by waiting time descending so older orders get prioritized first
    const sorted = [...waitingOrders].sort((a, b) => b.waitingMinutes - a.waitingMinutes);

    for (const seed of sorted) {
      if (visited.has(seed.id)) continue;

      const cluster: DispatchOrderItem[] = [seed];
      visited.add(seed.id);

      for (const candidate of sorted) {
        if (visited.has(candidate.id)) continue;
        if (cluster.length >= MAX_ORDERS_PER_CLUSTER) break;

        let isClose = false;
        if (
          hasValidCoordinates(seed.latitude, seed.longitude) &&
          hasValidCoordinates(candidate.latitude, candidate.longitude)
        ) {
          const dist = calculateHaversineDistanceKm(
            seed.latitude!,
            seed.longitude!,
            candidate.latitude!,
            candidate.longitude!
          );
          if (dist <= MAX_CLUSTER_RADIUS_KM) {
            isClose = true;
          }
        } else if (
          seed.neighborhood &&
          candidate.neighborhood &&
          seed.neighborhood.toLowerCase().trim() === candidate.neighborhood.toLowerCase().trim()
        ) {
          isClose = true;
        }

        if (isClose) {
          cluster.push(candidate);
          visited.add(candidate.id);
        }
      }

      if (cluster.length >= 2) {
        const optimized = this.optimizeStopOrderSync(cluster, originAddress);
        const neighborhoods = Array.from(new Set(cluster.map((c) => c.neighborhood)));
        let maxSpreadKm = 0;
        for (let i = 0; i < cluster.length; i++) {
          for (let j = i + 1; j < cluster.length; j++) {
            if (
              hasValidCoordinates(cluster[i].latitude, cluster[i].longitude) &&
              hasValidCoordinates(cluster[j].latitude, cluster[j].longitude)
            ) {
              const d = calculateHaversineDistanceKm(
                cluster[i].latitude!,
                cluster[i].longitude!,
                cluster[j].latitude!,
                cluster[j].longitude!
              );
              if (d > maxSpreadKm) maxSpreadKm = d;
            }
          }
        }

        const oldestOrderMinutes = Math.max(...cluster.map((c) => c.waitingMinutes));
        suggestions.push({
          id: `cluster-${seed.id.slice(0, 8)}`,
          label:
            neighborhoods.length === 1
              ? `Rota ${neighborhoods[0]} (${cluster.length} entregas)`
              : `Rota ${neighborhoods.slice(0, 2).join(' + ')} (${cluster.length} entregas)`,
          neighborhoods,
          orderIds: optimized.orderedStops.map((s) => s.orderId),
          orderNumbers: optimized.orderedStops.map((s) => s.formattedOrderNumber),
          estimatedTotalDistanceKm: optimized.totalDistanceKm,
          estimatedDurationMin: optimized.estimatedDurationMin,
          maxSpreadKm: Math.round(maxSpreadKm * 100) / 100,
          oldestOrderMinutes,
          reason:
            maxSpreadKm > 0
              ? `Pedidos próximos em raio de ${maxSpreadKm.toFixed(1).replace('.', ',')} km`
              : `Pedidos concentrados na região ${neighborhoods.join(', ')}`,
        });
      }
    }

    return suggestions;
  }

  /**
   * Nearest-Neighbor TSP optimization starting from restaurant originAddress
   */
  public optimizeStopOrderSync(
    orders: Array<{
      id: string;
      orderNumber: number;
      formattedOrderNumber: string;
      customerName: string;
      neighborhood: string;
      addressSummary: string;
      latitude: number | null;
      longitude: number | null;
      geocodeStatus: GeocodeStatus;
    }>,
    originAddress: { latitude?: number | null; longitude?: number | null } | null,
    preserveGivenOrder = false
  ): RoutePreviewResult {
    const hasOrigin = hasValidCoordinates(originAddress?.latitude, originAddress?.longitude);
    let currentLat = hasOrigin ? Number(originAddress!.latitude) : null;
    let currentLng = hasOrigin ? Number(originAddress!.longitude) : null;

    const remaining = [...orders];
    const ordered: typeof orders = [];

    if (preserveGivenOrder || remaining.length <= 1) {
      ordered.push(...remaining);
    } else {
      while (remaining.length > 0) {
        if (currentLat !== null && currentLng !== null) {
          let bestIdx = 0;
          let bestDist = Infinity;
          for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i];
            if (hasValidCoordinates(candidate.latitude, candidate.longitude)) {
              const dist = calculateHaversineDistanceKm(
                currentLat,
                currentLng,
                candidate.latitude!,
                candidate.longitude!
              );
              if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
              }
            }
          }
          const [picked] = remaining.splice(bestIdx, 1);
          ordered.push(picked);
          if (hasValidCoordinates(picked.latitude, picked.longitude)) {
            currentLat = picked.latitude!;
            currentLng = picked.longitude!;
          }
        } else {
          // Group by neighborhood when origin has no coordinates yet
          const [picked] = remaining.splice(0, 1);
          ordered.push(picked);
          if (hasValidCoordinates(picked.latitude, picked.longitude)) {
            currentLat = picked.latitude!;
            currentLng = picked.longitude!;
          }
        }
      }
    }

    let prevLat = hasOrigin ? Number(originAddress!.latitude) : null;
    let prevLng = hasOrigin ? Number(originAddress!.longitude) : null;
    let totalDistanceKm = 0;
    let cumulativeEtaMin = 0;

    const orderedStops = ordered.map((o, idx) => {
      let stepDistKm = 1.5; // Conservative fallback when coordinates are pending
      if (
        prevLat !== null &&
        prevLng !== null &&
        hasValidCoordinates(o.latitude, o.longitude)
      ) {
        // Road factor ~1.28x over straight-line Haversine
        const straight = calculateHaversineDistanceKm(prevLat, prevLng, o.latitude!, o.longitude!);
        stepDistKm = Math.max(0.2, Math.round(straight * 1.28 * 100) / 100);
      }
      if (hasValidCoordinates(o.latitude, o.longitude)) {
        prevLat = o.latitude!;
        prevLng = o.longitude!;
      }

      // Average urban delivery speed ~25 km/h (2.4 min/km) + 3 min handoff per stop
      const stepDurationMin = Math.max(4, Math.ceil(stepDistKm * 2.4 + 3));
      totalDistanceKm = Math.round((totalDistanceKm + stepDistKm) * 100) / 100;
      cumulativeEtaMin += stepDurationMin;

      return {
        orderId: o.id,
        orderNumber: o.orderNumber,
        formattedOrderNumber: o.formattedOrderNumber,
        customerName: o.customerName,
        neighborhood: o.neighborhood,
        addressSummary: o.addressSummary,
        latitude: o.latitude,
        longitude: o.longitude,
        geocodeStatus: o.geocodeStatus,
        stopSequence: idx + 1,
        distanceFromPrevKm: stepDistKm,
        durationFromPrevMin: stepDurationMin,
        cumulativeEtaMin,
      };
    });

    return {
      originAddress: (originAddress as any) || null,
      orderedStops,
      totalDistanceKm,
      estimatedDurationMin: cumulativeEtaMin,
    };
  }

  public async previewRoute(
    tenantId: string,
    orderIds: string[],
    optimizeOrder = true
  ): Promise<RoutePreviewResult> {
    if (!orderIds || orderIds.length === 0) {
      throw new Error('Selecione pelo menos um pedido para calcular a rota.');
    }

    const overview = await this.getDeliveryHubOverview(tenantId);
    const orderMap = new Map(overview.orders.map((o) => [o.id, o]));
    const selected = orderIds
      .map((id) => orderMap.get(id))
      .filter((o): o is DispatchOrderItem => Boolean(o));

    if (selected.length === 0) {
      throw new Error('Nenhum pedido válido selecionado para este restaurante.');
    }

    return this.optimizeStopOrderSync(selected, overview.originAddress, !optimizeOrder);
  }

  public async retryOrderGeocode(
    tenantId: string,
    orderId: string,
    actor: User
  ): Promise<{ order: Order; geocoded: boolean }> {
    const existing = await orderRepo.getOrderById(tenantId, orderId);
    if (!existing || !existing.deliveryAddress) {
      throw new Error('Pedido ou endereço de entrega não encontrado.');
    }

    const addr = existing.deliveryAddress;
    const coords = await geocodeAddressServer({
      cep: addr.cep,
      street: addr.street,
      number: addr.number,
      neighborhood: addr.neighborhood,
      city: addr.city,
      state: addr.state,
    });

    if (coords && hasValidCoordinates(coords.latitude, coords.longitude)) {
      const updated = await orderRepo.updateOrderCoordinates(
        tenantId,
        orderId,
        {
          latitude: Number(coords.latitude),
          longitude: Number(coords.longitude),
          geocodeStatus: 'geocoded',
        },
        actor
      );
      return { order: updated, geocoded: true };
    }

    // Never invent coordinates if geocoding fails
    const updated = await orderRepo.updateOrderCoordinates(
      tenantId,
      orderId,
      {
        latitude: null,
        longitude: null,
        geocodeStatus: 'pending',
      },
      actor
    );
    return { order: updated, geocoded: false };
  }

  public async updateOrderManualLocation(
    tenantId: string,
    orderId: string,
    payload: {
      latitude: number;
      longitude: number;
      street?: string;
      number?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
      cep?: string;
    },
    actor: User
  ): Promise<Order> {
    if (!hasValidCoordinates(payload.latitude, payload.longitude)) {
      throw new Error('Informe coordenadas válidas de latitude e longitude.');
    }

    return orderRepo.updateOrderCoordinates(
      tenantId,
      orderId,
      {
        latitude: Number(payload.latitude),
        longitude: Number(payload.longitude),
        geocodeStatus: 'manual',
        street: payload.street,
        number: payload.number,
        neighborhood: payload.neighborhood,
        city: payload.city,
        state: payload.state,
        cep: payload.cep,
      },
      actor
    );
  }

  // ==========================================
  // 3. ETAPA C — CREATE ROUTE, REORDER, REMOVE STOP, ASSIGN DRIVER & QR CODE
  // ==========================================
  public async createRoute(
    tenantId: string,
    payload: CreateDeliveryRoutePayload,
    actor: User
  ): Promise<DeliveryRoute> {
    const uniqueOrderIds = Array.from(new Set(payload.orderIds || []));
    if (uniqueOrderIds.length === 0) {
      throw new Error('Selecione pelo menos um pedido de entrega para criar uma rota.');
    }

    const [originAddress, existingRoutes, drivers] = await Promise.all([
      orderRepo.resolveTenantOriginAddress(tenantId),
      this.listRoutes(tenantId, { status: 'active' }),
      this.listDrivers(tenantId),
    ]);

    // Check active routes to prevent double-booking an order
    const activeOrderRouteMap = new Map<string, string>();
    for (const r of existingRoutes) {
      for (const st of r.stops) {
        if (st.status !== 'cancelled' && st.status !== 'failed_attempt') {
          activeOrderRouteMap.set(st.orderId, r.routeCode);
        }
      }
    }

    const validatedOrders: Array<{
      order: Order;
      neighborhood: string;
      addressSummary: string;
      latitude: number | null;
      longitude: number | null;
      geocodeStatus: GeocodeStatus;
    }> = [];

    for (const orderId of uniqueOrderIds) {
      const order = await orderRepo.getOrderById(tenantId, orderId);
      if (!order) {
        throw new Error(
          `Pedido ${orderId.slice(0, 8)} não encontrado ou pertence a outro restaurante.`
        );
      }
      if (order.tenantId !== tenantId) {
        throw new Error('Violação de isolamento multi-tenant: pedido pertence a outra empresa.');
      }
      if (order.fulfillmentType !== 'delivery' || !order.deliveryAddress) {
        throw new Error(
          `O pedido ${order.formattedOrderNumber} é para retirada no balcão e não pode entrar em rota de entrega.`
        );
      }
      if (order.status === 'CANCELLED') {
        throw new Error(
          `O pedido ${order.formattedOrderNumber} está cancelado e não pode ser incluído em uma rota.`
        );
      }
      if (order.status === 'COMPLETED') {
        throw new Error(
          `O pedido ${order.formattedOrderNumber} já foi entregue e não pode ser incluído em uma nova rota.`
        );
      }
      const existingRouteCode = activeOrderRouteMap.get(order.id);
      if (existingRouteCode) {
        throw new Error(
          `O pedido ${order.formattedOrderNumber} já está vinculado à rota ativa ${existingRouteCode}.`
        );
      }

      const addr = order.deliveryAddress;
      const hasCoords = hasValidCoordinates(addr.latitude, addr.longitude);
      validatedOrders.push({
        order,
        neighborhood: addr.neighborhood || 'Sem bairro',
        addressSummary: formatAddressSummary({
          street: addr.street,
          number: addr.number,
          complement: addr.complement,
          neighborhood: addr.neighborhood,
          city: addr.city,
          state: addr.state,
          cep: addr.cep,
        }),
        latitude: hasCoords ? Number(addr.latitude) : null,
        longitude: hasCoords ? Number(addr.longitude) : null,
        geocodeStatus: hasCoords ? addr.geocodeStatus || 'geocoded' : 'pending',
      });
    }

    let selectedDriver: DeliveryDriver | null = null;
    if (payload.driverId) {
      selectedDriver = drivers.find((d) => d.id === payload.driverId) || null;
      if (!selectedDriver) {
        throw new Error('O entregador selecionado não pertence a este restaurante.');
      }
      if (!selectedDriver.isActive) {
        throw new Error(`O entregador "${selectedDriver.name}" está inativo.`);
      }
    }

    const optimizeOrder = payload.optimizeOrder !== false;
    const preview = this.optimizeStopOrderSync(
      validatedOrders.map((vo) => ({
        id: vo.order.id,
        orderNumber: vo.order.orderNumber,
        formattedOrderNumber: vo.order.formattedOrderNumber,
        customerName: vo.order.customerName,
        neighborhood: vo.neighborhood,
        addressSummary: vo.addressSummary,
        latitude: vo.latitude,
        longitude: vo.longitude,
        geocodeStatus: vo.geocodeStatus,
      })),
      originAddress,
      !optimizeOrder
    );

    // Refine first leg distance using calculateRouteDistanceServer if coordinates are present
    let totalDistanceKm = preview.totalDistanceKm;
    let estimatedDurationMin = preview.estimatedDurationMin;
    if (
      originAddress &&
      hasValidCoordinates(originAddress.latitude, originAddress.longitude) &&
      preview.orderedStops.length > 0 &&
      hasValidCoordinates(preview.orderedStops[0].latitude, preview.orderedStops[0].longitude)
    ) {
      try {
        const firstLeg = await calculateRouteDistanceServer(
          { latitude: originAddress.latitude!, longitude: originAddress.longitude! },
          {
            latitude: preview.orderedStops[0].latitude!,
            longitude: preview.orderedStops[0].longitude!,
          },
          'road_route'
        );
        if (firstLeg && typeof firstLeg.distanceKm === 'number' && firstLeg.distanceKm > 0) {
          const diff = firstLeg.distanceKm - preview.orderedStops[0].distanceFromPrevKm;
          preview.orderedStops[0].distanceFromPrevKm =
            Math.round(firstLeg.distanceKm * 100) / 100;
          totalDistanceKm = Math.max(0.2, Math.round((totalDistanceKm + diff) * 100) / 100);
        }
      } catch {
        // Keep calculated preview distance
      }
    }

    const allTenantRoutes = await this.listRoutes(tenantId);
    const nextNum = allTenantRoutes.length + 101;
    const routeCode = `RT-${nextNum}`;
    const routeId = crypto.randomUUID();
    const now = new Date().toISOString();
    // QR Token expires in 12 hours and contains zero PII
    const qrToken = `rtqr_${crypto.randomBytes(24).toString('hex')}`;
    const qrExpiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const initialStatus: DeliveryRouteStatus = selectedDriver ? 'assigned' : 'created';

    const routeRow = {
      id: routeId,
      tenant_id: tenantId,
      route_code: routeCode,
      name:
        payload.name?.trim() ||
        `Rota ${routeCode} (${preview.orderedStops.length} ${
          preview.orderedStops.length === 1 ? 'parada' : 'paradas'
        })`,
      driver_id: selectedDriver ? selectedDriver.id : null,
      status: initialStatus,
      total_stops: preview.orderedStops.length,
      completed_stops: 0,
      failed_stops: 0,
      total_distance_km: totalDistanceKm,
      estimated_duration_min: estimatedDurationMin,
      origin_address: originAddress || null,
      qr_token: qrToken,
      qr_expires_at: qrExpiresAt,
      qr_revoked_at: null,
      assigned_at: selectedDriver ? now : null,
      accepted_at: null,
      started_at: null,
      completed_at: null,
      cancelled_at: null,
      created_by_user_id: actor.id,
      created_at: now,
      updated_at: now,
    };

    const { error: routeErr } = await this.queryTable('delivery_routes', (b) =>
      b.insert(routeRow)
    );
    if (routeErr) {
      throw new Error(`Erro ao criar rota de entrega: ${routeErr.message || 'Erro'}`);
    }

    const orderMapById = new Map(validatedOrders.map((vo) => [vo.order.id, vo]));

    for (const stopPreview of preview.orderedStops) {
      const vo = orderMapById.get(stopPreview.orderId)!;
      const addr = vo.order.deliveryAddress!;
      const trackingToken = `trk_${crypto.randomBytes(20).toString('hex')}`;

      const stopRow = {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        route_id: routeId,
        order_id: vo.order.id,
        order_number: vo.order.orderNumber,
        stop_sequence: stopPreview.stopSequence,
        status: 'waiting',
        customer_name: vo.order.customerName,
        customer_phone: vo.order.customerPhone,
        address_summary: vo.addressSummary,
        street: addr.street,
        number: addr.number,
        complement: addr.complement || null,
        neighborhood: addr.neighborhood,
        city: addr.city,
        state: addr.state,
        cep: addr.cep,
        reference: addr.reference || null,
        notes: vo.order.notes || null,
        order_total: vo.order.total,
        payment_method: vo.order.paymentMethod,
        change_for: vo.order.changeFor ?? null,
        latitude: vo.latitude,
        longitude: vo.longitude,
        distance_from_prev_km: stopPreview.distanceFromPrevKm,
        duration_from_prev_min: stopPreview.durationFromPrevMin,
        cumulative_eta_min: stopPreview.cumulativeEtaMin,
        tracking_token: trackingToken,
        started_at: null,
        delivered_at: null,
        failed_at: null,
        failure_reason: null,
        failure_notes: null,
        created_at: now,
        updated_at: now,
      };

      await this.queryTable('delivery_route_stops', (b) => b.insert(stopRow));
    }

    await this.logEvent({
      tenantId,
      routeId,
      driverId: selectedDriver?.id || null,
      actorUserId: actor.id,
      actorName: actor.name,
      eventType: 'ROUTE_CREATED',
      previousStatus: null,
      newStatus: initialStatus,
      metadata: {
        routeCode,
        totalStops: preview.orderedStops.length,
        orderIds: preview.orderedStops.map((s) => s.orderId),
        driverName: selectedDriver?.name || null,
      },
    });

    return (await this.getRouteById(tenantId, routeId))!;
  }

  public async reorderRouteStops(
    tenantId: string,
    routeId: string,
    orderedStopIds: string[],
    actor: User
  ): Promise<DeliveryRoute> {
    const route = await this.getRouteById(tenantId, routeId);
    if (!route) {
      throw new Error('Rota não encontrada.');
    }
    if (['completed', 'cancelled'].includes(route.status)) {
      throw new Error('Não é possível reordenar paradas de uma rota concluída ou cancelada.');
    }

    const stopMap = new Map(route.stops.map((s) => [s.id, s]));
    if (orderedStopIds.length !== route.stops.length || !orderedStopIds.every((id) => stopMap.has(id))) {
      throw new Error('A lista de paradas informada não corresponde às paradas da rota.');
    }

    const reordered = orderedStopIds.map((id) => stopMap.get(id)!);
    const preview = this.optimizeStopOrderSync(
      reordered.map((s) => ({
        id: s.orderId,
        orderNumber: s.orderNumber,
        formattedOrderNumber: s.formattedOrderNumber,
        customerName: s.customerName,
        neighborhood: s.neighborhood,
        addressSummary: s.addressSummary,
        latitude: s.latitude ?? null,
        longitude: s.longitude ?? null,
        geocodeStatus: hasValidCoordinates(s.latitude, s.longitude) ? 'geocoded' : 'pending',
      })),
      route.originAddress || null,
      true // preserve manual order
    );

    const now = new Date().toISOString();
    for (let i = 0; i < reordered.length; i++) {
      const stop = reordered[i];
      const calc = preview.orderedStops[i];
      await this.queryTable('delivery_route_stops', (b) =>
        b
          .update({
            stop_sequence: i + 1,
            distance_from_prev_km: calc.distanceFromPrevKm,
            duration_from_prev_min: calc.durationFromPrevMin,
            cumulative_eta_min: calc.cumulativeEtaMin,
            updated_at: now,
          })
          .eq('id', stop.id)
          .eq('tenant_id', tenantId)
      );
    }

    await this.queryTable('delivery_routes', (b) =>
      b
        .update({
          total_distance_km: preview.totalDistanceKm,
          estimated_duration_min: preview.estimatedDurationMin,
          updated_at: now,
        })
        .eq('id', routeId)
        .eq('tenant_id', tenantId)
    );

    await this.logEvent({
      tenantId,
      routeId,
      actorUserId: actor.id,
      actorName: actor.name,
      eventType: 'ROUTE_REORDERED',
      previousStatus: route.status,
      newStatus: route.status,
      metadata: { orderedStopIds },
    });

    return (await this.getRouteById(tenantId, routeId))!;
  }

  public async removeStopFromRoute(
    tenantId: string,
    routeId: string,
    stopId: string,
    actor: User
  ): Promise<DeliveryRoute> {
    const route = await this.getRouteById(tenantId, routeId);
    if (!route) {
      throw new Error('Rota não encontrada.');
    }
    if (['in_progress', 'completed', 'cancelled'].includes(route.status)) {
      throw new Error('Não é possível remover pedidos de uma rota que já foi iniciada ou concluída.');
    }
    if (route.stops.length <= 1) {
      throw new Error('A rota possui apenas 1 parada. Cancele a rota se desejar desfazer o despacho.');
    }

    const stopToRemove = route.stops.find((s) => s.id === stopId);
    if (!stopToRemove) {
      throw new Error('Parada não encontrada nesta rota.');
    }

    await this.queryTable('delivery_route_stops', (b) =>
      b.delete().eq('id', stopId).eq('tenant_id', tenantId)
    );

    const remainingStopIds = route.stops
      .filter((s) => s.id !== stopId)
      .sort((a, b) => a.stopSequence - b.stopSequence)
      .map((s) => s.id);

    await this.queryTable('delivery_routes', (b) =>
      b
        .update({
          total_stops: remainingStopIds.length,
          updated_at: new Date().toISOString(),
        })
        .eq('id', routeId)
        .eq('tenant_id', tenantId)
    );

    await this.logEvent({
      tenantId,
      routeId,
      stopId,
      orderId: stopToRemove.orderId,
      actorUserId: actor.id,
      actorName: actor.name,
      eventType: 'STOP_REMOVED',
      previousStatus: stopToRemove.status,
      newStatus: 'cancelled',
      metadata: { orderNumber: stopToRemove.orderNumber },
    });

    return this.reorderRouteStops(tenantId, routeId, remainingStopIds, actor);
  }

  public async assignDriverToRoute(
    tenantId: string,
    routeId: string,
    driverId: string | null,
    actor: User
  ): Promise<DeliveryRoute> {
    const route = await this.getRouteById(tenantId, routeId);
    if (!route) {
      throw new Error('Rota não encontrada.');
    }
    if (['completed', 'cancelled'].includes(route.status)) {
      throw new Error('Não é possível alterar o entregador de uma rota concluída ou cancelada.');
    }

    let driver: DeliveryDriver | null = null;
    if (driverId) {
      driver = await this.getDriverById(tenantId, driverId);
      if (!driver) {
        throw new Error('Entregador não encontrado neste restaurante.');
      }
      if (!driver.isActive) {
        throw new Error(`O entregador "${driver.name}" está inativo.`);
      }
    }

    const now = new Date().toISOString();
    const newStatus: DeliveryRouteStatus =
      route.status === 'in_progress'
        ? 'in_progress'
        : driver
        ? 'assigned'
        : 'created';

    await this.queryTable('delivery_routes', (b) =>
      b
        .update({
          driver_id: driver ? driver.id : null,
          status: newStatus,
          assigned_at: driver ? now : null,
          updated_at: now,
        })
        .eq('id', routeId)
        .eq('tenant_id', tenantId)
    );

    await this.logEvent({
      tenantId,
      routeId,
      driverId: driver?.id || null,
      actorUserId: actor.id,
      actorName: actor.name,
      eventType: 'DRIVER_ASSIGNED',
      previousStatus: route.status,
      newStatus,
      metadata: { driverName: driver?.name || 'Desvinculado' },
    });

    return (await this.getRouteById(tenantId, routeId))!;
  }

  public async revokeOrRegenerateRouteQr(
    tenantId: string,
    routeId: string,
    action: 'revoke' | 'regenerate',
    actor: User
  ): Promise<DeliveryRoute> {
    const route = await this.getRouteById(tenantId, routeId);
    if (!route) {
      throw new Error('Rota não encontrada.');
    }

    const now = new Date().toISOString();
    if (action === 'revoke') {
      await this.queryTable('delivery_routes', (b) =>
        b
          .update({ qr_revoked_at: now, updated_at: now })
          .eq('id', routeId)
          .eq('tenant_id', tenantId)
      );
      await this.logEvent({
        tenantId,
        routeId,
        actorUserId: actor.id,
        actorName: actor.name,
        eventType: 'QR_REVOKED',
        previousStatus: route.status,
        newStatus: route.status,
      });
    } else {
      const newToken = `rtqr_${crypto.randomBytes(24).toString('hex')}`;
      const newExpires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      await this.queryTable('delivery_routes', (b) =>
        b
          .update({
            qr_token: newToken,
            qr_expires_at: newExpires,
            qr_revoked_at: null,
            updated_at: now,
          })
          .eq('id', routeId)
          .eq('tenant_id', tenantId)
      );
    }

    return (await this.getRouteById(tenantId, routeId))!;
  }

  public async cancelRoute(
    tenantId: string,
    routeId: string,
    actor: User
  ): Promise<DeliveryRoute> {
    const route = await this.getRouteById(tenantId, routeId);
    if (!route) {
      throw new Error('Rota não encontrada.');
    }
    if (route.status === 'completed') {
      throw new Error('Não é possível cancelar uma rota que já foi concluída.');
    }

    const now = new Date().toISOString();
    await this.queryTable('delivery_routes', (b) =>
      b
        .update({
          status: 'cancelled',
          cancelled_at: now,
          qr_revoked_at: now,
          updated_at: now,
        })
        .eq('id', routeId)
        .eq('tenant_id', tenantId)
    );

    for (const stop of route.stops) {
      if (stop.status === 'waiting' || stop.status === 'out_for_delivery') {
        await this.queryTable('delivery_route_stops', (b) =>
          b
            .update({ status: 'cancelled', updated_at: now })
            .eq('id', stop.id)
            .eq('tenant_id', tenantId)
        );
      }
    }

    if (route.driverId) {
      await this.queryTable('delivery_drivers', (b) =>
        b
          .update({ availability_status: 'available', updated_at: now })
          .eq('id', route.driverId)
          .eq('tenant_id', tenantId)
      );
    }

    await this.logEvent({
      tenantId,
      routeId,
      driverId: route.driverId,
      actorUserId: actor.id,
      actorName: actor.name,
      eventType: 'ROUTE_CANCELLED',
      previousStatus: route.status,
      newStatus: 'cancelled',
    });

    return (await this.getRouteById(tenantId, routeId))!;
  }

  // ==========================================
  // 4. ETAPA D — QR CODE VALIDATION, DRIVER PORTAL & ROUTE EXECUTION
  // ==========================================
  private async assertDriverAccessToRoute(
    tenantId: string,
    route: DeliveryRoute,
    actor: User,
    allowClaimUnassigned = false
  ): Promise<DeliveryDriver | null> {
    if (route.tenantId !== tenantId) {
      throw new Error('Violação de isolamento: esta rota pertence a outro restaurante.');
    }

    if (actor.role === 'DELIVERY_DRIVER') {
      const driver = await this.getDriverByUserId(tenantId, actor.id, actor.email);
      if (!driver || !driver.isActive) {
        throw new Error('Seu cadastro de entregador está inativo ou não foi localizado.');
      }
      if (route.driverId && route.driverId !== driver.id) {
        throw new Error(
          'Acesso negado: esta rota está atribuída a outro entregador.'
        );
      }
      if (!allowClaimUnassigned && route.driverId !== driver.id) {
        throw new Error(
          'Acesso negado: esta rota não está atribuída ao seu perfil de entregador. Escaneie o QR Code da rota primeiro.'
        );
      }
      return driver;
    }

    // Restaurant Admin / Manager / Owner acting on route
    if (route.driverId) {
      return this.getDriverById(tenantId, route.driverId);
    }
    return null;
  }

  public async scanRouteQrCode(
    tenantId: string,
    qrTokenInput: string,
    actor: User
  ): Promise<DeliveryRoute> {
    let cleanToken = (qrTokenInput || '').trim();
    // Extract token if full URL was scanned
    if (cleanToken.includes('routeQr=')) {
      try {
        const u = new URL(cleanToken, 'https://minihub.tech');
        cleanToken = u.searchParams.get('routeQr') || cleanToken;
      } catch {
        const match = cleanToken.match(/routeQr=([^&]+)/);
        if (match) cleanToken = decodeURIComponent(match[1]);
      }
    }

    if (!cleanToken) {
      throw new Error('QR Code inválido ou vazio.');
    }

    const { data: rawRoute } = await this.queryTable<any>('delivery_routes', (b) =>
      b.select('*').eq('qr_token', cleanToken).single()
    );

    if (!rawRoute) {
      throw new Error('Rota não localizada para este QR Code.');
    }

    if (rawRoute.tenant_id !== tenantId) {
      throw new Error(
        'Acesso bloqueado: este QR Code pertence a outro estabelecimento.'
      );
    }

    if (rawRoute.qr_revoked_at) {
      throw new Error('Este QR Code foi revogado pelo restaurante.');
    }

    if (new Date(rawRoute.qr_expires_at).getTime() < Date.now()) {
      throw new Error('Este QR Code expirou. Solicite um novo código na Central de Entregas.');
    }

    if (rawRoute.status === 'completed' || rawRoute.status === 'cancelled') {
      throw new Error(
        `Esta rota (${rawRoute.route_code}) já está ${
          rawRoute.status === 'completed' ? 'concluída' : 'cancelada'
        }.`
      );
    }

    const route = (await this.getRouteById(tenantId, rawRoute.id))!;
    const driver = await this.assertDriverAccessToRoute(tenantId, route, actor, true);

    const now = new Date().toISOString();
    const nextStatus: DeliveryRouteStatus =
      route.status === 'in_progress' ? 'in_progress' : 'accepted';

    await this.queryTable('delivery_routes', (b) =>
      b
        .update({
          driver_id: driver ? driver.id : route.driverId,
          status: nextStatus,
          assigned_at: route.assignedAt || now,
          accepted_at: route.acceptedAt || now,
          updated_at: now,
        })
        .eq('id', route.id)
        .eq('tenant_id', tenantId)
    );

    await this.logEvent({
      tenantId,
      routeId: route.id,
      driverId: driver?.id || route.driverId || null,
      actorUserId: actor.id,
      actorName: driver?.name || actor.name,
      eventType: 'QR_SCANNED',
      previousStatus: route.status,
      newStatus: nextStatus,
      metadata: { routeCode: route.routeCode },
    });

    return (await this.getRouteById(tenantId, route.id))!;
  }

  public async startRoute(
    tenantId: string,
    routeId: string,
    actor: User
  ): Promise<DeliveryRoute> {
    const route = await this.getRouteById(tenantId, routeId);
    if (!route) {
      throw new Error('Rota não encontrada.');
    }
    if (['completed', 'cancelled'].includes(route.status)) {
      throw new Error('Esta rota já foi finalizada ou cancelada.');
    }

    const driver = await this.assertDriverAccessToRoute(tenantId, route, actor);
    const effectiveDriverId = driver?.id || route.driverId || null;

    const now = new Date().toISOString();
    await this.queryTable('delivery_routes', (b) =>
      b
        .update({
          driver_id: effectiveDriverId,
          status: 'in_progress',
          accepted_at: route.acceptedAt || now,
          started_at: route.startedAt || now,
          updated_at: now,
        })
        .eq('id', route.id)
        .eq('tenant_id', tenantId)
    );

    if (effectiveDriverId) {
      await this.queryTable('delivery_drivers', (b) =>
        b
          .update({ availability_status: 'in_route', updated_at: now })
          .eq('id', effectiveDriverId)
          .eq('tenant_id', tenantId)
      );
    }

    await this.logEvent({
      tenantId,
      routeId: route.id,
      driverId: effectiveDriverId,
      actorUserId: actor.id,
      actorName: driver?.name || actor.name,
      eventType: 'ROUTE_STARTED',
      previousStatus: route.status,
      newStatus: 'in_progress',
      metadata: { routeCode: route.routeCode },
    });

    return (await this.getRouteById(tenantId, route.id))!;
  }

  public async startRouteStop(
    tenantId: string,
    routeId: string,
    stopId: string,
    actor: User,
    baseUrl?: string
  ): Promise<{
    route: DeliveryRoute;
    stop: DeliveryRouteStop;
    notification: DeliveryNotification;
  }> {
    const route = await this.getRouteById(tenantId, routeId);
    if (!route) {
      throw new Error('Rota não encontrada.');
    }
    if (['completed', 'cancelled'].includes(route.status)) {
      throw new Error('Esta rota já foi finalizada ou cancelada.');
    }

    const driver = await this.assertDriverAccessToRoute(tenantId, route, actor);
    const effectiveDriverId = driver?.id || route.driverId || null;

    const stop = route.stops.find((s) => s.id === stopId);
    if (!stop) {
      throw new Error('Parada não encontrada nesta rota.');
    }
    if (stop.status === 'delivered') {
      throw new Error('Esta parada já foi confirmada como entregue.');
    }

    const now = new Date().toISOString();

    // Ensure route is marked in_progress and driver in_route
    if (route.status !== 'in_progress') {
      await this.queryTable('delivery_routes', (b) =>
        b
          .update({
            driver_id: effectiveDriverId,
            status: 'in_progress',
            accepted_at: route.acceptedAt || now,
            started_at: route.startedAt || now,
            updated_at: now,
          })
          .eq('id', route.id)
          .eq('tenant_id', tenantId)
      );
      if (effectiveDriverId) {
        await this.queryTable('delivery_drivers', (b) =>
          b
            .update({ availability_status: 'in_route', updated_at: now })
            .eq('id', effectiveDriverId)
            .eq('tenant_id', tenantId)
        );
      }
    }

    await this.queryTable('delivery_route_stops', (b) =>
      b
        .update({
          status: 'out_for_delivery',
          started_at: stop.startedAt || now,
          failure_reason: null,
          failure_notes: null,
          updated_at: now,
        })
        .eq('id', stop.id)
        .eq('tenant_id', tenantId)
    );

    // Sync main order status to OUT_FOR_DELIVERY
    try {
      await orderRepo.updateOrderStatus(tenantId, stop.orderId, 'OUT_FOR_DELIVERY', actor);
    } catch (err) {
      console.warn('[DeliveryHubRepository] Order status sync warning:', err);
    }

    await this.logEvent({
      tenantId,
      routeId: route.id,
      stopId: stop.id,
      orderId: stop.orderId,
      driverId: effectiveDriverId,
      actorUserId: actor.id,
      actorName: driver?.name || actor.name,
      eventType: 'STOP_OUT_FOR_DELIVERY',
      previousStatus: stop.status,
      newStatus: 'out_for_delivery',
      metadata: { orderNumber: stop.orderNumber, stopSequence: stop.stopSequence },
    });

    // Automatically trigger WhatsApp notification ONLY for this stop's customer (Etapa 8)
    const notification = await this.dispatchWhatsAppNotification({
      tenantId,
      routeId: route.id,
      stopId: stop.id,
      orderId: stop.orderId,
      eventType: 'out_for_delivery',
      actor,
      baseUrl,
    });

    const updatedRoute = (await this.getRouteById(tenantId, route.id))!;
    const updatedStop = updatedRoute.stops.find((s) => s.id === stop.id)!;

    return {
      route: updatedRoute,
      stop: updatedStop,
      notification,
    };
  }

  private async checkAndFinalizeRouteIfDone(
    tenantId: string,
    routeId: string,
    effectiveDriverId: string | null,
    actor: User
  ): Promise<void> {
    const currentRoute = await this.getRouteById(tenantId, routeId);
    if (!currentRoute) return;

    const allFinalized = currentRoute.stops.every((s) =>
      ['delivered', 'failed_attempt', 'cancelled'].includes(s.status)
    );
    const completedStops = currentRoute.stops.filter((s) => s.status === 'delivered').length;
    const failedStops = currentRoute.stops.filter((s) => s.status === 'failed_attempt').length;
    const now = new Date().toISOString();

    if (allFinalized) {
      await this.queryTable('delivery_routes', (b) =>
        b
          .update({
            status: 'completed',
            completed_stops: completedStops,
            failed_stops: failedStops,
            completed_at: now,
            updated_at: now,
          })
          .eq('id', routeId)
          .eq('tenant_id', tenantId)
      );

      if (effectiveDriverId) {
        // Clear live location & set driver available when route completes (Etapa 7 & 10)
        await this.queryTable('delivery_drivers', (b) =>
          b
            .update({
              availability_status: 'available',
              last_latitude: null,
              last_longitude: null,
              last_location_at: null,
              updated_at: now,
            })
            .eq('id', effectiveDriverId)
            .eq('tenant_id', tenantId)
        );
      }

      await this.logEvent({
        tenantId,
        routeId,
        driverId: effectiveDriverId,
        actorUserId: actor.id,
        actorName: actor.name,
        eventType: 'ROUTE_COMPLETED',
        previousStatus: currentRoute.status,
        newStatus: 'completed',
        metadata: { completedStops, failedStops },
      });
    } else {
      await this.queryTable('delivery_routes', (b) =>
        b
          .update({
            completed_stops: completedStops,
            failed_stops: failedStops,
            updated_at: now,
          })
          .eq('id', routeId)
          .eq('tenant_id', tenantId)
      );
    }
  }

  public async completeRouteStop(
    tenantId: string,
    routeId: string,
    stopId: string,
    actor: User
  ): Promise<DeliveryRoute> {
    const route = await this.getRouteById(tenantId, routeId);
    if (!route) {
      throw new Error('Rota não encontrada.');
    }
    const driver = await this.assertDriverAccessToRoute(tenantId, route, actor);
    const effectiveDriverId = driver?.id || route.driverId || null;

    const stop = route.stops.find((s) => s.id === stopId);
    if (!stop) {
      throw new Error('Parada não encontrada nesta rota.');
    }
    if (stop.status === 'delivered') {
      return route;
    }

    const now = new Date().toISOString();
    await this.queryTable('delivery_route_stops', (b) =>
      b
        .update({
          status: 'delivered',
          started_at: stop.startedAt || now,
          delivered_at: now,
          updated_at: now,
        })
        .eq('id', stop.id)
        .eq('tenant_id', tenantId)
    );

    // Sync main order status to COMPLETED
    try {
      await orderRepo.updateOrderStatus(tenantId, stop.orderId, 'COMPLETED', actor);
    } catch (err) {
      console.warn('[DeliveryHubRepository] Order COMPLETED sync warning:', err);
    }

    await this.logEvent({
      tenantId,
      routeId: route.id,
      stopId: stop.id,
      orderId: stop.orderId,
      driverId: effectiveDriverId,
      actorUserId: actor.id,
      actorName: driver?.name || actor.name,
      eventType: 'STOP_DELIVERED',
      previousStatus: stop.status,
      newStatus: 'delivered',
      metadata: { orderNumber: stop.orderNumber, stopSequence: stop.stopSequence },
    });

    await this.checkAndFinalizeRouteIfDone(tenantId, route.id, effectiveDriverId, actor);

    return (await this.getRouteById(tenantId, route.id))!;
  }

  public async failRouteStop(
    tenantId: string,
    routeId: string,
    stopId: string,
    payload: { reason: DeliveryFailureReason; notes?: string },
    actor: User
  ): Promise<DeliveryRoute> {
    const route = await this.getRouteById(tenantId, routeId);
    if (!route) {
      throw new Error('Rota não encontrada.');
    }
    const driver = await this.assertDriverAccessToRoute(tenantId, route, actor);
    const effectiveDriverId = driver?.id || route.driverId || null;

    const stop = route.stops.find((s) => s.id === stopId);
    if (!stop) {
      throw new Error('Parada não encontrada nesta rota.');
    }

    const validReasons: DeliveryFailureReason[] = [
      'customer_absent',
      'address_not_found',
      'customer_not_answered',
      'access_issue',
      'other',
    ];
    if (!validReasons.includes(payload.reason)) {
      throw new Error('Selecione um motivo válido para a tentativa sem sucesso.');
    }

    const now = new Date().toISOString();
    await this.queryTable('delivery_route_stops', (b) =>
      b
        .update({
          status: 'failed_attempt',
          failed_at: now,
          failure_reason: payload.reason,
          failure_notes: payload.notes?.trim() || null,
          updated_at: now,
        })
        .eq('id', stop.id)
        .eq('tenant_id', tenantId)
    );

    await this.logEvent({
      tenantId,
      routeId: route.id,
      stopId: stop.id,
      orderId: stop.orderId,
      driverId: effectiveDriverId,
      actorUserId: actor.id,
      actorName: driver?.name || actor.name,
      eventType: 'STOP_FAILED_ATTEMPT',
      previousStatus: stop.status,
      newStatus: 'failed_attempt',
      metadata: {
        orderNumber: stop.orderNumber,
        reason: payload.reason,
        reasonLabel: FAILURE_REASON_LABELS[payload.reason],
        notes: payload.notes?.trim() || null,
      },
    });

    await this.checkAndFinalizeRouteIfDone(tenantId, route.id, effectiveDriverId, actor);

    return (await this.getRouteById(tenantId, route.id))!;
  }

  // ==========================================
  // 5. ETAPA E — WHATSAPP NOTIFICATIONS (IDEMPOTENT & TRUTHFUL) + PUBLIC TRACKING
  // ==========================================
  public async dispatchWhatsAppNotification(params: {
    tenantId: string;
    routeId: string;
    stopId: string;
    orderId: string;
    eventType: 'out_for_delivery' | 'delivered' | 'failed_attempt';
    actor: User;
    baseUrl?: string;
    forceRetry?: boolean;
  }): Promise<DeliveryNotification> {
    const idempotencyKey = `whatsapp::${params.tenantId}::${params.orderId}::${params.eventType}`;

    if (!params.forceRetry) {
      const existingInFlight = this.inFlightNotifications.get(idempotencyKey);
      if (existingInFlight) {
        return existingInFlight;
      }
    }

    const promise = this.executeWhatsAppNotification(params, idempotencyKey);
    if (!params.forceRetry) {
      this.inFlightNotifications.set(idempotencyKey, promise);
    }
    try {
      return await promise;
    } finally {
      if (this.inFlightNotifications.get(idempotencyKey) === promise) {
        this.inFlightNotifications.delete(idempotencyKey);
      }
    }
  }

  private async executeWhatsAppNotification(
    params: {
      tenantId: string;
      routeId: string;
      stopId: string;
      orderId: string;
      eventType: 'out_for_delivery' | 'delivered' | 'failed_attempt';
      actor: User;
      baseUrl?: string;
      forceRetry?: boolean;
    },
    idempotencyKey: string
  ): Promise<DeliveryNotification> {
    // 1. Check existing notification by idempotency key to prevent duplicate automatic messages
    const { data: existingNotif } = await this.queryTable<any>(
      'delivery_notifications',
      (b) => b.select('*').eq('idempotency_key', idempotencyKey).single()
    );

    if (existingNotif && !params.forceRetry) {
      return this.mapNotification(existingNotif);
    }

    const [tenant, route] = await Promise.all([
      repo.getTenantById(params.tenantId),
      this.getRouteById(params.tenantId, params.routeId),
    ]);

    const stop = route?.stops.find((s) => s.id === params.stopId);
    if (!tenant || !route || !stop) {
      throw new Error('Dados da parada ou restaurante não encontrados para notificação.');
    }

    const publicBaseUrl = params.baseUrl || buildPublicTenantUrl(tenant.slug);
    const trackingUrl = `${publicBaseUrl.replace(/\/$/, '')}/rastreio/${stop.trackingToken}`;

    const etaText = stop.durationFromPrevMin
      ? `\nPrevisão estimada: ~${stop.durationFromPrevMin} min.`
      : '';

    const messageBody =
      `Olá, ${stop.customerName}! Seu pedido #${stop.orderNumber} saiu para entrega. ` +
      `Nosso entregador já está a caminho.${etaText}\n\n` +
      `Acompanhe seu pedido: ${trackingUrl}`;

    const cleanPhone = (stop.customerPhone || '').replace(/\D/g, '');
    const whatsappWebUrl = buildWhatsAppUrl(cleanPhone, messageBody);

    // 2. Check if a real external WhatsApp gateway is configured
    const gatewayUrl = process.env.WHATSAPP_API_URL || '';
    const gatewayToken = process.env.WHATSAPP_API_TOKEN || '';

    let status: 'sent' | 'failed' | 'pending_gateway' = 'pending_gateway';
    let providerConfirmed = false;
    let providerName: string | null = null;
    let providerResponse: Record<string, any> | null = null;
    let errorMessage: string | null = null;
    const now = new Date().toISOString();

    if (cleanPhone.length < 10) {
      status = 'failed';
      errorMessage = 'Telefone do cliente inválido ou incompleto para envio via WhatsApp.';
    } else if (gatewayUrl.startsWith('http')) {
      providerName = 'webhook_gateway';
      try {
        const res = await fetch(gatewayUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(gatewayToken ? { Authorization: `Bearer ${gatewayToken}` } : {}),
          },
          body: JSON.stringify({
            tenantId: params.tenantId,
            orderId: params.orderId,
            orderNumber: stop.orderNumber,
            phone: cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`,
            message: messageBody,
            trackingUrl,
            idempotencyKey,
          }),
        });

        const bodyJson = await res.json().catch(() => ({ httpStatus: res.status }));
        providerResponse = bodyJson;

        if (res.ok) {
          status = 'sent';
          providerConfirmed = true;
          await orderRepo.recordWhatsAppSent(params.tenantId, stop.orderId);
        } else {
          status = 'failed';
          providerConfirmed = false;
          errorMessage = `Provedor WhatsApp retornou HTTP ${res.status}.`;
        }
      } catch (err: any) {
        status = 'failed';
        providerConfirmed = false;
        errorMessage = `Falha de conexão com o gateway WhatsApp: ${err?.message || 'Erro de rede'}`;
      }
    } else {
      // Never mark as 'sent' when no external WhatsApp gateway confirmed delivery!
      status = 'pending_gateway';
      providerConfirmed = false;
      providerName = 'whatsapp_deep_link';
      providerResponse = {
        mode: 'manual_or_webhook_pending',
        note: 'Nenhum provedor de API WhatsApp configurado; link direto gerado com segurança.',
      };
    }

    if (existingNotif && params.forceRetry) {
      const attemptsCount = Number(existingNotif.attempts_count || 1) + 1;
      await this.queryTable('delivery_notifications', (b) =>
        b
          .update({
            status,
            provider_confirmed: providerConfirmed,
            provider_name: providerName,
            provider_response: providerResponse,
            error_message: errorMessage,
            whatsapp_web_url: whatsappWebUrl,
            attempts_count: attemptsCount,
            sent_at: providerConfirmed ? now : existingNotif.sent_at,
            updated_at: now,
          })
          .eq('id', existingNotif.id)
          .eq('tenant_id', params.tenantId)
      );

      const { data: updated } = await this.queryTable<any>('delivery_notifications', (b) =>
        b.select('*').eq('id', existingNotif.id).single()
      );
      return this.mapNotification(updated);
    }

    const record = {
      id: crypto.randomUUID(),
      tenant_id: params.tenantId,
      order_id: params.orderId,
      route_id: params.routeId,
      stop_id: params.stopId,
      event_type: params.eventType,
      channel: 'whatsapp',
      recipient_phone: cleanPhone,
      message_body: messageBody,
      tracking_url: trackingUrl,
      idempotency_key: idempotencyKey,
      status,
      provider_confirmed: providerConfirmed,
      provider_name: providerName,
      provider_response: providerResponse,
      error_message: errorMessage,
      whatsapp_web_url: whatsappWebUrl,
      attempts_count: 1,
      sent_at: providerConfirmed ? now : null,
      created_at: now,
      updated_at: now,
    };

    const { error: insertErr } = await this.queryTable('delivery_notifications', (b) =>
      b.insert(record)
    );

    if (insertErr && String(insertErr.code) === '23505') {
      const { data: raceExisting } = await this.queryTable<any>(
        'delivery_notifications',
        (b) => b.select('*').eq('idempotency_key', idempotencyKey).single()
      );
      if (raceExisting) return this.mapNotification(raceExisting);
    }

    await this.logEvent({
      tenantId: params.tenantId,
      routeId: params.routeId,
      stopId: params.stopId,
      orderId: params.orderId,
      actorUserId: params.actor.id,
      actorName: params.actor.name,
      eventType: 'WHATSAPP_NOTIFICATION_DISPATCHED',
      previousStatus: null,
      newStatus: status,
      metadata: {
        idempotencyKey,
        providerConfirmed,
        recipientPhone: cleanPhone,
      },
    });

    return this.mapNotification(record);
  }

  private mapNotification(row: any): DeliveryNotification {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      orderId: row.order_id,
      routeId: row.route_id || null,
      stopId: row.stop_id || null,
      eventType: row.event_type,
      channel: row.channel || 'whatsapp',
      recipientPhone: row.recipient_phone,
      messageBody: row.message_body,
      trackingUrl: row.tracking_url,
      idempotencyKey: row.idempotency_key,
      status: row.status,
      providerConfirmed: Boolean(row.provider_confirmed),
      providerName: row.provider_name || null,
      providerResponse: row.provider_response || null,
      errorMessage: row.error_message || null,
      whatsappWebUrl: row.whatsapp_web_url,
      attemptsCount: Number(row.attempts_count || 1),
      sentAt: row.sent_at || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public async listNotifications(tenantId: string, orderId?: string): Promise<DeliveryNotification[]> {
    const { data } = await this.queryTable<any[]>('delivery_notifications', (b) => {
      let q = b.select('*').eq('tenant_id', tenantId);
      if (orderId) q = q.eq('order_id', orderId);
      return q.order('created_at', { ascending: false }).limit(100);
    });
    return (data || []).map((r: any) => this.mapNotification(r));
  }

  public async getPublicTrackingByToken(
    trackingToken: string
  ): Promise<PublicDeliveryTrackingInfo | null> {
    const cleanToken = (trackingToken || '').trim();
    if (!cleanToken || !cleanToken.startsWith('trk_')) {
      return null;
    }

    const { data: stopRow } = await this.queryTable<any>('delivery_route_stops', (b) =>
      b.select('*').eq('tracking_token', cleanToken).single()
    );
    if (!stopRow) return null;

    const tenantId = stopRow.tenant_id;
    const [tenant, route, order] = await Promise.all([
      repo.getTenantById(tenantId),
      this.getRouteById(tenantId, stopRow.route_id),
      orderRepo.getOrderById(tenantId, stopRow.order_id),
    ]);

    if (!tenant || !route) return null;

    // Revoke public tracking if the route or stop was cancelled
    if (route.status === 'cancelled' || stopRow.status === 'cancelled') {
      return null;
    }

    let driver: DeliveryDriver | null = null;
    if (route.driverId) {
      driver = await this.getDriverById(tenantId, route.driverId);
    }

    const stopStatus = stopRow.status as DeliveryStopStatus;
    const firstName = (stopRow.customer_name || 'Cliente').split(' ')[0];
    const driverFirstName = driver?.name ? driver.name.split(' ')[0] : null;

    let estimatedArrivalMinutes: number | null = null;
    let estimatedArrivalTime: string | null = null;

    if (stopStatus === 'out_for_delivery') {
      const durationMin = Number(stopRow.duration_from_prev_min || 12);
      const startedMs = stopRow.started_at
        ? new Date(stopRow.started_at).getTime()
        : Date.now();
      const targetMs = startedMs + durationMin * 60000;
      estimatedArrivalMinutes = Math.max(2, Math.ceil((targetMs - Date.now()) / 60000));
      estimatedArrivalTime = new Date(targetMs).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } else if (stopStatus === 'waiting' && route.status === 'in_progress') {
      const cumMin = Number(stopRow.cumulative_eta_min || 25);
      const routeStartMs = route.startedAt
        ? new Date(route.startedAt).getTime()
        : Date.now();
      const targetMs = routeStartMs + cumMin * 60000;
      estimatedArrivalMinutes = Math.max(5, Math.ceil((targetMs - Date.now()) / 60000));
      estimatedArrivalTime = new Date(targetMs).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    // Expire stale GPS locations older than 10 minutes
    const STALE_LOCATION_MAX_AGE_MS = 10 * 60 * 1000;
    const isFreshLocation =
      driver?.lastLocationAt != null &&
      Date.now() - new Date(driver.lastLocationAt).getTime() <= STALE_LOCATION_MAX_AGE_MS;

    // Only expose driver live coordinates if route is actively in progress, stop is out_for_delivery, driver opted in, and location is fresh
    const liveDriverLocation =
      route.status === 'in_progress' &&
      stopStatus === 'out_for_delivery' &&
      driver?.shareLocation &&
      hasValidCoordinates(driver.lastLatitude, driver.lastLongitude) &&
      driver.lastLocationAt &&
      isFreshLocation
        ? {
            latitude: driver.lastLatitude!,
            longitude: driver.lastLongitude!,
            updatedAt: driver.lastLocationAt,
          }
        : null;

    const timeline = [
      {
        step: 'confirmed',
        label: 'Pedido confirmado pelo restaurante',
        completed: true,
        active: stopStatus === 'waiting' && route.status === 'created',
        timestamp: order?.createdAt || stopRow.created_at,
      },
      {
        step: 'dispatched',
        label: 'Separado para rota de entrega',
        completed: ['assigned', 'accepted', 'in_progress', 'completed'].includes(route.status),
        active: stopStatus === 'waiting' && ['assigned', 'accepted', 'in_progress'].includes(route.status),
        timestamp: route.assignedAt || route.createdAt,
      },
      {
        step: 'out_for_delivery',
        label: 'Saiu para entrega',
        completed: stopStatus === 'out_for_delivery' || stopStatus === 'delivered',
        active: stopStatus === 'out_for_delivery',
        timestamp: stopRow.started_at || null,
      },
      {
        step: 'delivered',
        label:
          stopStatus === 'failed_attempt'
            ? `Tentativa sem sucesso (${
                FAILURE_REASON_LABELS[stopRow.failure_reason as DeliveryFailureReason] ||
                'Ocorrência'
              })`
            : 'Pedido entregue',
        completed: stopStatus === 'delivered',
        active: stopStatus === 'delivered' || stopStatus === 'failed_attempt',
        timestamp: stopRow.delivered_at || stopRow.failed_at || null,
      },
    ];

    return {
      trackingToken: cleanToken,
      orderNumber: Number(stopRow.order_number),
      formattedOrderNumber: `#${stopRow.order_number}`,
      customerFirstName: firstName,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      tenantLogoUrl: tenant.appearance?.logoUrl || null,
      tenantPrimaryColor: tenant.appearance?.primaryColor || '#4f46e5',
      tenantWhatsapp: tenant.whatsapp || tenant.phone || '',
      tenantPhone: tenant.phone || '',
      orderStatus: order?.status || 'OUT_FOR_DELIVERY',
      stopStatus,
      stopStatusLabel: STOP_STATUS_LABELS[stopStatus],
      routeStatus: route.status,
      stopSequence: Number(stopRow.stop_sequence),
      totalStopsInRoute: route.totalStops,
      driverFirstName,
      driverVehicleInfo: driver?.vehicleInfo || null,
      neighborhood: stopRow.neighborhood,
      city: stopRow.city,
      state: stopRow.state,
      createdAt: order?.createdAt || stopRow.created_at,
      startedAt: stopRow.started_at || null,
      deliveredAt: stopRow.delivered_at || null,
      failedAt: stopRow.failed_at || null,
      failureReasonLabel: stopRow.failure_reason
        ? FAILURE_REASON_LABELS[stopRow.failure_reason as DeliveryFailureReason]
        : null,
      estimatedArrivalMinutes,
      estimatedArrivalTime,
      liveDriverLocation,
      timeline,
    };
  }

  // ==========================================
  // 6. ETAPA D & F — DRIVER PORTAL & OPTIONAL LIVE LOCATION
  // ==========================================
  public async getDriverPortalData(
    tenantId: string,
    actor: User,
    selectedDriverId?: string
  ): Promise<{
    driver: DeliveryDriver | null;
    activeRoutes: DeliveryRoute[];
    completedRoutes: DeliveryRoute[];
  }> {
    let driver: DeliveryDriver | null = null;
    if (actor.role === 'DELIVERY_DRIVER') {
      driver = await this.getDriverByUserId(tenantId, actor.id, actor.email);
      if (!driver) {
        return { driver: null, activeRoutes: [], completedRoutes: [] };
      }
    } else if (selectedDriverId) {
      driver = await this.getDriverById(tenantId, selectedDriverId);
    } else {
      const drivers = await this.listDrivers(tenantId);
      driver = drivers[0] || null;
    }

    if (!driver) {
      return { driver: null, activeRoutes: [], completedRoutes: [] };
    }

    const driverRoutes = await this.listRoutes(tenantId, { driverId: driver.id });
    const activeRoutes = driverRoutes.filter((r) =>
      ['created', 'assigned', 'accepted', 'in_progress'].includes(r.status)
    );
    const completedRoutes = driverRoutes
      .filter((r) => ['completed', 'cancelled'].includes(r.status))
      .slice(0, 20);

    return {
      driver,
      activeRoutes,
      completedRoutes,
    };
  }

  public async updateDriverStatusAndLocation(
    tenantId: string,
    actor: User,
    payload: {
      driverId?: string;
      availabilityStatus?: DriverAvailabilityStatus;
      shareLocation?: boolean;
      latitude?: number | null;
      longitude?: number | null;
    }
  ): Promise<DeliveryDriver> {
    let driver: DeliveryDriver | null = null;
    if (actor.role === 'DELIVERY_DRIVER') {
      driver = await this.getDriverByUserId(tenantId, actor.id, actor.email);
    } else if (payload.driverId) {
      driver = await this.getDriverById(tenantId, payload.driverId);
    }

    if (!driver) {
      throw new Error('Perfil de entregador não localizado.');
    }

    const now = new Date().toISOString();
    const patch: Record<string, any> = {
      updated_at: now,
    };

    if (payload.availabilityStatus) {
      patch.availability_status = payload.availabilityStatus;
    }
    if (payload.shareLocation !== undefined) {
      patch.share_location = Boolean(payload.shareLocation);
      if (!payload.shareLocation) {
        patch.last_latitude = null;
        patch.last_longitude = null;
        patch.last_location_at = null;
      }
    }

    // Only record coordinates while driver has an active route and opted in to shareLocation
    const shareActive =
      payload.shareLocation !== undefined ? Boolean(payload.shareLocation) : driver.shareLocation;
    if (
      shareActive &&
      driver.activeRouteId &&
      hasValidCoordinates(payload.latitude, payload.longitude)
    ) {
      patch.last_latitude = Number(payload.latitude);
      patch.last_longitude = Number(payload.longitude);
      patch.last_location_at = now;
    }

    await this.queryTable('delivery_drivers', (b) =>
      b.update(patch).eq('id', driver!.id).eq('tenant_id', tenantId)
    );

    return (await this.getDriverById(tenantId, driver.id))!;
  }
}

export const deliveryHubRepo = new DeliveryHubRepository();
