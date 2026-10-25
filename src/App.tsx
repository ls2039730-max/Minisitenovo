import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginView } from './components/auth/LoginView';
import { SuperAdminLayout } from './components/superadmin/SuperAdminLayout';
import { DashboardOverview } from './components/superadmin/DashboardOverview';
import { TenantsList } from './components/superadmin/TenantsList';
import { TenantDetailView } from './components/superadmin/TenantDetailView';
import { PlansView } from './components/superadmin/PlansView';
import { UsersGlobalView } from './components/superadmin/UsersGlobalView';
import { PlatformSettingsView } from './components/superadmin/PlatformSettingsView';
import { NewTenantModal } from './components/superadmin/NewTenantModal';

import { ClientLayout } from './components/client/ClientLayout';
import { ClientHomeView } from './components/client/ClientHomeView';
import { ClientCompanyView } from './components/client/ClientCompanyView';
import { ClientAppearanceView } from './components/client/ClientAppearanceView';
import { ClientFeatureModuleView } from './components/client/ClientFeatureModuleView';
import { SiteManager } from './components/site/SiteManager';
import { ProductManager } from './components/products/ProductManager';
import { OrdersManager } from './components/orders/OrdersManager';
import { ServiceManager } from './components/services/ServiceManager';
import { ProfessionalManager } from './components/professionals/ProfessionalManager';
import { AppointmentManager } from './components/appointments/AppointmentManager';
import { PublicSiteView } from './components/site/public/PublicSiteView';
import { RestaurantManager } from './components/restaurant/RestaurantManager';
import { PublicTableCatalogView } from './components/restaurant/public/PublicTableCatalogView';
import { FinancialDashboardView } from './components/financial/FinancialDashboardView';

import { api } from './services/api';
import { Plan, Tenant, TenantStatus } from './types/saas';
import { SiteData } from './types/site';
import { isFeatureActive, isTenantFeatureEnabled } from './utils/features';
import { resolveSlugFromHostname } from './utils/url';
import { Building2, ArrowLeft, Loader2, AlertCircle, LogOut, ShieldCheck, RefreshCw } from 'lucide-react';

// Reserved paths that should never be treated as store slugs
const RESERVED_APP_PATHS = new Set([
  '',
  'api',
  'uploads',
  'assets',
  'login',
  'admin',
  'superadmin',
  'dashboard',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'index.html',
  'm',
  'mesa',
]);

export const CROSS_TENANT_BLOCKED_SENTINEL = '__cross_tenant_blocked__';

function getTenantSubdomainSlug(): string | null {
  if (typeof window === 'undefined') return null;
  return resolveSlugFromHostname(window.location.hostname);
}

// Helper to detect if user requested a public store/company page by slug
function getPublicSlugFromUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const subdomainSlug = getTenantSubdomainSlug();
  const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '');
  const pathParts = rawPath ? rawPath.split('/') : [];
  const firstSeg = (pathParts[0] || '').toLowerCase();

  // If accessed via a verified tenant subdomain (e.g. https://una-otica.minihub.tech)
  if (subdomainSlug) {
    // 1. Root path '/', '/p', '/p/', '/site', '/site/'
    if (!rawPath || firstSeg === 'p' || firstSeg === 'site') {
      const explicitPathSlug = pathParts[1]?.toLowerCase();
      // Cross-tenant protection: if a different store slug is explicitly specified in the path, block it
      if (explicitPathSlug && explicitPathSlug !== subdomainSlug) {
        return CROSS_TENANT_BLOCKED_SENTINEL;
      }
      return subdomainSlug;
    }

    // 2. If path is a single direct slug matching tenant: /una-otica
    if (firstSeg === subdomainSlug) {
      return subdomainSlug;
    }

    // 3. Any other explicit store slug on a tenant subdomain is blocked (prevents cross-tenant access)
    if (!RESERVED_APP_PATHS.has(firstSeg)) {
      return CROSS_TENANT_BLOCKED_SENTINEL;
    }

    return subdomainSlug;
  }

  // Standard / Legacy domain access (e.g. minisitenovo.vercel.app/p/:slug or minihub.tech/p/:slug)
  if (firstSeg === 'p' && pathParts[1]) {
    return pathParts[1].toLowerCase();
  }
  if (firstSeg === 'site' && pathParts[1]) {
    return pathParts[1].toLowerCase();
  }

  const params = new URLSearchParams(window.location.search);
  const qSlug = params.get('p') || params.get('slug') || params.get('site');
  if (qSlug) return qSlug.toLowerCase();

  // Direct slug (e.g. /costela-mania, /otica-inovence)
  if (pathParts.length === 1 && pathParts[0] && !RESERVED_APP_PATHS.has(pathParts[0].toLowerCase())) {
    if (!pathParts[0].includes('.')) {
      return pathParts[0].toLowerCase();
    }
  }

  return null;
}

// Helper to detect if user opened a table catalog via QR Code
function getTableParamsFromUrl(): { slug: string; token: string } | null {
  if (typeof window === 'undefined') return null;
  const subdomainSlug = getTenantSubdomainSlug();
  const params = new URLSearchParams(window.location.search);
  const tableToken = params.get('mesa') || params.get('t') || params.get('table');
  const querySlug = (params.get('r') || params.get('slug') || params.get('p'))?.toLowerCase();

  if (tableToken) {
    if (subdomainSlug) {
      // Cross-tenant protection on QR table URLs
      if (querySlug && querySlug !== subdomainSlug) {
        return null;
      }
      return { slug: subdomainSlug, token: tableToken };
    }
    if (querySlug) {
      return { slug: querySlug, token: tableToken };
    }
  }

  // Path check: /m/:slug/:token or /mesa/:slug/:token
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  const segments = path.split('/');
  if ((segments[0] === 'm' || segments[0] === 'mesa') && segments.length >= 3) {
    const pathSlug = segments[1].toLowerCase();
    if (subdomainSlug && pathSlug !== subdomainSlug) {
      return null;
    }
    return { slug: pathSlug, token: segments[2] };
  }

  return null;
}

const AppContent: React.FC = () => {
  const { user, tenant, loading, setTenant, resolvedFeatures, logout, refreshSession, isProfessional, linkedProfessional } = useAuth();

  // Public Table QR Code View State
  const [tableParams] = useState<{ slug: string; token: string } | null>(getTableParamsFromUrl());

  // Public site view state
  const [publicSlug, setPublicSlug] = useState<string | null>(getPublicSlugFromUrl());
  const [publicSiteData, setPublicSiteData] = useState<{
    loading: boolean;
    tenant: Tenant | null;
    site: SiteData | null;
    isPublished: boolean;
    error: string | null;
  } | null>(publicSlug ? { loading: true, tenant: null, site: null, isPublished: false, error: null } : null);

  // Super Admin Navigation State
  const [adminTab, setAdminTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('adminTab') || 'dashboard';
    }
    return 'dashboard';
  });
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('tenantId') || null;
    }
    return null;
  });
  const [isNewTenantModalOpen, setIsNewTenantModalOpen] = useState(false);

  // Client Navigation State
  const [clientTab, setClientTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('tab') || 'home';
    }
    return 'home';
  });

  // Shared Data
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Navigation handlers that push to browser history so 'Voltar' returns to previous page inside the app
  const navigateClientTab = (tab: string, replace = false) => {
    const targetTab = isProfessional ? 'appointments' : tab;
    setClientTab(targetTab);
    refreshSession();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('tab', targetTab);
      if (targetTab !== 'site') {
        params.delete('subTab');
      }
      params.delete('preview');
      params.delete('section');
      const newUrl = `?${params.toString()}`;
      if (replace) {
        window.history.replaceState({ role: user?.role || 'CLIENT', tab: targetTab }, '', newUrl);
      } else {
        window.history.pushState({ role: user?.role || 'CLIENT', tab: targetTab }, '', newUrl);
      }
    }
  };

  const navigateAdminTab = (tab: string, replace = false) => {
    setAdminTab(tab);
    setSelectedTenantId(null);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('adminTab', tab);
      params.delete('tenantId');
      const newUrl = `?${params.toString()}`;
      if (replace) {
        window.history.replaceState({ role: 'SUPER_ADMIN', adminTab: tab }, '', newUrl);
      } else {
        window.history.pushState({ role: 'SUPER_ADMIN', adminTab: tab }, '', newUrl);
      }
    }
  };

  const navigateSelectTenant = (id: string | null, replace = false) => {
    setSelectedTenantId(id);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('adminTab', 'tenants');
      if (id) {
        params.set('tenantId', id);
      } else {
        params.delete('tenantId');
      }
      const newUrl = `?${params.toString()}`;
      if (replace) {
        window.history.replaceState({ role: 'SUPER_ADMIN', adminTab: 'tenants', tenantId: id }, '', newUrl);
      } else {
        window.history.pushState({ role: 'SUPER_ADMIN', adminTab: 'tenants', tenantId: id }, '', newUrl);
      }
    }
  };

  const handleExitPublicSite = () => {
    const slug = getPublicSlugFromUrl();
    if (window.history.length > 1 && slug) {
      window.history.back();
    } else {
      window.history.pushState({}, '', '/');
      setPublicSlug(null);
    }
  };

  // Sync browser URL popstate for back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      // 1. Sync publicSlug
      const slug = getPublicSlugFromUrl();
      setPublicSlug(slug);

      // 2. Sync Client navigation
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (isProfessional) {
        setClientTab('appointments');
      } else if (tabParam) {
        setClientTab(tabParam);
      } else if (!slug && !params.get('adminTab')) {
        setClientTab('home');
      }

      // 3. Sync SuperAdmin navigation
      const adminParam = params.get('adminTab');
      if (adminParam) {
        setAdminTab(adminParam);
      }
      const tenantParam = params.get('tenantId');
      setSelectedTenantId(tenantParam || null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isProfessional]);

  // Ensure initial landing state is recorded in browser history & seeded so Back returns to root inside the app
  useEffect(() => {
    if (!user) return;

    if (isProfessional && clientTab !== 'appointments') {
      navigateClientTab('appointments', true);
    } else if (typeof window !== 'undefined' && (!window.history.state || window.history.state.isInitial)) {
      const params = new URLSearchParams(window.location.search);

      if (user.role !== 'SUPER_ADMIN' && !isProfessional) {
        const initialTab = params.get('tab') || 'home';
        if (initialTab !== 'home' && !publicSlug && !tableParams) {
          // Direct access or refresh on an internal tab: seed Home as baseline entry
          const homeParams = new URLSearchParams(window.location.search);
          homeParams.set('tab', 'home');
          homeParams.delete('subTab');
          homeParams.delete('preview');
          homeParams.delete('section');
          homeParams.delete('restaurantTab');
          homeParams.delete('ordersTab');
          const homeUrl = `?${homeParams.toString()}`;
          window.history.replaceState(
            { role: 'CLIENT', tab: 'home', isRoot: true },
            '',
            homeUrl
          );
          window.history.pushState(
            { role: 'CLIENT', tab: initialTab, isDirectLanding: true },
            '',
            window.location.href
          );
        } else {
          window.history.replaceState(
            { role: 'CLIENT', tab: 'home', isRoot: true },
            '',
            window.location.href
          );
        }
      } else if (user.role === 'SUPER_ADMIN') {
        const initialAdminTab = params.get('adminTab') || 'dashboard';
        const initialTenantId = params.get('tenantId');
        if (initialTenantId) {
          // Direct access to tenant detail: seed dashboard -> tenants -> detail
          window.history.replaceState(
            { role: 'SUPER_ADMIN', adminTab: 'dashboard', isRoot: true },
            '',
            '?adminTab=dashboard'
          );
          window.history.pushState(
            { role: 'SUPER_ADMIN', adminTab: 'tenants' },
            '',
            '?adminTab=tenants'
          );
          window.history.pushState(
            { role: 'SUPER_ADMIN', adminTab: 'tenants', tenantId: initialTenantId, isDirectLanding: true },
            '',
            window.location.href
          );
        } else if (initialAdminTab !== 'dashboard') {
          // Direct access to an admin tab: seed dashboard as baseline
          window.history.replaceState(
            { role: 'SUPER_ADMIN', adminTab: 'dashboard', isRoot: true },
            '',
            '?adminTab=dashboard'
          );
          window.history.pushState(
            { role: 'SUPER_ADMIN', adminTab: initialAdminTab, isDirectLanding: true },
            '',
            window.location.href
          );
        } else {
          window.history.replaceState(
            { role: 'SUPER_ADMIN', adminTab: 'dashboard', isRoot: true },
            '',
            window.location.href
          );
        }
      }
    }
  }, [user, isProfessional, clientTab, publicSlug, tableParams]);

  // Fetch public site data if publicSlug is present
  useEffect(() => {
    if (!publicSlug) {
      setPublicSiteData(null);
      return;
    }

    if (publicSlug === CROSS_TENANT_BLOCKED_SENTINEL) {
      setPublicSiteData({
        loading: false,
        tenant: null,
        site: null,
        isPublished: false,
        error: 'O endereço solicitado não pertence a este domínio.',
      });
      return;
    }

    let isMounted = true;
    const fetchPublicSite = async () => {
      try {
        setPublicSiteData({ loading: true, tenant: null, site: null, isPublished: false, error: null });
        const res = await api.getPublicSite(publicSlug);
        if (isMounted) {
          if (res.success && res.tenant) {
            setPublicSiteData({
              loading: false,
              tenant: res.tenant,
              site: res.site,
              isPublished: res.isPublished,
              error: null,
            });
          } else {
            setPublicSiteData({
              loading: false,
              tenant: null,
              site: null,
              isPublished: false,
              error: res.error || 'Estabelecimento não encontrado.',
            });
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setPublicSiteData({
            loading: false,
            tenant: null,
            site: null,
            isPublished: false,
            error: err.message || 'Erro ao carregar mini site.',
          });
        }
      }
    };

    fetchPublicSite();
    return () => {
      isMounted = false;
    };
  }, [publicSlug]);

  // Load plans and tenants if user is authenticated
  const loadGlobalData = async () => {
    if (!user) return;
    try {
      setDataLoading(true);
      const plansData = await api.getPlans();
      setPlans(plansData);

      if (user.role === 'SUPER_ADMIN') {
        const tenantsData = await api.getTenants();
        setTenants(tenantsData);
      }
    } catch (err) {
      console.error('Error loading global data:', err);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadGlobalData();
    }
  }, [user]);

  // ==========================================
  // PUBLIC TABLE QR CODE DIGITAL CATALOG VIEW
  // ==========================================
  if (tableParams) {
    return <PublicTableCatalogView tenantSlug={tableParams.slug} tableToken={tableParams.token} />;
  }

  // ==========================================
  // PUBLIC MINI SITE VISITOR VIEW
  // ==========================================
  if (publicSlug) {
    if (publicSiteData?.loading) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Carregando página...
          </p>
        </div>
      );
    }

    if (publicSiteData?.error || !publicSiteData?.tenant) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-6 shadow-xl">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Página não encontrada</h1>
          <p className="text-slate-400 max-w-md text-sm leading-relaxed mb-6">
            O endereço informado não existe ou está temporariamente indisponível. Verifique o link e tente novamente.
          </p>
        </div>
      );
    }

    return (
      <PublicSiteView
        tenant={publicSiteData.tenant}
        site={publicSiteData.site}
        isPublished={publicSiteData.isPublished}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl animate-pulse mb-4">
          <Building2 className="w-6 h-6" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Carregando ambiente multi-tenant...
        </p>
      </div>
    );
  }

  // Not logged in -> Show Login Screen
  if (!user) {
    return <LoginView />;
  }

  // 1. SUPER ADMIN INTERFACE
  if (user.role === 'SUPER_ADMIN') {
    return (
      <SuperAdminLayout
        currentTab={selectedTenantId ? 'tenants' : adminTab}
        onSelectTab={(tab, replace) => navigateAdminTab(tab, replace)}
      >
        {/* If a tenant is selected, show detail view */}
        {selectedTenantId ? (
          <TenantDetailView
            tenantId={selectedTenantId}
            plans={plans}
            onBack={() => {
              if (window.history.length > 1 && window.location.search.includes('tenantId')) {
                window.history.back();
              } else {
                navigateSelectTenant(null);
              }
            }}
            onTenantUpdated={() => {
              loadGlobalData();
              refreshSession();
            }}
            onTenantDeleted={() => {
              navigateSelectTenant(null);
              loadGlobalData();
            }}
          />
        ) : (
          <>
            {adminTab === 'dashboard' && (
              <DashboardOverview
                onOpenNewTenant={() => setIsNewTenantModalOpen(true)}
                onSelectTenant={(id) => navigateSelectTenant(id)}
                onNavigateTab={(tab) => navigateAdminTab(tab)}
              />
            )}

            {adminTab === 'tenants' && (
              <TenantsList
                tenants={tenants}
                plans={plans}
                onOpenNewTenant={() => setIsNewTenantModalOpen(true)}
                onSelectTenant={(id) => navigateSelectTenant(id)}
                onDeleteTenant={async (id) => {
                  await api.deleteTenant(id);
                  loadGlobalData();
                }}
                onUpdateStatus={async (id, status: TenantStatus) => {
                  await api.updateTenantStatus(id, status);
                  loadGlobalData();
                }}
              />
            )}

            {adminTab === 'plans' && (
              <PlansView plans={plans} onPlansUpdated={loadGlobalData} />
            )}

            {adminTab === 'users' && <UsersGlobalView tenants={tenants} />}

            {adminTab === 'settings' && <PlatformSettingsView />}
          </>
        )}

        {/* Modal Nova Empresa */}
        <NewTenantModal
          isOpen={isNewTenantModalOpen}
          plans={plans}
          onClose={() => setIsNewTenantModalOpen(false)}
          onSuccess={(newTenantId) => {
            loadGlobalData();
            navigateSelectTenant(newTenantId);
          }}
        />
      </SuperAdminLayout>
    );
  }

  // 2. CLIENT / PROFESSIONAL INTERFACE
  // Strictly isolated to user's assigned tenant
  if (tenant) {
    // If user is a PROFESSIONAL without an active link to a professional record
    if (isProfessional && !linkedProfessional) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-300">
          <div className="bg-slate-900 border border-amber-500/30 p-8 rounded-3xl max-w-lg w-full text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-5 shadow-lg">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-white mb-2">Vínculo de Profissional Pendente</h2>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Olá, <span className="text-white font-bold">{user?.name}</span>. Seu usuário possui o perfil de <strong>Profissional</strong>, mas seu acesso aos dados está bloqueado porque ainda não existe um cadastro de profissional vinculado no estabelecimento <strong>{tenant.name}</strong>.
            </p>
            <div className="p-4 bg-amber-950/30 border border-amber-500/20 rounded-2xl text-left text-xs text-amber-200/90 mb-6 space-y-2">
              <p className="font-semibold text-amber-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                Como liberar seu acesso exclusivo à Agenda:
              </p>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Solicite ao administrador da empresa que acesse o painel no módulo <strong>Profissionais</strong> e associe o seu e-mail ({user?.email}) ou seu usuário ao seu perfil de atendimento.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={async () => {
                  await refreshSession();
                }}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Verificar Vínculo Novamente
              </button>
              <button
                onClick={async () => {
                  await logout();
                }}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-700"
              >
                <LogOut className="w-4 h-4 text-rose-400" />
                Sair
              </button>
            </div>
          </div>
        </div>
      );
    }

    // If user is a PROFESSIONAL with active link: render strictly Agenda inside ClientLayout
    if (isProfessional) {
      return (
        <ClientLayout
          currentTab="appointments"
          onSelectTab={() => {}}
          plans={plans}
        >
          <AppointmentManager tenant={tenant} />
        </ClientLayout>
      );
    }

    const currentPlan = plans.find((p) => p.id === tenant.planId);
    const hasSiteEditor = isTenantFeatureEnabled('site_editor', resolvedFeatures, tenant, currentPlan);
    const hasProducts = isTenantFeatureEnabled('products', resolvedFeatures, tenant, currentPlan);
    const hasShoppingCart = isTenantFeatureEnabled('shopping_cart', resolvedFeatures, tenant, currentPlan);
    const hasServices = isTenantFeatureEnabled('services', resolvedFeatures, tenant, currentPlan);
    const hasProfessionals = isTenantFeatureEnabled('professionals', resolvedFeatures, tenant, currentPlan);
    const hasAppointments = isTenantFeatureEnabled('appointments', resolvedFeatures, tenant, currentPlan);
    const hasRestaurantCatalog = isTenantFeatureEnabled('restaurant_tables', resolvedFeatures, tenant, currentPlan);

    return (
      <ClientLayout
        currentTab={clientTab}
        onSelectTab={(tab, replace) => navigateClientTab(tab, replace)}
        plans={plans}
      >
        {clientTab === 'home' && (
          <ClientHomeView
            tenant={tenant}
            plans={plans}
            onNavigateTab={(tab) => navigateClientTab(tab)}
          />
        )}

        {clientTab === 'company' && (
          <ClientCompanyView
            tenant={tenant}
            onUpdated={(updated) => setTenant(updated)}
          />
        )}

        {clientTab === 'appearance' && (
          <ClientAppearanceView
            tenant={tenant}
            onUpdated={(updated) => setTenant(updated)}
          />
        )}

        {/* Products Module */}
        {clientTab === 'products' && (
          hasProducts ? (
            <ProductManager tenant={tenant} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-600 bg-white m-6 rounded-3xl border border-slate-200">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Módulo de Produtos não disponível</h3>
              <p className="text-xs text-slate-500 max-w-sm mb-6">
                O recurso de catálogo de produtos (products) não está ativo no plano atual da sua empresa. Entre em contato com a administração para realizar o upgrade.
              </p>
              <button
                onClick={() => navigateClientTab('home')}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
              >
                Voltar para o Início
              </button>
            </div>
          )
        )}

        {/* Site Builder Module */}
        {(clientTab === 'site' || clientTab === 'site_editor') && (
          hasSiteEditor ? (
            <SiteManager tenant={tenant} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-600 bg-white m-6 rounded-3xl border border-slate-200">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Recurso não disponível no seu plano</h3>
              <p className="text-xs text-slate-500 max-w-sm mb-6">
                O construtor de mini sites (site_editor) não está ativo no plano atual da sua empresa. Entre em contato com a administração para realizar o upgrade.
              </p>
              <button
                onClick={() => navigateClientTab('home')}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
              >
                Voltar para o Início
              </button>
            </div>
          )
        )}

        {/* Orders & Shopping Cart Module */}
        {(clientTab === 'orders' || clientTab === 'shopping_cart') && (
          (hasShoppingCart || hasRestaurantCatalog) ? (
            <OrdersManager tenant={tenant} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-600 bg-white m-6 rounded-3xl border border-slate-200">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Módulo de Pedidos desativado</h3>
              <p className="text-xs text-slate-500 max-w-sm mb-6">
                O módulo de pedidos e vendas (shopping_cart) está desativado para a sua empresa. Entre em contato com a administração da plataforma caso deseje habilitá-lo.
              </p>
              <button
                onClick={() => navigateClientTab('home')}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Voltar para o Início
              </button>
            </div>
          )
        )}

        {/* Restaurant Digital Catalog & Tables Module — STRICTLY requires restaurant_tables (never falls back to hasProducts) */}
        {(clientTab === 'restaurant' || clientTab === 'catalogo_digital') && (
          hasRestaurantCatalog ? (
            <RestaurantManager tenant={tenant} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-600 bg-white m-6 rounded-3xl border border-slate-200">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Módulo de Mesas & Salão desativado</h3>
              <p className="text-xs text-slate-500 max-w-sm mb-6">
                A funcionalidade Catálogo Digital & Mesas (restaurant_tables) está desativada para a sua empresa pelo administrador da plataforma.
              </p>
              <button
                onClick={() => navigateClientTab('home')}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Voltar para o Início
              </button>
            </div>
          )
        )}

        {/* Restaurant Financial Dashboard Module */}
        {clientTab === 'financial' && (
          <FinancialDashboardView tenant={tenant} initialMode="dashboard" />
        )}

        {/* Top Selling Products Module */}
        {clientTab === 'top_products' && (
          <FinancialDashboardView tenant={tenant} initialMode="top_products" />
        )}

        {/* Financial & Operational Reports Module */}
        {clientTab === 'reports' && (
          <FinancialDashboardView tenant={tenant} initialMode="reports" />
        )}

        {/* Services Module */}
        {clientTab === 'services' && (
          hasServices ? (
            <ServiceManager tenant={tenant} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-600 bg-white m-6 rounded-3xl border border-slate-200">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Módulo de Serviços não disponível</h3>
              <p className="text-xs text-slate-500 max-w-sm mb-6">
                O recurso de gestão de serviços (services) não está ativo no plano atual da sua empresa. Entre em contato com a administração para realizar o upgrade.
              </p>
              <button
                onClick={() => navigateClientTab('home')}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Voltar para o Início
              </button>
            </div>
          )
        )}

        {/* Professionals Module */}
        {clientTab === 'professionals' && (
          hasProfessionals ? (
            <ProfessionalManager tenant={tenant} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-600 bg-white m-6 rounded-3xl border border-slate-200">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Módulo de Profissionais não disponível</h3>
              <p className="text-xs text-slate-500 max-w-sm mb-6">
                O recurso de gestão de profissionais (professionals) não está ativo no plano atual da sua empresa. Entre em contato com a administração para realizar o upgrade.
              </p>
              <button
                onClick={() => navigateClientTab('home')}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Voltar para o Início
              </button>
            </div>
          )
        )}

        {/* Appointments & Agenda Module */}
        {clientTab === 'appointments' && (
          hasAppointments ? (
            <AppointmentManager tenant={tenant} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-600 bg-white m-6 rounded-3xl border border-slate-200">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Módulo de Agenda não disponível</h3>
              <p className="text-xs text-slate-500 max-w-sm mb-6">
                O recurso de agenda e agendamentos (appointments) não está ativo no plano atual da sua empresa. Entre em contato com a administração para realizar o upgrade.
              </p>
              <button
                onClick={() => navigateClientTab('home')}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Voltar para o Início
              </button>
            </div>
          )
        )}

        {/* Dynamic prepared module placeholders for remaining active features */}
        {['qr_code', 'analytics'].includes(
          clientTab
        ) && (
          <ClientFeatureModuleView
            moduleName={
              clientTab === 'qr_code'
                ? 'Gerador de QR Code'
                : 'Métricas & Visitas'
            }
            moduleKey={clientTab}
            tenant={tenant}
            onGoHome={() => navigateClientTab('home')}
          />
        )}
      </ClientLayout>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-300">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl backdrop-blur-md">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-5 shadow-lg">
          <Building2 className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-1">Nenhum estabelecimento vinculado</h2>
        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
          Seu usuário ({user?.email}) está autenticado, mas ainda não possui uma empresa ou estabelecimento vinculado.
        </p>

        <div className="space-y-3">
          <button
            onClick={async () => {
              try {
                await api.selfAssignTenant();
                await refreshSession();
              } catch (e: any) {
                alert(e.message || 'Erro ao vincular estabelecimento.');
              }
            }}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
          >
            <Building2 className="w-4 h-4" />
            Vincular ao Estabelecimento Padrão
          </button>

          <button
            onClick={async () => {
              await logout();
            }}
            className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs border border-slate-700 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            Sair do Sistema / Voltar para Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
