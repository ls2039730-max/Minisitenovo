import React, { useState } from 'react';
import { Smartphone, Tablet, Monitor, RefreshCw, ExternalLink, Copy, Check } from 'lucide-react';
import { SiteData } from '../../types/site';
import { Tenant } from '../../types/saas';
import { PublicSiteView } from './public/PublicSiteView';

interface SitePreviewFrameProps {
  tenant: Tenant;
  site: SiteData;
  onOpenNewTab?: () => void;
}

export const SitePreviewFrame: React.FC<SitePreviewFrameProps> = ({
  tenant,
  site,
  onOpenNewTab,
}) => {
  const [device, setDevice] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');
  const [refreshKey, setRefreshKey] = useState(0);
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/p/${tenant.slug}` : `/p/${tenant.slug}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
      {/* Device Toolbar */}
      <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 bg-slate-800/60 p-0.5 rounded-xl border border-slate-700/50">
          <button
            onClick={() => setDevice('mobile')}
            className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              device === 'mobile'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Visualização Mobile (375px)"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mobile</span>
          </button>
          <button
            onClick={() => setDevice('tablet')}
            className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              device === 'tablet'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Visualização Tablet (768px)"
          >
            <Tablet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tablet</span>
          </button>
          <button
            onClick={() => setDevice('desktop')}
            className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              device === 'desktop'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Visualização Desktop"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Desktop</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-400 hidden md:inline truncate max-w-[200px]" title={publicUrl}>
            {publicUrl}
          </span>
          <button
            onClick={handleCopyLink}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
            title="Copiar Link para Compartilhar"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-slate-400" />
                <span>Copiar</span>
              </>
            )}
          </button>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Recarregar Prévia"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {onOpenNewTab && (
            <button
              onClick={onOpenNewTab}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Abrir em Nova Aba"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Screen Frame Container */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-radial from-slate-900 to-slate-950">
        <div
          key={refreshKey}
          className={`transition-all duration-300 origin-top overflow-y-auto bg-white shadow-2xl h-full max-h-[820px] ${
            device === 'mobile'
              ? 'w-[375px] rounded-[36px] border-[10px] border-slate-950 ring-1 ring-slate-800 shadow-slate-950/80 scrollbar-none'
              : device === 'tablet'
              ? 'w-[768px] rounded-[28px] border-[8px] border-slate-950 ring-1 ring-slate-800'
              : 'w-full rounded-2xl border border-slate-800'
          }`}
        >
          {/* Virtual Mobile Notch */}
          {device === 'mobile' && (
            <div className="sticky top-0 z-50 h-5 bg-black flex items-center justify-center">
              <div className="w-24 h-3 bg-slate-900 rounded-full" />
            </div>
          )}

          <PublicSiteView
            tenant={tenant}
            site={site}
            isPublished={true}
            isDraftPreview={false}
          />
        </div>
      </div>
    </div>
  );
};
