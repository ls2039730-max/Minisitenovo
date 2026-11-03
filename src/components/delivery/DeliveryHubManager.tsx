import React, { useState, useEffect, useCallback, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  MapPin,
  Truck,
  QrCode,
  Plus,
  RefreshCw,
  CheckSquare,
  Square,
  Search,
  Sparkles,
  Clock,
  Navigation,
  Users,
  AlertTriangle,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit3,
  Copy,
  Check,
  ExternalLink,
  MessageCircle,
  Smartphone,
  ShieldAlert,
  X,
  Play,
  Route as RouteIcon,
  Phone,
} from 'lucide-react';
import { api } from '../../services/api';
import {
  DeliveryHubOverview,
  DispatchOrderItem,
  DeliveryRoute,
  DeliveryDriver,
  RoutePreviewResult,
  DRIVER_STATUS_LABELS,
  ROUTE_STATUS_LABELS,
  STOP_STATUS_LABELS,
  FAILURE_REASON_LABELS,
  DriverAvailabilityStatus,
} from '../../types/deliveryHub';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  OrderDispatchStatus,
} from '../../types/order';
import { formatCurrency } from '../../utils/currency';
import {
  InteractiveDeliveryMap,
  DISPATCH_STATUS_CONFIG,
} from './InteractiveDeliveryMap';
import { DriverPortalView } from './DriverPortalView';
import { Tenant } from '../../types/saas';

export const DeliveryHubManager: React.FC<{ tenant?: Tenant }> = () => {
  const [activeTab, setActiveTab] = useState<
    'dispatch' | 'routes' | 'drivers' | 'driver_preview'
  >('dispatch');

  const [overview, setOverview] = useState<DeliveryHubOverview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Filters (Etapa 1)
  const [dispatchFilter, setDispatchFilter] = useState<
    | 'all'
    | 'waiting_dispatch'
    | 'ready_only'
    | 'assigned'
    | 'in_route'
    | 'delivered'
    | 'delivery_issue'
  >('all');
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<string>('all');
  const [driverFilter, setDriverFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Multi-selection of orders for route creation (Etapa 2)
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  // Route Builder Modal State (Etapa 2 & 5)
  const [showRouteModal, setShowRouteModal] = useState<boolean>(false);
  const [routePreview, setRoutePreview] = useState<RoutePreviewResult | null>(null);
  const [routePreviewLoading, setRoutePreviewLoading] = useState<boolean>(false);
  const [routeDriverId, setRouteDriverId] = useState<string>('');
  const [routeName, setRouteName] = useState<string>('');
  const [optimizeRouteOrder, setOptimizeRouteOrder] = useState<boolean>(true);

  // Route QR Code Modal State (Etapa 5)
  const [qrModalRoute, setQrModalRoute] = useState<DeliveryRoute | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedToken, setCopiedToken] = useState<boolean>(false);

  // Manual Location Adjustment Modal State (Etapa 1 & 11)
  const [editingLocationOrder, setEditingLocationOrder] =
    useState<DispatchOrderItem | null>(null);
  const [manualLat, setManualLat] = useState<string>('');
  const [manualLng, setManualLng] = useState<string>('');

  // Driver CRUD Modal State (Etapa 4)
  const [showDriverModal, setShowDriverModal] = useState<boolean>(false);
  const [editingDriver, setEditingDriver] = useState<DeliveryDriver | null>(null);
  const [driverName, setDriverName] = useState<string>('');
  const [driverPhone, setDriverPhone] = useState<string>('');
  const [driverEmail, setDriverEmail] = useState<string>('');
  const [driverPassword, setDriverPassword] = useState<string>('');
  const [driverVehicle, setDriverVehicle] = useState<string>('');
  const [driverPlate, setDriverPlate] = useState<string>('');
  const [driverActive, setDriverActive] = useState<boolean>(true);
  const [driverAvailability, setDriverAvailability] =
    useState<DriverAvailabilityStatus>('available');

  // Preview Driver ID for embedded DriverPortalView
  const [previewDriverId, setPreviewDriverId] = useState<string | undefined>(undefined);

  const loadOverview = useCallback(async () => {
    try {
      const data = await api.getDeliveryHubOverview({
        dispatchFilter,
        neighborhood: neighborhoodFilter,
        driverId: driverFilter,
        search: searchQuery,
      });
      setOverview(data);
      if (!previewDriverId && data.drivers.length > 0) {
        setPreviewDriverId(data.drivers[0].id);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Erro ao carregar Central de Entregas.',
      });
    } finally {
      setLoading(false);
    }
  }, [dispatchFilter, neighborhoodFilter, driverFilter, searchQuery, previewDriverId]);

  useEffect(() => {
    loadOverview();
    const interval = window.setInterval(loadOverview, 15000);
    return () => window.clearInterval(interval);
  }, [loadOverview]);

  // Generate QR Code DataURL whenever qrModalRoute is opened or updated
  useEffect(() => {
    if (!qrModalRoute) {
      setQrDataUrl('');
      return;
    }
    const claimUrl = `${window.location.origin}/?routeQr=${encodeURIComponent(
      qrModalRoute.qrToken
    )}`;
    QRCode.toDataURL(claimUrl, {
      width: 280,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [qrModalRoute]);

  const eligibleOrders = useMemo(
    () =>
      (overview?.orders || []).filter(
        (o) =>
          o.dispatchStatus === 'waiting_dispatch' ||
          o.dispatchStatus === 'delivery_issue'
      ),
    [overview?.orders]
  );

  const handleToggleSelectOrder = (orderId: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleSelectAllEligible = () => {
    if (selectedOrderIds.length === eligibleOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(eligibleOrders.map((o) => o.id));
    }
  };

  // Open Route Builder Modal & Fetch Preview
  const handleOpenCreateRouteModal = async (
    customOrderIds?: string[],
    customLabel?: string
  ) => {
    const ids = customOrderIds || selectedOrderIds;
    if (ids.length === 0) {
      setFeedback({
        type: 'error',
        text: 'Selecione pelo menos um pedido para criar uma rota.',
      });
      return;
    }
    setSelectedOrderIds(ids);
    setRouteName(customLabel || '');
    setOptimizeRouteOrder(true);
    setShowRouteModal(true);
    setRoutePreviewLoading(true);
    try {
      const preview = await api.previewDeliveryRoute(ids, true);
      setRoutePreview(preview);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Erro ao calcular prévia da rota.',
      });
    } finally {
      setRoutePreviewLoading(false);
    }
  };

  const handleMovePreviewStop = async (index: number, direction: 'up' | 'down') => {
    if (!routePreview) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= routePreview.orderedStops.length) return;

    const currentIds = routePreview.orderedStops.map((s) => s.orderId);
    const [moved] = currentIds.splice(index, 1);
    currentIds.splice(targetIdx, 0, moved);

    setSelectedOrderIds(currentIds);
    setOptimizeRouteOrder(false);
    setRoutePreviewLoading(true);
    try {
      const preview = await api.previewDeliveryRoute(currentIds, false);
      setRoutePreview(preview);
    } finally {
      setRoutePreviewLoading(false);
    }
  };

  const handleRemovePreviewStop = async (orderIdToRemove: string) => {
    const nextIds = selectedOrderIds.filter((id) => id !== orderIdToRemove);
    setSelectedOrderIds(nextIds);
    if (nextIds.length === 0) {
      setShowRouteModal(false);
      setRoutePreview(null);
      return;
    }
    setRoutePreviewLoading(true);
    try {
      const preview = await api.previewDeliveryRoute(nextIds, optimizeRouteOrder);
      setRoutePreview(preview);
    } finally {
      setRoutePreviewLoading(false);
    }
  };

  const handleConfirmCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routePreview || routePreview.orderedStops.length === 0) return;
    setActionLoading('create-route');
    setFeedback(null);
    try {
      const orderedIds = routePreview.orderedStops.map((s) => s.orderId);
      const created = await api.createDeliveryRoute({
        orderIds: orderedIds,
        driverId: routeDriverId || null,
        name: routeName.trim() || undefined,
        optimizeOrder: optimizeRouteOrder,
      });
      setShowRouteModal(false);
      setSelectedOrderIds([]);
      setQrModalRoute(created);
      setFeedback({
        type: 'success',
        text: `Rota ${created.routeCode} criada com sucesso! Apresente o QR Code ao entregador.`,
      });
      await loadOverview();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Erro ao criar rota de entrega.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryGeocode = async (orderId: string) => {
    setActionLoading(`geocode-${orderId}`);
    try {
      const res = await api.retryOrderGeocode(orderId);
      setFeedback({
        type: res.geocoded ? 'success' : 'error',
        text:
          res.message ||
          (res.geocoded
            ? 'Coordenadas localizadas com sucesso!'
            : 'Não foi possível localizar coordenadas exatas. Use o ajuste manual se desejar.'),
      });
      await loadOverview();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao geocodificar.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveManualLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocationOrder) return;
    const lat = Number(manualLat.replace(',', '.'));
    const lng = Number(manualLng.replace(',', '.'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setFeedback({
        type: 'error',
        text: 'Informe valores numéricos válidos de latitude e longitude.',
      });
      return;
    }
    setActionLoading('manual-location');
    try {
      await api.updateOrderManualLocation(editingLocationOrder.id, {
        latitude: lat,
        longitude: lng,
      });
      setEditingLocationOrder(null);
      setFeedback({
        type: 'success',
        text: `Coordenadas do pedido ${editingLocationOrder.formattedOrderNumber} atualizadas no mapa!`,
      });
      await loadOverview();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Erro ao atualizar localização manual.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Route Management Handlers
  const handleMoveActiveRouteStop = async (
    route: DeliveryRoute,
    idx: number,
    direction: 'up' | 'down'
  ) => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= route.stops.length) return;
    const ids = route.stops.map((s) => s.id);
    const [moved] = ids.splice(idx, 1);
    ids.splice(targetIdx, 0, moved);
    setActionLoading(`reorder-${route.id}`);
    try {
      await api.reorderDeliveryRouteStops(route.id, ids);
      await loadOverview();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao reordenar parada.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveStopFromActiveRoute = async (routeId: string, stopId: string) => {
    setActionLoading(`rm-stop-${stopId}`);
    try {
      await api.removeStopFromDeliveryRoute(routeId, stopId);
      setFeedback({ type: 'success', text: 'Parada removida da rota!' });
      await loadOverview();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao remover parada.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAssignDriver = async (routeId: string, driverId: string) => {
    setActionLoading(`assign-${routeId}`);
    try {
      await api.assignDriverToDeliveryRoute(routeId, driverId || null);
      setFeedback({ type: 'success', text: 'Entregador atualizado na rota!' });
      await loadOverview();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao atribuir entregador.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleManageQr = async (routeId: string, action: 'revoke' | 'regenerate') => {
    setActionLoading(`qr-${routeId}`);
    try {
      const updated = await api.manageDeliveryRouteQr(routeId, action);
      setQrModalRoute(updated);
      setFeedback({
        type: 'success',
        text:
          action === 'revoke'
            ? 'QR Code revogado com sucesso!'
            : 'Novo QR Code gerado com sucesso!',
      });
      await loadOverview();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao gerenciar QR Code.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelRoute = async (routeId: string) => {
    setActionLoading(`cancel-route-${routeId}`);
    try {
      await api.cancelDeliveryRoute(routeId);
      setFeedback({
        type: 'success',
        text: 'Rota cancelada. Os pedidos pendentes retornaram para a fila de despacho.',
      });
      await loadOverview();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao cancelar rota.' });
    } finally {
      setActionLoading(null);
    }
  };

  // Driver Modal Handlers (Etapa 4)
  const openCreateDriverModal = () => {
    setEditingDriver(null);
    setDriverName('');
    setDriverPhone('');
    setDriverEmail('');
    setDriverPassword('');
    setDriverVehicle('');
    setDriverPlate('');
    setDriverActive(true);
    setDriverAvailability('available');
    setShowDriverModal(true);
  };

  const openEditDriverModal = (d: DeliveryDriver) => {
    setEditingDriver(d);
    setDriverName(d.name);
    setDriverPhone(d.phone);
    setDriverEmail(d.email);
    setDriverPassword('');
    setDriverVehicle(d.vehicleInfo || '');
    setDriverPlate(d.plate || '');
    setDriverActive(d.isActive);
    setDriverAvailability(d.availabilityStatus);
    setShowDriverModal(true);
  };

  const handleSaveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading('save-driver');
    setFeedback(null);
    try {
      if (editingDriver) {
        await api.updateDeliveryDriver(editingDriver.id, {
          name: driverName,
          phone: driverPhone,
          email: driverEmail,
          password: driverPassword.trim() ? driverPassword.trim() : undefined,
          vehicleInfo: driverVehicle,
          plate: driverPlate,
          isActive: driverActive,
          availabilityStatus: driverAvailability,
        });
        setFeedback({
          type: 'success',
          text: `Cadastro do entregador "${driverName}" atualizado!`,
        });
      } else {
        await api.createDeliveryDriver({
          name: driverName,
          phone: driverPhone,
          email: driverEmail,
          password: driverPassword.trim() || undefined,
          vehicleInfo: driverVehicle,
          plate: driverPlate,
          isActive: driverActive,
          availabilityStatus: driverAvailability,
        });
        setFeedback({
          type: 'success',
          text: `Entregador "${driverName}" cadastrado com credenciais individuais!`,
        });
      }
      setShowDriverModal(false);
      await loadOverview();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Erro ao salvar cadastro do entregador.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteDriver = async (driver: DeliveryDriver) => {
    setActionLoading(`del-driver-${driver.id}`);
    try {
      await api.deleteDeliveryDriver(driver.id);
      setFeedback({
        type: 'success',
        text: `Entregador "${driver.name}" removido.`,
      });
      await loadOverview();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Erro ao remover entregador.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const stats = overview?.stats;

  return (
    <div className="space-y-6">
      {/* Header & Sub-Navigation */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-600 text-white">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900">
                  Central de Entregas & Despacho
                </h1>
                <p className="text-xs text-slate-500">
                  Mapa operacional, agrupamento inteligente, rotas com múltiplas paradas, QR Code e WhatsApp automático
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadOverview}
              className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={openCreateDriverModal}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Motoboy
            </button>
            {selectedOrderIds.length > 0 && (
              <button
                type="button"
                onClick={() => handleOpenCreateRouteModal()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition"
              >
                <RouteIcon className="w-4 h-4" />
                Criar Rota ({selectedOrderIds.length})
              </button>
            )}
          </div>
        </div>

        {/* Real-Time Operational KPIs (Etapa 10) */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2 border-t border-slate-100">
            <div className="bg-orange-50/70 border border-orange-200/80 rounded-xl p-3">
              <span className="text-[11px] font-bold text-orange-800 uppercase">
                Aguardando Despacho
              </span>
              <div className="text-xl font-extrabold text-orange-950 mt-0.5">
                {stats.waitingDispatchCount}
              </div>
              <span className="text-[11px] text-orange-700">
                {stats.readyForDispatchCount} prontos p/ saída
              </span>
            </div>

            <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3">
              <span className="text-[11px] font-bold text-blue-800 uppercase">
                Atribuídos
              </span>
              <div className="text-xl font-extrabold text-blue-950 mt-0.5">
                {stats.assignedCount}
              </div>
              <span className="text-[11px] text-blue-700">
                {stats.activeRoutesCount} rotas ativas
              </span>
            </div>

            <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl p-3">
              <span className="text-[11px] font-bold text-purple-800 uppercase">
                Em Rota Agora
              </span>
              <div className="text-xl font-extrabold text-purple-950 mt-0.5">
                {stats.inRouteCount}
              </div>
              <span className="text-[11px] text-purple-700">
                {stats.driversInRouteCount} motoboys em rua
              </span>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3">
              <span className="text-[11px] font-bold text-emerald-800 uppercase">
                Entregues Hoje
              </span>
              <div className="text-xl font-extrabold text-emerald-950 mt-0.5">
                {stats.deliveredTodayCount}
              </div>
              <span className="text-[11px] text-emerald-700">Concluídos no dia</span>
            </div>

            <div className="bg-rose-50/70 border border-rose-200/80 rounded-xl p-3">
              <span className="text-[11px] font-bold text-rose-800 uppercase">
                Ocorrências
              </span>
              <div className="text-xl font-extrabold text-rose-950 mt-0.5">
                {stats.issuesCount}
              </div>
              <span className="text-[11px] text-rose-700">
                {stats.pendingGeocodeCount} loc. pendente
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <span className="text-[11px] font-bold text-slate-700 uppercase">
                Motoboys Livres
              </span>
              <div className="text-xl font-extrabold text-slate-900 mt-0.5">
                {stats.availableDriversCount}
              </div>
              <span className="text-[11px] text-slate-500">
                de {overview?.drivers.length || 0} cadastrados
              </span>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setActiveTab('dispatch')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition ${
              activeTab === 'dispatch'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <MapPin className="w-4 h-4" />
            Mapa & Fila de Despacho
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('routes')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition ${
              activeTab === 'routes'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <RouteIcon className="w-4 h-4" />
            Rotas & Monitoramento ({overview?.routes.length || 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('drivers')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition ${
              activeTab === 'drivers'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            Equipe de Entregas ({overview?.drivers.length || 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('driver_preview')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition ${
              activeTab === 'driver_preview'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            App do Motoboy (Mobile)
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            feedback.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          TAB 1: MAPA DE ENTREGAS & FILA DE DESPACHO (Etapas 1, 2 e 3)
      ===================================================================== */}
      {activeTab === 'dispatch' && (
        <div className="space-y-5">
          {/* Smart Grouping Suggestions (Etapa 3) */}
          {overview?.clusterSuggestions && overview.clusterSuggestions.length > 0 && (
            <div className="bg-indigo-950 text-white rounded-2xl p-4 sm:p-5 shadow-md space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <h3 className="text-sm font-bold">
                      Sugestões de Agrupamento Inteligente por Proximidade
                    </h3>
                    <p className="text-xs text-indigo-200">
                      Pedidos próximos agrupados automaticamente com sequência otimizada de paradas
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {overview.clusterSuggestions.map((cluster) => (
                  <div
                    key={cluster.id}
                    className="bg-white/10 border border-white/15 rounded-xl p-3.5 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-white">
                          {cluster.label}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-400/20 text-amber-300">
                          {cluster.estimatedTotalDistanceKm.toFixed(1).replace('.', ',')} km • ~
                          {cluster.estimatedDurationMin} min
                        </span>
                      </div>
                      <p className="text-xs text-indigo-200">{cluster.reason}</p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {cluster.orderNumbers.map((num, idx) => (
                          <span
                            key={num}
                            className="px-2 py-0.5 rounded-md bg-indigo-900/80 border border-indigo-700 text-[11px] font-bold text-indigo-100"
                          >
                            {idx + 1}ª: {num}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleOpenCreateRouteModal(cluster.orderIds, cluster.label)
                      }
                      className="w-full py-2 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                    >
                      <RouteIcon className="w-3.5 h-3.5" />
                      Criar Rota Otimizada com este Grupo
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filters Bar (Etapa 1: All 8 operational filters) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'waiting_dispatch', label: 'Aguardando despacho' },
                  { id: 'ready_only', label: 'Pedidos prontos' },
                  { id: 'assigned', label: 'Pedidos atribuídos' },
                  { id: 'in_route', label: 'Em rota' },
                  { id: 'delivered', label: 'Entregues' },
                  { id: 'delivery_issue', label: 'Problemas na entrega' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setDispatchFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    dispatchFilter === f.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por #pedido, cliente ou endereço..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                value={neighborhoodFilter}
                onChange={(e) => setNeighborhoodFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Todos os bairros</option>
                {(overview?.neighborhoods || []).map((n) => (
                  <option key={n} value={n}>
                    Bairro: {n}
                  </option>
                ))}
              </select>

              <select
                value={driverFilter}
                onChange={(e) => setDriverFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Todos os motoboys</option>
                {(overview?.drivers || []).map((d) => (
                  <option key={d.id} value={d.id}>
                    Motoboy: {d.name} ({DRIVER_STATUS_LABELS[d.availabilityStatus]})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Interactive Map + Orders List Split View */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left/Top: Interactive Delivery Map (7 cols) */}
            <div className="lg:col-span-7">
              <InteractiveDeliveryMap
                originAddress={overview?.originAddress || null}
                orders={overview?.orders || []}
                activeRoutes={overview?.routes || []}
                drivers={overview?.drivers || []}
                selectedOrderIds={selectedOrderIds}
                onToggleSelectOrder={handleToggleSelectOrder}
                onRetryGeocode={handleRetryGeocode}
                onOpenManualLocation={(order) => {
                  setEditingLocationOrder(order);
                  setManualLat(order.latitude ? String(order.latitude) : '');
                  setManualLng(order.longitude ? String(order.longitude) : '');
                }}
              />
            </div>

            {/* Right/Bottom: Orders Awaiting Dispatch & Multi-Select List (5 cols) */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col max-h-[600px]">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Pedidos de Entrega ({overview?.orders.length || 0})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Selecione 1 ou mais pedidos para criar uma rota otimizada
                  </p>
                </div>

                {eligibleOrders.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllEligible}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1.5"
                  >
                    {selectedOrderIds.length === eligibleOrders.length ? (
                      <>
                        <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                        Desmarcar
                      </>
                    ) : (
                      <>
                        <Square className="w-3.5 h-3.5 text-slate-400" />
                        Selecionar disponíveis ({eligibleOrders.length})
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
                {!overview?.orders || overview.orders.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Nenhum pedido de entrega encontrado para este filtro.
                  </div>
                ) : (
                  overview.orders.map((order) => {
                    const isEligible =
                      order.dispatchStatus === 'waiting_dispatch' ||
                      order.dispatchStatus === 'delivery_issue';
                    const isSelected = selectedOrderIds.includes(order.id);
                    const statusCfg = DISPATCH_STATUS_CONFIG[order.dispatchStatus];

                    return (
                      <div
                        key={order.id}
                        className={`p-3.5 transition hover:bg-slate-50/80 ${
                          isSelected ? 'bg-indigo-50/60' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Multi-select Checkbox */}
                          <button
                            type="button"
                            disabled={!isEligible}
                            onClick={() => handleToggleSelectOrder(order.id)}
                            className={`mt-0.5 shrink-0 ${
                              isEligible
                                ? 'text-indigo-600 cursor-pointer'
                                : 'text-slate-300 cursor-not-allowed'
                            }`}
                            title={
                              isEligible
                                ? 'Selecionar pedido para rota'
                                : 'Pedido já em rota ou entregue'
                            }
                          >
                            {isSelected ? (
                              <CheckSquare className="w-5 h-5" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-sm text-slate-900">
                                  {order.formattedOrderNumber}
                                </span>
                                <span
                                  className="px-2 py-0.5 rounded-md text-[10px] font-bold text-white"
                                  style={{ backgroundColor: statusCfg.hex }}
                                >
                                  {statusCfg.label}
                                </span>
                                {order.geocodeStatus === 'pending' && (
                                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                    Localização pendente
                                  </span>
                                )}
                              </div>
                              <span className="font-bold text-xs text-slate-900">
                                {formatCurrency(order.total)}
                              </span>
                            </div>

                            <div className="text-xs font-semibold text-slate-800">
                              {order.customerName}
                            </div>

                            <div className="text-xs text-slate-600 truncate">
                              <strong>{order.neighborhood}</strong> — {order.addressSummary}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Há {order.waitingMinutes} min • {ORDER_STATUS_LABELS[order.status]}
                              </span>

                              {order.assignedDriverName && (
                                <span className="font-semibold text-indigo-700">
                                  Motoboy: {order.assignedDriverName} ({order.activeRouteCode})
                                </span>
                              )}
                            </div>

                            {order.failureReason && (
                              <div className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 mt-1">
                                Falha anterior: {FAILURE_REASON_LABELS[order.failureReason]}
                              </div>
                            )}

                            {order.geocodeStatus === 'pending' && (
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleRetryGeocode(order.id)}
                                  className="text-[11px] font-bold text-indigo-600 hover:underline"
                                >
                                  Tentar localizar no mapa
                                </button>
                                <span className="text-slate-300">•</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingLocationOrder(order);
                                    setManualLat('');
                                    setManualLng('');
                                  }}
                                  className="text-[11px] font-bold text-amber-700 hover:underline"
                                >
                                  Informar coordenadas
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Sticky Footer Action Bar when orders are selected */}
              {selectedOrderIds.length > 0 && (
                <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between gap-3">
                  <div className="text-xs">
                    <span className="font-bold">{selectedOrderIds.length}</span>{' '}
                    {selectedOrderIds.length === 1
                      ? 'pedido selecionado'
                      : 'pedidos selecionados'}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedOrderIds([])}
                      className="px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white"
                    >
                      Limpar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenCreateRouteModal()}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
                    >
                      <RouteIcon className="w-3.5 h-3.5" />
                      Criar Rota
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: ROTAS & MONITORAMENTO EM TEMPO REAL (Etapas 2, 5, 8, 9 e 10)
      ===================================================================== */}
      {activeTab === 'routes' && (
        <div className="space-y-4">
          {!overview?.routes || overview.routes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
              <RouteIcon className="w-10 h-10 text-slate-400 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">Nenhuma rota criada ainda</h3>
              <p className="text-xs text-slate-500">
                Selecione os pedidos na aba <strong>"Mapa & Fila de Despacho"</strong> e clique em <strong>"Criar Rota"</strong>.
              </p>
            </div>
          ) : (
            overview.routes.map((route) => {
              const isEditable = !['completed', 'cancelled'].includes(route.status);
              return (
                <div
                  key={route.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
                >
                  {/* Route Header */}
                  <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-extrabold text-slate-900">
                          {route.routeCode}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
                            route.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : route.status === 'in_progress'
                              ? 'bg-purple-100 text-purple-800'
                              : route.status === 'cancelled'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {ROUTE_STATUS_LABELS[route.status]}
                        </span>
                        <span className="text-xs font-semibold text-slate-600">
                          {route.completedStops}/{route.totalStops} paradas concluídas •{' '}
                          {route.totalDistanceKm.toFixed(1).replace('.', ',')} km • ~
                          {route.estimatedDurationMin} min
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3">
                        <span>
                          Criada às{' '}
                          {new Date(route.createdAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {route.startedAt && (
                          <span>
                            Saída:{' '}
                            {new Date(route.startedAt).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                        {route.completedAt && (
                          <span>
                            Conclusão:{' '}
                            {new Date(route.completedAt).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Assign/Change Driver Selector */}
                      {isEditable && (
                        <select
                          value={route.driverId || ''}
                          onChange={(e) => handleAssignDriver(route.id, e.target.value)}
                          disabled={actionLoading === `assign-${route.id}`}
                          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800"
                        >
                          <option value="">Sem motoboy (Livre p/ QR Code)</option>
                          {(overview.drivers || [])
                            .filter((d) => d.isActive)
                            .map((d) => (
                              <option key={d.id} value={d.id}>
                                Motoboy: {d.name}
                              </option>
                            ))}
                        </select>
                      )}

                      <button
                        type="button"
                        onClick={() => setQrModalRoute(route)}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
                      >
                        <QrCode className="w-4 h-4" />
                        QR Code da Rota
                      </button>

                      {isEditable && (
                        <button
                          type="button"
                          onClick={() => handleCancelRoute(route.id)}
                          disabled={actionLoading === `cancel-route-${route.id}`}
                          className="px-3 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold transition"
                        >
                          Cancelar Rota
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stops Table / Cards */}
                  <div className="divide-y divide-slate-100">
                    {route.stops.map((stop, idx) => (
                      <div
                        key={stop.id}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 ${
                              stop.status === 'delivered'
                                ? 'bg-emerald-600 text-white'
                                : stop.status === 'failed_attempt'
                                ? 'bg-rose-600 text-white'
                                : stop.status === 'out_for_delivery'
                                ? 'bg-purple-600 text-white'
                                : 'bg-slate-900 text-white'
                            }`}
                          >
                            {stop.stopSequence}ª
                          </span>

                          <div className="space-y-0.5 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-slate-900">
                                Pedido {stop.formattedOrderNumber} — {stop.customerName}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                                {STOP_STATUS_LABELS[stop.status]}
                              </span>
                              {stop.whatsappNotificationStatus && (
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                    stop.whatsappNotificationStatus === 'sent'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {stop.whatsappNotificationStatus === 'sent'
                                    ? 'WhatsApp enviado (API)'
                                    : 'Link WhatsApp pronto'}
                                </span>
                              )}
                            </div>

                            <div className="text-slate-600">
                              <strong>{stop.neighborhood}</strong> • {stop.addressSummary}
                            </div>

                            <div className="text-slate-400 text-[11px] flex flex-wrap items-center gap-3">
                              <span>
                                +{stop.distanceFromPrevKm?.toFixed(1).replace('.', ',')} km (~
                                {stop.durationFromPrevMin} min)
                              </span>
                              <a
                                href={`/rastreio/${stop.trackingToken}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:underline font-medium inline-flex items-center gap-1"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Página de Rastreio do Cliente
                              </a>
                              {stop.whatsappNotificationUrl && (
                                <a
                                  href={stop.whatsappNotificationUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-700 hover:underline font-semibold inline-flex items-center gap-1"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  Enviar no WhatsApp
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Reorder / Remove Controls before route completion */}
                        {isEditable && (
                          <div className="flex items-center gap-1.5 self-end sm:self-center">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveActiveRouteStop(route, idx, 'up')}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                              title="Subir parada"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === route.stops.length - 1}
                              onClick={() => handleMoveActiveRouteStop(route, idx, 'down')}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                              title="Descer parada"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            {route.status !== 'in_progress' && route.stops.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveStopFromActiveRoute(route.id, stop.id)
                                }
                                className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                                title="Remover pedido desta rota"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 3: EQUIPE DE ENTREGAS / CADASTRO DE MOTOBOYS (Etapa 4)
      ===================================================================== */}
      {activeTab === 'drivers' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Motoboys Credenciados ({overview?.drivers.length || 0})
              </h3>
              <p className="text-xs text-slate-500">
                Cada entregador possui login individual (perfil DELIVERY_DRIVER) com acesso restrito às suas próprias rotas
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateDriverModal}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Cadastrar Motoboy
            </button>
          </div>

          {!overview?.drivers || overview.drivers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
              <Users className="w-10 h-10 text-slate-400 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">
                Nenhum entregador cadastrado
              </h3>
              <p className="text-xs text-slate-500">
                Cadastre sua equipe de motoboys para atribuir rotas e liberar o acesso ao aplicativo mobile do entregador.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {overview.drivers.map((driver) => (
                <div
                  key={driver.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white font-bold flex items-center justify-center text-base">
                          {driver.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900">{driver.name}</h4>
                          <p className="text-xs text-slate-500">{driver.email}</p>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          !driver.isActive
                            ? 'bg-rose-100 text-rose-700'
                            : driver.availabilityStatus === 'available'
                            ? 'bg-emerald-100 text-emerald-800'
                            : driver.availabilityStatus === 'in_route'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {!driver.isActive
                          ? 'Inativo'
                          : DRIVER_STATUS_LABELS[driver.availabilityStatus]}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 space-y-1 bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="flex items-center justify-between">
                        <span>WhatsApp / Telefone:</span>
                        <strong className="text-slate-900">{driver.phone}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Veículo / Placa:</span>
                        <strong className="text-slate-900">
                          {driver.vehicleInfo || 'Moto'}{' '}
                          {driver.plate ? `• ${driver.plate}` : ''}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Entregas concluídas:</span>
                        <strong className="text-emerald-700">
                          {driver.completedDeliveriesCount || 0}
                        </strong>
                      </div>
                      {driver.activeRouteCode && (
                        <div className="flex items-center justify-between text-indigo-700 font-semibold pt-1 border-t border-slate-200">
                          <span>Rota atual:</span>
                          <span>{driver.activeRouteCode}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewDriverId(driver.id);
                        setActiveTab('driver_preview');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      Abrir Painel Mobile
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditDriverModal(driver)}
                        className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                        title="Editar entregador"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDriver(driver)}
                        className="p-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50"
                        title="Remover entregador"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 4: SIMULADOR / VISÃO MOBILE DA ÁREA DO MOTOBOY (Etapa 6 & 7)
      ===================================================================== */}
      {activeTab === 'driver_preview' && (
        <DriverPortalView
          selectedDriverId={previewDriverId}
          onSelectDriverId={setPreviewDriverId}
          availableDrivers={overview?.drivers || []}
          isStandaloneDriverSession={false}
        />
      )}

      {/* =====================================================================
          MODAL 1: CRIAR ROTA MULTI-PARADAS (Etapa 2)
      ===================================================================== */}
      {showRouteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmCreateRoute}
            className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <RouteIcon className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-base font-bold">Criar Rota de Entrega</h3>
                  <p className="text-xs text-slate-300">
                    Confira a ordem otimizada das paradas e selecione o entregador
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRouteModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {routePreviewLoading ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Calculando melhor sequência de paradas e distância...
                </div>
              ) : (
                routePreview && (
                  <>
                    {/* Route Summary Banner */}
                    <div className="grid grid-cols-3 gap-2.5 bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 text-center">
                      <div>
                        <span className="text-[11px] font-bold text-indigo-700 uppercase">
                          Paradas
                        </span>
                        <div className="text-lg font-extrabold text-indigo-950">
                          {routePreview.orderedStops.length}
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-indigo-700 uppercase">
                          Distância Total
                        </span>
                        <div className="text-lg font-extrabold text-indigo-950">
                          {routePreview.totalDistanceKm.toFixed(1).replace('.', ',')} km
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-indigo-700 uppercase">
                          Tempo Estimado
                        </span>
                        <div className="text-lg font-extrabold text-indigo-950">
                          ~{routePreview.estimatedDurationMin} min
                        </div>
                      </div>
                    </div>

                    {/* Driver Selection & Optional Route Name */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Motoboy Responsável (ou vincular via QR Code)
                        </label>
                        <select
                          value={routeDriverId}
                          onChange={(e) => setRouteDriverId(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                        >
                          <option value="">Qualquer motoboy (ler QR Code no balcão)</option>
                          {(overview?.drivers || [])
                            .filter((d) => d.isActive)
                            .map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name} ({DRIVER_STATUS_LABELS[d.availabilityStatus]})
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Identificação da Rota (opcional)
                        </label>
                        <input
                          type="text"
                          value={routeName}
                          onChange={(e) => setRouteName(e.target.value)}
                          placeholder="Ex: Rota Centro / Zona Sul"
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs"
                        />
                      </div>
                    </div>

                    {/* Ordered Stops List with Reorder & Remove */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">
                          Sequência de Entrega (Partindo do Restaurante)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Use as setas para ajustar manualmente
                        </span>
                      </div>

                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                        {routePreview.orderedStops.map((stop, idx) => (
                          <div
                            key={stop.orderId}
                            className="p-3 bg-white flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-6 h-6 rounded-lg bg-slate-900 text-white font-bold flex items-center justify-center shrink-0">
                                {stop.stopSequence}ª
                              </span>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 truncate">
                                  {stop.formattedOrderNumber} — {stop.customerName}
                                </div>
                                <div className="text-slate-500 truncate">
                                  <strong>{stop.neighborhood}</strong> • +
                                  {stop.distanceFromPrevKm.toFixed(1).replace('.', ',')} km (~
                                  {stop.durationFromPrevMin} min)
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMovePreviewStop(idx, 'up')}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === routePreview.orderedStops.length - 1}
                                onClick={() => handleMovePreviewStop(idx, 'down')}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemovePreviewStop(stop.orderId)}
                                className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRouteModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={actionLoading === 'create-route' || routePreviewLoading}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs"
              >
                {actionLoading === 'create-route'
                  ? 'Gerando Rota e QR Code...'
                  : 'Confirmar Rota e Gerar QR Code'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: QR CODE EXCLUSIVO DA ROTA (Etapa 5)
      ===================================================================== */}
      {qrModalRoute && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 p-6 space-y-4 text-center">
            <div className="flex items-center justify-between">
              <div className="text-left">
                <h3 className="text-base font-extrabold text-slate-900">
                  QR Code da Rota {qrModalRoute.routeCode}
                </h3>
                <p className="text-xs text-slate-500">
                  {qrModalRoute.totalStops} paradas •{' '}
                  {qrModalRoute.driverName
                    ? `Atribuída a ${qrModalRoute.driverName}`
                    : 'Aguardando leitura pelo entregador'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQrModalRoute(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {qrModalRoute.qrRevokedAt ? (
              <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                Este QR Code foi revogado. Clique em "Gerar Novo QR Code" abaixo se desejar liberar a leitura novamente.
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col items-center space-y-3">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR Code ${qrModalRoute.routeCode}`}
                    className="w-56 h-56 rounded-xl border border-slate-200 bg-white p-2"
                  />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center text-xs text-slate-400">
                    Gerando QR Code...
                  </div>
                )}

                <div className="w-full flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs">
                  <code className="flex-1 truncate text-slate-700 font-mono text-[11px]">
                    {qrModalRoute.qrToken}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(qrModalRoute.qrToken);
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 2000);
                    }}
                    className="text-indigo-600 font-bold inline-flex items-center gap-1 shrink-0"
                  >
                    {copiedToken ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar Token
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleManageQr(qrModalRoute.id, 'regenerate')}
                className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold"
              >
                Gerar Novo QR
              </button>
              {!qrModalRoute.qrRevokedAt && (
                <button
                  type="button"
                  onClick={() => handleManageQr(qrModalRoute.id, 'revoke')}
                  className="flex-1 py-2.5 px-3 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold"
                >
                  Revogar QR
                </button>
              )}
              <button
                type="button"
                onClick={() => setQrModalRoute(null)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 text-white text-xs font-bold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: CADASTRO / EDIÇÃO DE MOTOBOY (Etapa 4)
      ===================================================================== */}
      {showDriverModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveDriver}
            className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
          >
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">
                  {editingDriver ? 'Editar Motoboy' : 'Novo Motoboy (Equipe de Entregas)'}
                </h3>
                <p className="text-xs text-slate-300">
                  Credenciais individuais com acesso restrito à Área do Motoboy
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDriverModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="Ex: Carlos Mendes"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Telefone / WhatsApp *
                  </label>
                  <input
                    type="text"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    placeholder="(11) 99999-0000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    E-mail de Login *
                  </label>
                  <input
                    type="email"
                    value={driverEmail}
                    onChange={(e) => setDriverEmail(e.target.value)}
                    placeholder="carlos@motoboy.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {editingDriver
                    ? 'Nova Senha de Acesso (deixe em branco para manter)'
                    : 'Senha de Acesso Individual (mín. 6 caracteres)'}
                </label>
                <input
                  type="password"
                  value={driverPassword}
                  onChange={(e) => setDriverPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs"
                  required={!editingDriver}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Veículo (opcional)
                  </label>
                  <input
                    type="text"
                    value={driverVehicle}
                    onChange={(e) => setDriverVehicle(e.target.value)}
                    placeholder="Ex: Honda CG 160"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Placa (opcional)
                  </label>
                  <input
                    type="text"
                    value={driverPlate}
                    onChange={(e) => setDriverPlate(e.target.value)}
                    placeholder="ABC-1D23"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs uppercase"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={driverActive}
                    onChange={(e) => setDriverActive(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  Cadastro Ativo para Entregas
                </label>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDriverModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={actionLoading === 'save-driver'}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
              >
                {actionLoading === 'save-driver' ? 'Salvando...' : 'Salvar Motoboy'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: AJUSTE MANUAL DE COORDENADAS DO PEDIDO (Etapa 1 & 11)
      ===================================================================== */}
      {editingLocationOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveManualLocation}
            className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Ajustar Localização ({editingLocationOrder.formattedOrderNumber})
                </h3>
                <p className="text-xs text-slate-500">
                  {editingLocationOrder.addressSummary}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingLocationOrder(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Latitude
                </label>
                <input
                  type="text"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  placeholder="Ex: -23.55052"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Longitude
                </label>
                <input
                  type="text"
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  placeholder="Ex: -46.63331"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingLocationOrder(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={actionLoading === 'manual-location'}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
              >
                Salvar Posição no Mapa
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
