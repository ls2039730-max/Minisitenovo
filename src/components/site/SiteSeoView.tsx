import React, { useState } from 'react';
import { Search, Sparkles, Share2, Globe, Eye, CheckCircle2, ShieldCheck } from 'lucide-react';
import { SiteData, SiteSeo } from '../../types/site';
import { Tenant } from '../../types/saas';
import { ImageUpload } from '../common/ImageUpload';

interface SiteSeoViewProps {
  tenant: Tenant;
  site: SiteData;
  onUpdateSeo: (newSeo: Partial<SiteSeo>, immediate?: boolean) => void;
}

export const SiteSeoView: React.FC<SiteSeoViewProps> = ({
  tenant,
  site,
  onUpdateSeo,
}) => {
  const seo = site.seo;
  const [savedMsg, setSavedMsg] = useState(false);

  const handleAutoGenerate = () => {
    const autoTitle = `${tenant.name} | ${tenant.segment || 'Serviços & Atendimento Local'}`;
    const autoDesc = `Conheça ${tenant.name}. Atendimento de excelência, qualidade e confiança. Entre em contato pelo WhatsApp e confira nossos horários e localização!`;
    const autoKeywords = `${tenant.name}, ${tenant.segment || ''}, atendimento local, são paulo, whatsapp`.toLowerCase();

    onUpdateSeo({
      title: autoTitle,
      description: autoDesc,
      keywords: autoKeywords,
      ogTitle: autoTitle,
      ogDescription: autoDesc,
      ogImage: seo.ogImage || tenant.appearance?.logoUrl || '',
    }, true);

    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  };

  const handleManualSave = () => {
    onUpdateSeo(seo, true);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  };

  const currentUrl = `https://${tenant.subdomain}`;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 overflow-y-auto">
      {/* Intro */}
      <div className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Search className="w-5 h-5 text-indigo-600" />
            SEO & Compartilhamento Social
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Configure como sua empresa aparece no Google e nas prévias ao compartilhar links no WhatsApp e redes sociais.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAutoGenerate}
          className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shrink-0 self-start sm:self-auto shadow-xs"
        >
          <Sparkles className="w-4 h-4 text-indigo-600" />
          Gerar SEO Automático
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Form Fields (Col 7) */}
        <div className="lg:col-span-7 space-y-5">
           {/* Title */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800">Título da Página (Page Title)</label>
              <span className={`text-[11px] font-mono ${seo.title.length > 60 ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>
                {seo.title.length}/60 caracteres
              </span>
            </div>
            <input
              type="text"
              placeholder="Ex: Barbearia Prime | Barbearia & Barba em São Paulo"
              value={seo.title || ''}
              onChange={(e) => onUpdateSeo({ title: e.target.value }, true)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:border-indigo-500"
            />
            <p className="text-[11px] text-slate-500">
              Aparece na aba do navegador e no título dos resultados de busca do Google.
            </p>
          </div>

          {/* Description */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800">Meta Descrição</label>
              <span className={`text-[11px] font-mono ${seo.description.length > 160 ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>
                {seo.description.length}/160 caracteres
              </span>
            </div>
            <textarea
              rows={3}
              placeholder="Descreva seu estabelecimento em 1 ou 2 frases objetivas e atraentes..."
              value={seo.description || ''}
              onChange={(e) => onUpdateSeo({ description: e.target.value }, true)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:border-indigo-500 leading-relaxed"
            />
            <p className="text-[11px] text-slate-500">
              Resumo exibido abaixo do título nos resultados de pesquisa.
            </p>
          </div>

          {/* Social Image */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 block">
                Imagem de Compartilhamento (WhatsApp & Redes Sociais)
              </label>
              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                ✓ Aparece no WhatsApp
              </span>
            </div>

            {tenant.appearance?.logoUrl && (
              <div className="flex items-center justify-between p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={tenant.appearance.logoUrl}
                    alt={tenant.name}
                    className="w-9 h-9 rounded-lg object-contain bg-white border border-indigo-200 p-0.5 shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="font-bold text-indigo-950 block truncate">Logo Oficial de {tenant.name}</span>
                    <span className="text-[10px] text-indigo-700/80 block">
                      Aparece na miniatura ao enviar o link no WhatsApp
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdateSeo({ ogImage: tenant.appearance.logoUrl }, true)}
                  className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shrink-0 transition-colors cursor-pointer shadow-xs"
                >
                  Usar Logo
                </button>
              </div>
            )}

            <ImageUpload
              value={seo.ogImage || ''}
              onChange={(url) => onUpdateSeo({ ogImage: url }, true)}
              subfolder="seo"
              aspectRatio="banner"
              helperText="Se não enviar uma imagem personalizada, a logo oficial da sua loja será usada automaticamente no WhatsApp."
            />
          </div>

          {/* Indexing Toggle */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-800">Permitir Indexação nos Motores de Busca</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Gera tag `robots: index, follow` para permitir que o Google encontre sua página.
              </p>
            </div>
            <input
              type="checkbox"
              checked={seo.allowIndexing !== false}
              onChange={(e) => onUpdateSeo({ allowIndexing: e.target.checked }, true)}
              className="w-4 h-4 rounded-md text-indigo-600 cursor-pointer"
            />
          </div>

          {/* Save Button & Feedback */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleManualSave}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm flex items-center gap-2"
            >
              Salvar Alterações de SEO
            </button>
            {savedMsg && (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" /> SEO salvo com sucesso!
              </span>
            )}
          </div>
        </div>

        {/* Live Previews (Col 5) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Google Search Snippet Preview */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <Globe className="w-4 h-4 text-indigo-600" />
              Prévia no Google
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 font-sans">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 truncate">
                <span className="w-3.5 h-3.5 rounded-full bg-slate-300 inline-block shrink-0" />
                <span>{currentUrl}</span>
              </div>
              <h4 className="text-sm font-semibold text-blue-700 hover:underline cursor-pointer line-clamp-1 leading-snug">
                {seo.title || `${tenant.name} | ${tenant.segment}`}
              </h4>
              <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                {seo.description || 'Nenhum resumo configurado para a página até o momento.'}
              </p>
            </div>
          </div>

          {/* Social Share Card Preview (WhatsApp / Facebook) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Share2 className="w-4 h-4 text-emerald-600" />
                Prévia ao Enviar no WhatsApp
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Oficial
              </span>
            </div>

            {/* WhatsApp Message Bubble Mock */}
            <div className="bg-[#EFEAE2] p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-inner">
              <div className="max-w-xs mx-auto bg-white rounded-2xl overflow-hidden shadow-md border border-slate-200/80">
                {/* Media header in bubble */}
                <div className="aspect-[1.91/1] bg-slate-100 relative overflow-hidden flex items-center justify-center">
                  {seo.ogImage || tenant.appearance?.logoUrl ? (
                    <img
                      src={seo.ogImage || tenant.appearance?.logoUrl}
                      alt={tenant.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-slate-400 text-center">
                      <Share2 className="w-8 h-8 mb-1.5 opacity-40 text-emerald-600" />
                      <span className="text-[11px] font-medium text-slate-500">Logo ou imagem da loja</span>
                    </div>
                  )}
                </div>

                {/* Card text content */}
                <div className="p-3 bg-slate-50/70 border-t border-slate-100 space-y-1">
                  <h5 className="font-bold text-xs text-slate-900 line-clamp-1 leading-snug">
                    {seo.ogTitle || seo.title || `${tenant.name} — Site Oficial`}
                  </h5>
                  <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                    {seo.ogDescription || seo.description || tenant.appearance?.tagline || `Conheça ${tenant.name}. Atendimento de excelência, qualidade e confiança.`}
                  </p>
                  <span className="text-[10px] text-slate-400 block truncate pt-0.5">
                    {tenant.slug ? `.../p/${tenant.slug}` : currentUrl}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              ✓ Ao compartilhar seu link ({`/p/${tenant.slug}`}) no WhatsApp, a logo oficial de <strong className="text-slate-800">{tenant.name}</strong> e a sua descrição serão exibidas automaticamente no balão de mensagem.
            </p>
          </div>

          {/* Schema.org Badge */}
          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-950 text-xs">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold block mb-0.5">Schema.org LocalBusiness Ativado</strong>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                O mini site gera automaticamente dados estruturados em JSON-LD com nome, telefone, endereço e horário para otimização em buscas locais do Google.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
