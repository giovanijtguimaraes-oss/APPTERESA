import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api, clearToken, loadToken, saveToken, type User } from '@/src/services/api';
import { storage } from '@/src/utils/storage';

// Default demo account seeded in both local and production backends.
// On a fresh install the app silently signs in as this doctor so a tester
// can open the APK and see something useful without typing credentials.
export const DEMO_DOCTOR_EMAIL = 'ana@teresa.med.br';
export const DEMO_DOCTOR_PASSWORD = 'ana123';

// Storage keys. We stack the doctor's session so that impersonation
// (doctor "entering" a patient's phone-view) can be undone without
// re-authenticating.
const IMPERSONATION_STACK_KEY = 'teresa.impersonation.stack';

/** One entry per nested impersonation. We only need the previous token &
 *  the user we were viewing as — the app refetches /auth/me on restore. */
interface ImpersonationFrame {
  previousToken: string;
  previousUser: User;
}

export interface ImpersonationInfo {
  active: boolean;
  previousUser: User | null;   // the user we'll return to on "exit"
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  /** True while the one-shot auto-login attempt is in-flight (useful on the
   *  splash so we don't flash a "retry" button prematurely). */
  autoLoginInFlight: boolean;
  /** Set to the error message when the latest auto-login attempt failed so
   *  the splash screen can show a diagnostic. Null means "no error / not
   *  tried yet / currently succeeded". */
  autoLoginError: string | null;
  impersonation: ImpersonationInfo;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    name: string;
    role: 'patient_monitored' | 'patient_autonomous' | 'doctor';
  }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => Promise<void>;
  /** Doctor action — opens a patient's view as if signing in on their phone. */
  impersonatePatient: (patientId: string) => Promise<void>;
  /** Exit the current impersonation layer and restore the previous session. */
  endImpersonation: () => Promise<void>;
  /** Re-attempt the demo auto-login. Used by the splash screen's retry
   *  button and the "logout" / "reiniciar sessão" buttons. */
  retryAutoLogin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [impersonationStack, setImpersonationStack] = useState<ImpersonationFrame[]>([]);
  const [autoLoginInFlight, setAutoLoginInFlight] = useState(false);
  const [autoLoginError, setAutoLoginError] = useState<string | null>(null);

  // ----- bootstrap -------------------------------------------------------
  useEffect(() => {
    (async () => {
      // Restore impersonation stack from disk so a backgrounded app
      // doesn't lose the "I'm viewing as X" state when relaunched.
      try {
        const raw = await storage.getItem<string>(IMPERSONATION_STACK_KEY, '');
        if (raw) {
          const parsed = JSON.parse(raw) as ImpersonationFrame[];
          if (Array.isArray(parsed)) setImpersonationStack(parsed);
        }
      } catch {
        /* ignore corrupt storage */
      }

      const t = await loadToken();
      if (t) {
        try {
          const u = await api.get<User>('/auth/me');
          setUser(u);
          setToken(t);
          setLoading(false);
          return;
        } catch {
          await clearToken();
        }
      }

      // No valid session → always try auto-login as Dra. Ana. There is no
      // standalone login screen anymore, so this is the only way in.
      await tryAutoLoginDemoDoctor();
      setLoading(false);
    })();
  }, []);

  async function tryAutoLoginDemoDoctor() {
    setAutoLoginInFlight(true);
    setAutoLoginError(null);
    try {
      const res = await api.post<{ token: string; user: User }>(
        '/auth/login',
        { email: DEMO_DOCTOR_EMAIL, password: DEMO_DOCTOR_PASSWORD },
        false,
      );
      await saveToken(res.token);
      setToken(res.token);
      setUser(res.user);
    } catch (e: any) {
      // Keep the error so the splash can offer a retry + diagnostic.
      setAutoLoginError(e?.detail ?? e?.message ?? 'Falha ao conectar com o servidor');
    } finally {
      setAutoLoginInFlight(false);
    }
  }

  async function retryAutoLogin() {
    // Manual retry from the splash / logout flow. We don't flip `loading`
    // because the Stack is already rendered — only auto-login state.
    await tryAutoLoginDemoDoctor();
  }

  // ----- impersonation stack ---------------------------------------------
  async function persistStack(stack: ImpersonationFrame[]): Promise<void> {
    try {
      if (stack.length === 0) {
        await storage.removeItem(IMPERSONATION_STACK_KEY);
      } else {
        await storage.setItem(IMPERSONATION_STACK_KEY, JSON.stringify(stack));
      }
    } catch {
      /* ignore */
    }
  }

  async function impersonatePatient(patientId: string) {
    if (!user || !token) throw new Error('Sessão inválida.');
    if (user.role !== 'doctor') {
      throw new Error('Apenas médicos podem entrar como paciente.');
    }
    const res = await api.post<{ token: string; user: User }>(
      `/doctor/patient/${patientId}/impersonate`,
    );
    // Stack the current (doctor) session before switching.
    const frame: ImpersonationFrame = {
      previousToken: token,
      previousUser: user,
    };
    const nextStack = [...impersonationStack, frame];
    setImpersonationStack(nextStack);
    await persistStack(nextStack);

    await saveToken(res.token);
    setToken(res.token);
    setUser(res.user);
  }

  async function endImpersonation() {
    if (impersonationStack.length === 0) return;
    const nextStack = impersonationStack.slice(0, -1);
    const popped = impersonationStack[impersonationStack.length - 1];
    await saveToken(popped.previousToken);
    setToken(popped.previousToken);
    setUser(popped.previousUser);
    setImpersonationStack(nextStack);
    await persistStack(nextStack);
    // Best-effort refresh so we show the latest data for the restored user.
    try {
      const fresh = await api.get<User>('/auth/me');
      setUser(fresh);
    } catch {
      /* keep popped snapshot */
    }
  }

  // ----- auth actions ----------------------------------------------------
  async function login(email: string, password: string) {
    const res = await api.post<{ token: string; user: User }>(
      '/auth/login',
      { email, password },
      false,
    );
    // Explicit login clears any ongoing impersonation.
    setImpersonationStack([]);
    await persistStack([]);
    await saveToken(res.token);
    setToken(res.token);
    setUser(res.user);
  }

  async function register(input: {
    email: string;
    password: string;
    name: string;
    role: 'patient_monitored' | 'patient_autonomous' | 'doctor';
  }) {
    const res = await api.post<{ token: string; user: User }>(
      '/auth/register',
      input,
      false,
    );
    setImpersonationStack([]);
    await persistStack([]);
    await saveToken(res.token);
    setToken(res.token);
    setUser(res.user);
  }

  async function logout() {
    setImpersonationStack([]);
    await persistStack([]);
    await clearToken();
    setToken(null);
    setUser(null);
    // There is no login screen anymore — immediately try the auto-login
    // path so the app lands back on Dra. Ana without any manual step.
    await tryAutoLoginDemoDoctor();
  }

  async function refresh() {
    const u = await api.get<User>('/auth/me');
    setUser(u);
  }

  async function updateProfile(patch: Partial<User>) {
    const u = await api.patch<User>('/auth/me', patch);
    setUser(u);
  }

  const impersonation: ImpersonationInfo = {
    active: impersonationStack.length > 0,
    previousUser:
      impersonationStack.length > 0
        ? impersonationStack[impersonationStack.length - 1].previousUser
        : null,
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      autoLoginInFlight,
      autoLoginError,
      impersonation,
      login,
      register,
      logout,
      refresh,
      updateProfile,
      impersonatePatient,
      endImpersonation,
      retryAutoLogin,
    }),
    [user, token, loading, autoLoginInFlight, autoLoginError, impersonationStack],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
