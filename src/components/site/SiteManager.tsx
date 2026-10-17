import React, { useState, useEffect, useRef } from 'react';
import {
  Edit3,
  Palette,
  Search,
  Settings,
  ExternalLink,
  Save,
  UploadCloud,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Eye,
  Globe,
  ArrowLeft,
  Sparkles,
  LayoutTemplate,
} from 'lucide-react';
import { SiteData, SiteSection, SiteSeo, SiteAppearance, SiteSettings, SiteTemplateId } from '../../types/site';
import { Tenant } from '../../types/saas';
import { api } from '../../services/api';
import { SiteEditorView } from './SiteEditorView';
import { SiteAppearanceView } from './SiteAppearanceView';
import { SiteSeoView } from './SiteSeoView';
import { SiteSettingsView } from './SiteSettingsView';
import { SiteTemplatesLibrary } from './templates/SiteTemplatesLibrary';
import { MotionStudioView } from './motion/MotionStudioView';
import { PublicSiteView } from './public/PublicSiteView';

interface SiteManagerProps {
  tenant: Tenant;
}

export const SiteManager: React.FC<SiteManagerProps> = ({ tenant }) => {
  const [subTab, setSubTab] = useState<'templates' | 'editor' | 'appearance' | 'motion' | 'seo' | 'settings' | 'preview'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const sub = params.get('subTab') as any;
      if (['templates', 'editor', 'appearance', 'motion', 'seo', 'settings', 'preview'].includes(sub)) {
        return sub;
      }
    }
    return 'editor';
  });
  const [site, setSite] = useState<SiteData | null>(null);
  const [templateSuccessToast, setTemplateSuccessToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const debounceTimerRef = useRef<number | null>(null);
  const isInitialLoad = useRef(true);
  const siteRef = useRef<SiteData | null>(null);

  // Keep siteRef in sync with state
  useEffect(() => {
    siteRef.current = site;
  }, [site]);

  // History-aware sub-tab navigation so browser back stays inside the app
  const navigateSubTab = (newSubTab: 'templates' | 'editor' | 'appearance' | 'motion' | 'seo' | 'settings' | 'preview') => {
    if (newSubTab === subTab) return;
    setSubTab(newSubTab);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('tab', 'site');
      if (newSubTab === 'editor') {
        params.delete('subTab');
      } else {
        params.set('subTab', newSubTab);
      }
      params.delete('preview');
      params.delete('section');
      const newUrl = `?${params.toString()}`;
      window.history.pushState({ tab: 'site', subTab: newSubTab }, '', newUrl);
    }
  };

  const handleBackToEditor = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('subTab')) {
        window.history.back();
        return;
      }
    }
    navigateSubTab('editor');
  };

  // Sync sub-tab with browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const sub = (params.get('subTab') || 'editor') as any;
      if (['templates', 'editor', 'appearance', 'motion', 'seo', 'settings', 'preview'].includes(sub)) {
        setSubTab(sub);
      } else {
        setSubTab('editor');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Load site draft & configuration from API
  const loadSiteData = async () => {
    try {
      setLoading(true);
      const data = await api.getSite();
      setSite(data);
    } catch (err: any) {
      console.error('Error loading site data:', err);
      setErrorMessage(err.message || 'Falha ao carregar informações do mini site.');
    } finally {
      setLoading(false);
      setTimeout(() => {
        isInitialLoad.current = false;
      }, 500);
    }
  };

  useEffect(() => {
    loadSiteData();
  }, [tenant.id]);

  // Debounced Autosave of Draft
  const triggerAutosave = (updatedSite: SiteData, immediate = false) => {
    if (isInitialLoad.current && !immediate) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setAutosaveStatus('saving');

    const executeSave = async () => {
      try {
        const saved = await api.saveSiteDraft({
          templateId: updatedSite.templateId,
          sections: updatedSite.sections,
          seo: updatedSite.seo,
          appearance: updatedSite.appearance,
          settings: updatedSite.settings,
        });

        setSite((prev) => (prev ? { ...prev, updatedAt: saved.updatedAt, hasUnpublishedChanges: true } : saved));
        setAutosaveStatus('saved');

        setTimeout(() => {
          setAutosaveStatus((current) => (current === 'saved' ? 'idle' : current));
        }, 2500);
      } catch (err) {
        console.error('Error in autosave:', err);
        setAutosaveStatus('error');
      }
    };

    if (immediate) {
      executeSave();
    } else {
      debounceTimerRef.current = window.setTimeout(executeSave, 800);
    }
  };

  // State update from child views
  const handleUpdateSite = (updated: SiteData, immediate = false) => {
    setSite(updated);
    triggerAutosave(updated, immediate);
  };

  // Save draft explicitly
  const handleManualSave = async () => {
    if (!site) return;
    try {
      setAutosaveStatus('saving');
      const saved = await api.saveSiteDraft({
        templateId: site.templateId,
        sections: site.sections,
        seo: site.seo,
        appearance: site.appearance,
        settings: site.settings,
      });
      setSite((prev) => (prev ? { ...prev, ...saved, hasUnpublishedChanges: true } : saved));
      setAutosaveStatus('saved');
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao salvar rascunho.');
      setAutosaveStatus('error');
    }
  };

  // Publish Site to the world
  const handlePublish = async () => {
    const currentSite = siteRef.current || site;
    if (!currentSite) return;
    try {
      setPublishing(true);
      setErrorMessage(null);

      // 1. Cancel any pending debounce timer and save draft immediately
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      await api.saveSiteDraft({
        templateId: currentSite.templateId,
        sections: currentSite.sections,
        seo: currentSite.seo,
        appearance: currentSite.appearance,
        settings: currentSite.settings,
      });

      // 2. Publish site
      const published = await api.publishSite();

      // Ensure that if server returned empty sections due to latency or race condition,
      // we retain the active sections that were just published
      const finalPublished: SiteData = {
        ...published,
        sections: (published.sections && published.sections.length > 0)
          ? published.sections
          : currentSite.sections,
        appearance: published.appearance || currentSite.appearance,
        hasUnpublishedChanges: false,
      };

      setSite(finalPublished);
      setPublishSuccess(true);
      setTimeout(() => {
        setPublishSuccess(false);
      }, 3500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao publicar site.');
    } finally {
      setPublishing(false);
    }
  };

  const handleOpenPublicTab = () => {
    window.open(`/p/${tenant.slug}`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
        <p className="text-xs font-semibold">Carregando editor do mini site...</p>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="p-8 text-center text-slate-600 space-y-3">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <h3 className="font-bold text-base">Não foi possível carregar o mini site.</h3>
        <p className="text-xs">{errorMessage || 'Verifique sua conexão ou contate o suporte.'}</p>
        <button
          onClick={loadSiteData}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-100/60 overflow-hidden">
      {/* TOP CONTROLS & SUB-NAV BAR */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-xs">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto text-xs font-bold pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => navigateSubTab('templates')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              subTab === 'templates'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            Templates de Sites
          </button>

          <button
            onClick={() => navigateSubTab('editor')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              subTab === 'editor'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            Editor
          </button>

          <button
            onClick={() => navigateSubTab('appearance')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              subTab === 'appearance'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            Aparência
          </button>

          <button
            onClick={() => navigateSubTab('motion')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              subTab === 'motion'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Motion Studio
          </button>

          <button
            onClick={() => navigateSubTab('seo')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              subTab === 'seo'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            SEO
          </button>

          <button
            onClick={() => navigateSubTab('settings')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              subTab === 'settings'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Configurações
          </button>

          <button
            onClick={() => navigateSubTab('preview')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              subTab === 'preview'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Visualizar Site
          </button>
        </div>

        {/* Status Indicators & Action Buttons */}
        <div className="flex items-center gap-2.5 text-xs ml-auto">
          {/* Autosave status indicator */}
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mr-1">
            {autosaveStatus === 'saving' && (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                <span>Salvando...</span>
              </>
            )}
            {autosaveStatus === 'saved' && (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span className="text-emerald-700 font-semibold">Salvo no rascunho</span>
              </>
            )}
            {autosaveStatus === 'error' && (
              <>
                <AlertCircle className="w-3 h-3 text-rose-600" />
                <span className="text-rose-600 font-semibold">Erro ao salvar</span>
              </>
            )}
          </div>

          {/* Unpublished Changes Warning Pill */}
          {site.hasUnpublishedChanges ? (
            <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Alterações não publicadas
            </span>
          ) : (
            <span className="hidden sm:inline-flex px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold items-center gap-1 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Site publicado e atualizado
            </span>
          )}

          {/* Manual Save Draft Button */}
          <button
            onClick={handleManualSave}
            disabled={autosaveStatus === 'saving'}
            className="hidden sm:flex px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs items-center gap-1 transition-colors cursor-pointer"
            title="Salvar alterações no rascunho"
          >
            <Save className="w-3.5 h-3.5" />
            Salvar
          </button>

          {/* Publish Changes Button */}
          <button
            onClick={handlePublish}
            disabled={publishing}
            className={`px-4 py-1.5 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer ${
              publishSuccess
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:scale-102'
            }`}
          >
            {publishing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Publicando...
              </>
            ) : publishSuccess ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Publicado com Sucesso!
              </>
            ) : (
              <>
                <UploadCloud className="w-3.5 h-3.5" />
                Publicar alterações
              </>
            )}
          </button>

          {/* Open Public Site in new tab */}
          <button
            onClick={handleOpenPublicTab}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="Abrir site público em nova aba"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Toast Notification when Template is applied */}
      {templateSuccessToast && (
        <div className="bg-indigo-600 text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between shadow-md shrink-0 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{templateSuccessToast}</span>
          </div>
          <button
            onClick={() => setTemplateSuccessToast(null)}
            className="p-1 hover:bg-white/20 rounded-md transition-colors text-white/80 hover:text-white font-bold text-base leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* SUB-VIEW CONTENT CONTAINER */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {subTab === 'templates' && (
          <SiteTemplatesLibrary
            tenant={tenant}
            site={site}
            onApplyTemplate={(newSections, newAppearance, newTemplateId) => {
              // 1. Save current template's visual appearance into templateVisualPresets
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

              // 2. Restore previous custom visual tweaks for the new template if available
              const previousPreset = updatedPresets[newTemplateId];
              const mergedAppearance: SiteAppearance = {
                ...site.appearance,
                ...newAppearance,
                ...(previousPreset ? {
                  primaryColor: previousPreset.primaryColor || newAppearance.primaryColor || site.appearance.primaryColor,
                  secondaryColor: previousPreset.secondaryColor || newAppearance.secondaryColor || site.appearance.secondaryColor,
                  accentColor: previousPreset.accentColor || newAppearance.accentColor || site.appearance.accentColor,
                  backgroundColor: previousPreset.backgroundColor || newAppearance.backgroundColor || site.appearance.backgroundColor,
                  textColor: previousPreset.textColor || newAppearance.textColor || site.appearance.textColor,
                  fontFamily: previousPreset.fontFamily || newAppearance.fontFamily || site.appearance.fontFamily,
                  borderRadius: previousPreset.borderRadius || newAppearance.borderRadius || site.appearance.borderRadius,
                  buttonStyle: previousPreset.buttonStyle || newAppearance.buttonStyle || site.appearance.buttonStyle,
                  spacing: previousPreset.spacing || newAppearance.spacing || site.appearance.spacing,
                } : {}),
                templateId: newTemplateId,
                templateVisualPresets: updatedPresets,
              };

              const updated: SiteData = {
                ...site,
                templateId: newTemplateId,
                appearance: mergedAppearance,
                sections: newSections,
                hasUnpublishedChanges: true,
              };
              handleUpdateSite(updated, true);
              navigateSubTab('editor');
              setTemplateSuccessToast('Template aplicado com sucesso ao seu rascunho! Revise os blocos e publique quando estiver satisfeito.');
              setTimeout(() => setTemplateSuccessToast(null), 6000);
            }}
            onBackToEditor={handleBackToEditor}
          />
        )}

        {subTab === 'editor' && (
          <SiteEditorView
            tenant={tenant}
            site={site}
            onUpdateSite={handleUpdateSite}
            autosaveStatus={autosaveStatus}
            setAutosaveStatus={setAutosaveStatus}
            onOpenPublicSite={handleOpenPublicTab}
            onOpenTemplates={() => navigateSubTab('templates')}
          />
        )}

        {subTab === 'appearance' && (
          <SiteAppearanceView
            site={site}
            onUpdateAppearance={(newApp, newTemplateId) => {
              const activeTemplateId = newTemplateId || site.templateId;
              const currentPresets = site.appearance?.templateVisualPresets || {};
              const mergedAppearance: SiteAppearance = {
                ...site.appearance,
                ...newApp,
                templateId: activeTemplateId,
              };
              mergedAppearance.templateVisualPresets = {
                ...currentPresets,
                [activeTemplateId]: {
                  primaryColor: mergedAppearance.primaryColor,
                  secondaryColor: mergedAppearance.secondaryColor,
                  accentColor: mergedAppearance.accentColor,
                  backgroundColor: mergedAppearance.backgroundColor,
                  textColor: mergedAppearance.textColor,
                  fontFamily: mergedAppearance.fontFamily,
                  borderRadius: mergedAppearance.borderRadius,
                  buttonStyle: mergedAppearance.buttonStyle,
                  spacing: mergedAppearance.spacing,
                  savedAt: new Date().toISOString(),
                },
              };

              const updated: SiteData = {
                ...site,
                templateId: activeTemplateId,
                appearance: mergedAppearance,
                hasUnpublishedChanges: true,
              };
              handleUpdateSite(updated);
            }}
            onOpenTemplatesLibrary={() => navigateSubTab('templates')}
          />
        )}

        {subTab === 'motion' && (
          <MotionStudioView
            site={site}
            onUpdateAppearance={(newApp) => {
              const updated: SiteData = {
                ...site,
                appearance: {
                  ...site.appearance,
                  ...newApp,
                },
                hasUnpublishedChanges: true,
              };
              handleUpdateSite(updated);
            }}
            onOpenPreview={handleOpenPublicTab}
          />
        )}

        {subTab === 'seo' && (
          <SiteSeoView
            tenant={tenant}
            site={site}
            onUpdateSeo={(newSeo, immediate = false) => {
              const updated = {
                ...site,
                seo: { ...site.seo, ...newSeo },
                hasUnpublishedChanges: true,
              };
              handleUpdateSite(updated, immediate);
            }}
          />
        )}

        {subTab === 'settings' && (
          <SiteSettingsView
            tenant={tenant}
            site={site}
            onUpdateSettings={(newSettings) => {
              const updated = {
                ...site,
                settings: { ...site.settings, ...newSettings },
                hasUnpublishedChanges: true,
              };
              handleUpdateSite(updated);
            }}
          />
        )}

        {subTab === 'preview' && (
          <div className="flex-1 overflow-auto bg-slate-950 flex flex-col items-center">
            <div className="w-full bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between text-xs text-white">
              <span className="font-bold flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-indigo-400" />
                Visualização do Site Publicado
              </span>
              <button
                onClick={handleBackToEditor}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-all shadow-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar ao Editor
              </button>
            </div>
            <div className="w-full flex-1 overflow-y-auto">
              <PublicSiteView
                tenant={tenant}
                site={site}
                isPublished={true}
                isDraftPreview={false}
                onExitPreview={handleBackToEditor}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
