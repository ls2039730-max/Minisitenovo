export type TableStatus = 'available' | 'occupied' | 'closing';

export interface RestaurantTable {
  id: string;
  tenantId: string;
  tableNumber: string;
  name?: string | null;
  status: TableStatus;
  isActive: boolean;
  notes?: string | null;
  qrCodeToken: string;
  currentSessionId?: string | null;
  currentSessionTotal?: number;
  currentSessionOrdersCount?: number;
  currentSessionOpenedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RestaurantOrderStatus =
  | 'received'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export const RESTAURANT_STATUS_LABELS: Record<RestaurantOrderStatus, string> = {
  received: 'Recebido',
  confirmed: 'Confirmado',
  preparing: 'Em preparo',
  ready: 'Pronto',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

export const RESTAURANT_STATUS_COLORS: Record<
  RestaurantOrderStatus,
  { bg: string; text: string; border: string; dot: string }
> = {
  received: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  confirmed: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-500' },
  preparing: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  ready: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
  delivered: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  cancelled: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
};

export interface RestaurantOrderItem {
  id: string;
  orderId: string;
  tenantId: string;
  productId: string;
  variantId?: string | null;
  productName: string;
  variantName?: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  notes?: string | null;
  createdAt: string;
}

export interface RestaurantOrderStatusHistory {
  id: string;
  orderId: string;
  tenantId: string;
  status: RestaurantOrderStatus;
  notes?: string | null;
  changedBy?: string;
  createdAt: string;
}

export interface RestaurantOrder {
  id: string;
  tenantId: string;
  tableId: string;
  sessionId: string;
  orderNumber: number;
  customerName?: string | null;
  subtotal: number;
  total: number;
  status: RestaurantOrderStatus;
  notes?: string | null;
  idempotencyKey?: string | null;
  items: RestaurantOrderItem[];
  history?: RestaurantOrderStatusHistory[];
  tableNumber?: string;
  tableName?: string | null;
  tableStatus?: TableStatus;
  sessionCode?: string | null;
  sessionStatus?: 'open' | 'closed';
  sessionOpenedAt?: string | null;
  sessionClosedAt?: string | null;
  sessionClosingRequestedAt?: string | null;
  sessionTotalAmount?: number;
  sessionPaidAmount?: number;
  sessionPendingAmount?: number;
  sessionPaymentStatus?: 'paid' | 'partial' | 'pending' | 'unpaid' | null;
  sessionPaymentMethod?: string | null;
  isCurrentTableSession?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RestaurantFeeType = 'percentage' | 'fixed';

export interface RestaurantFeeTemplate {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  type: RestaurantFeeType;
  value: number;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantSessionFee {
  id: string;
  sessionId: string;
  tenantId: string;
  feeTemplateId?: string | null;
  name: string;
  description?: string | null;
  type: RestaurantFeeType;
  rateOrAmount: number;
  calculatedAmount: number;
  createdAt: string;
}

export interface AddSessionFeePayload {
  feeTemplateId?: string;
  name: string;
  description?: string;
  type: RestaurantFeeType;
  rateOrAmount: number;
}

export interface RestaurantSession {
  id: string;
  tenantId: string;
  tableId: string;
  sessionCode: string;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt?: string | null;
  closingRequestedAt?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: 'paid' | 'pending' | 'unpaid' | null;
  closedByUserId?: string | null;
  ordersSubtotal?: number;
  feesTotal?: number;
  totalAmount: number;
  notes?: string | null;
  tableNumber?: string;
  tableName?: string | null;
  orders?: RestaurantOrder[];
  ordersCount?: number;
  fees?: RestaurantSessionFee[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTablePayload {
  tableNumber: string;
  name?: string;
  notes?: string;
  isActive?: boolean;
}

export interface CreateTablesBatchPayload {
  startNumber: number;
  endNumber: number;
  prefix?: string;
  suffix?: string;
  namePrefix?: string;
}

export interface TableCartItemInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  notes?: string;
}

export interface CreateTableOrderPayload {
  tenantSlug: string;
  tableToken: string;
  customerName?: string;
  notes?: string;
  items: TableCartItemInput[];
  idempotencyKey?: string;
}

export interface PublicTableInfoResponse {
  success: boolean;
  tenant: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
    primaryColor?: string;
    whatsapp?: string;
    phone?: string;
  };
  table: {
    id: string;
    tableNumber: string;
    name?: string | null;
    status: TableStatus;
    qrCodeToken: string;
  };
  activeSession?: {
    id: string;
    sessionCode: string;
    openedAt: string;
    closingRequestedAt?: string | null;
    totalAmount: number;
    ordersCount: number;
  } | null;
}

export interface RestaurantSummary {
  totalTables: number;
  availableTables: number;
  occupiedTables: number;
  closingTables: number;
  activeOrdersToday: number;
  ordersPendingAction: number;
  totalRevenueToday: number;
}
