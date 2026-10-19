import crypto from 'crypto';
import { supabaseAdmin } from '../supabaseAdmin.js';
import { repo } from './repository.js';
import { productRepo } from './productRepository.js';
import { canTenantOperate } from '../tenantResolver.js';
import { User } from '../../src/types/saas.js';
import {
  RestaurantTable,
  RestaurantSession,
  RestaurantOrder,
  RestaurantOrderItem,
  RestaurantOrderStatus,
  RestaurantOrderStatusHistory,
  CreateTablePayload,
  CreateTablesBatchPayload,
  CreateTableOrderPayload,
  PublicTableInfoResponse,
  RestaurantSummary,
  RestaurantFeeTemplate,
  RestaurantSessionFee,
  AddSessionFeePayload,
} from '../../src/types/restaurant.js';
import {
  isProductAvailableOnDay,
  getCurrentDayOfWeek,
  getDayName,
} from '../../src/utils/productAvailability.js';

// In-memory rate limiting map for table orders
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const tableRateLimitMap = new Map<string, RateLimitEntry>();

export function checkTableDbError(error: any, tableName: string) {
  if (!error) return;
  const msg = error.message || String(error);
  if (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (msg.includes('relation') && msg.includes('does not exist')) ||
    (msg.includes('table') && msg.includes('does not exist')) ||
    msg.includes('schema cache')
  ) {
    throw new Error(
      `Tabela "${tableName}" não encontrada no Supabase. É necessário executar a migração SQL 20261013000000_restaurant_tables_catalog.sql no Supabase Dashboard.`
    );
  }
  throw new Error(`Erro no banco de dados (${tableName}): ${msg}`);
}

export class RestaurantRepository {
  // ==========================================
  // 1. TABLE MANAGEMENT
  // ==========================================

  public async listTables(tenantId: string): Promise<RestaurantTable[]> {
    const { data: rawTables, error: tablesErr } = await supabaseAdmin
      .from('restaurant_tables')
      .select('*')
      .eq('tenant_id', tenantId);

    if (tablesErr) {
      checkTableDbError(tablesErr, 'restaurant_tables');
    }

    const tables = rawTables || [];

    // Fetch open sessions to enrich table metrics
    const { data: openSessions } = await supabaseAdmin
      .from('restaurant_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'open');

    const sessionMap = new Map<string, any>();
    (openSessions || []).forEach((s: any) => {
      sessionMap.set(s.table_id, s);
    });

    // Count active orders per session
    const { data: rawOrders } = await supabaseAdmin
      .from('restaurant_orders')
      .select('id, session_id, status, total')
      .eq('tenant_id', tenantId);

    const ordersBySession = new Map<string, { count: number; total: number }>();
    (rawOrders || []).forEach((o: any) => {
      if (o.status !== 'cancelled') {
        const existing = ordersBySession.get(o.session_id) || { count: 0, total: 0 };
        existing.count += 1;
        existing.total += Number(o.total || 0);
        ordersBySession.set(o.session_id, existing);
      }
    });

    const result: RestaurantTable[] = tables.map((t: any) => {
      const activeSession = sessionMap.get(t.id);
      const metrics = activeSession ? ordersBySession.get(activeSession.id) : null;

      return {
        id: t.id,
        tenantId: t.tenant_id,
        tableNumber: t.table_number,
        name: t.name || null,
        status: t.status || 'available',
        isActive: t.is_active !== false,
        notes: t.notes || null,
        qrCodeToken: t.qr_code_token,
        currentSessionId: activeSession?.id || t.current_session_id || null,
        currentSessionTotal: metrics ? Math.round(metrics.total * 100) / 100 : activeSession ? Number(activeSession.total_amount || 0) : 0,
        currentSessionOrdersCount: metrics ? metrics.count : 0,
        currentSessionOpenedAt: activeSession ? activeSession.opened_at : null,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      };
    });

    // Natural sort by table number (e.g. 1, 2, 10, 20)
    result.sort((a, b) => {
      const numA = parseInt(a.tableNumber.replace(/\D/g, ''), 10);
      const numB = parseInt(b.tableNumber.replace(/\D/g, ''), 10);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return numA - numB;
      }
      return a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true });
    });

    return result;
  }

  public async getTableById(id: string, tenantId: string): Promise<RestaurantTable | null> {
    const { data: t } = await supabaseAdmin
      .from('restaurant_tables')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (!t) return null;

    // Check open session
    const { data: session } = await supabaseAdmin
      .from('restaurant_sessions')
      .select('*')
      .eq('table_id', id)
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .single();

    let sessionTotal = 0;
    let ordersCount = 0;

    if (session) {
      const { data: orders } = await supabaseAdmin
        .from('restaurant_orders')
        .select('id, total, status')
        .eq('session_id', session.id)
        .eq('tenant_id', tenantId);

      (orders || []).forEach((o: any) => {
        if (o.status !== 'cancelled') {
          sessionTotal += Number(o.total || 0);
          ordersCount += 1;
        }
      });
    }

    return {
      id: t.id,
      tenantId: t.tenant_id,
      tableNumber: t.table_number,
      name: t.name || null,
      status: t.status || 'available',
      isActive: t.is_active !== false,
      notes: t.notes || null,
      qrCodeToken: t.qr_code_token,
      currentSessionId: session?.id || null,
      currentSessionTotal: Math.round(sessionTotal * 100) / 100,
      currentSessionOrdersCount: ordersCount,
      currentSessionOpenedAt: session?.opened_at || null,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    };
  }

  public async createTable(
    tenantId: string,
    payload: CreateTablePayload,
    actor: User
  ): Promise<RestaurantTable> {
    const tableNumber = payload.tableNumber?.trim();
    if (!tableNumber) {
      throw new Error('O número ou identificador da mesa é obrigatório.');
    }

    // Check duplicate table number for this tenant
    const { data: existing } = await supabaseAdmin
      .from('restaurant_tables')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('table_number', tableNumber)
      .single();

    if (existing) {
      throw new Error(`A mesa com o número "${tableNumber}" já está cadastrada.`);
    }

    const now = new Date().toISOString();
    const qrCodeToken = `tab_${crypto.randomBytes(10).toString('hex')}`;

    const newRecord = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      table_number: tableNumber,
      name: payload.name?.trim() || null,
      status: 'available',
      is_active: payload.isActive !== false,
      notes: payload.notes?.trim() || null,
      qr_code_token: qrCodeToken,
      current_session_id: null,
      created_at: now,
      updated_at: now,
    };

    const { data: inserted, error } = await supabaseAdmin
      .from('restaurant_tables')
      .insert(newRecord)
      .select()
      .single();

    if (error || !inserted) {
      throw new Error(`Erro ao cadastrar mesa: ${error?.message || 'Falha na gravação'}`);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'TABLE_CREATE' as any,
      entity: 'restaurant_tables',
      entityId: inserted.id,
      metadata: { tableNumber, name: inserted.name },
    });

    return {
      id: inserted.id,
      tenantId: inserted.tenant_id,
      tableNumber: inserted.table_number,
      name: inserted.name,
      status: inserted.status,
      isActive: inserted.is_active,
      notes: inserted.notes,
      qrCodeToken: inserted.qr_code_token,
      currentSessionId: null,
      currentSessionTotal: 0,
      currentSessionOrdersCount: 0,
      currentSessionOpenedAt: null,
      createdAt: inserted.created_at,
      updatedAt: inserted.updated_at,
    };
  }

  public async createTablesBatch(
    tenantId: string,
    payload: CreateTablesBatchPayload,
    actor: User
  ): Promise<{ createdCount: number; skippedCount: number }> {
    const start = Math.floor(payload.startNumber);
    const end = Math.floor(payload.endNumber);

    if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
      throw new Error('Intervalo de mesas inválido. O número inicial deve ser menor ou igual ao final.');
    }

    if (end - start > 100) {
      throw new Error('Limite máximo de 100 mesas por lote atingido.');
    }

    const { data: existingTables } = await supabaseAdmin
      .from('restaurant_tables')
      .select('table_number')
      .eq('tenant_id', tenantId);

    const existingSet = new Set((existingTables || []).map((t: any) => String(t.table_number).trim()));

    const now = new Date().toISOString();
    const toInsert: any[] = [];
    let skippedCount = 0;

    for (let i = start; i <= end; i++) {
      const padded = i < 10 ? `0${i}` : String(i);
      const prefix = payload.prefix?.trim() || '';
      const suffix = payload.suffix?.trim() || '';
      const formattedNum = `${prefix}${padded}${suffix}`.trim();

      if (existingSet.has(formattedNum)) {
        skippedCount++;
        continue;
      }

      existingSet.add(formattedNum);
      const name = payload.namePrefix ? `${payload.namePrefix.trim()} ${padded}` : null;
      const qrCodeToken = `tab_${crypto.randomBytes(10).toString('hex')}`;

      toInsert.push({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        table_number: formattedNum,
        name,
        status: 'available',
        is_active: true,
        notes: null,
        qr_code_token: qrCodeToken,
        current_session_id: null,
        created_at: now,
        updated_at: now,
      });
    }

    if (toInsert.length > 0) {
      await supabaseAdmin.from('restaurant_tables').insert(toInsert);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'TABLE_BATCH_CREATE' as any,
      entity: 'restaurant_tables',
      entityId: tenantId,
      metadata: { count: toInsert.length, skipped: skippedCount, start, end },
    });

    return { createdCount: toInsert.length, skippedCount };
  }

  public async updateTable(
    id: string,
    tenantId: string,
    payload: Partial<RestaurantTable>,
    actor: User
  ): Promise<RestaurantTable> {
    const existing = await this.getTableById(id, tenantId);
    if (!existing) {
      throw new Error('Mesa não encontrada.');
    }

    const patch: any = {
      updated_at: new Date().toISOString(),
    };

    if (payload.tableNumber !== undefined) {
      const newNum = payload.tableNumber.trim();
      if (!newNum) {
        throw new Error('O número da mesa não pode ser vazio.');
      }
      if (newNum !== existing.tableNumber) {
        const { data: dup } = await supabaseAdmin
          .from('restaurant_tables')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('table_number', newNum)
          .neq('id', id)
          .single();

        if (dup) {
          throw new Error(`O número de mesa "${newNum}" já está em uso.`);
        }
        patch.table_number = newNum;
      }
    }

    if (payload.name !== undefined) {
      patch.name = payload.name?.trim() || null;
    }
    if (payload.status !== undefined) {
      patch.status = payload.status;
    }
    if (payload.isActive !== undefined) {
      patch.is_active = payload.isActive;
    }
    if (payload.notes !== undefined) {
      patch.notes = payload.notes?.trim() || null;
    }

    const { data: updated, error } = await supabaseAdmin
      .from('restaurant_tables')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error || !updated) {
      throw new Error(`Erro ao atualizar mesa: ${error?.message || 'Falha'}`);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'TABLE_UPDATE' as any,
      entity: 'restaurant_tables',
      entityId: id,
      metadata: patch,
    });

    return this.getTableById(id, tenantId) as Promise<RestaurantTable>;
  }

  public async regenerateTableQrToken(
    id: string,
    tenantId: string,
    actor: User
  ): Promise<string> {
    const existing = await this.getTableById(id, tenantId);
    if (!existing) {
      throw new Error('Mesa não encontrada.');
    }

    const newToken = `tab_${crypto.randomBytes(10).toString('hex')}`;
    await supabaseAdmin
      .from('restaurant_tables')
      .update({ qr_code_token: newToken, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'TABLE_REGENERATE_TOKEN' as any,
      entity: 'restaurant_tables',
      entityId: id,
      metadata: { tableNumber: existing.tableNumber },
    });

    return newToken;
  }

  public async deleteTable(id: string, tenantId: string, actor: User): Promise<boolean> {
    const existing = await this.getTableById(id, tenantId);
    if (!existing) {
      throw new Error('Mesa não encontrada.');
    }

    if (existing.currentSessionId) {
      throw new Error('Não é possível excluir uma mesa com comanda aberta. Feche a conta antes de excluir.');
    }

    // Check if table has past session history (accounting integrity)
    const { data: sessionHistory } = await supabaseAdmin
      .from('restaurant_sessions')
      .select('id')
      .eq('table_id', id)
      .eq('tenant_id', tenantId)
      .limit(1);

    if (sessionHistory && sessionHistory.length > 0) {
      throw new Error(
        'Esta mesa possui histórico de comandas e consumo registrado. Para preservar a integridade fiscal e de auditoria, desative a mesa (inativa) em vez de excluí-la.'
      );
    }

    await supabaseAdmin
      .from('restaurant_tables')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'TABLE_DELETE' as any,
      entity: 'restaurant_tables',
      entityId: id,
      metadata: { tableNumber: existing.tableNumber },
    });

    return true;
  }

  // ==========================================
  // 2. PUBLIC TABLE LOOKUP & VALIDATION
  // ==========================================

  public async getPublicTableInfo(tenantSlug: string, tableToken: string): Promise<PublicTableInfoResponse> {
    const tenant = await repo.getTenantBySlug(tenantSlug);
    if (!tenant) {
      throw new Error('Estabelecimento não encontrado.');
    }

    const op = canTenantOperate(tenant.status);
    if (!op.canOperate) {
      throw new Error(op.blockedReason || 'Este restaurante não está atendendo no momento.');
    }

    const features = await repo.resolveTenantFeatures(tenant.id);
    if (!features.restaurant_tables && !features.products) {
      throw new Error('O módulo de catálogo digital para mesas não está ativo para este restaurante.');
    }

    const { data: table } = await supabaseAdmin
      .from('restaurant_tables')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('qr_code_token', tableToken)
      .single();

    if (!table) {
      throw new Error('Mesa não encontrada ou QR Code inválido. Por favor, solicite apoio ao garçom.');
    }

    if (!table.is_active) {
      throw new Error('Esta mesa está temporariamente desativada no momento.');
    }

    // Check active session
    let activeSessionData: any = null;
    const { data: session } = await supabaseAdmin
      .from('restaurant_sessions')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('table_id', table.id)
      .eq('status', 'open')
      .single();

    if (session) {
      const { data: orders } = await supabaseAdmin
        .from('restaurant_orders')
        .select('id, total, status')
        .eq('session_id', session.id)
        .eq('tenant_id', tenant.id);

      let total = 0;
      let count = 0;
      (orders || []).forEach((o: any) => {
        if (o.status !== 'cancelled') {
          total += Number(o.total || 0);
          count += 1;
        }
      });

      activeSessionData = {
        id: session.id,
        sessionCode: session.session_code,
        openedAt: session.opened_at,
        closingRequestedAt: session.closing_requested_at || null,
        totalAmount: Math.round(total * 100) / 100,
        ordersCount: count,
      };
    }

    return {
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        logoUrl: tenant.appearance?.logoUrl || (tenant as any).logoUrl || null,
        primaryColor: tenant.appearance?.primaryColor || '#1e293b',
        whatsapp: tenant.whatsapp,
        phone: tenant.phone,
      },
      table: {
        id: table.id,
        tableNumber: table.table_number,
        name: table.name || null,
        status: table.status,
        qrCodeToken: table.qr_code_token,
      },
      activeSession: activeSessionData,
    };
  }

  // ==========================================
  // 3. SESSIONS & CONSUMPTION ACCOUNT (COMANDAS)
  // ==========================================

  public async getOrCreateActiveSession(tenantId: string, tableId: string): Promise<RestaurantSession> {
    // 1. Check existing open session
    const { data: existing } = await supabaseAdmin
      .from('restaurant_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('table_id', tableId)
      .eq('status', 'open')
      .single();

    if (existing) {
      return {
        id: existing.id,
        tenantId: existing.tenant_id,
        tableId: existing.table_id,
        sessionCode: existing.session_code,
        status: existing.status,
        openedAt: existing.opened_at,
        closedAt: existing.closed_at || null,
        totalAmount: Number(existing.total_amount || 0),
        notes: existing.notes || null,
        createdAt: existing.created_at,
        updatedAt: existing.updated_at,
      };
    }

    // 2. Create new session atomically
    const now = new Date().toISOString();
    const sessionCode = `CMD-${Date.now().toString().slice(-6)}`;
    const newSession = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      table_id: tableId,
      session_code: sessionCode,
      status: 'open',
      opened_at: now,
      closed_at: null,
      total_amount: 0.0,
      notes: null,
      created_at: now,
      updated_at: now,
    };

    const { data: inserted, error } = await supabaseAdmin
      .from('restaurant_sessions')
      .insert(newSession)
      .select()
      .single();

    if (error || !inserted) {
      // If concurrent request opened a session first, retrieve that session
      if (error?.code === '23505' || String(error?.message).includes('uq_restaurant_sessions_open_table')) {
        const { data: concurrentExisting } = await supabaseAdmin
          .from('restaurant_sessions')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('table_id', tableId)
          .eq('status', 'open')
          .single();
        if (concurrentExisting) {
          return {
            id: concurrentExisting.id,
            tenantId: concurrentExisting.tenant_id,
            tableId: concurrentExisting.table_id,
            sessionCode: concurrentExisting.session_code,
            status: concurrentExisting.status,
            openedAt: concurrentExisting.opened_at,
            closedAt: concurrentExisting.closed_at || null,
            totalAmount: Number(concurrentExisting.total_amount || 0),
            notes: concurrentExisting.notes || null,
            createdAt: concurrentExisting.created_at,
            updatedAt: concurrentExisting.updated_at,
          };
        }
      }
      checkTableDbError(error, 'restaurant_sessions');
      throw new Error(`Falha ao abrir comanda da mesa: ${error?.message || 'Erro'}`);
    }

    // Mark table as occupied and associate session
    await supabaseAdmin
      .from('restaurant_tables')
      .update({
        status: 'occupied',
        current_session_id: inserted.id,
        updated_at: now,
      })
      .eq('id', tableId)
      .eq('tenant_id', tenantId);

    return {
      id: inserted.id,
      tenantId: inserted.tenant_id,
      tableId: inserted.table_id,
      sessionCode: inserted.session_code,
      status: inserted.status,
      openedAt: inserted.opened_at,
      closedAt: null,
      totalAmount: 0,
      notes: inserted.notes || null,
      createdAt: inserted.created_at,
      updatedAt: inserted.updated_at,
    };
  }

  public async getSessionDetails(tenantId: string, sessionId: string): Promise<RestaurantSession | null> {
    const { data: session } = await supabaseAdmin
      .from('restaurant_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('tenant_id', tenantId)
      .single();

    if (!session) return null;

    const { data: table } = await supabaseAdmin
      .from('restaurant_tables')
      .select('table_number, name, status')
      .eq('id', session.table_id)
      .eq('tenant_id', tenantId)
      .single();

    // Fetch orders with items
    const orders = await this.listOrders(tenantId, { sessionId });
    const validOrders = orders.filter((o) => o.status !== 'cancelled');
    const ordersSubtotal = validOrders.reduce((sum, o) => sum + o.total, 0);

    // Fetch session fees
    const { data: rawFees } = await supabaseAdmin
      .from('restaurant_session_fees')
      .select('*')
      .eq('session_id', sessionId)
      .eq('tenant_id', tenantId);

    const fees: RestaurantSessionFee[] = (rawFees || []).map((f: any) => {
      let calculated = Number(f.calculated_amount || 0);
      if (f.type === 'percentage') {
        calculated = Math.round((ordersSubtotal * (Number(f.rate_or_amount || 0) / 100)) * 100) / 100;
      } else {
        calculated = Number(f.rate_or_amount || 0);
      }
      return {
        id: f.id,
        sessionId: f.session_id,
        tenantId: f.tenant_id,
        feeTemplateId: f.fee_template_id || null,
        name: f.name,
        description: f.description || null,
        type: f.type,
        rateOrAmount: Number(f.rate_or_amount || 0),
        calculatedAmount: calculated,
        createdAt: f.created_at,
      };
    });

    const feesTotal = fees.reduce((sum, f) => sum + f.calculatedAmount, 0);
    const calculatedTotal = Math.round((ordersSubtotal + feesTotal) * 100) / 100;
    const finalTotal = session.status === 'closed' && session.total_amount !== undefined
      ? Number(session.total_amount)
      : calculatedTotal;

    return {
      id: session.id,
      tenantId: session.tenant_id,
      tableId: session.table_id,
      sessionCode: session.session_code,
      status: session.status,
      openedAt: session.opened_at,
      closedAt: session.closed_at || null,
      closingRequestedAt: session.closing_requested_at || null,
      paymentMethod: session.payment_method || null,
      paymentStatus: session.payment_status || null,
      closedByUserId: session.closed_by_user_id || null,
      ordersSubtotal: Math.round(ordersSubtotal * 100) / 100,
      feesTotal: Math.round(feesTotal * 100) / 100,
      totalAmount: finalTotal,
      notes: session.notes || null,
      tableNumber: table?.table_number,
      tableName: table?.name || null,
      orders,
      ordersCount: validOrders.length,
      fees,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    };
  }

  public async getActiveSessionForTable(tenantId: string, tableId: string): Promise<RestaurantSession | null> {
    const { data: session } = await supabaseAdmin
      .from('restaurant_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('table_id', tableId)
      .eq('status', 'open')
      .single();

    if (!session) return null;
    return this.getSessionDetails(tenantId, session.id);
  }

  public async requestSessionClosingFromTable(
    tenantSlug: string,
    tableToken: string
  ): Promise<RestaurantSession> {
    const tenant = await repo.getTenantBySlug(tenantSlug);
    if (!tenant) throw new Error('Estabelecimento não encontrado.');

    const op = canTenantOperate(tenant.status);
    if (!op.canOperate) throw new Error(op.blockedReason || 'Este restaurante não está atendendo no momento.');

    const { data: table } = await supabaseAdmin
      .from('restaurant_tables')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('qr_code_token', tableToken)
      .single();

    if (!table || !table.is_active) {
      throw new Error('Mesa não encontrada ou inativa.');
    }

    // Try RPC procedure if available
    if (typeof supabaseAdmin.rpc === 'function') {
      try {
        const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('request_session_closing', {
          p_tenant_id: tenant.id,
          p_table_id: table.id,
          p_qr_code_token: tableToken,
        });

        if (!rpcErr && rpcData && rpcData.session_id) {
          const fullSession = await this.getSessionDetails(tenant.id, rpcData.session_id);
          return fullSession!;
        }
      } catch (e) {
        // Fallback below
      }
    }

    const { data: session } = await supabaseAdmin
      .from('restaurant_sessions')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('table_id', table.id)
      .eq('status', 'open')
      .single();

    if (!session) {
      throw new Error('Nenhuma comanda aberta para esta mesa.');
    }

    const now = new Date().toISOString();

    // Check if restaurant configured default fees and apply them if not already present
    const { data: defaultFees } = await supabaseAdmin
      .from('restaurant_fee_templates')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .eq('is_default', true);

    if (defaultFees && defaultFees.length > 0) {
      const { data: existingSessionFees } = await supabaseAdmin
        .from('restaurant_session_fees')
        .select('name, fee_template_id')
        .eq('session_id', session.id);

      const existingNames = new Set((existingSessionFees || []).map((f: any) => f.name));
      const existingTemplateIds = new Set((existingSessionFees || []).map((f: any) => f.fee_template_id).filter(Boolean));

      for (const df of defaultFees) {
        if (!existingNames.has(df.name) && !existingTemplateIds.has(df.id)) {
          await supabaseAdmin.from('restaurant_session_fees').insert({
            id: crypto.randomUUID(),
            tenant_id: tenant.id,
            session_id: session.id,
            fee_template_id: df.id,
            name: df.name,
            description: df.description,
            type: df.type,
            rate_or_amount: df.value,
            calculated_amount: df.type === 'fixed' ? df.value : 0,
            created_at: now,
          });
        }
      }
    }

    // Mark session closing requested and table status as closing (do not overwrite if already requested)
    const closingTime = session.closing_requested_at || now;
    await supabaseAdmin
      .from('restaurant_sessions')
      .update({
        closing_requested_at: closingTime,
        updated_at: now,
      })
      .eq('id', session.id);

    await supabaseAdmin
      .from('restaurant_tables')
      .update({
        status: 'closing',
        updated_at: now,
      })
      .eq('id', table.id);

    const fullSession = await this.getSessionDetails(tenant.id, session.id);
    return fullSession!;
  }

  public async cancelSessionClosing(
    tenantId: string,
    tableId: string,
    actor: User
  ): Promise<RestaurantSession> {
    if (actor.role === 'PROFESSIONAL') {
      throw new Error('Acesso restrito: profissionais não possuem permissão para reabrir comandas.');
    }
    if (actor.role !== 'SUPER_ADMIN' && actor.tenantId !== tenantId) {
      throw new Error('Acesso negado: o usuário não pertence a este estabelecimento.');
    }

    const { data: session } = await supabaseAdmin
      .from('restaurant_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('table_id', tableId)
      .eq('status', 'open')
      .single();

    if (!session) {
      throw new Error('Nenhuma comanda aberta para esta mesa.');
    }

    const now = new Date().toISOString();

    await supabaseAdmin
      .from('restaurant_sessions')
      .update({
        closing_requested_at: null,
        updated_at: now,
      })
      .eq('id', session.id);

    await supabaseAdmin
      .from('restaurant_tables')
      .update({
        status: 'occupied',
        updated_at: now,
      })
      .eq('id', tableId);

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'TABLE_SESSION_REOPEN' as any,
      entity: 'restaurant_sessions',
      entityId: session.id,
      metadata: { tableId },
    });

    const fullSession = await this.getSessionDetails(tenantId, session.id);
    return fullSession!;
  }

  public async closeSession(
    tenantId: string,
    tableId: string,
    actor: User,
    notes?: string,
    paymentMethod?: string
  ): Promise<{ session: RestaurantSession; totalAmount: number }> {
    // 0. Strict Authorization: Professionals cannot close restaurant sessions
    if (actor.role === 'PROFESSIONAL') {
      throw new Error('Acesso restrito: profissionais não possuem permissão para encerrar comandas.');
    }
    if (actor.role !== 'SUPER_ADMIN' && actor.tenantId !== tenantId) {
      throw new Error('Acesso negado: o usuário não pertence a este estabelecimento.');
    }

    const method = paymentMethod?.trim() || 'Cartão';

    // 1. Tenta a função transacional atômica (RPC) no PostgreSQL se disponível
    if (typeof supabaseAdmin.rpc === 'function') {
      try {
        const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('close_restaurant_session', {
          p_tenant_id: tenantId,
          p_table_id: tableId,
          p_notes: notes?.trim() || null,
          p_payment_method: method,
          p_closed_by_user_id: actor.id,
        });

        if (!rpcErr && rpcData && rpcData.session_id) {
          const finalTotal = Number(rpcData.total_amount || 0);
          await repo.logAudit({
            actorUserId: actor.id,
            actorUserName: actor.name,
            tenantId,
            action: 'TABLE_SESSION_CLOSE' as any,
            entity: 'restaurant_sessions',
            entityId: rpcData.session_id,
            metadata: { tableId, totalAmount: finalTotal, paymentMethod: method },
          });

          const fullSession = await this.getSessionDetails(tenantId, rpcData.session_id);
          return { session: fullSession!, totalAmount: finalTotal };
        } else if (rpcErr) {
          // Se for erro de validação/permissão, repassa diretamente
          if (rpcErr.message && (rpcErr.message.includes('Acesso negado') || rpcErr.message.includes('Não autorizado') || rpcErr.message.includes('Inconsistência'))) {
            throw new Error(rpcErr.message);
          }
        }
      } catch (e: any) {
        if (e.message && (e.message.includes('Acesso negado') || e.message.includes('Não autorizado') || e.message.includes('Inconsistência'))) {
          throw e;
        }
        // Fallback para sequência se RPC não existir no banco
      }
    }

    // 2. Fallback Transacional em Node.js com Validações Estritas
    const { data: table } = await supabaseAdmin
      .from('restaurant_tables')
      .select('*')
      .eq('id', tableId)
      .eq('tenant_id', tenantId)
      .single();

    if (!table) {
      throw new Error('Mesa não encontrada para este estabelecimento.');
    }

    const { data: session } = await supabaseAdmin
      .from('restaurant_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('table_id', tableId)
      .eq('status', 'open')
      .single();

    if (!session) {
      throw new Error('Nenhuma comanda aberta para esta mesa.');
    }

    // Integridade: Mesa não pode ser liberada se já estiver vinculada a outra sessão
    if (table.current_session_id && table.current_session_id !== session.id) {
      throw new Error('Inconsistência de integridade: a mesa está vinculada a outra comanda.');
    }

    const now = new Date().toISOString();

    // 3. Finaliza pedidos que ainda estavam em preparação ou não entregues
    const { data: activeOrders } = await supabaseAdmin
      .from('restaurant_orders')
      .select('id, status')
      .eq('session_id', session.id)
      .eq('tenant_id', tenantId);

    for (const ao of activeOrders || []) {
      if (['received', 'confirmed', 'preparing', 'ready'].includes(ao.status)) {
        await supabaseAdmin
          .from('restaurant_orders')
          .update({ status: 'delivered', updated_at: now })
          .eq('id', ao.id);

        await supabaseAdmin.from('restaurant_order_status_history').insert({
          id: crypto.randomUUID(),
          order_id: ao.id,
          tenant_id: tenantId,
          status: 'delivered',
          notes: 'Pedido concluído automaticamente no encerramento da comanda.',
          changed_by: actor.name,
          created_at: now,
        });
      }
    }

    // 4. Calcula subtotal de pedidos válidos (estritamente desconsiderando cancelados)
    const { data: orders } = await supabaseAdmin
      .from('restaurant_orders')
      .select('total, status')
      .eq('session_id', session.id)
      .eq('tenant_id', tenantId);

    let ordersSubtotal = 0;
    (orders || []).forEach((o: any) => {
      if (o.status !== 'cancelled') {
        ordersSubtotal += Number(o.total || 0);
      }
    });
    ordersSubtotal = Math.round(ordersSubtotal * 100) / 100;

    // 5. Calcula e consolida taxas adicionais
    const { data: fees } = await supabaseAdmin
      .from('restaurant_session_fees')
      .select('*')
      .eq('session_id', session.id)
      .eq('tenant_id', tenantId);

    let feesTotal = 0;
    for (const f of fees || []) {
      let feeAmt = Number(f.rate_or_amount || 0);
      if (f.type === 'percentage') {
        feeAmt = Math.round((ordersSubtotal * (feeAmt / 100)) * 100) / 100;
      }
      feesTotal += feeAmt;
      await supabaseAdmin
        .from('restaurant_session_fees')
        .update({ calculated_amount: feeAmt })
        .eq('id', f.id);
    }
    feesTotal = Math.round(feesTotal * 100) / 100;

    const finalTotal = Math.round((ordersSubtotal + feesTotal) * 100) / 100;

    // 6. Encerra a comanda registrando método de pagamento e quitação (payment_status: 'paid')
    const { error: closeErr } = await supabaseAdmin
      .from('restaurant_sessions')
      .update({
        status: 'closed',
        closed_at: now,
        orders_subtotal: ordersSubtotal,
        fees_total: feesTotal,
        total_amount: finalTotal,
        payment_method: method,
        payment_status: 'paid',
        closed_by_user_id: actor.id,
        notes: notes?.trim() || session.notes,
        updated_at: now,
      })
      .eq('id', session.id)
      .eq('tenant_id', tenantId);

    if (closeErr) {
      checkTableDbError(closeErr, 'restaurant_sessions');
      throw new Error(`Erro ao fechar comanda: ${closeErr.message}`);
    }

    // 7. Libera a mesa apenas se ainda apontar para esta sessão
    await supabaseAdmin
      .from('restaurant_tables')
      .update({
        status: 'available',
        current_session_id: null,
        updated_at: now,
      })
      .eq('id', tableId)
      .eq('tenant_id', tenantId)
      .eq('current_session_id', session.id);

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'TABLE_SESSION_CLOSE' as any,
      entity: 'restaurant_sessions',
      entityId: session.id,
      metadata: { tableId, totalAmount: finalTotal, paymentMethod: method },
    });

    const fullSession = await this.getSessionDetails(tenantId, session.id);
    return { session: fullSession!, totalAmount: finalTotal };
  }

  // ==========================================
  // 3B. RESTAURANT FEES MANAGEMENT
  // ==========================================

  public async listFeeTemplates(tenantId: string): Promise<RestaurantFeeTemplate[]> {
    const { data, error } = await supabaseAdmin
      .from('restaurant_fee_templates')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error) {
      checkTableDbError(error, 'restaurant_fee_templates');
    }

    return (data || []).map((t: any) => ({
      id: t.id,
      tenantId: t.tenant_id,
      name: t.name,
      description: t.description || null,
      type: t.type,
      value: Number(t.value || 0),
      isActive: t.is_active !== false,
      isDefault: t.is_default === true,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));
  }

  public async createFeeTemplate(
    tenantId: string,
    payload: { name: string; description?: string; type: 'percentage' | 'fixed'; value: number; isActive?: boolean; isDefault?: boolean },
    actor: User
  ): Promise<RestaurantFeeTemplate> {
    const name = payload.name?.trim();
    if (!name) throw new Error('O nome da taxa é obrigatório.');
    if (isNaN(payload.value) || payload.value < 0) throw new Error('O valor ou percentual da taxa deve ser maior ou igual a zero.');

    const now = new Date().toISOString();
    const newRecord = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      name,
      description: payload.description?.trim() || null,
      type: payload.type === 'fixed' ? 'fixed' : 'percentage',
      value: Number(payload.value),
      is_active: payload.isActive !== false,
      is_default: payload.isDefault === true,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabaseAdmin
      .from('restaurant_fee_templates')
      .insert(newRecord)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Erro ao cadastrar taxa: ${error?.message || 'Falha na gravação'}`);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'FEE_TEMPLATE_CREATE' as any,
      entity: 'restaurant_fee_templates',
      entityId: data.id,
      metadata: { name, type: data.type, value: data.value },
    });

    return {
      id: data.id,
      tenantId: data.tenant_id,
      name: data.name,
      description: data.description,
      type: data.type,
      value: Number(data.value),
      isActive: data.is_active,
      isDefault: data.is_default,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  public async updateFeeTemplate(
    id: string,
    tenantId: string,
    payload: Partial<RestaurantFeeTemplate>,
    actor: User
  ): Promise<RestaurantFeeTemplate> {
    const patch: any = { updated_at: new Date().toISOString() };
    if (payload.name !== undefined) patch.name = payload.name.trim();
    if (payload.description !== undefined) patch.description = payload.description?.trim() || null;
    if (payload.type !== undefined) patch.type = payload.type;
    if (payload.value !== undefined) patch.value = Number(payload.value);
    if (payload.isActive !== undefined) patch.is_active = payload.isActive;
    if (payload.isDefault !== undefined) patch.is_default = payload.isDefault;

    const { data, error } = await supabaseAdmin
      .from('restaurant_fee_templates')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Erro ao atualizar taxa: ${error?.message || 'Falha na gravação'}`);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'FEE_TEMPLATE_UPDATE' as any,
      entity: 'restaurant_fee_templates',
      entityId: id,
      metadata: patch,
    });

    return {
      id: data.id,
      tenantId: data.tenant_id,
      name: data.name,
      description: data.description,
      type: data.type,
      value: Number(data.value),
      isActive: data.is_active,
      isDefault: data.is_default,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  public async deleteFeeTemplate(id: string, tenantId: string, actor: User): Promise<boolean> {
    await supabaseAdmin
      .from('restaurant_fee_templates')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'FEE_TEMPLATE_DELETE' as any,
      entity: 'restaurant_fee_templates',
      entityId: id,
      metadata: {},
    });

    return true;
  }

  public async getSessionFees(tenantId: string, sessionId: string): Promise<RestaurantSessionFee[]> {
    const { data } = await supabaseAdmin
      .from('restaurant_session_fees')
      .select('*')
      .eq('session_id', sessionId)
      .eq('tenant_id', tenantId);

    return (data || []).map((f: any) => ({
      id: f.id,
      sessionId: f.session_id,
      tenantId: f.tenant_id,
      feeTemplateId: f.fee_template_id || null,
      name: f.name,
      description: f.description || null,
      type: f.type,
      rateOrAmount: Number(f.rate_or_amount || 0),
      calculatedAmount: Number(f.calculated_amount || 0),
      createdAt: f.created_at,
    }));
  }

  public async addFeeToSession(
    tenantId: string,
    sessionId: string,
    payload: AddSessionFeePayload,
    actor?: User
  ): Promise<RestaurantSessionFee> {
    const name = payload.name?.trim();
    if (!name) throw new Error('O nome da taxa é obrigatório.');

    // Check if duplicate fee already on session
    const { data: existing } = await supabaseAdmin
      .from('restaurant_session_fees')
      .select('id')
      .eq('session_id', sessionId)
      .eq('name', name)
      .single();

    if (existing) {
      throw new Error(`A taxa "${name}" já foi adicionada a esta comanda.`);
    }

    // Get session orders subtotal to calculate initial calculated amount
    const session = await this.getSessionDetails(tenantId, sessionId);
    if (!session || session.status === 'closed') {
      throw new Error('Comanda não encontrada ou já encerrada.');
    }

    const subtotal = session.ordersSubtotal || 0;
    const rateOrAmount = Number(payload.rateOrAmount);
    const calculatedAmount = payload.type === 'percentage'
      ? Math.round((subtotal * (rateOrAmount / 100)) * 100) / 100
      : rateOrAmount;

    const now = new Date().toISOString();
    const newFee = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      session_id: sessionId,
      fee_template_id: payload.feeTemplateId || null,
      name,
      description: payload.description?.trim() || null,
      type: payload.type,
      rate_or_amount: rateOrAmount,
      calculated_amount: calculatedAmount,
      created_at: now,
    };

    const { data: inserted, error } = await supabaseAdmin
      .from('restaurant_session_fees')
      .insert(newFee)
      .select()
      .single();

    if (error || !inserted) {
      throw new Error(`Erro ao lançar taxa na comanda: ${error?.message || 'Erro'}`);
    }

    if (actor) {
      await repo.logAudit({
        actorUserId: actor.id,
        actorUserName: actor.name,
        tenantId,
        action: 'SESSION_FEE_ADD' as any,
        entity: 'restaurant_session_fees',
        entityId: inserted.id,
        metadata: { sessionId, name, calculatedAmount },
      });
    }

    return {
      id: inserted.id,
      sessionId: inserted.session_id,
      tenantId: inserted.tenant_id,
      feeTemplateId: inserted.fee_template_id,
      name: inserted.name,
      description: inserted.description,
      type: inserted.type,
      rateOrAmount: Number(inserted.rate_or_amount),
      calculatedAmount: Number(inserted.calculated_amount),
      createdAt: inserted.created_at,
    };
  }

  public async removeFeeFromSession(
    tenantId: string,
    sessionId: string,
    feeId: string,
    actor?: User
  ): Promise<boolean> {
    await supabaseAdmin
      .from('restaurant_session_fees')
      .delete()
      .eq('id', feeId)
      .eq('session_id', sessionId)
      .eq('tenant_id', tenantId);

    if (actor) {
      await repo.logAudit({
        actorUserId: actor.id,
        actorUserName: actor.name,
        tenantId,
        action: 'SESSION_FEE_REMOVE' as any,
        entity: 'restaurant_session_fees',
        entityId: feeId,
        metadata: { sessionId },
      });
    }

    return true;
  }

  // ==========================================
  // 4. ORDERS CREATION & MANAGEMENT
  // ==========================================

  public async createOrderFromTable(
    payload: CreateTableOrderPayload,
    clientIp: string
  ): Promise<RestaurantOrder> {
    // 1. Rate limiting check (max 10 orders per minute per IP)
    const rateKey = `table_order_${clientIp}_${payload.tableToken}`;
    const nowMs = Date.now();
    const rateEntry = tableRateLimitMap.get(rateKey) || { count: 0, resetAt: nowMs + 60000 };

    if (nowMs > rateEntry.resetAt) {
      rateEntry.count = 0;
      rateEntry.resetAt = nowMs + 60000;
    }

    rateEntry.count++;
    tableRateLimitMap.set(rateKey, rateEntry);

    if (rateEntry.count > 15) {
      throw new Error('Muitos pedidos enviados em pouco tempo. Por favor, aguarde um minuto antes de enviar novamente.');
    }

    // 2. Validate tenant & table
    const tenant = await repo.getTenantBySlug(payload.tenantSlug);
    if (!tenant) {
      throw new Error('Estabelecimento não encontrado.');
    }

    const op = canTenantOperate(tenant.status);
    if (!op.canOperate) {
      throw new Error(op.blockedReason || 'Este restaurante não está recebendo pedidos no momento.');
    }

    const { data: table } = await supabaseAdmin
      .from('restaurant_tables')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('qr_code_token', payload.tableToken)
      .single();

    if (!table || !table.is_active) {
      throw new Error('Mesa não encontrada ou temporariamente inativa.');
    }

    // 3. Idempotency Key check to prevent double click duplicates
    if (payload.idempotencyKey) {
      const { data: existingOrder } = await supabaseAdmin
        .from('restaurant_orders')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('idempotency_key', payload.idempotencyKey)
        .single();

      if (existingOrder) {
        const fullExisting = await this.getOrderById(tenant.id, existingOrder.id);
        if (fullExisting) return fullExisting;
      }
    }

    // 4. Validate items against actual database products (NEVER trust prices from frontend)
    if (!payload.items || payload.items.length === 0) {
      throw new Error('Por favor, adicione ao menos um produto ao pedido.');
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

    let calculatedSubtotal = 0;
    const validatedItems: Array<{
      productId: string;
      variantId?: string | null;
      productName: string;
      variantName?: string | null;
      unitPrice: number;
      quantity: number;
      subtotal: number;
      notes?: string | null;
    }> = [];

    for (const item of payload.items) {
      const product = productMap.get(item.productId);
      if (!product || !product.is_active) {
        throw new Error(`O produto "${product?.name || 'selecionado'}" não está disponível no cardápio.`);
      }

      if (product.price_on_request) {
        throw new Error(`O produto "${product.name}" requer consulta direta ao garçom.`);
      }

      // Check weekly availability for table channel
      const currentDay = getCurrentDayOfWeek();
      if (!isProductAvailableOnDay(product, currentDay, 'table')) {
        throw new Error(
          `Este produto não está disponível para pedidos neste dia. O produto "${product.name}" não está disponível para pedidos na mesa hoje (${getDayName(currentDay)}). Atualize o cardápio para consultar as opções disponíveis.`
        );
      }

      let variant: any = null;
      if (item.variantId) {
        variant = variantMap.get(item.variantId);
        if (!variant || !variant.is_active || variant.product_id !== product.id) {
          throw new Error(`A variação escolhida para "${product.name}" não está mais disponível.`);
        }
      }

      const basePrice =
        variant?.price !== null && variant?.price !== undefined
          ? Number(variant.price)
          : Number(product.price);

      const promoPrice =
        variant?.promotional_price !== null && variant?.promotional_price !== undefined
          ? Number(variant.promotional_price)
          : product.promotional_price !== null && product.promotional_price !== undefined
          ? Number(product.promotional_price)
          : null;

      const hasDiscount = promoPrice !== null && promoPrice < basePrice;
      const unitPrice = hasDiscount && promoPrice !== null ? promoPrice : basePrice;

      const qty = Math.max(1, Math.min(99, Math.floor(Number(item.quantity || 1))));

      // Stock check
      const trackStock = variant ? !!variant.track_stock : !!product.track_stock;
      const allowOutOfStock = product.allow_out_of_stock !== false;
      const currentStock = variant ? Number(variant.stock_quantity || 0) : Number(product.stock_quantity || 0);

      if (trackStock && !allowOutOfStock && currentStock < qty) {
        throw new Error(`Estoque insuficiente para "${product.name}". Temos apenas ${currentStock} unidade(s) disponível(is).`);
      }

      const itemSubtotal = Math.round(unitPrice * qty * 100) / 100;
      calculatedSubtotal += itemSubtotal;

      validatedItems.push({
        productId: product.id,
        variantId: variant?.id || null,
        productName: product.name,
        variantName: variant?.name || null,
        unitPrice,
        quantity: qty,
        subtotal: itemSubtotal,
        notes: item.notes?.trim() || null,
      });
    }

    calculatedSubtotal = Math.round(calculatedSubtotal * 100) / 100;

    // 5. Ensure single active session for table
    const activeSession = await this.getOrCreateActiveSession(tenant.id, table.id);

    // 6. Generate order number for tenant atomically
    const { data: latestOrder, error: numErr } = await supabaseAdmin
      .from('restaurant_orders')
      .select('order_number')
      .eq('tenant_id', tenant.id)
      .order('order_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (numErr && numErr.code !== 'PGRST116') {
      checkTableDbError(numErr, 'restaurant_orders');
    }

    const orderNumber = latestOrder?.order_number ? Number(latestOrder.order_number) + 1 : 1001;
    const now = new Date().toISOString();
    const orderId = crypto.randomUUID();

    const orderRecord = {
      id: orderId,
      tenant_id: tenant.id,
      table_id: table.id,
      session_id: activeSession.id,
      order_number: orderNumber,
      customer_name: payload.customerName?.trim() || null,
      subtotal: calculatedSubtotal,
      total: calculatedSubtotal,
      status: 'received',
      notes: payload.notes?.trim() || null,
      idempotency_key: payload.idempotencyKey || null,
      created_at: now,
      updated_at: now,
    };

    let insertedOrder: any = null;
    let attempts = 0;
    let currentOrderNumber = orderNumber;

    while (attempts < 3) {
      attempts++;
      // Na primeira tentativa, omite order_number para que a trigger atômica do PostgreSQL
      // assign_restaurant_order_number() incremente o contador com bloqueio de linha.
      // Caso a tabela exija ou ocorra colisão, utiliza a sequência calculada.
      if (attempts === 1) {
        delete (orderRecord as any).order_number;
      } else {
        (orderRecord as any).order_number = currentOrderNumber;
      }

      const { data: ins, error: insErr } = await supabaseAdmin
        .from('restaurant_orders')
        .insert(orderRecord)
        .select()
        .single();

      if (!insErr && ins) {
        insertedOrder = ins;
        break;
      }

      // 1. Check if concurrent request with same idempotency key succeeded
      if (payload.idempotencyKey) {
        const { data: concurrentOrder } = await supabaseAdmin
          .from('restaurant_orders')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('idempotency_key', payload.idempotencyKey)
          .single();

        if (concurrentOrder) {
          const fullExisting = await this.getOrderById(tenant.id, concurrentOrder.id);
          if (fullExisting) return fullExisting;
        }
      }

      // 2. If collision was on order_number under high concurrency, increment and retry
      if (insErr?.code === '23505' && (String(insErr.message).includes('order_number') || String(insErr.message).includes('uq_restaurant_orders_tenant_number'))) {
        const { data: retryLatest } = await supabaseAdmin
          .from('restaurant_orders')
          .select('order_number')
          .eq('tenant_id', tenant.id)
          .order('order_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        currentOrderNumber = retryLatest?.order_number ? Number(retryLatest.order_number) + 1 : currentOrderNumber + 1;
        continue;
      }

      checkTableDbError(insErr, 'restaurant_orders');
      throw new Error(`Falha ao registrar pedido: ${insErr?.message || 'Erro'}`);
    }

    if (!insertedOrder) {
      throw new Error('Falha ao registrar pedido devido a conflito de concorrência.');
    }

    // Insert items
    const itemsToInsert = validatedItems.map((i) => ({
      id: crypto.randomUUID(),
      order_id: orderId,
      tenant_id: tenant.id,
      product_id: i.productId,
      variant_id: i.variantId,
      product_name: i.productName,
      variant_name: i.variantName,
      unit_price: i.unitPrice,
      quantity: i.quantity,
      subtotal: i.subtotal,
      notes: i.notes,
      created_at: now,
    }));

    const { error: itemsErr } = await supabaseAdmin.from('restaurant_order_items').insert(itemsToInsert);
    if (itemsErr) {
      checkTableDbError(itemsErr, 'restaurant_order_items');
    }

    // Insert history
    await supabaseAdmin.from('restaurant_order_status_history').insert({
      id: crypto.randomUUID(),
      order_id: orderId,
      tenant_id: tenant.id,
      status: 'received',
      notes: 'Pedido enviado pelo cliente na mesa.',
      changed_by: payload.customerName ? `Cliente (${payload.customerName})` : 'Cliente (Mesa)',
      created_at: now,
    });

    // If table was in 'closing' status, revert to 'occupied' and clear closing_requested_at
    // because customer decided to order more items
    if (table.status === 'closing') {
      await supabaseAdmin
        .from('restaurant_tables')
        .update({ status: 'occupied', updated_at: now })
        .eq('id', table.id);

      await supabaseAdmin
        .from('restaurant_sessions')
        .update({ closing_requested_at: null, updated_at: now })
        .eq('id', activeSession.id);
    }

    // Update session subtotal by summing all active non-cancelled orders of this session
    const { data: sessionOrders } = await supabaseAdmin
      .from('restaurant_orders')
      .select('total, status')
      .eq('session_id', activeSession.id)
      .eq('tenant_id', tenant.id);

    let updatedOrdersSubtotal = 0;
    (sessionOrders || []).forEach((o: any) => {
      if (o.status !== 'cancelled') {
        updatedOrdersSubtotal += Number(o.total || 0);
      }
    });
    updatedOrdersSubtotal = Math.round(updatedOrdersSubtotal * 100) / 100;

    // Recalculate percentage fees based on updated orders subtotal
    const { data: sessionFees } = await supabaseAdmin
      .from('restaurant_session_fees')
      .select('*')
      .eq('session_id', activeSession.id)
      .eq('tenant_id', tenant.id);

    let updatedFeesTotal = 0;
    for (const f of sessionFees || []) {
      let feeAmt = Number(f.rate_or_amount || 0);
      if (f.type === 'percentage') {
        feeAmt = Math.round((updatedOrdersSubtotal * (feeAmt / 100)) * 100) / 100;
        await supabaseAdmin
          .from('restaurant_session_fees')
          .update({ calculated_amount: feeAmt })
          .eq('id', f.id);
      }
      updatedFeesTotal += feeAmt;
    }
    updatedFeesTotal = Math.round(updatedFeesTotal * 100) / 100;

    const finalSessionTotal = Math.round((updatedOrdersSubtotal + updatedFeesTotal) * 100) / 100;

    await supabaseAdmin
      .from('restaurant_sessions')
      .update({
        orders_subtotal: updatedOrdersSubtotal,
        fees_total: updatedFeesTotal,
        total_amount: finalSessionTotal,
        updated_at: now,
      })
      .eq('id', activeSession.id);

    return this.getOrderById(tenant.id, orderId) as Promise<RestaurantOrder>;
  }

  public async listOrders(
    tenantId: string,
    filters?: {
      status?: string;
      tableId?: string;
      sessionId?: string;
      date?: string;
      search?: string;
    }
  ): Promise<RestaurantOrder[]> {
    const { data: rawOrders } = await supabaseAdmin
      .from('restaurant_orders')
      .select('*')
      .eq('tenant_id', tenantId);

    let list = rawOrders || [];

    if (filters?.sessionId) {
      list = list.filter((o: any) => o.session_id === filters.sessionId);
    }
    if (filters?.tableId) {
      list = list.filter((o: any) => o.table_id === filters.tableId);
    }
    if (filters?.status && filters.status !== 'all') {
      list = list.filter((o: any) => o.status === filters.status);
    }
    if (filters?.date) {
      const filterDateStr = filters.date.slice(0, 10);
      list = list.filter((o: any) => o.created_at && o.created_at.slice(0, 10) === filterDateStr);
    }
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      list = list.filter(
        (o: any) =>
          String(o.order_number).includes(q) ||
          (o.customer_name && o.customer_name.toLowerCase().includes(q))
      );
    }

    // Sort by recent first
    list.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Fetch tables to enrich table_number & name
    const { data: tables } = await supabaseAdmin
      .from('restaurant_tables')
      .select('id, table_number, name')
      .eq('tenant_id', tenantId);

    const tableMap = new Map<string, any>((tables || []).map((t: any) => [t.id, t]));

    // Fetch items
    const orderIds = list.map((o: any) => o.id);
    const { data: items } = await supabaseAdmin
      .from('restaurant_order_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('order_id', orderIds);

    const itemsByOrder = new Map<string, RestaurantOrderItem[]>();
    (items || []).forEach((it: any) => {
      const oItems = itemsByOrder.get(it.order_id) || [];
      oItems.push({
        id: it.id,
        orderId: it.order_id,
        tenantId: it.tenant_id,
        productId: it.product_id,
        variantId: it.variant_id || null,
        productName: it.product_name,
        variantName: it.variant_name || null,
        unitPrice: Number(it.unit_price),
        quantity: Number(it.quantity),
        subtotal: Number(it.subtotal),
        notes: it.notes || null,
        createdAt: it.created_at,
      });
      itemsByOrder.set(it.order_id, oItems);
    });

    return list.map((o: any) => {
      const tableInfo = tableMap.get(o.table_id);
      return {
        id: o.id,
        tenantId: o.tenant_id,
        tableId: o.table_id,
        sessionId: o.session_id,
        orderNumber: o.order_number,
        customerName: o.customer_name || null,
        subtotal: Number(o.subtotal),
        total: Number(o.total),
        status: o.status as RestaurantOrderStatus,
        notes: o.notes || null,
        idempotencyKey: o.idempotency_key || null,
        items: itemsByOrder.get(o.id) || [],
        tableNumber: tableInfo?.table_number,
        tableName: tableInfo?.name || null,
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      };
    });
  }

  public async getOrderById(tenantId: string, orderId: string): Promise<RestaurantOrder | null> {
    const { data: o } = await supabaseAdmin
      .from('restaurant_orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single();

    if (!o) return null;

    const { data: table } = await supabaseAdmin
      .from('restaurant_tables')
      .select('table_number, name')
      .eq('id', o.table_id)
      .eq('tenant_id', tenantId)
      .single();

    const { data: items } = await supabaseAdmin
      .from('restaurant_order_items')
      .select('*')
      .eq('order_id', orderId)
      .eq('tenant_id', tenantId);

    const { data: history } = await supabaseAdmin
      .from('restaurant_order_status_history')
      .select('*')
      .eq('order_id', orderId)
      .eq('tenant_id', tenantId);

    const formattedHistory: RestaurantOrderStatusHistory[] = (history || [])
      .map((h: any) => ({
        id: h.id,
        orderId: h.order_id,
        tenantId: h.tenant_id,
        status: h.status,
        notes: h.notes || null,
        changedBy: h.changed_by || 'system',
        createdAt: h.created_at,
      }))
      .sort((a: RestaurantOrderStatusHistory, b: RestaurantOrderStatusHistory) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return {
      id: o.id,
      tenantId: o.tenant_id,
      tableId: o.table_id,
      sessionId: o.session_id,
      orderNumber: o.order_number,
      customerName: o.customer_name || null,
      subtotal: Number(o.subtotal),
      total: Number(o.total),
      status: o.status as RestaurantOrderStatus,
      notes: o.notes || null,
      idempotencyKey: o.idempotency_key || null,
      items: (items || []).map((it: any) => ({
        id: it.id,
        orderId: it.order_id,
        tenantId: it.tenant_id,
        productId: it.product_id,
        variantId: it.variant_id || null,
        productName: it.product_name,
        variantName: it.variant_name || null,
        unitPrice: Number(it.unit_price),
        quantity: Number(it.quantity),
        subtotal: Number(it.subtotal),
        notes: it.notes || null,
        createdAt: it.created_at,
      })),
      history: formattedHistory,
      tableNumber: table?.table_number,
      tableName: table?.name || null,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
    };
  }

  public async updateOrderStatus(
    tenantId: string,
    orderId: string,
    status: RestaurantOrderStatus,
    actor: User,
    notes?: string
  ): Promise<RestaurantOrder> {
    const existing = await this.getOrderById(tenantId, orderId);
    if (!existing) {
      throw new Error('Pedido não encontrado.');
    }

    const previousStatus = existing.status;
    const now = new Date().toISOString();

    await supabaseAdmin
      .from('restaurant_orders')
      .update({ status, updated_at: now })
      .eq('id', orderId)
      .eq('tenant_id', tenantId);

    // Record in history
    await supabaseAdmin.from('restaurant_order_status_history').insert({
      id: crypto.randomUUID(),
      order_id: orderId,
      tenant_id: tenantId,
      status,
      notes: notes?.trim() || `Status alterado de ${previousStatus} para ${status}`,
      changed_by: actor.name || actor.email,
      created_at: now,
    });

    // If status changed to or from cancelled, recalculate session total
    if (status === 'cancelled' || previousStatus === 'cancelled') {
      const { data: sessionOrders } = await supabaseAdmin
        .from('restaurant_orders')
        .select('total, status')
        .eq('session_id', existing.sessionId)
        .eq('tenant_id', tenantId);

      let newTotal = 0;
      (sessionOrders || []).forEach((o: any) => {
        if (o.status !== 'cancelled') {
          newTotal += Number(o.total || 0);
        }
      });
      newTotal = Math.round(newTotal * 100) / 100;

      await supabaseAdmin
        .from('restaurant_sessions')
        .update({ total_amount: newTotal, updated_at: now })
        .eq('id', existing.sessionId)
        .eq('tenant_id', tenantId);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'ORDER_STATUS_UPDATE' as any,
      entity: 'restaurant_orders',
      entityId: orderId,
      metadata: { previousStatus, newStatus: status, notes },
    });

    return this.getOrderById(tenantId, orderId) as Promise<RestaurantOrder>;
  }

  public async cancelOrder(
    tenantId: string,
    orderId: string,
    actor: User,
    reason: string
  ): Promise<RestaurantOrder> {
    return this.updateOrderStatus(tenantId, orderId, 'cancelled', actor, reason || 'Pedido cancelado pelo estabelecimento.');
  }

  public async updateRestaurantOrder(
    tenantId: string,
    orderId: string,
    payload: {
      customerName?: string;
      notes?: string;
      items?: Array<{
        productId: string;
        variantId?: string | null;
        quantity: number;
        notes?: string;
      }>;
    },
    actor: User
  ): Promise<RestaurantOrder> {
    const existing = await this.getOrderById(tenantId, orderId);
    if (!existing) {
      throw new Error('Pedido não encontrado.');
    }

    const now = new Date().toISOString();
    let newSubtotal = existing.subtotal;
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
          throw new Error('Produto não encontrado ou inválido.');
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
          notes: itemInput.notes || null,
          createdAt: now,
        });
      }

      newSubtotal = Math.round(newSubtotal * 100) / 100;
    }

    const newTotal = newSubtotal;

    const orderUpdate: any = {
      subtotal: newSubtotal,
      total: newTotal,
      updated_at: now,
    };

    if (payload.customerName !== undefined) orderUpdate.customer_name = payload.customerName.trim() || null;
    if (payload.notes !== undefined) orderUpdate.notes = payload.notes?.trim() || null;

    await supabaseAdmin
      .from('restaurant_orders')
      .update(orderUpdate)
      .eq('id', orderId)
      .eq('tenant_id', tenantId);

    if (payload.items && Array.isArray(payload.items)) {
      await supabaseAdmin.from('restaurant_order_items').delete().eq('order_id', orderId).eq('tenant_id', tenantId);
      if (updatedItems.length > 0) {
        await supabaseAdmin.from('restaurant_order_items').insert(
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
            notes: i.notes,
            created_at: i.createdAt,
          }))
        );
      }
    }

    if (existing.sessionId) {
      const { data: sessionOrders } = await supabaseAdmin
        .from('restaurant_orders')
        .select('total, status')
        .eq('session_id', existing.sessionId)
        .eq('tenant_id', tenantId);

      let sessionTotal = 0;
      (sessionOrders || []).forEach((o: any) => {
        if (o.status !== 'cancelled') {
          sessionTotal += Number(o.total || 0);
        }
      });
      sessionTotal = Math.round(sessionTotal * 100) / 100;

      await supabaseAdmin
        .from('restaurant_sessions')
        .update({ total_amount: sessionTotal, updated_at: now })
        .eq('id', existing.sessionId)
        .eq('tenant_id', tenantId);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'RESTAURANT_ORDER_UPDATE' as any,
      entity: 'restaurant_orders',
      entityId: orderId,
      diff: { before: existing, after: { ...existing, ...orderUpdate } },
    });

    return (await this.getOrderById(tenantId, orderId))!;
  }

  public async deleteRestaurantOrder(tenantId: string, orderId: string, actor: User): Promise<boolean> {
    const existing = await this.getOrderById(tenantId, orderId);
    if (!existing) {
      throw new Error('Pedido não encontrado.');
    }

    await supabaseAdmin.from('restaurant_order_items').delete().eq('order_id', orderId).eq('tenant_id', tenantId);
    await supabaseAdmin.from('restaurant_order_status_history').delete().eq('order_id', orderId).eq('tenant_id', tenantId);

    const { error: delErr } = await supabaseAdmin
      .from('restaurant_orders')
      .delete()
      .eq('id', orderId)
      .eq('tenant_id', tenantId);

    if (delErr) {
      throw new Error(`Erro ao excluir pedido: ${delErr.message}`);
    }

    if (existing.sessionId) {
      const { data: sessionOrders } = await supabaseAdmin
        .from('restaurant_orders')
        .select('total, status')
        .eq('session_id', existing.sessionId)
        .eq('tenant_id', tenantId);

      let sessionTotal = 0;
      (sessionOrders || []).forEach((o: any) => {
        if (o.status !== 'cancelled') {
          sessionTotal += Number(o.total || 0);
        }
      });
      sessionTotal = Math.round(sessionTotal * 100) / 100;

      const now = new Date().toISOString();
      await supabaseAdmin
        .from('restaurant_sessions')
        .update({ total_amount: sessionTotal, updated_at: now })
        .eq('id', existing.sessionId)
        .eq('tenant_id', tenantId);
    }

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'RESTAURANT_ORDER_DELETE' as any,
      entity: 'restaurant_orders',
      entityId: orderId,
      metadata: { orderNumber: existing.orderNumber, tableNumber: existing.tableNumber },
    });

    return true;
  }

  // ==========================================
  // 5. RESTAURANT SUMMARY & KPIS
  // ==========================================

  public async getRestaurantSummary(tenantId: string): Promise<RestaurantSummary> {
    const tables = await this.listTables(tenantId);
    const available = tables.filter((t) => t.status === 'available').length;
    const occupied = tables.filter((t) => t.status === 'occupied').length;
    const closing = tables.filter((t) => t.status === 'closing').length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const orders = await this.listOrders(tenantId, { date: todayStr });

    const activeOrders = orders.filter((o) => o.status !== 'cancelled');
    const pendingOrders = orders.filter((o) => ['received', 'confirmed', 'preparing'].includes(o.status));
    const revenueToday = activeOrders.reduce((sum, o) => sum + o.total, 0);

    return {
      totalTables: tables.length,
      availableTables: available,
      occupiedTables: occupied,
      closingTables: closing,
      activeOrdersToday: activeOrders.length,
      ordersPendingAction: pendingOrders.length,
      totalRevenueToday: Math.round(revenueToday * 100) / 100,
    };
  }
}

export const restaurantRepo = new RestaurantRepository();
