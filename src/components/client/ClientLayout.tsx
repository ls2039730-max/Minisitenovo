import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Plan, FeatureKey } from '../../types/saas';
import { isTenantFeatureEnabled } from '../../utils/features';
import {
  Home,
  Building2,
  Palette,
  LogOut,
  Menu,
  X,
  ExternalLink,
  ArrowLeft,
  Layout,
  ShoppingBag,
  Sparkles,
  ShoppingCart,
  Calendar,
  QrCode,
  BarChart2,
  Globe,
  Wifi,
  ChevronRight,
  Briefcase,
  Users,
  UtensilsCrossed,
  DollarSign,
  FileSpreadsheet,
} from 'lucide-react';

import { useBackHandler } from '../../services/navigationManager';

interface ClientLayoutProps {
  currentTab: string;
  onSelectTab: (tab: string, replace?: boolean) => void;
  plans: Plan[];
  children: React.ReactNode;
}

export const ClientLayout: React.FC<ClientLayoutProps> = ({
  currentTab,
  onSelectTab,
  plans,
  children,
}) => {
  const { user, tenant, logout, isImpersonating, exitImpersonation, resolvedFeatures, isProfessional, linkedProfessional, refreshSession } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile sidebar first when Back is pressed
  useBackHandler({
    isOpen: mobileMenuOpen,
    onClose: () => setMobileMenuOpen(false),
    priority: 15,
    name: 'ClientMobileMenu',
  });

  const currentPlan = plans.find((p) => p.id === tenant?.planId);

  // Centralized feature resolution (Super Admin override > server resolvedFeatures > plan > false)
  const hasSiteEditor = !isProfessional && isTenantFeatureEnabled('site_editor', resolvedFeatures, tenant, currentPlan);
  const hasProducts = !isProfessional && isTenantFeatureEnabled('products', resolvedFeatures, tenant, currentPlan);
  const hasShoppingCart = !isProfessional && isTenantFeatureEnabled('shopping_cart', resolvedFeatures, tenant, currentPlan);
  const hasServices = !isProfessional && isTenantFeatureEnabled('services', resolvedFeatures, tenant, currentPlan);
  const hasProfessionals = !isProfessional && isTenantFeatureEnabled('professionals', resolvedFeatures, tenant, currentPlan);
  const hasAppointments = isTenantFeatureEnabled('appointments', resolvedFeatures, tenant, currentPlan);
  const hasRestaurantCatalog = !isProfessional && isTenantFeatureEnabled('restaurant_tables', resolvedFeatures, tenant, currentPlan);

  // Dynamic upcoming modules (only visible for client admins)
  const upcomingModules = isProfessional ? [] : [
    { key: 'qr_code', label: 'QR Code', icon: QrCode },
    { key: 'analytics', label: 'Métricas & Visitas', icon: BarChart2 },
  ].filter((mod) =>
    isTenantFeatureEnabled(mod.key as FeatureKey, resolvedFeatures, tenant, currentPlan)
  );

  // Primary operational & financial menu items (strictly filtered by active features and numbered sequentially)
  const operationalMenuItems = isProfessional
    ? [{ key: 'appointments', label: 'Minha Agenda', icon: Calendar }]
    : [
        { key: 'home', baseLabel: 'Visão Geral', icon: Home, enabled: true },
        { key: 'orders', baseLabel: 'Pedidos', icon: ShoppingCart, enabled: hasShoppingCart || hasRestaurantCatalog },
        { key: 'restaurant', baseLabel: 'Mesas & Salão', icon: UtensilsCrossed, enabled: hasRestaurantCatalog },
        { key: 'financial', baseLabel: 'Financeiro', icon: DollarSign, enabled: true },
        { key: 'top_products', baseLabel: 'Mais Vendidos', icon: ShoppingBag, enabled: hasProducts || hasShoppingCart || hasRestaurantCatalog },
        { key: 'reports', baseLabel: 'Relatórios', icon: FileSpreadsheet, enabled: true },
      ]
        .filter((item) => item.enabled)
        .map((item, idx) => ({
          key: item.key,
          label: `${idx + 1}. ${item.baseLabel}`,
          icon: item.icon,
        }));

  const handleNavClick = (tabKey: string) => {
    if (isProfessional && tabKey !== 'appointments') {
      return;
    }
    const wasMenuOpen = mobileMenuOpen;
    setMobileMenuOpen(false);
    onSelectTab(tabKey, wasMenuOpen);
  };

  const handleToggleMobileMenu = () => {
    const nextState = !mobileMenuOpen;
    setMobileMenuOpen(nextState);
    if (nextState) {
      refreshSession();
    }
  };

  const primaryColor = tenant?.appearance?.primaryColor || '#1e293b';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Impersonation Warning Banner */}
      {isImpersonating && (
        <div className="bg-amber-400 text-slate-950 px-4 py-2.5 text-xs font-bold flex items-center justify-between shadow-md z-50 sticky top-0 border-b border-amber-500 print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-950 animate-pulse" />
            <span>
              Você está visualizando como <u>{tenant?.name}</u>
            </span>
          </div>
          <button
            onClick={() => exitImpersonation()}
            className="px-3.5 py-1.5 bg-slate-950 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Sair da visualização
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-col md:flex-row">
        {/* Mobile Header */}
        <div
          className="md:hidden text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-40 shadow-md print:hidden"
          style={{ backgroundColor: primaryColor }}
        >
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleToggleMobileMenu}
              className="p-2 -ml-1 rounded-xl text-white hover:bg-white/15 transition-colors flex items-center gap-2"
              aria-label="Abrir menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center font-bold text-white shrink-0 text-xs">
                {tenant?.name.substring(0, 2).toUpperCase() || 'EM'}
              </div>
              <div className="min-w-0 max-w-[140px] sm:max-w-[200px]">
                <span className="font-extrabold text-sm tracking-tight block truncate">{tenant?.name}</span>
                <span className="text-[10px] block opacity-80 truncate">{tenant?.subdomain}</span>
              </div>
            </div>
          </div>

          {/* Quick Logout Button directly on Mobile Header */}
          <button
            onClick={() => logout()}
            title="Sair da conta"
            className="px-3 py-1.5 rounded-xl text-white bg-white/15 hover:bg-white/25 border border-white/20 transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer shrink-0 shadow-xs active:scale-95"
          >
            <LogOut className="w-4 h-4 text-rose-200" />
            <span>Sair</span>
          </button>
        </div>

        {/* Mobile Backdrop Overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 md:hidden animate-in fade-in duration-200 print:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar Drawer */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-72 sm:w-80 md:w-64 text-white transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:inset-0 flex flex-col justify-between shadow-2xl print:hidden ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ backgroundColor: primaryColor }}
        >
          <div className="flex flex-col flex-1 min-h-0">
            {/* Business Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-white shadow-md shrink-0 text-sm ring-2 ring-white/20"
                  style={{ backgroundColor: tenant?.appearance?.secondaryColor || '#3b82f6' }}
                >
                  {tenant?.name.substring(0, 2).toUpperCase() || 'EM'}
                </div>
                <div className="min-w-0">
                  <h2 className="font-extrabold text-sm tracking-tight text-white truncate">
                    {tenant?.name}
                  </h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded text-white">
                      {isProfessional ? 'Profissional' : (currentPlan?.name || 'Cliente')}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="md:hidden p-1.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation */}
            <div className="p-4 space-y-6 flex-1 overflow-y-auto min-h-0">
              {/* Menu Operacional & Financeiro */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block px-3 mb-2">
                  {isProfessional ? 'Acesso Profissional' : (hasRestaurantCatalog ? 'Gestão do Restaurante' : 'Gestão do Negócio')}
                </span>
                <nav className="space-y-1">
                  {operationalMenuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentTab === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => handleNavClick(item.key)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-white text-slate-900 shadow-md font-bold'
                            : 'text-white/80 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </div>
                        {isActive && <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Menu Cadastros & Configurações */}
              {!isProfessional && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block px-3 mb-2">
                    Configurações & Cadastros
                  </span>
                  <nav className="space-y-1">
                    {[
                      ...(hasProducts ? [{ key: 'products', label: 'Produtos', icon: ShoppingBag }] : []),
                      ...(hasSiteEditor ? [{ key: 'site', label: 'Site / Cardápio', icon: Globe }] : []),
                      { key: 'company', label: 'Minha Empresa', icon: Building2 },
                      { key: 'appearance', label: 'Aparência', icon: Palette },
                      ...(hasAppointments ? [{ key: 'appointments', label: 'Agenda', icon: Calendar }] : []),
                      ...(hasServices ? [{ key: 'services', label: 'Serviços', icon: Briefcase }] : []),
                      ...(hasProfessionals ? [{ key: 'professionals', label: 'Profissionais', icon: Users }] : []),
                    ].map((item) => {
                      const Icon = item.icon;
                      const isActive = currentTab === item.key;
                      return (
                        <button
                          key={item.key}
                          onClick={() => handleNavClick(item.key)}
                          className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            isActive
                              ? 'bg-white text-slate-900 shadow-md font-bold'
                              : 'text-white/80 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="w-4 h-4" />
                            <span>{item.label}</span>
                          </div>
                          {isActive && <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </nav>
                </div>
              )}

              {/* Módulos Habilitados (Features ativas) */}
              {upcomingModules.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block px-3 mb-2 flex items-center justify-between">
                    <span>Recursos Contratados</span>
                    <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-white/80">
                      {upcomingModules.length} ativos
                    </span>
                  </span>
                  <nav className="space-y-1">
                    {upcomingModules.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentTab === item.key;
                      return (
                        <button
                          key={item.key}
                          onClick={() => handleNavClick(item.key)}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            isActive
                              ? 'bg-white text-slate-900 shadow-md font-bold'
                              : 'text-white/80 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="w-4 h-4" />
                            <span>{item.label}</span>
                          </div>
                          <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-normal text-white">
                            Em breve
                          </span>
                        </button>
                      );
                    })}
                  </nav>
                </div>
              )}
            </div>
          </div>

          {/* User profile & Logout */}
          <div className="p-4 border-t border-white/10 bg-black/20 shrink-0">
            <div className="p-3 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-between mb-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">{user?.name}</p>
                <p className="text-[11px] text-white/70 truncate">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={() => logout()}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <LogOut className="w-4 h-4 text-rose-300" />
              <span>Sair da Conta</span>
            </button>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 p-4 sm:p-8 lg:p-10 max-w-6xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
};
