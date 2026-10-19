import React, { useState } from 'react';
import {
  X,
  Plus,
  Sparkles,
  Building2,
  Image,
  Video,
  Compass,
  Share2,
  MessageCircle,
  Clock,
  MapPin,
  Map,
  Star,
  HelpCircle,
  PhoneCall,
  Users,
  Megaphone,
  Layout,
  ShoppingBag,
  Briefcase,
  Search,
} from 'lucide-react';
import { BLOCK_REGISTRY, SECTION_CATEGORIES } from '../../constants/blockRegistry';
import { SectionCategory, SectionType } from '../../types/site';

interface AddSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSection: (type: SectionType) => void;
  existingSectionTypes: SectionType[];
}

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Sparkles,
  Building2,
  Image,
  Video,
  Compass,
  Share2,
  MessageCircle,
  Clock,
  MapPin,
  Map,
  Star,
  HelpCircle,
  PhoneCall,
  Users,
  Megaphone,
  Layout,
  ShoppingBag,
  Briefcase,
};

export const AddSectionModal: React.FC<AddSectionModalProps> = ({
  isOpen,
  onClose,
  onAddSection,
  existingSectionTypes,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<SectionCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const allSections = Object.values(BLOCK_REGISTRY);

  const filteredSections = allSections.filter((sec) => {
    const matchesCategory = selectedCategory === 'all' || sec.category === selectedCategory;
    const matchesSearch =
      sec.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sec.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Adicionar Seção à Página</h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Escolha uma seção pronta para enriquecer seu mini site.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-100 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-600 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar seção (ex: WhatsApp, Horários, Depoimentos...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-600 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer shrink-0 ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              Todas
            </button>
            {(Object.keys(SECTION_CATEGORIES) as SectionCategory[]).map((catKey) => {
              const cat = SECTION_CATEGORIES[catKey];
              return (
                <button
                  key={catKey}
                  onClick={() => setSelectedCategory(catKey)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer shrink-0 ${
                    selectedCategory === catKey
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section Cards Grid */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {filteredSections.length === 0 ? (
            <div className="text-center py-10 text-slate-600 text-xs">
              Nenhuma seção encontrada para a busca atual.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredSections.map((sec) => {
                const IconComponent = ICON_MAP[sec.iconName] || Plus;
                const isAlreadyPresent = sec.isSingleton && existingSectionTypes.includes(sec.type);

                return (
                  <button
                    key={sec.type}
                    disabled={isAlreadyPresent}
                    onClick={() => {
                      onAddSection(sec.type);
                      onClose();
                    }}
                    className={`text-left p-3.5 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer ${
                      isAlreadyPresent
                        ? 'border-slate-100 bg-slate-50/60 opacity-60 cursor-not-allowed'
                        : 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/20 hover:shadow-xs group'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        isAlreadyPresent
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-slate-100 text-slate-700 group-hover:bg-indigo-600 group-hover:text-white'
                      }`}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="text-xs font-bold text-slate-900 truncate">{sec.name}</h4>
                        {isAlreadyPresent ? (
                          <span className="text-[10px] font-semibold text-slate-600">Já adicionada</span>
                        ) : (
                          <Plus className="w-3.5 h-3.5 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5 leading-relaxed">
                        {sec.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
