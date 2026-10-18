import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Trash2,
  HelpCircle,
  Plus,
  Check,
  ArrowLeft,
  Star,
  MessageCircle,
  ShoppingBag,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  User,
  Calendar,
  MessageSquare,
  AlertCircle,
  Copy,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Share2,
  Instagram,
  Facebook,
  Youtube,
  Twitter,
  Linkedin,
  Globe,
  Send,
  Link as LinkIcon,
  Flame,
  UtensilsCrossed,
  Award,
  Scissors,
  Heart,
  Tag,
  CheckCircle2,
  Wine,
  Video,
  Film,
  Maximize2,
  Play,
  Eye,
} from 'lucide-react';
import { SiteSection } from '../../types/site';
import { BLOCK_REGISTRY } from '../../constants/blockRegistry';
import { ImageUpload } from '../common/ImageUpload';
import { VideoUpload } from '../common/VideoUpload';
import { api } from '../../services/api';
import { ProductCategory } from '../../types/product';
import { ServiceCategory } from '../../types/service';

interface BlockConfigDrawerProps {
  section: SiteSection | null;
  onClose: () => void;
  onUpdateSettings: (newSettings: Record<string, any>) => void;
  onDeleteSection?: (sectionId: string) => void;
}

export const BlockConfigDrawer: React.FC<BlockConfigDrawerProps> = ({
  section,
  onClose,
  onUpdateSettings,
  onDeleteSection,
}) => {
  if (!section) return null;

  const def = BLOCK_REGISTRY[section.type];
  const [localSettings, setLocalSettings] = useState(section.settings || {});
  const timeoutRef = React.useRef<number | null>(null);

  useEffect(() => {
    setLocalSettings(section.settings || {});
  }, [section.id]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const settings = localSettings;

  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);

  useEffect(() => {
    if (section.type === 'products') {
      api.getCategories().then(setProductCategories).catch(() => {});
    }
    if (section.type === 'services') {
      api.getServiceCategories().then(setServiceCategories).catch(() => {});
    }
  }, [section.type]);

  const updateField = (key: string, value: any, immediate = false) => {
    const updated = {
      ...localSettings,
      [key]: value,
    };
    setLocalSettings(updated);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (immediate) {
      onUpdateSettings(updated);
    } else {
      timeoutRef.current = window.setTimeout(() => {
        onUpdateSettings(updated);
      }, 200);
    }
  };

  const handleClose = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      onUpdateSettings(localSettings);
    }
    onClose();
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold"
            title="Voltar para a lista de seções"
          >
            <ArrowLeft className="w-4 h-4 text-indigo-600" />
            <span className="hidden sm:inline">Voltar</span>
          </button>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">
              Configurar Seção
            </span>
            <h3 className="text-sm font-bold text-slate-900">{def?.name || section.type}</h3>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {onDeleteSection && (
            <button
              onClick={() => onDeleteSection(section.id)}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              title="Excluir Seção"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Fechar configuração"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Settings Body */}
      <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
        {/* HERO BLOCK */}
        {section.type === 'hero' && (
          <>
            {/* SELO DE DESTAQUE SUPERIOR (TAGLINE) */}
            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-amber-600" />
                  <span>Selo de Destaque Superior (Tagline)</span>
                </label>
                {settings.tagline ? (
                  <button
                    type="button"
                    onClick={() => updateField('tagline', '')}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                  >
                    Remover selo
                  </button>
                ) : null}
              </div>
              <input
                type="text"
                value={settings.tagline || ''}
                onChange={(e) => updateField('tagline', e.target.value)}
                placeholder="Ex: Gastronomia autoral & coquetelaria contemporânea"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:border-indigo-500 text-xs font-semibold"
              />
              <p className="text-[11px] text-slate-500 leading-tight">
                Texto exibido no selo arredondado no topo do banner principal. Deixe em branco para ocultar o selo.
              </p>

              {/* Ícone do Selo */}
              {settings.tagline && (
                <div className="pt-2 border-t border-amber-200/60">
                  <span className="block text-[11px] font-bold text-slate-700 mb-1.5">
                    Ícone do Selo
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'utensils', label: 'Talheres', icon: <UtensilsCrossed className="w-3 h-3" /> },
                      { id: 'flame', label: 'Fogo', icon: <Flame className="w-3 h-3" /> },
                      { id: 'sparkles', label: 'Brilho', icon: <Sparkles className="w-3 h-3" /> },
                      { id: 'star', label: 'Estrela', icon: <Star className="w-3 h-3" /> },
                      { id: 'award', label: 'Prêmio', icon: <Award className="w-3 h-3" /> },
                      { id: 'scissors', label: 'Tesoura', icon: <Scissors className="w-3 h-3" /> },
                      { id: 'heart', label: 'Coração', icon: <Heart className="w-3 h-3" /> },
                      { id: 'none', label: 'Sem ícone', icon: null },
                    ].map((opt) => {
                      const currentIcon = settings.taglineIcon || 'utensils';
                      const isSelected = currentIcon === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => updateField('taglineIcon', opt.id)}
                          className={`p-1.5 rounded-lg border text-[10px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {opt.icon}
                          <span className="truncate">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Título Principal</label>
              <input
                type="text"
                value={settings.headline || ''}
                onChange={(e) => updateField('headline', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Subtítulo / Especialidade</label>
              <input
                type="text"
                value={settings.subtitle || ''}
                onChange={(e) => updateField('subtitle', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Texto Curto de Apoio</label>
              <textarea
                rows={2}
                value={settings.shortText || ''}
                onChange={(e) => updateField('shortText', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500"
              />
            </div>

            {/* DESTAQUES / BADGES DO BANNER */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="block font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Itens de Destaque / Badges do Rodapé do Banner</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const currentList = settings.highlights || [
                      { title: 'Grelhados na Brasa', subtitle: 'Cortes nobres certificados', icon: 'flame' },
                      { title: 'Insumos da Estação', subtitle: 'Preparo artesanal diário', icon: 'utensils' },
                      { title: 'Carta de Vinhos', subtitle: 'Harmonização pelo sommelier', icon: 'wine' },
                    ];
                    updateField('highlights', [...currentList, { title: 'Novo Destaque', subtitle: 'Descrição', icon: 'sparkles' }]);
                  }}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer"
                >
                  + Adicionar Destaque
                </button>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Edite, renomeie ou remova os destaques exibidos na base do banner principal (ex: Grelhados na Brasa, Insumos, Vinhos).
              </p>

              <div className="space-y-2.5 pt-1">
                {(settings.highlights || [
                  { title: 'Grelhados na Brasa', subtitle: 'Cortes nobres certificados', icon: 'flame' },
                  { title: 'Insumos da Estação', subtitle: 'Preparo artesanal diário', icon: 'utensils' },
                  { title: 'Carta de Vinhos', subtitle: 'Harmonização pelo sommelier', icon: 'wine' },
                ]).map((item: any, idx: number) => (
                  <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 relative group">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase text-indigo-600">Destaque #{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const list = [...(settings.highlights || [
                            { title: 'Grelhados na Brasa', subtitle: 'Cortes nobres certificados', icon: 'flame' },
                            { title: 'Insumos da Estação', subtitle: 'Preparo artesanal diário', icon: 'utensils' },
                            { title: 'Carta de Vinhos', subtitle: 'Harmonização pelo sommelier', icon: 'wine' },
                          ])];
                          list.splice(idx, 1);
                          updateField('highlights', list);
                        }}
                        className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                      >
                        Excluir
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={item.title || ''}
                        onChange={(e) => {
                          const list = [...(settings.highlights || [
                            { title: 'Grelhados na Brasa', subtitle: 'Cortes nobres certificados', icon: 'flame' },
                            { title: 'Insumos da Estação', subtitle: 'Preparo artesanal diário', icon: 'utensils' },
                            { title: 'Carta de Vinhos', subtitle: 'Harmonização pelo sommelier', icon: 'wine' },
                          ])];
                          list[idx] = { ...list[idx], title: e.target.value };
                          updateField('highlights', list);
                        }}
                        placeholder="Título (ex: Grelhados na Brasa)"
                        className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                      />
                      <input
                        type="text"
                        value={item.subtitle || ''}
                        onChange={(e) => {
                          const list = [...(settings.highlights || [
                            { title: 'Grelhados na Brasa', subtitle: 'Cortes nobres certificados', icon: 'flame' },
                            { title: 'Insumos da Estação', subtitle: 'Preparo artesanal diário', icon: 'utensils' },
                            { title: 'Carta de Vinhos', subtitle: 'Harmonização pelo sommelier', icon: 'wine' },
                          ])];
                          list[idx] = { ...list[idx], subtitle: e.target.value };
                          updateField('highlights', list);
                        }}
                        placeholder="Subtítulo"
                        className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block font-bold text-slate-700">Tipo de Fundo do Banner (Hero)</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => updateField('bgMode', 'image')}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    (settings.bgMode || 'image') === 'image'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Imagem
                </button>
                <button
                  type="button"
                  onClick={() => updateField('bgMode', 'video')}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    settings.bgMode === 'video'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Vídeo (MP4)
                </button>
                <button
                  type="button"
                  onClick={() => updateField('bgMode', 'gradient')}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    settings.bgMode === 'gradient'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Somente Cor
                </button>
              </div>
            </div>

            {(!settings.bgMode || settings.bgMode === 'image') && (
              <>
                <ImageUpload
                  label="Imagem de Fundo / Capa"
                  value={settings.coverImage || ''}
                  onChange={(url) => updateField('coverImage', url)}
                  subfolder="hero"
                  aspectRatio="video"
                />

                {settings.coverImage && (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                    <label className="block text-xs font-bold text-slate-700">Enquadramento da Foto no Mobile</label>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => updateField('mobileImageFit', 'cover_smart')}
                        className={`py-2 px-2.5 font-bold rounded-xl border text-center transition-all cursor-pointer ${
                          (settings.mobileImageFit || 'cover_smart') === 'cover_smart'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Ajuste Fluido (Sem cortes)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('mobileImageFit', 'banner_featured')}
                        className={`py-2 px-2.5 font-bold rounded-xl border text-center transition-all cursor-pointer ${
                          settings.mobileImageFit === 'banner_featured'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Banner em Destaque Visual
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Elimina cortes excessivos e evita que sobrem faixas vazias ou espaço do fundo na versão mobile.
                    </p>
                  </div>
                )}
              </>
            )}

            {settings.bgMode === 'video' && (
              <VideoUpload
                value={settings.videoUrl || ''}
                onChange={(url) => updateField('videoUrl', url)}
                label="Vídeo de Fundo (MP4 ou WebM)"
                helperText="Envie um vídeo MP4/WebM curto ou informe um link direto para reproduzir em loop no fundo da capa."
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Alinhamento</label>
                <select
                  value={settings.alignment || 'center'}
                  onChange={(e) => updateField('alignment', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                >
                  <option value="center">Centralizado</option>
                  <option value="left">Alinhado à Esquerda</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Escurecimento de Fundo</label>
                <select
                  value={settings.overlayOpacity ?? 50}
                  onChange={(e) => updateField('overlayOpacity', parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                >
                  <option value={20}>Suave (20%)</option>
                  <option value={40}>Médio (40%)</option>
                  <option value={60}>Forte (60%)</option>
                  <option value={80}>Intenso (80%)</option>
                </select>
              </div>
            </div>

            {/* Botão Principal de Ação (WhatsApp / Pedido no Site) */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-slate-900 text-xs block">
                    Botão no Banner Principal
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Exibir ou ocultar o botão de WhatsApp/ação no banner principal.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={settings.primaryButton?.enabled !== false}
                    onChange={(e) =>
                      updateField('primaryButton', {
                        ...settings.primaryButton,
                        enabled: e.target.checked,
                      }, true)
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {settings.primaryButton?.enabled !== false ? (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  {/* Presets rápidos */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                      Qual o objetivo do botão no banner?
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateField('primaryButton', {
                            ...settings.primaryButton,
                            url: '#produtos',
                            text: 'Fazer Pedido no Site',
                            actionType: 'order_site',
                            enabled: true,
                          }, true)
                        }
                        className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col gap-0.5 ${
                          settings.primaryButton?.url === '#produtos' || settings.primaryButton?.actionType === 'order_site'
                            ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-950'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-700">
                          <ShoppingBag className="w-3.5 h-3.5" />
                          Pedido no Site
                        </span>
                        <span className="text-[10px] text-slate-500 leading-tight">
                          Sem WhatsApp. Rola direto para os produtos.
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          updateField('primaryButton', {
                            ...settings.primaryButton,
                            url: '',
                            text: 'Fazer Pedido no WhatsApp',
                            actionType: 'whatsapp',
                            enabled: true,
                          }, true)
                        }
                        className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col gap-0.5 ${
                          (settings.primaryButton?.url === '' || settings.primaryButton?.url?.includes('wa.me') || settings.primaryButton?.actionType === 'whatsapp') &&
                          settings.primaryButton?.url !== '#produtos' && settings.primaryButton?.actionType !== 'order_site'
                            ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                          <MessageCircle className="w-3.5 h-3.5" />
                          Pedido no WhatsApp
                        </span>
                        <span className="text-[10px] text-slate-500 leading-tight">
                          Abre conversa no WhatsApp da loja.
                        </span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Texto do Botão
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Fazer Pedido no Site ou Ver Cardápio"
                      value={settings.primaryButton?.text || ''}
                      onChange={(e) =>
                        updateField('primaryButton', {
                          ...settings.primaryButton,
                          text: e.target.value,
                          enabled: true,
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Link / Destino do Botão
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: #produtos para ir ao catálogo, ou em branco para WhatsApp"
                      value={settings.primaryButton?.url || ''}
                      onChange={(e) =>
                        updateField('primaryButton', {
                          ...settings.primaryButton,
                          url: e.target.value,
                          enabled: true,
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="pt-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        updateField('primaryButton', {
                          ...settings.primaryButton,
                          enabled: false,
                        }, true)
                      }
                      className="text-[11px] text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Retirar este botão do banner
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-emerald-800">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    Botão de WhatsApp retirado do banner principal
                  </div>
                  <p className="text-[11px] text-emerald-700 leading-relaxed">
                    O banner está limpo, sem botão de WhatsApp. Seus clientes farão o pedido diretamente pelo catálogo e carrinho dentro do site!
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      updateField('primaryButton', {
                        ...settings.primaryButton,
                        enabled: true,
                        text: 'Fazer Pedido no Site',
                        url: '#produtos',
                        actionType: 'order_site',
                      }, true)
                    }
                    className="mt-1 text-[11px] font-bold text-indigo-700 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    + Deseja adicionar botão interno de "Fazer Pedido no Site"? Clique aqui
                  </button>
                </div>
              )}
            </div>

            {/* Botão Secundário (Cardápio / Catálogo) */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-slate-900 text-xs block">
                    Botão Secundário (Cardápio / Conheça Mais)
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Exibir botão direcionando para o cardápio, produtos ou serviços do site.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={settings.secondaryButton?.enabled !== false && (settings.secondaryButton?.enabled === true || Boolean(settings.secondaryButton?.text))}
                    onChange={(e) =>
                      updateField('secondaryButton', {
                        ...settings.secondaryButton,
                        enabled: e.target.checked,
                      }, true)
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {settings.secondaryButton?.enabled !== false ? (
                <div className="space-y-2.5 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Texto do Botão
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Ver Cardápio Completo ou Conheça Nossos Serviços"
                      value={settings.secondaryButton?.text || ''}
                      onChange={(e) =>
                        updateField('secondaryButton', {
                          ...settings.secondaryButton,
                          text: e.target.value,
                          enabled: true,
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Link ou Âncora
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: #produtos, #servicos ou link externo"
                      value={settings.secondaryButton?.url || ''}
                      onChange={(e) =>
                        updateField('secondaryButton', {
                          ...settings.secondaryButton,
                          url: e.target.value,
                          enabled: true,
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="pt-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        updateField('secondaryButton', {
                          ...settings.secondaryButton,
                          enabled: false,
                        }, true)
                      }
                      className="text-[11px] text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Retirar este botão do banner
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">
                  Botão secundário desativado.
                </p>
              )}
            </div>

            {/* VIDEO DIRECTLY BELOW THE MAIN BANNER */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 text-xs block">Vídeo Logo Abaixo do Banner</span>
                  <p className="text-[11px] text-slate-500">
                    Adicione um player de vídeo em destaque logo abaixo do banner principal.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!settings.showSubBannerVideo}
                    onChange={(e) => updateField('showSubBannerVideo', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {settings.showSubBannerVideo && (
                <div className="space-y-3 pt-2.5 border-t border-slate-200">
                  {/* Mode switcher for sub-banner video */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        updateField('showSubBannerVideoText', false);
                        updateField('subBannerVideoBadge', '');
                        updateField('subBannerVideoTitle', '');
                        updateField('subBannerVideoDescription', '');
                        updateField('subBannerVideoFullWidth', true);
                      }}
                      className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                        settings.showSubBannerVideoText === false || (!settings.subBannerVideoTitle && !settings.subBannerVideoBadge && !settings.subBannerVideoDescription)
                          ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-200'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 mb-0.5">
                        <Film className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Apenas Vídeo</span>
                      </div>
                      <span className="text-[10px] text-slate-500 block leading-tight">
                        Sem nenhum texto, ocupa 100% da tela de ponta a ponta.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        updateField('showSubBannerVideoText', true);
                        if (!settings.subBannerVideoTitle) {
                          updateField('subBannerVideoTitle', 'Vídeo de Apresentação');
                        }
                      }}
                      className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                        settings.showSubBannerVideoText !== false && (settings.subBannerVideoTitle || settings.subBannerVideoBadge || settings.subBannerVideoDescription)
                          ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-200'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 mb-0.5">
                        <Video className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Vídeo com Textos</span>
                      </div>
                      <span className="text-[10px] text-slate-500 block leading-tight">
                        Exibe título, selo ou descrição configuráveis.
                      </span>
                    </button>
                  </div>

                  <div>
                    <VideoUpload
                      value={settings.subBannerVideoUrl || ''}
                      onChange={(url) => updateField('subBannerVideoUrl', url)}
                      label="Fonte do Vídeo"
                      helperText="Escolha entre link do YouTube/Vimeo ou envio de arquivo MP4/WebM do dispositivo (até 50MB)."
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      O vídeo inicia automaticamente com som silenciado quando o usuário rola a página até ele (com botão para ativar o som a qualquer momento).
                    </p>
                  </div>

                  {/* Ocupação da Tela (Largura do Vídeo) */}
                  <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                    <label className="block font-bold text-slate-800 text-xs">Ocupação da Tela (Largura do Vídeo)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateField('subBannerVideoFullWidth', true)}
                        className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          settings.subBannerVideoFullWidth === true || settings.showSubBannerVideoText === false || (!settings.subBannerVideoTitle && !settings.subBannerVideoBadge && !settings.subBannerVideoDescription)
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Ocupar Toda a Tela (100%)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('subBannerVideoFullWidth', false)}
                        className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          settings.subBannerVideoFullWidth === false && settings.showSubBannerVideoText !== false && (Boolean(settings.subBannerVideoTitle) || Boolean(settings.subBannerVideoBadge))
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Caixa Centralizada
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {(settings.subBannerVideoFullWidth === true || settings.showSubBannerVideoText === false || (!settings.subBannerVideoTitle && !settings.subBannerVideoBadge && !settings.subBannerVideoDescription))
                        ? 'O vídeo ocupará toda a largura da tela (100%), sem margens ou bordas laterais cortando.'
                        : 'O vídeo ficará centralizado em uma caixa com margens laterais.'}
                    </p>
                  </div>

                  {settings.showSubBannerVideoText !== false ? (
                    <div className="space-y-2.5 pt-2 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700">Configuração dos Textos</span>
                        <button
                          type="button"
                          onClick={() => {
                            updateField('showSubBannerVideoText', false);
                            updateField('subBannerVideoBadge', '');
                            updateField('subBannerVideoTitle', '');
                            updateField('subBannerVideoDescription', '');
                            updateField('subBannerVideoFullWidth', true);
                          }}
                          className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          Excluir Todos os Textos (Apenas Vídeo)
                        </button>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-bold text-slate-700">
                            Selo Superior (Opcional)
                          </label>
                          {settings.subBannerVideoBadge ? (
                            <button
                              type="button"
                              onClick={() => updateField('subBannerVideoBadge', '')}
                              className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                            >
                              Limpar selo
                            </button>
                          ) : null}
                        </div>
                        <input
                          type="text"
                          placeholder="Ex: Vídeo de Apresentação (deixe vazio para não exibir)"
                          value={settings.subBannerVideoBadge || ''}
                          onChange={(e) => updateField('subBannerVideoBadge', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-bold text-slate-700">
                            Título do Vídeo (Opcional)
                          </label>
                          {settings.subBannerVideoTitle ? (
                            <button
                              type="button"
                              onClick={() => updateField('subBannerVideoTitle', '')}
                              className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                            >
                              Limpar título
                            </button>
                          ) : null}
                        </div>
                        <input
                          type="text"
                          placeholder="Ex: Conheça nosso espaço e atendimento (deixe vazio para não exibir)"
                          value={settings.subBannerVideoTitle || ''}
                          onChange={(e) => updateField('subBannerVideoTitle', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 font-semibold"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-bold text-slate-700">
                            Descrição de Apoio (Opcional)
                          </label>
                          {settings.subBannerVideoDescription ? (
                            <button
                              type="button"
                              onClick={() => updateField('subBannerVideoDescription', '')}
                              className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                            >
                              Limpar descrição
                            </button>
                          ) : null}
                        </div>
                        <input
                          type="text"
                          placeholder="Ex: Assista ao vídeo de 1 minuto e tire suas dúvidas"
                          value={settings.subBannerVideoDescription || ''}
                          onChange={(e) => updateField('subBannerVideoDescription', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                      <span className="text-[11px] font-medium text-emerald-800">
                        ✓ Vídeo limpo ativo: nenhum texto acima do vídeo, ocupando 100% da tela.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          updateField('showSubBannerVideoText', true);
                          updateField('subBannerVideoTitle', 'Vídeo de Apresentação');
                        }}
                        className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer whitespace-nowrap ml-2"
                      >
                        + Adicionar Textos
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* DESTAQUES / PILARES DO BANNER PRINCIPAL (ex: Grelhados na Brasa, Insumos da Estação, Carta de Vinhos) */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-amber-500" />
                    Destaques do Banner (Badges com Ícones)
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Edite ou exclua os selos do banner (ex: "Grelhados na Brasa", "Insumos da Estação", "Carta de Vinhos").
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showHighlights !== false && (settings.highlights === undefined || (Array.isArray(settings.highlights) && settings.highlights.length > 0))}
                    onChange={(e) => {
                      if (!e.target.checked) {
                        updateField('showHighlights', false);
                      } else {
                        updateField('showHighlights', true);
                        if (!settings.highlights || settings.highlights.length === 0) {
                          updateField('highlights', [
                            { title: 'Grelhados na Brasa', subtitle: 'Cortes nobres certificados', icon: 'flame' },
                            { title: 'Insumos da Estação', subtitle: 'Preparo artesanal diário', icon: 'utensils' },
                            { title: 'Carta de Vinhos', subtitle: 'Harmonização pelo sommelier', icon: 'wine' },
                          ]);
                        }
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {settings.showHighlights !== false && (
                <div className="space-y-3 pt-2.5 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700">Lista de Destaques</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const currentList = settings.highlights ?? [
                            { title: 'Grelhados na Brasa', subtitle: 'Cortes nobres certificados', icon: 'flame' },
                            { title: 'Insumos da Estação', subtitle: 'Preparo artesanal diário', icon: 'utensils' },
                            { title: 'Carta de Vinhos', subtitle: 'Harmonização pelo sommelier', icon: 'wine' },
                          ];
                          updateField('showHighlights', true);
                          updateField('highlights', [
                            ...currentList,
                            { title: 'Novo Destaque', subtitle: 'Descrição do diferencial', icon: 'sparkles' },
                          ]);
                        }}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer"
                      >
                        + Adicionar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateField('highlights', []);
                          updateField('showHighlights', false);
                        }}
                        className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                      >
                        Excluir Todos
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {(settings.highlights ?? [
                      { title: 'Grelhados na Brasa', subtitle: 'Cortes nobres certificados', icon: 'flame' },
                      { title: 'Insumos da Estação', subtitle: 'Preparo artesanal diário', icon: 'utensils' },
                      { title: 'Carta de Vinhos', subtitle: 'Harmonização pelo sommelier', icon: 'wine' },
                    ]).map((item: any, idx: number) => (
                      <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 relative shadow-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase text-amber-700 flex items-center gap-1">
                            <Star className="w-3 h-3 text-amber-500" />
                            Destaque #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const currentList = settings.highlights ?? [
                                { title: 'Grelhados na Brasa', subtitle: 'Cortes nobres certificados', icon: 'flame' },
                                { title: 'Insumos da Estação', subtitle: 'Preparo artesanal diário', icon: 'utensils' },
                                { title: 'Carta de Vinhos', subtitle: 'Harmonização pelo sommelier', icon: 'wine' },
                              ];
                              const list = [...currentList];
                              list.splice(idx, 1);
                              updateField('highlights', list);
                              if (list.length === 0) {
                                updateField('showHighlights', false);
                              }
                            }}
                            className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                          >
                            Excluir
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Título</label>
                            <input
                              type="text"
                              value={item.title || ''}
                              onChange={(e) => {
                                const currentList = settings.highlights ?? [
                                  { title: 'Grelhados na Brasa', subtitle: 'Cortes nobres certificados', icon: 'flame' },
                                  { title: 'Insumos da Estação', subtitle: 'Preparo artesanal diário', icon: 'utensils' },
                                  { title: 'Carta de Vinhos', subtitle: 'Harmonização pelo sommelier', icon: 'wine' },
                                ];
                                const list = [...currentList];
                                list[idx] = { ...list[idx], title: e.target.value };
                                updateField('highlights', list);
                              }}
                              placeholder="Ex: Grelhados na Brasa"
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Ícone</label>
                            <select
                              value={item.icon || 'flame'}
                              onChange={(e) => {
                                const currentList = settings.highlights ?? [
                                  { title: 'Grelhados na Brasa', subtitle: 'Cortes nobres certificados', icon: 'flame' },
                                  { title: 'Insumos da Estação', subtitle: 'Preparo artesanal diário', icon: 'utensils' },
                                  { title: 'Carta de Vinhos', subtitle: 'Harmonização pelo sommelier', icon: 'wine' },
                                ];
                                const list = [...currentList];
                                list[idx] = { ...list[idx], icon: e.target.value };
                                updateField('highlights', list);
                              }}
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                            >
                              <option value="flame">🔥 Fogo / Brasa</option>
                              <option value="utensils">🍴 Talheres / Gastronomia</option>
                              <option value="wine">🍷 Taça / Vinho</option>
                              <option value="sparkles">✨ Brilho / Especial</option>
                              <option value="star">⭐ Estrela</option>
                              <option value="award">🏆 Selo / Prêmio</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Subtítulo / Descrição Curta</label>
                          <input
                            type="text"
                            value={item.subtitle || item.desc || ''}
                            onChange={(e) => {
                              const currentList = settings.highlights ?? [
                                { title: 'Grelhados na Brasa', subtitle: 'Cortes nobres certificados', icon: 'flame' },
                                { title: 'Insumos da Estação', subtitle: 'Preparo artesanal diário', icon: 'utensils' },
                                { title: 'Carta de Vinhos', subtitle: 'Harmonização pelo sommelier', icon: 'wine' },
                              ];
                              const list = [...currentList];
                              list[idx] = { ...list[idx], subtitle: e.target.value, desc: e.target.value };
                              updateField('highlights', list);
                            }}
                            placeholder="Ex: Cortes nobres certificados"
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ABOUT BLOCK */}
        {section.type === 'about' && (
          <>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Título da Seção</label>
              <input
                type="text"
                value={settings.title || ''}
                onChange={(e) => updateField('title', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Subtítulo</label>
              <input
                type="text"
                value={settings.subtitle || ''}
                onChange={(e) => updateField('subtitle', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">História / Apresentação</label>
              <textarea
                rows={4}
                value={settings.text || ''}
                onChange={(e) => updateField('text', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
              />
            </div>
            <ImageUpload
              label="Foto do Estabelecimento / Equipe"
              value={settings.image || ''}
              onChange={(url) => updateField('image', url)}
              subfolder="about"
            />
            <div>
              <label className="block font-bold text-slate-700 mb-1">Posição da Imagem</label>
              <select
                value={settings.layout || 'image_right'}
                onChange={(e) => updateField('layout', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
              >
                <option value="image_right">Imagem à Direita</option>
                <option value="image_left">Imagem à Esquerda</option>
                <option value="text_only">Somente Texto</option>
              </select>
            </div>

            {/* DIFERENCIAIS / CHECKLIST DA SEÇÃO SOBRE NÓS */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Diferenciais & Destaques (Checklist Verde)</span>
                  </label>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    Edite, altere ou exclua os 3 itens de destaque que aparecem na seção Sobre Nós.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showHighlights !== false && (settings.highlights === undefined || (Array.isArray(settings.highlights) && settings.highlights.length > 0))}
                    onChange={(e) => {
                      if (!e.target.checked) {
                        updateField('showHighlights', false);
                      } else {
                        updateField('showHighlights', true);
                        if (!settings.highlights || settings.highlights.length === 0) {
                          const isGastronomy = (settings.title && /cozinha|mesa|prato|sabor|gastronom/i.test(settings.title)) ||
                            (settings.text && /cozinha|mesa|prato|sabor|gastronom|restaurante/i.test(settings.text));
                          updateField('highlights', isGastronomy ? [
                            { title: 'Ingredientes de Origem Controlada', desc: 'Parceria com pequenos produtores e ingredientes frescos diários.' },
                            { title: 'Ambiente & Hospitalidade Calorosa', desc: 'Salão desenhado para encontros memoráveis, reuniões e celebrações.' },
                            { title: 'Pratos Especiais & Sugestões do Chef', desc: 'Menu sazonal com receitas preparadas na hora pela nossa equipe.' },
                          ] : [
                            { title: 'Consultas Sem Pressa', desc: 'Tempo dedicado para esclarecer todas as suas dúvidas.' },
                            { title: 'Equipamentos Modernos', desc: 'Exames e diagnósticos com alta precisão e segurança.' },
                            { title: 'Acessibilidade Total', desc: 'Rampa de acesso, elevador e espaço adaptado para todos.' },
                          ]);
                        }
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {settings.showHighlights !== false && (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  {/* Action buttons */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700">Itens em Exibição</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const isGastronomy = (settings.title && /cozinha|mesa|prato|sabor|gastronom/i.test(settings.title)) ||
                            (settings.text && /cozinha|mesa|prato|sabor|gastronom|restaurante/i.test(settings.text));
                          const currentList = settings.highlights ?? (isGastronomy ? [
                            { title: 'Ingredientes de Origem Controlada', desc: 'Parceria com pequenos produtores e ingredientes frescos diários.' },
                            { title: 'Ambiente & Hospitalidade Calorosa', desc: 'Salão desenhado para encontros memoráveis, reuniões e celebrações.' },
                            { title: 'Pratos Especiais & Sugestões do Chef', desc: 'Menu sazonal com receitas preparadas na hora pela nossa equipe.' },
                          ] : [
                            { title: 'Consultas Sem Pressa', desc: 'Tempo dedicado para esclarecer todas as suas dúvidas.' },
                            { title: 'Equipamentos Modernos', desc: 'Exames e diagnósticos com alta precisão e segurança.' },
                            { title: 'Acessibilidade Total', desc: 'Rampa de acesso, elevador e espaço adaptado para todos.' },
                          ]);
                          updateField('showHighlights', true);
                          updateField('highlights', [...currentList, { title: 'Novo Diferencial', desc: 'Descrição do diferencial' }]);
                        }}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer"
                      >
                        + Adicionar Item
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateField('highlights', []);
                          updateField('showHighlights', false);
                        }}
                        className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                      >
                        Excluir Todos
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    {(() => {
                      const isGastronomy = (settings.title && /cozinha|mesa|prato|sabor|gastronom/i.test(settings.title)) ||
                        (settings.text && /cozinha|mesa|prato|sabor|gastronom|restaurante/i.test(settings.text));
                      const defaultItems = isGastronomy ? [
                        { title: 'Ingredientes de Origem Controlada', desc: 'Parceria com pequenos produtores e ingredientes frescos diários.' },
                        { title: 'Ambiente & Hospitalidade Calorosa', desc: 'Salão desenhado para encontros memoráveis, reuniões e celebrações.' },
                        { title: 'Pratos Especiais & Sugestões do Chef', desc: 'Menu sazonal com receitas preparadas na hora pela nossa equipe.' },
                      ] : [
                        { title: 'Consultas Sem Pressa', desc: 'Tempo dedicado para esclarecer todas as suas dúvidas.' },
                        { title: 'Equipamentos Modernos', desc: 'Exames e diagnósticos com alta precisão e segurança.' },
                        { title: 'Acessibilidade Total', desc: 'Rampa de acesso, elevador e espaço adaptado para todos.' },
                      ];
                      const list = settings.highlights ?? defaultItems;

                      return list.map((item: any, idx: number) => (
                        <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 relative group shadow-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Diferencial #{idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const currentList = [...list];
                                currentList.splice(idx, 1);
                                updateField('highlights', currentList);
                                if (currentList.length === 0) {
                                  updateField('showHighlights', false);
                                }
                              }}
                              className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                            >
                              Excluir
                            </button>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Título do Diferencial</label>
                              <input
                                type="text"
                                value={item.title || ''}
                                onChange={(e) => {
                                  const currentList = [...list];
                                  currentList[idx] = { ...currentList[idx], title: e.target.value };
                                  updateField('highlights', currentList);
                                }}
                                placeholder="Ex: Ingredientes de Origem Controlada"
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Descrição</label>
                              <textarea
                                rows={2}
                                value={item.desc || item.subtitle || ''}
                                onChange={(e) => {
                                  const currentList = [...list];
                                  currentList[idx] = { ...currentList[idx], desc: e.target.value, subtitle: e.target.value };
                                  updateField('highlights', currentList);
                                }}
                                placeholder="Ex: Parceria com pequenos produtores e ingredientes frescos diários."
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700"
                              />
                            </div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* GALLERY BLOCK */}
        {section.type === 'gallery' && (
          <div className="space-y-4">
            {/* Mode / Header text toggle */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
              <div>
                <span className="block font-bold text-slate-800 text-xs">Exibir Textos Acima da Galeria</span>
                <span className="text-[11px] text-slate-500">
                  Desative para exibir somente a grade de fotos, sem títulos ou selos.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showText !== false}
                  onChange={(e) => updateField('showText', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {settings.showText !== false ? (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Textos da Seção</span>
                  <button
                    type="button"
                    onClick={() => {
                      updateField('showText', false);
                      updateField('badge', '');
                      updateField('title', '');
                      updateField('subtitle', '');
                    }}
                    className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                  >
                    Excluir Todos os Textos (Apenas Fotos)
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700">Selo Superior (Opcional)</label>
                    {settings.badge ? (
                      <button
                        type="button"
                        onClick={() => updateField('badge', '')}
                        className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                      >
                        Limpar selo
                      </button>
                    ) : null}
                  </div>
                  <input
                    type="text"
                    value={settings.badge || ''}
                    onChange={(e) => updateField('badge', e.target.value)}
                    placeholder="Ex: Ambiente & Trabalhos (deixe vazio para não exibir)"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500 text-xs font-semibold"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700">Título da Galeria (Opcional)</label>
                    {settings.title ? (
                      <button
                        type="button"
                        onClick={() => updateField('title', '')}
                        className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                      >
                        Limpar título
                      </button>
                    ) : null}
                  </div>
                  <input
                    type="text"
                    value={settings.title || ''}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="Ex: Nossa Galeria (deixe vazio para não exibir)"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500 text-xs font-bold"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700">Subtítulo / Descrição (Opcional)</label>
                    {settings.subtitle ? (
                      <button
                        type="button"
                        onClick={() => updateField('subtitle', '')}
                        className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                      >
                        Limpar subtítulo
                      </button>
                    ) : null}
                  </div>
                  <input
                    type="text"
                    value={settings.subtitle || ''}
                    onChange={(e) => updateField('subtitle', e.target.value)}
                    placeholder="Ex: Conheça nosso espaço e alguns dos nossos trabalhos (opcional)"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500 text-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                <span className="text-[11px] font-medium text-emerald-800">
                  ✓ Galeria limpa ativa: apenas a grade de fotos será exibida, sem títulos ou selos.
                </span>
                <button
                  type="button"
                  onClick={() => updateField('showText', true)}
                  className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer whitespace-nowrap ml-2"
                >
                  + Adicionar Textos
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1 text-xs">Ajuste da Imagem</label>
                <select
                  value={settings.imageFit || 'contain'}
                  onChange={(e) => updateField('imageFit', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                >
                  <option value="contain">Completa sem cortes (Perfeita)</option>
                  <option value="cover">Preencher quadro (Cortar bordas)</option>
                  <option value="natural">Proporção natural da foto</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  "Completa sem cortes" garante que nenhuma arte ou borda seja cortada.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1 text-xs">Formato das Molduras</label>
                <select
                  value={settings.aspectRatio || 'square'}
                  onChange={(e) => updateField('aspectRatio', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                >
                  <option value="square">Quadrado (1:1)</option>
                  <option value="landscape">Paisagem (4:3)</option>
                  <option value="wide">Widescreen (16:9)</option>
                  <option value="auto">Automático / Natural</option>
                </select>
              </div>
            </div>

            {/* FOTOS DA GALERIA COM OPÇÃO CLARA DE EXCLUIR */}
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block font-bold text-slate-800 text-xs">
                    Fotos da Galeria ({ (settings.items || []).length })
                  </label>
                  <span className="text-[10px] text-slate-500">
                    Você pode alterar legendas, reordenar ou excluir qualquer foto individualmente.
                  </span>
                </div>
                {(settings.items || []).length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Tem certeza que deseja excluir todas as fotos da galeria?')) {
                        updateField('items', [], true);
                      }
                    }}
                    className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                  >
                    Excluir Todas as Fotos
                  </button>
                )}
              </div>

              {(settings.items || []).length === 0 ? (
                <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                  <Eye className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700">Nenhuma foto na galeria ainda</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Utilize o campo abaixo para enviar a primeira foto da sua galeria.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(settings.items || []).map((item: any, idx: number) => (
                    <div
                      key={item.id || idx}
                      className="rounded-2xl border border-slate-200 p-2.5 bg-white shadow-xs space-y-2 relative group hover:border-slate-300 transition-colors"
                    >
                      {/* Thumbnail container */}
                      <div className="relative w-full h-28 rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center border border-slate-100">
                        <img
                          src={item.url}
                          alt={item.caption || `Foto ${idx + 1}`}
                          className={`w-full h-full ${settings.imageFit === 'cover' ? 'object-cover' : 'object-contain'}`}
                        />

                        {/* Foto indicator badge */}
                        <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/70 text-white text-[10px] font-bold rounded-md backdrop-blur-xs">
                          #{idx + 1}
                        </span>

                        {/* ALWAYS VISIBLE TOP-RIGHT DELETE BUTTON */}
                        <button
                          type="button"
                          onClick={() => {
                            const newItems = (settings.items || []).filter((_: any, i: number) => i !== idx);
                            updateField('items', newItems, true);
                          }}
                          className="absolute top-2 right-2 p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-md cursor-pointer transition-transform hover:scale-110 z-10 flex items-center justify-center"
                          title="Excluir foto da galeria"
                          aria-label="Excluir foto da galeria"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Caption input */}
                      <div>
                        <input
                          type="text"
                          placeholder="Legenda da foto (opcional)"
                          value={item.caption || ''}
                          onChange={(e) => {
                            const newItems = [...(settings.items || [])];
                            newItems[idx] = { ...newItems[idx], caption: e.target.value };
                            updateField('items', newItems);
                          }}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:border-indigo-500 text-xs"
                        />
                      </div>

                      {/* Prominent EXCLUIR FOTA button */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const newItems = (settings.items || []).filter((_: any, i: number) => i !== idx);
                            updateField('items', newItems, true);
                          }}
                          className="flex-1 py-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          <span>Excluir Foto</span>
                        </button>

                        {(settings.items || []).length > 1 && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => {
                                if (idx === 0) return;
                                const newItems = [...(settings.items || [])];
                                const temp = newItems[idx - 1];
                                newItems[idx - 1] = newItems[idx];
                                newItems[idx] = temp;
                                updateField('items', newItems, true);
                              }}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                              title="Mover foto para a esquerda / cima"
                            >
                              <ArrowLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === (settings.items || []).length - 1}
                              onClick={() => {
                                if (idx === (settings.items || []).length - 1) return;
                                const newItems = [...(settings.items || [])];
                                const temp = newItems[idx + 1];
                                newItems[idx + 1] = newItems[idx];
                                newItems[idx] = temp;
                                updateField('items', newItems, true);
                              }}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                              title="Mover foto para a direita / baixo"
                            >
                              <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2">
                <ImageUpload
                  label="Adicionar Nova Foto à Galeria"
                  onChange={(url) => {
                    if (!url) return;
                    const newItems = [
                      ...(settings.items || []),
                      { id: `g-${Date.now()}`, url, caption: '' },
                    ];
                    updateField('items', newItems, true);
                  }}
                  subfolder="gallery"
                />
              </div>
            </div>
          </div>
        )}

        {/* VIDEO BLOCK */}
        {section.type === 'video' && (
          <div className="space-y-4">
            {/* Mode selection buttons: Apenas Vídeo vs Vídeo com Textos */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  updateField('showText', false);
                  updateField('badge', '');
                  updateField('title', '');
                  updateField('description', '');
                  updateField('fullWidth', true);
                }}
                className={`p-3 rounded-2xl text-left border transition-all cursor-pointer ${
                  settings.showText === false || (!settings.title && !settings.badge && !settings.description)
                    ? 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-200 shadow-xs'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 mb-1">
                  <Film className="w-4 h-4 text-indigo-600" />
                  <span>Apenas o Vídeo</span>
                </div>
                <span className="text-[11px] text-slate-500 block leading-tight">
                  Sem nenhum texto acima. O vídeo ocupa todo o espaço da tela de ponta a ponta (100%).
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  updateField('showText', true);
                  if (!settings.title) {
                    updateField('title', 'Conheça Mais Sobre Nós');
                  }
                }}
                className={`p-3 rounded-2xl text-left border transition-all cursor-pointer ${
                  settings.showText !== false && (Boolean(settings.title) || Boolean(settings.badge) || Boolean(settings.description))
                    ? 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-200 shadow-xs'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 mb-1">
                  <Video className="w-4 h-4 text-indigo-600" />
                  <span>Vídeo com Textos</span>
                </div>
                <span className="text-[11px] text-slate-500 block leading-tight">
                  Personalize ou exclua individualmente títulos, selo ou descrição.
                </span>
              </button>
            </div>

            {/* Video File / URL Upload */}
            <div>
              <VideoUpload
                value={settings.videoUrl || ''}
                onChange={(url) => updateField('videoUrl', url)}
                label="Fonte do Vídeo"
                helperText="Escolha entre link do YouTube/Vimeo ou envio de arquivo MP4/WebM do dispositivo (até 50MB)."
              />
            </div>

            {/* Ocupação da Tela (Largura do Vídeo) */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <label className="block font-bold text-slate-800 text-xs">Ocupação da Tela (Largura do Vídeo)</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateField('fullWidth', true)}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    settings.fullWidth === true || settings.showText === false || (!settings.title && !settings.badge && !settings.description)
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Ocupar Toda a Tela (100%)
                </button>
                <button
                  type="button"
                  onClick={() => updateField('fullWidth', false)}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    settings.fullWidth === false && settings.showText !== false && (Boolean(settings.title) || Boolean(settings.badge))
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Caixa Centralizada
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                {(settings.fullWidth === true || settings.showText === false || (!settings.title && !settings.badge && !settings.description))
                  ? 'O vídeo ocupará todo o espaço da tela de ponta a ponta (100% da largura), sem margens ou bordas laterais cortando.'
                  : 'O vídeo ficará centralizado em uma caixa com margens laterais.'}
              </p>
            </div>

            {/* Altura / Proporção do Vídeo */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <label className="block font-bold text-slate-800 text-xs">Altura / Proporção de Exibição do Vídeo</label>
              <select
                value={settings.heightMode || 'standard'}
                onChange={(e) => updateField('heightMode', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
              >
                <option value="standard">Proporção Widescreen 16:9 (Padrão Original do Vídeo - Perfeito)</option>
                <option value="cinema">Formato Cinema Expandido (75vh de altura - imersivo)</option>
                <option value="screen">Tela Cheia Completa (90vh - cobre a altura quase total da tela)</option>
              </select>
              <p className="text-[10px] text-slate-500">
                A proporção 16:9 widescreen é ideal para vídeos do YouTube e Vimeo pois preserva o formato natural sem faixas pretas.
              </p>
            </div>

            {/* Poster image (optional thumbnail) */}
            <div>
              <ImageUpload
                label="Imagem de Capa do Vídeo (Opcional)"
                value={settings.posterUrl || ''}
                onChange={(url) => updateField('posterUrl', url)}
                subfolder="video"
              />
            </div>

            {/* Texts configuration (shown if showText !== false) */}
            {settings.showText !== false && (Boolean(settings.title) || Boolean(settings.badge) || Boolean(settings.description)) ? (
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Opções dos Textos do Vídeo</span>
                    <span className="text-[10px] text-slate-500">
                      Você pode excluir qualquer texto individualmente ou todos de uma vez.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      updateField('showText', false);
                      updateField('badge', '');
                      updateField('title', '');
                      updateField('description', '');
                      updateField('fullWidth', true);
                    }}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3 text-rose-600" />
                    <span>Excluir Todos os Textos</span>
                  </button>
                </div>

                {/* Selo Superior */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block font-bold text-slate-700 text-xs">Selo Superior (Opcional)</label>
                    {settings.badge ? (
                      <button
                        type="button"
                        onClick={() => updateField('badge', '')}
                        className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Excluir selo</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400">Não exibido</span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={settings.badge || ''}
                    onChange={(e) => updateField('badge', e.target.value)}
                    placeholder="Ex: Vídeo em Destaque (deixe vazio para não exibir)"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500 text-xs font-semibold"
                  />
                  <p className="text-[10px] text-slate-400">Texto pequeno em destaque acima do título.</p>
                </div>

                {/* Título */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block font-bold text-slate-700 text-xs">Título do Vídeo (Opcional)</label>
                    {settings.title ? (
                      <button
                        type="button"
                        onClick={() => updateField('title', '')}
                        className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Excluir título</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400">Não exibido</span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={settings.title || ''}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="Ex: Conheça Mais Sobre Nós (deixe vazio para não exibir)"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500 text-xs font-bold"
                  />
                </div>

                {/* Descrição */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block font-bold text-slate-700 text-xs">Descrição / Subtítulo (Opcional)</label>
                    {settings.description ? (
                      <button
                        type="button"
                        onClick={() => updateField('description', '')}
                        className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Excluir descrição</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400">Não exibido</span>
                    )}
                  </div>
                  <textarea
                    rows={2}
                    value={settings.description || ''}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Texto descritivo opcional abaixo do título (deixe vazio para não exibir)..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500 text-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="block font-bold text-emerald-900 text-xs">
                    ✓ Vídeo Limpo em Tela Cheia Ativo
                  </span>
                  <span className="text-[11px] text-emerald-700">
                    O vídeo ocupará 100% de todo o espaço da tela sem nenhum texto acima.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    updateField('showText', true);
                    updateField('title', 'Conheça Mais Sobre Nós');
                  }}
                  className="px-3 py-1.5 bg-white text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold hover:bg-emerald-100 cursor-pointer shadow-2xs whitespace-nowrap ml-3"
                >
                  + Adicionar Textos
                </button>
              </div>
            )}
          </div>
        )}

        {/* QUICK BUTTONS BLOCK */}
        {section.type === 'quick_buttons' && (
          <div className="space-y-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Título da Seção (Opcional)</label>
              <input
                type="text"
                value={settings.title || ''}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Ex: Acesso Rápido"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Subtítulo (Opcional)</label>
              <input
                type="text"
                value={settings.subtitle || ''}
                onChange={(e) => updateField('subtitle', e.target.value)}
                placeholder="Ex: Escolha como prefere interagir conosco"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 uppercase text-[10px] tracking-wider">Botões de Acesso Rápido</span>
                <button
                  type="button"
                  onClick={() => {
                    const currentBtns = settings.buttons || [];
                    const newBtn = {
                      id: `btn-${Date.now()}`,
                      type: 'custom',
                      title: 'Novo Botão',
                      url: 'https://',
                      isEnabled: true,
                    };
                    updateField('buttons', [...currentBtns, newBtn], true);
                  }}
                  className="px-2.5 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Botão</span>
                </button>
              </div>

              {(settings.buttons || []).map((btn: any, index: number) => (
                <div key={btn.id || index} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={btn.isEnabled !== false}
                        onChange={(e) => {
                          const updated = [...(settings.buttons || [])];
                          updated[index] = { ...btn, isEnabled: e.target.checked };
                          updateField('buttons', updated, true);
                        }}
                        className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                      />
                      <span className="font-bold text-slate-800 text-xs">Exibir Botão</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        const updated = (settings.buttons || []).filter((_: any, i: number) => i !== index);
                        updateField('buttons', updated, true);
                      }}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                      title="Remover Botão"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Título do Botão</label>
                      <input
                        type="text"
                        value={btn.title || ''}
                        onChange={(e) => {
                          const updated = [...(settings.buttons || [])];
                          updated[index] = { ...btn, title: e.target.value };
                          updateField('buttons', updated);
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Link / URL / Ação</label>
                      <input
                        type="text"
                        value={btn.url || ''}
                        onChange={(e) => {
                          const updated = [...(settings.buttons || [])];
                          updated[index] = { ...btn, url: e.target.value };
                          updateField('buttons', updated);
                        }}
                        placeholder="Ex: https://wa.me/... ou tel:..."
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SOCIAL LINKS BLOCK */}
        {section.type === 'social_links' && (() => {
          interface SocialLink {
            id?: string;
            platform: string;
            name?: string;
            url: string;
            handle?: string;
            isEnabled: boolean;
          }

          const defaultPlatformList: SocialLink[] = [
            { platform: 'instagram', name: 'Instagram', url: '', handle: '', isEnabled: true },
            { platform: 'facebook', name: 'Facebook', url: '', handle: '', isEnabled: true },
            { platform: 'whatsapp', name: 'WhatsApp', url: '', handle: '', isEnabled: true },
            { platform: 'tiktok', name: 'TikTok', url: '', handle: '', isEnabled: false },
            { platform: 'youtube', name: 'YouTube', url: '', handle: '', isEnabled: false },
            { platform: 'linkedin', name: 'LinkedIn', url: '', handle: '', isEnabled: false },
          ];

          const currentLinks: SocialLink[] = Array.isArray(settings.links) && settings.links.length > 0
            ? settings.links
            : defaultPlatformList;

          const handleUpdateLinks = (newLinks: SocialLink[], immediate = true) => {
            updateField('links', newLinks, immediate);
          };

          const handleToggleLink = (index: number) => {
            const updated = [...currentLinks];
            updated[index] = { ...updated[index], isEnabled: !updated[index].isEnabled };
            handleUpdateLinks(updated);
          };

          const handleLinkChange = (index: number, field: keyof SocialLink, val: any) => {
            const updated = [...currentLinks];
            updated[index] = { ...updated[index], [field]: val };
            handleUpdateLinks(updated, false);
          };

          const handleMoveLink = (index: number, direction: 'up' | 'down') => {
            if (direction === 'up' && index === 0) return;
            if (direction === 'down' && index === currentLinks.length - 1) return;
            const updated = [...currentLinks];
            const targetIdx = direction === 'up' ? index - 1 : index + 1;
            const temp = updated[index];
            updated[index] = updated[targetIdx];
            updated[targetIdx] = temp;
            handleUpdateLinks(updated, true);
          };

          const handleDeleteLink = (index: number) => {
            const updated = currentLinks.filter((_, i) => i !== index);
            handleUpdateLinks(updated, true);
          };

          const handleAddCustom = (platform = 'custom', name = 'Outro Canal') => {
            const newLink: SocialLink = {
              id: `link-${Date.now()}`,
              platform,
              name,
              url: '',
              handle: '',
              isEnabled: true,
            };
            handleUpdateLinks([...currentLinks, newLink], true);
          };

          const handleResetDefaults = () => {
            handleUpdateLinks(defaultPlatformList, true);
          };

          const handleDisableEmpty = () => {
            const updated = currentLinks.map((l) => ({
              ...l,
              isEnabled: Boolean(l.url && l.url.trim().length > 0),
            }));
            handleUpdateLinks(updated, true);
          };

          const getPlatformMeta = (platform: string) => {
            switch (platform.toLowerCase()) {
              case 'instagram':
                return {
                  label: 'Instagram',
                  icon: <Instagram className="w-4 h-4 text-white" />,
                  bg: 'bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600',
                  placeholder: 'https://instagram.com/seuperfil',
                  handlePlaceholder: '@seuperfil',
                };
              case 'facebook':
                return {
                  label: 'Facebook',
                  icon: <Facebook className="w-4 h-4 text-white" />,
                  bg: 'bg-[#1877F2]',
                  placeholder: 'https://facebook.com/suapagina',
                  handlePlaceholder: 'facebook.com/suapagina',
                };
              case 'whatsapp':
                return {
                  label: 'WhatsApp',
                  icon: <MessageCircle className="w-4 h-4 text-white" />,
                  bg: 'bg-[#25D366]',
                  placeholder: 'https://wa.me/5511999999999 ou seu link',
                  handlePlaceholder: '(11) 99999-9999',
                };
              case 'tiktok':
                return {
                  label: 'TikTok',
                  icon: (
                    <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24">
                      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.16 1.18 2.09 2.35 2.3 1.05.2 2.16-.08 2.94-.78.71-.62 1.08-1.54 1.11-2.48.04-3.51.01-7.03.02-10.55V0c-.01.01-.02.01-.02.02z" />
                    </svg>
                  ),
                  bg: 'bg-black',
                  placeholder: 'https://tiktok.com/@seuperfil',
                  handlePlaceholder: '@seuperfil',
                };
              case 'youtube':
                return {
                  label: 'YouTube',
                  icon: <Youtube className="w-4 h-4 text-white" />,
                  bg: 'bg-[#FF0000]',
                  placeholder: 'https://youtube.com/@seucanal',
                  handlePlaceholder: '@seucanal',
                };
              case 'linkedin':
                return {
                  label: 'LinkedIn',
                  icon: <Linkedin className="w-4 h-4 text-white" />,
                  bg: 'bg-[#0A66C2]',
                  placeholder: 'https://linkedin.com/company/suaempresa',
                  handlePlaceholder: 'in/suaempresa',
                };
              case 'twitter':
              case 'x':
                return {
                  label: 'X / Twitter',
                  icon: <Twitter className="w-4 h-4 text-white" />,
                  bg: 'bg-black',
                  placeholder: 'https://x.com/seuperfil',
                  handlePlaceholder: '@seuperfil',
                };
              case 'telegram':
                return {
                  label: 'Telegram',
                  icon: <Send className="w-4 h-4 text-white" />,
                  bg: 'bg-[#229ED9]',
                  placeholder: 'https://t.me/seucanal',
                  handlePlaceholder: '@seucanal',
                };
              default:
                return {
                  label: 'Link / Site',
                  icon: <Globe className="w-4 h-4 text-white" />,
                  bg: 'bg-indigo-600',
                  placeholder: 'https://seusite.com.br',
                  handlePlaceholder: 'Meu Link',
                };
            }
          };

          return (
            <div className="space-y-4">
              {/* Header Box */}
              <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100 space-y-1">
                <div className="flex items-center gap-2 text-indigo-950 font-bold text-xs">
                  <Share2 className="w-4 h-4 text-indigo-600" />
                  <span>Links & Perfis das Redes Sociais</span>
                </div>
                <p className="text-[11px] text-indigo-900/80 leading-relaxed">
                  Insira o link dos seus perfis oficiais. Ative apenas as redes que você utiliza para que os clientes cliquem e sigam sua empresa.
                </p>
              </div>

              {/* Title & Subtitle */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Título da Seção</label>
                <input
                  type="text"
                  placeholder="Ex: Siga Nossas Redes"
                  value={settings.title || ''}
                  onChange={(e) => updateField('title', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Subtítulo (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Acompanhe novidades, promoções e conteúdos exclusivos"
                  value={settings.subtitle || ''}
                  onChange={(e) => updateField('subtitle', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500"
                />
              </div>

              {/* Layout Style */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 text-xs">Estilo Visual de Exibição</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'cards', label: 'Cartões Modernos', desc: 'Destaque com cores oficiais' },
                    { id: 'pills', label: 'Pílulas Elegantes', desc: 'Botões com ícone + nome' },
                    { id: 'icons', label: 'Ícones Circulares', desc: 'Grade centralizada' },
                    { id: 'minimal', label: 'Minimalista', desc: 'Links limpos e discretos' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => updateField('layout', st.id, true)}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        (settings.layout || 'cards') === st.id
                          ? 'border-indigo-600 bg-indigo-50/60 text-indigo-950 font-bold ring-2 ring-indigo-500/20'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="font-bold">{st.label}</div>
                      <div className="text-[10px] text-slate-500">{st.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Behavior Settings */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Abrir links em nova aba</span>
                  <span className="text-[10px] text-slate-500">Mantém seu site aberto ao clicar</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.openInNewTab !== false}
                  onChange={(e) => updateField('openInNewTab', e.target.checked, true)}
                  className="w-4 h-4 text-indigo-600 rounded-sm"
                />
              </div>

              {/* Action Buttons for Presets */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-indigo-600" />
                  Canais e Links Cadastrados ({currentLinks.filter((l) => l.isEnabled).length} ativos)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleDisableEmpty}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                    title="Desativa qualquer canal sem link preenchido"
                  >
                    Desativar Vazios
                  </button>
                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                    title="Restaurar lista de canais principais"
                  >
                    Restaurar
                  </button>
                </div>
              </div>

              {/* List of Social Links */}
              <div className="space-y-3">
                {currentLinks.map((link, idx) => {
                  const meta = getPlatformMeta(link.platform);
                  const isLinkActive = link.isEnabled;
                  const hasUrl = Boolean(link.url && link.url.trim().length > 0);

                  return (
                    <div
                      key={link.id || `${link.platform}-${idx}`}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isLinkActive
                          ? 'bg-white border-slate-200 shadow-xs'
                          : 'bg-slate-50 border-dashed border-slate-200 opacity-70'
                      }`}
                    >
                      {/* Top Bar: Icon, Name, Switch & Controls */}
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center shadow-xs shrink-0`}>
                            {meta.icon}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-900 block">
                              {link.name || meta.label}
                            </span>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                              {link.platform}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          {/* Reorder Buttons */}
                          <button
                            type="button"
                            onClick={() => handleMoveLink(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                            title="Mover para cima"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveLink(idx, 'down')}
                            disabled={idx === currentLinks.length - 1}
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                            title="Mover para baixo"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Link (if custom or extra) */}
                          <button
                            type="button"
                            onClick={() => handleDeleteLink(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                            title="Remover este canal"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Toggle Switch */}
                          <label className="relative inline-flex items-center cursor-pointer ml-1">
                            <input
                              type="checkbox"
                              checked={isLinkActive}
                              onChange={() => handleToggleLink(idx)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:width-4 after:transition-all peer-checked:bg-emerald-600"></div>
                          </label>
                        </div>
                      </div>

                      {/* Inputs */}
                      <div className="space-y-2 pt-1 border-t border-slate-100">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-[11px] font-bold text-slate-700">
                              Link / URL Oficial *
                            </label>
                            {hasUrl && (
                              <a
                                href={link.url.startsWith('http') || link.url.startsWith('tel:') || link.url.startsWith('mailto:') ? link.url : `https://${link.url}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-0.5 cursor-pointer"
                                title="Abrir link para testar"
                              >
                                <span>Testar</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder={meta.placeholder}
                              value={link.url || ''}
                              onChange={(e) => handleLinkChange(idx, 'url', e.target.value)}
                              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500 font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                              Usuário / @Handle (Opcional)
                            </label>
                            <input
                              type="text"
                              placeholder={meta.handlePlaceholder}
                              value={link.handle || ''}
                              onChange={(e) => handleLinkChange(idx, 'handle', e.target.value)}
                              className="w-full px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                              Rótulo de Exibição
                            </label>
                            <input
                              type="text"
                              placeholder={meta.label}
                              value={link.name || ''}
                              onChange={(e) => handleLinkChange(idx, 'name', e.target.value)}
                              className="w-full px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Custom / Extra Platform Dropdown */}
              <div className="pt-2">
                <span className="block text-[11px] font-bold text-slate-700 mb-2">
                  + Adicionar Outra Rede Social ou Link
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: 'telegram', label: 'Telegram' },
                    { key: 'x', label: 'X / Twitter' },
                    { key: 'custom', label: 'Site / Blog' },
                    { key: 'threads', label: 'Threads' },
                    { key: 'pinterest', label: 'Pinterest' },
                    { key: 'spotify', label: 'Spotify' },
                  ].map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => handleAddCustom(p.key, p.label)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Plus className="w-3 h-3 text-indigo-600" />
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* WHATSAPP BLOCK */}
        {section.type === 'whatsapp' && (
          <>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Título de Chamada</label>
              <input
                type="text"
                value={settings.title || ''}
                onChange={(e) => updateField('title', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Número de WhatsApp</label>
              <input
                type="text"
                placeholder="Ex: 11987654321"
                value={settings.phone || ''}
                onChange={(e) => updateField('phone', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Mensagem Inicial Pré-definida</label>
              <textarea
                rows={2}
                value={settings.initialMessage || ''}
                onChange={(e) => updateField('initialMessage', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Texto do Botão</label>
              <input
                type="text"
                value={settings.buttonText || 'Conversar no WhatsApp'}
                onChange={(e) => updateField('buttonText', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          </>
        )}

        {/* BUSINESS HOURS */}
        {section.type === 'business_hours' && (
          <>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Título</label>
              <input
                type="text"
                value={settings.title || ''}
                onChange={(e) => updateField('title', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <label className="block font-bold text-slate-700">Horários Semanais</label>
              {['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map((dayKey) => {
                const dayLabels: Record<string, string> = {
                  seg: 'Segunda-feira',
                  ter: 'Terça-feira',
                  qua: 'Quarta-feira',
                  qui: 'Quinta-feira',
                  sex: 'Sexta-feira',
                  sab: 'Sábado',
                  dom: 'Domingo',
                };
                const day = settings.schedule?.[dayKey] || { isOpen: true, openTime: '08:00', closeTime: '18:00' };

                return (
                  <div key={dayKey} className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 w-24 shrink-0">{dayLabels[dayKey]}</span>
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={day.isOpen}
                        onChange={(e) => {
                          const newSched = { ...settings.schedule };
                          newSched[dayKey] = { ...day, isOpen: e.target.checked };
                          updateField('schedule', newSched);
                        }}
                        className="rounded-sm text-indigo-600"
                      />
                      Aberto
                    </label>
                    {day.isOpen ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="time"
                          value={day.openTime || '08:00'}
                          onChange={(e) => {
                            const newSched = { ...settings.schedule };
                            newSched[dayKey] = { ...day, openTime: e.target.value };
                            updateField('schedule', newSched);
                          }}
                          className="px-1.5 py-1 bg-white border border-slate-200 rounded-md text-[11px]"
                        />
                        <span className="text-slate-400">às</span>
                        <input
                          type="time"
                          value={day.closeTime || '18:00'}
                          onChange={(e) => {
                            const newSched = { ...settings.schedule };
                            newSched[dayKey] = { ...day, closeTime: e.target.value };
                            updateField('schedule', newSched);
                          }}
                          className="px-1.5 py-1 bg-white border border-slate-200 rounded-md text-[11px]"
                        />
                      </div>
                    ) : (
                      <span className="text-[11px] text-rose-500 font-semibold">Fechado</span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* LOCATION & GOOGLE MAPS */}
        {(section.type === 'location' || section.type === 'google_maps') && (() => {
          const addr = settings.address || {
            street: '',
            number: '',
            neighborhood: '',
            city: '',
            state: '',
            zip: '',
            complement: '',
            landmark: '',
          };

          const BRAZIL_STATES = [
            'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
            'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
            'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
          ];

          return (
            <>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Título da Seção</label>
                <input
                  type="text"
                  value={settings.title || ''}
                  onChange={(e) => updateField('title', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  placeholder="Ex: Onde Estamos"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Subtítulo / Descrição</label>
                <input
                  type="text"
                  value={settings.subtitle || ''}
                  onChange={(e) => updateField('subtitle', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  placeholder="Ex: Venha nos visitar ou trace a rota pelo seu aplicativo"
                />
              </div>

              {section.type === 'location' && (
                <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs block">Endereço da Loja / Estabelecimento</span>
                    <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-md">Brasil</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Rua / Avenida</label>
                      <input
                        type="text"
                        placeholder="Ex: Av. Paulista"
                        value={addr.street || ''}
                        onChange={(e) =>
                          updateField('address', { ...addr, street: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Número</label>
                      <input
                        type="text"
                        placeholder="Ex: 1000"
                        value={addr.number || ''}
                        onChange={(e) =>
                          updateField('address', { ...addr, number: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Bairro</label>
                      <input
                        type="text"
                        placeholder="Ex: Bela Vista"
                        value={addr.neighborhood || ''}
                        onChange={(e) =>
                          updateField('address', { ...addr, neighborhood: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">CEP</label>
                      <input
                        type="text"
                        placeholder="00000-000"
                        value={addr.zip || ''}
                        onChange={(e) =>
                          updateField('address', { ...addr, zip: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Cidade</label>
                      <input
                        type="text"
                        placeholder="Ex: São Paulo"
                        value={addr.city || ''}
                        onChange={(e) =>
                          updateField('address', { ...addr, city: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Estado (UF)</label>
                      <select
                        value={addr.state ? addr.state.toUpperCase() : ''}
                        onChange={(e) =>
                          updateField('address', { ...addr, state: e.target.value.toUpperCase() })
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold uppercase"
                      >
                        <option value="">UF</option>
                        {BRAZIL_STATES.map((uf) => (
                          <option key={uf} value={uf}>
                            {uf}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Complemento (opcional)</label>
                      <input
                        type="text"
                        placeholder="Ex: Sala 102, Bloco B"
                        value={addr.complement || ''}
                        onChange={(e) =>
                          updateField('address', { ...addr, complement: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Ponto de Referência (opcional)</label>
                      <input
                        type="text"
                        placeholder="Ex: Próximo ao Metrô"
                        value={addr.landmark || ''}
                        onChange={(e) =>
                          updateField('address', { ...addr, landmark: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.showDirectionsButton !== false}
                        onChange={(e) => updateField('showDirectionsButton', e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      <span>Exibir botão "Como Chegar" com rota no Google Maps e Waze</span>
                    </label>
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* GOOGLE REVIEWS */}
        {section.type === 'google_reviews' && (() => {
          const reviews: Array<{
            id?: string;
            author: string;
            stars: number;
            comment: string;
            date: string;
            avatarUrl?: string;
            ownerResponse?: string;
          }> = Array.isArray(settings.featuredReviews) ? settings.featuredReviews : [];

          const handleAddReview = () => {
            const newRev = {
              id: `rev-${Date.now()}`,
              author: 'Novo Cliente',
              stars: 5,
              date: 'Recente',
              comment: 'Excelente atendimento e qualidade impecável!',
              avatarUrl: '',
              ownerResponse: '',
            };
            updateField('featuredReviews', [newRev, ...reviews], true);
          };

          const handleUpdateReview = (index: number, field: string, val: any) => {
            const updated = [...reviews];
            updated[index] = { ...updated[index], [field]: val };
            updateField('featuredReviews', updated);
          };

          const handleDeleteReview = (index: number) => {
            const updated = reviews.filter((_, i) => i !== index);
            updateField('featuredReviews', updated, true);
          };

          const handleMoveReview = (index: number, direction: 'up' | 'down') => {
            if (direction === 'up' && index === 0) return;
            if (direction === 'down' && index === reviews.length - 1) return;
            const updated = [...reviews];
            const targetIdx = direction === 'up' ? index - 1 : index + 1;
            const temp = updated[index];
            updated[index] = updated[targetIdx];
            updated[targetIdx] = temp;
            updateField('featuredReviews', updated, true);
          };

          const handleClearFakes = () => {
            updateField('featuredReviews', [], true);
          };

          const handleLoadExamples = () => {
            updateField('featuredReviews', [
              {
                id: `rev-${Date.now()}-1`,
                author: 'Carlos Alberto',
                stars: 5,
                date: 'Há 3 dias',
                comment: 'Sensacional! Comida no ponto perfeito e entrega muito rápida. Recomendo de olhos fechados!',
                ownerResponse: 'Muito obrigado pela preferência, Carlos! Volte sempre.',
              },
              {
                id: `rev-${Date.now()}-2`,
                author: 'Juliana Martins',
                stars: 5,
                date: 'Há 1 semana',
                comment: 'Ambiente aconchegante, atendimento nota 10 e tudo fresco de verdade.',
              },
            ], true);
          };

          return (
            <div className="space-y-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Título da Seção</label>
                <input
                  type="text"
                  placeholder="Ex: O que nossos clientes dizem no Google"
                  value={settings.title || ''}
                  onChange={(e) => updateField('title', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Subtítulo (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Avaliações autênticas do Google Meu Negócio"
                  value={settings.subtitle || ''}
                  onChange={(e) => updateField('subtitle', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nota Geral (Estrelas)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="5"
                    value={settings.rating || 5}
                    onChange={(e) => updateField('rating', parseFloat(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Total de Avaliações</label>
                  <input
                    type="number"
                    value={settings.reviewsCount || 100}
                    onChange={(e) => updateField('reviewsCount', parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Link do seu Perfil no Google</label>
                <input
                  type="text"
                  placeholder="https://search.google.com/local/writereview... ou link do Google Maps"
                  value={settings.googleReviewUrl || ''}
                  onChange={(e) => updateField('googleReviewUrl', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Insira o link onde seus clientes podem abrir seu perfil do Google ou deixar uma nova avaliação.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Texto do Botão do Google</label>
                <input
                  type="text"
                  placeholder="Ex: Ver Avaliações no Google ou Avaliar Loja"
                  value={settings.buttonText || ''}
                  onChange={(e) => updateField('buttonText', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                />
              </div>

              {/* GESTOR DE AVALIAÇÕES REAIS DO GOOGLE */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                      Avaliações Reais do Google ({reviews.length})
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Preencha com depoimentos reais deixados no Google
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {reviews.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearFakes}
                        className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-[10px] font-bold border border-rose-200 cursor-pointer transition-colors"
                        title="Limpar avaliações fictícias e deixar apenas as suas reais"
                      >
                        Limpar Todas
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleAddReview}
                      className="px-2.5 py-1 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Nova Avaliação
                    </button>
                  </div>
                </div>

                {reviews.length === 0 ? (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/80 text-center space-y-2">
                    <p className="text-xs text-amber-800 font-medium">
                      Nenhuma avaliação cadastrada no momento. Sem avaliações fakes!
                    </p>
                    <p className="text-[11px] text-amber-700">
                      A seção exibirá apenas o selo geral com a nota e o botão para avaliar no Google, ou você pode adicionar suas avaliações reais agora:
                    </p>
                    <div className="flex justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleAddReview}
                        className="px-3 py-1.5 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 cursor-pointer"
                      >
                        + Adicionar Avaliação Real do Google
                      </button>
                      <button
                        type="button"
                        onClick={handleLoadExamples}
                        className="px-3 py-1.5 bg-white text-amber-800 border border-amber-300 rounded-xl text-xs font-semibold hover:bg-amber-100/50 cursor-pointer"
                      >
                        Exemplos para editar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reviews.map((rev, idx) => (
                      <div
                        key={rev.id || idx}
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 shadow-xs transition-all"
                      >
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-bold text-slate-800 truncate max-w-[130px]">
                              {rev.author || 'Sem Nome'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            {idx > 0 && (
                              <button
                                type="button"
                                onClick={() => handleMoveReview(idx, 'up')}
                                className="p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                                title="Mover para cima"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {idx < reviews.length - 1 && (
                              <button
                                type="button"
                                onClick={() => handleMoveReview(idx, 'down')}
                                className="p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                                title="Mover para baixo"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteReview(idx)}
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer transition-colors"
                              title="Excluir avaliação"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Autor e Data */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              Nome do Cliente
                            </label>
                            <input
                              type="text"
                              placeholder="Ex: Carlos Silva"
                              value={rev.author || ''}
                              onChange={(e) => handleUpdateReview(idx, 'author', e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              Data / Período
                            </label>
                            <input
                              type="text"
                              placeholder="Ex: Há 3 dias, 12/04/2024"
                              value={rev.date || ''}
                              onChange={(e) => handleUpdateReview(idx, 'date', e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                            />
                          </div>
                        </div>

                        {/* Estrelas */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Nota em Estrelas ({rev.stars || 5} de 5)
                          </label>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((starNum) => (
                              <button
                                key={starNum}
                                type="button"
                                onClick={() => handleUpdateReview(idx, 'stars', starNum)}
                                className={`p-1 rounded-md transition-transform hover:scale-110 cursor-pointer ${
                                  starNum <= (rev.stars || 5)
                                    ? 'text-amber-500'
                                    : 'text-slate-300'
                                }`}
                              >
                                <Star
                                  className={`w-4 h-4 ${
                                    starNum <= (rev.stars || 5) ? 'fill-current' : ''
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Comentário Real */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            Comentário Real do Cliente no Google
                          </label>
                          <textarea
                            rows={2}
                            placeholder="Copie o depoimento real deixado no Google pelo seu cliente..."
                            value={rev.comment || ''}
                            onChange={(e) => handleUpdateReview(idx, 'comment', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                          />
                        </div>

                        {/* Foto / Avatar do Cliente (Opcional) */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            Foto / Avatar do Cliente (URL Opcional)
                          </label>
                          <input
                            type="text"
                            placeholder="https://... (deixe vazio para usar a inicial colorida estilo Google)"
                            value={rev.avatarUrl || ''}
                            onChange={(e) => handleUpdateReview(idx, 'avatarUrl', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-900"
                          />
                        </div>

                        {/* Resposta do Proprietário (Opcional) */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            Resposta da sua Empresa (Opcional)
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: Obrigado pelo feedback, Carlos! Volte sempre."
                            value={rev.ownerResponse || ''}
                            onChange={(e) => handleUpdateReview(idx, 'ownerResponse', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-900"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* FAQ BLOCK */}
        {section.type === 'faq' && (
          <>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Título da Seção</label>
              <input
                type="text"
                value={settings.title || ''}
                onChange={(e) => updateField('title', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700">Perguntas & Respostas</label>
                <button
                  type="button"
                  onClick={() => {
                    const newItems = [
                      ...(settings.items || []),
                      { id: `faq-${Date.now()}`, question: 'Nova pergunta?', answer: 'Resposta explicativa...', isEnabled: true },
                    ];
                    updateField('items', newItems);
                  }}
                  className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[11px] font-bold hover:bg-indigo-100 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  Adicionar Pergunta
                </button>
              </div>

              {(settings.items || []).map((faq: any, idx: number) => (
                <div key={faq.id || idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 relative group">
                  <input
                    type="text"
                    placeholder="Pergunta"
                    value={faq.question || ''}
                    onChange={(e) => {
                      const newItems = [...(settings.items || [])];
                      newItems[idx] = { ...newItems[idx], question: e.target.value };
                      updateField('items', newItems);
                    }}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold"
                  />
                  <textarea
                    rows={2}
                    placeholder="Resposta"
                    value={faq.answer || ''}
                    onChange={(e) => {
                      const newItems = [...(settings.items || [])];
                      newItems[idx] = { ...newItems[idx], answer: e.target.value };
                      updateField('items', newItems);
                    }}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newItems = (settings.items || []).filter((_: any, i: number) => i !== idx);
                      updateField('items', newItems);
                    }}
                    className="text-rose-500 hover:text-rose-700 text-[10px] font-semibold cursor-pointer block text-right"
                  >
                    Excluir esta pergunta
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* TEAM BLOCK */}
        {section.type === 'team' && (
          <>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Título da Equipe</label>
              <input
                type="text"
                value={settings.title || ''}
                onChange={(e) => updateField('title', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700">Membros da Equipe</label>
                <button
                  type="button"
                  onClick={() => {
                    const newMembers = [
                      ...(settings.members || []),
                      { id: `tm-${Date.now()}`, name: 'Nome do Profissional', role: 'Cargo/Função', bio: '' },
                    ];
                    updateField('members', newMembers);
                  }}
                  className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[11px] font-bold hover:bg-indigo-100 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  Adicionar Membro
                </button>
              </div>

              {(settings.members || []).map((m: any, idx: number) => (
                <div key={m.id || idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Nome"
                      value={m.name || ''}
                      onChange={(e) => {
                        const newMembers = [...(settings.members || [])];
                        newMembers[idx] = { ...newMembers[idx], name: e.target.value };
                        updateField('members', newMembers);
                      }}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold"
                    />
                    <input
                      type="text"
                      placeholder="Cargo/Especialidade"
                      value={m.role || ''}
                      onChange={(e) => {
                        const newMembers = [...(settings.members || [])];
                        newMembers[idx] = { ...newMembers[idx], role: e.target.value };
                        updateField('members', newMembers);
                      }}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                  <ImageUpload
                    label="Foto do Colaborador"
                    value={m.photo || ''}
                    onChange={(url) => {
                      const newMembers = [...(settings.members || [])];
                      newMembers[idx] = { ...newMembers[idx], photo: url };
                      updateField('members', newMembers);
                    }}
                    subfolder="team"
                    aspectRatio="square"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newMembers = (settings.members || []).filter((_: any, i: number) => i !== idx);
                      updateField('members', newMembers);
                    }}
                    className="text-rose-500 hover:text-rose-700 text-[10px] font-semibold cursor-pointer block text-right"
                  >
                    Excluir membro
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* CTA BLOCK */}
        {section.type === 'cta' && (
          <>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Selo / Tagline (Ex: [ EXPERIÊNCIA COMPLETA ])</label>
              <input
                type="text"
                value={settings.tagline || ''}
                onChange={(e) => updateField('tagline', e.target.value)}
                placeholder="Ex: [ EXPERIÊNCIA COMPLETA ]"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Título Chamativo</label>
              <input
                type="text"
                value={settings.title || ''}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Ex: Garanta sua Mesa com Antecedência"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Descrição</label>
              <textarea
                rows={2}
                value={settings.description || ''}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Ex: Para aniversários, almoços executivos ou jantares a dois..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Texto do Botão Principal</label>
                <input
                  type="text"
                  value={settings.buttonText || ''}
                  onChange={(e) => updateField('buttonText', e.target.value)}
                  placeholder="Ex: Solicitar Reserva"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Destino (URL ou #seção)</label>
                <input
                  type="text"
                  value={settings.buttonUrl || ''}
                  onChange={(e) => updateField('buttonUrl', e.target.value)}
                  placeholder="Ex: #contato"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Texto do Botão Secundário</label>
                <input
                  type="text"
                  value={settings.secondaryButtonText || ''}
                  onChange={(e) => updateField('secondaryButtonText', e.target.value)}
                  placeholder="Ex: Ver Cardápio"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">URL Botão Secundário</label>
                <input
                  type="text"
                  value={settings.secondaryButtonUrl || ''}
                  onChange={(e) => updateField('secondaryButtonUrl', e.target.value)}
                  placeholder="Ex: #cardapio"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
            </div>
          </>
        )}

        {/* FOOTER BLOCK */}
        {section.type === 'footer' && (
          <>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Texto Institucional Curto</label>
              <input
                type="text"
                value={settings.customText || ''}
                onChange={(e) => updateField('customText', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Texto de Copyright</label>
              <input
                type="text"
                value={settings.copyrightText || ''}
                onChange={(e) => updateField('copyrightText', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Exibir Redes Sociais no Rodapé</span>
                <span className="text-[10px] text-slate-500">Mostra os ícones das suas redes configuradas</span>
              </div>
              <input
                type="checkbox"
                checked={settings.showSocial !== false}
                onChange={(e) => updateField('showSocial', e.target.checked, true)}
                className="w-4 h-4 text-indigo-600 rounded-sm"
              />
            </div>
          </>
        )}

        {/* PRODUCTS BLOCK CONFIGURATION */}
        {section.type === 'products' && (
          <div className="space-y-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Título da Seção *</label>
              <input
                type="text"
                value={settings.title || ''}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Ex: Nossos Produtos, Vitrine de Destaques..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Subtítulo (opcional)</label>
              <input
                type="text"
                value={settings.subtitle || ''}
                onChange={(e) => updateField('subtitle', e.target.value)}
                placeholder="Ex: Conheça nossa seleção de itens exclusivos"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500"
              />
            </div>

            {/* Filter selection */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Quais produtos exibir?</label>
              <select
                value={settings.filterType || 'all'}
                onChange={(e) => updateField('filterType', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500"
              >
                <option value="all">Todos os produtos ativos</option>
                <option value="featured">Somente produtos marcados em destaque</option>
                <option value="category">Filtrar por uma categoria específica</option>
              </select>
            </div>

            {settings.filterType === 'category' && (
              <div>
                <label className="block font-bold text-slate-700 mb-1">Categoria Selecionada</label>
                {productCategories.length > 0 ? (
                  <select
                    value={settings.selectedCategoryId || ''}
                    onChange={(e) => updateField('selectedCategoryId', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500"
                  >
                    <option value="">Selecione uma categoria...</option>
                    {productCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="ID da categoria ou selecione pelo catálogo"
                    value={settings.selectedCategoryId || ''}
                    onChange={(e) => updateField('selectedCategoryId', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                  />
                )}
              </div>
            )}

            {/* Layout option */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Layout de Exibição</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'grid', label: 'Grade' },
                  { key: 'list', label: 'Lista' },
                  { key: 'carousel', label: 'Carrossel' },
                ].map((ly) => (
                  <button
                    key={ly.key}
                    type="button"
                    onClick={() => updateField('layout', ly.key)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer text-center ${
                      (settings.layout || 'grid') === ly.key
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {ly.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Image fit option */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Enquadramento das Fotos</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'contain', label: 'Sem Cortes (Inteira)' },
                  { key: 'cover', label: 'Preencher Quadro' },
                ].map((fitOpt) => (
                  <button
                    key={fitOpt.key}
                    type="button"
                    onClick={() => updateField('imageFit', fitOpt.key)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer text-center ${
                      (settings.imageFit || 'contain') === fitOpt.key
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {fitOpt.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {(settings.imageFit || 'contain') === 'contain'
                  ? 'Exibe a foto inteira sem cortar bordas ou detalhes do produto.'
                  : 'Preenche todo o espaço do card (pode recortar as bordas da foto).'}
              </p>
            </div>

            {/* Grid columns option (when grid is active) */}
            {(!settings.layout || settings.layout === 'grid') && (
              <div>
                <label className="block font-bold text-slate-700 mb-1">Colunas na Grade (Desktop)</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { cols: 2, label: '2 Colunas' },
                    { cols: 3, label: '3 Colunas' },
                    { cols: 4, label: '4 Colunas' },
                  ].map((colOpt) => (
                    <button
                      key={colOpt.cols}
                      type="button"
                      onClick={() => updateField('gridColumns', colOpt.cols)}
                      className={`py-1.5 px-2 rounded-xl text-xs font-semibold transition-all border cursor-pointer text-center ${
                        (settings.gridColumns || 4) === colOpt.cols
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {colOpt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Default sort */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Ordenação Padrão</label>
              <select
                value={settings.defaultSort || 'manual'}
                onChange={(e) => updateField('defaultSort', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500"
              >
                <option value="manual">Ordem configurada no módulo</option>
                <option value="recent">Mais recentes primeiro</option>
                <option value="price_asc">Menor preço primeiro</option>
                <option value="price_desc">Maior preço primeiro</option>
                <option value="name_asc">Nome alfabético (A - Z)</option>
                <option value="featured_first">Destaques no topo</option>
              </select>
            </div>

            {/* Max items */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Quantidade Máxima de Produtos</label>
              <input
                type="number"
                min="1"
                max="100"
                value={settings.maxItems || 12}
                onChange={(e) => updateField('maxItems', Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
              />
            </div>

            {/* Toggle checkboxes */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Opções de Exibição nos Cards
              </span>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showPrice !== false}
                  onChange={(e) => updateField('showPrice', e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                />
                <span className="font-semibold text-slate-800">Mostrar preços e ofertas</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showShortDesc !== false}
                  onChange={(e) => updateField('showShortDesc', e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                />
                <span className="font-semibold text-slate-800">Mostrar descrição curta</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showCategory !== false}
                  onChange={(e) => updateField('showCategory', e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                />
                <span className="font-semibold text-slate-800">Mostrar selo de categoria</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showOutOfStock !== false}
                  onChange={(e) => updateField('showOutOfStock', e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                />
                <span className="font-semibold text-slate-800">Exibir produtos esgotados (com aviso)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showSearch !== false}
                  onChange={(e) => updateField('showSearch', e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                />
                <span className="font-semibold text-slate-800">Habilitar campo de busca de produtos</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showCategoryFilter !== false}
                  onChange={(e) => updateField('showCategoryFilter', e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                />
                <span className="font-semibold text-slate-800">Habilitar abas de categorias</span>
              </label>
            </div>
          </div>
        )}

        {/* SERVICES CONFIGURATION */}
        {section.type === 'services' && (
          <div className="space-y-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Título da Seção *</label>
              <input
                type="text"
                value={settings.title || ''}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Ex: Nossos Serviços & Tratamentos"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Subtítulo (opcional)</label>
              <input
                type="text"
                value={settings.subtitle || ''}
                onChange={(e) => updateField('subtitle', e.target.value)}
                placeholder="Ex: Conheça nossos procedimentos e soluções personalizadas"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500"
              />
            </div>

            {/* Filter type */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Critério de Exibição</label>
              <select
                value={settings.filterType || 'all'}
                onChange={(e) => updateField('filterType', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500"
              >
                <option value="all">Exibir todos os serviços ativos</option>
                <option value="featured">Apenas serviços em destaque (⭐)</option>
                <option value="category">Filtrar por categoria específica</option>
              </select>
            </div>

            {/* Specific category selector */}
            {settings.filterType === 'category' && (
              <div>
                <label className="block font-bold text-slate-700 mb-1">Categoria Selecionada</label>
                <select
                  value={settings.selectedCategoryId || ''}
                  onChange={(e) => updateField('selectedCategoryId', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500"
                >
                  <option value="">Selecione uma categoria...</option>
                  {serviceCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Layout */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Disposição Visual (Layout)</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'grid', label: 'Grid de Cards' },
                  { id: 'list', label: 'Lista Horizontal' },
                ].map((lOpt) => (
                  <button
                    key={lOpt.id}
                    type="button"
                    onClick={() => updateField('layout', lOpt.id)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer text-center ${
                      (settings.layout || 'grid') === lOpt.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {lOpt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Max items */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Quantidade Máxima Exibida</label>
              <input
                type="number"
                min="1"
                max="50"
                value={settings.maxItems || 12}
                onChange={(e) => updateField('maxItems', Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
              />
            </div>

            {/* WhatsApp CTA text */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Texto do Botão WhatsApp</label>
              <input
                type="text"
                value={settings.buttonText || 'Consultar Disponibilidade'}
                onChange={(e) => updateField('buttonText', e.target.value)}
                placeholder="Ex: Consultar no WhatsApp, Solicitar Orçamento..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
              />
            </div>

            {/* Checkbox Options */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Elementos Visíveis
              </span>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showPrice !== false}
                  onChange={(e) => updateField('showPrice', e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                />
                <span className="font-semibold text-slate-800">Exibir preço do serviço</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showDuration !== false}
                  onChange={(e) => updateField('showDuration', e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                />
                <span className="font-semibold text-slate-800">Exibir duração estimada</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showProfessionals !== false}
                  onChange={(e) => updateField('showProfessionals', e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                />
                <span className="font-semibold text-slate-800">Exibir profissionais vinculados</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showCategoryTabs !== false}
                  onChange={(e) => updateField('showCategoryTabs', e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                />
                <span className="font-semibold text-slate-800">Habilitar abas de categorias</span>
              </label>
            </div>
          </div>
        )}

        {/* TEAM / PROFESSIONALS CONFIGURATION */}
        {section.type === 'team' && (
          <div className="space-y-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Título da Seção *</label>
              <input
                type="text"
                value={settings.title || ''}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Ex: Nossos Profissionais, Nossa Equipe..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Subtítulo (opcional)</label>
              <input
                type="text"
                value={settings.subtitle || ''}
                onChange={(e) => updateField('subtitle', e.target.value)}
                placeholder="Ex: Especialistas prontos para cuidar do seu atendimento"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Quantidade Máxima de Membros</label>
              <input
                type="number"
                min="1"
                max="30"
                value={settings.maxItems || 8}
                onChange={(e) => updateField('maxItems', Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Texto do Botão de Contato</label>
              <input
                type="text"
                value={settings.contactButtonText || 'Consultar Disponibilidade'}
                onChange={(e) => updateField('contactButtonText', e.target.value)}
                placeholder="Ex: Falar com a Equipe no WhatsApp"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
              />
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Opções dos Profissionais
              </span>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showBio !== false}
                  onChange={(e) => updateField('showBio', e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                />
                <span className="font-semibold text-slate-800">Mostrar biografia / apresentação</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showSpecialties !== false}
                  onChange={(e) => updateField('showSpecialties', e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                />
                <span className="font-semibold text-slate-800">Mostrar tags de especialidades</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showServices !== false}
                  onChange={(e) => updateField('showServices', e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                />
                <span className="font-semibold text-slate-800">Mostrar serviços que o profissional realiza</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
        <button
          type="button"
          onClick={handleClose}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
        >
          <Check className="w-4 h-4" />
          Concluir Edição
        </button>
      </div>
    </div>
  );
};
