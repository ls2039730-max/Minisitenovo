import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Crosshair,
  RefreshCw,
  Edit3,
  Save,
  X,
  ExternalLink,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { hasValidCoordinates } from '../../utils/deliveryFeeCalculator';
import {
  getGeocodePrecisionLabel,
  isExactGeocodePrecision,
  validateAndNormalizeCoordinates,
} from '../../utils/addressCoordinateValidator';

export type LocationSyncVisualState =
  | 'updated'
  | 'awaiting_confirmation'
  | 'approximate'
  | 'not_found'
  | 'service_error';

export interface AddressVerificationMapCardProps {
  title?: string;
  formattedAddress: string;
  queriedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geocodeStatus?: 'geocoded' | 'pending' | 'manual' | null;
  geocodePrecision?: string | null;
  geocodedAt?: string | null;
  isApproximate?: boolean;
  hasUnsavedAddressEdit?: boolean;
  previousPinWasManual?: boolean;
  syncErrorState?: 'not_found' | 'service_error' | null;
  markerLabel?: string;
  markerType?: 'company' | 'order';
  isGeocoding?: boolean;
  onGeocodeNow?: () => Promise<void> | void;
  onSaveManualCoordinates?: (latitude: number, longitude: number) => Promise<void> | void;
  readOnly?: boolean;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
}

export const AddressVerificationMapCard: React.FC<AddressVerificationMapCardProps> = ({
  title = 'Localização da empresa no mapa',
  formattedAddress,
  queriedAddress,
  latitude,
  longitude,
  geocodeStatus,
  geocodePrecision,
  geocodedAt,
  isApproximate,
  hasUnsavedAddressEdit = false,
  previousPinWasManual = false,
  syncErrorState = null,
  markerLabel = 'Localização',
  markerType = 'company',
  isGeocoding = false,
  onGeocodeNow,
  onSaveManualCoordinates,
  readOnly = false,
  primaryActionLabel,
  secondaryActionLabel,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const validCoords = hasValidCoordinates(latitude, longitude);
  const [isEditingManual, setIsEditingManual] = useState(false);
  const [draftLat, setDraftLat] = useState<string>(validCoords ? String(latitude) : '');
  const [draftLng, setDraftLng] = useState<string>(validCoords ? String(longitude) : '');
  const [manualError, setManualError] = useState<string | null>(null);
  const [isSavingManual, setIsSavingManual] = useState(false);

  useEffect(() => {
    if (!isEditingManual) {
      setDraftLat(validCoords ? Number(latitude).toFixed(6) : '');
      setDraftLng(validCoords ? Number(longitude).toFixed(6) : '');
    }
  }, [latitude, longitude, validCoords, isEditingManual]);

  // Initialize Leaflet mini-map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialLat = validCoords ? Number(latitude) : -22.6412;
    const initialLng = validCoords ? Number(longitude) : -42.0061;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: validCoords ? 17 : 13,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
    }).addTo(map);

    mapInstanceRef.current = map;

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 180);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Sync marker position and map click handler
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const parsedDraft = validateAndNormalizeCoordinates(draftLat, draftLng);
    const activeLat =
      isEditingManual && parsedDraft.valid
        ? parsedDraft.latitude!
        : validCoords
        ? Number(latitude)
        : null;
    const activeLng =
      isEditingManual && parsedDraft.valid
        ? parsedDraft.longitude!
        : validCoords
        ? Number(longitude)
        : null;

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    if (activeLat !== null && activeLng !== null) {
      const pinColor = markerType === 'company' ? '#4f46e5' : '#059669';
      const iconHtml = `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
          <div style="background:${pinColor};color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:9999px;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,0.22);margin-bottom:3px;border:1.5px solid #fff;">
            ${markerLabel}
          </div>
          <div style="width:28px;height:28px;border-radius:9999px;background:${pinColor};border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
            <div style="width:8px;height:8px;border-radius:9999px;background:#fff;"></div>
          </div>
        </div>
      `;

      const icon = L.divIcon({
        html: iconHtml,
        className: 'minihub-verification-pin',
        iconSize: [100, 48],
        iconAnchor: [50, 44],
      });

      const marker = L.marker([activeLat, activeLng], {
        icon,
        draggable: isEditingManual && !readOnly,
      }).addTo(map);

      if (isEditingManual && !readOnly) {
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          setDraftLat(pos.lat.toFixed(6));
          setDraftLng(pos.lng.toFixed(6));
          setManualError(null);
        });
      }

      markerRef.current = marker;
      map.setView([activeLat, activeLng], Math.max(map.getZoom(), 17), { animate: true });
    }

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!isEditingManual || readOnly) return;
      setDraftLat(e.latlng.lat.toFixed(6));
      setDraftLng(e.latlng.lng.toFixed(6));
      setManualError(null);
    };

    map.on('click', handleMapClick);
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.off('click', handleMapClick);
    };
  }, [
    latitude,
    longitude,
    validCoords,
    isEditingManual,
    draftLat,
    draftLng,
    markerLabel,
    markerType,
    readOnly,
  ]);

  const handleConfirmManualSave = async () => {
    setManualError(null);
    const check = validateAndNormalizeCoordinates(draftLat, draftLng);
    if (!check.valid || check.latitude === null || check.longitude === null) {
      setManualError(check.reason || 'Informe coordenadas válidas de latitude e longitude.');
      return;
    }

    if (onSaveManualCoordinates) {
      setIsSavingManual(true);
      try {
        await onSaveManualCoordinates(check.latitude, check.longitude);
        setIsEditingManual(false);
      } catch (err: any) {
        setManualError(err.message || 'Erro ao salvar localização ajustada.');
      } finally {
        setIsSavingManual(false);
      }
    } else {
      setIsEditingManual(false);
    }
  };

  const precisionLabel = getGeocodePrecisionLabel(geocodePrecision, geocodeStatus);
  const isExact = isExactGeocodePrecision(geocodePrecision, geocodeStatus, isApproximate);

  // Compute the 5 mandatory visual states
  const resolveVisualState = (): LocationSyncVisualState => {
    if (syncErrorState === 'service_error') return 'service_error';
    if (syncErrorState === 'not_found') return 'not_found';
    if (hasUnsavedAddressEdit) return 'awaiting_confirmation';
    if (!validCoords || geocodeStatus === 'pending') return 'not_found';
    if (!isExact || isApproximate) return 'approximate';
    return 'updated';
  };

  const visualState = resolveVisualState();

  const renderStatusBadge = () => {
    switch (visualState) {
      case 'updated':
        return (
          <span
            data-testid="location-sync-status"
            data-state="Localização atualizada"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Localização atualizada
          </span>
        );
      case 'awaiting_confirmation':
        return (
          <span
            data-testid="location-sync-status"
            data-state="Aguardando confirmação"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Aguardando confirmação
          </span>
        );
      case 'approximate':
        return (
          <span
            data-testid="location-sync-status"
            data-state="Localização aproximada"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Localização aproximada
          </span>
        );
      case 'service_error':
        return (
          <span
            data-testid="location-sync-status"
            data-state="Falha ao consultar serviço de mapas"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            Falha ao consultar serviço de mapas
          </span>
        );
      case 'not_found':
      default:
        return (
          <span
            data-testid="location-sync-status"
            data-state="Endereço não localizado"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            Endereço não localizado
          </span>
        );
    }
  };

  const coordinateOriginLabel =
    geocodeStatus === 'manual'
      ? 'Ajuste manual confirmado'
      : validCoords
      ? 'Geocodificação automática'
      : 'Não definida';

  const formattedTimestamp = geocodedAt
    ? (() => {
        try {
          const d = new Date(geocodedAt);
          if (Number.isNaN(d.getTime())) return null;
          return d.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
        } catch {
          return null;
        }
      })()
    : null;

  const googleMapsExternalUrl = validCoords
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : formattedAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formattedAddress)}`
    : null;

  const resolvedPrimaryLabel =
    primaryActionLabel ||
    (markerType === 'company'
      ? 'Atualizar localização no mapa'
      : validCoords
      ? 'Recalcular do endereço'
      : 'Localizar no mapa');

  const resolvedSecondaryLabel =
    secondaryActionLabel ||
    (markerType === 'company' ? 'Ajustar pino manualmente' : 'Corrigir localização');

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">{title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {renderStatusBadge()}
          {googleMapsExternalUrl && (
            <a
              href={googleMapsExternalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 hover:border-indigo-200 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Google Maps
            </a>
          )}
        </div>
      </div>

      {/* Warning banner when address was edited or location is approximate */}
      {hasUnsavedAddressEdit && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-start gap-2.5 text-amber-900">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <strong className="font-bold">Endereço alterado — aguardando confirmação:</strong>{' '}
            {previousPinWasManual
              ? 'O endereço cadastrado foi editado. O pino ajustado manualmente para o endereço anterior foi marcado como desatualizado e precisa ser atualizado ou confirmado para o novo endereço.'
              : 'O endereço cadastrado foi editado. Clique em "Atualizar localização no mapa" ou salve os dados da empresa para atualizar o pino no mapa.'}
          </div>
        </div>
      )}

      {!hasUnsavedAddressEdit && visualState === 'approximate' && validCoords && (
        <div className="px-4 py-2.5 bg-amber-50/80 border-b border-amber-200 flex items-start gap-2.5 text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <strong className="font-bold">Localização aproximada ({precisionLabel}):</strong> A
            coordenada foi obtida apenas por nome da rua, CEP ou bairro. Confirme ou clique em{' '}
            <strong>"{resolvedSecondaryLabel}"</strong> para arrastar o marcador até o ponto exato
            do estabelecimento.
          </div>
        </div>
      )}

      {/* Address, Metadata & Action Bar */}
      <div className="p-3.5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {markerType === 'company'
                ? 'Endereço Oficial Cadastrado'
                : 'Endereço Completo'}
            </p>
            <p className="text-xs sm:text-sm font-semibold text-slate-800 break-words mt-0.5">
              {formattedAddress || 'Preencha rua, número, bairro, cidade, UF e CEP acima'}
            </p>
            {queriedAddress && queriedAddress !== formattedAddress && (
              <p className="text-[11px] text-slate-500 mt-0.5">
                Endereço consultado: <span className="font-medium text-slate-700">{queriedAddress}</span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
            <span className="font-mono">
              Lat:{' '}
              <strong className="text-slate-800">
                {validCoords ? Number(latitude).toFixed(6) : '—'}
              </strong>{' '}
              • Lng:{' '}
              <strong className="text-slate-800">
                {validCoords ? Number(longitude).toFixed(6) : '—'}
              </strong>
            </span>

            <span>
              Precisão: <strong className="text-slate-800">{precisionLabel}</strong>
            </span>

            <span>
              Origem: <strong className="text-slate-800">{coordinateOriginLabel}</strong>
            </span>

            {formattedTimestamp && (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <Clock className="w-3 h-3" />
                Última atualização: <strong className="text-slate-700">{formattedTimestamp}</strong>
              </span>
            )}
          </div>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onGeocodeNow && (
              <button
                type="button"
                onClick={onGeocodeNow}
                disabled={isGeocoding}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isGeocoding ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Crosshair className="w-3.5 h-3.5" />
                )}
                {resolvedPrimaryLabel}
              </button>
            )}

            {onSaveManualCoordinates && !isEditingManual && (
              <button
                type="button"
                onClick={() => {
                  setDraftLat(validCoords ? Number(latitude).toFixed(6) : '-22.641200');
                  setDraftLng(validCoords ? Number(longitude).toFixed(6) : '-42.006100');
                  setManualError(null);
                  setIsEditingManual(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                {resolvedSecondaryLabel}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Manual Coordinate Adjustment Bar */}
      {isEditingManual && !readOnly && (
        <div className="p-3.5 bg-indigo-50/70 border-b border-indigo-100 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-indigo-950">
              Arraste o pino no mapa abaixo, clique no ponto exato do estabelecimento ou informe a
              Latitude e Longitude:
            </p>
            <button
              type="button"
              onClick={() => {
                setIsEditingManual(false);
                setManualError(null);
              }}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Latitude (Ex: -22.641200)
              </label>
              <input
                type="text"
                value={draftLat}
                onChange={(e) => setDraftLat(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Longitude (Ex: -42.006100)
              </label>
              <input
                type="text"
                value={draftLng}
                onChange={(e) => setDraftLng(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConfirmManualSave}
                disabled={isSavingManual}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSavingManual ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Confirmar e salvar pino
              </button>
              <button
                type="button"
                onClick={() => setIsEditingManual(false)}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>

          {manualError && (
            <p className="text-xs font-semibold text-rose-600 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {manualError}
            </p>
          )}
        </div>
      )}

      {/* Interactive Mini-Map */}
      <div className="relative w-full h-56 bg-slate-100">
        <div ref={mapContainerRef} className="w-full h-full z-0" />
        {!validCoords && !isEditingManual && (
          <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px] flex flex-col items-center justify-center p-4 text-center z-10">
            <MapPin className="w-7 h-7 text-white mb-1.5 opacity-90" />
            <p className="text-xs font-bold text-white max-w-xs">
              {hasUnsavedAddressEdit
                ? 'Endereço alterado. Clique abaixo para atualizar a localização no mapa.'
                : 'Coordenadas ainda não definidas para este endereço.'}
            </p>
            {onGeocodeNow && (
              <button
                type="button"
                onClick={onGeocodeNow}
                disabled={isGeocoding}
                className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-colors cursor-pointer"
              >
                {isGeocoding ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Crosshair className="w-3.5 h-3.5" />
                )}
                {resolvedPrimaryLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
