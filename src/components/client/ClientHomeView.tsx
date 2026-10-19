import React, { useState } from 'react';
import { Plan, Tenant } from '../../types/saas';
import { StatusBadge } from '../common/Badge';
import { SYSTEM_FEATURES, isFeatureActive } from '../../utils/features';
import { getPublicStoreUrl } from '../../utils/url';
import { useAuth } from '../../context/AuthContext';
import {
  Globe,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Palette,
  Building2,
  ExternalLink,
  ShieldCheck,
  Check,
  Copy,
} from 'lucide-react';

interface ClientHomeViewProps {
  tenant: Tenant;
  plans: Plan[];
  onNavigateTab: (tab: string) => void;
}

export const ClientHomeView: React.FC<ClientHomeViewProps> = ({
  tenant,
  plans,
  onNavigateTab,
}) => {
  const { resolvedFeatures } = useAuth();
  const currentPlan = plans.find((p) => p.id === tenant.planId);
  const [copied, setCopied] = useState(false);

  const publicUrl = getPublicStoreUrl(tenant.slug);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Count active features for this tenant using backend resolution
  const activeFeatures = SYSTEM_FEATURES.filter((f) =>
    resolvedFeatures && resolvedFeatures[f.key] !== undefined
      ? resolvedFeatures[f.key]
      : isFeatureActive(tenant, currentPlan, f.key)
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Welcome Card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center font-extrabold text-white text-xl shadow-md shrink-0"
            style={{ backgroundColor: tenant.appearance.primaryColor || '#1e293b' }}
          >
            {tenant.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{tenant.name}</h1>
              <StatusBadge status={tenant.status} />
            </div>
            <p className="text-xs text-slate-500 mt-1">{tenant.segment}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                {publicUrl}
              </span>
              <button
                onClick={handleCopyLink}
                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                <span>{copied ? 'Copiado!' : 'Copiar Link'}</span>
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Ver Site</span>
              </a>
            </div>
          </div>
        </div>

        <div className="flex sm:flex-col items-end justify-between sm:justify-center border-t sm:border-t-0 pt-4 sm:pt-0 border-slate-100">
          <span className="text-xs text-slate-400">Plano Atual:</span>
          <span className="text-sm font-extrabold text-slate-900 bg-slate-100 px-3 py-1 rounded-xl">
            {currentPlan?.name || 'Personalizado'}
          </span>
        </div>
      </div>

      {/* "Seu site está sendo configurado" Setup Card */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-radial from-indigo-500/20 to-transparent pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                <Clock className="w-3.5 h-3.5" />
                Implantação da Plataforma
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight mt-2">
                Seu site digital está sendo configurado
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
                A estrutura multi-tenant da sua empresa já está provisionada com isolamento e segurança. Você já pode personalizar a identidade visual da sua marca.
              </p>
            </div>

            <button
              onClick={() => onNavigateTab('appearance')}
              className="px-5 py-3 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs transition-transform active:scale-95 shadow-lg flex items-center gap-2 cursor-pointer self-start sm:self-auto shrink-0"
            >
              <Palette className="w-4 h-4 text-indigo-600" />
              Editar Aparência da Marca
            </button>
          </div>

          {/* Checklist */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-white/10">
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold block text-white">Empresa Cadastrada</span>
                <span className="text-[11px] text-slate-400 truncate block">Tenant ID gerado</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold block text-white">Subdomínio Vinculado</span>
                <span className="text-[11px] font-mono text-slate-400 truncate block">{tenant.subdomain}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold block text-white">Próximos Módulos</span>
                <span className="text-[11px] text-slate-400 truncate block">Fase 2 em preparação</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Features Section */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">Recursos Habilitados para sua Empresa</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Módulos liberados para {tenant.name} de acordo com o plano {currentPlan?.name || ''}
            </p>
          </div>
          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-xl border border-indigo-100 self-start sm:self-auto">
            {activeFeatures.length} recursos contratados
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {activeFeatures.map((feat) => (
            <div
              key={feat.key}
              className="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 flex items-start gap-3"
            >
              <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-xs text-slate-900">{feat.name}</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                  {feat.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
