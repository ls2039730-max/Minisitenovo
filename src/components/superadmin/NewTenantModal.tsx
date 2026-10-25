import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Plan, TenantStatus } from '../../types/saas';
import { getConfiguredBaseDomain, getTenantSubdomain, getPublicStoreUrl } from '../../utils/url';
import {
  X,
  Building2,
  User,
  Palette,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Check,
  AlertTriangle,
} from 'lucide-react';

interface NewTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (tenantId: string) => void;
  plans: Plan[];
}

export const NewTenantModal: React.FC<NewTenantModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  plans,
}) => {
  const baseDomain = React.useMemo(() => {
    return getConfiguredBaseDomain();
  }, []);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);

  const [segment, setSegment] = useState('Comércio & Serviços Locais');
  const [cnpj, setCnpj] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');

  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');

  const [planId, setPlanId] = useState(plans[0]?.id || '');
  const [status, setStatus] = useState<TenantStatus>('teste');

  // Synchronize planId when plans list is loaded
  useEffect(() => {
    if (plans.length > 0 && (!planId || !plans.some((p) => p.id === planId))) {
      setPlanId(plans[0].id);
    }
  }, [plans, planId]);

  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1e293b');
  const [secondaryColor, setSecondaryColor] = useState('#3b82f6');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate slug from name unless user manually modified slug
  useEffect(() => {
    if (!slugTouched && name) {
      const generated = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setSlug(generated);
    }
  }, [name, slugTouched]);

  // Check slug availability with debounce
  useEffect(() => {
    if (!slug) {
      setSlugAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      setSlugChecking(true);
      try {
        const res = await api.checkSlug(slug);
        setSlugAvailable(res.available);
      } catch {
        setSlugAvailable(null);
      } finally {
        setSlugChecking(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [slug]);

  if (!isOpen) return null;

  const handleSuggestSlug = () => {
    const randomSuffix = Math.floor(10 + Math.random() * 90);
    const base = slug.replace(/-\d+$/, '');
    setSlug(`${base}-${randomSuffix}`);
    setSlugTouched(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !email.trim() || !ownerName.trim() || !ownerEmail.trim()) {
      setError('Por favor, preencha todos os campos obrigatórios marcados com * (Nome, Slug, E-mail, Responsável).');
      return;
    }

    if (slugAvailable === false) {
      setError('O slug informado já pertence a outra empresa. Clique em "Sugerir outro" ou escolha outro identificador.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const activePlan = plans.find((p) => p.id === planId) || plans[0];
      const targetPlanId = activePlan?.id || planId;
      const cleanPhone = phone.trim() || whatsapp.trim() || '(11) 99999-0000';
      const cleanWhatsapp = whatsapp.trim() || cleanPhone;
      const cleanOwnerPhone = ownerPhone.trim() || cleanPhone;

      const res = await api.createTenant({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        subdomain: getTenantSubdomain(slug.trim().toLowerCase(), baseDomain),
        baseDomain,
        segment: segment.trim() || 'Comércio & Serviços Locais',
        cnpj: cnpj.trim(),
        phone: cleanPhone,
        whatsapp: cleanWhatsapp,
        email: email.trim().toLowerCase(),
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim().toLowerCase(),
        ownerPhone: cleanOwnerPhone,
        planId: targetPlanId,
        status,
        logoUrl,
        primaryColor,
        secondaryColor,
      });

      if (res && res.tenant && res.tenant.id) {
        onSuccess(res.tenant.id);
        onClose();
      } else {
        throw new Error('Empresa cadastrada, mas resposta não retornou os dados da empresa.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao cadastrar empresa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-2xl w-full my-8 overflow-hidden text-slate-800">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Cadastrar Nova Empresa</h2>
              <p className="text-xs text-slate-500">
                Criar tenant com isolamento multiempresa e acesso para o responsável
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Seção 1: Dados da Empresa */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-500" />
              1. Informações do Estabelecimento
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome da Empresa *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Barbearia Prime"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Slug / Subdomínio *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                      setSlugTouched(true);
                    }}
                    placeholder="barbearia-prime"
                    required
                    className="w-full pl-3.5 pr-28 py-2.5 rounded-xl border border-slate-200 font-mono text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs font-semibold">
                    {slugChecking && <span className="text-slate-400 text-[11px]">Verificando...</span>}
                    {!slugChecking && slugAvailable === true && (
                      <span className="text-emerald-600 flex items-center gap-1 text-[11px] bg-emerald-50 px-2 py-0.5 rounded-md">
                        <Check className="w-3 h-3" /> Disponível
                      </span>
                    )}
                    {!slugChecking && slugAvailable === false && (
                      <div className="flex items-center gap-1">
                        <span className="text-rose-600 flex items-center gap-0.5 text-[10px] bg-rose-50 px-1.5 py-0.5 rounded-md font-medium">
                          <AlertTriangle className="w-3 h-3" /> Em uso
                        </span>
                        <button
                          type="button"
                          onClick={handleSuggestSlug}
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded-md font-medium transition cursor-pointer"
                        >
                          Sugerir outro
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-[11px] text-slate-400 font-mono">
                    URL pública: <span className="text-indigo-600 font-semibold">{getPublicStoreUrl(slug || 'nome', { baseDomain })}</span>
                  </p>
                  {slugAvailable === false && (
                    <button
                      type="button"
                      onClick={handleSuggestSlug}
                      className="text-[11px] text-indigo-600 hover:underline font-semibold cursor-pointer"
                    >
                      Alterar para slug livre automaticamente
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Segmento de Atuação *
                </label>
                <input
                  type="text"
                  value={segment}
                  onChange={(e) => setSegment(e.target.value)}
                  placeholder="Ex: Salão, Restaurante, Farmácia"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  CNPJ (opcional)
                </label>
                <input
                  type="text"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  placeholder="00.000.000/0001-00"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Telefone Comercial *
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 3333-4444"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  WhatsApp Oficial *
                </label>
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="11999998888"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail da Empresa *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contato@empresa.com"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Seção 2: Responsável / Client Admin */}
          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-500" />
              2. Responsável pelo Negócio (CLIENT_ADMIN)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Responsável *
                </label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Nome completo do cliente"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail do Responsável *
                </label>
                <input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Senha inicial padrão gerada: <span className="font-mono text-slate-600">cliente123</span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Telefone do Responsável
                </label>
                <input
                  type="text"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  placeholder="(11) 98888-7777"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Seção 3: Plano e Status */}
          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              3. Plano e Contratação
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Plano Contratado *
                </label>
                <select
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} - R$ {p.price.toFixed(2)}/mês ({p.includedFeatures.length} recursos)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status Inicial *
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TenantStatus)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="teste">Teste (Em avaliação)</option>
                  <option value="ativo">Ativo (Liberado)</option>
                  <option value="pagamento_pendente">Pagamento Pendente</option>
                  <option value="atrasado">Atrasado</option>
                  <option value="suspenso">Suspenso</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
            </div>
          </div>

          {/* Seção 4: Identidade Visual Inicial */}
          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-indigo-500" />
              4. Identidade Visual Preliminar
            </h3>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Logotipo da Empresa
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://exemplo.com/logo.png ou faça upload"
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                <label className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0">
                  <span>Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = async () => {
                        const base64 = reader.result as string;
                        try {
                          const res = await api.uploadMedia(base64, file.name, file.type);
                          setLogoUrl(res.url);
                        } catch (err: any) {
                          setError('Erro no upload da logo: ' + err.message);
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cor Principal
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cor Secundária
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Botões do Formulário */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || slugAvailable === false}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-sm shadow-indigo-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Cadastrar Empresa
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
