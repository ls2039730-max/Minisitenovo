import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Tenant, FeatureKey } from '../types/saas';
import { Professional } from '../types/service';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  linkedProfessional: Professional | null;
  isProfessional: boolean;
  loading: boolean;
  isImpersonating: boolean;
  isDevelopment: boolean;
  originalAdminUserName?: string;
  resolvedFeatures: Record<FeatureKey, boolean>;
  login: (email: string, pass: string) => Promise<{ user: User; tenant?: Tenant | null; linkedProfessional?: Professional | null }>;
  logout: () => Promise<void>;
  impersonate: (tenantId: string) => Promise<void>;
  exitImpersonation: () => Promise<void>;
  refreshSession: () => Promise<void>;
  setTenant: (tenant: Tenant | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [linkedProfessional, setLinkedProfessional] = useState<Professional | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isImpersonating, setIsImpersonating] = useState<boolean>(false);
  const [isDevelopment, setIsDevelopment] = useState<boolean>(true);
  const [originalAdminUserName, setOriginalAdminUserName] = useState<string | undefined>(undefined);
  const [resolvedFeatures, setResolvedFeatures] = useState<Record<FeatureKey, boolean>>({} as any);
  const manualAuthActionRef = React.useRef<boolean>(false);

  const isProfessional = user?.role === 'PROFESSIONAL';

  const initSession = async () => {
    try {
      // 1. Load runtime config (checks NODE_ENV on server)
      try {
        const config = await api.getConfig();
        setIsDevelopment(config.isDevelopment);
      } catch {
        setIsDevelopment(true);
      }

      // 2. Verify active session with backend
      const token = api.getToken();
      if (!token) {
        if (!manualAuthActionRef.current) {
          setLoading(false);
        }
        return;
      }

      const session = await api.getCurrentSession();
      if (manualAuthActionRef.current) return;

      setUser(session.user);
      setTenant(session.tenant || null);
      setLinkedProfessional(session.linkedProfessional || null);
      setIsImpersonating(!!session.isImpersonating);
      setOriginalAdminUserName(session.originalAdminUserName);
      if (session.resolvedFeatures) {
        setResolvedFeatures(session.resolvedFeatures);
      }
    } catch (err) {
      if (manualAuthActionRef.current) return;
      console.warn('Session verification failed, clearing credentials:', err);
      api.clearToken();
      setUser(null);
      setTenant(null);
      setLinkedProfessional(null);
      setIsImpersonating(false);
    } finally {
      if (!manualAuthActionRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    initSession();
  }, []);

  const login = async (email: string, pass: string) => {
    manualAuthActionRef.current = true;
    // Note: Do NOT set global `loading = true` before api.login completes,
    // because setting `loading = true` when `user === null` unmounts <LoginView />,
    // which would destroy the login form state and error display if login fails.
    const data = await api.login(email, pass);
    setUser(data.user);
    setTenant(data.tenant || null);
    setLinkedProfessional(data.linkedProfessional || null);
    setIsImpersonating(false);
    setOriginalAdminUserName(undefined);
    if (data.resolvedFeatures) {
      setResolvedFeatures(data.resolvedFeatures);
    } else {
      await refreshSession();
    }
    setLoading(false);
    return data;
  };

  const logout = async () => {
    manualAuthActionRef.current = true;
    setLoading(true);
    try {
      await api.logout();
      setUser(null);
      setTenant(null);
      setLinkedProfessional(null);
      setIsImpersonating(false);
      setOriginalAdminUserName(undefined);
    } finally {
      setLoading(false);
    }
  };

  const impersonate = async (tenantId: string) => {
    manualAuthActionRef.current = true;
    setLoading(true);
    try {
      const data = await api.impersonateTenant(tenantId);
      setUser(data.user);
      setTenant(data.tenant);
      setIsImpersonating(true);
      await refreshSession();
    } finally {
      setLoading(false);
    }
  };

  const exitImpersonation = async () => {
    manualAuthActionRef.current = true;
    setLoading(true);
    try {
      await api.exitImpersonation();
      await refreshSession();
    } finally {
      setLoading(false);
    }
  };

  const refreshSession = async () => {
    try {
      const session = await api.getCurrentSession();
      if (session?.user) {
        setUser(session.user);
        setTenant(session.tenant || null);
        setLinkedProfessional(session.linkedProfessional || null);
        setIsImpersonating(!!session.isImpersonating);
        setOriginalAdminUserName(session.originalAdminUserName);
        if (session.resolvedFeatures) {
          setResolvedFeatures(session.resolvedFeatures);
        }
      }
    } catch (e) {
      console.error('Failed to refresh session:', e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        linkedProfessional,
        isProfessional,
        loading,
        isImpersonating,
        isDevelopment,
        originalAdminUserName,
        resolvedFeatures,
        login,
        logout,
        impersonate,
        exitImpersonation,
        refreshSession,
        setTenant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
