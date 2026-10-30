import crypto from 'crypto';
import { supabaseAdmin } from '../supabaseAdmin.js';
import { repo } from '../db/repository.js';
import { User } from '../../src/types/saas.js';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  OrderStatus,
  OrderDeliveryAddress,
} from '../../src/types/order.js';
import {
  RESTAURANT_STATUS_LABELS,
  RestaurantOrderStatus,
} from '../../src/types/restaurant.js';
import {
  PeriodPreset,
  FinancialPaymentStatus,
  UnifiedFulfillmentType,
  OrderOriginChannel,
  PaymentTransactionEntry,
  OrderHistoryEvent,
  UnifiedOrder,
  AdvancedOrderFilterParams,
  PaginatedUnifiedOrdersResponse,
  EnrichedRestaurantTable,
  TableVisualOperationalState,
  TABLE_VISUAL_STATE_LABELS,
  FinancialDashboardKPIs,
  SalesEvolutionPoint,
  StatusDistributionItem,
  PaymentMethodDistributionItem,
  ModalityDistributionItem,
  TablePerformanceItem,
  TopProductItem,
  FinancialDashboardResponse,
  UNIFIED_FULFILLMENT_LABELS,
  ORDER_ORIGIN_LABELS,
  FINANCIAL_PAYMENT_STATUS_LABELS,
} from '../../src/types/analytics.js';

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

function round2(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Formats a Date or ISO timestamp into YYYY-MM-DD in America/Sao_Paulo timezone.
 */
export function toTimezoneDateKey(dateInput: Date | string, timeZone = DEFAULT_TIMEZONE): string {
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '';
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(d);
  } catch {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Resolves a PeriodPreset and optional custom start/end dates into YYYY-MM-DD bounds in America/Sao_Paulo.
 */
export function resolvePeriodBounds(
  preset: PeriodPreset = 'last_30_days',
  customStart?: string,
  customEnd?: string,
  timeZone = DEFAULT_TIMEZONE
): { startDate: string; endDate: string; label: string; preset: PeriodPreset } {
  const now = new Date();
  const todayStr = toTimezoneDateKey(now, timeZone);
  const [yStr, mStr, dStr] = todayStr.split('-');
  const year = Number(yStr);
  const month = Number(mStr); // 1-12
  const day = Number(dStr);

  const makeDateStr = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return dt.toISOString().slice(0, 10);
  };

  switch (preset) {
    case 'today': {
      return {
        preset: 'today',
        startDate: todayStr,
        endDate: todayStr,
        label: 'Hoje',
      };
    }
    case 'yesterday': {
      const yest = makeDateStr(year, month, day - 1);
      return {
        preset: 'yesterday',
        startDate: yest,
        endDate: yest,
        label: 'Ontem',
      };
    }
    case 'last_7_days': {
      const start = makeDateStr(year, month, day - 6);
      return {
        preset: 'last_7_days',
        startDate: start,
        endDate: todayStr,
        label: 'Últimos 7 dias',
      };
    }
    case 'last_30_days': {
      const start = makeDateStr(year, month, day - 29);
      return {
        preset: 'last_30_days',
        startDate: start,
        endDate: todayStr,
        label: 'Últimos 30 dias',
      };
    }
    case 'this_month': {
      const start = makeDateStr(year, month, 1);
      return {
        preset: 'this_month',
        startDate: start,
        endDate: todayStr,
        label: 'Este mês',
      };
    }
    case 'last_month': {
      const prevMonthDate = new Date(Date.UTC(year, month - 2, 1, 12, 0, 0));
      const lastDayPrevMonth = new Date(Date.UTC(year, month - 1, 0, 12, 0, 0));
      return {
        preset: 'last_month',
        startDate: prevMonthDate.toISOString().slice(0, 10),
        endDate: lastDayPrevMonth.toISOString().slice(0, 10),
        label: 'Mês anterior',
      };
    }
    case 'custom': {
      const s = customStart ? customStart.slice(0, 10) : makeDateStr(year, month, day - 29);
      const e = customEnd ? customEnd.slice(0, 10) : todayStr;
      const [startOrdered, endOrdered] = s <= e ? [s, e] : [e, s];
      return {
        preset: 'custom',
        startDate: startOrdered,
        endDate: endOrdered,
        label: `${startOrdered.split('-').reverse().join('/')} até ${endOrdered.split('-').reverse().join('/')}`,
      };
    }
    default: {
      const start = makeDateStr(year, month, day - 29);
      return {
        preset: 'last_30_days',
        startDate: start,
        endDate: todayStr,
        label: 'Últimos 30 dias',
      };
    }
  }
}

export interface LedgerRecord {
  discount?: number;
  paymentStatus?: FinancialPaymentStatus;
  paymentMethod?: string;
  paidAt?: string | null;
  originChannel?: OrderOriginChannel;
  payments?: PaymentTransactionEntry[];
  history?: OrderHistoryEvent[];
}

export interface TenantFinancialLedger {
  orders: Record<string, LedgerRecord>;
  sessions: Record<string, LedgerRecord>;
}

function normalizePaymentMethodLabel(rawMethod?: string | null): { key: string; label: string } {
  if (!rawMethod || !rawMethod.trim()) {
    return { key: 'UNSPECIFIED', label: 'A definir no fechamento' };
  }
  const upper = rawMethod.trim().toUpperCase();
  if (upper === 'PIX' || upper.includes('PIX')) {
    return { key: 'PIX', label: 'PIX' };
  }
  if (upper === 'CASH' || upper.includes('DINHEIRO')) {
    return { key: 'CASH', label: 'Dinheiro' };
  }
  if (
    upper === 'CREDIT_CARD_ON_DELIVERY' ||
    upper === 'CREDIT_CARD' ||
    upper.includes('CRÉDITO') ||
    upper.includes('CREDITO')
  ) {
    return { key: 'CREDIT_CARD', label: 'Cartão de Crédito' };
  }
  if (
    upper === 'DEBIT_CARD_ON_DELIVERY' ||
    upper === 'DEBIT_CARD' ||
    upper.includes('DÉBITO') ||
    upper.includes('DEBITO')
  ) {
    return { key: 'DEBIT_CARD', label: 'Cartão de Débito' };
  }
  if (upper === 'PAYMENT_ON_PICKUP' || upper.includes('BALCÃO') || upper.includes('BALCAO')) {
    return { key: 'PAYMENT_ON_PICKUP', label: 'Pagar no Balcão' };
  }
  if (upper.includes('VALE') || upper.includes('VR') || upper.includes('TICKET')) {
    return { key: 'VOUCHER', label: 'Vale Refeição' };
  }
  if ((PAYMENT_METHOD_LABELS as any)[rawMethod]) {
    return { key: rawMethod, label: (PAYMENT_METHOD_LABELS as any)[rawMethod] };
  }
  return { key: rawMethod.trim(), label: rawMethod.trim() };
}

function normalizeOperationalStatus(
  source: 'online' | 'table',
  status: string
): {
  normalized: UnifiedOrder['normalizedOperationalStatus'];
  label: string;
} {
  if (source === 'online') {
    const st = status as OrderStatus;
    const label = ORDER_STATUS_LABELS[st] || status;
    switch (st) {
      case 'NEW':
      case 'IN_SERVICE':
        return { normalized: 'NEW', label };
      case 'CONFIRMED':
        return { normalized: 'CONFIRMED', label };
      case 'PREPARING':
        return { normalized: 'PREPARING', label };
      case 'READY_FOR_PICKUP':
        return { normalized: 'READY', label };
      case 'OUT_FOR_DELIVERY':
        return { normalized: 'OUT_FOR_DELIVERY', label };
      case 'COMPLETED':
        return { normalized: 'COMPLETED', label };
      case 'CANCELLED':
        return { normalized: 'CANCELLED', label };
      default:
        return { normalized: 'NEW', label };
    }
  } else {
    const st = status as RestaurantOrderStatus;
    const label = RESTAURANT_STATUS_LABELS[st] || status;
    switch (st) {
      case 'received':
        return { normalized: 'NEW', label };
      case 'confirmed':
        return { normalized: 'CONFIRMED', label };
      case 'preparing':
        return { normalized: 'PREPARING', label };
      case 'ready':
        return { normalized: 'READY', label };
      case 'delivered':
        return { normalized: 'COMPLETED', label };
      case 'cancelled':
        return { normalized: 'CANCELLED', label };
      default:
        return { normalized: 'NEW', label };
    }
  }
}

export class RestaurantAnalyticsService {
  // =========================================================================
  // 1. PERSISTENT FINANCIAL LEDGER PER TENANT
  // =========================================================================

  public async getFinancialLedger(tenantId: string): Promise<TenantFinancialLedger> {
    try {
      const { data: siteRow } = await supabaseAdmin
        .from('sites')
        .select('draft_data')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const ledger = siteRow?.draft_data?.financialLedger;
      if (ledger && typeof ledger === 'object') {
        return {
          orders: ledger.orders && typeof ledger.orders === 'object' ? ledger.orders : {},
          sessions: ledger.sessions && typeof ledger.sessions === 'object' ? ledger.sessions : {},
        };
      }
    } catch {
      // Fallback to empty ledger
    }
    return { orders: {}, sessions: {} };
  }

  public async saveFinancialLedger(
    tenantId: string,
    patch: {
      orders?: Record<string, LedgerRecord>;
      sessions?: Record<string, LedgerRecord>;
    },
    overwrite = false
  ): Promise<TenantFinancialLedger> {
    const current = overwrite ? { orders: {}, sessions: {} } : await this.getFinancialLedger(tenantId);
    const merged: TenantFinancialLedger = {
      orders: { ...current.orders, ...(patch.orders || {}) },
      sessions: { ...current.sessions, ...(patch.sessions || {}) },
    };

    try {
      const { data: siteRow } = await supabaseAdmin
        .from('sites')
        .select('id, draft_data')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const now = new Date().toISOString();
      if (siteRow) {
        const draftData =
          siteRow.draft_data && typeof siteRow.draft_data === 'object'
            ? { ...siteRow.draft_data }
            : {};
        draftData.financialLedger = merged;
        await supabaseAdmin
          .from('sites')
          .update({ draft_data: draftData, updated_at: now })
          .eq('tenant_id', tenantId);
      } else {
        await supabaseAdmin.from('sites').insert({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          slug: `site-${tenantId.slice(0, 8)}`,
          status: 'draft',
          draft_data: { financialLedger: merged },
          created_at: now,
          updated_at: now,
        });
      }
    } catch (err) {
      console.error(`[AnalyticsService] Failed to save financialLedger for tenant ${tenantId}:`, err);
    }

    return merged;
  }

  // =========================================================================
  // 2. LOAD & RECONCILE ALL UNIFIED ORDERS FOR A TENANT
  // =========================================================================

  public async loadAllUnifiedOrdersForTenant(tenantId: string): Promise<UnifiedOrder[]> {
    const [
      { data: rawOnlineOrders },
      { data: rawOnlineItems },
      { data: rawOnlineAddresses },
      { data: rawTableOrders },
      { data: rawTableItems },
      { data: rawTableHistory },
      { data: rawSessions },
      { data: rawSessionFees },
      { data: rawTables },
      ledger,
    ] = await Promise.all([
      supabaseAdmin.from('orders').select('*').eq('tenant_id', tenantId),
      supabaseAdmin.from('order_items').select('*').eq('tenant_id', tenantId),
      supabaseAdmin.from('order_delivery_addresses').select('*').eq('tenant_id', tenantId),
      supabaseAdmin.from('restaurant_orders').select('*').eq('tenant_id', tenantId),
      supabaseAdmin.from('restaurant_order_items').select('*').eq('tenant_id', tenantId),
      supabaseAdmin.from('restaurant_order_status_history').select('*').eq('tenant_id', tenantId),
      supabaseAdmin.from('restaurant_sessions').select('*').eq('tenant_id', tenantId),
      supabaseAdmin.from('restaurant_session_fees').select('*').eq('tenant_id', tenantId),
      supabaseAdmin.from('restaurant_tables').select('*').eq('tenant_id', tenantId),
      this.getFinancialLedger(tenantId),
    ]);

    const unifiedList: UnifiedOrder[] = [];

    // Maps for Online Orders
    const onlineItemsByOrder = new Map<string, any[]>();
    (rawOnlineItems || []).forEach((it: any) => {
      const arr = onlineItemsByOrder.get(it.order_id) || [];
      arr.push(it);
      onlineItemsByOrder.set(it.order_id, arr);
    });

    const onlineAddrByOrder = new Map<string, any>();
    (rawOnlineAddresses || []).forEach((addr: any) => {
      onlineAddrByOrder.set(addr.order_id, addr);
    });

    // Process Online Orders
    for (const o of rawOnlineOrders || []) {
      const oItems = (onlineItemsByOrder.get(o.id) || []).map((it: any) => ({
        id: it.id,
        productId: it.product_id || null,
        variantId: it.variant_id || null,
        productName: it.product_name,
        variantName: it.variant_name || null,
        unitPrice: round2(Number(it.unit_price || 0)),
        quantity: Number(it.quantity || 1),
        subtotal: round2(Number(it.subtotal ?? Number(it.unit_price || 0) * Number(it.quantity || 1))),
        notes: null,
      }));

      const itemsSubtotal =
        oItems.length > 0
          ? round2(oItems.reduce((acc, i) => acc + i.subtotal, 0))
          : round2(Number(o.subtotal || 0));
      const deliveryFee = round2(Number(o.delivery_fee || 0));
      const serviceFee = 0;
      const grossTotal = round2(itemsSubtotal + deliveryFee + serviceFee);

      const orderLedger = ledger.orders[o.id] || {};
      const discount = round2(
        Math.min(
          grossTotal,
          Math.max(0, Number(orderLedger.discount ?? (o as any).discount ?? 0))
        )
      );
      const netTotal = round2(Math.max(0, grossTotal - discount));

      const isCancelled = o.status === 'CANCELLED';
      const opNorm = normalizeOperationalStatus('online', o.status);

      const payments: PaymentTransactionEntry[] = Array.isArray(orderLedger.payments)
        ? orderLedger.payments.map((p) => ({
            ...p,
            amount: round2(Number(p.amount || 0)),
          }))
        : [];

      let paymentStatus: FinancialPaymentStatus = 'pending';
      let paidAmount = 0;
      let paidAt: string | null = orderLedger.paidAt || (o as any).paid_at || null;
      let effectiveMethodRaw = orderLedger.paymentMethod || o.payment_method || 'PIX';

      if (isCancelled) {
        paymentStatus = 'cancelled';
        paidAmount = 0;
        paidAt = null;
      } else if (payments.length > 0) {
        const sumPayments = round2(payments.reduce((acc, p) => acc + p.amount, 0));
        if (sumPayments >= netTotal && netTotal > 0) {
          paymentStatus = 'paid';
          paidAmount = netTotal;
          paidAt = paidAt || payments[payments.length - 1].paidAt;
        } else if (sumPayments > 0) {
          paymentStatus = 'partial';
          paidAmount = round2(Math.min(netTotal, sumPayments));
          paidAt = paidAt || payments[payments.length - 1].paidAt;
        } else {
          paymentStatus = 'pending';
          paidAmount = 0;
        }
        effectiveMethodRaw = payments[payments.length - 1].paymentMethod || effectiveMethodRaw;
      } else if (orderLedger.paymentStatus) {
        paymentStatus = orderLedger.paymentStatus;
        if (paymentStatus === 'paid') {
          paidAmount = netTotal;
          paidAt = paidAt || o.updated_at || o.created_at;
          payments.push({
            id: `pay_${o.id}`,
            amount: netTotal,
            paymentMethod: effectiveMethodRaw,
            paidAt: paidAt!,
            notes: 'Pagamento integral confirmado',
          });
        } else {
          paidAmount = 0;
        }
      } else if (o.status === 'COMPLETED') {
        paymentStatus = 'paid';
        paidAmount = netTotal;
        paidAt = o.updated_at || o.created_at;
        payments.push({
          id: `pay_${o.id}`,
          amount: netTotal,
          paymentMethod: effectiveMethodRaw,
          paidAt: paidAt!,
          notes: 'Pagamento confirmado na conclusão do pedido',
        });
      } else {
        paymentStatus = 'pending';
        paidAmount = 0;
      }

      const pendingAmount = isCancelled ? 0 : round2(Math.max(0, netTotal - paidAmount));
      const pmNorm = normalizePaymentMethodLabel(effectiveMethodRaw);

      const rawAddr = onlineAddrByOrder.get(o.id);
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

      const history: OrderHistoryEvent[] = [
        {
          id: `create_${o.id}`,
          timestamp: o.created_at,
          type: 'creation',
          status: 'NEW',
          description: `Pedido #${o.order_number} criado via Catálogo Online (${
            o.fulfillment_type === 'delivery' ? 'Entrega' : 'Retirada'
          })`,
          actorName: o.customer_name,
        },
        ...(orderLedger.history || []),
      ];

      unifiedList.push({
        id: o.id,
        tenantId: o.tenant_id,
        source: 'online',
        originChannel: orderLedger.originChannel || 'online',
        originLabel: ORDER_ORIGIN_LABELS[orderLedger.originChannel || 'online'] || 'Catálogo Online',
        orderNumber: Number(o.order_number),
        formattedOrderNumber: `#${o.order_number}`,
        displayCode: `#${o.order_number}`,
        customerName: o.customer_name || 'Cliente',
        customerPhone: o.customer_phone || '',
        customerEmail: o.customer_email || null,
        fulfillmentType: o.fulfillment_type === 'delivery' ? 'delivery' : 'pickup',
        fulfillmentLabel: UNIFIED_FULFILLMENT_LABELS[o.fulfillment_type === 'delivery' ? 'delivery' : 'pickup'] || 'Entrega',
        tableId: null,
        tableNumber: null,
        tableName: null,
        sessionId: null,
        sessionCode: null,
        operationalStatus: o.status,
        rawStatus: o.status,
        normalizedOperationalStatus: opNorm.normalized,
        operationalStatusLabel: opNorm.label,
        paymentStatus,
        paymentStatusLabel: FINANCIAL_PAYMENT_STATUS_LABELS[paymentStatus],
        paymentMethod: pmNorm.key,
        paymentMethodLabel: pmNorm.label,
        paidAt,
        subtotal: itemsSubtotal,
        discount,
        deliveryFee,
        serviceFee: 0,
        grossTotal,
        total: netTotal,
        paidAmount,
        pendingAmount,
        changeFor: o.change_for !== null && o.change_for !== undefined ? Number(o.change_for) : null,
        notes: o.notes || null,
        itemsCount: oItems.reduce((acc, it) => acc + it.quantity, 0),
        items: oItems,
        deliveryAddress,
        payments,
        history,
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      });
    }

    // Maps for Table Orders & Sessions
    const tableMap = new Map<string, any>((rawTables || []).map((t: any) => [t.id, t]));
    const sessionMap = new Map<string, any>((rawSessions || []).map((s: any) => [s.id, s]));

    const tableItemsByOrder = new Map<string, any[]>();
    (rawTableItems || []).forEach((it: any) => {
      const arr = tableItemsByOrder.get(it.order_id) || [];
      arr.push(it);
      tableItemsByOrder.set(it.order_id, arr);
    });

    const tableHistoryByOrder = new Map<string, any[]>();
    (rawTableHistory || []).forEach((h: any) => {
      const arr = tableHistoryByOrder.get(h.order_id) || [];
      arr.push(h);
      tableHistoryByOrder.set(h.order_id, arr);
    });

    const feesBySession = new Map<string, any[]>();
    (rawSessionFees || []).forEach((f: any) => {
      const arr = feesBySession.get(f.session_id) || [];
      arr.push(f);
      feesBySession.set(f.session_id, arr);
    });

    // Group table orders by session_id so we can allocate session fees, discounts, and payments accurately without double counting
    const tableOrdersBySession = new Map<string, any[]>();
    for (const ro of rawTableOrders || []) {
      const sid = ro.session_id || `orphan_${ro.id}`;
      const arr = tableOrdersBySession.get(sid) || [];
      arr.push(ro);
      tableOrdersBySession.set(sid, arr);
    }

    for (const [sessionId, sessionOrders] of tableOrdersBySession.entries()) {
      const session = sessionMap.get(sessionId);
      const sessionLedger = ledger.sessions[sessionId] || {};
      const sFees = feesBySession.get(sessionId) || [];

      // Sort orders chronologically within session
      sessionOrders.sort(
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      // Compute each order's historical items subtotal
      const orderSubtotals = new Map<string, number>();
      let validSessionSubtotal = 0;
      const validOrders: any[] = [];

      for (const ro of sessionOrders) {
        const rawItems = tableItemsByOrder.get(ro.id) || [];
        const itemsSub =
          rawItems.length > 0
            ? round2(
                rawItems.reduce(
                  (acc: number, it: any) =>
                    acc + round2(Number(it.subtotal ?? Number(it.unit_price || 0) * Number(it.quantity || 1))),
                  0
                )
              )
            : round2(Number(ro.subtotal || ro.total || 0));
        orderSubtotals.set(ro.id, itemsSub);
        if (ro.status !== 'cancelled') {
          validSessionSubtotal = round2(validSessionSubtotal + itemsSub);
          validOrders.push(ro);
        }
      }

      // Compute session service fees
      let sessionServiceFeesTotal = 0;
      for (const f of sFees) {
        if (f.type === 'percentage') {
          sessionServiceFeesTotal += round2(
            validSessionSubtotal * (Number(f.rate_or_amount || 0) / 100)
          );
        } else {
          sessionServiceFeesTotal += round2(Number(f.rate_or_amount || f.calculated_amount || 0));
        }
      }
      sessionServiceFeesTotal = round2(sessionServiceFeesTotal);

      const sessionGrossTotal = round2(validSessionSubtotal + sessionServiceFeesTotal);
      const sessionDiscount = round2(
        Math.min(
          sessionGrossTotal,
          Math.max(0, Number(sessionLedger.discount ?? session?.discount_amount ?? 0))
        )
      );
      const sessionNetTotal = round2(Math.max(0, sessionGrossTotal - sessionDiscount));

      // Determine confirmed session payments
      const sessionPayments: PaymentTransactionEntry[] = Array.isArray(sessionLedger.payments)
        ? sessionLedger.payments.map((p) => ({
            ...p,
            amount: round2(Number(p.amount || 0)),
          }))
        : [];

      let sessionPaidAmount = round2(sessionPayments.reduce((acc, p) => acc + p.amount, 0));
      const isSessionClosedAndPaid =
        session &&
        session.status === 'closed' &&
        (session.payment_status === 'paid' || !session.payment_status);

      if (isSessionClosedAndPaid && sessionPaidAmount < sessionNetTotal) {
        const remainder = round2(sessionNetTotal - sessionPaidAmount);
        if (remainder > 0) {
          sessionPayments.push({
            id: `close_pay_${session.id}`,
            amount: remainder,
            paymentMethod: session.payment_method || sessionLedger.paymentMethod || 'Cartão de Crédito',
            paidAt: session.closed_at || session.updated_at || session.opened_at,
            notes: 'Quitação no fechamento da comanda',
          });
          sessionPaidAmount = sessionNetTotal;
        }
      } else if (sessionLedger.paymentStatus === 'paid' && sessionPaidAmount < sessionNetTotal) {
        const remainder = round2(sessionNetTotal - sessionPaidAmount);
        if (remainder > 0) {
          sessionPayments.push({
            id: `ledger_pay_${sessionId}`,
            amount: remainder,
            paymentMethod: sessionLedger.paymentMethod || session?.payment_method || 'PIX',
            paidAt: sessionLedger.paidAt || new Date().toISOString(),
            notes: 'Pagamento integral confirmado',
          });
          sessionPaidAmount = sessionNetTotal;
        }
      }

      sessionPaidAmount = round2(Math.min(sessionNetTotal, sessionPaidAmount));

      // Allocate sessionServiceFeesTotal, sessionDiscount, and sessionPaidAmount across validOrders
      let remainingFee = sessionServiceFeesTotal;
      let remainingDiscount = sessionDiscount;
      let remainingPaid = sessionPaidAmount;

      for (let idx = 0; idx < sessionOrders.length; idx++) {
        const ro = sessionOrders[idx];
        const isCancelled = ro.status === 'cancelled';
        const itemsSub = orderSubtotals.get(ro.id) || 0;
        const tableInfo = tableMap.get(ro.table_id);

        // Check if this individual table order also has a specific ledger entry
        const orderLedger = ledger.orders[ro.id] || {};

        let orderServiceFee = 0;
        let orderDiscount = 0;
        let orderGross = itemsSub;
        let orderNet = itemsSub;
        let orderPaid = 0;
        let orderPending = 0;
        let orderPaymentStatus: FinancialPaymentStatus = 'pending';
        let orderPaidAt: string | null = null;
        let orderPaymentsList: PaymentTransactionEntry[] = [];

        if (isCancelled) {
          orderPaymentStatus = 'cancelled';
        } else {
          const validIdx = validOrders.findIndex((vo) => vo.id === ro.id);
          const isLastValid = validIdx === validOrders.length - 1;
          const weight = validSessionSubtotal > 0 ? itemsSub / validSessionSubtotal : 1 / Math.max(1, validOrders.length);

          if (isLastValid) {
            orderServiceFee = round2(Math.max(0, remainingFee));
            orderDiscount = round2(Math.max(0, remainingDiscount));
          } else {
            orderServiceFee = round2(sessionServiceFeesTotal * weight);
            remainingFee = round2(remainingFee - orderServiceFee);

            orderDiscount = round2(sessionDiscount * weight);
            remainingDiscount = round2(remainingDiscount - orderDiscount);
          }

          // Allow order-specific discount if set directly on the order
          if (orderLedger.discount && orderLedger.discount > 0 && sessionDiscount === 0) {
            orderDiscount = round2(Math.min(itemsSub + orderServiceFee, Number(orderLedger.discount)));
          }

          orderGross = round2(itemsSub + orderServiceFee);
          orderNet = round2(Math.max(0, orderGross - orderDiscount));

          // Check if order has direct payments recorded on orderLedger
          if (Array.isArray(orderLedger.payments) && orderLedger.payments.length > 0) {
            orderPaymentsList = orderLedger.payments.map((p) => ({
              ...p,
              amount: round2(Number(p.amount || 0)),
            }));
            const directPaid = round2(orderPaymentsList.reduce((acc, p) => acc + p.amount, 0));
            orderPaid = round2(Math.min(orderNet, directPaid));
            orderPaidAt = orderPaymentsList[orderPaymentsList.length - 1]?.paidAt || null;
          } else if (orderLedger.paymentStatus === 'paid') {
            orderPaid = orderNet;
            orderPaidAt = orderLedger.paidAt || ro.updated_at;
            orderPaymentsList = [
              {
                id: `ord_pay_${ro.id}`,
                amount: orderNet,
                paymentMethod: orderLedger.paymentMethod || session?.payment_method || 'PIX',
                paidAt: orderPaidAt!,
                notes: 'Pagamento confirmado no pedido',
              },
            ];
          } else {
            // Allocate from sessionPaidAmount
            if (isLastValid) {
              orderPaid = round2(Math.min(orderNet, Math.max(0, remainingPaid)));
            } else {
              const allocated = round2(Math.min(orderNet, sessionPaidAmount * weight));
              orderPaid = allocated;
              remainingPaid = round2(remainingPaid - allocated);
            }

            if (orderPaid > 0 && sessionPayments.length > 0) {
              const shareRatio = sessionPaidAmount > 0 ? orderPaid / sessionPaidAmount : 0;
              orderPaymentsList = sessionPayments.map((sp, spIdx) => ({
                ...sp,
                id: `${sp.id}_${ro.id}_${spIdx}`,
                amount:
                  sessionPayments.length === 1
                    ? orderPaid
                    : round2(sp.amount * shareRatio),
              }));
              orderPaidAt = sessionPayments[sessionPayments.length - 1]?.paidAt || session?.closed_at || null;
            }
          }

          orderPending = round2(Math.max(0, orderNet - orderPaid));
          if (orderPaid >= orderNet && orderNet > 0) {
            orderPaymentStatus = 'paid';
          } else if (orderPaid > 0 && orderPaid < orderNet) {
            orderPaymentStatus = 'partial';
          } else if (orderLedger.paymentStatus === 'unpaid' || session?.payment_status === 'unpaid') {
            orderPaymentStatus = 'unpaid';
          } else {
            orderPaymentStatus = 'pending';
          }
        }

        const rawMethod =
          orderLedger.paymentMethod ||
          (orderPaymentsList.length > 0 ? orderPaymentsList[orderPaymentsList.length - 1].paymentMethod : null) ||
          sessionLedger.paymentMethod ||
          session?.payment_method ||
          (orderPaymentStatus === 'paid' ? 'Cartão de Crédito' : 'A definir no fechamento');

        const pmNorm = normalizePaymentMethodLabel(rawMethod);
        const opNorm = normalizeOperationalStatus('table', ro.status);

        const oItems = (tableItemsByOrder.get(ro.id) || []).map((it: any) => ({
          id: it.id,
          productId: it.product_id || null,
          variantId: it.variant_id || null,
          productName: it.product_name,
          variantName: it.variant_name || null,
          unitPrice: round2(Number(it.unit_price || 0)),
          quantity: Number(it.quantity || 1),
          subtotal: round2(Number(it.subtotal ?? Number(it.unit_price || 0) * Number(it.quantity || 1))),
          notes: it.notes || null,
        }));

        const rawHist = tableHistoryByOrder.get(ro.id) || [];
        const history: OrderHistoryEvent[] = [
          ...rawHist.map((h: any) => ({
            id: h.id,
            timestamp: h.created_at,
            type: 'status_change' as const,
            status: h.status,
            description: h.notes || `Status alterado para ${RESTAURANT_STATUS_LABELS[h.status as RestaurantOrderStatus] || h.status}`,
            actorName: h.changed_by || 'Sistema',
          })),
          ...(orderLedger.history || []),
        ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        unifiedList.push({
          id: ro.id,
          tenantId: ro.tenant_id,
          source: 'table',
          originChannel: orderLedger.originChannel || 'table',
          originLabel: ORDER_ORIGIN_LABELS[orderLedger.originChannel || 'table'] || 'Mesa (QR Code)',
          orderNumber: Number(ro.order_number),
          formattedOrderNumber: `#${ro.order_number}`,
          displayCode: `#${ro.order_number}`,
          customerName:
            ro.customer_name ||
            (tableInfo ? `Mesa ${tableInfo.table_number}` : 'Cliente na Mesa'),
          customerPhone: '',
          customerEmail: null,
          fulfillmentType: 'dine_in',
          fulfillmentLabel: UNIFIED_FULFILLMENT_LABELS.dine_in,
          tableId: ro.table_id,
          tableNumber: tableInfo?.table_number || null,
          tableName: tableInfo?.name || null,
          sessionId: ro.session_id,
          sessionCode: session?.session_code || null,
          operationalStatus: ro.status,
          rawStatus: ro.status,
          normalizedOperationalStatus: opNorm.normalized,
          operationalStatusLabel: opNorm.label,
          paymentStatus: orderPaymentStatus,
          paymentStatusLabel: FINANCIAL_PAYMENT_STATUS_LABELS[orderPaymentStatus],
          paymentMethod: pmNorm.key,
          paymentMethodLabel: pmNorm.label,
          paidAt: orderPaidAt,
          subtotal: itemsSub,
          discount: orderDiscount,
          deliveryFee: 0,
          serviceFee: orderServiceFee,
          grossTotal: orderGross,
          total: orderNet,
          paidAmount: orderPaid,
          pendingAmount: orderPending,
          changeFor: null,
          notes: ro.notes || null,
          itemsCount: oItems.reduce((acc, it) => acc + it.quantity, 0),
          items: oItems,
          deliveryAddress: null,
          payments: orderPaymentsList,
          history,
          createdAt: ro.created_at,
          updatedAt: ro.updated_at,
        });
      }
    }

    // Default sort: newest first
    unifiedList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return unifiedList;
  }

  // =========================================================================
  // 3. FILTERED & PAGINATED UNIFIED ORDERS CATALOG (REQUIREMENT 2)
  // =========================================================================

  public async queryUnifiedOrders(
    tenantId: string,
    filters: AdvancedOrderFilterParams = {}
  ): Promise<PaginatedUnifiedOrdersResponse> {
    const allOrders = await this.loadAllUnifiedOrdersForTenant(tenantId);

    let startDateKey: string | null = null;
    let endDateKey: string | null = null;

    if (filters.period) {
      const bounds = resolvePeriodBounds(filters.period, filters.startDate, filters.endDate);
      startDateKey = bounds.startDate;
      endDateKey = bounds.endDate;
    } else if (filters.startDate || filters.endDate) {
      startDateKey = filters.startDate ? filters.startDate.slice(0, 10) : null;
      endDateKey = filters.endDate ? filters.endDate.slice(0, 10) : null;
    }

    const filtered = allOrders.filter((o) => {
      // 1. Period / Date filter (in America/Sao_Paulo timezone)
      if (startDateKey || endDateKey) {
        const orderDateKey = toTimezoneDateKey(o.createdAt);
        if (startDateKey && orderDateKey < startDateKey) return false;
        if (endDateKey && orderDateKey > endDateKey) return false;
      }

      // 2. Operational Status filter
      if (filters.operationalStatus && filters.operationalStatus !== 'all') {
        const target = filters.operationalStatus.toUpperCase();
        const rawMatch = o.operationalStatus.toUpperCase() === target;
        const normMatch = o.normalizedOperationalStatus === target;
        if (!rawMatch && !normMatch) return false;
      }

      // 3. Payment Status filter
      if (filters.paymentStatus && filters.paymentStatus !== 'all') {
        if (o.paymentStatus !== filters.paymentStatus) return false;
      }

      // 4. Payment Method filter
      if (filters.paymentMethod && filters.paymentMethod !== 'all') {
        const filterPmNorm = normalizePaymentMethodLabel(filters.paymentMethod);
        const matchesMain =
          o.paymentMethod === filterPmNorm.key ||
          o.paymentMethodLabel.toLowerCase() === filters.paymentMethod.toLowerCase();
        const matchesSplit = o.payments.some(
          (p) => normalizePaymentMethodLabel(p.paymentMethod).key === filterPmNorm.key
        );
        if (!matchesMain && !matchesSplit) return false;
      }

      // 5. Fulfillment Type (delivery, pickup, dine_in)
      if (filters.fulfillmentType && filters.fulfillmentType !== 'all') {
        if (o.fulfillmentType !== filters.fulfillmentType) return false;
      }

      // 6. Table filter
      if (filters.tableId && filters.tableId !== 'all') {
        const qTable = filters.tableId.trim().toLowerCase();
        const idMatch = o.tableId?.toLowerCase() === qTable;
        const numMatch = o.tableNumber?.toLowerCase() === qTable;
        if (!idMatch && !numMatch) return false;
      }

      // 7. Order Number / Code filter
      if (filters.orderNumber && filters.orderNumber.trim()) {
        const cleanNum = filters.orderNumber.replace(/\D/g, '').trim();
        const rawQuery = filters.orderNumber.trim().toLowerCase();
        const matchesNum = cleanNum ? String(o.orderNumber).includes(cleanNum) : false;
        const matchesFormatted = o.formattedOrderNumber.toLowerCase().includes(rawQuery);
        const matchesSession = o.sessionCode?.toLowerCase().includes(rawQuery) || false;
        if (!matchesNum && !matchesFormatted && !matchesSession) return false;
      }

      // 8. Customer Name filter
      if (filters.customerName && filters.customerName.trim()) {
        const qName = filters.customerName.trim().toLowerCase();
        if (!o.customerName.toLowerCase().includes(qName)) return false;
      }

      // 9. Customer Phone filter
      if (filters.customerPhone && filters.customerPhone.trim()) {
        const qPhone = filters.customerPhone.replace(/\D/g, '').trim();
        const rawPhoneQuery = filters.customerPhone.trim();
        const orderPhoneClean = (o.customerPhone || '').replace(/\D/g, '');
        if (qPhone) {
          if (!orderPhoneClean.includes(qPhone)) return false;
        } else if (!o.customerPhone.includes(rawPhoneQuery)) {
          return false;
        }
      }

      // 10. Value range (minAmount / maxAmount)
      if (filters.minAmount !== undefined && filters.minAmount !== null && !isNaN(Number(filters.minAmount))) {
        if (o.total < Number(filters.minAmount)) return false;
      }
      if (filters.maxAmount !== undefined && filters.maxAmount !== null && !isNaN(Number(filters.maxAmount))) {
        if (o.total > Number(filters.maxAmount)) return false;
      }

      // 11. Origin Channel filter
      if (filters.originChannel && filters.originChannel !== 'all') {
        if (o.originChannel !== filters.originChannel) return false;
      }

      // General quick search
      if (filters.search && filters.search.trim()) {
        const q = filters.search.trim().toLowerCase();
        const matchOrderNum = String(o.orderNumber).includes(q) || o.formattedOrderNumber.toLowerCase().includes(q);
        const matchCust = o.customerName.toLowerCase().includes(q) || (o.customerPhone || '').toLowerCase().includes(q);
        const matchTable = (o.tableNumber || '').toLowerCase().includes(q) || (o.tableName || '').toLowerCase().includes(q);
        const matchItem = o.items.some((i) => i.productName.toLowerCase().includes(q));
        if (!matchOrderNum && !matchCust && !matchTable && !matchItem) return false;
      }

      return true;
    });

    // Sorting
    const sortBy = filters.sortBy || 'date';
    const sortOrder = filters.sortOrder || 'desc';
    const dir = sortOrder === 'asc' ? 1 : -1;

    filtered.sort((a, b) => {
      if (sortBy === 'total') {
        return (a.total - b.total) * dir;
      }
      if (sortBy === 'status') {
        return a.operationalStatusLabel.localeCompare(b.operationalStatusLabel) * dir;
      }
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    });

    // Summary over filtered results (excluding cancelled from revenue sums)
    let filteredGrossTotal = 0;
    let filteredDiscountsTotal = 0;
    let filteredDeliveryFeeTotal = 0;
    let filteredServiceFeeTotal = 0;
    let filteredNetTotal = 0;
    let filteredPaidTotal = 0;
    let filteredPendingTotal = 0;
    let validCount = 0;
    let cancelledCount = 0;

    for (const o of filtered) {
      if (o.normalizedOperationalStatus !== 'CANCELLED') {
        filteredGrossTotal += o.grossTotal;
        filteredDiscountsTotal += o.discount;
        filteredDeliveryFeeTotal += o.deliveryFee;
        filteredServiceFeeTotal += o.serviceFee;
        filteredNetTotal += o.total;
        filteredPaidTotal += o.paidAmount;
        filteredPendingTotal += o.pendingAmount;
        validCount++;
      } else {
        cancelledCount++;
      }
    }

    const total = filtered.length;
    const page = Math.max(1, Number(filters.page || 1));
    const limit = Math.max(1, Math.min(500, Number(filters.limit || 25)));
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return {
      orders: paginated,
      total,
      page,
      limit,
      totalPages,
      summary: {
        filteredGrossTotal: round2(filteredGrossTotal),
        filteredNetTotal: round2(filteredNetTotal),
        filteredPaidTotal: round2(filteredPaidTotal),
        filteredPendingTotal: round2(filteredPendingTotal),
        filteredCount: total,
        grossTotal: round2(filteredGrossTotal),
        discountsTotal: round2(filteredDiscountsTotal),
        deliveryFeeTotal: round2(filteredDeliveryFeeTotal),
        serviceFeeTotal: round2(filteredServiceFeeTotal),
        netTotal: round2(filteredNetTotal),
        paidTotal: round2(filteredPaidTotal),
        pendingTotal: round2(filteredPendingTotal),
        validCount,
        cancelledCount,
      },
    };
  }

  public async getUnifiedOrderById(tenantId: string, orderId: string): Promise<UnifiedOrder | null> {
    const all = await this.loadAllUnifiedOrdersForTenant(tenantId);
    return all.find((o) => o.id === orderId) || null;
  }

  // =========================================================================
  // 4. RECORD PAYMENTS, PARTIAL PAYMENTS & DISCOUNTS (ORDERS & SESSIONS)
  // =========================================================================

  public async updateOrderFinancialsAndPayments(
    tenantId: string,
    orderId: string,
    rawPayload: {
      action?: 'add_payment' | 'remove_payment' | 'set_discount' | 'set_payment_status';
      amount?: number;
      paymentMethod?: string;
      paymentId?: string;
      discount?: number;
      paymentStatus?: FinancialPaymentStatus;
      notes?: string;
      addPayment?: {
        amount: number;
        paymentMethod: string;
        notes?: string;
      };
      removePaymentId?: string;
      markFullPaid?: boolean;
      paymentMethodForFullPaid?: string;
    },
    actor: User
  ): Promise<UnifiedOrder> {
    const existing = await this.getUnifiedOrderById(tenantId, orderId);
    if (!existing) {
      throw new Error('Pedido não encontrado para este estabelecimento.');
    }

    // Normalize both frontend payload formats into canonical action fields
    const payload = { ...rawPayload };
    if (!payload.action) {
      if (payload.addPayment) {
        payload.action = 'add_payment';
        payload.amount = payload.addPayment.amount;
        payload.paymentMethod = payload.addPayment.paymentMethod;
        payload.notes = payload.addPayment.notes;
      } else if (payload.removePaymentId) {
        payload.action = 'remove_payment';
        payload.paymentId = payload.removePaymentId;
      } else if (payload.markFullPaid) {
        payload.action = 'set_payment_status';
        payload.paymentStatus = 'paid';
        payload.paymentMethod = payload.paymentMethodForFullPaid || payload.paymentMethod || existing.paymentMethod || 'PIX';
      } else if (payload.discount !== undefined) {
        payload.action = 'set_discount';
      } else if (payload.paymentStatus !== undefined) {
        payload.action = 'set_payment_status';
      }
    }

    const ledger = await this.getFinancialLedger(tenantId);
    const now = new Date().toISOString();

    const currentEntry: LedgerRecord = ledger.orders[orderId] || {
      discount: existing.discount,
      paymentStatus: existing.paymentStatus,
      paymentMethod: existing.paymentMethod,
      payments: [...existing.payments],
      history: [],
    };

    const payments = Array.isArray(currentEntry.payments) ? [...currentEntry.payments] : [];
    const history = Array.isArray(currentEntry.history) ? [...currentEntry.history] : [];

    if (payload.action === 'set_discount') {
      const newDiscount = round2(Math.max(0, Math.min(existing.grossTotal, Number(payload.discount || 0))));
      currentEntry.discount = newDiscount;
      history.push({
        id: crypto.randomUUID(),
        timestamp: now,
        type: 'discount',
        description: `Desconto atualizado para R$ ${newDiscount.toFixed(2).replace('.', ',')}`,
        actorName: actor.name,
      });

      // If online order, also update total in orders table so subtotal + delivery_fee - discount = total
      if (existing.source === 'online') {
        const newNetTotal = round2(Math.max(0, existing.grossTotal - newDiscount));
        await supabaseAdmin
          .from('orders')
          .update({ total: newNetTotal, updated_at: now })
          .eq('id', orderId)
          .eq('tenant_id', tenantId);
      }
    } else if (payload.action === 'add_payment') {
      const amt = round2(Number(payload.amount || 0));
      if (amt <= 0) {
        throw new Error('Informe um valor de pagamento maior que zero.');
      }
      const method = payload.paymentMethod || existing.paymentMethod || 'PIX';
      const newPayment: PaymentTransactionEntry = {
        id: crypto.randomUUID(),
        amount: amt,
        paymentMethod: method,
        paidAt: now,
        notes: payload.notes?.trim() || null,
        recordedBy: actor.name,
      };
      payments.push(newPayment);
      currentEntry.payments = payments;
      currentEntry.paymentMethod = method;
      currentEntry.paidAt = now;

      const effectiveNet = round2(Math.max(0, existing.grossTotal - (currentEntry.discount ?? existing.discount)));
      const totalPaid = round2(payments.reduce((acc, p) => acc + p.amount, 0));

      if (totalPaid >= effectiveNet) {
        currentEntry.paymentStatus = 'paid';
      } else if (totalPaid > 0) {
        currentEntry.paymentStatus = 'partial';
      }

      const pmLabel = normalizePaymentMethodLabel(method).label;
      history.push({
        id: crypto.randomUUID(),
        timestamp: now,
        type: 'payment',
        description: `Pagamento registrado: R$ ${amt.toFixed(2).replace('.', ',')} via ${pmLabel}`,
        actorName: actor.name,
      });
    } else if (payload.action === 'remove_payment') {
      const filteredPayments = payments.filter((p) => p.id !== payload.paymentId);
      currentEntry.payments = filteredPayments;
      const effectiveNet = round2(Math.max(0, existing.grossTotal - (currentEntry.discount ?? existing.discount)));
      const totalPaid = round2(filteredPayments.reduce((acc, p) => acc + p.amount, 0));
      if (totalPaid >= effectiveNet && effectiveNet > 0) {
        currentEntry.paymentStatus = 'paid';
      } else if (totalPaid > 0) {
        currentEntry.paymentStatus = 'partial';
      } else {
        currentEntry.paymentStatus = 'pending';
      }
      history.push({
        id: crypto.randomUUID(),
        timestamp: now,
        type: 'payment',
        description: `Lançamento de pagamento removido`,
        actorName: actor.name,
      });
    } else if (payload.action === 'set_payment_status') {
      const targetStatus = payload.paymentStatus || 'pending';
      currentEntry.paymentStatus = targetStatus;
      if (payload.paymentMethod) {
        currentEntry.paymentMethod = payload.paymentMethod;
      }
      const effectiveNet = round2(Math.max(0, existing.grossTotal - (currentEntry.discount ?? existing.discount)));
      if (targetStatus === 'paid') {
        currentEntry.paidAt = now;
        currentEntry.payments = [
          {
            id: crypto.randomUUID(),
            amount: effectiveNet,
            paymentMethod: currentEntry.paymentMethod || existing.paymentMethod || 'PIX',
            paidAt: now,
            notes: payload.notes || 'Marcado como Pago integralmente',
            recordedBy: actor.name,
          },
        ];
      } else if (targetStatus === 'pending' || targetStatus === 'unpaid') {
        currentEntry.payments = [];
        currentEntry.paidAt = null;
      }
      history.push({
        id: crypto.randomUUID(),
        timestamp: now,
        type: 'payment',
        description: `Status financeiro alterado para ${targetStatus.toUpperCase()}`,
        actorName: actor.name,
      });
    }

    currentEntry.history = history;

    await this.saveFinancialLedger(tenantId, {
      orders: { [orderId]: currentEntry },
    });

    await repo.logAudit({
      actorUserId: actor.id,
      actorUserName: actor.name,
      tenantId,
      action: 'ORDER_FINANCIAL_UPDATE' as any,
      entity: 'orders',
      entityId: orderId,
      metadata: payload,
    });

    const updated = await this.getUnifiedOrderById(tenantId, orderId);
    return updated!;
  }

  public async updateSessionFinancialsAndPayments(
    tenantId: string,
    sessionId: string,
    rawPayload: {
      action?: 'add_payment' | 'remove_payment' | 'set_discount';
      amount?: number;
      paymentMethod?: string;
      paymentId?: string;
      discount?: number;
      notes?: string;
      addPayment?: {
        amount: number;
        paymentMethod: string;
        notes?: string;
      };
      removePaymentId?: string;
    },
    actor: User
  ): Promise<{
    sessionId: string;
    discount: number;
    paidAmount: number;
    pendingAmount: number;
    paymentStatus: FinancialPaymentStatus;
    payments: PaymentTransactionEntry[];
  }> {
    const { data: session } = await supabaseAdmin
      .from('restaurant_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('tenant_id', tenantId)
      .single();

    if (!session) {
      throw new Error('Comanda não encontrada para este estabelecimento.');
    }

    if (session.status === 'closed') {
      throw new Error('Esta comanda já foi encerrada e não permite novos lançamentos ou alterações financeiras.');
    }

    // Normalize both frontend payload formats into canonical action fields
    const payload = { ...rawPayload };
    if (!payload.action) {
      if (payload.addPayment) {
        payload.action = 'add_payment';
        payload.amount = payload.addPayment.amount;
        payload.paymentMethod = payload.addPayment.paymentMethod;
        payload.notes = payload.addPayment.notes;
      } else if (payload.removePaymentId) {
        payload.action = 'remove_payment';
        payload.paymentId = payload.removePaymentId;
      } else if (payload.discount !== undefined) {
        payload.action = 'set_discount';
      }
    }

    const ledger = await this.getFinancialLedger(tenantId);
    const now = new Date().toISOString();
    const currentEntry: LedgerRecord = ledger.sessions[sessionId] || {
      discount: 0,
      paymentStatus: (session.payment_status as FinancialPaymentStatus) || 'pending',
      paymentMethod: session.payment_method || 'PIX',
      payments: [],
      history: [],
    };

    const payments = Array.isArray(currentEntry.payments) ? [...currentEntry.payments] : [];
    const history = Array.isArray(currentEntry.history) ? [...currentEntry.history] : [];

    // Calculate session gross total
    const { data: sOrders } = await supabaseAdmin
      .from('restaurant_orders')
      .select('total, status')
      .eq('session_id', sessionId)
      .eq('tenant_id', tenantId);

    const ordersSubtotal = round2(
      (sOrders || [])
        .filter((o: any) => o.status !== 'cancelled')
        .reduce((acc: number, o: any) => acc + Number(o.total || 0), 0)
    );

    const { data: sFees } = await supabaseAdmin
      .from('restaurant_session_fees')
      .select('*')
      .eq('session_id', sessionId)
      .eq('tenant_id', tenantId);

    let feesTotal = 0;
    for (const f of sFees || []) {
      if (f.type === 'percentage') {
        feesTotal += round2(ordersSubtotal * (Number(f.rate_or_amount || 0) / 100));
      } else {
        feesTotal += round2(Number(f.rate_or_amount || f.calculated_amount || 0));
      }
    }
    feesTotal = round2(feesTotal);
    const grossTotal = round2(ordersSubtotal + feesTotal);

    if (payload.action === 'set_discount') {
      const disc = round2(Math.max(0, Math.min(grossTotal, Number(payload.discount || 0))));
      currentEntry.discount = disc;
      history.push({
        id: crypto.randomUUID(),
        timestamp: now,
        type: 'discount',
        description: `Desconto de R$ ${disc.toFixed(2).replace('.', ',')} aplicado na comanda`,
        actorName: actor.name,
      });
    } else if (payload.action === 'add_payment') {
      const amt = round2(Number(payload.amount || 0));
      if (amt <= 0) {
        throw new Error('O valor do pagamento deve ser maior que zero.');
      }
      const method = payload.paymentMethod || 'PIX';
      payments.push({
        id: crypto.randomUUID(),
        amount: amt,
        paymentMethod: method,
        paidAt: now,
        notes: payload.notes?.trim() || null,
        recordedBy: actor.name,
      });
      currentEntry.payments = payments;
      currentEntry.paymentMethod = method;
      currentEntry.paidAt = now;
      history.push({
        id: crypto.randomUUID(),
        timestamp: now,
        type: 'payment',
        description: `Pagamento parcial/dividido recebido: R$ ${amt.toFixed(2).replace('.', ',')} (${method})`,
        actorName: actor.name,
      });
    } else if (payload.action === 'remove_payment') {
      currentEntry.payments = payments.filter((p) => p.id !== payload.paymentId);
      history.push({
        id: crypto.randomUUID(),
        timestamp: now,
        type: 'payment',
        description: `Pagamento removido da comanda`,
        actorName: actor.name,
      });
    }

    const discount = round2(currentEntry.discount || 0);
    const netTotal = round2(Math.max(0, grossTotal - discount));
    const finalPayments = currentEntry.payments || [];
    const paidAmount = round2(
      Math.min(netTotal, finalPayments.reduce((acc, p) => acc + Number(p.amount || 0), 0))
    );
    const pendingAmount = round2(Math.max(0, netTotal - paidAmount));

    let paymentStatus: FinancialPaymentStatus = 'pending';
    if (paidAmount >= netTotal && netTotal > 0) {
      paymentStatus = 'paid';
    } else if (paidAmount > 0) {
      paymentStatus = 'partial';
    }

    currentEntry.paymentStatus = paymentStatus;
    currentEntry.history = history;

    await this.saveFinancialLedger(tenantId, {
      sessions: { [sessionId]: currentEntry },
    });

    // Also update total_amount on restaurant_sessions
    await supabaseAdmin
      .from('restaurant_sessions')
      .update({
        total_amount: netTotal,
        updated_at: now,
      })
      .eq('id', sessionId)
      .eq('tenant_id', tenantId);

    return {
      sessionId,
      discount,
      paidAmount,
      pendingAmount,
      paymentStatus,
      payments: finalPayments,
    };
  }

  public async reconcileClosedSessionInLedger(
    tenantId: string,
    sessionId: string,
    finalNetTotal: number,
    paymentMethod: string,
    closedAt: string,
    actorName: string
  ): Promise<void> {
    const ledger = await this.getFinancialLedger(tenantId);
    const currentEntry: LedgerRecord = ledger.sessions[sessionId] || {
      discount: 0,
      paymentStatus: 'paid',
      paymentMethod,
      payments: [],
      history: [],
    };

    const payments = Array.isArray(currentEntry.payments) ? [...currentEntry.payments] : [];
    const history = Array.isArray(currentEntry.history) ? [...currentEntry.history] : [];
    const alreadyPaid = round2(payments.reduce((acc, p) => acc + Number(p.amount || 0), 0));
    const remainingToSettle = round2(Math.max(0, finalNetTotal - alreadyPaid));

    if (remainingToSettle > 0) {
      payments.push({
        id: crypto.randomUUID(),
        amount: remainingToSettle,
        paymentMethod,
        paidAt: closedAt,
        notes: 'Quitação final no encerramento da comanda',
        recordedBy: actorName,
      });
    }

    currentEntry.payments = payments;
    currentEntry.paymentStatus = 'paid';
    currentEntry.paymentMethod = paymentMethod;
    currentEntry.paidAt = closedAt;
    history.push({
      id: crypto.randomUUID(),
      timestamp: closedAt,
      type: 'status_change',
      description: `Comanda encerrada e quitada (${paymentMethod}) — Total R$ ${finalNetTotal.toFixed(2).replace('.', ',')}`,
      actorName,
    });
    currentEntry.history = history;

    await this.saveFinancialLedger(tenantId, {
      sessions: { [sessionId]: currentEntry },
    });
  }

  // =========================================================================
  // 5. ENHANCED TABLES MONITORING & VISUAL STATES (REQUIREMENT 3)
  // =========================================================================

  public async getEnrichedTablesOverview(
    tenantId: string,
    filters?: {
      visualState?: TableVisualOperationalState | 'all';
      search?: string;
      period?: PeriodPreset;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<EnrichedRestaurantTable[]> {
    const [
      { data: rawTables },
      { data: rawSessions },
      { data: rawOrders },
      { data: rawItems },
      { data: rawFees },
      ledger,
    ] = await Promise.all([
      supabaseAdmin.from('restaurant_tables').select('*').eq('tenant_id', tenantId),
      supabaseAdmin.from('restaurant_sessions').select('*').eq('tenant_id', tenantId),
      supabaseAdmin.from('restaurant_orders').select('*').eq('tenant_id', tenantId),
      supabaseAdmin.from('restaurant_order_items').select('*').eq('tenant_id', tenantId),
      supabaseAdmin.from('restaurant_session_fees').select('*').eq('tenant_id', tenantId),
      this.getFinancialLedger(tenantId),
    ]);

    const openSessionByTable = new Map<string, any>();
    (rawSessions || []).forEach((s: any) => {
      if (s.status === 'open') {
        openSessionByTable.set(s.table_id, s);
      }
    });

    const itemsByOrder = new Map<string, any[]>();
    (rawItems || []).forEach((it: any) => {
      const arr = itemsByOrder.get(it.order_id) || [];
      arr.push(it);
      itemsByOrder.set(it.order_id, arr);
    });

    const ordersBySession = new Map<string, any[]>();
    (rawOrders || []).forEach((o: any) => {
      const arr = ordersBySession.get(o.session_id) || [];
      arr.push(o);
      ordersBySession.set(o.session_id, arr);
    });

    const feesBySession = new Map<string, any[]>();
    (rawFees || []).forEach((f: any) => {
      const arr = feesBySession.get(f.session_id) || [];
      arr.push(f);
      feesBySession.set(f.session_id, arr);
    });

    // Period bounds for historical table stats
    const bounds = filters?.period
      ? resolvePeriodBounds(filters.period, filters.startDate, filters.endDate)
      : null;

    const nowMs = Date.now();

    const enriched: EnrichedRestaurantTable[] = (rawTables || []).map((t: any) => {
      const activeSession = openSessionByTable.get(t.id);
      const sOrders = activeSession ? ordersBySession.get(activeSession.id) || [] : [];
      const validOrders = sOrders.filter((o: any) => o.status !== 'cancelled');
      const sFees = activeSession ? feesBySession.get(activeSession.id) || [] : [];
      const sLedger = activeSession ? ledger.sessions[activeSession.id] || {} : {};

      const ordersSubtotal = round2(
        validOrders.reduce((acc: number, o: any) => acc + Number(o.total || 0), 0)
      );

      let serviceFee = 0;
      for (const f of sFees) {
        if (f.type === 'percentage') {
          serviceFee += round2(ordersSubtotal * (Number(f.rate_or_amount || 0) / 100));
        } else {
          serviceFee += round2(Number(f.rate_or_amount || f.calculated_amount || 0));
        }
      }
      serviceFee = round2(serviceFee);

      const grossTotal = round2(ordersSubtotal + serviceFee);
      const discount = round2(
        Math.min(grossTotal, Math.max(0, Number(sLedger.discount ?? activeSession?.discount_amount ?? 0)))
      );
      const netTotal = round2(Math.max(0, grossTotal - discount));

      const payments: PaymentTransactionEntry[] = Array.isArray(sLedger.payments)
        ? sLedger.payments.map((p) => ({ ...p, amount: round2(Number(p.amount || 0)) }))
        : [];
      const paidAmount = round2(
        Math.min(netTotal, payments.reduce((acc, p) => acc + p.amount, 0))
      );
      const pendingAmount = round2(Math.max(0, netTotal - paidAmount));

      let paymentStatus: FinancialPaymentStatus = 'pending';
      if (!activeSession) {
        paymentStatus = 'pending';
      } else if (paidAmount >= netTotal && netTotal > 0) {
        paymentStatus = 'paid';
      } else if (paidAmount > 0) {
        paymentStatus = 'partial';
      } else {
        paymentStatus = 'pending';
      }

      // Determine the 5 distinct visual operational states reflecting real orders & session state:
      // 'free' | 'occupied' | 'preparing' | 'awaiting_payment' | 'closing'
      let visualState: TableVisualOperationalState = 'free';
      const isClosing =
        t.status === 'closing' || Boolean(activeSession?.closing_requested_at);
      const isOccupied = t.status === 'occupied' || Boolean(activeSession);

      if (isClosing) {
        visualState = 'closing';
      } else if (isOccupied) {
        const hasOrdersInPrep = validOrders.some((o: any) =>
          ['received', 'confirmed', 'preparing'].includes(o.status)
        );
        const allOrdersDeliveredOrReady =
          validOrders.length > 0 &&
          validOrders.every((o: any) => ['ready', 'delivered'].includes(o.status));

        if (hasOrdersInPrep) {
          visualState = 'preparing';
        } else if (allOrdersDeliveredOrReady || paidAmount > 0) {
          visualState = 'awaiting_payment';
        } else {
          visualState = 'occupied';
        }
      } else {
        visualState = 'free';
      }

      let occupationMinutes: number | null = null;
      if (activeSession?.opened_at) {
        const openedMs = new Date(activeSession.opened_at).getTime();
        if (!isNaN(openedMs)) {
          occupationMinutes = Math.max(1, Math.floor((nowMs - openedMs) / 60000));
        }
      }

      // Period stats for this table
      const tableHistoricalOrders = (rawOrders || []).filter((o: any) => {
        if (o.table_id !== t.id || o.status === 'cancelled') return false;
        if (bounds) {
          const dKey = toTimezoneDateKey(o.created_at);
          if (dKey < bounds.startDate || dKey > bounds.endDate) return false;
        }
        return true;
      });

      const periodRevenue = round2(
        tableHistoricalOrders.reduce((acc: number, o: any) => acc + Number(o.total || 0), 0)
      );
      const periodOrdersCount = tableHistoricalOrders.length;
      const periodAvgTicket =
        periodOrdersCount > 0 ? round2(periodRevenue / periodOrdersCount) : 0;
      const lastOrder = tableHistoricalOrders.sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      return {
        id: t.id,
        tenantId: t.tenant_id,
        tableNumber: t.table_number,
        name: t.name || null,
        status: t.status || 'available',
        visualState,
        visualStateLabel: TABLE_VISUAL_STATE_LABELS[visualState],
        isActive: t.is_active !== false,
        notes: t.notes || null,
        qrCodeToken: t.qr_code_token,
        currentSessionId: activeSession?.id || null,
        currentSessionCode: activeSession?.session_code || null,
        currentSessionOpenedAt: activeSession?.opened_at || null,
        closingRequestedAt: activeSession?.closing_requested_at || null,
        occupationMinutes,
        currentSessionSubtotal: ordersSubtotal,
        currentSessionServiceFee: serviceFee,
        currentSessionDiscount: discount,
        currentSessionTotal: netTotal,
        currentSessionPaidAmount: paidAmount,
        currentSessionPendingAmount: pendingAmount,
        currentSessionPaymentStatus: paymentStatus,
        currentSessionPaymentMethod:
          sLedger.paymentMethod || activeSession?.payment_method || null,
        currentSessionOrdersCount: validOrders.length,
        currentSessionOrderNumbers: validOrders.map((o: any) => `#${o.order_number}`),
        currentSessionPayments: payments,
        activeOrdersPreview: validOrders.map((o: any) => {
          const oItems = itemsByOrder.get(o.id) || [];
          const itemsSummary = oItems
            .map((i: any) => `${i.quantity}x ${i.product_name}`)
            .join(', ');
          return {
            id: o.id,
            orderNumber: Number(o.order_number),
            status: o.status as RestaurantOrderStatus,
            statusLabel:
              RESTAURANT_STATUS_LABELS[o.status as RestaurantOrderStatus] || o.status,
            total: round2(Number(o.total || 0)),
            itemsSummary,
            createdAt: o.created_at,
          };
        }),
        activeSession: activeSession
          ? {
              id: activeSession.id,
              sessionCode: activeSession.session_code,
              totalAmount: netTotal,
              paidAmount,
              pendingAmount,
              ordersCount: validOrders.length,
              paymentStatus,
              openedAt: activeSession.opened_at,
            }
          : null,
        periodOrdersCount,
        periodRevenue,
        periodAvgTicket,
        periodStats: {
          ordersCount: periodOrdersCount,
          revenue: periodRevenue,
          averageTicket: periodAvgTicket,
          lastActivityAt: lastOrder?.created_at || activeSession?.opened_at || null,
        },
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      };
    });

    // Natural sort by tableNumber
    enriched.sort((a, b) => {
      const numA = parseInt(a.tableNumber.replace(/\D/g, ''), 10);
      const numB = parseInt(b.tableNumber.replace(/\D/g, ''), 10);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return numA - numB;
      }
      return a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true });
    });

    return enriched.filter((t) => {
      if (filters?.visualState && filters.visualState !== 'all') {
        if (t.visualState !== filters.visualState) return false;
      }
      if (filters?.search && filters.search.trim()) {
        const q = filters.search.trim().toLowerCase();
        const matchNum = t.tableNumber.toLowerCase().includes(q);
        const matchName = (t.name || '').toLowerCase().includes(q);
        const matchOrder = t.currentSessionOrderNumbers.some((n) =>
          n.toLowerCase().includes(q)
        );
        if (!matchNum && !matchName && !matchOrder) return false;
      }
      if (bounds && filters?.period && filters.period !== 'today') {
        // When filtering by a historical period, if the user selected a specific period filter, keep all tables or those with activity
        // We always return the tables enriched with periodStats so the hall view remains complete, unless user filters by state
      }
      return true;
    });
  }

  // =========================================================================
  // 6. FINANCIAL DASHBOARD, KPI ENGINE & 6 CHARTS (REQUIREMENTS 4, 5, 6, 7)
  // =========================================================================

  public async getFinancialDashboard(
    tenantId: string,
    params?: {
      period?: PeriodPreset;
      startDate?: string;
      endDate?: string;
      fulfillmentType?: UnifiedFulfillmentType | 'all';
      paymentStatus?: FinancialPaymentStatus | 'all';
      tableId?: string;
    }
  ): Promise<FinancialDashboardResponse> {
    const bounds = resolvePeriodBounds(
      params?.period || 'last_30_days',
      params?.startDate,
      params?.endDate,
      DEFAULT_TIMEZONE
    );

    const [allOrders, { data: rawTables }] = await Promise.all([
      this.loadAllUnifiedOrdersForTenant(tenantId),
      supabaseAdmin.from('restaurant_tables').select('*').eq('tenant_id', tenantId),
    ]);

    const tableMap = new Map<string, any>((rawTables || []).map((t: any) => [t.id, t]));

    // Filter orders strictly within the selected period in America/Sao_Paulo timezone
    const periodOrders = allOrders.filter((o) => {
      const dKey = toTimezoneDateKey(o.createdAt, DEFAULT_TIMEZONE);
      if (dKey < bounds.startDate || dKey > bounds.endDate) return false;
      if (params?.fulfillmentType && params.fulfillmentType !== 'all') {
        if (o.fulfillmentType !== params.fulfillmentType) return false;
      }
      if (params?.paymentStatus && params.paymentStatus !== 'all') {
        if (o.paymentStatus !== params.paymentStatus) return false;
      }
      if (params?.tableId && params.tableId !== 'all') {
        if (o.tableId !== params.tableId && o.tableNumber !== params.tableId) return false;
      }
      return true;
    });

    // Separate valid vs cancelled orders
    const validOrders = periodOrders.filter(
      (o) => o.normalizedOperationalStatus !== 'CANCELLED'
    );
    const cancelledOrders = periodOrders.filter(
      (o) => o.normalizedOperationalStatus === 'CANCELLED'
    );

    // KPI Calculations (Strict Accounting Rules)
    let grossRevenue = 0;
    let productsGrossRevenue = 0;
    let discountsGranted = 0;
    let netSales = 0;
    let confirmedReceipts = 0;
    let receivablesPending = 0;
    let deliveryFeesTotal = 0;
    let serviceFeesTotal = 0;

    for (const o of validOrders) {
      grossRevenue += o.grossTotal;
      productsGrossRevenue += o.subtotal;
      discountsGranted += o.discount;
      netSales += o.total;
      confirmedReceipts += o.paidAmount;
      receivablesPending += o.pendingAmount;
      deliveryFeesTotal += o.deliveryFee;
      serviceFeesTotal += o.serviceFee;
    }

    const cancelledOrdersCount = cancelledOrders.length;
    const cancelledOrdersAmount = round2(
      cancelledOrders.reduce((acc, o) => acc + o.grossTotal, 0)
    );
    const validOrdersCount = validOrders.length;
    const averageTicket =
      validOrdersCount > 0 ? round2(netSales / validOrdersCount) : 0;

    const kpis: FinancialDashboardKPIs = {
      grossRevenue: round2(grossRevenue),
      productsGrossRevenue: round2(productsGrossRevenue),
      discountsGranted: round2(discountsGranted),
      netSales: round2(netSales),
      confirmedReceipts: round2(confirmedReceipts),
      receivablesPending: round2(receivablesPending),
      averageTicket,
      validOrdersCount,
      cancelledOrdersCount,
      cancelledOrdersAmount,
      deliveryFeesTotal: round2(deliveryFeesTotal),
      serviceFeesTotal: round2(serviceFeesTotal),
    };

    // =========================================================================
    // CHART 1: SALES EVOLUTION (DAILY, WEEKLY, MONTHLY)
    // =========================================================================
    const dailyMap = new Map<string, SalesEvolutionPoint>();

    // Pre-populate daily keys across range (up to 90 days) so the chart has continuous dates
    const startDt = new Date(`${bounds.startDate}T12:00:00Z`);
    const endDt = new Date(`${bounds.endDate}T12:00:00Z`);
    const diffDays = Math.round((endDt.getTime() - startDt.getTime()) / 86400000);
    if (diffDays >= 0 && diffDays <= 120) {
      for (let i = 0; i <= diffDays; i++) {
        const cur = new Date(startDt.getTime() + i * 86400000);
        const key = cur.toISOString().slice(0, 10);
        const [, m, d] = key.split('-');
        dailyMap.set(key, {
          dateKey: key,
          label: `${d}/${m}`,
          grossRevenue: 0,
          netSales: 0,
          confirmedReceipts: 0,
          ordersCount: 0,
        });
      }
    }

    const weeklyMap = new Map<string, SalesEvolutionPoint>();
    const monthlyMap = new Map<string, SalesEvolutionPoint>();

    for (const o of validOrders) {
      const dKey = toTimezoneDateKey(o.createdAt, DEFAULT_TIMEZONE);
      const [y, m, d] = dKey.split('-');

      // Daily
      const dayEntry = dailyMap.get(dKey) || {
        dateKey: dKey,
        label: `${d}/${m}`,
        grossRevenue: 0,
        netSales: 0,
        confirmedReceipts: 0,
        ordersCount: 0,
      };
      dayEntry.grossRevenue = round2(dayEntry.grossRevenue + o.grossTotal);
      dayEntry.netSales = round2(dayEntry.netSales + o.total);
      dayEntry.confirmedReceipts = round2(dayEntry.confirmedReceipts + o.paidAmount);
      dayEntry.ordersCount += 1;
      dailyMap.set(dKey, dayEntry);

      // Weekly (ISO week start Monday)
      const dt = new Date(`${dKey}T12:00:00Z`);
      const dayOfWeek = dt.getUTCDay(); // 0=Sun..6=Sat
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(dt.getTime() + diffToMonday * 86400000);
      const wKey = monday.toISOString().slice(0, 10);
      const [, wm, wd] = wKey.split('-');
      const weekEntry = weeklyMap.get(wKey) || {
        dateKey: wKey,
        label: `Sem. ${wd}/${wm}`,
        grossRevenue: 0,
        netSales: 0,
        confirmedReceipts: 0,
        ordersCount: 0,
      };
      weekEntry.grossRevenue = round2(weekEntry.grossRevenue + o.grossTotal);
      weekEntry.netSales = round2(weekEntry.netSales + o.total);
      weekEntry.confirmedReceipts = round2(weekEntry.confirmedReceipts + o.paidAmount);
      weekEntry.ordersCount += 1;
      weeklyMap.set(wKey, weekEntry);

      // Monthly
      const mKey = `${y}-${m}`;
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const mLabel = `${monthNames[Number(m) - 1] || m}/${y}`;
      const monthEntry = monthlyMap.get(mKey) || {
        dateKey: mKey,
        label: mLabel,
        grossRevenue: 0,
        netSales: 0,
        confirmedReceipts: 0,
        ordersCount: 0,
      };
      monthEntry.grossRevenue = round2(monthEntry.grossRevenue + o.grossTotal);
      monthEntry.netSales = round2(monthEntry.netSales + o.total);
      monthEntry.confirmedReceipts = round2(monthEntry.confirmedReceipts + o.paidAmount);
      monthEntry.ordersCount += 1;
      monthlyMap.set(mKey, monthEntry);
    }

    const evolutionDaily = Array.from(dailyMap.values()).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey)
    );
    const evolutionWeekly = Array.from(weeklyMap.values()).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey)
    );
    const evolutionMonthly = Array.from(monthlyMap.values()).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey)
    );

    // =========================================================================
    // CHART 2: OPERATIONAL STATUS vs FINANCIAL STATUS DISTRIBUTION
    // =========================================================================
    const opStatusLabels: Record<UnifiedOrder['normalizedOperationalStatus'], string> = {
      NEW: 'Novos / Recebidos',
      CONFIRMED: 'Confirmados',
      PREPARING: 'Em Preparação',
      READY: 'Prontos',
      OUT_FOR_DELIVERY: 'Em Rota de Entrega',
      COMPLETED: 'Concluídos / Entregues',
      CANCELLED: 'Cancelados',
    };

    const opMap = new Map<string, { count: number; amount: number; label: string }>();
    const finMap = new Map<string, { count: number; amount: number; label: string }>();

    const totalAllOrders = periodOrders.length;

    for (const o of periodOrders) {
      const opKey = o.normalizedOperationalStatus;
      const opCur = opMap.get(opKey) || {
        count: 0,
        amount: 0,
        label: opStatusLabels[opKey] || opKey,
      };
      opCur.count += 1;
      opCur.amount = round2(opCur.amount + o.total);
      opMap.set(opKey, opCur);

      const finKey = o.paymentStatus;
      const finLabels: Record<FinancialPaymentStatus, string> = {
        paid: 'Pago (Confirmado)',
        partial: 'Pago Parcialmente',
        pending: 'Pagamento Pendente',
        unpaid: 'Não Pago',
        cancelled: 'Cancelado',
      };
      const finCur = finMap.get(finKey) || {
        count: 0,
        amount: 0,
        label: finLabels[finKey] || finKey,
      };
      finCur.count += 1;
      finCur.amount = round2(finCur.amount + o.total);
      finMap.set(finKey, finCur);
    }

    const operationalStatusDistribution: StatusDistributionItem[] = Array.from(
      opMap.entries()
    ).map(([statusKey, v]) => ({
      statusKey,
      label: v.label,
      count: v.count,
      amount: v.amount,
      percentage: totalAllOrders > 0 ? round2((v.count / totalAllOrders) * 100) : 0,
    }));

    const financialStatusDistribution: StatusDistributionItem[] = Array.from(
      finMap.entries()
    ).map(([statusKey, v]) => ({
      statusKey,
      label: v.label,
      count: v.count,
      amount: v.amount,
      percentage: totalAllOrders > 0 ? round2((v.count / totalAllOrders) * 100) : 0,
    }));

    // =========================================================================
    // CHART 3: CONFIRMED RECEIPTS BY PAYMENT METHOD
    // =========================================================================
    const pmMap = new Map<string, { label: string; confirmedAmount: number; transactionsCount: number }>();

    for (const o of validOrders) {
      if (o.paidAmount <= 0) continue;

      if (o.payments && o.payments.length > 0) {
        const sumEntries = o.payments.reduce((acc, p) => acc + p.amount, 0);
        const scale = sumEntries > 0 ? o.paidAmount / sumEntries : 1;
        for (const p of o.payments) {
          const norm = normalizePaymentMethodLabel(p.paymentMethod);
          const effectiveAmt = round2(p.amount * scale);
          if (effectiveAmt <= 0) continue;
          const cur = pmMap.get(norm.key) || {
            label: norm.label,
            confirmedAmount: 0,
            transactionsCount: 0,
          };
          cur.confirmedAmount = round2(cur.confirmedAmount + effectiveAmt);
          cur.transactionsCount += 1;
          pmMap.set(norm.key, cur);
        }
      } else {
        const norm = normalizePaymentMethodLabel(o.paymentMethod);
        const cur = pmMap.get(norm.key) || {
          label: norm.label,
          confirmedAmount: 0,
          transactionsCount: 0,
        };
        cur.confirmedAmount = round2(cur.confirmedAmount + o.paidAmount);
        cur.transactionsCount += 1;
        pmMap.set(norm.key, cur);
      }
    }

    const paymentMethodsDistribution: PaymentMethodDistributionItem[] = Array.from(
      pmMap.entries()
    )
      .map(([methodKey, v]) => ({
        methodKey,
        label: v.label,
        confirmedAmount: v.confirmedAmount,
        transactionsCount: v.transactionsCount,
        percentage:
          kpis.confirmedReceipts > 0
            ? round2((v.confirmedAmount / kpis.confirmedReceipts) * 100)
            : 0,
      }))
      .sort((a, b) => b.confirmedAmount - a.confirmedAmount);

    // =========================================================================
    // CHART 4: SALES BY MODALITY (DINE-IN, DELIVERY, PICKUP)
    // =========================================================================
    const modalitiesOrder: UnifiedFulfillmentType[] = ['dine_in', 'delivery', 'pickup'];
    const modalitiesDistribution: ModalityDistributionItem[] = modalitiesOrder.map((mod) => {
      const modOrders = validOrders.filter((o) => o.fulfillmentType === mod);
      const modGross = round2(modOrders.reduce((acc, o) => acc + o.grossTotal, 0));
      const modNet = round2(modOrders.reduce((acc, o) => acc + o.total, 0));
      const modPaid = round2(modOrders.reduce((acc, o) => acc + o.paidAmount, 0));
      return {
        modality: mod,
        label: UNIFIED_FULFILLMENT_LABELS[mod],
        ordersCount: modOrders.length,
        grossRevenue: modGross,
        netSales: modNet,
        confirmedReceipts: modPaid,
        percentageOfSales: kpis.netSales > 0 ? round2((modNet / kpis.netSales) * 100) : 0,
      };
    });

    // =========================================================================
    // CHART 5: TABLE PERFORMANCE (DESEMPENHO DAS MESAS NO PERÍODO)
    // =========================================================================
    const tablePerfMap = new Map<
      string,
      {
        tableId: string;
        tableNumber: string;
        tableName: string | null;
        ordersCount: number;
        sessionIds: Set<string>;
        revenue: number;
        confirmedReceipts: number;
        pendingAmount: number;
      }
    >();

    // Initialize with existing tables so all tables can be seen or ranked
    for (const [tid, t] of tableMap.entries()) {
      tablePerfMap.set(tid, {
        tableId: tid,
        tableNumber: t.table_number,
        tableName: t.name || null,
        ordersCount: 0,
        sessionIds: new Set<string>(),
        revenue: 0,
        confirmedReceipts: 0,
        pendingAmount: 0,
      });
    }

    let totalTableRevenue = 0;
    for (const o of validOrders) {
      if (o.fulfillmentType !== 'dine_in' || !o.tableId) continue;
      const tInfo = tableMap.get(o.tableId);
      const cur = tablePerfMap.get(o.tableId) || {
        tableId: o.tableId,
        tableNumber: o.tableNumber || tInfo?.table_number || '?',
        tableName: o.tableName || tInfo?.name || null,
        ordersCount: 0,
        sessionIds: new Set<string>(),
        revenue: 0,
        confirmedReceipts: 0,
        pendingAmount: 0,
      };
      cur.ordersCount += 1;
      if (o.sessionId) cur.sessionIds.add(o.sessionId);
      cur.revenue = round2(cur.revenue + o.total);
      cur.confirmedReceipts = round2(cur.confirmedReceipts + o.paidAmount);
      cur.pendingAmount = round2(cur.pendingAmount + o.pendingAmount);
      totalTableRevenue = round2(totalTableRevenue + o.total);
      tablePerfMap.set(o.tableId, cur);
    }

    const tablePerformance: TablePerformanceItem[] = Array.from(tablePerfMap.values())
      .map((t) => ({
        tableId: t.tableId,
        tableNumber: t.tableNumber,
        tableName: t.tableName,
        ordersCount: t.ordersCount,
        sessionsCount: t.sessionIds.size,
        revenue: t.revenue,
        confirmedReceipts: t.confirmedReceipts,
        pendingAmount: t.pendingAmount,
        averageTicket: t.ordersCount > 0 ? round2(t.revenue / t.ordersCount) : 0,
        sharePercentage:
          totalTableRevenue > 0 ? round2((t.revenue / totalTableRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue || b.ordersCount - a.ordersCount);

    // =========================================================================
    // CHART 6: TOP SELLING PRODUCTS (HISTORICAL ITEM SNAPSHOTS)
    // =========================================================================
    const prodMap = new Map<
      string,
      {
        productKey: string;
        productId: string | null;
        productName: string;
        variantName: string | null;
        quantitySold: number;
        revenueGenerated: number;
        orderIds: Set<string>;
      }
    >();

    let totalItemsRevenue = 0;

    for (const o of validOrders) {
      for (const item of o.items) {
        const key = `${item.productId || item.productName}__${item.variantName || ''}`;
        const itemRev = round2(Number(item.subtotal || item.unitPrice * item.quantity));
        const qty = Number(item.quantity || 0);
        if (qty <= 0) continue;

        const cur = prodMap.get(key) || {
          productKey: key,
          productId: item.productId || null,
          productName: item.productName,
          variantName: item.variantName || null,
          quantitySold: 0,
          revenueGenerated: 0,
          orderIds: new Set<string>(),
        };
        cur.quantitySold += qty;
        cur.revenueGenerated = round2(cur.revenueGenerated + itemRev);
        cur.orderIds.add(o.id);
        totalItemsRevenue = round2(totalItemsRevenue + itemRev);
        prodMap.set(key, cur);
      }
    }

    const allProductMetrics: TopProductItem[] = Array.from(prodMap.values()).map((p) => ({
      productKey: p.productKey,
      productId: p.productId,
      productName: p.productName,
      variantName: p.variantName,
      quantitySold: p.quantitySold,
      revenueGenerated: p.revenueGenerated,
      ordersCount: p.orderIds.size,
      averageUnitPrice:
        p.quantitySold > 0 ? round2(p.revenueGenerated / p.quantitySold) : 0,
      shareOfProductSales:
        totalItemsRevenue > 0
          ? round2((p.revenueGenerated / totalItemsRevenue) * 100)
          : 0,
    }));

    const topProductsByQuantity = [...allProductMetrics].sort(
      (a, b) => b.quantitySold - a.quantitySold || b.revenueGenerated - a.revenueGenerated
    );
    const topProductsByRevenue = [...allProductMetrics].sort(
      (a, b) => b.revenueGenerated - a.revenueGenerated || b.quantitySold - a.quantitySold
    );

    return {
      period: {
        preset: bounds.preset,
        startDate: bounds.startDate,
        endDate: bounds.endDate,
        timezone: DEFAULT_TIMEZONE,
        label: bounds.label,
      },
      lastUpdatedAt: new Date().toISOString(),
      kpis,
      charts: {
        evolutionDaily,
        evolutionWeekly,
        evolutionMonthly,
        operationalStatusDistribution,
        financialStatusDistribution,
        paymentMethodsDistribution,
        modalitiesDistribution,
        tablePerformance,
        topProductsByQuantity,
        topProductsByRevenue,
      },
      reportOrders: periodOrders,
    };
  }
}

export const restaurantAnalyticsService = new RestaurantAnalyticsService();
