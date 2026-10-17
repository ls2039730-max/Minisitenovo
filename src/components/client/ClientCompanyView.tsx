import React, { useState } from 'react';
import { Tenant } from '../../types/saas';
import { api } from '../../services/api';
import { Building2, Save, Phone, Mail, Globe, CheckCircle2, AlertCircle, Copy, Check, ExternalLink } from 'lucide-react';

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
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/p/${tenant.slug}` : `/p/${tenant.slug}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      });
      onUpdated(updated);
      setFeedback('Informações da empresa salvas com sucesso!');
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
          Gerencie os canais de contato e informações de atendimento do seu negócio.
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
                href={`/p/${tenant.slug}`}
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
