import React, { useState, useEffect } from 'react';
import {
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  MessageCircle,
  AlertTriangle,
  RefreshCw,
  Package,
  ShieldCheck,
  Navigation,
} from 'lucide-react';
import { api } from '../../services/api';
import { PublicDeliveryTrackingInfo } from '../../types/deliveryHub';
import { buildWhatsAppUrl } from '../../utils/whatsappMessageBuilder';

interface PublicDeliveryTrackingPageProps {
  trackingToken: string;
}

export const PublicDeliveryTrackingPage: React.FC<PublicDeliveryTrackingPageProps> = ({
  trackingToken,
}) => {
  const [info, setInfo] = useState<PublicDeliveryTrackingInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTracking = async () => {
    try {
      const data = await api.getPublicDeliveryTracking(trackingToken);
      setInfo(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Link de acompanhamento não encontrado ou expirado.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracking();
    const interval = window.setInterval(fetchTracking, 15000);
    return () => window.clearInterval(interval);
  }, [trackingToken]);

  if (loading && !info) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-10 h-10 rounded-full border-3 border-indigo-600 border-t-transparent animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-600">Carregando status da entrega...</p>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm max-w-md w-full p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Link de Rastreamento Inválido</h1>
          <p className="text-xs text-slate-600">
            {error || 'Não foi possível localizar informações para este link de acompanhamento.'}
          </p>
        </div>
      </div>
    );
  }

  const whatsappContactUrl = info.tenantWhatsapp
    ? buildWhatsAppUrl(
        info.tenantWhatsapp,
        `Olá, ${info.tenantName}! Gostaria de informações sobre meu pedido ${info.formattedOrderNumber}.`
      )
    : null;

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Restaurant Header */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {info.tenantLogoUrl ? (
              <img
                src={info.tenantLogoUrl}
                alt={info.tenantName}
                className="w-12 h-12 rounded-2xl object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0"
                style={{ backgroundColor: info.tenantPrimaryColor || '#4f46e5' }}
              >
                {info.tenantName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-bold text-base text-slate-900 truncate">{info.tenantName}</h1>
              <p className="text-xs text-slate-500">
                Acompanhamento em tempo real • Pedido{' '}
                <strong className="text-slate-800">{info.formattedOrderNumber}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchTracking}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition shrink-0"
            title="Atualizar status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Status Hero Card */}
        <div
          className={`rounded-3xl p-5 text-white shadow-md space-y-3 ${
            info.stopStatus === 'delivered'
              ? 'bg-emerald-600'
              : info.stopStatus === 'failed_attempt'
              ? 'bg-rose-600'
              : info.stopStatus === 'out_for_delivery'
              ? 'bg-indigo-600'
              : 'bg-slate-900'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/20">
                {info.stopStatusLabel}
              </span>
              <h2 className="text-xl font-extrabold mt-2">
                {info.stopStatus === 'delivered'
                  ? `Pedido entregue, ${info.customerFirstName}!`
                  : info.stopStatus === 'failed_attempt'
                  ? `Tentativa de entrega registrada`
                  : info.stopStatus === 'out_for_delivery'
                  ? `Seu pedido está a caminho, ${info.customerFirstName}!`
                  : `Preparando saída para entrega`}
              </h2>
            </div>
            <div className="p-3 rounded-2xl bg-white/15 shrink-0">
              {info.stopStatus === 'delivered' ? (
                <CheckCircle2 className="w-7 h-7" />
              ) : (
                <Truck className="w-7 h-7" />
              )}
            </div>
          </div>

          {info.estimatedArrivalMinutes && info.stopStatus !== 'delivered' && (
            <div className="bg-white/15 rounded-2xl p-3 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="w-4 h-4" />
                Previsão estimada:
              </span>
              <span className="font-extrabold text-sm">
                ~{info.estimatedArrivalMinutes} min
                {info.estimatedArrivalTime ? ` (até ${info.estimatedArrivalTime})` : ''}
              </span>
            </div>
          )}

          {info.driverFirstName && (
            <div className="text-xs text-white/90 flex items-center justify-between pt-1 border-t border-white/15">
              <span>
                Entregador: <strong>{info.driverFirstName}</strong>
                {info.driverVehicleInfo ? ` • ${info.driverVehicleInfo}` : ''}
              </span>
              {info.startedAt && (
                <span>
                  Saída:{' '}
                  {new Date(info.startedAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Optional Live Driver Location Card (Etapa 10) */}
        {info.liveDriverLocation && (
          <div className="bg-white rounded-3xl border border-indigo-200 p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                Localização em tempo real do entregador ativa
              </span>
              <span className="text-[11px] text-slate-400">
                Atualizado às{' '}
                {new Date(info.liveDriverLocation.updatedAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="bg-indigo-50/70 rounded-2xl p-3 flex items-center justify-between text-xs text-indigo-950">
              <span className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-indigo-600" />
                Entregador em deslocamento para <strong>{info.neighborhood}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Delivery Timeline */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Etapas da Entrega
          </h3>
          <div className="space-y-4">
            {info.timeline.map((step, idx) => (
              <div key={step.step} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      step.completed
                        ? 'bg-emerald-600 text-white'
                        : step.active
                        ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {step.completed ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                  </div>
                  {idx < info.timeline.length - 1 && (
                    <div
                      className={`w-0.5 h-6 mt-1 ${
                        step.completed ? 'bg-emerald-500' : 'bg-slate-200'
                      }`}
                    />
                  )}
                </div>
                <div className="flex-1 pt-0.5">
                  <p
                    className={`text-sm font-bold ${
                      step.completed || step.active ? 'text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </p>
                  {step.timestamp && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(step.timestamp).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Destination Region & Contact Restaurant */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-xs text-slate-600">
            <MapPin className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              Região de entrega: <strong className="text-slate-900">{info.neighborhood}</strong> —{' '}
              {info.city}/{info.state}
            </span>
          </div>

          {whatsappContactUrl && (
            <a
              href={whatsappContactUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition"
            >
              <MessageCircle className="w-4 h-4" />
              Falar com o Restaurante no WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
