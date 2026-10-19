import React from 'react';
import { Tenant } from '../../types/saas';
import { Sparkles, ShieldCheck, CheckCircle2, ArrowRight } from 'lucide-react';

interface ClientFeatureModuleViewProps {
  moduleName: string;
  moduleKey: string;
  tenant: Tenant;
  onGoHome: () => void;
}

export const ClientFeatureModuleView: React.FC<ClientFeatureModuleViewProps> = ({
  moduleName,
  moduleKey,
  tenant,
  onGoHome,
}) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="pb-2 border-b border-slate-200/60">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{moduleName}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Módulo integrado da empresa {tenant.name}
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/80 p-8 sm:p-12 shadow-xs text-center max-w-2xl mx-auto space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-inner">
          <Sparkles className="w-8 h-8" />
        </div>

        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-3">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Recurso Liberado pelo Super Admin
          </span>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Módulo {moduleName} Preparado
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-2 leading-relaxed">
            A permissão e chave técnica <code className="bg-slate-100 px-1.5 py-0.5 rounded text-indigo-600 font-mono text-xs">{moduleKey}</code> estão ativas e vinculadas exclusivamente ao seu <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono text-xs">{tenant.id}</code>.
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Este módulo receberá as telas operacionais na próxima etapa do roadmap da plataforma.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-left text-xs text-slate-600 space-y-2">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Garantia de Isolamento Multiempresa
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Mesmo na próxima etapa, todos os itens cadastrados neste módulo serão associados ao seu tenant e isolados de outros negócios da plataforma.
          </p>
        </div>

        <button
          onClick={onGoHome}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
        >
          Voltar ao Início
        </button>
      </div>
    </div>
  );
};
