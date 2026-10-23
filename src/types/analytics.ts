import { OrderStatus, FulfillmentType, PaymentMethodType, OrderItem, OrderDeliveryAddress } from './order.js';
import { RestaurantOrderStatus, TableStatus } from './restaurant.js';

export type PeriodPreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'custom'
  | 'all';

export type PeriodFilterPreset = PeriodPreset;

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  last_7_days: 'Últimos 7 dias',
  last_30_days: 'Últimos 30 dias',
  this_month: 'Este mês',
  last_month: 'Mês anterior',
  custom: 'Intervalo personalizado',
  all: 'Todo o histórico',
};

export type FinancialPaymentStatus =
  | 'paid'
  | 'partial'
  | 'pending'
  | 'unpaid'
  | 'cancelled';

export type OrderPaymentStatus = FinancialPaymentStatus;

export const FINANCIAL_PAYMENT_STATUS_LABELS: Record<FinancialPaymentStatus, string> = {
  paid: 'Pago',
  partial: 'Pago Parcial',
  pending: 'Pendente',
  unpaid: 'Não Pago',
  cancelled: 'Cancelado',
};

export const PAYMENT_STATUS_LABELS = FINANCIAL_PAYMENT_STATUS_LABELS;

export const FINANCIAL_PAYMENT_STATUS_COLORS: Record<
  FinancialPaymentStatus,
  { bg: string; text: string; border: string }
> = {
  paid: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  partial: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  pending: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  unpaid: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  cancelled: { bg: 'bg-slate-100', text: 'text-slate-400', border: 'border-slate-200' },
};

export const PAYMENT_STATUS_COLORS = FINANCIAL_PAYMENT_STATUS_COLORS;

export type UnifiedFulfillmentType = 'delivery' | 'pickup' | 'dine_in';

export const UNIFIED_FULFILLMENT_LABELS: Record<UnifiedFulfillmentType, string> = {
  delivery: 'Entrega',
  pickup: 'Retirada',
  dine_in: 'Consumo no Local',
};

export type OrderOriginChannel = 'online' | 'table' | 'counter';

export const ORDER_ORIGIN_LABELS: Record<OrderOriginChannel, string> = {
  online: 'Catálogo Online',
  table: 'Mesa (QR Code)',
  counter: 'Balcão / Interno',
};

export const FULFILLMENT_TYPE_LABELS = UNIFIED_FULFILLMENT_LABELS;
export const ORIGIN_CHANNEL_LABELS = ORDER_ORIGIN_LABELS;

export const OPERATIONAL_STATUS_LABELS: Record<string, string> = {
  NEW: 'Novo / Recebido',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Em Preparação',
  READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Saiu para Entrega',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
};

export const OPERATIONAL_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  NEW: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  CONFIRMED: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  PREPARING: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  READY: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  OUT_FOR_DELIVERY: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  COMPLETED: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  CANCELLED: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
};

export interface PaymentTransactionEntry {
  id: string;
  amount: number;
  paymentMethod: string;
  paymentMethodLabel?: string;
  paidAt: string;
  notes?: string | null;
  recordedBy?: string | null;
}

export type OrderPaymentRecord = PaymentTransactionEntry;

export interface OrderHistoryEvent {
  id: string;
  timestamp: string;
  type: 'status_change' | 'payment' | 'discount' | 'edit' | 'creation';
  status?: string;
  description: string;
  actorName?: string | null;
}

export interface UnifiedOrder {
  id: string;
  tenantId: string;
  source: 'online' | 'table';
  originChannel: OrderOriginChannel;
  originLabel?: string;
  orderNumber: number;
  formattedOrderNumber: string;
  displayCode?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  fulfillmentType: UnifiedFulfillmentType;
  fulfillmentLabel?: string;
  tableId?: string | null;
  tableLabel?: string;
  tableNumber?: string | null;
  tableName?: string | null;
  sessionId?: string | null;
  sessionCode?: string | null;
  operationalStatus: string; // OrderStatus or RestaurantOrderStatus
  rawStatus?: string;
  normalizedOperationalStatus:
    | 'NEW'
    | 'CONFIRMED'
    | 'PREPARING'
    | 'READY'
    | 'OUT_FOR_DELIVERY'
    | 'COMPLETED'
    | 'CANCELLED';
  operationalStatusLabel: string;
  paymentStatus: FinancialPaymentStatus;
  paymentStatusLabel?: string;
  paymentMethod: string;
  paymentMethodLabel: string;
  paidAt?: string | null;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  serviceFee: number;
  grossTotal: number; // subtotal + deliveryFee + serviceFee (antes de descontos)
  total: number; // valor líquido final (grossTotal - discount)
  paidAmount: number; // valor efetivamente recebido/confirmado
  pendingAmount: number; // saldo pendente a receber
  changeFor?: number | null;
  notes?: string | null;
  itemsCount?: number;
  itemsSummary?: string;
  items: Array<{
    id: string;
    productId?: string | null;
    variantId?: string | null;
    productName: string;
    variantName?: string | null;
    unitPrice: number;
    quantity: number;
    subtotal: number;
    notes?: string | null;
  }>;
  deliveryAddress?: OrderDeliveryAddress | null;
  payments: PaymentTransactionEntry[];
  history: OrderHistoryEvent[];
  createdAt: string;
  updatedAt: string;
}

export type FinancialReportRow = UnifiedOrder;

export interface AdvancedOrderFilterParams {
  period?: PeriodPreset;
  startDate?: string;
  endDate?: string;
  operationalStatus?: string; // 'all' or specific status
  paymentStatus?: FinancialPaymentStatus | 'all';
  paymentMethod?: string; // 'all' or specific method
  fulfillmentType?: UnifiedFulfillmentType | 'all' | string;
  tableId?: string; // 'all' or specific tableId / tableNumber
  orderNumber?: string;
  customerName?: string;
  customerPhone?: string;
  minAmount?: number | string;
  maxAmount?: number | string;
  originChannel?: OrderOriginChannel | 'all' | string;
  search?: string;
  sortBy?: 'date' | 'total' | 'status';
  sortOrder?: 'asc' | 'desc';
  sortDirection?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface PaginatedUnifiedOrdersResponse {
  orders: UnifiedOrder[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: {
    filteredGrossTotal: number;
    filteredNetTotal: number;
    filteredPaidTotal: number;
    filteredPendingTotal: number;
    filteredCount: number;
    grossTotal?: number;
    discountsTotal?: number;
    deliveryFeeTotal?: number;
    serviceFeeTotal?: number;
    netTotal?: number;
    paidTotal?: number;
    pendingTotal?: number;
    validCount?: number;
    cancelledCount?: number;
  };
  filteredTotals?: {
    grossTotal: number;
    netTotal: number;
    paidTotal: number;
    pendingTotal: number;
    count: number;
  };
}

export type TableVisualOperationalState =
  | 'free'
  | 'occupied'
  | 'preparing'
  | 'awaiting_payment'
  | 'closing';

export const TABLE_VISUAL_STATE_LABELS: Record<TableVisualOperationalState, string> = {
  free: 'Livre',
  occupied: 'Ocupada',
  preparing: 'Pedido em Preparação',
  awaiting_payment: 'Aguardando Pagamento',
  closing: 'Em Fechamento',
};

export const TABLE_VISUAL_STATE_COLORS: Record<
  TableVisualOperationalState,
  { bg: string; text: string; border: string; badgeBg: string; cardBg: string; cardBorder: string; badgeText: string }
> = {
  free: {
    bg: 'bg-emerald-50/60',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    badgeBg: 'bg-emerald-100 text-emerald-800',
    cardBg: 'bg-emerald-50/20',
    cardBorder: 'border-emerald-200',
    badgeText: 'text-emerald-700',
  },
  occupied: {
    bg: 'bg-blue-50/60',
    text: 'text-blue-700',
    border: 'border-blue-200',
    badgeBg: 'bg-blue-100 text-blue-800',
    cardBg: 'bg-blue-50/20',
    cardBorder: 'border-blue-200',
    badgeText: 'text-blue-700',
  },
  preparing: {
    bg: 'bg-amber-50/60',
    text: 'text-amber-700',
    border: 'border-amber-200',
    badgeBg: 'bg-amber-100 text-amber-800',
    cardBg: 'bg-amber-50/20',
    cardBorder: 'border-amber-200',
    badgeText: 'text-amber-700',
  },
  awaiting_payment: {
    bg: 'bg-purple-50/60',
    text: 'text-purple-700',
    border: 'border-purple-200',
    badgeBg: 'bg-purple-100 text-purple-800',
    cardBg: 'bg-purple-50/20',
    cardBorder: 'border-purple-200',
    badgeText: 'text-purple-700',
  },
  closing: {
    bg: 'bg-rose-50/60',
    text: 'text-rose-700',
    border: 'border-rose-200',
    badgeBg: 'bg-rose-100 text-rose-800',
    cardBg: 'bg-rose-50/20',
    cardBorder: 'border-rose-200',
    badgeText: 'text-rose-700',
  },
};

export interface EnrichedRestaurantTable {
  id: string;
  tenantId: string;
  tableNumber: string;
  name?: string | null;
  status: TableStatus;
  visualState: TableVisualOperationalState;
  visualStateLabel: string;
  isActive: boolean;
  notes?: string | null;
  qrCodeToken: string;
  currentSessionId?: string | null;
  currentSessionCode?: string | null;
  currentSessionOpenedAt?: string | null;
  closingRequestedAt?: string | null;
  occupationMinutes?: number | null;
  currentSessionSubtotal: number;
  currentSessionServiceFee: number;
  currentSessionDiscount: number;
  currentSessionTotal: number;
  currentSessionPaidAmount: number;
  currentSessionPendingAmount: number;
  currentSessionPaymentStatus: FinancialPaymentStatus;
  currentSessionPaymentMethod?: string | null;
  currentSessionOrdersCount: number;
  currentSessionOrderNumbers: string[];
  currentSessionPayments: PaymentTransactionEntry[];
  activeOrdersPreview: Array<{
    id: string;
    orderNumber: number;
    status: RestaurantOrderStatus;
    statusLabel: string;
    total: number;
    itemsSummary: string;
    createdAt: string;
  }>;
  activeSession?: {
    id: string;
    sessionCode: string;
    totalAmount: number;
    paidAmount: number;
    pendingAmount: number;
    ordersCount: number;
    paymentStatus: FinancialPaymentStatus;
    openedAt?: string | null;
  } | null;
  periodOrdersCount?: number;
  periodRevenue?: number;
  periodAvgTicket?: number;
  periodStats?: {
    ordersCount: number;
    revenue: number;
    averageTicket: number;
    lastActivityAt?: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface EnrichedTablesOverviewResponse {
  tables: EnrichedRestaurantTable[];
  summary: {
    totalTables: number;
    occupiedTables: number;
    freeTables: number;
    preparingTables: number;
    awaitingPaymentTables: number;
    closingTables: number;
    freeCount?: number;
    occupiedCount?: number;
    preparingCount?: number;
    awaitingPaymentCount?: number;
    closingCount?: number;
    totalOpenAmount?: number;
    totalPendingInOpenSessions?: number;
  };
}

export interface FinancialDashboardKPIs {
  grossRevenue: number; // Faturamento bruto dos pedidos válidos (produtos + taxas, antes de descontos)
  productsGrossRevenue: number; // Soma apenas dos produtos dos pedidos válidos (antes de descontos e sem taxas)
  discountsGranted: number; // Descontos concedidos nos pedidos válidos
  netSales: number; // Vendas líquidas após descontos (grossRevenue - discountsGranted)
  confirmedReceipts: number; // Recebimentos efetivamente confirmados no período
  receivablesPending: number; // Valores a receber (saldo pendente de pedidos válidos)
  averageTicket: number; // Ticket médio (netSales / validOrdersCount)
  validOrdersCount: number; // Quantidade de pedidos válidos no período
  cancelledOrdersCount: number; // Quantidade de pedidos cancelados no período
  cancelledOrdersAmount: number; // Valor total dos pedidos cancelados (apresentado separadamente)
  deliveryFeesTotal: number; // Total das taxas de entrega cobradas nos pedidos válidos
  serviceFeesTotal: number; // Total das taxas de serviço de mesa cobradas nos pedidos válidos
}

export interface SalesEvolutionPoint {
  dateKey: string;
  label: string;
  grossRevenue: number;
  netSales: number;
  confirmedReceipts: number;
  ordersCount: number;
}

export interface StatusDistributionItem {
  statusKey: string;
  label: string;
  count: number;
  amount: number;
  percentage: number;
}

export interface PaymentMethodDistributionItem {
  methodKey: string;
  label: string;
  confirmedAmount: number;
  transactionsCount: number;
  percentage: number;
}

export interface ModalityDistributionItem {
  modality: UnifiedFulfillmentType;
  label: string;
  ordersCount: number;
  grossRevenue: number;
  netSales: number;
  confirmedReceipts: number;
  percentageOfSales: number;
}

export interface TablePerformanceItem {
  tableId: string;
  tableNumber: string;
  tableName?: string | null;
  ordersCount: number;
  sessionsCount: number;
  revenue: number;
  confirmedReceipts: number;
  pendingAmount: number;
  averageTicket: number;
  sharePercentage: number;
  openSessionsCount?: number;
  closedSessionsCount?: number;
  totalRevenue?: number;
  confirmedRevenue?: number;
  avgOccupationMinutes?: number;
}

export interface TopProductItem {
  productKey: string;
  productId?: string | null;
  productName: string;
  variantName?: string | null;
  categoryName?: string | null;
  quantitySold: number;
  revenueGenerated: number;
  ordersCount: number;
  averageUnitPrice: number;
  averageHistoricalPrice?: number;
  totalRevenue?: number;
  revenueSharePercentage?: number;
  shareOfProductSales: number;
}

export interface FinancialDashboardResponse {
  period: {
    preset: PeriodPreset;
    startDate: string;
    endDate: string;
    timezone: string;
    label: string;
  };
  lastUpdatedAt: string;
  kpis: FinancialDashboardKPIs;
  charts: {
    evolutionDaily: SalesEvolutionPoint[];
    evolutionWeekly: SalesEvolutionPoint[];
    evolutionMonthly: SalesEvolutionPoint[];
    operationalStatusDistribution: StatusDistributionItem[];
    financialStatusDistribution: StatusDistributionItem[];
    paymentMethodsDistribution: PaymentMethodDistributionItem[];
    modalitiesDistribution: ModalityDistributionItem[];
    tablePerformance: TablePerformanceItem[];
    topProductsByQuantity: TopProductItem[];
    topProductsByRevenue: TopProductItem[];
  };
  reportOrders: UnifiedOrder[];
}

export type PaymentMethodChartPoint = PaymentMethodDistributionItem;
export type TablePerformancePoint = TablePerformanceItem;
export type TopSellingProductPoint = TopProductItem;
