import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api, clearToken, loadToken, saveToken, type User } from '@/src/services/api';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    name: string;
    role: 'patient' | 'doctor';
  }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await loadToken();
      if (t) {
        try {
          const u = await api.get<User>('/auth/me');
          setUser(u);
          setToken(t);
        } catch {
          await clearToken();
        }
      }
      setLoading(false);
    })();
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<{ token: string; user: User }>(
      '/auth/login',
      { email, password },
      false,
    );
    await saveToken(res.token);
    setToken(res.token);
    setUser(res.user);
  }

  async function register(input: {
    email: string;
    password: string;
    name: string;
    role: 'patient' | 'doctor';
  }) {
    const res = await api.post<{ token: string; user: User }>(
      '/auth/register',
      input,
      false,
    );
    await saveToken(res.token);
    setToken(res.token);
    setUser(res.user);
  }

  async function logout() {
    await clearToken();
    setToken(null);
    setUser(null);
  }

  async function refresh() {
    const u = await api.get<User>('/auth/me');
    setUser(u);
  }

  async function updateProfile(patch: Partial<User>) {
    const u = await api.patch<User>('/auth/me', patch);
    setUser(u);
  }

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, loading, login, register, logout, refresh, updateProfile }),
    [user, token, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
