import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ShieldAlert,
  ArrowRight,
  Layers,
  X,
} from 'lucide-react';
import { ProfessionalTemplate } from '../../../constants/professionalTemplates';
import { Tenant } from '../../../types/saas';

interface TemplateApplyConfirmModalProps {
  template: ProfessionalTemplate | null;
  tenant: Tenant;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (template: ProfessionalTemplate) => void;
}

export const TemplateApplyConfirmModal: React.FC<TemplateApplyConfirmModalProps> = ({
  template,
  tenant,
  isOpen,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !template) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                Confirmar Aplicação de Template
              </span>
              <h3 className="text-base font-extrabold text-slate-900 leading-snug">
                {template.name}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs text-slate-600">
          {/* Safe Draft Explanation Banner */}
          <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Proteção Total: Seu site público continua intacto!</span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              O template será aplicado exclusivamente ao seu <strong>rascunho interno</strong>. Nada será publicado na internet até que você revise os blocos no editor e clique deliberadamente em <strong>&quot;Publicar alterações&quot;</strong>.
            </p>
          </div>

          {/* What will be preserved */}
          <div className="space-y-2">
            <span className="font-bold text-slate-800 uppercase text-[10px] tracking-wider block">
              Seus dados que serão 100% preservados:
            </span>
            <ul className="space-y-1.5 text-[11px] text-slate-700">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span><strong>Nome & Marca:</strong> {tenant.name}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span><strong>WhatsApp & Contatos:</strong> Links e números cadastrados</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span><strong>Localização & Horários:</strong> Endereço e agenda de funcionamento</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span><strong>Produtos & Serviços:</strong> Catálogos cadastrados no seu sistema</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span><strong>Configurações de SEO:</strong> Títulos e metadados já otimizados</span>
              </li>
            </ul>
          </div>

          {/* What will be updated */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5 text-[11px]">
            <span className="font-bold text-slate-800 block">
              O que será atualizado no seu rascunho:
            </span>
            <p className="text-slate-600 leading-relaxed">
              A estrutura de blocos e o estilo visual serão ajustados para o padrão <strong>{template.styleName}</strong> ({template.categoryLabel}), trazendo a tipografia, cores e novas composições de seções. Você poderá alterar qualquer texto, trocar fotos ou reorganizar os blocos a qualquer momento.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            onClick={() => onConfirm(template)}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer hover:scale-102"
          >
            <Sparkles className="w-4 h-4" />
            <span>Confirmar e Aplicar ao Rascunho</span>
          </button>
        </div>
      </div>
    </div>
  );
};
