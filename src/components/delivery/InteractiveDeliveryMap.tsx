import React, { useState, useMemo, useRef } from 'react';
import {
  MapPin,
  Navigation,
  Store,
  Phone,
  Clock,
  CheckSquare,
  Square,
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertTriangle,
  Truck,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  DispatchOrderItem,
  DeliveryRoute,
  DeliveryDriver,
} from '../../types/deliveryHub';
import {
  DeliveryOriginAddress,
  OrderDispatchStatus,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../../types/order';
import { formatCurrency } from '../../utils/currency';

interface InteractiveDeliveryMapProps {
  originAddress: DeliveryOriginAddress | null;
  orders: DispatchOrderItem[];
  activeRoutes?: DeliveryRoute[];
  drivers?: DeliveryDriver[];
  selectedOrderIds: string[];
  onToggleSelectOrder: (orderId: string) => void;
  onRetryGeocode?: (orderId: string) => void;
  onOpenManualLocation?: (order: DispatchOrderItem) => void;
  showPhone?: boolean;
}

export const DISPATCH_STATUS_CONFIG: Record<
  OrderDispatchStatus,
  {
    label: string;
    hex: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    ringClass: string;
  }
> = {
  waiting_dispatch: {
    label: 'Aguardando despacho',
    hex: '#f97316', // Laranja
    bgClass: 'bg-orange-500',
    textClass: 'text-orange-700',
    borderClass: 'border-orange-300',
    ringClass: 'ring-orange-400',
  },
  assigned: {
    label: 'Atribuído a motoboy',
    hex: '#3b82f6', // Azul
    bgClass: 'bg-blue-600',
    textClass: 'text-blue-700',
    borderClass: 'border-blue-300',
    ringClass: 'ring-blue-400',
  },
  in_route: {
    label: 'Em rota de entrega',
    hex: '#8b5cf6', // Roxo
    bgClass: 'bg-purple-600',
    textClass: 'text-purple-700',
    borderClass: 'border-purple-300',
    ringClass: 'ring-purple-400',
  },
  delivered: {
    label: 'Entregue',
    hex: '#10b981', // Verde
    bgClass: 'bg-emerald-600',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-300',
    ringClass: 'ring-emerald-400',
  },
  delivery_issue: {
    label: 'Problema na entrega',
    hex: '#ef4444', // Vermelho
    bgClass: 'bg-rose-600',
    textClass: 'text-rose-700',
    borderClass: 'border-rose-300',
    ringClass: 'ring-rose-400',
  },
};

export const InteractiveDeliveryMap: React.FC<InteractiveDeliveryMapProps> = ({
  originAddress,
  orders,
  activeRoutes = [],
  drivers = [],
  selectedOrderIds,
  onToggleSelectOrder,
  onRetryGeocode,
  onOpenManualLocation,
  showPhone = true,
}) => {
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const geocodedOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          typeof o.latitude === 'number' &&
          typeof o.longitude === 'number' &&
          Number.isFinite(o.latitude) &&
          Number.isFinite(o.longitude)
      ),
    [orders]
  );

  const pendingOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.geocodeStatus === 'pending' ||
          typeof o.latitude !== 'number' ||
          typeof o.longitude !== 'number'
      ),
    [orders]
  );

  const liveDrivers = useMemo(
    () =>
      drivers.filter(
        (d) =>
          d.shareLocation &&
          d.activeRouteId &&
          typeof d.lastLatitude === 'number' &&
          typeof d.lastLongitude === 'number'
      ),
    [drivers]
  );

  // Compute bounding box for coordinate projection into 800x480 viewport
  const projection = useMemo(() => {
    const points: Array<{ lat: number; lng: number }> = [];
    if (
      originAddress &&
      typeof originAddress.latitude === 'number' &&
      typeof originAddress.longitude === 'number'
    ) {
      points.push({ lat: originAddress.latitude, lng: originAddress.longitude });
    }
    geocodedOrders.forEach((o) => {
      points.push({ lat: o.latitude!, lng: o.longitude! });
    });
    liveDrivers.forEach((d) => {
      points.push({ lat: d.lastLatitude!, lng: d.lastLongitude! });
    });

    if (points.length === 0) {
      return {
        hasPoints: false,
        project: (_lat: number, _lng: number) => ({ x: 400, y: 240 }),
      };
    }

    let minLat = Math.min(...points.map((p) => p.lat));
    let maxLat = Math.max(...points.map((p) => p.lat));
    let minLng = Math.min(...points.map((p) => p.lng));
    let maxLng = Math.max(...points.map((p) => p.lng));

    const latSpan = Math.max(0.008, maxLat - minLat);
    const lngSpan = Math.max(0.008, maxLng - minLng);

    minLat -= latSpan * 0.18;
    maxLat += latSpan * 0.18;
    minLng -= lngSpan * 0.18;
    maxLng += lngSpan * 0.18;

    const width = 800;
    const height = 460;

    return {
      hasPoints: true,
      project: (lat: number, lng: number) => {
        const nx = (lng - minLng) / (maxLng - minLng || 1);
        const ny = 1 - (lat - minLat) / (maxLat - minLat || 1);
        return {
          x: Math.round(60 + nx * (width - 120)),
          y: Math.round(50 + ny * (height - 100)),
        };
      },
    };
  }, [originAddress, geocodedOrders, liveDrivers]);

  const activeOrder = useMemo(
    () => orders.find((o) => o.id === activeOrderId) || null,
    [orders, activeOrderId]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-map-interactive="true"]')) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const originPoint =
    originAddress &&
    typeof originAddress.latitude === 'number' &&
    typeof originAddress.longitude === 'number'
      ? projection.project(originAddress.latitude, originAddress.longitude)
      : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Top Legend & Controls Bar */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-orange-500 inline-block shadow-xs" />
            Aguardando despacho
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-600 inline-block shadow-xs" />
            Atribuído
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-purple-600 inline-block shadow-xs" />
            Em rota
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-600 inline-block shadow-xs" />
            Entregue
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-600 inline-block shadow-xs" />
            Problema
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.4, Number((z + 0.25).toFixed(2))))}
            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition"
            title="Aproximar mapa"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.25).toFixed(2))))}
            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition"
            title="Afastar mapa"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition"
            title="Centralizar mapa"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Interactive Map Viewport */}
      <div
        className="relative w-full h-[380px] sm:h-[440px] bg-slate-100 overflow-hidden select-none cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          viewBox="0 0 800 460"
          className="w-full h-full"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <pattern id="delivery-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="1"
              />
            </pattern>
            <pattern id="delivery-subgrid" width="200" height="200" patternUnits="userSpaceOnUse">
              <rect width="200" height="200" fill="url(#delivery-grid)" />
              <path
                d="M 200 0 L 0 0 0 200"
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="1.5"
              />
            </pattern>
          </defs>

          {/* Background Cartographic Canvas */}
          <rect width="800" height="460" fill="#f8fafc" />
          <g
            transform={`translate(${400 + pan.x}, ${230 + pan.y}) scale(${zoom}) translate(-400, -230)`}
          >
            <rect x="-400" y="-400" width="1600" height="1260" fill="url(#delivery-subgrid)" />

            {/* Active Route Polylines */}
            {activeRoutes
              .filter((r) => ['created', 'assigned', 'accepted', 'in_progress'].includes(r.status))
              .map((route) => {
                const routeCoords: Array<{ x: number; y: number }> = [];
                if (originPoint) routeCoords.push(originPoint);
                route.stops.forEach((st) => {
                  if (typeof st.latitude === 'number' && typeof st.longitude === 'number') {
                    routeCoords.push(projection.project(st.latitude, st.longitude));
                  }
                });
                if (routeCoords.length < 2) return null;
                const pointsStr = routeCoords.map((pt) => `${pt.x},${pt.y}`).join(' ');
                return (
                  <g key={route.id}>
                    <polyline
                      points={pointsStr}
                      fill="none"
                      stroke={route.status === 'in_progress' ? '#8b5cf6' : '#3b82f6'}
                      strokeWidth="3.5"
                      strokeDasharray={route.status === 'in_progress' ? 'none' : '8 6'}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.75"
                    />
                  </g>
                );
              })}

            {/* Selected Orders Preview Line from Origin */}
            {selectedOrderIds.length > 0 && originPoint && (
              <g>
                {geocodedOrders
                  .filter((o) => selectedOrderIds.includes(o.id))
                  .map((o) => {
                    const pt = projection.project(o.latitude!, o.longitude!);
                    return (
                      <line
                        key={`sel-line-${o.id}`}
                        x1={originPoint.x}
                        y1={originPoint.y}
                        x2={pt.x}
                        y2={pt.y}
                        stroke="#f97316"
                        strokeWidth="2.5"
                        strokeDasharray="5 5"
                        opacity="0.7"
                      />
                    );
                  })}
              </g>
            )}

            {/* Restaurant Origin Pin */}
            {originPoint && (
              <g transform={`translate(${originPoint.x}, ${originPoint.y})`}>
                <circle r="22" fill="#0f172a" fillOpacity="0.12" />
                <circle r="14" fill="#0f172a" stroke="#ffffff" strokeWidth="3" />
                <text
                  y="4"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="10"
                  fontWeight="bold"
                >
                  HQ
                </text>
                <rect
                  x="-46"
                  y="18"
                  width="92"
                  height="18"
                  rx="6"
                  fill="#0f172a"
                />
                <text
                  x="0"
                  y="30"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="9"
                  fontWeight="600"
                >
                  Restaurante
                </text>
              </g>
            )}

            {/* Live Driver Pins (Etapa 10) */}
            {liveDrivers.map((d) => {
              const pt = projection.project(d.lastLatitude!, d.lastLongitude!);
              return (
                <g key={`driver-${d.id}`} transform={`translate(${pt.x}, ${pt.y})`}>
                  <circle r="18" fill="#4f46e5" fillOpacity="0.2" />
                  <circle r="12" fill="#4f46e5" stroke="#ffffff" strokeWidth="2.5" />
                  <text y="4" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
                    M
                  </text>
                  <rect x="-45" y="-30" width="90" height="16" rx="4" fill="#312e81" />
                  <text x="0" y="-19" textAnchor="middle" fill="#ffffff" fontSize="8.5" fontWeight="600">
                    {d.name.split(' ')[0]} ({d.activeRouteCode})
                  </text>
                </g>
              );
            })}

            {/* Order Markers */}
            {geocodedOrders.map((order) => {
              const pt = projection.project(order.latitude!, order.longitude!);
              const cfg = DISPATCH_STATUS_CONFIG[order.dispatchStatus];
              const isSelected = selectedOrderIds.includes(order.id);
              const isActive = activeOrderId === order.id;

              return (
                <g
                  key={order.id}
                  transform={`translate(${pt.x}, ${pt.y})`}
                  data-map-interactive="true"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveOrderId(order.id);
                  }}
                >
                  {(isSelected || isActive) && (
                    <circle
                      r="24"
                      fill={cfg.hex}
                      fillOpacity="0.25"
                      stroke={cfg.hex}
                      strokeWidth="2"
                    />
                  )}
                  <circle
                    r={isSelected ? 16 : 14}
                    fill={cfg.hex}
                    stroke={isSelected ? '#0f172a' : '#ffffff'}
                    strokeWidth={isSelected ? 3.5 : 2.5}
                  />
                  <text
                    y="4"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="9.5"
                    fontWeight="bold"
                  >
                    {order.activeStopSequence
                      ? `${order.activeStopSequence}º`
                      : order.formattedOrderNumber}
                  </text>
                  <rect
                    x="-38"
                    y="18"
                    width="76"
                    height="17"
                    rx="5"
                    fill="#ffffff"
                    stroke="#cbd5e1"
                    strokeWidth="1"
                  />
                  <text
                    x="0"
                    y="29"
                    textAnchor="middle"
                    fill="#1e293b"
                    fontSize="8.5"
                    fontWeight="700"
                  >
                    {order.formattedOrderNumber} • {order.neighborhood.slice(0, 8)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Empty State Overlay when no geocoded orders exist */}
        {geocodedOrders.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/5 backdrop-blur-[1px] p-6 text-center pointer-events-none">
            <div className="bg-white/95 border border-slate-200 rounded-2xl px-6 py-5 shadow-sm max-w-md">
              <MapPin className="w-8 h-8 text-indigo-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800">
                {orders.length === 0
                  ? 'Nenhum pedido de entrega para os filtros selecionados'
                  : 'Pedidos aguardando geocodificação de coordenadas'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {orders.length === 0
                  ? 'Assim que novos pedidos de delivery entrarem, eles aparecerão posicionados automaticamente no mapa.'
                  : 'Use o botão "Localizar" ou "Ajustar Coordenadas" nos pedidos com localização pendente abaixo.'}
              </p>
            </div>
          </div>
        )}

        {/* Selected Order Popup Card inside Map (Etapa 1) */}
        {activeOrder && (
          <div
            data-map-interactive="true"
            className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 z-20 animate-in fade-in slide-in-from-bottom-2"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-slate-900">
                    Pedido {activeOrder.formattedOrderNumber}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-white"
                    style={{
                      backgroundColor: DISPATCH_STATUS_CONFIG[activeOrder.dispatchStatus].hex,
                    }}
                  >
                    {DISPATCH_STATUS_CONFIG[activeOrder.dispatchStatus].label}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Status do pedido: {ORDER_STATUS_LABELS[activeOrder.status]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveOrderId(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 text-xs text-slate-700 border-t border-slate-100 pt-2.5">
              <div className="font-semibold text-slate-900">{activeOrder.customerName}</div>
              <div className="flex items-start gap-1.5 text-slate-600">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  {activeOrder.addressSummary} — <strong>{activeOrder.neighborhood}</strong>
                </span>
              </div>
              {showPhone && activeOrder.customerPhone && (
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <a
                    href={`tel:${activeOrder.customerPhone}`}
                    className="text-indigo-600 hover:underline font-medium"
                  >
                    {activeOrder.customerPhone}
                  </a>
                </div>
              )}
              <div className="flex items-center justify-between pt-1">
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Clock className="w-3.5 h-3.5" />
                  Há {activeOrder.waitingMinutes} min
                </span>
                <span className="font-bold text-slate-900 text-sm">
                  {formatCurrency(activeOrder.total)} ({PAYMENT_METHOD_LABELS[activeOrder.paymentMethod]})
                </span>
              </div>
              {activeOrder.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-amber-800 text-[11px]">
                  <strong>Obs:</strong> {activeOrder.notes}
                </div>
              )}
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
              {activeOrder.dispatchStatus === 'waiting_dispatch' ||
              activeOrder.dispatchStatus === 'delivery_issue' ? (
                <button
                  type="button"
                  onClick={() => onToggleSelectOrder(activeOrder.id)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                    selectedOrderIds.includes(activeOrder.id)
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {selectedOrderIds.includes(activeOrder.id) ? (
                    <>
                      <CheckSquare className="w-4 h-4" />
                      Selecionado para Rota
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4" />
                      Selecionar para Rota
                    </>
                  )}
                </button>
              ) : (
                <span className="text-xs text-slate-500 font-medium">
                  {activeOrder.activeRouteCode
                    ? `Vinculado à ${activeOrder.activeRouteCode}`
                    : 'Pedido já processado'}
                </span>
              )}

              {activeOrder.latitude && activeOrder.longitude && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${activeOrder.latitude},${activeOrder.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir GPS
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pending Geocoding Banner (Etapa 1 & 11: Never invent coordinates; show "Localização pendente") */}
      {pendingOrders.length > 0 && (
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>{pendingOrders.length}</strong>{' '}
              {pendingOrders.length === 1
                ? 'pedido está com "Localização pendente"'
                : 'pedidos estão com "Localização pendente"'}{' '}
              (sem coordenadas no mapa, mas liberados para despacho).
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {pendingOrders.slice(0, 3).map((po) => (
              <div key={po.id} className="inline-flex items-center gap-1 bg-white border border-amber-300 rounded-lg px-2 py-1 text-xs">
                <span className="font-bold text-slate-800">{po.formattedOrderNumber}</span>
                {onRetryGeocode && (
                  <button
                    type="button"
                    onClick={() => onRetryGeocode(po.id)}
                    className="text-indigo-600 hover:underline font-medium ml-1"
                  >
                    Geocodificar
                  </button>
                )}
                {onOpenManualLocation && (
                  <button
                    type="button"
                    onClick={() => onOpenManualLocation(po)}
                    className="text-amber-700 hover:underline font-medium ml-1"
                  >
                    Ajustar
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
