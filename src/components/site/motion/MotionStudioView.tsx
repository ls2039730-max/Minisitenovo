import React, { useState } from 'react';
import {
  Sparkles,
  Zap,
  Play,
  RotateCcw,
  Check,
  Eye,
  Sliders,
  Layers,
  MousePointer,
  Film,
  Compass,
  Smartphone,
  ShieldCheck,
  ChevronRight,
  Bookmark,
  Activity,
  Type,
  Layout,
  Gauge,
} from 'lucide-react';
import { SiteData, SiteAppearance } from '../../../types/site';
import {
  MotionStudioSettings,
  MotionPresetId,
  MotionEntranceEffect,
  MotionDirection,
  MotionHoverEffect,
  MotionProductHover,
  MotionButtonFeedback,
  MotionSpeed,
  MotionEasing,
} from '../../../types/motion';
import { MOTION_PRESETS, DEFAULT_MOTION_SETTINGS } from '../../../constants/motionPresets';
import {
  MotionStudioProvider,
  MotionReveal,
  MotionTextReveal,
  MotionImageReveal,
  MotionMarquee,
  MotionButton,
  MotionCard,
} from './MotionAdapter';

interface MotionStudioViewProps {
  site: SiteData;
  onUpdateAppearance: (newAppearance: Partial<SiteAppearance>) => void;
  onOpenPreview?: () => void;
}

export const MotionStudioView: React.FC<MotionStudioViewProps> = ({
  site,
  onUpdateAppearance,
  onOpenPreview,
}) => {
  const currentMotion: MotionStudioSettings =
    site.appearance?.motion || {
      ...DEFAULT_MOTION_SETTINGS,
      presetId: site.templateId === 'otica_editorial' ? 'editorial_premium' : 'conversion',
    };

  const [activeTab, setActiveTab] = useState<'presets' | 'entrance' | 'scroll' | 'interactions' | 'timing'>('presets');
  const [previewKey, setPreviewKey] = useState(0);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  const updateMotion = (updates: Partial<MotionStudioSettings>) => {
    const updated: MotionStudioSettings = {
      ...currentMotion,
      ...updates,
      presetId: updates.presetId || (updates.entrance || updates.scroll || updates.interactions || updates.timing ? 'custom' : currentMotion.presetId),
    };

    onUpdateAppearance({
      motion: updated,
    });

    setPreviewKey((prev) => prev + 1);
  };

  const handleApplyPreset = (presetId: MotionPresetId) => {
    const preset = MOTION_PRESETS[presetId];
    if (!preset) return;

    updateMotion({
      ...preset.settings,
      presetId,
    });

    setSavedToast(`Preset "${preset.name}" aplicado ao seu rascunho com sucesso!`);
    setTimeout(() => setSavedToast(null), 4000);
  };

  const handleResetToDefault = () => {
    updateMotion(DEFAULT_MOTION_SETTINGS);
    setSavedToast('Configurações redefinidas para o padrão editorial.');
    setTimeout(() => setSavedToast(null), 3000);
  };

  const restartPreview = () => {
    setPreviewKey((k) => k + 1);
  };

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8 overflow-y-auto">
      {/* Toast Alert */}
      {savedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-indigo-500/40 animate-in slide-in-from-bottom duration-300">
          <Check className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{savedToast}</span>
        </div>
      )}

      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-indigo-800/30 relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 rounded-full text-[11px] font-black tracking-wider uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              LocalHub Motion Studio v2.0
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Direção de Arte & Interações Vivas
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Transforme seu site em uma experiência memorável. Configure animações de entrada cinematográficas, rolagem com parallax suave, letreiros contínuos e microinterações táteis sem escrever uma única linha de código.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={restartPreview}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="Re-executar animações no simulador"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Re-executar
            </button>

            {onOpenPreview && (
              <button
                onClick={onOpenPreview}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer hover:scale-102"
              >
                <Eye className="w-4 h-4" />
                Visualizar Site Completo
              </button>
            )}
          </div>
        </div>

        {/* Master Switch */}
        <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={currentMotion.enabled}
                onChange={(e) => updateMotion({ enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
            <div>
              <span className="font-bold text-white text-sm">
                {currentMotion.enabled ? 'Motion Studio Ativado' : 'Efeitos Desativados'}
              </span>
              <p className="text-[11px] text-slate-400">
                {currentMotion.enabled
                  ? 'Todos os templates renderizarão os efeitos configurados de forma harmoniosa.'
                  : 'O site utilizará renderização estática tradicional sem animações de transição.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
            <ShieldCheck className="w-4 h-4" />
            <span>Acessibilidade WCAG AA (prefers-reduced-motion ativo)</span>
          </div>
        </div>
      </div>

      {/* LIVE SIMULATOR / INTERACTIVE PREVIEW */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
              Simulador em Tempo Real
            </span>
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md text-[10px] font-bold">
              Preset Ativo: {MOTION_PRESETS[currentMotion.presetId || 'editorial_premium']?.name || 'Personalizado'}
            </span>
          </div>

          <button
            onClick={restartPreview}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            Testar Novamente
          </button>
        </div>

        {/* Sandbox Content Container */}
        <div
          key={previewKey}
          className="relative rounded-2xl overflow-x-hidden bg-slate-950 text-white p-4 sm:p-6 md:p-8 space-y-6 border border-slate-800"
        >
          <MotionStudioProvider settings={currentMotion}>
            {/* Simulation Marquee */}
            {currentMotion.scroll.continuousMarquee && (
              <MotionMarquee
                text={currentMotion.scroll.marqueeText}
                speed={currentMotion.scroll.marqueeSpeed}
                bgColor="#1e1b4b"
                textColor="#a5b4fc"
              />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center pt-2">
              <div className="space-y-4">
                <MotionReveal direction="up" delay={0.05}>
                  <span className="text-[11px] font-bold tracking-widest text-indigo-400 uppercase">
                    • Pré-visualização de Movimento
                  </span>
                </MotionReveal>

                <MotionTextReveal delay={0.1}>
                  <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                    Experiência Imersiva de Alto Nível
                  </h3>
                </MotionTextReveal>

                <MotionReveal direction="up" delay={0.2}>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Observe o comportamento da entrada suave, o ritmo da curva de aceleração e teste passar o cursor sobre os cards e botões abaixo.
                  </p>
                </MotionReveal>

                <MotionReveal direction="up" delay={0.3}>
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <MotionButton className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs cursor-pointer shadow-lg shadow-indigo-500/20">
                      Botão Interativo (Toque aqui)
                    </MotionButton>

                    <MotionButton className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs cursor-pointer">
                      Ação Secundária
                    </MotionButton>
                  </div>
                </MotionReveal>
              </div>

              {/* Sample Interactive Image Card */}
              <MotionReveal direction="left" delay={0.2}>
                <MotionCard className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 p-3 shadow-2xl">
                  <MotionImageReveal
                    src="https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=800&q=80"
                    alt="Óculos Editorial"
                    aspectRatioClass="aspect-[16/10]"
                  />
                  <div className="p-3 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">Armação Titanium Avant-Garde</span>
                      <span className="font-black text-amber-400">R$ 890,00</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Passe o cursor para sentir a resposta háptica e o zoom dinâmico.
                    </p>
                  </div>
                </MotionCard>
              </MotionReveal>
            </div>
          </MotionStudioProvider>
        </div>
      </div>

      {/* NAVIGATION SUB-TABS */}
      <div className="border-b border-slate-200 pb-3">
        {/* Mobile Dropdown for small screens (< 640px) */}
        <div className="sm:hidden">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as any)}
            className="w-full px-3.5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-xs cursor-pointer focus:outline-none shadow-sm"
          >
            <option value="presets">Biblioteca de Presets (8)</option>
            <option value="entrance">Animações de Entrada</option>
            <option value="scroll">Rolagem & Parallax</option>
            <option value="interactions">Interações & Micro-efeitos</option>
            <option value="timing">Curvas & Desempenho</option>
          </select>
        </div>

        {/* Desktop / Tablet Horizontal Scrollable Pills (>= 640px) */}
        <div className="hidden sm:flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1 text-xs font-bold">
          <button
            onClick={() => setActiveTab('presets')}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'presets'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            Biblioteca de Presets (8)
          </button>

          <button
            onClick={() => setActiveTab('entrance')}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'entrance'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-4 h-4" />
            Animações de Entrada
          </button>

          <button
            onClick={() => setActiveTab('scroll')}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'scroll'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Compass className="w-4 h-4" />
            Rolagem & Parallax
          </button>

          <button
            onClick={() => setActiveTab('interactions')}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'interactions'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <MousePointer className="w-4 h-4" />
            Interações & Micro-efeitos
          </button>

          <button
            onClick={() => setActiveTab('timing')}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'timing'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Gauge className="w-4 h-4" />
            Curvas & Desempenho
          </button>
        </div>
      </div>

      {/* TAB 1: PRESETS GALLERY */}
      {activeTab === 'presets' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Escolha um Preset de Movimento Profissional
              </h3>
              <p className="text-xs text-slate-500">
                Cada preset equilibra harmoniosamente velocidades, revelações e respostas ao toque de acordo com a psicologia de cada segmento.
              </p>
            </div>
            <button
              onClick={handleResetToDefault}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-bold rounded-xl border border-slate-200 transition-all cursor-pointer"
            >
              Restaurar Padrão
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {Object.values(MOTION_PRESETS).map((preset) => {
              const isSelected = currentMotion.presetId === preset.id;

              return (
                <div
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset.id)}
                  className={`rounded-2xl p-4 sm:p-5 border-2 transition-all cursor-pointer flex flex-col justify-between space-y-3 sm:space-y-4 group hover:shadow-md ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        {preset.badge}
                      </span>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-black text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {preset.name}
                    </h4>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {preset.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 block mb-1">
                      Ideal para:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {preset.recommendedSegments.slice(0, 2).map((seg, idx) => (
                        <span
                          key={idx}
                          className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium"
                        >
                          {seg}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: ENTRANCE ANIMATIONS */}
      {activeTab === 'entrance' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              Animações de Entrada (Ao Carregar ou Rolar)
            </h3>
            <p className="text-xs text-slate-500">
              Controle como os blocos, títulos e imagens aparecem na tela do visitante.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Effect Choice */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Efeito Principal de Entrada
              </label>
              <select
                value={currentMotion.entrance.effect}
                onChange={(e) =>
                  updateMotion({
                    entrance: {
                      ...currentMotion.entrance,
                      effect: e.target.value as MotionEntranceEffect,
                    },
                  })
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-indigo-500 cursor-pointer"
              >
                <option value="mask_reveal">Revelação por Máscara (Editorial & Luxo)</option>
                <option value="fade">Fade Suave (Desvanecimento)</option>
                <option value="slide_up">Deslocamento Vertical (Slide Up)</option>
                <option value="slide_down">Deslocamento Superior (Slide Down)</option>
                <option value="stagger">Entrada Escalonada (Stagger)</option>
                <option value="none">Nenhum (Entrada instantânea)</option>
              </select>
            </div>

            {/* Direction */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Direção do Movimento
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {(['up', 'down', 'left', 'right', 'none'] as MotionDirection[]).map((dir) => (
                  <button
                    key={dir}
                    onClick={() =>
                      updateMotion({
                        entrance: {
                          ...currentMotion.entrance,
                          direction: dir,
                        },
                      })
                    }
                    className={`py-2 px-2 text-[11px] font-bold rounded-xl border transition-all cursor-pointer ${
                      currentMotion.entrance.direction === dir
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {dir === 'up' && 'Subir ↑'}
                    {dir === 'down' && 'Descer ↓'}
                    {dir === 'left' && 'Esquerda ←'}
                    {dir === 'right' && 'Direita →'}
                    {dir === 'none' && 'Estático'}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="col-span-full space-y-3 pt-2">
              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Revelação Mascarada de Títulos (Word / Mask Reveal)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Oculta títulos em uma máscara suave de baixo para cima ao entrar no viewport.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={currentMotion.entrance.wordReveal}
                  onChange={(e) =>
                    updateMotion({
                      entrance: {
                        ...currentMotion.entrance,
                        wordReveal: e.target.checked,
                      },
                    })
                  }
                  className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Entrada Cinematográfica em Imagens (Smooth Zoom In)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Inicia imagens com leve escala e nitidez gradual, eliminando carregamentos secos.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={currentMotion.entrance.cinematicImages}
                  onChange={(e) =>
                    updateMotion({
                      entrance: {
                        ...currentMotion.entrance,
                        cinematicImages: e.target.checked,
                      },
                    })
                  }
                  className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Entrada Escalonada de Elementos (Stagger Sequence)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Cards de produtos, serviços e avaliações entram em sequência ritmada com atrasos milimétricos.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={currentMotion.entrance.staggerChildren}
                  onChange={(e) =>
                    updateMotion({
                      entrance: {
                        ...currentMotion.entrance,
                        staggerChildren: e.target.checked,
                      },
                    })
                  }
                  className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SCROLL & PARALLAX */}
      {activeTab === 'scroll' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Compass className="w-4 h-4 text-indigo-600" />
              Efeitos de Rolagem, Parallax & Marquee
            </h3>
            <p className="text-xs text-slate-500">
              Configure elementos que respondem dinamicamente ao deslizar da página.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Viewport trigger */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Frequência de Execução
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    updateMotion({
                      scroll: { ...currentMotion.scroll, viewportTrigger: 'once' },
                    })
                  }
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    currentMotion.scroll.viewportTrigger === 'once'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Uma única vez (Recomendado)
                </button>
                <button
                  onClick={() =>
                    updateMotion({
                      scroll: { ...currentMotion.scroll, viewportTrigger: 'always' },
                    })
                  }
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    currentMotion.scroll.viewportTrigger === 'always'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Sempre ao entrar na tela
                </button>
              </div>
            </div>

            {/* Parallax intensity */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Intensidade de Parallax nas Imagens de Fundo
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['none', 'subtle', 'medium', 'high'] as const).map((intensity) => (
                  <button
                    key={intensity}
                    onClick={() =>
                      updateMotion({
                        scroll: { ...currentMotion.scroll, parallaxIntensity: intensity },
                      })
                    }
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      currentMotion.scroll.parallaxIntensity === intensity
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    {intensity === 'none' && 'Nenhum'}
                    {intensity === 'subtle' && 'Sutil (10%)'}
                    {intensity === 'medium' && 'Médio (20%)'}
                    {intensity === 'high' && 'Forte (35%)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Continuous Marquee Section */}
            <div className="col-span-full border-t border-slate-100 pt-4 space-y-4">
              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Faixa Tipográfica Contínua (Marquee Infinito)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Exibe um letreiro dinâmico em 60fps com diferenciais do negócio ou chamada promocional.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={currentMotion.scroll.continuousMarquee}
                  onChange={(e) =>
                    updateMotion({
                      scroll: { ...currentMotion.scroll, continuousMarquee: e.target.checked },
                    })
                  }
                  className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                />
              </label>

              {currentMotion.scroll.continuousMarquee && (
                <div className="space-y-4 pl-4 border-l-2 border-indigo-400">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">
                        Texto do Letreiro Contínuo (Acima do Banner)
                      </label>
                      <input
                        type="text"
                        value={currentMotion.scroll.marqueeText || ''}
                        onChange={(e) =>
                          updateMotion({
                            scroll: { ...currentMotion.scroll, marqueeText: e.target.value },
                          })
                        }
                        placeholder="Ex: QUALIDADE GARANTIDA • ATENDIMENTO VIP • DELIVERY EXPRESS"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-indigo-500 font-semibold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">
                        Velocidade da Faixa
                      </label>
                      <select
                        value={currentMotion.scroll.marqueeSpeed}
                        onChange={(e) =>
                          updateMotion({
                            scroll: {
                              ...currentMotion.scroll,
                              marqueeSpeed: e.target.value as any,
                            },
                          })
                        }
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-indigo-500 cursor-pointer"
                      >
                        <option value="slow">Relaxada (Slow - 36s)</option>
                        <option value="normal">Normal (22s)</option>
                        <option value="fast">Rápida (Fast - 14s)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">
                        Cor do Texto da Faixa
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={currentMotion.scroll.marqueeTextColor || '#f8fafc'}
                          onChange={(e) =>
                            updateMotion({
                              scroll: { ...currentMotion.scroll, marqueeTextColor: e.target.value },
                            })
                          }
                          className="w-8 h-8 rounded-lg border border-slate-300 p-0.5 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={currentMotion.scroll.marqueeTextColor || '#f8fafc'}
                          onChange={(e) =>
                            updateMotion({
                              scroll: { ...currentMotion.scroll, marqueeTextColor: e.target.value },
                            })
                          }
                          className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">
                        Cor de Fundo da Faixa
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={currentMotion.scroll.marqueeBgColor || '#0f172a'}
                          onChange={(e) =>
                            updateMotion({
                              scroll: { ...currentMotion.scroll, marqueeBgColor: e.target.value },
                            })
                          }
                          className="w-8 h-8 rounded-lg border border-slate-300 p-0.5 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={currentMotion.scroll.marqueeBgColor || '#0f172a'}
                          onChange={(e) =>
                            updateMotion({
                              scroll: { ...currentMotion.scroll, marqueeBgColor: e.target.value },
                            })
                          }
                          className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Scroll Progress Bar Toggle */}
              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Barra de Progresso de Leitura no Topo da Página
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Linha colorida ultrafina fixa no topo indicando a porcentagem lida do site.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={currentMotion.scroll.scrollProgressBar}
                  onChange={(e) =>
                    updateMotion({
                      scroll: { ...currentMotion.scroll, scrollProgressBar: e.target.checked },
                    })
                  }
                  className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: INTERACTIONS & MICRO-EFFECTS */}
      {activeTab === 'interactions' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <MousePointer className="w-4 h-4 text-indigo-600" />
              Interações & Micro-efeitos Táteis
            </h3>
            <p className="text-xs text-slate-500">
              Sensações de resposta quando o cliente passa o mouse ou toca na tela.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Image hover */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Comportamento ao Passar o Mouse em Imagens
              </label>
              <select
                value={currentMotion.interactions.imageHoverEffect}
                onChange={(e) =>
                  updateMotion({
                    interactions: {
                      ...currentMotion.interactions,
                      imageHoverEffect: e.target.value as MotionHoverEffect,
                    },
                  })
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-indigo-500 cursor-pointer"
              >
                <option value="zoom">Zoom Suave (Scale 1.06)</option>
                <option value="lift">Elevação Suave (Lift -4px)</option>
                <option value="tilt3d">Inclinação 3D Dinâmica</option>
                <option value="glow">Brilho Acentuado</option>
                <option value="none">Nenhum efeito</option>
              </select>
            </div>

            {/* Product card hover */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Comportamento nos Cards de Produtos & Serviços
              </label>
              <select
                value={currentMotion.interactions.productCardHover}
                onChange={(e) =>
                  updateMotion({
                    interactions: {
                      ...currentMotion.interactions,
                      productCardHover: e.target.value as MotionProductHover,
                    },
                  })
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-indigo-500 cursor-pointer"
              >
                <option value="zoom">Zoom Sutil no Card</option>
                <option value="lift">Levantamento com Sombra Profunda</option>
                <option value="border_glow">Borda Iluminada</option>
                <option value="none">Estático</option>
              </select>
            </div>

            {/* Button feedback */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Resposta ao Toque nos Botões (Touch & Click)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(['scale', 'glow', 'none'] as MotionButtonFeedback[]).map((feedback) => (
                  <button
                    key={feedback}
                    onClick={() =>
                      updateMotion({
                        interactions: {
                          ...currentMotion.interactions,
                          buttonTapResponse: feedback,
                        },
                      })
                    }
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      currentMotion.interactions.buttonTapResponse === feedback
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    {feedback === 'scale' && 'Pulsar (Scale)'}
                    {feedback === 'glow' && 'Brilho (Glow)'}
                    {feedback === 'none' && 'Sem resposta'}
                  </button>
                ))}
              </div>
            </div>

            {/* Desktop Magnetic */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Atrair Cursor Magnético no Desktop
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    updateMotion({
                      interactions: { ...currentMotion.interactions, desktopMagnetic: true },
                    })
                  }
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    currentMotion.interactions.desktopMagnetic
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Ativado (Elegante)
                </button>
                <button
                  onClick={() =>
                    updateMotion({
                      interactions: { ...currentMotion.interactions, desktopMagnetic: false },
                    })
                  }
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    !currentMotion.interactions.desktopMagnetic
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Desativado
                </button>
              </div>
            </div>

            {/* Animated link underline */}
            <div className="col-span-full pt-2">
              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Sublinhado Dinâmico nos Links de Navegação
                  </span>
                  <span className="text-[11px] text-slate-500">
                    O sublinhado expande do centro para as extremidades ao passar o mouse.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={currentMotion.interactions.animatedLinkUnderline}
                  onChange={(e) =>
                    updateMotion({
                      interactions: {
                        ...currentMotion.interactions,
                        animatedLinkUnderline: e.target.checked,
                      },
                    })
                  }
                  className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: TIMING, CURVES & ACCESSIBILITY */}
      {activeTab === 'timing' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Gauge className="w-4 h-4 text-indigo-600" />
              Velocidades, Curvas de Aceleração & Acessibilidade
            </h3>
            <p className="text-xs text-slate-500">
              Ajuste fino da física das animações para calibrar a identidade da sua marca.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Speed preset */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Cadência / Velocidade Geral
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(['fast', 'balanced', 'cinematic'] as MotionSpeed[]).map((sp) => (
                  <button
                    key={sp}
                    onClick={() =>
                      updateMotion({
                        timing: { ...currentMotion.timing, speed: sp },
                      })
                    }
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      currentMotion.timing.speed === sp
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    {sp === 'fast' && 'Ágil (0.35s)'}
                    {sp === 'balanced' && 'Equilibrado (0.65s)'}
                    {sp === 'cinematic' && 'Cinematográfico (1.1s)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Easing Curves */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Curva de Aceleração (Easing)
              </label>
              <select
                value={currentMotion.timing.easing}
                onChange={(e) =>
                  updateMotion({
                    timing: {
                      ...currentMotion.timing,
                      easing: e.target.value as MotionEasing,
                    },
                  })
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-indigo-500 cursor-pointer"
              >
                <option value="smooth_cubic">Smooth Cubic (Padrão de Luxo - [0.22, 1, 0.36, 1])</option>
                <option value="editorial_gentle">Editorial Suave (Sem aceleração brusca)</option>
                <option value="snappy_spring">Snappy Spring (Energético & Tech)</option>
                <option value="linear">Linear Contínuo</option>
              </select>
            </div>

            {/* Delay slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">Atraso Inicial (Delay)</span>
                <span className="font-black text-indigo-600">
                  {currentMotion.timing.delay} segundos
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.05"
                value={currentMotion.timing.delay}
                onChange={(e) =>
                  updateMotion({
                    timing: {
                      ...currentMotion.timing,
                      delay: parseFloat(e.target.value),
                    },
                  })
                }
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Imediato (0s)</span>
                <span>Normal (0.1s)</span>
                <span>Calmo (0.5s)</span>
              </div>
            </div>

            {/* Mobile Optimization */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Otimização para Dispositivos Móveis
              </label>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Modo Alta Performance 60fps
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Otimiza aceleração via GPU e simplifica tilts 3D em celulares.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={currentMotion.timing.mobileOptimized}
                  onChange={(e) =>
                    updateMotion({
                      timing: {
                        ...currentMotion.timing,
                        mobileOptimized: e.target.checked,
                      },
                    })
                  }
                  className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
