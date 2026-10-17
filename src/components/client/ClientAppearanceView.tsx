import React, { useState, useEffect } from 'react';
import { Tenant, TenantAppearance } from '../../types/saas';
import { api } from '../../services/api';
import { Palette, Save, CheckCircle2, AlertCircle, Eye, Sparkles, Image, Copy, Check, ExternalLink, Globe } from 'lucide-react';

interface ClientAppearanceViewProps {
  tenant: Tenant;
  onUpdated: (updatedTenant: Tenant) => void;
}

export const ClientAppearanceView: React.FC<ClientAppearanceViewProps> = ({
  tenant,
  onUpdated,
}) => {
  const [appearance, setAppearance] = useState<TenantAppearance>({
    logoUrl: tenant.appearance?.logoUrl || '',
    primaryColor: tenant.appearance?.primaryColor || '#1e293b',
    secondaryColor: tenant.appearance?.secondaryColor || '#3b82f6',
    accentColor: tenant.appearance?.accentColor || '#f59e0b',
    fontFamily: tenant.appearance?.fontFamily || 'Inter',
    tagline: tenant.appearance?.tagline || '',
  });

  // Sync state when tenant updates from server or session refresh
  useEffect(() => {
    if (tenant.appearance) {
      setAppearance({
        logoUrl: tenant.appearance.logoUrl || '',
        primaryColor: tenant.appearance.primaryColor || '#1e293b',
        secondaryColor: tenant.appearance.secondaryColor || '#3b82f6',
        accentColor: tenant.appearance.accentColor || '#f59e0b',
        fontFamily: tenant.appearance.fontFamily || 'Inter',
        tagline: tenant.appearance.tagline || '',
      });
    }
  }, [tenant.id, tenant.appearance]);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    setError(null);
    try {
      const updated = await api.updateTenant(tenant.id, {
        appearance,
      });
      onUpdated(updated);
      setFeedback('Identidade visual da sua empresa atualizada com sucesso!');
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar identidade visual.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="pb-2 border-b border-slate-200/60">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Identidade Visual da Marca</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Defina as cores, tipografia e logo que seus clientes verão na página digital.
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Editor Form */}
        <form onSubmit={handleSave} className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Logomarca da Empresa
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={appearance.logoUrl || ''}
                    onChange={(e) => setAppearance({ ...appearance, logoUrl: e.target.value })}
                    placeholder="https://exemplo.com/logo.png ou faça upload ao lado"
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  <Image className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <label className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0">
                  <span>Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = async () => {
                        const base64 = reader.result as string;
                        try {
                          const res = await api.uploadMedia(base64, file.name, file.type);
                          setAppearance({ ...appearance, logoUrl: res.url });
                          setFeedback('Upload realizado com sucesso!');
                        } catch (err: any) {
                          setError('Erro no upload: ' + err.message);
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Envie o arquivo direto do seu dispositivo ou informe uma URL externa.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Slogan / Frase de Apresentação
              </label>
              <input
                type="text"
                value={appearance.tagline || ''}
                onChange={(e) => setAppearance({ ...appearance, tagline: e.target.value })}
                placeholder="Ex: O melhor corte e barba da região central."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cor Primária</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={appearance.primaryColor}
                    onChange={(e) => setAppearance({ ...appearance, primaryColor: e.target.value })}
                    className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={appearance.primaryColor}
                    onChange={(e) => setAppearance({ ...appearance, primaryColor: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-mono text-[11px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Secundária</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={appearance.secondaryColor}
                    onChange={(e) => setAppearance({ ...appearance, secondaryColor: e.target.value })}
                    className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={appearance.secondaryColor}
                    onChange={(e) => setAppearance({ ...appearance, secondaryColor: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-mono text-[11px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Destaque</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={appearance.accentColor}
                    onChange={(e) => setAppearance({ ...appearance, accentColor: e.target.value })}
                    className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={appearance.accentColor}
                    onChange={(e) => setAppearance({ ...appearance, accentColor: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-mono text-[11px]"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tipografia Segura
              </label>
              <select
                value={appearance.fontFamily}
                onChange={(e) => setAppearance({ ...appearance, fontFamily: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Inter">Inter (Moderna, Equilibrada e Limpa)</option>
                <option value="Roboto">Roboto (Profissional e Técnica)</option>
                <option value="Poppins">Poppins (Despojada e Arredondada)</option>
                <option value="Montserrat">Montserrat (Elegante e Impactante)</option>
                <option value="Playfair Display">Playfair Display (Clássica e Sofisticada)</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Identidade Visual
            </button>
          </div>
        </form>

        {/* Live Visual Preview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-600" />
              Pré-visualização da Página Digital
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-mono bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">{publicUrl}</span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                <span>{copied ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          <div
            className="rounded-3xl border border-slate-200 shadow-xl overflow-hidden transition-all text-white p-6 sm:p-8"
            style={{
              backgroundColor: appearance.primaryColor,
              fontFamily: appearance.fontFamily,
            }}
          >
            {/* Header Mockup */}
            <div className="flex items-center justify-between pb-6 border-b border-white/10">
              <div className="flex items-center gap-3.5">
                {appearance.logoUrl ? (
                  <img
                    src={appearance.logoUrl}
                    alt="Logo"
                    className="w-12 h-12 rounded-xl object-cover bg-white/10"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center font-extrabold text-white text-base shadow-md ring-2 ring-white/20"
                    style={{ backgroundColor: appearance.secondaryColor }}
                  >
                    {tenant.name.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h4 className="font-extrabold text-lg leading-tight tracking-tight">{tenant.name}</h4>
                  <p className="text-xs opacity-75">{tenant.segment}</p>
                </div>
              </div>

              <span
                className="text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-xs"
                style={{
                  backgroundColor: appearance.accentColor,
                  color: '#0f172a',
                }}
              >
                Aberto Agora
              </span>
            </div>

            {/* Tagline / Hero Mockup */}
            <div className="py-8 text-center space-y-3">
              <p className="text-sm sm:text-base font-medium opacity-90 max-w-sm mx-auto leading-relaxed">
                "{appearance.tagline || 'Bem-vindo ao nosso espaço digital. Atendimento exclusivo e produtos selecionados.'}"
              </p>
              <p className="text-xs opacity-70">
                Atendimento via WhatsApp • {tenant.phone}
              </p>
            </div>

            {/* Action Buttons Mockup */}
            <div className="space-y-2.5 pt-4">
              <button
                type="button"
                className="w-full py-3.5 px-4 rounded-2xl font-bold text-xs shadow-md transition-transform active:scale-95 flex items-center justify-center gap-2"
                style={{
                  backgroundColor: appearance.secondaryColor,
                  color: '#ffffff',
                }}
              >
                Falar Conosco no WhatsApp
              </button>

              <button
                type="button"
                className="w-full py-3 px-4 rounded-2xl font-semibold text-xs border border-white/20 bg-white/10 hover:bg-white/20 transition-colors"
              >
                Ver Cardápio & Serviços
              </button>
            </div>

            <div className="mt-8 pt-4 border-t border-white/10 text-center">
              <span className="text-[10px] opacity-50 font-mono">
                Desenvolvido por LocalHub SaaS Multi-Tenant
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
