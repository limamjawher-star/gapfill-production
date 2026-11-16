'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { AuthViewMode } from '../types/gapfill';
import { resolveWorkspaceEntryFromSearch } from '../utils/authValidation';

export interface AuthenticatedHostUser {
  id: string;
  email: string;
  fullName: string;
  authProvider: 'supabase-jwt' | 'local-stage2-vault';
  lastSignedInAt: string;
}

interface StoredLocalAccount {
  id: string;
  email: string;
  fullName: string;
  passwordPlainForLocalStage2Only: string;
  createdAt: string;
}

interface AuthContextValue {
  user: AuthenticatedHostUser | null;
  isDemoSession: boolean;
  sessionExpired: boolean;
  isLoadingAuth: boolean;
  authViewMode: AuthViewMode;
  setAuthViewMode: (mode: AuthViewMode) => void;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message: string }>;
  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<{ ok: boolean; message: string }>;
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; message: string }>;
  updatePassword: (newPassword: string) => Promise<{ ok: boolean; message: string }>;
  signOut: () => Promise<void>;
  enterDemoSandbox: () => void;
  simulateSessionExpiry: () => void;
  clearExpiredBanner: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_STORAGE_KEY = 'gapfill_stage2_active_session_v1';
const ACCOUNTS_STORAGE_KEY = 'gapfill_stage2_registered_hosts_v1';

const DEFAULT_SEEDED_HOST: StoredLocalAccount = {
  id: 'host_usr_01',
  email: 'clara@horizonstays.com',
  fullName: 'Clara Moreau · Horizon Stays',
  passwordPlainForLocalStage2Only: 'GapFill2026!',
  createdAt: '2026-11-01T08:00:00Z',
};

function getLocalAccounts(): StoredLocalAccount[] {
  if (typeof window === 'undefined') return [DEFAULT_SEEDED_HOST];
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(
        ACCOUNTS_STORAGE_KEY,
        JSON.stringify([DEFAULT_SEEDED_HOST])
      );
      return [DEFAULT_SEEDED_HOST];
    }
    const parsed = JSON.parse(raw) as StoredLocalAccount[];
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : [DEFAULT_SEEDED_HOST];
  } catch {
    return [DEFAULT_SEEDED_HOST];
  }
}

function saveLocalAccounts(accounts: StoredLocalAccount[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    // Ignore storage quota issues
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthenticatedHostUser | null>(null);
  const [isDemoSession, setIsDemoSession] = useState<boolean>(false);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
  const [authViewMode, setAuthViewMode] = useState<AuthViewMode>('login');

  useEffect(() => {
    let mounted = true;

    async function initSession() {
      // ?autostart=1 is strictly a DEMO-only sandbox entry and NEVER creates an authenticated session
      if (typeof window !== 'undefined') {
        const entry = resolveWorkspaceEntryFromSearch(window.location.search);
        if (entry.enterDemoOnly) {
          if (mounted) {
            setUser(null);
            setSessionExpired(false);
            setIsDemoSession(true);
            setIsLoadingAuth(false);
          }
          return;
        }
      }

      const supabase = getSupabaseClient();
      if (supabase && isSupabaseConfigured()) {
        try {
          const { data, error } = await supabase.auth.getSession();
          if (!error && data.session?.user && mounted) {
            setUser({
              id: data.session.user.id,
              email: data.session.user.email ?? 'host@gapfill.app',
              fullName:
                (data.session.user.user_metadata?.full_name as string) ||
                data.session.user.email ||
                'Host Account',
              authProvider: 'supabase-jwt',
              lastSignedInAt: new Date().toISOString(),
            });
          }
        } catch {
          // Remain logged out on session read error
        }

        const { data: listener } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (!mounted) return;
            if (event === 'PASSWORD_RECOVERY') {
              setAuthViewMode('reset_password');
            }
            if (session?.user) {
              setUser({
                id: session.user.id,
                email: session.user.email ?? 'host@gapfill.app',
                fullName:
                  (session.user.user_metadata?.full_name as string) ||
                  session.user.email ||
                  'Host Account',
                authProvider: 'supabase-jwt',
                lastSignedInAt: new Date().toISOString(),
              });
              setSessionExpired(false);
            } else if (event === 'SIGNED_OUT') {
              setUser(null);
            }
          }
        );

        if (mounted) setIsLoadingAuth(false);
        return () => {
          mounted = false;
          listener.subscription.unsubscribe();
        };
      }

      // Check local Stage 2 session storage when Supabase env vars are not yet injected
      if (typeof window !== 'undefined') {
        try {
          const saved = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved) as {
              user?: AuthenticatedHostUser;
              isDemoSession?: boolean;
            };
            if (parsed.user && mounted) {
              setUser(parsed.user);
            } else if (parsed.isDemoSession && mounted) {
              setIsDemoSession(true);
            }
          }
        } catch {
          // Ignore malformed sessionStorage
        }
      }

      if (mounted) setIsLoadingAuth(false);
    }

    initSession();
    return () => {
      mounted = false;
    };
  }, []);

  const persistSessionState = useCallback(
    (nextUser: AuthenticatedHostUser | null, nextDemo: boolean) => {
      if (typeof window === 'undefined') return;
      try {
        if (!nextUser && !nextDemo) {
          window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        } else {
          window.sessionStorage.setItem(
            SESSION_STORAGE_KEY,
            JSON.stringify({ user: nextUser, isDemoSession: nextDemo })
          );
        }
      } catch {
        // Ignore storage errors
      }
    },
    []
  );

  const signIn = useCallback(
    async (
      rawEmail: string,
      password: string
    ): Promise<{ ok: boolean; message: string }> => {
      const email = rawEmail.trim().toLowerCase();
      const supabase = getSupabaseClient();

      if (supabase && isSupabaseConfigured()) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error || !data.user) {
          return {
            ok: false,
            message:
              error?.message ||
              'Invalid login credentials. Please check your email and password.',
          };
        }
        const hostUser: AuthenticatedHostUser = {
          id: data.user.id,
          email: data.user.email ?? email,
          fullName:
            (data.user.user_metadata?.full_name as string) ||
            data.user.email ||
            'Host Account',
          authProvider: 'supabase-jwt',
          lastSignedInAt: new Date().toISOString(),
        };
        setUser(hostUser);
        setIsDemoSession(false);
        setSessionExpired(false);
        persistSessionState(hostUser, false);
        return { ok: true, message: `Signed in as ${hostUser.email}.` };
      }

      // Stage 2 Local Vault verification when Supabase URL is not yet connected
      const accounts = getLocalAccounts();
      const match = accounts.find(
        (acc) =>
          acc.email.toLowerCase() === email &&
          acc.passwordPlainForLocalStage2Only === password
      );

      if (!match) {
        return {
          ok: false,
          message:
            'Invalid login credentials. Use your registered host account or the pre-configured test account (clara@horizonstays.com / GapFill2026!).',
        };
      }

      const hostUser: AuthenticatedHostUser = {
        id: match.id,
        email: match.email,
        fullName: match.fullName,
        authProvider: 'local-stage2-vault',
        lastSignedInAt: new Date().toISOString(),
      };
      setUser(hostUser);
      setIsDemoSession(false);
      setSessionExpired(false);
      persistSessionState(hostUser, false);
      return { ok: true, message: `Authenticated as ${hostUser.fullName}.` };
    },
    [persistSessionState]
  );

  const signUp = useCallback(
    async (
      rawEmail: string,
      password: string,
      fullName: string
    ): Promise<{ ok: boolean; message: string }> => {
      const email = rawEmail.trim().toLowerCase();
      const cleanName = fullName.trim();
      const supabase = getSupabaseClient();

      if (supabase && isSupabaseConfigured()) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: cleanName },
          },
        });
        if (error) {
          return { ok: false, message: error.message };
        }
        if (data.user && data.session) {
          const hostUser: AuthenticatedHostUser = {
            id: data.user.id,
            email: data.user.email ?? email,
            fullName: cleanName,
            authProvider: 'supabase-jwt',
            lastSignedInAt: new Date().toISOString(),
          };
          setUser(hostUser);
          setIsDemoSession(false);
          setSessionExpired(false);
          persistSessionState(hostUser, false);
          return { ok: true, message: 'Host account created and signed in.' };
        }
        return {
          ok: true,
          message:
            'Account registered with Supabase Auth. Please check your inbox to confirm your email address.',
        };
      }

      const accounts = getLocalAccounts();
      if (accounts.some((acc) => acc.email.toLowerCase() === email)) {
        return {
          ok: false,
          message: 'An account with this email address already exists. Please sign in instead.',
        };
      }

      const newAccount: StoredLocalAccount = {
        id: `host_usr_${Date.now()}`,
        email,
        fullName: cleanName,
        passwordPlainForLocalStage2Only: password,
        createdAt: new Date().toISOString(),
      };
      saveLocalAccounts([...accounts, newAccount]);

      const hostUser: AuthenticatedHostUser = {
        id: newAccount.id,
        email: newAccount.email,
        fullName: newAccount.fullName,
        authProvider: 'local-stage2-vault',
        lastSignedInAt: new Date().toISOString(),
      };
      setUser(hostUser);
      setIsDemoSession(false);
      setSessionExpired(false);
      persistSessionState(hostUser, false);
      return {
        ok: true,
        message: `Created host account for ${cleanName} and signed in.`,
      };
    },
    [persistSessionState]
  );

  const requestPasswordReset = useCallback(
    async (rawEmail: string): Promise<{ ok: boolean; message: string }> => {
      const email = rawEmail.trim().toLowerCase();
      const supabase = getSupabaseClient();

      if (supabase && isSupabaseConfigured()) {
        const redirectTo =
          typeof window !== 'undefined'
            ? `${window.location.origin}/?mode=reset_password`
            : undefined;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        });
        if (error) {
          return { ok: false, message: error.message };
        }
        return {
          ok: true,
          message: `Password recovery link dispatched to ${email}.`,
        };
      }

      return {
        ok: true,
        message: `Password reset request verified for ${email}. You can now test setting a new password in the Reset Password screen.`,
      };
    },
    []
  );

  const updatePassword = useCallback(
    async (newPassword: string): Promise<{ ok: boolean; message: string }> => {
      const supabase = getSupabaseClient();
      if (supabase && isSupabaseConfigured()) {
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (error) {
          return { ok: false, message: error.message };
        }
        return {
          ok: true,
          message: 'Your password has been updated. You may now sign in.',
        };
      }

      // Update password on active user or default seeded account in local Stage 2 vault
      const accounts = getLocalAccounts();
      const targetEmail = user?.email ?? DEFAULT_SEEDED_HOST.email;
      const updated = accounts.map((acc) =>
        acc.email.toLowerCase() === targetEmail.toLowerCase()
          ? { ...acc, passwordPlainForLocalStage2Only: newPassword }
          : acc
      );
      saveLocalAccounts(updated);
      return {
        ok: true,
        message: `Password updated for ${targetEmail}. You can now sign in with your new password.`,
      };
    },
    [user]
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConfigured()) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setIsDemoSession(false);
    setSessionExpired(false);
    setAuthViewMode('login');
    persistSessionState(null, false);
  }, [persistSessionState]);

  const enterDemoSandbox = useCallback(() => {
    setIsDemoSession(true);
    setSessionExpired(false);
    persistSessionState(null, true);
  }, [persistSessionState]);

  const simulateSessionExpiry = useCallback(() => {
    setSessionExpired(true);
    setAuthViewMode('login');
  }, []);

  const clearExpiredBanner = useCallback(() => {
    setSessionExpired(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isDemoSession,
        sessionExpired,
        isLoadingAuth,
        authViewMode,
        setAuthViewMode,
        signIn,
        signUp,
        requestPasswordReset,
        updatePassword,
        signOut,
        enterDemoSandbox,
        simulateSessionExpiry,
        clearExpiredBanner,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
