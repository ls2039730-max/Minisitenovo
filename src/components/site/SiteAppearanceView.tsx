import React from 'react';
import { Palette, Check, Sparkles, LayoutTemplate, Type, Square, Sliders } from 'lucide-react';
import { SiteData, SiteAppearance, SiteTemplateId } from '../../types/site';
import { SITE_TEMPLATES } from '../../constants/templates';

interface SiteAppearanceViewProps {
  site: SiteData;
  onUpdateAppearance: (newAppearance: Partial<SiteAppearance>, newTemplateId?: SiteTemplateId) => void;
  onOpenTemplatesLibrary?: () => void;
}

export const SiteAppearanceView: React.FC<SiteAppearanceViewProps> = ({
  site,
  onUpdateAppearance,
  onOpenTemplatesLibrary,
}) => {
  const currentApp = site.appearance;

  const handleTemplateSwitch = (tId: SiteTemplateId) => {
    const tDef = SITE_TEMPLATES[tId];
    if (!tDef) return;

    // Save current visual appearance into templateVisualPresets
    const currentPresets = site.appearance?.templateVisualPresets || {};
    const updatedPresets = {
      ...currentPresets,
      [site.templateId]: {
        primaryColor: site.appearance?.primaryColor,
        secondaryColor: site.appearance?.secondaryColor,
        accentColor: site.appearance?.accentColor,
        backgroundColor: site.appearance?.backgroundColor,
        textColor: site.appearance?.textColor,
        fontFamily: site.appearance?.fontFamily,
        borderRadius: site.appearance?.borderRadius,
        buttonStyle: site.appearance?.buttonStyle,
        spacing: site.appearance?.spacing,
        savedAt: new Date().toISOString(),
      },
    };

    const previousPreset = updatedPresets[tId];

    // Switching template alters visual preset WITHOUT touching sections or user content
    onUpdateAppearance(
      {
        templateId: tId,
        primaryColor: previousPreset?.primaryColor || site.appearance?.primaryColor,
        secondaryColor: previousPreset?.secondaryColor || site.appearance?.secondaryColor,
        accentColor: previousPreset?.accentColor || site.appearance?.accentColor,
        backgroundColor: previousPreset?.backgroundColor || tDef.defaultAppearance.backgroundColor,
        textColor: previousPreset?.textColor || tDef.defaultAppearance.textColor,
        fontFamily: previousPreset?.fontFamily || tDef.defaultAppearance.fontFamily,
        borderRadius: previousPreset?.borderRadius || tDef.defaultAppearance.borderRadius,
        buttonStyle: previousPreset?.buttonStyle || tDef.defaultAppearance.buttonStyle,
        spacing: previousPreset?.spacing || tDef.defaultAppearance.spacing,
        templateVisualPresets: updatedPresets,
      },
      tId
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 overflow-y-auto">
      {/* Templates Library Promotion Banner */}
      {onOpenTemplatesLibrary && (
        <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-slate-950 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-indigo-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Biblioteca de Modelos Completos
            </span>
            <h3 className="text-base font-extrabold text-white">
              Quer um design completo para o seu segmento?
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Explore templates prontos para Barbearias, Salões, Restaurantes, Clínicas, Oficinas e Lojas com estrutura de blocos e fotos em alta definição.
            </p>
          </div>

          <button
            onClick={onOpenTemplatesLibrary}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm shrink-0 self-start sm:self-auto flex items-center gap-2 cursor-pointer hover:scale-102"
          >
            <LayoutTemplate className="w-4 h-4" />
            <span>Explorar Templates de Sites</span>
          </button>
        </div>
      )}

      {/* Intro */}
      <div className="border-b border-slate-200 pb-5">
        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <Palette className="w-5 h-5 text-indigo-600" />
          Aparência & Template do Mini Site
        </h2>
        <p className="text-xs text-slate-600 mt-1">
          Escolha o template ideal para o seu segmento e personalize cores, tipografia e botões.
          Trocar de template altera o visual sem apagar nenhum conteúdo já configurado!
        </p>
      </div>

      {/* 1. TEMPLATES CARDS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-indigo-600" />
              Templates Visuais Prontos
            </h3>
            <p className="text-xs text-slate-600">Selecione uma composição inicial de estilo.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {(Object.keys(SITE_TEMPLATES) as SiteTemplateId[]).map((tId) => {
            const t = SITE_TEMPLATES[tId];
            const isSelected = site.templateId === tId;

            return (
              <div
                key={tId}
                onClick={() => handleTemplateSwitch(tId)}
                className={`rounded-2xl border-2 transition-all p-3.5 flex flex-col cursor-pointer group bg-white ${
                  isSelected
                    ? 'border-indigo-600 ring-4 ring-indigo-50 shadow-md'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
                }`}
              >
                <div className="relative aspect-video rounded-xl overflow-hidden mb-3 bg-slate-100">
                  <img
                    src={t.previewImage}
                    alt={t.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/70 text-white backdrop-blur-xs">
                    {t.badge}
                  </span>
                  {isSelected && (
                    <div className="absolute inset-0 bg-indigo-600/30 flex items-center justify-center text-white backdrop-blur-xs">
                      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg">
                        <Check className="w-4 h-4" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-slate-900">{t.name}</h4>
                    <p className="text-[11px] text-slate-600 line-clamp-2 mt-1 leading-relaxed">
                      {t.description}
                    </p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-600">
                    <span>Recomendado:</span>
                    <span className="font-semibold text-slate-700">{t.recommendedSegments[0]}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. BRAND COLORS & BACKGROUND */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Palette className="w-4 h-4 text-indigo-600" />
          Cores da Página & da Marca
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
            <label className="block text-xs font-bold text-slate-700">Cor Principal (Botões e Destaques)</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={currentApp.primaryColor}
                onChange={(e) => onUpdateAppearance({ primaryColor: e.target.value })}
                className="w-10 h-10 rounded-xl border border-slate-300 p-0.5 cursor-pointer"
              />
              <input
                type="text"
                value={currentApp.primaryColor}
                onChange={(e) => onUpdateAppearance({ primaryColor: e.target.value })}
                className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold uppercase"
              />
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
            <label className="block text-xs font-bold text-slate-700">Cor de Fundo da Página</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={currentApp.backgroundColor}
                onChange={(e) => onUpdateAppearance({ backgroundColor: e.target.value })}
                className="w-10 h-10 rounded-xl border border-slate-300 p-0.5 cursor-pointer"
              />
              <input
                type="text"
                value={currentApp.backgroundColor}
                onChange={(e) => onUpdateAppearance({ backgroundColor: e.target.value })}
                className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold uppercase"
              />
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
            <label className="block text-xs font-bold text-slate-700">Cor do Texto Principal</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={currentApp.textColor}
                onChange={(e) => onUpdateAppearance({ textColor: e.target.value })}
                className="w-10 h-10 rounded-xl border border-slate-300 p-0.5 cursor-pointer"
              />
              <input
                type="text"
                value={currentApp.textColor}
                onChange={(e) => onUpdateAppearance({ textColor: e.target.value })}
                className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold uppercase"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. TYPOGRAPHY & BUTTON STYLES */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Font Family */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-indigo-600" />
            Tipografia (Fonte)
          </label>
          <select
            value={currentApp.fontFamily}
            onChange={(e) => onUpdateAppearance({ fontFamily: e.target.value })}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
          >
            <option value="Inter">Inter (Moderna & Clara)</option>
            <option value="Roboto">Roboto (Versátil & Elegante)</option>
            <option value="Playfair Display">Playfair Display (Serifada & Premium)</option>
            <option value="Montserrat">Montserrat (Geométrica & Forte)</option>
          </select>
        </div>

        {/* Border Radius */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Square className="w-3.5 h-3.5 text-indigo-600" />
            Arredondamento dos Cantos
          </label>
          <select
            value={currentApp.borderRadius}
            onChange={(e) => onUpdateAppearance({ borderRadius: e.target.value as any })}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
          >
            <option value="none">Reto (Sem curvas)</option>
            <option value="sm">Suave (8px)</option>
            <option value="md">Médio (12px)</option>
            <option value="lg">Arredondado (16px)</option>
            <option value="full">Totalmente Curvo (Pílula)</option>
          </select>
        </div>

        {/* Spacing */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-indigo-600" />
            Espaçamento entre Seções
          </label>
          <select
            value={currentApp.spacing}
            onChange={(e) => onUpdateAppearance({ spacing: e.target.value as any })}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
          >
            <option value="compact">Compacto</option>
            <option value="normal">Normal (Recomendado)</option>
            <option value="spacious">Espaçoso & Arejado</option>
          </select>
        </div>
      </div>
    </div>
  );
};
