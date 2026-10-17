import React, { useState } from 'react';
import {
  Settings,
  Globe,
  ShieldCheck,
  Server,
  Database,
  Lock,
  Layers,
  CheckCircle2,
  Cpu,
} from 'lucide-react';

export const PlatformSettingsView: React.FC = () => {
  const [baseDomain, setBaseDomain] = useState(() => {
    let domain = 'meudominio.com';
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('localhub_base_domain');
      if (saved) {
        domain = saved;
      } else {
        const host = window.location.host;
        if (host && !host.includes('localhost') && !host.includes('127.0.0.1') && !host.includes('run.app')) {
          domain = host;
        }
      }
    }
    return domain.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
  });
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = baseDomain.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
    setBaseDomain(clean);
    localStorage.setItem('localhub_base_domain', clean);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div className="pb-2 border-b border-slate-200/60">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Configurações da Plataforma</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Parâmetros do ecossistema SaaS, subdomínios dinâmicos e segurança multi-tenant.
        </p>
      </div>

      {saved && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          Configurações salvas com sucesso!
        </div>
      )}

      {/* Domain Settings */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-600" />
            Configuração de Domínio e Subdomínios
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Estrutura base para geração automática das URLs dinâmicas dos clientes.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4 max-w-xl">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Domínio Principal da Plataforma (Base Domain)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={baseDomain}
                onChange={(e) => setBaseDomain(e.target.value)}
                placeholder="meudominio.com"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer shrink-0"
              >
                Salvar
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Formato dos novos subdomínios: <span className="font-mono text-indigo-600">{'{slug}.'}{baseDomain}</span>
            </p>
          </div>
        </form>
      </div>

      {/* Multi-tenant Architecture Details */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            Estrutura de Segurança e Isolamento Multiempresa
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Padrões implementados nesta etapa inicial da arquitetura SaaS.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
            <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs">
              <Database className="w-4 h-4" />
              Tenant ID em Cada Registro
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Todos os dados, configurações de aparência e contas de usuários possuem o <code className="bg-slate-200/60 px-1 rounded text-slate-800">tenant_id</code> associado, impedindo contaminação entre empresas.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
            <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs">
              <Lock className="w-4 h-4" />
              Validação Rígida no Backend
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              O middleware <code className="bg-slate-200/60 px-1 rounded text-slate-800">requireTenantAccess</code> valida se o token autenticado tem permissão para manipular o tenant da rota, bloqueando acessos indevidos.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
            <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs">
              <Layers className="w-4 h-4" />
              Sistema de Feature Flags
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Recursos são herdados do plano mas podem ser customizados por empresa. O backend valida a feature ativa antes de autorizar rotas ou módulos futuros.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
