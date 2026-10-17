import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Eye,
  EyeOff,
  Settings as SettingsIcon,
  ChevronUp,
  ChevronDown,
  Trash2,
  GripVertical,
  CheckCircle2,
  Loader2,
  Sparkles,
  Smartphone,
  Edit3,
  Layers,
  ArrowRight,
  LayoutTemplate,
} from 'lucide-react';
import { SiteData, SiteSection, SectionType } from '../../types/site';
import { Tenant } from '../../types/saas';
import { BLOCK_REGISTRY } from '../../constants/blockRegistry';
import { AddSectionModal } from './AddSectionModal';
import { BlockConfigDrawer } from './BlockConfigDrawer';
import { SitePreviewFrame } from './SitePreviewFrame';
import { ConfirmModal } from '../common/ConfirmModal';
import { api } from '../../services/api';
import { generateUUID } from '../../utils/uuid';

interface SiteEditorViewProps {
  tenant: Tenant;
  site: SiteData;
  onUpdateSite: (updated: SiteData) => void;
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  setAutosaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
  onOpenPublicSite: () => void;
  onOpenTemplates?: () => void;
}

export const SiteEditorView: React.FC<SiteEditorViewProps> = ({
  tenant,
  site,
  onUpdateSite,
  autosaveStatus,
  setAutosaveStatus,
  onOpenPublicSite,
  onOpenTemplates,
}) => {
  const [activeConfigSectionId, setActiveConfigSectionId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('section') || null;
    }
    return null;
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(null);

  // Mobile mode toggle: 'editor' | 'preview'
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const activeConfigSection = site.sections.find((s) => s.id === activeConfigSectionId) || null;

  // History-aware section config selection so browser back closes the drawer
  const handleSelectSection = (sectionId: string | null) => {
    setActiveConfigSectionId(sectionId);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (sectionId) {
        params.set('section', sectionId);
        window.history.pushState({ sectionId }, '', `?${params.toString()}`);
      } else if (params.has('section')) {
        params.delete('section');
        window.history.back();
      }
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const secParam = params.get('section');
      setActiveConfigSectionId(secParam || null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Reorder sections
  const moveSection = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= site.sections.length) return;

    const newSections = [...site.sections];
    const [moved] = newSections.splice(index, 1);
    newSections.splice(targetIndex, 0, moved);

    // Re-index position property
    const reindexed = newSections.map((sec, idx) => ({ ...sec, position: idx }));
    onUpdateSite({ ...site, sections: reindexed, hasUnpublishedChanges: true });
  };

  // Toggle visibility
  const toggleVisibility = (sectionId: string) => {
    const newSections = site.sections.map((s) =>
      s.id === sectionId ? { ...s, isEnabled: !s.isEnabled } : s
    );
    onUpdateSite({ ...site, sections: newSections, hasUnpublishedChanges: true });
  };

  // Delete section
  const handleDeleteConfirm = () => {
    if (!deletingSectionId) return;
    const newSections = site.sections
      .filter((s) => s.id !== deletingSectionId)
      .map((s, idx) => ({ ...s, position: idx }));

    if (activeConfigSectionId === deletingSectionId) {
      setActiveConfigSectionId(null);
    }

    onUpdateSite({ ...site, sections: newSections, hasUnpublishedChanges: true });
    setDeletingSectionId(null);
  };

  // Add new section from registry
  const handleAddSection = (type: SectionType) => {
    const def = BLOCK_REGISTRY[type];
    if (!def) return;

    const newSection: SiteSection = {
      id: generateUUID(),
      siteId: site.id,
      tenantId: tenant.id,
      type,
      position: site.sections.length,
      isEnabled: true,
      settings: def.defaultSettings(tenant),
    };

    const newSections = [...site.sections, newSection];
    onUpdateSite({ ...site, sections: newSections, hasUnpublishedChanges: true });
    setActiveConfigSectionId(newSection.id);
  };

  // Update settings of a section
  const handleUpdateSectionSettings = (newSettings: Record<string, any>) => {
    if (!activeConfigSectionId) return;
    const newSections = site.sections.map((s) =>
      s.id === activeConfigSectionId ? { ...s, settings: newSettings } : s
    );
    onUpdateSite({ ...site, sections: newSections, hasUnpublishedChanges: true });
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newSections = [...site.sections];
    const [dragged] = newSections.splice(draggedIndex, 1);
    newSections.splice(index, 0, dragged);

    const reindexed = newSections.map((sec, idx) => ({ ...sec, position: idx }));
    onUpdateSite({ ...site, sections: reindexed, hasUnpublishedChanges: true });
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Mobile Switcher (Visible on small screens) */}
      <div className="lg:hidden p-3 bg-white border-b border-slate-200 flex items-center justify-center">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
          <button
            onClick={() => setMobileTab('editor')}
            className={`px-4 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              mobileTab === 'editor' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            Editar Blocos
          </button>
          <button
            onClick={() => setMobileTab('preview')}
            className={`px-4 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              mobileTab === 'preview' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Visualizar
          </button>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 md:p-6 min-h-0 overflow-hidden">
        {/* LEFT COLUMN: BLOCK LIST OR BLOCK CONFIG (Col 5) */}
        <div
          className={`lg:col-span-5 flex flex-col h-full min-h-0 ${
            mobileTab === 'preview' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {activeConfigSection ? (
            <BlockConfigDrawer
              section={activeConfigSection}
              onClose={() => handleSelectSection(null)}
              onUpdateSettings={handleUpdateSectionSettings}
              onDeleteSection={(id) => setDeletingSectionId(id)}
            />
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    Seções do Mini Site
                  </h3>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Arraste ou use as setas para reordenar os blocos da sua página.
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  {onOpenTemplates && (
                    <button
                      onClick={onOpenTemplates}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Explorar Templates Prontos"
                    >
                      <LayoutTemplate className="w-3.5 h-3.5 text-indigo-600" />
                      <span className="hidden sm:inline">Templates</span>
                    </button>
                  )}

                  <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar
                  </button>
                </div>
              </div>

              {/* Sections List */}
              <div className="p-3 overflow-y-auto space-y-2 flex-1">
                {site.sections.map((section, idx) => {
                  const def = BLOCK_REGISTRY[section.type];

                  return (
                    <div
                      key={section.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      className={`p-3 rounded-2xl border transition-all flex items-center gap-2.5 bg-white group select-none ${
                        draggedIndex === idx
                          ? 'border-indigo-400 bg-indigo-50/50 shadow-md scale-102'
                          : 'border-slate-200 hover:border-slate-300 shadow-xs'
                      } ${!section.isEnabled ? 'opacity-60 bg-slate-50' : ''}`}
                    >
                      {/* Drag Handle */}
                      <div className="cursor-grab text-slate-400 hover:text-slate-600">
                        <GripVertical className="w-4 h-4" />
                      </div>

                      {/* Block Info */}
                      <div
                        onClick={() => setActiveConfigSectionId(section.id)}
                        className="flex-1 min-w-0 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {def?.name || section.type}
                          </span>
                          {!section.isEnabled && (
                            <span className="text-[10px] font-semibold text-slate-500">
                              (Oculto)
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 truncate mt-0.5">
                          {def?.description || ''}
                        </p>
                      </div>

                      {/* Actions: Move Up/Down, Visibility, Configure */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveSection(idx, 'up')}
                          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          title="Mover para cima"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === site.sections.length - 1}
                          onClick={() => moveSection(idx, 'down')}
                          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          title="Mover para baixo"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleVisibility(section.id)}
                          className={`p-1 rounded-md transition-colors cursor-pointer ${
                            section.isEnabled
                              ? 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                              : 'text-amber-500 hover:bg-amber-50'
                          }`}
                          title={section.isEnabled ? 'Ocultar na página' : 'Mostrar na página'}
                        >
                          {section.isEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectSection(section.id)}
                          className="p-1.5 bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 rounded-lg transition-colors cursor-pointer text-xs font-semibold flex items-center gap-1"
                        >
                          <SettingsIcon className="w-3.5 h-3.5" />
                        </button>

                          <button
                            type="button"
                            onClick={() => setDeletingSectionId(section.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                            title="Excluir Seção"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                      </div>
                    </div>
                  );
                })}

                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="w-full py-3 border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/20 text-slate-600 hover:text-indigo-600 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer mt-3"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Nova Seção
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: RESPONSIVE LIVE PREVIEW (Col 7) */}
        <div
          className={`lg:col-span-7 flex flex-col h-full min-h-0 ${
            mobileTab === 'editor' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <SitePreviewFrame
            tenant={tenant}
            site={site}
            onOpenNewTab={onOpenPublicSite}
          />
        </div>
      </div>

      {/* Add Section Modal */}
      <AddSectionModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddSection={handleAddSection}
        existingSectionTypes={site.sections.map((s) => s.type)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingSectionId}
        title="Excluir Seção"
        message="Tem certeza que deseja remover esta seção do seu mini site? O conteúdo configurado nesta seção será excluído do rascunho."
        confirmText="Sim, excluir seção"
        cancelText="Cancelar"
        isDestructive={true}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeletingSectionId(null)}
      />
    </div>
  );
};
