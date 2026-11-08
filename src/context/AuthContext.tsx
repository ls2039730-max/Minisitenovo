import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Tenant, FeatureKey } from '../types/saas';
import { Professional } from '../types/service';
import { DeliveryDriver } from '../types/deliveryHub';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  linkedProfessional: Professional | null;
  linkedDriver: DeliveryDriver | null;
  isProfessional: boolean;
  isDeliveryDriver: boolean;
  loading: boolean;
  isImpersonating: boolean;
  isDevelopment: boolean;
  originalAdminUserName?: string;
  resolvedFeatures: Record<FeatureKey, boolean>;
  login: (
    email: string,
    pass: string
  ) => Promise<{
    user: User;
    tenant?: Tenant | null;
    linkedProfessional?: Professional | null;
    linkedDriver?: DeliveryDriver | null;
  }>;
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
  const [linkedDriver, setLinkedDriver] = useState<DeliveryDriver | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isImpersonating, setIsImpersonating] = useState<boolean>(false);
  const [isDevelopment, setIsDevelopment] = useState<boolean>(true);
  const [originalAdminUserName, setOriginalAdminUserName] = useState<string | undefined>(undefined);
  const [resolvedFeatures, setResolvedFeatures] = useState<Record<FeatureKey, boolean>>({} as any);
  const manualAuthActionRef = React.useRef<boolean>(false);

  const isProfessional = user?.role === 'PROFESSIONAL';
  const isDeliveryDriver = user?.role === 'DELIVERY_DRIVER';

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
      setLinkedDriver(session.linkedDriver || null);
      setIsImpersonating(!!session.isImpersonating);
      setOriginalAdminUserName(session.originalAdminUserName);
      if (session.resolvedFeatures) {
        setResolvedFeatures(session.resolvedFeatures);
      }
    } catch (err: any) {
      if (manualAuthActionRef.current) return;
      const msg = String(err?.message || '');
      const isTransientTimeout =
        err?.name === 'TimeoutError' ||
        err?.name === 'AbortError' ||
        msg.includes('Tempo limite esgotado') ||
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError');
      if (!isTransientTimeout) {
        api.clearToken();
        setUser(null);
        setTenant(null);
        setLinkedProfessional(null);
        setLinkedDriver(null);
        setIsImpersonating(false);
      }
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
    const data = await api.login(email, pass);
    setUser(data.user);
    setTenant(data.tenant || null);
    setLinkedProfessional(data.linkedProfessional || null);
    setLinkedDriver(data.linkedDriver || null);
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
      setLinkedDriver(null);
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

  const lastRefreshRef = React.useRef<number>(0);
  const inFlightRefreshRef = React.useRef<Promise<void> | null>(null);

  const refreshSession = React.useCallback(async () => {
    if (inFlightRefreshRef.current) {
      return inFlightRefreshRef.current;
    }

    const runRefresh = (async () => {
      try {
        const token = api.getToken();
        if (!token) return;
        lastRefreshRef.current = Date.now();
        const session = await api.getCurrentSession();
        if (session?.user) {
          setUser(session.user);
          setTenant(session.tenant || null);
          setLinkedProfessional(session.linkedProfessional || null);
          setLinkedDriver(session.linkedDriver || null);
          setIsImpersonating(!!session.isImpersonating);
          setOriginalAdminUserName(session.originalAdminUserName);
          if (session.resolvedFeatures) {
            setResolvedFeatures(session.resolvedFeatures);
          }
        }
      } catch (e: any) {
        // Ignore transient network/timeout errors during background polling
        const msg = String(e?.message || '');
        if (
          e?.name === 'TimeoutError' ||
          e?.name === 'AbortError' ||
          msg.includes('Tempo limite esgotado') ||
          msg.includes('Failed to fetch') ||
          msg.includes('NetworkError')
        ) {
          return;
        }
        console.warn('Session refresh notice:', msg || e);
      } finally {
        inFlightRefreshRef.current = null;
      }
    })();

    inFlightRefreshRef.current = runRefresh;
    return runRefresh;
  }, []);

  // Automatically sync tenant features and session when window regains focus or tab becomes visible
  useEffect(() => {
    if (!user) return;

    const handleAutoRefresh = () => {
      const now = Date.now();
      if (now - lastRefreshRef.current > 2000) {
        refreshSession();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleAutoRefresh();
      }
    };

    window.addEventListener('focus', handleAutoRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('localhub:refresh-session', handleAutoRefresh);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshSession();
      }
    }, 30000);

    return () => {
      window.removeEventListener('focus', handleAutoRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('localhub:refresh-session', handleAutoRefresh);
      window.clearInterval(intervalId);
    };
  }, [user, refreshSession]);

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        linkedProfessional,
        linkedDriver,
        isProfessional,
        isDeliveryDriver,
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
