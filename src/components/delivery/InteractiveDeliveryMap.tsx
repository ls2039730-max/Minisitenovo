import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Navigation,
  Store,
  Bike,
  AlertTriangle,
  Plus,
  Minus,
  Maximize2,
  Check,
  Route as RouteIcon,
  Layers,
  Crosshair,
  Clock,
  User,
  ExternalLink,
  X,
} from 'lucide-react';
import {
  DispatchOrderItem,
  DeliveryRoute,
  DeliveryDriver,
  RoutePreviewResult,
} from '../../types/deliveryHub';
import {
  DeliveryOriginAddress,
  OrderDispatchStatus,
} from '../../types/order';
import {
  getBuildTimeGoogleMapsKey,
  resolveFrontendGoogleMapsConfig,
} from '../../utils/googleMapsConfig';

interface InteractiveDeliveryMapProps {
  originAddress: DeliveryOriginAddress | null;
  orders: DispatchOrderItem[];
  routes: DeliveryRoute[];
  drivers: DeliveryDriver[];
  selectedOrderIds: string[];
  onToggleSelectOrder: (orderId: string) => void;
  onSelectClusterOrders?: (orderIds: string[]) => void;
  onRequestManualGeocode?: (order: DispatchOrderItem) => void;
  focusedOrderId?: string | null;
  onFocusOrder?: (orderId: string | null) => void;
  liveRoutePreview?: RoutePreviewResult | null;
  liveRouteLoading?: boolean;
  onOpenRouteModal?: () => void;
}

export const DISPATCH_PIN_COLORS: Record<
  OrderDispatchStatus,
  { bg: string; border: string; text: string; badgeBg: string; label: string }
> = {
  waiting_dispatch: {
    bg: '#f97316', // Laranja: aguardando despacho
    border: '#c2410c',
    text: '#ffffff',
    badgeBg: 'bg-orange-500',
    label: 'Aguardando despacho',
  },
  assigned: {
    bg: '#3b82f6', // Azul: atribuído ao motoboy
    border: '#1d4ed8',
    text: '#ffffff',
    badgeBg: 'bg-blue-500',
    label: 'Atribuído ao motoboy',
  },
  in_route: {
    bg: '#8b5cf6', // Roxo: em rota
    border: '#6d28d9',
    text: '#ffffff',
    badgeBg: 'bg-purple-500',
    label: 'Em rota',
  },
  delivered: {
    bg: '#10b981', // Verde: entregue
    border: '#047857',
    text: '#ffffff',
    badgeBg: 'bg-emerald-500',
    label: 'Entregue',
  },
  delivery_issue: {
    bg: '#ef4444', // Vermelho: problema na entrega
    border: '#b91c1c',
    text: '#ffffff',
    badgeBg: 'bg-red-500',
    label: 'Problema na entrega',
  },
};

export const DISPATCH_STATUS_CONFIG: Record<
  OrderDispatchStatus,
  { hex: string; borderHex: string; label: string }
> = {
  waiting_dispatch: {
    hex: '#f97316',
    borderHex: '#c2410c',
    label: 'Aguardando despacho',
  },
  assigned: {
    hex: '#3b82f6',
    borderHex: '#1d4ed8',
    label: 'Atribuído ao motoboy',
  },
  in_route: {
    hex: '#8b5cf6',
    borderHex: '#6d28d9',
    label: 'Em rota',
  },
  delivered: {
    hex: '#10b981',
    borderHex: '#047857',
    label: 'Entregue',
  },
  delivery_issue: {
    hex: '#ef4444',
    borderHex: '#b91c1c',
    label: 'Problema na entrega',
  },
};

const ROUTE_LINE_PALETTE = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#0ea5e9', // Sky
  '#ec4899', // Pink
  '#14b8a6', // Teal
];

// Default fallback center (São Paulo center) only when restaurant & orders have no coordinates yet
const DEFAULT_MAP_CENTER: [number, number] = [-23.55052, -46.63331];

const TILE_LAYERS = {
  voyager: {
    name: 'Mapa Logístico (Ruas & Bairros)',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  google_roadmap: {
    name: 'Google Maps (Ruas & Avenidas)',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=pt-BR',
    attribution: '&copy; Google Maps',
  },
  osm: {
    name: 'OpenStreetMap Padrão',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
};

function isValidCoord(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const InteractiveDeliveryMap: React.FC<InteractiveDeliveryMapProps> = ({
  originAddress,
  orders,
  routes,
  drivers,
  selectedOrderIds,
  onToggleSelectOrder,
  onRequestManualGeocode,
  focusedOrderId,
  onFocusOrder,
  liveRoutePreview,
  liveRouteLoading,
  onOpenRouteModal,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routesLayerRef = useRef<L.LayerGroup | null>(null);
  const hasInitializedBoundsRef = useRef(false);

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [showRouteLines, setShowRouteLines] = useState<boolean>(true);
  const [tileStyle, setTileStyle] = useState<'voyager' | 'google_roadmap' | 'osm'>('voyager');
  const [mapReady, setMapReady] = useState<boolean>(false);
  const [googleMapsStatus, setGoogleMapsStatus] = useState<
    'checking' | 'configured' | 'not_configured' | 'auth_error'
  >(() => (getBuildTimeGoogleMapsKey() ? 'configured' : 'checking'));

  // Resolve Google Maps API key from build-time VITE_GOOGLE_MAPS_API_KEY (or bridged GOOGLE_MAPS_API_KEY)
  // and fallback to runtime /api/config so the map never displays "API Key required".
  useEffect(() => {
    let mounted = true;
    resolveFrontendGoogleMapsConfig().then((cfg) => {
      if (!mounted) return;
      if (cfg.configured && cfg.apiKey) {
        setGoogleMapsStatus('configured');
      } else {
        setGoogleMapsStatus('not_configured');
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const validOrigin = useMemo(() => {
    if (originAddress && isValidCoord(originAddress.latitude, originAddress.longitude)) {
      return {
        lat: Number(originAddress.latitude),
        lng: Number(originAddress.longitude),
        label: `${originAddress.street}, ${originAddress.number} — ${originAddress.neighborhood}`,
      };
    }
    return null;
  }, [originAddress]);

  const geocodedOrders = useMemo(
    () => orders.filter((o) => isValidCoord(o.latitude, o.longitude)),
    [orders]
  );

  const pendingGeocodeOrders = useMemo(
    () =>
      orders.filter(
        (o) => !isValidCoord(o.latitude, o.longitude) && o.dispatchStatus !== 'delivered'
      ),
    [orders]
  );

  const activeDriversWithGps = useMemo(
    () =>
      drivers.filter(
        (d) => d.isActive && d.shareLocation && isValidCoord(d.lastLatitude, d.lastLongitude)
      ),
    [drivers]
  );

  // Map orderId -> sequence number in live route preview (when 2+ orders are selected)
  const previewStopSequenceByOrderId = useMemo(() => {
    const map = new Map<string, number>();
    if (liveRoutePreview && liveRoutePreview.orderedStops.length > 0) {
      for (const stop of liveRoutePreview.orderedStops) {
        map.set(stop.orderId, stop.stopSequence);
      }
    } else if (selectedOrderIds.length > 0) {
      selectedOrderIds.forEach((id, idx) => {
        map.set(id, idx + 1);
      });
    }
    return map;
  }, [liveRoutePreview, selectedOrderIds]);

  const activeOrder = useMemo(
    () => orders.find((o) => o.id === activeOrderId) || null,
    [orders, activeOrderId]
  );

  // Fit all orders + restaurant origin in viewport
  const handleFitAllOrders = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    const points: Array<[number, number]> = [];
    if (validOrigin) {
      points.push([validOrigin.lat, validOrigin.lng]);
    }
    for (const o of geocodedOrders) {
      points.push([Number(o.latitude), Number(o.longitude)]);
    }
    for (const d of activeDriversWithGps) {
      points.push([Number(d.lastLatitude), Number(d.lastLongitude)]);
    }

    if (points.length === 0) {
      map.setView(DEFAULT_MAP_CENTER, 13, { animate: true });
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], 15, { animate: true });
      return;
    }

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, {
      padding: [56, 56],
      maxZoom: 16,
      animate: true,
    });
  }, [validOrigin, geocodedOrders, activeDriversWithGps]);

  // Center on restaurant origin
  const handleCenterOnOrigin = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    if (validOrigin) {
      map.setView([validOrigin.lat, validOrigin.lng], 15, { animate: true });
    } else {
      handleFitAllOrders();
    }
  }, [validOrigin, handleFitAllOrders]);

  const handleZoomIn = useCallback(() => {
    leafletMapRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    leafletMapRef.current?.zoomOut();
  }, []);

  // Initialize Leaflet Interactive Street Map
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || leafletMapRef.current) return;

    const initialCenter: [number, number] = validOrigin
      ? [validOrigin.lat, validOrigin.lng]
      : geocodedOrders.length > 0
      ? [Number(geocodedOrders[0].latitude), Number(geocodedOrders[0].longitude)]
      : DEFAULT_MAP_CENTER;

    const map = L.map(container, {
      center: initialCenter,
      zoom: 14,
      zoomControl: false,
      attributionControl: true,
    });

    const tileCfg = TILE_LAYERS[tileStyle];
    const tileLayer = L.tileLayer(tileCfg.url, {
      attribution: tileCfg.attribution,
      maxZoom: 19,
      subdomains: 'abcd',
    });

    // Automatic fallback to standard OpenStreetMap if CARTO tile server errors
    tileLayer.on('tileerror', () => {
      if (tileStyle === 'voyager') {
        setTileStyle('osm');
      }
    });

    tileLayer.addTo(map);

    const routesLayer = L.layerGroup().addTo(map);
    const markersLayer = L.layerGroup().addTo(map);

    leafletMapRef.current = map;
    tileLayerRef.current = tileLayer;
    routesLayerRef.current = routesLayer;
    markersLayerRef.current = markersLayer;
    setMapReady(true);

    // Ensure container size changes (responsive layout / tab switch) always trigger invalidateSize
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      leafletMapRef.current = null;
      tileLayerRef.current = null;
      routesLayerRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Switch tile style when user toggles layer
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const tileCfg = TILE_LAYERS[tileStyle];
    const newTileLayer = L.tileLayer(tileCfg.url, {
      attribution: tileCfg.attribution,
      maxZoom: 19,
    });
    newTileLayer.addTo(map);
    tileLayerRef.current = newTileLayer;
  }, [tileStyle]);

  // Fit bounds automatically the first time coordinates arrive
  useEffect(() => {
    if (!mapReady || hasInitializedBoundsRef.current) return;
    if (validOrigin || geocodedOrders.length > 0) {
      hasInitializedBoundsRef.current = true;
      handleFitAllOrders();
    }
  }, [mapReady, validOrigin, geocodedOrders.length, handleFitAllOrders]);

  // Synchronize external focus request (clicking an order in the side list)
  useEffect(() => {
    if (!focusedOrderId || !leafletMapRef.current) return;
    const targetOrder = orders.find((o) => o.id === focusedOrderId);
    if (!targetOrder) return;

    setActiveOrderId(targetOrder.id);

    if (isValidCoord(targetOrder.latitude, targetOrder.longitude)) {
      leafletMapRef.current.setView(
        [Number(targetOrder.latitude), Number(targetOrder.longitude)],
        Math.max(leafletMapRef.current.getZoom(), 16),
        { animate: true }
      );
    }
  }, [focusedOrderId, orders]);

  // Render Route Polylines (Active Routes + Live Selected Multi-Order Route Preview)
  useEffect(() => {
    const routesLayer = routesLayerRef.current;
    if (!routesLayer) return;

    routesLayer.clearLayers();

    // 1. Active dispatched routes
    if (showRouteLines) {
      const activeRoutes = routes.filter((r) =>
        ['created', 'assigned', 'accepted', 'in_progress'].includes(r.status)
      );

      activeRoutes.forEach((route, idx) => {
        const color = ROUTE_LINE_PALETTE[idx % ROUTE_LINE_PALETTE.length];
        const coords: Array<[number, number]> = [];

        if (validOrigin) {
          coords.push([validOrigin.lat, validOrigin.lng]);
        }

        const sortedStops = [...route.stops]
          .filter((s) => s.status !== 'cancelled' && isValidCoord(s.latitude, s.longitude))
          .sort((a, b) => a.stopSequence - b.stopSequence);

        for (const stop of sortedStops) {
          coords.push([Number(stop.latitude), Number(stop.longitude)]);
        }

        if (coords.length >= 2) {
          // Outer white halo for contrast over streets
          L.polyline(coords, {
            color: '#ffffff',
            weight: 6,
            opacity: 0.75,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(routesLayer);

          // Colored dashed line for dispatched route
          L.polyline(coords, {
            color,
            weight: 3.5,
            opacity: 0.85,
            dashArray: route.status === 'in_progress' ? undefined : '8, 6',
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(routesLayer);
        }
      });
    }

    // 2. Live Route Preview when 2+ orders are selected
    if (selectedOrderIds.length >= 2) {
      let previewCoords: Array<[number, number]> = [];

      if (
        liveRoutePreview &&
        Array.isArray(liveRoutePreview.routeGeometry) &&
        liveRoutePreview.routeGeometry.length >= 2
      ) {
        previewCoords = liveRoutePreview.routeGeometry;
      } else {
        if (validOrigin) {
          previewCoords.push([validOrigin.lat, validOrigin.lng]);
        }
        for (const id of selectedOrderIds) {
          const ord = geocodedOrders.find((o) => o.id === id);
          if (ord && isValidCoord(ord.latitude, ord.longitude)) {
            previewCoords.push([Number(ord.latitude), Number(ord.longitude)]);
          }
        }
      }

      if (previewCoords.length >= 2) {
        // White high-contrast casing
        L.polyline(previewCoords, {
          color: '#ffffff',
          weight: 9,
          opacity: 0.92,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(routesLayer);

        // Primary Indigo route polyline
        L.polyline(previewCoords, {
          color: '#4f46e5',
          weight: 5,
          opacity: 0.95,
          dashArray:
            liveRoutePreview?.navigationProvider === 'estimated' ? '10, 8' : undefined,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(routesLayer);
      }
    }
  }, [
    routes,
    showRouteLines,
    validOrigin,
    selectedOrderIds,
    liveRoutePreview,
    geocodedOrders,
  ]);

  // Render Markers (Restaurant Origin, Live GPS Drivers, and Numbered Order Pins)
  useEffect(() => {
    const markersLayer = markersLayerRef.current;
    if (!markersLayer) return;

    markersLayer.clearLayers();

    // 1. Restaurant Origin Marker
    if (validOrigin) {
      const originHtml = `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
          <div style="background:#0f172a;color:#ffffff;border:2.5px solid #ffffff;border-radius:9999px;padding:4px 10px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 6px 16px rgba(15,23,42,0.35);display:flex;align-items:center;gap:5px;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:#38bdf8;"></span>
            <span>Restaurante (Origem)</span>
          </div>
          <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid #0f172a;margin-top:-1px;"></div>
        </div>
      `;

      const originIcon = L.divIcon({
        className: 'custom-delivery-marker',
        html: originHtml,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([validOrigin.lat, validOrigin.lng], {
        icon: originIcon,
        zIndexOffset: 900,
      });
      marker.bindTooltip(`Restaurante: ${escapeHtml(validOrigin.label)}`, {
        direction: 'top',
        offset: [0, -34],
      });
      marker.addTo(markersLayer);
    }

    // 2. Live Driver GPS Markers
    for (const driver of activeDriversWithGps) {
      const firstName = escapeHtml(driver.name.split(' ')[0] || 'Motoboy');
      const driverHtml = `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
          <div style="background:#059669;color:#ffffff;border:2.5px solid #ffffff;border-radius:9999px;padding:3px 9px;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 4px 12px rgba(5,150,105,0.4);display:flex;align-items:center;gap:4px;">
            <span>🏍️ ${firstName}</span>
          </div>
        </div>
      `;

      const driverIcon = L.divIcon({
        className: 'custom-delivery-marker',
        html: driverHtml,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      L.marker([Number(driver.lastLatitude), Number(driver.lastLongitude)], {
        icon: driverIcon,
        zIndexOffset: 850,
      }).addTo(markersLayer);
    }

    // 3. Geocoded Order Markers with Order Number, Status Color & Stop Sequence
    for (const order of geocodedOrders) {
      const isSelected = selectedOrderIds.includes(order.id);
      const isFocused = activeOrderId === order.id || focusedOrderId === order.id;
      const pinStyle =
        DISPATCH_PIN_COLORS[order.dispatchStatus] || DISPATCH_PIN_COLORS.waiting_dispatch;
      const previewSeq = previewStopSequenceByOrderId.get(order.id);
      const stopSeq = previewSeq || order.activeStopSequence;

      const orderLabel = escapeHtml(order.formattedOrderNumber || `#${order.orderNumber}`);
      const ringShadow = isSelected
        ? '0 0 0 4px rgba(79, 70, 229, 0.45), 0 8px 18px rgba(15, 23, 42, 0.35)'
        : isFocused
        ? '0 0 0 4px rgba(15, 23, 42, 0.35), 0 8px 18px rgba(15, 23, 42, 0.35)'
        : '0 4px 12px rgba(15, 23, 42, 0.28)';

      const borderColor = isSelected ? '#312e81' : '#ffffff';
      const scaleTransform = isSelected || isFocused ? 'scale(1.12)' : 'scale(1)';

      const seqBadgeHtml = stopSeq
        ? `<span style="background:${
            isSelected ? '#312e81' : '#0f172a'
          };color:#ffffff;border:1.5px solid #ffffff;border-radius:9999px;padding:1px 5px;font-size:10px;font-weight:900;line-height:1.1;margin-right:3px;">${stopSeq}ª</span>`
        : '';

      const checkBadgeHtml = isSelected
        ? `<span style="position:absolute;top:-7px;right:-7px;width:18px;height:18px;border-radius:9999px;background:#4f46e5;color:#ffffff;border:2px solid #ffffff;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.25);">✓</span>`
        : '';

      const html = `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%) ${scaleTransform};transition:transform 0.15s ease;">
          <div style="position:relative;background:${pinStyle.bg};color:${pinStyle.text};border:2.5px solid ${borderColor};border-radius:9999px;padding:4px 10px;font-size:11.5px;font-weight:800;white-space:nowrap;box-shadow:${ringShadow};display:flex;align-items:center;gap:2px;cursor:pointer;">
            ${seqBadgeHtml}
            <span>${orderLabel}</span>
            ${checkBadgeHtml}
          </div>
          <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${pinStyle.bg};margin-top:-1px;"></div>
        </div>
      `;

      const icon = L.divIcon({
        className: 'custom-delivery-marker',
        html,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([Number(order.latitude), Number(order.longitude)], {
        icon,
        zIndexOffset: isSelected ? 1000 : isFocused ? 950 : 500,
      });

      marker.on('click', () => {
        setActiveOrderId(order.id);
        if (onFocusOrder) {
          onFocusOrder(order.id);
        }
      });

      marker.addTo(markersLayer);
    }
  }, [
    validOrigin,
    activeDriversWithGps,
    geocodedOrders,
    selectedOrderIds,
    activeOrderId,
    focusedOrderId,
    previewStopSequenceByOrderId,
    onFocusOrder,
  ]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-full">
      {/* Top Map Control & Status Bar */}
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/90">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <Navigation className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-extrabold text-slate-900">
                Mapa Operacional de Entregas
              </h3>
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
                {geocodedOrders.length} no mapa
              </span>
              {selectedOrderIds.length > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-indigo-100 border border-indigo-200 text-indigo-800 text-[10px] font-extrabold">
                  {selectedOrderIds.length} selecionado(s)
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Clique em um marcador para ver detalhes ou selecione 2+ pedidos para traçar a rota
            </p>
          </div>
        </div>

        {/* Map Controls: Zoom, Center on Origin, Fit All Orders, Layer Switcher */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={handleZoomIn}
              title="Aproximar mapa (Zoom +)"
              className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-slate-200" />
            <button
              type="button"
              onClick={handleZoomOut}
              title="Afastar mapa (Zoom -)"
              className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleCenterOnOrigin}
            title="Centralizar no endereço do restaurante"
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
          >
            <Crosshair className="w-3.5 h-3.5 text-indigo-600" />
            <span>Centralizar</span>
          </button>

          <button
            type="button"
            onClick={handleFitAllOrders}
            title="Enquadrar todos os pedidos e o restaurante no mapa"
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
          >
            <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">Ver todos os pedidos</span>
            <span className="sm:hidden">Todos</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRouteLines((v) => !v)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-colors inline-flex items-center gap-1.5 shadow-2xs ${
              showRouteLines
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
            title="Exibir ou ocultar linhas das rotas em andamento"
          >
            <RouteIcon className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Rotas Ativas</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setTileStyle((s) =>
                s === 'voyager'
                  ? 'google_roadmap'
                  : s === 'google_roadmap'
                  ? 'osm'
                  : 'voyager'
              )
            }
            className="p-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition-colors shadow-2xs"
            title={`Alternar estilo de mapa (Atual: ${TILE_LAYERS[tileStyle].name})`}
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive Street Map Viewport */}
      <div className="relative w-full flex-1 min-h-[460px] lg:min-h-[580px] bg-slate-100 overflow-hidden">
        <div
          ref={mapContainerRef}
          data-testid="delivery-interactive-street-map"
          className="w-full h-full min-h-[460px] lg:min-h-[580px]"
        />

        {/* Live Selected Multi-Order Route HUD Banner (when 2+ orders are selected) */}
        {selectedOrderIds.length >= 2 && (
          <div className="absolute top-3 left-3 right-3 z-[400] pointer-events-none flex justify-center">
            <div className="pointer-events-auto bg-slate-900/95 backdrop-blur-md text-white rounded-2xl px-4 py-3 shadow-xl border border-slate-700/80 w-full max-w-2xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 font-extrabold text-xs">
                  {selectedOrderIds.length}x
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-extrabold text-white">
                      Prévia da Rota Selecionada
                    </span>
                    {liveRouteLoading ? (
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-indigo-300 text-[10px] font-bold animate-pulse">
                        Calculando trajeto viário...
                      </span>
                    ) : (
                      liveRoutePreview && (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            liveRoutePreview.navigationProvider === 'google'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : liveRoutePreview.navigationProvider === 'osrm'
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {liveRoutePreview.navigationProvider === 'google'
                            ? 'Rota viária real (Google Maps)'
                            : liveRoutePreview.navigationProvider === 'osrm'
                            ? 'Rota viária real (OSRM)'
                            : 'Estimativa linear (contingência)'}
                        </span>
                      )
                    )}
                  </div>

                  {liveRoutePreview && (
                    <div className="flex items-center gap-3 text-[11px] text-slate-300 mt-0.5 flex-wrap">
                      <span>
                        Distância:{' '}
                        <strong className="text-white">
                          {liveRoutePreview.totalDistanceKm.toFixed(1).replace('.', ',')} km
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Tempo estimado:{' '}
                        <strong className="text-white">
                          ~{liveRoutePreview.estimatedDurationMin} min
                        </strong>
                      </span>
                      <span className="hidden sm:inline">•</span>
                      <span className="hidden sm:inline truncate max-w-xs text-indigo-200 font-semibold">
                        {liveRoutePreview.orderedStops
                          .map((s) => `${s.stopSequence}ª ${s.formattedOrderNumber}`)
                          .join(' → ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {onOpenRouteModal && (
                <button
                  type="button"
                  onClick={onOpenRouteModal}
                  className="px-3.5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-extrabold transition-colors inline-flex items-center gap-1.5 shrink-0 shadow-sm"
                >
                  <RouteIcon className="w-3.5 h-3.5" />
                  <span>Despachar Rota</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Empty State Overlay when there are 0 geocoded orders */}
        {geocodedOrders.length === 0 && (
          <div className="absolute top-3 left-3 z-[400] pointer-events-none max-w-xs">
            <div className="pointer-events-auto bg-white/95 backdrop-blur-xs border border-slate-200 rounded-2xl p-3.5 shadow-lg space-y-1">
              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800">
                <MapPin className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Mapa de Ruas Ativo</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {orders.length === 0
                  ? 'Nenhum pedido de entrega no filtro atual. Assim que novos pedidos entrarem, os marcadores numerados aparecerão nas ruas correspondentes.'
                  : 'Os pedidos listados aguardam geocodificação. Use o botão "Geocodificar" ou "Posição Manual" no painel ao lado.'}
              </p>
            </div>
          </div>
        )}

        {/* Selected / Focused Order Summary Card Overlay on Map */}
        {activeOrder && (
          <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:w-96 z-[400] bg-white/98 backdrop-blur-md border border-slate-200 rounded-2xl p-4 shadow-2xl space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-black text-slate-900">
                    {activeOrder.formattedOrderNumber}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                    style={{
                      backgroundColor:
                        DISPATCH_PIN_COLORS[activeOrder.dispatchStatus]?.bg || '#f97316',
                    }}
                  >
                    {DISPATCH_PIN_COLORS[activeOrder.dispatchStatus]?.label ||
                      'Aguardando despacho'}
                  </span>
                  {previewStopSequenceByOrderId.has(activeOrder.id) && (
                    <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-extrabold">
                      {previewStopSequenceByOrderId.get(activeOrder.id)}ª Parada
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{activeOrder.customerName}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveOrderId(null);
                  if (onFocusOrder) onFocusOrder(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                title="Fechar resumo do pedido"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 bg-slate-50 rounded-xl p-2.5 border border-slate-100 space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Bairro: {activeOrder.neighborhood}</span>
              </div>
              <div className="text-[11px] text-slate-600 leading-snug pl-5">
                {activeOrder.addressSummary}
              </div>
              {activeOrder.assignedDriverName && (
                <div className="text-[11px] font-bold text-indigo-700 pt-1 pl-5 flex items-center gap-1">
                  <Bike className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Motoboy: {activeOrder.assignedDriverName}{' '}
                    {activeOrder.activeRouteCode ? `(${activeOrder.activeRouteCode})` : ''}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="text-xs text-slate-600 flex items-center gap-2">
                <span>
                  Total:{' '}
                  <strong className="text-slate-900 font-extrabold">
                    R$ {activeOrder.total.toFixed(2).replace('.', ',')}
                  </strong>
                </span>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                  <Clock className="w-3 h-3" />
                  {activeOrder.waitingMinutes} min
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {onRequestManualGeocode && (
                  <button
                    type="button"
                    onClick={() => onRequestManualGeocode(activeOrder)}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-[11px] font-bold transition-colors"
                    title="Ajustar coordenadas deste endereço"
                  >
                    Posição
                  </button>
                )}

                {activeOrder.dispatchStatus !== 'delivered' && (
                  <button
                    type="button"
                    onClick={() => onToggleSelectOrder(activeOrder.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1 ${
                      selectedOrderIds.includes(activeOrder.id)
                        ? 'bg-slate-900 text-white hover:bg-slate-800'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    {selectedOrderIds.includes(activeOrder.id)
                      ? 'Selecionado'
                      : 'Selecionar p/ Rota'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Compact Legend & Pending Geocode Alert Bar */}
      <div className="px-4 py-2.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-bold text-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-900 inline-block" />
            Restaurante
          </span>
          {(Object.keys(DISPATCH_PIN_COLORS) as OrderDispatchStatus[]).map((statusKey) => (
            <span key={statusKey} className="inline-flex items-center gap-1.5 font-medium">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                style={{ backgroundColor: DISPATCH_PIN_COLORS[statusKey].bg }}
              />
              {DISPATCH_PIN_COLORS[statusKey].label}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {pendingGeocodeOrders.length > 0 && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                {pendingGeocodeOrders.length} pedido(s) sem coordenadas (visíveis na lista ao lado)
              </span>
            </div>
          )}

          <span
            className="text-[10px] text-slate-400 hidden sm:inline"
            title={
              googleMapsStatus === 'configured'
                ? 'Chave Google Maps configurada no ambiente'
                : 'Utilizando base cartográfica aberta OpenStreetMap / CARTO e rotas viárias OSRM'
            }
          >
            {googleMapsStatus === 'configured'
              ? 'Cartografia + Google API Ativa'
              : 'Cartografia Viária OpenStreetMap / OSRM'}
          </span>
        </div>
      </div>
    </div>
  );
};
