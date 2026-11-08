import React, { useEffect, useState } from 'react';
import { Tenant } from '../../types/saas';
import { api } from '../../services/api';
import { lookupPostalCode, formatPostalCode } from '../../services/postalCodeService';
import { getPublicStoreUrl } from '../../utils/url';
import { formatAddressSummary, hasValidCoordinates } from '../../utils/deliveryFeeCalculator';
import { isExactGeocodePrecision } from '../../utils/addressCoordinateValidator';
import { AddressVerificationMapCard } from '../common/AddressVerificationMapCard';
import {
   Save,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  MapPin,
  Search,
} from 'lucide-react';

interface ClientCompanyViewProps {
  tenant: Tenant;
  onUpdated: (updatedTenant: Tenant) => void;
}

export const ClientCompanyView: React.FC<ClientCompanyViewProps> = ({ tenant, onUpdated }) => {
  const [phone, setPhone] = useState(tenant.phone);
  const [whatsapp, setWhatsapp] = useState(tenant.whatsapp);
  const [email, setEmail] = useState(tenant.email);
  const [segment, setSegment] = useState(tenant.segment);
  const [cnpj, setCnpj] = useState(tenant.cnpj || '');

  // Official Address fields (Single Source of Truth)
  const [cep, setCep] = useState(tenant.cep || '');
  const [street, setStreet] = useState(tenant.street || '');
  const [number, setNumber] = useState(tenant.number || '');
  const [complement, setComplement] = useState(tenant.complement || '');
  const [neighborhood, setNeighborhood] = useState(tenant.neighborhood || '');
  const [city, setCity] = useState(tenant.city || '');
  const [stateUf, setStateUf] = useState(tenant.state || '');
  const [lookingUpCep, setLookingUpCep] = useState(false);

  // Geographic verification state
  const [latitude, setLatitude] = useState<number | null>(tenant.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(tenant.longitude ?? null);
  const [geocodeStatus, setGeocodeStatus] = useState<'geocoded' | 'pending' | 'manual' | null>(
    tenant.geocodeStatus ?? (tenant.latitude ? 'geocoded' : 'pending')
  );
  const [geocodePrecision, setGeocodePrecision] = useState<string | null>(
    tenant.geocodePrecision ?? null
  );
  const [geocodedAt, setGeocodedAt] = useState<string | null>(tenant.geocodedAt ?? null);
  const [queriedAddress, setQueriedAddress] = useState<string | null>(
    tenant.formattedAddress ?? null
  );
  const [isApproximate, setIsApproximate] = useState<boolean>(
    Boolean(
      tenant.isApproximate ||
        !isExactGeocodePrecision(tenant.geocodePrecision, tenant.geocodeStatus, tenant.isApproximate)
    )
  );
  const [hasUnsavedAddressEdit, setHasUnsavedAddressEdit] = useState(false);
  const [previousPinWasManual, setPreviousPinWasManual] = useState(false);
  const [syncErrorState, setSyncErrorState] = useState<'not_found' | 'service_error' | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch enriched tenant coordinates on mount
  useEffect(() => {
    let mounted = true;
    api
      .getTenant(tenant.id)
      .then((fresh) => {
        if (!mounted || !fresh) return;
        if (fresh.cep !== undefined) setCep(fresh.cep || '');
        if (fresh.street !== undefined) setStreet(fresh.street || '');
        if (fresh.number !== undefined) setNumber(fresh.number || '');
        if (fresh.complement !== undefined) setComplement(fresh.complement || '');
        if (fresh.neighborhood !== undefined) setNeighborhood(fresh.neighborhood || '');
        if (fresh.city !== undefined) setCity(fresh.city || '');
        if (fresh.state !== undefined) setStateUf(fresh.state || '');

        if (hasValidCoordinates(fresh.latitude, fresh.longitude)) {
          setLatitude(fresh.latitude!);
          setLongitude(fresh.longitude!);
          setGeocodeStatus(fresh.geocodeStatus || 'geocoded');
          setGeocodePrecision(fresh.geocodePrecision || null);
          setGeocodedAt(fresh.geocodedAt || null);
          setQueriedAddress(fresh.formattedAddress || null);
          const approx =
            Boolean(fresh.isApproximate) ||
            !isExactGeocodePrecision(
              fresh.geocodePrecision,
              fresh.geocodeStatus,
              fresh.isApproximate
            );
          setIsApproximate(approx);
          setSyncErrorState(null);
        } else {
          setLatitude(null);
          setLongitude(null);
          setGeocodeStatus('pending');
          setGeocodePrecision(null);
        }
      })
      .catch(() => {
        // ignore
      });
    return () => {
      mounted = false;
    };
  }, [tenant.id]);

  const publicUrl = getPublicStoreUrl(tenant.slug);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Whenever ANY official address field changes (CEP, street, number, complement,
   * neighborhood, city, state), invalidate previous coordinates (including manual pins
   * from a previous address) and mark the location as awaiting confirmation.
   */
  const invalidateCoordinatesOnAddressEdit = () => {
    if (geocodeStatus === 'manual') {
      setPreviousPinWasManual(true);
    }
    setHasUnsavedAddressEdit(true);
    setSyncErrorState(null);
    setLatitude(null);
    setLongitude(null);
    setGeocodeStatus('pending');
    setGeocodePrecision(null);
    setIsApproximate(false);
  };

  const handleCepLookup = async (rawCep: string) => {
    const clean = rawCep.replace(/\D/g, '');
    if (clean.length !== 8) return;
    try {
      setLookingUpCep(true);
      const data = await lookupPostalCode(clean, tenant.slug);
      if (data) {
        if (data.street) setStreet(data.street);
        if (data.neighborhood) setNeighborhood(data.neighborhood);
        if (data.city) setCity(data.city);
        if (data.state) setStateUf(data.state);
        invalidateCoordinatesOnAddressEdit();
      }
    } catch {
      // silent fallback
    } finally {
      setLookingUpCep(false);
    }
  };

  /**
   * Action: "Atualizar localização no mapa"
   * Re-fetches / saves the official address in Minha Empresa, runs fresh geocoding
   * ignoring previous cache, updates Operational Map & active routes if exact.
   */
  const handleRefreshLocationOnMap = async () => {
    setError(null);
    setFeedback(null);
    setSyncErrorState(null);

    if (!street.trim() || !city.trim() || !stateUf.trim()) {
      setError('Informe ao menos o logradouro, cidade e UF para atualizar a localização no mapa.');
      setSyncErrorState('not_found');
      return;
    }

    setIsGeocoding(true);
    try {
      const result = await api.refreshCompanyOriginLocation({
        cep: cep.replace(/\D/g, ''),
        street: street.trim(),
        number: number.trim() || 'S/N',
        complement: complement.trim(),
        neighborhood: neighborhood.trim(),
        city: city.trim(),
        state: stateUf.trim().toUpperCase(),
      });

      const origin = result.originAddress;
      const valid = hasValidCoordinates(origin.latitude, origin.longitude);

      if (valid) {
        setLatitude(origin.latitude!);
        setLongitude(origin.longitude!);
        setGeocodeStatus(origin.geocodeStatus || 'geocoded');
        setGeocodePrecision(origin.geocodePrecision || 'rooftop');
        setGeocodedAt(origin.geocodedAt || new Date().toISOString());
        setQueriedAddress(origin.formattedAddress || null);
        const approx =
          Boolean(origin.isApproximate) ||
          !isExactGeocodePrecision(
            origin.geocodePrecision,
            origin.geocodeStatus,
            origin.isApproximate
          );
        setIsApproximate(approx);
        setHasUnsavedAddressEdit(false);
        setPreviousPinWasManual(false);
        setSyncErrorState(null);

        const freshTenant = await api.getTenant(tenant.id);
        onUpdated(freshTenant);

        if (approx) {
          setFeedback(
            'Localização aproximada obtida. Confira o pino no mapa e clique em "Ajustar pino manualmente" caso queira cravar o ponto exato do estabelecimento.'
          );
        } else {
          setFeedback(
            result.activeRoutesUpdated > 0
              ? `Localização oficial atualizada no mapa e ${result.activeRoutesUpdated} rota(s) ativa(s) recalculada(s) automaticamente!`
              : 'Localização oficial da empresa atualizada e sincronizada em todos os módulos!'
          );
        }
      } else {
        setLatitude(null);
        setLongitude(null);
        setGeocodeStatus('pending');
        setGeocodePrecision(null);
        setSyncErrorState('not_found');
        setError(
          'Endereço não localizado automaticamente. Verifique os dados ou utilize "Ajustar pino manualmente".'
        );
      }
    } catch (err: any) {
      const msg = err?.message || 'Falha ao consultar serviço de mapas.';
      if (msg.toLowerCase().includes('não foi possível') || msg.toLowerCase().includes('não localizado')) {
        setSyncErrorState('not_found');
      } else {
        setSyncErrorState('service_error');
      }
      setError(msg);
    } finally {
      setIsGeocoding(false);
    }
  };

  /**
   * Action: "Ajustar pino manualmente" -> Confirm and save manual coordinates
   */
  const handleSaveManualCoordinates = async (manualLat: number, manualLng: number) => {
    setError(null);
    setFeedback(null);
    setSyncErrorState(null);

    const nowIso = new Date().toISOString();
    setLatitude(manualLat);
    setLongitude(manualLng);
    setGeocodeStatus('manual');
    setGeocodePrecision('manual');
    setGeocodedAt(nowIso);
    setIsApproximate(false);
    setHasUnsavedAddressEdit(false);
    setPreviousPinWasManual(false);

    const updated = await api.updateTenant(tenant.id, {
      phone,
      whatsapp,
      email,
      segment,
      cnpj,
      cep: cep.replace(/\D/g, ''),
      street: street.trim(),
      number: number.trim(),
      complement: complement.trim(),
      neighborhood: neighborhood.trim(),
      city: city.trim(),
      state: stateUf.trim().toUpperCase(),
      latitude: manualLat,
      longitude: manualLng,
      geocodeStatus: 'manual',
      forceManualPinSave: true,
    } as any);

    if (updated.geocodedAt) setGeocodedAt(updated.geocodedAt);
    if (updated.formattedAddress) setQueriedAddress(updated.formattedAddress);

    onUpdated(updated);
    setFeedback(
      updated.activeRoutesUpdated && updated.activeRoutesUpdated > 0
        ? `Pino ajustado manualmente, salvo como referência oficial e ${updated.activeRoutesUpdated} rota(s) ativa(s) atualizada(s)!`
        : 'Pino ajustado manualmente e salvo como localização oficial da empresa em todo o sistema!'
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    setError(null);
    setSyncErrorState(null);

    try {
      const payload: any = {
        phone,
        whatsapp,
        email,
        segment,
        cnpj,
        cep: cep.replace(/\D/g, ''),
        street: street.trim(),
        number: number.trim(),
        complement: complement.trim(),
        neighborhood: neighborhood.trim(),
        city: city.trim(),
        state: stateUf.trim().toUpperCase(),
      };

      // Only send manual coordinates if the address was NOT edited since the manual pin was confirmed
      if (
        !hasUnsavedAddressEdit &&
        geocodeStatus === 'manual' &&
        typeof latitude === 'number' &&
        typeof longitude === 'number'
      ) {
        payload.latitude = latitude;
        payload.longitude = longitude;
        payload.geocodeStatus = 'manual';
        payload.forceManualPinSave = true;
      }

      const updated = await api.updateTenant(tenant.id, payload);
      const valid = hasValidCoordinates(updated.latitude, updated.longitude);

      if (valid) {
        setLatitude(updated.latitude!);
        setLongitude(updated.longitude!);
        setGeocodeStatus(updated.geocodeStatus || 'geocoded');
        setGeocodePrecision(updated.geocodePrecision || 'rooftop');
        setGeocodedAt(updated.geocodedAt || new Date().toISOString());
        setQueriedAddress(updated.formattedAddress || null);
        const approx =
          Boolean(updated.isApproximate) ||
          !isExactGeocodePrecision(
            updated.geocodePrecision,
            updated.geocodeStatus,
            updated.isApproximate
          );
        setIsApproximate(approx);
        setHasUnsavedAddressEdit(false);
        setPreviousPinWasManual(false);
        setSyncErrorState(null);
      } else {
        setLatitude(null);
        setLongitude(null);
        setGeocodeStatus('pending');
        setGeocodePrecision(null);
        setHasUnsavedAddressEdit(false);
        setSyncErrorState('not_found');
      }

      onUpdated(updated);
      setFeedback(
        updated.activeRoutesUpdated && updated.activeRoutesUpdated > 0
          ? `Endereço oficial salvo, pino sincronizado e ${updated.activeRoutesUpdated} rota(s) ativa(s) recalculada(s)!`
          : 'Informações, endereço oficial e localização da empresa sincronizados com sucesso!'
      );
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar dados da empresa.');
      setSyncErrorState('service_error');
    } finally {
      setLoading(false);
    }
  };

  const formattedSummary = formatAddressSummary({
    cep,
    street,
    number,
    complement,
    neighborhood,
    city,
    state: stateUf,
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="pb-2 border-b border-slate-200/60">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Minha Empresa</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Gerencie os canais de contato e o endereço oficial de localização do seu estabelecimento em todo o sistema.
        </p>
      </div>

      {feedback && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {feedback}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nome da Empresa (Registrado)
            </label>
            <input
              type="text"
              disabled
              value={tenant.name}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-xs cursor-not-allowed"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Para alterar o nome fantasia principal, contate a administração da plataforma.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Link da Página Digital / Mini Site
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                disabled
                value={publicUrl}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-mono text-xs"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
                <span>{copied ? 'Copiado!' : 'Copiar'}</span>
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Abrir</span>
              </a>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Endereço exclusivo para compartilhar com seus clientes.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Segmento</label>
            <input
              type="text"
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">CNPJ</label>
            <input
              type="text"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              placeholder="00.000.000/0001-00"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone Fixo / Comercial</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp de Atendimento</label>
            <input
              type="text"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="11999998888"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail Comercial Oficial</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Endereço Oficial do Estabelecimento */}
        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Endereço Oficial do Estabelecimento (Fonte Única de Verdade)
              </h2>
            </div>
            <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
              Sincronizado com Entregas, Rotas e Mapa Operacional
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">CEP</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={formatPostalCode(cep)}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCep(val);
                    invalidateCoordinatesOnAddressEdit();
                    if (val.replace(/\D/g, '').length === 8) {
                      handleCepLookup(val);
                    }
                  }}
                  placeholder="00000-000"
                  maxLength={9}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => handleCepLookup(cep)}
                  disabled={lookingUpCep}
                  className="px-2.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 cursor-pointer"
                  title="Buscar CEP"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="sm:col-span-6">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Logradouro (Rua / Avenida)</label>
              <input
                type="text"
                value={street}
                onChange={(e) => {
                  setStreet(e.target.value);
                  invalidateCoordinatesOnAddressEdit();
                }}
                placeholder="Ex: Av. Independência"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Número</label>
              <input
                type="text"
                value={number}
                onChange={(e) => {
                  setNumber(e.target.value);
                  invalidateCoordinatesOnAddressEdit();
                }}
                placeholder="Ex: 5019"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Complemento</label>
              <input
                type="text"
                value={complement}
                onChange={(e) => {
                  setComplement(e.target.value);
                  invalidateCoordinatesOnAddressEdit();
                }}
                placeholder="Loja 1, Bloco B"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bairro</label>
              <input
                type="text"
                value={neighborhood}
                onChange={(e) => {
                  setNeighborhood(e.target.value);
                  invalidateCoordinatesOnAddressEdit();
                }}
                placeholder="Ex: Unamar"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cidade</label>
              <input
                type="text"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  invalidateCoordinatesOnAddressEdit();
                }}
                placeholder="Ex: Cabo Frio"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">UF</label>
              <input
                type="text"
                value={stateUf}
                onChange={(e) => {
                  setStateUf(e.target.value.toUpperCase());
                  invalidateCoordinatesOnAddressEdit();
                }}
                placeholder="RJ"
                maxLength={2}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs uppercase focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Seção: Localização da empresa no mapa */}
          <div className="pt-2">
            <AddressVerificationMapCard
              title="Localização da empresa no mapa"
              formattedAddress={formattedSummary}
              queriedAddress={queriedAddress}
              latitude={latitude}
              longitude={longitude}
              geocodeStatus={geocodeStatus}
              geocodePrecision={geocodePrecision}
              geocodedAt={geocodedAt}
              isApproximate={isApproximate}
              hasUnsavedAddressEdit={hasUnsavedAddressEdit}
              previousPinWasManual={previousPinWasManual}
              syncErrorState={syncErrorState}
              markerLabel={tenant.name || 'Minha Empresa'}
              markerType="company"
              isGeocoding={isGeocoding}
              onGeocodeNow={handleRefreshLocationOnMap}
              onSaveManualCoordinates={handleSaveManualCoordinates}
              primaryActionLabel="Atualizar localização no mapa"
              secondaryActionLabel="Ajustar pino manualmente"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Dados da Empresa
          </button>
        </div>
      </form>
    </div>
  );
};
