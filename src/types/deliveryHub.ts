import { Order, DeliveryOriginAddress, OrderDispatchStatus, GeocodeStatus } from './order.js';

export type DriverAvailabilityStatus = 'available' | 'in_route' | 'unavailable';

export const DRIVER_STATUS_LABELS: Record<DriverAvailabilityStatus, string> = {
  available: 'Disponível',
  in_route: 'Em rota',
  unavailable: 'Indisponível',
};

export interface DeliveryDriver {
  id: string;
  tenantId: string;
  userId?: string | null;
  name: string;
  phone: string;
  email: string;
  photoUrl?: string | null;
  vehicleInfo?: string | null;
  plate?: string | null;
  isActive: boolean;
  availabilityStatus: DriverAvailabilityStatus;
  shareLocation: boolean;
  lastLatitude?: number | null;
  lastLongitude?: number | null;
  lastLocationAt?: string | null;
  activeRouteId?: string | null;
  activeRouteCode?: string | null;
  completedDeliveriesCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeliveryDriverPayload {
  name: string;
  phone: string;
  email: string;
  password?: string;
  photoUrl?: string | null;
  vehicleInfo?: string | null;
  plate?: string | null;
  isActive?: boolean;
  availabilityStatus?: DriverAvailabilityStatus;
}

export interface UpdateDeliveryDriverPayload {
  name?: string;
  phone?: string;
  email?: string;
  password?: string;
  photoUrl?: string | null;
  vehicleInfo?: string | null;
  plate?: string | null;
  isActive?: boolean;
  availabilityStatus?: DriverAvailabilityStatus;
}

export type DeliveryRouteStatus =
  | 'created'
  | 'assigned'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export const ROUTE_STATUS_LABELS: Record<DeliveryRouteStatus, string> = {
  created: 'Criada',
  assigned: 'Atribuída',
  accepted: 'Aceita',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

export type DeliveryStopStatus =
  | 'waiting'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed_attempt'
  | 'cancelled';

export const STOP_STATUS_LABELS: Record<DeliveryStopStatus, string> = {
  waiting: 'Aguardando saída',
  out_for_delivery: 'Saiu para entrega',
  delivered: 'Entregue',
  failed_attempt: 'Tentativa sem sucesso',
  cancelled: 'Cancelada',
};

export type DeliveryFailureReason =
  | 'customer_absent'
  | 'address_not_found'
  | 'customer_not_answered'
  | 'access_issue'
  | 'other';

export const FAILURE_REASON_LABELS: Record<DeliveryFailureReason, string> = {
  customer_absent: 'Cliente ausente',
  address_not_found: 'Endereço não localizado',
  customer_not_answered: 'Cliente não atendeu',
  access_issue: 'Problema no acesso',
  other: 'Outro motivo',
};

export interface DeliveryRouteStop {
  id: string;
  tenantId: string;
  routeId: string;
  orderId: string;
  orderNumber: number;
  formattedOrderNumber: string;
  stopSequence: number;
  status: DeliveryStopStatus;
  customerName: string;
  customerPhone: string;
  addressSummary: string;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  reference?: string | null;
  notes?: string | null;
  orderTotal: number;
  paymentMethod: string;
  changeFor?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  distanceFromPrevKm?: number | null;
  durationFromPrevMin?: number | null;
  cumulativeEtaMin?: number | null;
  trackingToken: string;
  trackingUrl?: string;
  startedAt?: string | null;
  deliveredAt?: string | null;
  failedAt?: string | null;
  failureReason?: DeliveryFailureReason | null;
  failureNotes?: string | null;
  whatsappNotificationStatus?: 'sent' | 'failed' | 'pending_gateway' | null;
  whatsappNotificationUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryRoute {
  id: string;
  tenantId: string;
  routeCode: string;
  name?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  status: DeliveryRouteStatus;
  totalStops: number;
  completedStops: number;
  failedStops: number;
  totalDistanceKm: number;
  estimatedDurationMin: number;
  originAddress?: DeliveryOriginAddress | null;
  qrToken: string;
  qrClaimUrl?: string;
  qrExpiresAt: string;
  qrRevokedAt?: string | null;
  assignedAt?: string | null;
  acceptedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  createdByUserId?: string | null;
  stops: DeliveryRouteStop[];
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryEvent {
  id: string;
  tenantId: string;
  routeId?: string | null;
  stopId?: string | null;
  orderId?: string | null;
  driverId?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
  eventType:
    | 'ROUTE_CREATED'
    | 'ROUTE_REORDERED'
    | 'STOP_REMOVED'
    | 'DRIVER_ASSIGNED'
    | 'QR_SCANNED'
    | 'QR_REVOKED'
    | 'ROUTE_STARTED'
    | 'STOP_OUT_FOR_DELIVERY'
    | 'STOP_DELIVERED'
    | 'STOP_FAILED_ATTEMPT'
    | 'ROUTE_COMPLETED'
    | 'ROUTE_CANCELLED'
    | 'WHATSAPP_NOTIFICATION_DISPATCHED';
  previousStatus?: string | null;
  newStatus?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

export interface DeliveryNotification {
  id: string;
  tenantId: string;
  orderId: string;
  routeId?: string | null;
  stopId?: string | null;
  eventType: 'out_for_delivery' | 'delivered' | 'failed_attempt';
  channel: 'whatsapp';
  recipientPhone: string;
  messageBody: string;
  trackingUrl: string;
  idempotencyKey: string;
  status: 'sent' | 'failed' | 'pending_gateway';
  providerConfirmed: boolean;
  providerName?: string | null;
  providerResponse?: Record<string, any> | null;
  errorMessage?: string | null;
  whatsappWebUrl: string;
  attemptsCount: number;
  sentAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchOrderItem extends Order {
  dispatchStatus: OrderDispatchStatus;
  geocodeStatus: GeocodeStatus;
  latitude: number | null;
  longitude: number | null;
  neighborhood: string;
  addressSummary: string;
  waitingMinutes: number;
  assignedDriverId: string | null;
  assignedDriverName: string | null;
  activeRouteId: string | null;
  activeRouteCode: string | null;
  activeStopId: string | null;
  activeStopSequence: number | null;
  activeStopStatus: DeliveryStopStatus | null;
  trackingToken: string | null;
  failureReason: DeliveryFailureReason | null;
  failureNotes: string | null;
}

export interface RouteClusterSuggestion {
  id: string;
  label: string;
  neighborhoods: string[];
  orderIds: string[];
  orderNumbers: string[];
  estimatedTotalDistanceKm: number;
  estimatedDurationMin: number;
  maxSpreadKm: number;
  oldestOrderMinutes: number;
  reason: string;
}

export interface DeliveryHubFilters {
  dispatchFilter?:
    | 'all'
    | 'waiting_dispatch'
    | 'ready_only'
    | 'assigned'
    | 'in_route'
    | 'delivered'
    | 'delivery_issue';
  neighborhood?: string;
  driverId?: string;
  search?: string;
}

export interface DeliveryHubOverview {
  originAddress: DeliveryOriginAddress | null;
  orders: DispatchOrderItem[];
  routes: DeliveryRoute[];
  drivers: DeliveryDriver[];
  clusterSuggestions: RouteClusterSuggestion[];
  neighborhoods: string[];
  stats: {
    waitingDispatchCount: number;
    readyForDispatchCount: number;
    assignedCount: number;
    inRouteCount: number;
    deliveredTodayCount: number;
    issuesCount: number;
    pendingGeocodeCount: number;
    availableDriversCount: number;
    driversInRouteCount: number;
    activeRoutesCount: number;
  };
}

export interface CreateDeliveryRoutePayload {
  orderIds: string[];
  driverId?: string | null;
  name?: string;
  optimizeOrder?: boolean;
}

export interface RoutePreviewResult {
  originAddress: DeliveryOriginAddress | null;
  orderedStops: Array<{
    orderId: string;
    orderNumber: number;
    formattedOrderNumber: string;
    customerName: string;
    neighborhood: string;
    addressSummary: string;
    latitude: number | null;
    longitude: number | null;
    geocodeStatus: GeocodeStatus;
    stopSequence: number;
    distanceFromPrevKm: number;
    durationFromPrevMin: number;
    cumulativeEtaMin: number;
  }>;
  totalDistanceKm: number;
  estimatedDurationMin: number;
  routeGeometry?: Array<[number, number]>;
  navigationProvider?: 'google' | 'osrm' | 'estimated';
}

export interface PublicDeliveryTrackingInfo {
  trackingToken: string;
  orderNumber: number;
  formattedOrderNumber: string;
  customerFirstName: string;
  tenantName: string;
  tenantSlug: string;
  tenantLogoUrl?: string | null;
  tenantPrimaryColor: string;
  tenantWhatsapp: string;
  tenantPhone: string;
  orderStatus: string;
  stopStatus: DeliveryStopStatus;
  stopStatusLabel: string;
  routeStatus: DeliveryRouteStatus;
  stopSequence: number;
  totalStopsInRoute: number;
  driverFirstName?: string | null;
  driverVehicleInfo?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  createdAt: string;
  startedAt?: string | null;
  deliveredAt?: string | null;
  failedAt?: string | null;
  failureReasonLabel?: string | null;
  estimatedArrivalMinutes?: number | null;
  estimatedArrivalTime?: string | null;
  liveDriverLocation?: {
    latitude: number;
    longitude: number;
    updatedAt: string;
  } | null;
  timeline: Array<{
    step: string;
    label: string;
    completed: boolean;
    active: boolean;
    timestamp?: string | null;
  }>;
}
