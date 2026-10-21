import React, { useState } from 'react';
import { Tenant } from '../../types/saas';
import { api } from '../../services/api';
import { lookupPostalCode, formatPostalCode } from '../../services/postalCodeService';
import { getPublicStoreUrl } from '../../utils/url';
import { Building2, Save, Phone, Mail, Globe, CheckCircle2, AlertCircle, Copy, Check, ExternalLink, MapPin, Search } from 'lucide-react';

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

  // Address fields
  const [cep, setCep] = useState(tenant.cep || '');
  const [street, setStreet] = useState(tenant.street || '');
  const [number, setNumber] = useState(tenant.number || '');
  const [complement, setComplement] = useState(tenant.complement || '');
  const [neighborhood, setNeighborhood] = useState(tenant.neighborhood || '');
  const [city, setCity] = useState(tenant.city || '');
  const [stateUf, setStateUf] = useState(tenant.state || '');
  const [lookingUpCep, setLookingUpCep] = useState(false);

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const publicUrl = getPublicStoreUrl(tenant.slug);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      }
    } catch {
      // silent fallback
    } finally {
      setLookingUpCep(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    setError(null);
    try {
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
      });
      onUpdated(updated);
      setFeedback('Informações e endereço da empresa salvos com sucesso!');
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar dados da empresa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="pb-2 border-b border-slate-200/60">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Minha Empresa</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Gerencie os canais de contato, endereço oficial e informações de atendimento do seu negócio.
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

        {/* Endereço do Estabelecimento */}
        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">Endereço do Estabelecimento (Origem de Entrega)</h2>
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
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Ex: Av. Independência"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Número</label>
              <input
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="Ex: 103"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Complemento</label>
              <input
                type="text"
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                placeholder="Loja 1, Bloco B"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bairro</label>
              <input
                type="text"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder="Ex: Unamar"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cidade</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex: Cabo Frio"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">UF</label>
              <input
                type="text"
                value={stateUf}
                onChange={(e) => setStateUf(e.target.value.toUpperCase())}
                placeholder="RJ"
                maxLength={2}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs uppercase focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
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
