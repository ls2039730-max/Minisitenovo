import React, { useState, useEffect } from 'react';
import {
  Save,
  Truck,
  Store,
  Clock,
  Phone,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Banknote,
  QrCode,
  Loader2,
  MapPin,
  Navigation,
  Calculator,
  Compass,
  Route,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  DeliverySettings,
  DeliveryRule,
  DeliveryOriginAddress,
  DeliveryKmConfig,
  DeliveryPricingMode,
  DeliveryQuoteResponse,
  PaymentMethodConfig,
} from '../../types/order';
import {
  DEFAULT_KM_CONFIG,
  formatAddressSummary,
  hasValidCoordinates,
  isOriginAddressValid,
} from '../../utils/deliveryFeeCalculator';
import { api } from '../../services/api';
import { postalCodeService } from '../../services/postalCodeService';
import { DeliveryRuleModal } from './DeliveryRuleModal';

interface DeliverySettingsTabProps {
  tenantId: string;
}

const EMPTY_ORIGIN_ADDRESS: DeliveryOriginAddress = {
  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  latitude: null,
  longitude: null,
};

export const DeliverySettingsTab: React.FC<DeliverySettingsTabProps> = ({ tenantId }) => {
  const [settings, setSettings] = useState<DeliverySettings | null>(null);
  const [originAddress, setOriginAddress] = useState<DeliveryOriginAddress>(EMPTY_ORIGIN_ADDRESS);
  const [kmConfig, setKmConfig] = useState<DeliveryKmConfig>(DEFAULT_KM_CONFIG);
  const [pricingMode, setPricingMode] = useState<DeliveryPricingMode>('neighborhood');

  const [rules, setRules] = useState<DeliveryRule[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Origin CEP & Geocoding state
  const [isLookingUpOriginCep, setIsLookingUpOriginCep] = useState(false);
  const [isGeocodingOrigin, setIsGeocodingOrigin] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Modal for editing/creating delivery rules
  const [editingRule, setEditingRule] = useState<DeliveryRule | null | 'new'>(null);
  const [ruleToDelete, setRuleToDelete] = useState<DeliveryRule | null>(null);

  // Freight Simulator state
  const [simAddress, setSimAddress] = useState({
    cep: '',
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    state: '',
  });
  const [simSubtotal, setSimSubtotal] = useState('89.99');
  const [isLookingUpSimCep, setIsLookingUpSimCep] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<DeliveryQuoteResponse | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [tenantId]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [s, r, pm] = await Promise.all([
        api.getDeliverySettings(),
        api.getDeliveryRules(),
        api.getPaymentMethods(),
      ]);
      setSettings(s);
      setPricingMode(s.pricingMode || 'neighborhood');
      setOriginAddress(s.originAddress || EMPTY_ORIGIN_ADDRESS);
      setKmConfig({ ...DEFAULT_KM_CONFIG, ...(s.kmConfig || {}) });
      setRules(r);
      setPaymentMethods(pm);

      if (s.originAddress?.city && !simAddress.city) {
        setSimAddress((prev) => ({
          ...prev,
          city: s.originAddress?.city || '',
          state: s.originAddress?.state || '',
        }));
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar configurações de entrega e taxas.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOriginCepChange = async (rawCep: string) => {
    const clean = postalCodeService.cleanCep(rawCep);
    setOriginAddress((prev) => ({ ...prev, cep: clean }));
    if (clean.length === 8) {
      try {
        setIsLookingUpOriginCep(true);
        const res = await postalCodeService.lookup(clean);
        if (res.found) {
          setOriginAddress((prev) => ({
            ...prev,
            cep: clean,
            street: res.street || prev.street,
            neighborhood: res.neighborhood || prev.neighborhood,
            city: res.city || prev.city,
            state: res.state || prev.state,
            latitude: res.latitude ?? prev.latitude,
            longitude: res.longitude ?? prev.longitude,
          }));
        }
      } finally {
        setIsLookingUpOriginCep(false);
      }
    }
  };

  const handleGeocodeOrigin = async () => {
    setGeocodeStatus(null);
    if (!originAddress.street?.trim() || !originAddress.city?.trim() || !originAddress.state?.trim()) {
      setGeocodeStatus({
        type: 'error',
        message: 'Preencha pelo menos Logradouro, Cidade e UF do estabelecimento antes de geocodificar.',
      });
      return;
    }

    try {
      setIsGeocodingOrigin(true);
      const geo = await api.geocodeOriginAddress(originAddress);
      setOriginAddress((prev) => ({
        ...prev,
        latitude: geo.latitude,
        longitude: geo.longitude,
      }));
      setGeocodeStatus({
        type: 'success',
        message: `Coordenadas obtidas com sucesso: (${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)})`,
      });
    } catch (err: any) {
      setGeocodeStatus({
        type: 'error',
        message:
          err.message ||
          'Não foi possível geocodificar o endereço informado. Verifique os dados do endereço e tente novamente.',
      });
    } finally {
      setIsGeocodingOrigin(false);
    }
  };

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!settings) return;

    try {
      setIsSaving(true);
      setError(null);

      // Validate origin address if delivery is enabled and pricingMode requires distance calculation
      if (
        settings.deliveryEnabled &&
        (pricingMode === 'km' || pricingMode === 'neighborhood_km') &&
        !isOriginAddressValid(originAddress)
      ) {
        setError(
          'Para utilizar cobrança por quilômetro, cadastre o endereço de origem do estabelecimento (Rua, Número, Bairro, Cidade e UF).'
        );
        setIsSaving(false);
        return;
      }

      const updated = await api.updateDeliverySettings({
        ordersEnabled: settings.ordersEnabled,
        acceptOrdersWhenClosed: settings.acceptOrdersWhenClosed,
        pickupEnabled: settings.pickupEnabled,
        deliveryEnabled: settings.deliveryEnabled,
        pricingMode,
        originAddress,
        kmConfig,
        minimumOrder: settings.minimumOrder,
        freeDeliveryAbove: settings.freeDeliveryAbove,
        pickupInstructions: settings.pickupInstructions,
        deliveryEstimateText: settings.deliveryEstimateText,
        orderWhatsappNumber: settings.orderWhatsappNumber,
      });

      setSettings(updated);
      setPricingMode(updated.pricingMode || pricingMode);
      if (updated.originAddress) {
        setOriginAddress(updated.originAddress);
      }
      if (updated.kmConfig) {
        setKmConfig({ ...DEFAULT_KM_CONFIG, ...updated.kmConfig });
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar configurações de entrega.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveRule = async (payload: any) => {
    if (editingRule && typeof editingRule === 'object') {
      await api.updateDeliveryRule(editingRule.id, payload);
    } else {
      await api.createDeliveryRule(payload);
    }
    await loadData();
    setEditingRule(null);
  };

  const handleToggleRuleActive = async (rule: DeliveryRule) => {
    try {
      const updated = await api.updateDeliveryRule(rule.id, { isActive: !rule.isActive });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
    } catch (err: any) {
      setError(err.message || 'Erro ao alterar status da regra.');
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await api.deleteDeliveryRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      setRuleToDelete(null);
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir regra.');
    }
  };

  const handleTogglePaymentMethod = async (pm: PaymentMethodConfig) => {
    try {
      const updated = await api.updatePaymentMethod(pm.id, {
        isActive: !pm.isActive,
      });
      setPaymentMethods((prev) =>
        prev.map((item) => (item.id === pm.id ? updated : item))
      );
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar forma de pagamento.');
    }
  };

  const handleSimCepChange = async (rawCep: string) => {
    const clean = postalCodeService.cleanCep(rawCep);
    setSimAddress((prev) => ({ ...prev, cep: clean }));
    if (clean.length === 8) {
      try {
        setIsLookingUpSimCep(true);
        const res = await postalCodeService.lookup(clean);
        if (res.found) {
          setSimAddress((prev) => ({
            ...prev,
            cep: clean,
            street: res.street || prev.street,
            neighborhood: res.neighborhood || prev.neighborhood,
            city: res.city || prev.city,
            state: res.state || prev.state,
          }));
        }
      } finally {
        setIsLookingUpSimCep(false);
      }
    }
  };

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSimError(null);
    setSimResult(null);

    try {
      setIsSimulating(true);
      const quote = await api.simulateDeliveryFee({
        address: simAddress,
        subtotal: parseFloat(simSubtotal.replace(',', '.')) || 0,
        overrideSettings: {
          ...settings,
          pricingMode,
          originAddress,
          kmConfig,
        },
      });
      setSimResult(quote);
    } catch (err: any) {
      setSimError(err.message || 'Erro ao executar simulação de frete.');
    } finally {
      setIsSimulating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 gap-3 text-xs">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
        <span>Carregando configurações de Entrega e Taxas de Entrega...</span>
      </div>
    );
  }

  if (!settings) return null;

  const originHasCoords = hasValidCoordinates(originAddress);

  return (
    <div className="space-y-6">
      {/* Section Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-6 rounded-3xl shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base sm:text-lg font-black tracking-tight">
              Entrega e Taxas de Entrega
            </h2>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl">
            Configure o endereço de origem do restaurante, escolha a modalidade de cobrança (Por Quilômetro, Por Bairro ou Híbrido), defina limites de distância e teste o cálculo em tempo real.
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleSaveSettings()}
          disabled={isSaving}
          className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-extrabold rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer self-start md:self-auto shrink-0"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{isSaving ? 'Salvando...' : 'Salvar Todas as Configurações'}</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-bold">
            Configurações de entrega, endereço de origem e taxas salvas com sucesso!
          </span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* CARD 1: ENDEREÇO DE ORIGEM DO ESTABELECIMENTO */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  1. Endereço de Origem do Estabelecimento
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Ponto de partida oficial utilizado para calcular a rota de entrega e validar a cidade atendida.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {originHasCoords ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Coordenadas Ativas ({originAddress.latitude?.toFixed(4)},{' '}
                  {originAddress.longitude?.toFixed(4)})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Coordenadas pendentes
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">CEP de Origem</label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={9}
                  value={postalCodeService.formatCep(originAddress.cep)}
                  onChange={(e) => handleOriginCepChange(e.target.value)}
                  placeholder="28928-506"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-bold text-slate-800"
                />
                {isLookingUpOriginCep && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 absolute right-3 top-2.5" />
                )}
              </div>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Logradouro (Rua / Avenida) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={originAddress.street}
                onChange={(e) => setOriginAddress({ ...originAddress, street: e.target.value })}
                placeholder="Ex: Avenida Independência"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-medium text-slate-800"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Número <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={originAddress.number}
                onChange={(e) => setOriginAddress({ ...originAddress, number: e.target.value })}
                placeholder="103"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-bold text-slate-800"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Complemento</label>
              <input
                type="text"
                value={originAddress.complement || ''}
                onChange={(e) => setOriginAddress({ ...originAddress, complement: e.target.value })}
                placeholder="Loja 1, Galpão, etc."
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-medium text-slate-800"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Bairro <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={originAddress.neighborhood}
                onChange={(e) =>
                  setOriginAddress({ ...originAddress, neighborhood: e.target.value })
                }
                placeholder="Ex: Unamar"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-medium text-slate-800"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Cidade <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={originAddress.city}
                onChange={(e) => setOriginAddress({ ...originAddress, city: e.target.value })}
                placeholder="Cabo Frio"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-medium text-slate-800"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                UF <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                maxLength={2}
                value={originAddress.state}
                onChange={(e) =>
                  setOriginAddress({ ...originAddress, state: e.target.value.toUpperCase() })
                }
                placeholder="RJ"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-bold text-slate-800 uppercase"
              />
            </div>
          </div>

          {/* Coordinates & Geocoding row */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="grid grid-cols-2 gap-3 flex-1 max-w-md">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Latitude (Origem)
                </label>
                <input
                  type="number"
                  step="any"
                  value={originAddress.latitude ?? ''}
                  onChange={(e) =>
                    setOriginAddress({
                      ...originAddress,
                      latitude: e.target.value !== '' ? parseFloat(e.target.value) : null,
                    })
                  }
                  placeholder="-22.630984"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-mono text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Longitude (Origem)
                </label>
                <input
                  type="number"
                  step="any"
                  value={originAddress.longitude ?? ''}
                  onChange={(e) =>
                    setOriginAddress({
                      ...originAddress,
                      longitude: e.target.value !== '' ? parseFloat(e.target.value) : null,
                    })
                  }
                  placeholder="-42.001668"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-mono text-slate-800"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleGeocodeOrigin}
                disabled={isGeocodingOrigin}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isGeocodingOrigin ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Compass className="w-3.5 h-3.5" />
                )}
                <span>
                  {isGeocodingOrigin
                    ? 'Obtendo coordenadas...'
                    : 'Geocodificar Endereço (Obter Coordenadas)'}
                </span>
              </button>
            </div>
          </div>

          {geocodeStatus && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                geocodeStatus.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {geocodeStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{geocodeStatus.message}</span>
            </div>
          )}
        </div>

        {/* CARD 2: MÉTODO DE COBRANÇA DE ENTREGA (3 MODALIDADES) */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              2. Método de Cobrança da Taxa de Entrega
            </h3>
            <p className="text-xs text-slate-500">
              Escolha como o sistema deve validar a área atendida e calcular o frete dos pedidos.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                id: 'km' as DeliveryPricingMode,
                title: 'Modalidade A: Por Quilômetro',
                desc: 'Calcula o frete automaticamente pela distância (rota viária real ou linha reta) a partir do endereço do restaurante.',
                icon: Route,
              },
              {
                id: 'neighborhood' as DeliveryPricingMode,
                title: 'Modalidade B: Por Bairro',
                desc: 'Define uma tabela de bairros atendidos com valor específico por bairro, validando cidade e UF.',
                icon: MapPin,
              },
              {
                id: 'neighborhood_km' as DeliveryPricingMode,
                title: 'Avançado: Bairro + Adicional por Km',
                desc: 'Valida o bairro atendido com uma taxa-base + valor adicional por quilômetro acima da distância incluída.',
                icon: Sparkles,
              },
            ].map((mode) => {
              const Icon = mode.icon;
              const isSelected = pricingMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setPricingMode(mode.id)}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                    isSelected
                      ? 'bg-indigo-50/70 border-indigo-600 ring-2 ring-indigo-600/20 shadow-xs'
                      : 'bg-slate-50/60 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-slate-600 border border-slate-200'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isSelected ? 'Selecionado' : 'Selecionar'}
                      </span>
                    </div>
                    <strong className="block text-xs font-extrabold text-slate-900">
                      {mode.title}
                    </strong>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{mode.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* MODALIDADE A / HÍBRIDA: CONFIGURAÇÃO POR QUILÔMETRO */}
          {(pricingMode === 'km' || pricingMode === 'neighborhood_km') && (
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-indigo-600" />
                    <span>
                      {pricingMode === 'km'
                        ? 'Parâmetros de Cobrança por Quilômetro (Modalidade A)'
                        : 'Parâmetros de Distância do Modo Híbrido (Bairro + Km)'}
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {pricingMode === 'km'
                      ? 'Fórmula: Frete = Taxa fixa inicial + (Quilômetros cobrados × Valor por km)'
                      : 'Fórmula: Frete = Taxa-base do bairro + max(0, distância − distância incluída) × Adicional por km'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {pricingMode === 'km' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Taxa Fixa Inicial (R$)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                        R$
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={kmConfig.baseFee}
                        onChange={(e) =>
                          setKmConfig({
                            ...kmConfig,
                            baseFee: Math.max(0, parseFloat(e.target.value) || 0),
                          })
                        }
                        className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {pricingMode === 'km'
                      ? 'Valor por Quilômetro (R$/km)'
                      : 'Adicional Padrão por Km (R$/km)'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                      R$
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={kmConfig.pricePerKm}
                      onChange={(e) =>
                        setKmConfig({
                          ...kmConfig,
                          pricePerKm: Math.max(0, parseFloat(e.target.value) || 0),
                        })
                      }
                      className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {pricingMode === 'km'
                      ? 'Distância Mínima Cobrada (km)'
                      : 'Distância Incluída Padrão (km)'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={kmConfig.minDistanceKm}
                    onChange={(e) =>
                      setKmConfig({
                        ...kmConfig,
                        minDistanceKm: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Distância Máxima de Entrega (km)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={kmConfig.maxDistanceKm}
                    onChange={(e) =>
                      setKmConfig({
                        ...kmConfig,
                        maxDistanceKm: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Acima deste raio o pedido é bloqueado.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tipo de Distância Utilizada
                  </label>
                  <select
                    value={kmConfig.distanceMethod}
                    onChange={(e) =>
                      setKmConfig({
                        ...kmConfig,
                        distanceMethod: e.target.value as 'road_route' | 'straight_line',
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="road_route">
                      Distância por Rota Viária Real (Carro/Moto)
                    </option>
                    <option value="straight_line">
                      Distância em Linha Reta (Raio Geográfico)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Taxa Mínima de Entrega (R$){' '}
                    <span className="text-[10px] font-normal text-slate-400">(Opcional)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                      R$
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={kmConfig.minDeliveryFee ?? ''}
                      onChange={(e) =>
                        setKmConfig({
                          ...kmConfig,
                          minDeliveryFee: e.target.value ? parseFloat(e.target.value) : null,
                        })
                      }
                      placeholder="Sem mínimo adicional"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                    />
                  </div>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={kmConfig.roundDistanceUp}
                      onChange={(e) =>
                        setKmConfig({ ...kmConfig, roundDistanceUp: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-bold text-slate-700">
                      Arredondar distância para cima a cada 0,1 km
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CARD 3: TABELA DE BAIRROS ATENDIDOS E REGRAS DE ENTREGA */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                3. Tabela de Bairros Atendidos e Regras de Entrega
              </h3>
              <p className="text-xs text-slate-500">
                {pricingMode === 'km'
                  ? 'Você está usando cobrança Por Quilômetro. Caso queira mudar para Por Bairro no futuro, seus bairros cadastrados ficam salvos abaixo.'
                  : 'Cadastre todos os bairros atendidos pelo estabelecimento com cidade, UF, valor da taxa e status ativo/inativo.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setEditingRule('new')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Bairro / Regra</span>
            </button>
          </div>

          {rules.length === 0 ? (
            <div className="text-center py-8 p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-slate-500 space-y-2">
              <Truck className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-medium">
                Nenhum bairro ou regra de entrega cadastrada para este estabelecimento.
              </p>
              <button
                type="button"
                onClick={() => setEditingRule('new')}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                Clique aqui para cadastrar o primeiro bairro atendido
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold">
                    <th className="py-2.5 px-3">Bairro / Identificador</th>
                    <th className="py-2.5 px-3">Cidade / UF</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3">Taxa</th>
                    <th className="py-2.5 px-3">Tempo / Condições</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rules.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3">
                        <strong className="font-bold text-slate-900 block">
                          {r.neighborhood || r.name}
                        </strong>
                        {r.neighborhood && r.name !== r.neighborhood && (
                          <span className="text-[10px] text-slate-400">{r.name}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600 font-medium">
                        {r.city || originAddress.city || '-'}
                        {r.state || originAddress.state
                          ? ` / ${r.state || originAddress.state}`
                          : ''}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                          {r.type === 'neighborhood' && 'Por Bairro'}
                          {r.type === 'cep_range' && `CEP ${r.cepStart}-${r.cepEnd}`}
                          {r.type === 'fixed' && 'Taxa Geral'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-black text-slate-900">
                        {r.fee === 0 ? 'Grátis' : `R$ ${r.fee.toFixed(2).replace('.', ',')}`}
                        {pricingMode === 'neighborhood_km' && r.extraKmFee ? (
                          <span className="block text-[10px] font-normal text-indigo-600">
                            + R$ {Number(r.extraKmFee).toFixed(2).replace('.', ',')}/km acima de{' '}
                            {r.includedDistanceKm ?? 0} km
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 px-3 text-[11px] text-slate-500">
                        {r.estimatedTime && <span className="block">⏱ {r.estimatedTime}</span>}
                        {r.minimumOrder ? (
                          <span className="block">
                            Mín: R$ {r.minimumOrder.toFixed(2).replace('.', ',')}
                          </span>
                        ) : null}
                        {r.freeDeliveryAbove ? (
                          <span className="block text-emerald-600 font-semibold">
                            Grátis &gt; R$ {r.freeDeliveryAbove.toFixed(2).replace('.', ',')}
                          </span>
                        ) : null}
                        {!r.estimatedTime && !r.minimumOrder && !r.freeDeliveryAbove && 'Padrão'}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => handleToggleRuleActive(r)}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
                            r.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {r.isActive ? 'Ativo' : 'Inativo'}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-right space-x-1">
                        <button
                          type="button"
                          onClick={() => setEditingRule(r)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRuleToDelete(r)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* CARD 4: ACEITE DE PEDIDOS, MODALIDADES E REGRAS GERAIS */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              4. Modalidades de Atendimento, Pedido Mínimo e Frete Grátis
            </h3>
            <p className="text-xs text-slate-500">
              Ative ou desative entregas e retiradas, configure limites globais e número de WhatsApp.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Delivery Toggle */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-indigo-600" />
                  <strong className="text-xs font-bold text-slate-900">
                    Entrega no Endereço (Delivery)
                  </strong>
                </div>
                <input
                  type="checkbox"
                  checked={settings.deliveryEnabled}
                  onChange={(e) =>
                    setSettings({ ...settings, deliveryEnabled: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Estimativa Geral de Tempo de Entrega
                </label>
                <div className="relative">
                  <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={settings.deliveryEstimateText || ''}
                    onChange={(e) =>
                      setSettings({ ...settings, deliveryEstimateText: e.target.value })
                    }
                    placeholder="Ex: 40 a 60 minutos"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Pickup Toggle */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-indigo-600" />
                  <strong className="text-xs font-bold text-slate-900">Retirada no Local</strong>
                </div>
                <input
                  type="checkbox"
                  checked={settings.pickupEnabled}
                  onChange={(e) =>
                    setSettings({ ...settings, pickupEnabled: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Instruções para Retirada
                </label>
                <input
                  type="text"
                  value={settings.pickupInstructions || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, pickupInstructions: e.target.value })
                  }
                  placeholder="Ex: Retire no balcão apresentando o número do pedido."
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                WhatsApp que Recebe os Pedidos
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={settings.orderWhatsappNumber || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, orderWhatsappNumber: e.target.value })
                  }
                  placeholder="Ex: 22999999999"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-medium text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pedido Mínimo Geral (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.minimumOrder}
                  onChange={(e) =>
                    setSettings({ ...settings, minimumOrder: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-bold text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Frete Grátis Geral Acima de (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.freeDeliveryAbove ?? ''}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      freeDeliveryAbove: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                  placeholder="Opcional (ex: 120.00)"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-bold text-slate-800"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <label className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between cursor-pointer">
              <div>
                <strong className="block text-xs font-bold text-slate-900">
                  Aceitar Novos Pedidos Online
                </strong>
                <span className="text-[11px] text-slate-500">
                  Pausa ou ativa o recebimento de pedidos no catálogo digital
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.ordersEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, ordersEnabled: e.target.checked })
                }
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
            </label>

            <label className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between cursor-pointer">
              <div>
                <strong className="block text-xs font-bold text-slate-900">
                  Aceitar Pedidos Fora do Horário
                </strong>
                <span className="text-[11px] text-slate-500">
                  Permite enviar pedidos quando a loja estiver fechada
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.acceptOrdersWhenClosed}
                onChange={(e) =>
                  setSettings({ ...settings, acceptOrdersWhenClosed: e.target.checked })
                }
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Salvando...' : 'Salvar Configurações de Entrega'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* CARD 5: SIMULADOR DE CÁLCULO DE FRETE */}
      <div className="bg-white p-6 rounded-3xl border border-indigo-200/80 shadow-xs space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              5. Simulador de Cálculo de Frete (Teste em Tempo Real)
            </h3>
            <p className="text-xs text-slate-500">
              Informe um endereço de cliente para testar a validação de rota/bairro e verificar a taxa calculada.
            </p>
          </div>
        </div>

        <form onSubmit={handleRunSimulation} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                CEP do Cliente
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={9}
                  value={postalCodeService.formatCep(simAddress.cep)}
                  onChange={(e) => handleSimCepChange(e.target.value)}
                  placeholder="28928-694"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                />
                {isLookingUpSimCep && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 absolute right-2.5 top-2.5" />
                )}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Rua / Logradouro
              </label>
              <input
                type="text"
                value={simAddress.street}
                onChange={(e) => setSimAddress({ ...simAddress, street: e.target.value })}
                placeholder="Ex: Rua San Telmo"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Número</label>
              <input
                type="text"
                value={simAddress.number}
                onChange={(e) => setSimAddress({ ...simAddress, number: e.target.value })}
                placeholder="10"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Bairro</label>
              <input
                type="text"
                value={simAddress.neighborhood}
                onChange={(e) => setSimAddress({ ...simAddress, neighborhood: e.target.value })}
                placeholder="Ex: Unamar"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Cidade</label>
              <input
                type="text"
                value={simAddress.city}
                onChange={(e) => setSimAddress({ ...simAddress, city: e.target.value })}
                placeholder="Ex: Cabo Frio"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">UF</label>
              <input
                type="text"
                maxLength={2}
                value={simAddress.state}
                onChange={(e) =>
                  setSimAddress({ ...simAddress, state: e.target.value.toUpperCase() })
                }
                placeholder="RJ"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 uppercase"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Valor Pedido (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={simSubtotal}
                onChange={(e) => setSimSubtotal(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
              />
            </div>

            <div className="sm:col-span-2 flex items-end">
              <button
                type="submit"
                disabled={isSimulating}
                className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isSimulating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>{isSimulating ? 'Calculando...' : 'Testar Cálculo de Frete'}</span>
              </button>
            </div>
          </div>
        </form>

        {simError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{simError}</span>
          </div>
        )}

        {simResult && (
          <div
            className={`p-4 rounded-2xl border space-y-3 text-xs ${
              simResult.isCovered
                ? 'bg-emerald-50/60 border-emerald-200 text-slate-800'
                : 'bg-rose-50/70 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200/70 pb-2.5">
              <div className="flex items-center gap-2">
                {simResult.isCovered ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <strong className="font-extrabold text-sm">
                  {simResult.isCovered
                    ? 'Endereço Atendido pela Entrega!'
                    : 'Endereço Fora da Área ou Bloqueado'}
                </strong>
              </div>

              {simResult.isCovered && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-semibold">Valor do Frete:</span>
                  <span className="px-3 py-1 rounded-xl bg-emerald-600 text-white font-black text-sm">
                    {simResult.fee === 0
                      ? 'GRÁTIS'
                      : `R$ ${simResult.fee.toFixed(2).replace('.', ',')}`}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px]">
              <div>
                <span className="font-bold text-slate-500 block">Endereço de Origem Utilizado:</span>
                <span className="font-semibold text-slate-800">
                  {simResult.originSummary || formatAddressSummary(originAddress) || 'Não configurado'}
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-500 block">Endereço de Destino Interpretado:</span>
                <span className="font-semibold text-slate-800">
                  {simResult.destinationSummary || '-'}
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-500 block">Modalidade Aplicada:</span>
                <span className="font-bold text-indigo-700">
                  {simResult.pricingMode === 'km' && 'Por Quilômetro (Modalidade A)'}
                  {simResult.pricingMode === 'neighborhood' && 'Por Bairro (Modalidade B)'}
                  {simResult.pricingMode === 'neighborhood_km' &&
                    'Híbrido: Bairro + Adicional por Km'}
                </span>
              </div>
              {simResult.distanceKm !== undefined && simResult.distanceKm !== null && (
                <div>
                  <span className="font-bold text-slate-500 block">Distância Calculada:</span>
                  <span className="font-bold text-slate-900">
                    {simResult.distanceKm.toFixed(2).replace('.', ',')} km (
                    {simResult.distanceMethodUsed === 'straight_line'
                      ? 'Linha reta'
                      : 'Rota viária real'}
                    )
                  </span>
                </div>
              )}
              {simResult.ruleName && (
                <div>
                  <span className="font-bold text-slate-500 block">Regra / Bairro Identificado:</span>
                  <span className="font-bold text-slate-900">{simResult.ruleName}</span>
                </div>
              )}
              {simResult.breakdown?.formulaText && (
                <div>
                  <span className="font-bold text-slate-500 block">Detalhamento do Cálculo:</span>
                  <span className="font-semibold text-slate-800">
                    {simResult.breakdown.formulaText}
                  </span>
                </div>
              )}
            </div>

            {!simResult.isCovered && simResult.reason && (
              <div className="p-2.5 rounded-xl bg-white/80 border border-rose-200 text-rose-800 font-semibold">
                Motivo do bloqueio: {simResult.reason}
              </div>
            )}
          </div>
        )}
      </div>

      {/* CARD 6: FORMAS DE PAGAMENTO */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">6. Formas de Pagamento Aceitas</h3>
          <p className="text-xs text-slate-500">
            Habilite quais opções o cliente poderá escolher ao finalizar o pedido.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {paymentMethods.map((pm) => (
            <div
              key={pm.id}
              className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
                pm.isActive
                  ? 'bg-slate-50 border-slate-300 shadow-xs'
                  : 'bg-white border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700">
                  {pm.type === 'PIX' && <QrCode className="w-3.5 h-3.5" />}
                  {pm.type === 'CASH' && <Banknote className="w-3.5 h-3.5" />}
                  {(pm.type === 'CREDIT_CARD_ON_DELIVERY' ||
                    pm.type === 'DEBIT_CARD_ON_DELIVERY') && (
                    <CreditCard className="w-3.5 h-3.5" />
                  )}
                  {pm.type === 'PAYMENT_ON_PICKUP' && <Store className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <strong className="block text-xs font-bold text-slate-900">{pm.label}</strong>
                  <span className="text-[10px] text-slate-500">
                    {pm.isActive ? 'Habilitado' : 'Desabilitado'}
                  </span>
                </div>
              </div>

              <input
                type="checkbox"
                checked={pm.isActive}
                onChange={() => handleTogglePaymentMethod(pm)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>
          ))}
        </div>
      </div>

      {/* MODAL: ADD / EDIT DELIVERY RULE */}
      {editingRule && (
        <DeliveryRuleModal
          rule={typeof editingRule === 'object' ? editingRule : null}
          defaultCity={originAddress.city}
          defaultState={originAddress.state}
          pricingMode={pricingMode}
          onSave={handleSaveRule}
          onClose={() => setEditingRule(null)}
        />
      )}

      {/* INLINE CONFIRMATION FOR RULE DELETION */}
      {ruleToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <h4 className="text-sm font-extrabold text-slate-900">Excluir Bairro / Regra</h4>
            <p className="text-xs text-slate-600">
              Deseja realmente excluir a regra{' '}
              <strong>{ruleToDelete.neighborhood || ruleToDelete.name}</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRuleToDelete(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDeleteRule(ruleToDelete.id)}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl cursor-pointer"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
