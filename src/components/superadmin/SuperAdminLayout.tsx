import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Building2,
  Layers,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

import { useBackHandler } from '../../services/navigationManager';

interface SuperAdminLayoutProps {
  currentTab: string;
  onSelectTab: (tab: string, replace?: boolean) => void;
  children: React.ReactNode;
}

export const SuperAdminLayout: React.FC<SuperAdminLayoutProps> = ({
  currentTab,
  onSelectTab,
  children,
}) => {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile sidebar first when Back is pressed
  useBackHandler({
    isOpen: mobileMenuOpen,
    onClose: () => setMobileMenuOpen(false),
    priority: 15,
    name: 'SuperAdminMobileMenu',
  });

  const navigation = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'tenants', label: 'Empresas', icon: Building2 },
    { key: 'plans', label: 'Planos e Recursos', icon: Layers },
    { key: 'users', label: 'Usuários', icon: Users },
    { key: 'settings', label: 'Configurações', icon: Settings },
  ];

  const handleNavClick = (tabKey: string) => {
    const wasMenuOpen = mobileMenuOpen;
    setMobileMenuOpen(false);
    onSelectTab(tabKey, wasMenuOpen);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-800 selection:bg-indigo-500 selection:text-white">
      {/* Mobile Header */}
      <div className="md:hidden bg-slate-900 text-white px-4 py-3.5 flex items-center justify-between border-b border-slate-800 sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 -ml-1 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center"
            aria-label="Abrir menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-xs shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-tight block">LocalHub</span>
              <span className="text-[9px] font-bold text-indigo-400 bg-indigo-950/80 px-1.5 py-0.2 rounded border border-indigo-800 inline-block">
                SUPER ADMIN
              </span>
            </div>
          </div>
        </div>

        {/* Quick Logout button on mobile header */}
        <button
          onClick={() => logout()}
          title="Sair da plataforma"
          className="px-3 py-1.5 rounded-xl text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer shrink-0 shadow-xs active:scale-95"
        >
          <LogOut className="w-4 h-4 text-rose-400" />
          <span>Sair</span>
        </button>
      </div>

      {/* Mobile Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 md:hidden animate-in fade-in duration-200"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Desktop & Mobile Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 sm:w-80 md:w-64 bg-slate-950 text-white transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:inset-0 flex flex-col justify-between border-r border-slate-800/80 shadow-2xl ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Logo Brand */}
          <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 ring-1 ring-white/10 shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
                  LocalHub <span className="text-indigo-400">SaaS</span>
                </div>
                <div className="text-[10px] uppercase font-bold tracking-wider text-indigo-300 flex items-center gap-1 mt-0.5">
                  <ShieldCheck className="w-3 h-3 text-indigo-400" />
                  Super Admin
                </div>
              </div>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5 flex-1 overflow-y-auto min-h-0">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => handleNavClick(item.key)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer group ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 font-bold'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`} />
                    <span>{item.label}</span>
                  </div>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-white/70" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Card & Logout */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950 shrink-0">
          <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between mb-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">{user?.name}</p>
              <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all cursor-pointer active:scale-95"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            <span>Sair da Plataforma</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 p-4 sm:p-8 lg:p-10 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
};
