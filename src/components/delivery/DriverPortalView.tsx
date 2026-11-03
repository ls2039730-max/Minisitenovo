import React, { useState, useEffect, useCallback } from 'react';
import {
  QrCode,
  Navigation,
  Phone,
  CheckCircle2,
  AlertTriangle,
  Play,
  MapPin,
  Clock,
  Truck,
  RefreshCw,
  LogOut,
  ExternalLink,
  MessageCircle,
  ShieldCheck,
  Radio,
  ChevronRight,
  X,
  Camera,
} from 'lucide-react';
import { api } from '../../services/api';
import {
  DeliveryDriver,
  DeliveryRoute,
  DeliveryRouteStop,
  DriverAvailabilityStatus,
  DRIVER_STATUS_LABELS,
  ROUTE_STATUS_LABELS,
  STOP_STATUS_LABELS,
  DeliveryFailureReason,
  FAILURE_REASON_LABELS,
} from '../../types/deliveryHub';
import { PAYMENT_METHOD_LABELS, PaymentMethodType } from '../../types/order';
import { formatCurrency } from '../../utils/currency';

interface DriverPortalViewProps {
  selectedDriverId?: string;
  onSelectDriverId?: (driverId: string) => void;
  availableDrivers?: DeliveryDriver[];
  isStandaloneDriverSession?: boolean;
  tenantName?: string;
  onLogout?: () => void;
  initialQrToken?: string | null;
}

export const DriverPortalView: React.FC<DriverPortalViewProps> = ({
  selectedDriverId,
  onSelectDriverId,
  availableDrivers = [],
  isStandaloneDriverSession = false,
  tenantName,
  onLogout,
  initialQrToken,
}) => {
  const [driver, setDriver] = useState<DeliveryDriver | null>(null);
  const [activeRoutes, setActiveRoutes] = useState<DeliveryRoute[]>([]);
  const [completedRoutes, setCompletedRoutes] = useState<DeliveryRoute[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'whatsapp';
    text: string;
    whatsappUrl?: string;
  } | null>(null);

  // QR Scanner Modal State
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [qrInput, setQrInput] = useState<string>('');

  // Failure Reason Modal State
  const [failingStop, setFailingStop] = useState<{
    routeId: string;
    stop: DeliveryRouteStop;
  } | null>(null);
  const [failureReason, setFailureReason] = useState<DeliveryFailureReason>('customer_absent');
  const [failureNotes, setFailureNotes] = useState<string>('');

  const loadPortalData = useCallback(async () => {
    try {
      const data = await api.getDriverPortalData(selectedDriverId);
      setDriver(data.driver);
      setActiveRoutes(data.activeRoutes || []);
      setCompletedRoutes(data.completedRoutes || []);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Erro ao carregar dados do entregador.',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedDriverId]);

  useEffect(() => {
    loadPortalData();
    const interval = window.setInterval(loadPortalData, 15000);
    return () => window.clearInterval(interval);
  }, [loadPortalData]);

  // Automatically process initialQrToken if opened via QR link (?routeQr=...)
  useEffect(() => {
    if (initialQrToken && !loading) {
      handleScanQrToken(initialQrToken);
    }
  }, [initialQrToken, loading]);

  // Optional live GPS location sharing while driver has an active route and opted in
  useEffect(() => {
    if (!driver?.shareLocation || !driver?.activeRouteId) return;
    if (!('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        api
          .updateDriverPortalStatus({
            driverId: driver.id,
            shareLocation: true,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          })
          .catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [driver?.id, driver?.shareLocation, driver?.activeRouteId]);

  const handleScanQrToken = async (tokenToScan: string) => {
    const clean = tokenToScan.trim();
    if (!clean) return;
    setActionLoading('scan-qr');
    setFeedback(null);
    try {
      const route = await api.scanDeliveryRouteQrCode(clean);
      setShowQrModal(false);
      setQrInput('');
      setFeedback({
        type: 'success',
        text: `Rota ${route.routeCode} (${route.totalStops} paradas) vinculada com sucesso!`,
      });
      await loadPortalData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Não foi possível validar o QR Code da rota.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleAvailability = async (status: DriverAvailabilityStatus) => {
    if (!driver) return;
    setActionLoading('status');
    try {
      const updated = await api.updateDriverPortalStatus({
        driverId: driver.id,
        availabilityStatus: status,
      });
      setDriver(updated);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao alterar disponibilidade.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleShareLocation = async () => {
    if (!driver) return;
    const nextShare = !driver.shareLocation;
    setActionLoading('location');
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      if (nextShare && 'geolocation' in navigator) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              lat = pos.coords.latitude;
              lng = pos.coords.longitude;
              resolve();
            },
            () => resolve(),
            { timeout: 4000 }
          );
        });
      }
      const updated = await api.updateDriverPortalStatus({
        driverId: driver.id,
        shareLocation: nextShare,
        latitude: lat,
        longitude: lng,
      });
      setDriver(updated);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao atualizar localização.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartRoute = async (routeId: string) => {
    setActionLoading(`start-route-${routeId}`);
    setFeedback(null);
    try {
      const route = await api.startDeliveryRoute(routeId);
      setFeedback({
        type: 'success',
        text: `Rota ${route.routeCode} iniciada! Selecione "Iniciar Entrega" na primeira parada.`,
      });
      await loadPortalData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao iniciar rota.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartStop = async (routeId: string, stop: DeliveryRouteStop) => {
    setActionLoading(`start-stop-${stop.id}`);
    setFeedback(null);
    try {
      const res = await api.startDeliveryRouteStop(routeId, stop.id);
      if (res.notification.providerConfirmed) {
        setFeedback({
          type: 'success',
          text: `Pedido ${stop.formattedOrderNumber} saiu para entrega! Cliente notificado automaticamente no WhatsApp.`,
        });
      } else {
        setFeedback({
          type: 'whatsapp',
          text: `Pedido ${stop.formattedOrderNumber} saiu para entrega! Link de acompanhamento gerado para o cliente.`,
          whatsappUrl: res.notification.whatsappWebUrl,
        });
      }
      await loadPortalData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao iniciar entrega.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompleteStop = async (routeId: string, stop: DeliveryRouteStop) => {
    setActionLoading(`complete-stop-${stop.id}`);
    setFeedback(null);
    try {
      const updatedRoute = await api.completeDeliveryRouteStop(routeId, stop.id);
      const nextStop = updatedRoute.stops.find((s) => s.status === 'waiting');
      setFeedback({
        type: 'success',
        text: nextStop
          ? `Entrega ${stop.formattedOrderNumber} confirmada! Próxima parada: ${nextStop.stopSequence}ª (${nextStop.customerName}).`
          : `Entrega ${stop.formattedOrderNumber} confirmada! Rota ${updatedRoute.routeCode} concluída com sucesso!`,
      });
      await loadPortalData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao confirmar entrega.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmFailStop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!failingStop) return;
    setActionLoading(`fail-stop-${failingStop.stop.id}`);
    setFeedback(null);
    try {
      await api.failDeliveryRouteStop(failingStop.routeId, failingStop.stop.id, {
        reason: failureReason,
        notes: failureNotes,
      });
      setFeedback({
        type: 'success',
        text: `Ocorrência registrada no pedido ${failingStop.stop.formattedOrderNumber}.`,
      });
      setFailingStop(null);
      setFailureNotes('');
      await loadPortalData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao registrar tentativa.' });
    } finally {
      setActionLoading(null);
    }
  };

  const buildNavigationUrls = (stop: DeliveryRouteStop) => {
    const hasCoords =
      typeof stop.latitude === 'number' &&
      typeof stop.longitude === 'number' &&
      Number.isFinite(stop.latitude) &&
      Number.isFinite(stop.longitude);
    const query = hasCoords
      ? `${stop.latitude},${stop.longitude}`
      : encodeURIComponent(`${stop.street}, ${stop.number} - ${stop.neighborhood}, ${stop.city} - ${stop.state}`);

    return {
      googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${query}`,
      waze: hasCoords
        ? `https://waze.com/ul?ll=${stop.latitude},${stop.longitude}&navigate=yes`
        : `https://waze.com/ul?q=${query}&navigate=yes`,
    };
  };

  return (
    <div className="max-w-lg mx-auto pb-16 space-y-4">
      {/* Top Mobile Header Card */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-md">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0 font-bold text-lg">
              {driver?.name ? driver.name.charAt(0).toUpperCase() : <Truck className="w-6 h-6" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base truncate">
                  {driver ? driver.name : 'Área do Motoboy'}
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  Motoboy
                </span>
              </div>
              <p className="text-xs text-slate-300 truncate">
                {tenantName ? `${tenantName} • ` : ''}
                {driver?.vehicleInfo || 'Entregador Credenciado'}
                {driver?.plate ? ` (${driver.plate})` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={loadPortalData}
              className="p-2.5 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 transition"
              title="Atualizar rotas"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {isStandaloneDriverSession && onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="p-2.5 rounded-xl bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 border border-rose-500/30 transition"
                title="Sair da conta"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Admin Driver Switcher (only shown when restaurant admin previews the driver portal) */}
        {!isStandaloneDriverSession && availableDrivers.length > 0 && onSelectDriverId && (
          <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">Visualizando como:</span>
            <select
              value={driver?.id || selectedDriverId || ''}
              onChange={(e) => onSelectDriverId(e.target.value)}
              className="bg-slate-800 text-white text-xs font-medium rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
            >
              {availableDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({DRIVER_STATUS_LABELS[d.availabilityStatus]})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Driver Availability & Optional Location Sharing Bar */}
        {driver && (
          <div className="mt-3 pt-3 border-t border-slate-800 space-y-2.5">
            <div className="grid grid-cols-3 gap-1.5">
              {(['available', 'in_route', 'unavailable'] as DriverAvailabilityStatus[]).map((st) => {
                const active = driver.availabilityStatus === st;
                return (
                  <button
                    key={st}
                    type="button"
                    disabled={actionLoading === 'status'}
                    onClick={() => handleToggleAvailability(st)}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                      active
                        ? st === 'available'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : st === 'in_route'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-slate-600 text-white shadow-xs'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        st === 'available'
                          ? 'bg-emerald-300'
                          : st === 'in_route'
                          ? 'bg-purple-300'
                          : 'bg-slate-400'
                      }`}
                    />
                    {DRIVER_STATUS_LABELS[st]}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 bg-slate-800/80 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Radio
                  className={`w-4 h-4 ${
                    driver.shareLocation ? 'text-emerald-400 animate-pulse' : 'text-slate-500'
                  }`}
                />
                <span>Compartilhar localização em rota</span>
              </div>
              <button
                type="button"
                onClick={handleToggleShareLocation}
                disabled={actionLoading === 'location'}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  driver.shareLocation
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {driver.shareLocation ? 'Ativo' : 'Opcional'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Primary CTA: Ler QR Code da Rota (Etapa 6) */}
      <button
        type="button"
        onClick={() => setShowQrModal(true)}
        className="w-full py-4 px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-bold text-base shadow-md flex items-center justify-between transition"
      >
        <span className="flex items-center gap-3">
          <span className="p-2 rounded-xl bg-white/15">
            <QrCode className="w-6 h-6" />
          </span>
          <span className="text-left">
            <span className="block leading-tight">Ler QR Code da Rota</span>
            <span className="block text-xs font-normal text-indigo-100 mt-0.5">
              Escaneie ou digite o código da rota para assumir as entregas
            </span>
          </span>
        </span>
        <ChevronRight className="w-5 h-5 text-indigo-200 shrink-0" />
      </button>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-medium flex flex-col gap-2 ${
            feedback.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : feedback.type === 'whatsapp'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-indigo-50 border-indigo-200 text-indigo-900'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <span>{feedback.text}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {feedback.whatsappUrl && (
            <a
              href={feedback.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-xs hover:bg-emerald-700"
            >
              <MessageCircle className="w-4 h-4" />
              Enviar Aviso no WhatsApp do Cliente
            </a>
          )}
        </div>
      )}

      {/* Active Routes List */}
      {activeRoutes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-2">
          <Truck className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">Nenhuma rota ativa no momento</h3>
          <p className="text-xs text-slate-500">
            Use o botão <strong>"Ler QR Code da Rota"</strong> acima para assumir uma nova rota no balcão do restaurante.
          </p>
        </div>
      ) : (
        activeRoutes.map((route) => {
          const nextStopToHighlight =
            route.stops.find((s) => s.status === 'out_for_delivery') ||
            route.stops.find((s) => s.status === 'waiting');

          return (
            <div
              key={route.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-3"
            >
              {/* Route Summary Header */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-extrabold text-slate-900">
                        {route.routeCode}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-100 text-indigo-800">
                        {ROUTE_STATUS_LABELS[route.status]}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{route.name}</p>
                  </div>
                  <div className="text-right text-xs text-slate-600">
                    <div className="font-bold text-slate-900">
                      {route.completedStops}/{route.totalStops} entregues
                    </div>
                    <div>
                      {route.totalDistanceKm.toFixed(1).replace('.', ',')} km • ~
                      {route.estimatedDurationMin} min
                    </div>
                  </div>
                </div>

                {/* Start Route Button if not yet in_progress */}
                {route.status !== 'in_progress' && (
                  <button
                    type="button"
                    disabled={actionLoading === `start-route-${route.id}`}
                    onClick={() => handleStartRoute(route.id)}
                    className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-xs flex items-center justify-center gap-2 transition"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    {actionLoading === `start-route-${route.id}`
                      ? 'Iniciando rota...'
                      : 'Iniciar Rota de Entrega'}
                  </button>
                )}
              </div>

              {/* Stops Sequence List */}
              <div className="p-3 space-y-3">
                {route.stops.map((stop) => {
                  const isHighlighted = nextStopToHighlight?.id === stop.id;
                  const nav = buildNavigationUrls(stop);

                  return (
                    <div
                      key={stop.id}
                      className={`rounded-2xl border p-4 transition space-y-3 ${
                        stop.status === 'delivered'
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : stop.status === 'failed_attempt'
                          ? 'bg-rose-50/50 border-rose-200'
                          : stop.status === 'out_for_delivery'
                          ? 'bg-purple-50/50 border-purple-300 ring-2 ring-purple-500/20'
                          : isHighlighted
                          ? 'bg-white border-indigo-400 ring-2 ring-indigo-500/15 shadow-xs'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      {/* Stop Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-8 h-8 rounded-xl flex items-center justify-center font-extrabold text-sm shrink-0 ${
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
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-900">
                                Pedido {stop.formattedOrderNumber}
                              </span>
                              {isHighlighted && stop.status !== 'delivered' && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
                                  Parada Atual
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-semibold text-slate-700">
                              {stop.customerName}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                            stop.status === 'delivered'
                              ? 'bg-emerald-100 text-emerald-800'
                              : stop.status === 'failed_attempt'
                              ? 'bg-rose-100 text-rose-800'
                              : stop.status === 'out_for_delivery'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {STOP_STATUS_LABELS[stop.status]}
                        </span>
                      </div>

                      {/* Address & Payment Details */}
                      <div className="space-y-1.5 text-xs text-slate-700 bg-slate-50 rounded-xl p-3 border border-slate-200/80">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-bold text-slate-900">
                              {stop.street}, {stop.number}
                              {stop.complement ? ` — ${stop.complement}` : ''}
                            </div>
                            <div className="text-slate-600">
                              Bairro: <strong>{stop.neighborhood}</strong> • {stop.city}/{stop.state}
                            </div>
                            {stop.reference && (
                              <div className="text-indigo-700 font-medium mt-0.5">
                                Ref: {stop.reference}
                              </div>
                            )}
                          </div>
                        </div>

                        {stop.notes && (
                          <div className="mt-1.5 pt-1.5 border-t border-slate-200 text-amber-800 font-medium">
                            Obs do pedido: {stop.notes}
                          </div>
                        )}

                        <div className="mt-1.5 pt-1.5 border-t border-slate-200 flex items-center justify-between">
                          <span className="text-slate-600">
                            {PAYMENT_METHOD_LABELS[stop.paymentMethod as PaymentMethodType] ||
                              stop.paymentMethod}
                            {stop.changeFor ? ` (Troco p/ ${formatCurrency(stop.changeFor)})` : ''}
                          </span>
                          <span className="font-extrabold text-slate-900 text-sm">
                            {formatCurrency(stop.orderTotal)}
                          </span>
                        </div>
                      </div>

                      {/* Quick Navigation & Call Buttons */}
                      <div className="grid grid-cols-3 gap-2">
                        <a
                          href={nav.googleMaps}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <Navigation className="w-3.5 h-3.5 text-blue-600" />
                          Maps
                        </a>
                        <a
                          href={nav.waze}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-sky-600" />
                          Waze
                        </a>
                        <a
                          href={`tel:${stop.customerPhone}`}
                          className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <Phone className="w-3.5 h-3.5 text-emerald-600" />
                          Ligar
                        </a>
                      </div>

                      {/* Primary Stop Operational Actions (Etapa 7) */}
                      {stop.status === 'waiting' && (
                        <button
                          type="button"
                          disabled={actionLoading === `start-stop-${stop.id}`}
                          onClick={() => handleStartStop(route.id, stop)}
                          className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-xs flex items-center justify-center gap-2 transition"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          {actionLoading === `start-stop-${stop.id}`
                            ? 'Iniciando e notificando cliente...'
                            : 'Iniciar Entrega (Saiu para entrega)'}
                        </button>
                      )}

                      {stop.status === 'out_for_delivery' && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={actionLoading === `complete-stop-${stop.id}`}
                              onClick={() => handleCompleteStop(route.id, stop)}
                              className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-xs flex items-center justify-center gap-2 transition"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              {actionLoading === `complete-stop-${stop.id}`
                                ? 'Confirmando...'
                                : 'Confirmar Entrega'}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setFailingStop({ routeId: route.id, stop });
                                setFailureReason('customer_absent');
                                setFailureNotes('');
                              }}
                              className="w-full py-3 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                            >
                              <AlertTriangle className="w-4 h-4" />
                              Tentativa sem Sucesso
                            </button>
                          </div>

                          {stop.whatsappNotificationUrl && (
                            <a
                              href={stop.whatsappNotificationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              Abrir WhatsApp do Cliente com Link de Rastreio
                            </a>
                          )}
                        </div>
                      )}

                      {stop.status === 'failed_attempt' && stop.failureReason && (
                        <div className="bg-rose-100/80 border border-rose-200 rounded-xl p-2.5 text-xs text-rose-900 flex items-center justify-between gap-2">
                          <span>
                            <strong>Motivo:</strong> {FAILURE_REASON_LABELS[stop.failureReason]}
                            {stop.failureNotes ? ` — ${stop.failureNotes}` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleStartStop(route.id, stop)}
                            className="px-2.5 py-1 rounded-lg bg-white text-rose-700 font-bold border border-rose-200 shrink-0"
                          >
                            Retentar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* Completed Routes History */}
      {completedRoutes.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Histórico Recente de Rotas ({completedRoutes.length})
          </h3>
          <div className="divide-y divide-slate-100">
            {completedRoutes.slice(0, 5).map((r) => (
              <div key={r.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-800">{r.routeCode}</span>
                  <span className="text-slate-500 ml-2">
                    {r.completedStops}/{r.totalStops} entregues
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold">
                  {ROUTE_STATUS_LABELS[r.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* QR Code Scanner / Token Input Modal (Etapa 6) */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-4 animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Ler QR Code da Rota</h3>
                  <p className="text-xs text-slate-500">
                    Escaneie com a câmera do celular ou cole o código da rota
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
              <Camera className="w-8 h-8 text-indigo-600 mx-auto" />
              <p className="text-xs text-slate-600">
                Aponte a câmera do seu celular para o QR Code exibido na tela da Central de Entregas ou cole o token abaixo:
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleScanQrToken(qrInput);
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Token ou Link do QR Code da Rota
                </label>
                <input
                  type="text"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  placeholder="Ex: rtqr_..."
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowQrModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'scan-qr' || !qrInput.trim()}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-50"
                >
                  {actionLoading === 'scan-qr' ? 'Validando...' : 'Assumir Rota'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Failed Delivery Attempt Modal (Etapa 7) */}
      {failingStop && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleConfirmFailStop}
            className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-4 animate-in slide-in-from-bottom-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Tentativa sem Sucesso ({failingStop.stop.formattedOrderNumber})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFailingStop(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Selecione o motivo da ocorrência:
              </label>
              {(Object.keys(FAILURE_REASON_LABELS) as DeliveryFailureReason[]).map((reasonKey) => (
                <label
                  key={reasonKey}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                    failureReason === reasonKey
                      ? 'bg-rose-50 border-rose-400 text-rose-900'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="failureReason"
                    value={reasonKey}
                    checked={failureReason === reasonKey}
                    onChange={() => setFailureReason(reasonKey)}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                  {FAILURE_REASON_LABELS[reasonKey]}
                </label>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Observações adicionais (opcional)
              </label>
              <textarea
                value={failureNotes}
                onChange={(e) => setFailureNotes(e.target.value)}
                rows={2}
                placeholder="Ex: Interfone tocou 3 vezes sem resposta..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFailingStop(null)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={actionLoading === `fail-stop-${failingStop.stop.id}`}
                className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm"
              >
                Registrar Ocorrência
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
