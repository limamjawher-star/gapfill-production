'use client';

import React, { useState } from 'react';
import { AuthViewMode } from '../types/gapfill';
import { isSupabaseConfigured, getSupabaseClient } from '../lib/supabase';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Home,
  Lock,
  Mail,
  ShieldCheck,
  X,
} from 'lucide-react';

interface AuthPreviewModalProps {
  isOpen: boolean;
  initialMode?: AuthViewMode;
  onClose: () => void;
  onSuccessSignIn: (email: string, password: string) => void;
}

export function AuthPreviewModal({
  isOpen,
  initialMode = 'login',
  onClose,
  onSuccessSignIn,
}: AuthPreviewModalProps) {
  const [mode, setMode] = useState<AuthViewMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const supabaseReady = isSupabaseConfigured();

  const validateEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (mode !== 'reset_password' && !validateEmail(email)) {
      setErrorMessage('Please enter a valid host email address.');
      return;
    }

    if (
      (mode === 'login' || mode === 'signup' || mode === 'reset_password') &&
      password.length < 8
    ) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (mode === 'signup' && fullName.trim().length < 2) {
      setErrorMessage('Please enter your full name or host organization name.');
      return;
    }

    if (mode === 'reset_password' && password !== confirmPassword) {
      setErrorMessage('New password and confirmation password do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        if (mode === 'login') {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          setStatusMessage('Signed in to your Host Account.');
          onSuccessSignIn(email, password);
        } else if (mode === 'signup') {
          const { error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } },
          });
          if (error) throw error;
          setStatusMessage('Account created. Check your inbox for email verification.');
        } else if (mode === 'forgot_password') {
          const { error } = await supabase.auth.resetPasswordForEmail(email);
          if (error) throw error;
          setStatusMessage('Password reset instructions sent to your email address.');
        } else if (mode === 'reset_password') {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) throw error;
          setStatusMessage('Your password has been updated.');
        }
      } else {
        setErrorMessage(
          'Live host authentication requires Supabase configuration (NEXT_PUBLIC_SUPABASE_URL & NEXT_PUBLIC_SUPABASE_ANON_KEY).'
        );
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Authentication request failed. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#DDDDDD] bg-white shadow-2xl">
        {/* Top Bar */}
        <div className="flex items-center justify-between border-b border-[#EBEBEB] px-6 py-4">
          <div className="flex items-center gap-2">
            <Home className="h-5 w-5 text-[#FF385C]" strokeWidth={2.3} />
            <h2 id="auth-modal-title" className="font-display text-base font-bold text-[#222222]">
              {mode === 'login' && 'Sign in to GapFill'}
              {mode === 'signup' && 'Create your Host Account'}
              {mode === 'forgot_password' && 'Reset your Password'}
              {mode === 'reset_password' && 'Set New Password'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="rounded-full p-1.5 text-[#717171] hover:bg-[#F7F7F7] hover:text-[#222222]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="border-b border-[#EBEBEB] bg-[#F7F7F7] px-6 py-2.5">
          <div className="flex items-center gap-1 rounded-xl bg-[#EBEBEB]/70 p-1">
            {(
              [
                { id: 'login', label: 'Login' },
                { id: 'signup', label: 'Sign Up' },
                { id: 'forgot_password', label: 'Forgot' },
                { id: 'reset_password', label: 'Reset' },
              ] as { id: AuthViewMode; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setMode(tab.id);
                  setErrorMessage(null);
                  setStatusMessage(null);
                }}
                className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  mode === tab.id
                    ? 'bg-white text-[#222222] shadow-xs'
                    : 'text-[#717171] hover:text-[#222222]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6" noValidate>
          {errorMessage && (
            <div className="flex items-start gap-2.5 rounded-xl border border-[#C13515]/30 bg-[#FFF8F6] p-3 text-xs text-[#C13515]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {statusMessage && (
            <div className="flex items-start gap-2.5 rounded-xl border border-[#008A05]/30 bg-[#F2FAF3] p-3 text-xs text-[#008A05]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-full-name" className="block text-xs font-semibold text-[#222222]">
                Host or Operator Name
              </label>
              <input
                id="auth-full-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Clara Moreau · Horizon Stays"
                className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] bg-white px-3.5 py-2.5 text-sm text-[#222222] placeholder:text-[#717171]/70 focus:border-[#222222] focus:outline-hidden"
              />
            </div>
          )}

          {mode !== 'reset_password' && (
            <div>
              <label htmlFor="auth-email" className="block text-xs font-semibold text-[#222222]">
                Host Email
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-[#717171]" />
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="host@example.com"
                  className="w-full rounded-lg border border-[#B0B0B0] bg-white py-2.5 pr-3.5 pl-10 text-sm text-[#222222] placeholder:text-[#717171]/70 focus:border-[#222222] focus:outline-hidden"
                />
              </div>
            </div>
          )}

          {(mode === 'login' || mode === 'signup' || mode === 'reset_password') && (
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-semibold text-[#222222]"
                >
                  {mode === 'reset_password' ? 'New Password' : 'Password'}
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot_password');
                      setErrorMessage(null);
                      setStatusMessage(null);
                    }}
                    className="text-xs font-semibold text-[#222222] underline hover:text-[#FF385C]"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-[#717171]" />
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-lg border border-[#B0B0B0] bg-white py-2.5 pr-3.5 pl-10 text-sm text-[#222222] placeholder:text-[#717171]/70 focus:border-[#222222] focus:outline-hidden"
                />
              </div>
            </div>
          )}

          {mode === 'reset_password' && (
            <div>
              <label
                htmlFor="auth-confirm-password"
                className="block text-xs font-semibold text-[#222222]"
              >
                Confirm New Password
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-[#717171]" />
                <input
                  id="auth-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full rounded-lg border border-[#B0B0B0] bg-white py-2.5 pr-3.5 pl-10 text-sm text-[#222222] placeholder:text-[#717171]/70 focus:border-[#222222] focus:outline-hidden"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#FF385C] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E00B41] disabled:opacity-50"
          >
            <span>
              {mode === 'login' && 'Sign In to Workspace'}
              {mode === 'signup' && 'Create Host Account'}
              {mode === 'forgot_password' && 'Send Reset Link'}
              {mode === 'reset_password' && 'Update Password'}
            </span>
            <ArrowRight className="h-4 w-4" />
          </button>

          <div className="border-t border-[#EBEBEB] pt-3 text-xs text-[#717171]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[#008A05]" />
              <span>
                {supabaseReady
                  ? 'Connected to Supabase Auth with strict per-host isolation.'
                  : 'Private calendar links are always encrypted and isolated per host.'}
              </span>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
