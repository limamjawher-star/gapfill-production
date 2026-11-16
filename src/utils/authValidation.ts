import { AuthViewMode, WorkspaceDataMode } from '../types/gapfill';

export interface AuthFormInput {
  mode: AuthViewMode;
  email: string;
  password?: string;
  confirmPassword?: string;
  fullName?: string;
}

export interface AuthValidationResult {
  valid: boolean;
  error: string | null;
  normalizedEmail: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Pure deterministic validation for all 4 authentication screens:
 * - login
 * - signup
 * - forgot_password
 * - reset_password
 */
export function validateAuthForm(input: AuthFormInput): AuthValidationResult {
  const normalizedEmail = (input.email || '').trim().toLowerCase();
  const password = input.password || '';
  const confirmPassword = input.confirmPassword || '';
  const fullName = (input.fullName || '').trim();

  if (input.mode !== 'reset_password') {
    if (!normalizedEmail) {
      return {
        valid: false,
        error: 'Email address is required.',
        normalizedEmail,
      };
    }
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return {
        valid: false,
        error: 'Please enter a valid host email address.',
        normalizedEmail,
      };
    }
  }

  if (input.mode === 'signup') {
    if (fullName.length < 2) {
      return {
        valid: false,
        error: 'Please enter your full name or host organization name (at least 2 characters).',
        normalizedEmail,
      };
    }
  }

  if (
    input.mode === 'login' ||
    input.mode === 'signup' ||
    input.mode === 'reset_password'
  ) {
    if (!password) {
      return {
        valid: false,
        error: 'Password is required.',
        normalizedEmail,
      };
    }
    if (password.length < 8) {
      return {
        valid: false,
        error: 'Password must be at least 8 characters long.',
        normalizedEmail,
      };
    }
  }

  if (input.mode === 'reset_password') {
    if (password !== confirmPassword) {
      return {
        valid: false,
        error: 'New password and confirmation password do not match.',
        normalizedEmail,
      };
    }
  }

  return {
    valid: true,
    error: null,
    normalizedEmail,
  };
}

export interface SessionGuardInput {
  isAuthenticated: boolean;
  isDemoSession: boolean;
  sessionExpired: boolean;
  workspaceMode: WorkspaceDataMode;
}

/**
 * Determines whether the visitor is allowed to render the protected host workspace
 * or must be intercepted by the Authentication Gate.
 * - A logged-out visitor can NEVER access private host data.
 * - Expired sessions are always blocked until re-authenticated.
 */
export function canAccessProtectedWorkspace(input: SessionGuardInput): {
  allowed: boolean;
  reason: 'authenticated' | 'demo_sandbox' | 'expired_session' | 'unauthenticated';
} {
  if (input.sessionExpired) {
    return { allowed: false, reason: 'expired_session' };
  }
  if (input.isAuthenticated) {
    return { allowed: true, reason: 'authenticated' };
  }
  if (input.isDemoSession && input.workspaceMode === 'demo') {
    return { allowed: true, reason: 'demo_sandbox' };
  }
  return { allowed: false, reason: 'unauthenticated' };
}

/**
 * Parses URL search parameters for ?autostart=1.
 * ?autostart=1 is strictly a demo-only sandbox entry and MUST NEVER establish an authenticated session.
 */
export function resolveWorkspaceEntryFromSearch(search: string): {
  enterDemoOnly: boolean;
  forceDemoMode: boolean;
} {
  try {
    const params = new URLSearchParams(search);
    const isAutostart = params.get('autostart') === '1';
    return {
      enterDemoOnly: isAutostart,
      forceDemoMode: isAutostart,
    };
  } catch {
    return { enterDemoOnly: false, forceDemoMode: false };
  }
}

/**
 * Resolves the active workspace mode without allowing unauthenticated visitors
 * or demo-only (?autostart=1) sessions into live customer mode, while defaulting
 * authenticated users to live_supabase unless they explicitly toggle demo preview.
 */
export function resolveActiveWorkspaceMode(params: {
  isAuthenticated: boolean;
  isDemoSession: boolean;
  requestedMode: WorkspaceDataMode | null;
}): WorkspaceDataMode {
  if (!params.isAuthenticated) {
    if (params.requestedMode === 'live_supabase') {
      return 'live_supabase';
    }
    return 'demo';
  }
  if (params.requestedMode === 'demo') {
    return 'demo';
  }
  return 'live_supabase';
}
