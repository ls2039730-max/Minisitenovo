import React, { useState, useEffect } from 'react';
import {
  LayoutTemplate,
  Sparkles,
  Eye,
  Check,
  CheckCircle2,
  ShieldCheck,
  Filter,
  ArrowRight,
  ArrowLeft,
  Scissors,
  Utensils,
  Stethoscope,
  Car,
  ShoppingBag,
  LayoutGrid,
  Info,
  Glasses,
} from 'lucide-react';
import {
  PROFESSIONAL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  ProfessionalTemplate,
} from '../../../constants/professionalTemplates';
import { Tenant } from '../../../types/saas';
import { SiteData, SiteSection, SiteAppearance, SiteTemplateId } from '../../../types/site';
import { TemplatePreviewModal } from './TemplatePreviewModal';
import { TemplateApplyConfirmModal } from './TemplateApplyConfirmModal';

interface SiteTemplatesLibraryProps {
  tenant: Tenant;
  site: SiteData;
  onApplyTemplate: (
    newSections: SiteSection[],
    newAppearance: Partial<SiteAppearance>,
    newTemplateId: SiteTemplateId
  ) => void;
  onBackToEditor?: () => void;
}

// Icon mapper for categories
function getCategoryIcon(iconName: string) {
  switch (iconName) {
    case 'Glasses':
      return Glasses;
    case 'Scissors':
      return Scissors;
    case 'Sparkles':
      return Sparkles;
    case 'Utensils':
      return Utensils;
    case 'Stethoscope':
      return Stethoscope;
    case 'Car':
      return Car;
    case 'ShoppingBag':
      return ShoppingBag;
    case 'LayoutGrid':
    default:
      return LayoutGrid;
  }
}

export const SiteTemplatesLibrary: React.FC<SiteTemplatesLibraryProps> = ({
  tenant,
  site,
  onApplyTemplate,
  onBackToEditor,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('todas');
  const [previewingTemplate, setPreviewingTemplate] = useState<ProfessionalTemplate | null>(null);
  const [confirmingTemplate, setConfirmingTemplate] = useState<ProfessionalTemplate | null>(null);

  // Filter templates
  const filteredTemplates =
    selectedCategory === 'todas'
      ? PROFESSIONAL_TEMPLATES
      : PROFESSIONAL_TEMPLATES.filter((t) => t.category === selectedCategory);

  const activeCategoryObj = TEMPLATE_CATEGORIES.find((c) => c.id === selectedCategory);

  const handleOpenPreview = (template: ProfessionalTemplate) => {
    setPreviewingTemplate(template);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('preview', template.id);
      window.history.pushState({ modal: 'preview', templateId: template.id }, '', `?${params.toString()}`);
    }
  };

  const handleClosePreview = () => {
    setPreviewingTemplate(null);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('preview')) {
        window.history.back();
      }
    }
  };

  // Sync template preview modal with browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const previewId = params.get('preview');
      if (!previewId) {
        setPreviewingTemplate(null);
      } else {
        const found = PROFESSIONAL_TEMPLATES.find((t) => t.id === previewId);
        if (found) setPreviewingTemplate(found);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handlePromptApply = (template: ProfessionalTemplate) => {
    setPreviewingTemplate(null);
    setConfirmingTemplate(template);
  };

  const handleCloseConfirm = () => {
    setConfirmingTemplate(null);
  };

  const handleExecuteApply = (template: ProfessionalTemplate) => {
    const newSections = template.buildSections(tenant, site.sections);
    const newAppearance = template.defaultAppearance;
    const baseId = template.baseTemplateId;

    onApplyTemplate(newSections, newAppearance, baseId);
    setConfirmingTemplate(null);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Voltar ao Editor button */}
      {onBackToEditor && (
        <div className="max-w-6xl mx-auto -mb-2">
          <button
            type="button"
            onClick={onBackToEditor}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl border border-slate-200 shadow-2xs transition-all cursor-pointer group"
            title="Voltar ao Editor do Site"
          >
            <ArrowLeft className="w-4 h-4 text-indigo-600 group-hover:-translate-x-0.5 transition-transform" />
            <span>Voltar ao Editor</span>
          </button>
        </div>
      )}

      {/* Intro Header */}
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
              Galeria Profissional
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="text-xs text-slate-500">
              {PROFESSIONAL_TEMPLATES.length} modelos desenhados para conversão
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <LayoutTemplate className="w-6 h-6 text-indigo-600" />
            Templates de Sites
          </h1>

          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Escolha um modelo arquitetado especialmente para o segmento do seu negócio. Visualize em computador e celular antes de aplicar, e personalize tudo pelo editor sem perder seus dados cadastrais.
          </p>
        </div>

        {/* Safe notice pill-free info box */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs flex items-center gap-3 shrink-0 self-start md:self-auto max-w-sm">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="text-[11px] leading-snug">
            <span className="font-bold text-slate-800 block">Prévia 100% Segura</span>
            <span className="text-slate-500">
              Testar e visualizar templates não altera seu site publicado.
            </span>
          </div>
        </div>
      </div>

      {/* Categories Filter Tabs (Segmented Control) */}
      <div className="max-w-6xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-indigo-600" />
            Filtrar por Segmento de Negócio
          </span>
          <span className="text-[11px] text-slate-500">
            Exibindo {filteredTemplates.length} de {PROFESSIONAL_TEMPLATES.length} modelos
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
          {TEMPLATE_CATEGORIES.map((cat) => {
            const Icon = getCategoryIcon(cat.iconName);
            const isSelected = selectedCategory === cat.id;
            const count =
              cat.id === 'todas'
                ? PROFESSIONAL_TEMPLATES.length
                : PROFESSIONAL_TEMPLATES.filter((t) => t.category === cat.id).length;

            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer border ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-slate-200'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{cat.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Category Subtitle */}
        {activeCategoryObj && (
          <p className="text-xs text-slate-500 pl-1">
            {activeCategoryObj.description}
          </p>
        )}
      </div>

      {/* Templates Cards Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((template) => {
          return (
            <div
              key={template.id}
              className="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col group"
            >
              {/* Card Image Banner */}
              <div className="relative aspect-[16/10] overflow-hidden bg-slate-900">
                <img
                  src={template.previewImage}
                  alt={template.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/20" />

                {/* Badge (Featured / Popular) */}
                {template.badge && (
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/90 text-slate-900 backdrop-blur-xs shadow-xs">
                    {template.badge}
                  </span>
                )}

                {/* Status indicator */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-xs text-[10px] text-white font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Pronto para Uso</span>
                </div>

                {/* Bottom Overlay Info on Image */}
                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <div className="flex items-center gap-2 text-[11px] text-white/80">
                    <span className="font-semibold">{template.categoryLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{template.styleName}</span>
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <h3 className="text-base font-extrabold text-slate-900 leading-snug group-hover:text-indigo-600 transition-colors">
                    {template.name}
                  </h3>

                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                    {template.description}
                  </p>
                </div>

                {/* Highlights List */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Recursos Inclusos:
                  </span>
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-slate-600">
                    {template.highlights.slice(0, 3).map((hl, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span>{hl}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenPreview(template)}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-600" />
                    <span>Pré-visualizar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePromptApply(template)}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Aplicar</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal 1: Realistic In-Memory Desktop/Mobile Preview */}
      <TemplatePreviewModal
        template={previewingTemplate}
        tenant={tenant}
        currentSite={site}
        isOpen={!!previewingTemplate}
        onClose={handleClosePreview}
        onSelectForApplication={handlePromptApply}
      />

      {/* Modal 2: Confirmation Before Applying to Draft */}
      <TemplateApplyConfirmModal
        template={confirmingTemplate}
        tenant={tenant}
        isOpen={!!confirmingTemplate}
        onClose={handleCloseConfirm}
        onConfirm={handleExecuteApply}
      />
    </div>
  );
};
