import React, { useState } from 'react';
import {
  X,
  Monitor,
  Smartphone,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import { ProfessionalTemplate, generateTemplatePreviewSite } from '../../../constants/professionalTemplates';
import { Tenant } from '../../../types/saas';
import { SiteData } from '../../../types/site';
import { PublicSiteView } from '../public/PublicSiteView';

interface TemplatePreviewModalProps {
  template: ProfessionalTemplate | null;
  tenant: Tenant;
  currentSite: SiteData | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectForApplication: (template: ProfessionalTemplate) => void;
}

export const TemplatePreviewModal: React.FC<TemplatePreviewModalProps> = ({
  template,
  tenant,
  currentSite,
  isOpen,
  onClose,
  onSelectForApplication,
}) => {
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'mobile'>('desktop');

  if (!isOpen || !template) return null;

  // Generate an in-memory, completely safe preview of the site
  const previewSite = generateTemplatePreviewSite(template, tenant, currentSite);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
      {/* Top Header Controls Bar */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4 text-white shrink-0">
        {/* Left Info: Back and Template Name */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold shrink-0 border border-slate-700/80 shadow-xs"
            title="Voltar à Biblioteca de Templates"
          >
            <ArrowLeft className="w-4 h-4 text-indigo-400" />
            <span className="inline sm:hidden">Voltar</span>
            <span className="hidden sm:inline">Voltar à Biblioteca</span>
          </button>

          <div className="h-6 w-px bg-slate-800 hidden sm:block" />

          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">{template.categoryLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{template.styleName}</span>
            </div>
            <h3 className="font-bold text-sm text-white truncate max-w-xs sm:max-w-md">
              {template.name}
            </h3>
          </div>
        </div>

        {/* Center: Device Switcher (Desktop vs Mobile) */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner">
          <button
            onClick={() => setDeviceMode('desktop')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              deviceMode === 'desktop'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Visualização em Computador"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Computador</span>
          </button>

          <button
            onClick={() => setDeviceMode('mobile')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              deviceMode === 'mobile'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Visualização em Celular"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Celular</span>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden lg:flex items-center gap-1 text-[11px] text-emerald-400 font-medium bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-1 rounded-lg">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Prévia segura (sem alterar o site real)</span>
          </div>

          <button
            onClick={() => onSelectForApplication(template)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer hover:scale-102"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Aplicar este Template</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            aria-label="Fechar pré-visualização"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Preview Canvas Area */}
      <div className="flex-1 overflow-auto bg-slate-950/95 flex flex-col items-center justify-start p-2 sm:p-6 min-h-0">
        {deviceMode === 'desktop' ? (
          /* Desktop Viewport Container */
          <div className="w-full max-w-6xl bg-white shadow-2xl rounded-2xl overflow-hidden border border-slate-800 flex flex-col my-auto min-h-[80vh]">
            <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center gap-2 text-slate-400 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
              </div>
              <div className="bg-slate-950 text-slate-400 px-3 py-1 rounded-lg text-[11px] font-mono flex-1 text-center max-w-md mx-auto truncate">
                https://{tenant.subdomain} (Modo Pré-visualização do Template)
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <PublicSiteView
                tenant={tenant}
                site={previewSite}
                isPublished={false}
                isDraftPreview={false}
              />
            </div>
          </div>
        ) : (
          /* Mobile Phone Frame Container (375px) */
          <div className="my-auto py-4">
            <div className="w-[375px] max-w-full h-[760px] max-h-[85vh] bg-slate-900 rounded-[44px] p-3 shadow-2xl border-4 border-slate-800 flex flex-col ring-1 ring-white/10 relative">
              {/* Speaker / Notch Bar */}
              <div className="w-32 h-4 bg-slate-950 rounded-full mx-auto mb-2 shrink-0 flex items-center justify-center">
                <span className="w-10 h-1 bg-slate-800 rounded-full" />
              </div>

              {/* Mobile Screen Content */}
              <div className="flex-1 bg-white rounded-[32px] overflow-hidden overflow-y-auto flex flex-col">
                <PublicSiteView
                  tenant={tenant}
                  site={previewSite}
                  isPublished={false}
                  isDraftPreview={false}
                />
              </div>

              {/* Home indicator bar */}
              <div className="w-24 h-1 bg-slate-700 rounded-full mx-auto mt-2 shrink-0" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
