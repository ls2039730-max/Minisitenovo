import { Product, ProductVariant } from './product';

export type OrderStatus =
  | 'NEW'
  | 'IN_SERVICE'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'CANCELLED';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Novo',
  IN_SERVICE: 'Em atendimento',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Preparando',
  READY_FOR_PICKUP: 'Pronto para retirada',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, { bg: string; text: string; border: string }> = {
  NEW: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  IN_SERVICE: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  CONFIRMED: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  PREPARING: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  READY_FOR_PICKUP: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  OUT_FOR_DELIVERY: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  COMPLETED: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  CANCELLED: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
};

export type FulfillmentType = 'pickup' | 'delivery';

export type PaymentMethodType =
  | 'PIX'
  | 'CASH'
  | 'CREDIT_CARD_ON_DELIVERY'
  | 'DEBIT_CARD_ON_DELIVERY'
  | 'PAYMENT_ON_PICKUP';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  PIX: 'PIX (pagamento direto)',
  CASH: 'Dinheiro',
  CREDIT_CARD_ON_DELIVERY: 'Cartão de Crédito',
  DEBIT_CARD_ON_DELIVERY: 'Cartão de Débito',
  PAYMENT_ON_PICKUP: 'Pagar no balcão',
};

export type DeliveryRuleType = 'fixed' | 'neighborhood' | 'cep_range';

export interface DeliverySettings {
  tenantId: string;
  ordersEnabled: boolean;
  acceptOrdersWhenClosed: boolean;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  minimumOrder: number;
  freeDeliveryAbove?: number | null;
  pickupInstructions?: string | null;
  deliveryEstimateText?: string | null;
  orderWhatsappNumber?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryRule {
  id: string;
  tenantId: string;
  type: DeliveryRuleType;
  name: string;
  neighborhood?: string | null;
  cepStart?: string | null;
  cepEnd?: string | null;
  fee: number;
  minimumOrder?: number | null;
  isActive: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethodConfig {
  id: string;
  tenantId: string;
  type: PaymentMethodType;
  label: string;
  isActive: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

// Client Cart Item (sent to server or saved in local storage)
export interface CartItemInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  productName?: string;
  variantName?: string | null;
  imageUrl?: string | null;
  unitPrice?: number | null;
  originalPrice?: number | null;
  hasDiscount?: boolean;
  maxAvailableQuantity?: number;
}

// Validated Item returned from server
export interface ValidatedCartItem {
  id: string;
  productId: string;
  variantId?: string | null;
  productName: string;
  variantName?: string | null;
  imageUrl?: string | null;
  unitPrice: number;
  originalPrice?: number | null;
  hasDiscount: boolean;
  quantity: number;
  subtotal: number;
  maxAvailableQuantity?: number;
  warning?: 'price_changed' | 'stock_adjusted' | 'item_disabled' | null;
}

export interface ValidatedCartResponse {
  items: ValidatedCartItem[];
  subtotal: number;
  itemCount: number;
  warnings: string[];
  tenant: {
    id: string;
    name: string;
    slug: string;
    address?: string;
  };
  deliverySettings: DeliverySettings;
  deliveryRules: DeliveryRule[];
  paymentMethods: PaymentMethodConfig[];
  isOpen: boolean;
  canAcceptOrders: boolean;
  closedNotice?: string;
}

export interface OrderDeliveryAddress {
  id?: string;
  orderId?: string;
  cep: string;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  reference?: string | null;
  deliveryRuleId?: string | null;
}

export interface OrderItem {
  id: string;
  orderId: string;
  tenantId: string;
  productId?: string | null;
  variantId?: string | null;
  productName: string;
  variantName?: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  createdAt: string;
}

export interface Order {
  id: string;
  tenantId: string;
  orderNumber: number;
  formattedOrderNumber: string; // e.g. #1001
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  fulfillmentType: FulfillmentType;
  paymentMethod: PaymentMethodType;
  changeFor?: number | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  notes?: string | null;
  idempotencyKey?: string | null;
  whatsappSentAt?: string | null;
  items: OrderItem[];
  deliveryAddress?: OrderDeliveryAddress | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderPayload {
  items: CartItemInput[];
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  fulfillmentType: FulfillmentType;
  deliveryAddress?: {
    cep: string;
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    reference?: string;
  };
  paymentMethod: PaymentMethodType;
  changeFor?: number;
  notes?: string;
  idempotencyKey?: string;
}

export interface OrderFilterParams {
  search?: string;
  status?: OrderStatus | 'all';
  fulfillmentType?: FulfillmentType | 'all';
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface OrdersSummary {
  ordersTodayCount: number;
  ordersNewCount: number;
  ordersCompletedCount: number;
  ordersTodayTotal: number;
  totalOrdersCount: number;
}

export interface CepLookupResult {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  found: boolean;
}
