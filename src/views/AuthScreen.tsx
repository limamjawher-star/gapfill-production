'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { AuthViewMode } from '../types/gapfill';
import { validateAuthForm } from '../utils/authValidation';
import { isSupabaseConfigured } from '../lib/supabase';
import authHostWelcomeImg from '../assets/images/auth_host_welcome_1794857501227.jpg';
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Home,
  Lock,
  Mail,
  ShieldCheck,
  TrendingUp,
  User,
} from 'lucide-react';

interface AuthScreenProps {
  mode: AuthViewMode;
  onChangeMode: (mode: AuthViewMode) => void;
  sessionExpired: boolean;
  onSignIn: (email: string, password: string) => Promise<{ ok: boolean; message: string }>;
  onSignUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<{ ok: boolean; message: string }>;
  onForgotPassword: (email: string) => Promise<{ ok: boolean; message: string }>;
  onResetPassword: (newPassword: string) => Promise<{ ok: boolean; message: string }>;
  onEnterDemoSandbox: () => void;
}

export function AuthScreen({
  mode,
  onChangeMode,
  sessionExpired,
  onSignIn,
  onSignUp,
  onForgotPassword,
  onResetPassword,
  onEnterDemoSandbox,
}: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const supabaseConnected = isSupabaseConfigured();

  const switchMode = (nextMode: AuthViewMode) => {
    onChangeMode(nextMode);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleFillTestAccount = () => {
    setEmail('clara@horizonstays.com');
    setPassword('GapFill2026!');
    setErrorMessage(null);
    setSuccessMessage(null);
    if (mode !== 'login') {
      onChangeMode('login');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    const check = validateAuthForm({
      mode,
      email,
      password,
      confirmPassword,
      fullName,
    });

    if (!check.valid) {
      setErrorMessage(check.error);
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        const res = await onSignIn(check.normalizedEmail, password);
        if (!res.ok) {
          setErrorMessage(res.message);
        }
      } else if (mode === 'signup') {
        const res = await onSignUp(check.normalizedEmail, password, fullName);
        if (!res.ok) {
          setErrorMessage(res.message);
        } else {
          setSuccessMessage(res.message);
        }
      } else if (mode === 'forgot_password') {
        const res = await onForgotPassword(check.normalizedEmail);
        if (!res.ok) {
          setErrorMessage(res.message);
        } else {
          setSuccessMessage(res.message);
        }
      } else if (mode === 'reset_password') {
        const res = await onResetPassword(password);
        if (!res.ok) {
          setErrorMessage(res.message);
        } else {
          setSuccessMessage(res.message);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-between bg-white text-[#222222]">
      {/* Clean 3-Zone Top Bar */}
      <header className="border-b border-[#EBEBEB] bg-white">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-8 px-6">
          <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
            <Home className="h-6 w-6 text-[#FF385C]" strokeWidth={2.3} />
            <span className="font-display text-xl font-extrabold tracking-tight text-[#FF385C]">
              gapfill
            </span>
          </div>

          <nav
            aria-label="Authentication view switcher"
            className="hidden items-center gap-6 text-sm font-medium text-[#717171] md:flex"
          >
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`transition-colors whitespace-nowrap shrink-0 ${
                mode === 'login'
                  ? 'font-semibold text-[#222222] underline underline-offset-8'
                  : 'hover:text-[#222222]'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`transition-colors whitespace-nowrap shrink-0 ${
                mode === 'signup'
                  ? 'font-semibold text-[#222222] underline underline-offset-8'
                  : 'hover:text-[#222222]'
              }`}
            >
              Sign Up
            </button>
            <button
              type="button"
              onClick={() => switchMode('forgot_password')}
              className={`transition-colors whitespace-nowrap shrink-0 ${
                mode === 'forgot_password'
                  ? 'font-semibold text-[#222222] underline underline-offset-8'
                  : 'hover:text-[#222222]'
              }`}
            >
              Forgot Password
            </button>
            <button
              type="button"
              onClick={() => switchMode('reset_password')}
              className={`transition-colors whitespace-nowrap shrink-0 ${
                mode === 'reset_password'
                  ? 'font-semibold text-[#222222] underline underline-offset-8'
                  : 'hover:text-[#222222]'
              }`}
            >
              Reset Password
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onEnterDemoSandbox}
              className="rounded-full border border-[#DDDDDD] bg-white px-4 py-2 text-sm font-medium text-[#222222] transition-shadow hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)] whitespace-nowrap shrink-0"
            >
              Explore DEMO Sandbox
            </button>
          </div>
        </div>
      </header>

      {/* Main Balanced Two-Column Hospitality Layout */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-10 sm:px-6 lg:py-14">
        <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-12 lg:items-stretch">
          {/* Left 6 Cols: Editorial Listing Showcase & Trust Guarantees */}
          <div className="flex flex-col justify-between space-y-6 lg:col-span-6">
            <div className="space-y-4">
              <p className="text-sm font-semibold text-[#FF385C]">
                Built for Airbnb &amp; Independent Short-Term Rental Hosts
              </p>
              <h1 className="font-display text-3xl leading-[1.15] font-bold tracking-tight text-[#222222] text-balance sm:text-4xl">
                Turn empty nights between bookings into confirmed revenue.
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-[#717171]">
                GapFill scans your Airbnb iCal calendars for orphaned nights between
                check-ins, keeps your minimum rate floor safe, and drafts ready-to-send
                guest extensions without extra turnover.
              </p>
            </div>

            {/* Warm Hospitality Interior Photograph */}
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[#EBEBEB] bg-[#F7F7F7]">
              <Image
                src={authHostWelcomeImg}
                alt="Sunlit Airbnb living room prepared for arriving guests"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 560px"
                referrerPolicy="no-referrer"
                className="object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-5 text-white">
                <div className="font-display text-sm font-semibold">
                  Keep more bookings without undercutting your listing
                </div>
                <div className="mt-0.5 text-xs text-white/85">
                  Automatic rate-floor protection · Zero guest PII sent to AI
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-[#EBEBEB] pt-5 text-sm text-[#717171] sm:grid-cols-3">
              <div className="flex items-start gap-2.5">
                <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#222222]" />
                <div>
                  <div className="font-semibold text-[#222222]">Exact Turnovers</div>
                  <div className="text-xs">Matches Airbnb check-in &amp; checkout dates</div>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#008A05]" />
                <div>
                  <div className="font-semibold text-[#222222]">Encrypted Links</div>
                  <div className="text-xs">Private iCal URLs stay strictly server-side</div>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-[#FF385C]" />
                <div>
                  <div className="font-semibold text-[#222222]">Honest Totals</div>
                  <div className="text-xs">Confirmed fills tracked apart from estimates</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right 6 Cols: Airbnb-Styled Host Sign-In Card */}
          <div className="flex flex-col justify-center lg:col-span-6">
            <div className="rounded-2xl border border-[#DDDDDD] bg-white p-6 shadow-[0_6px_24px_rgba(0,0,0,0.08)] sm:p-8">
              {/* Segmented Auth Mode Switcher */}
              <div className="mb-6 flex items-center justify-between gap-1 rounded-xl bg-[#F7F7F7] p-1">
                {(
                  [
                    { id: 'login', label: 'Sign In' },
                    { id: 'signup', label: 'Sign Up' },
                    { id: 'forgot_password', label: 'Forgot' },
                    { id: 'reset_password', label: 'Reset' },
                  ] as { id: AuthViewMode; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => switchMode(tab.id)}
                    className={`flex-1 rounded-lg px-2.5 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                      mode === tab.id
                        ? 'bg-white text-[#222222] shadow-xs'
                        : 'text-[#717171] hover:text-[#222222]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="mb-6">
                <h2 className="font-display text-xl font-bold text-[#222222]">
                  {mode === 'login' && 'Welcome back to GapFill'}
                  {mode === 'signup' && 'Create your GapFill Host account'}
                  {mode === 'forgot_password' && 'Reset your host password'}
                  {mode === 'reset_password' && 'Choose a new password'}
                </h2>
                <p className="mt-1 text-sm text-[#717171]">
                  {mode === 'login' &&
                    'Sign in to manage your Airbnb calendars, rate floors, and open gap nights.'}
                  {mode === 'signup' &&
                    'Start recovering empty nights across 1–10 short-term rental listings.'}
                  {mode === 'forgot_password' &&
                    'Enter your host email and we will send password recovery instructions.'}
                  {mode === 'reset_password' &&
                    'Enter and confirm your new 8+ character password below.'}
                </p>
              </div>

              {sessionExpired && (
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#F59E0B]/40 bg-[#FFF8EB] p-3.5 text-xs text-[#92400E]"
                >
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" />
                  <span>
                    <strong>Session expired:</strong> Please sign in again to access your private
                    host workspace.
                  </span>
                </div>
              )}

              {errorMessage && (
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#C13515]/30 bg-[#FFF8F6] p-3.5 text-xs text-[#C13515]"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div
                  role="status"
                  className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#008A05]/30 bg-[#F2FAF3] p-3.5 text-xs text-[#008A05]"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {mode === 'signup' && (
                  <div>
                    <label
                      htmlFor="gate-full-name"
                      className="block text-xs font-semibold text-[#222222]"
                    >
                      Host or Co-Host Name
                    </label>
                    <div className="relative mt-1.5">
                      <User className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-[#717171]" />
                      <input
                        id="gate-full-name"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Clara Moreau · Horizon Stays"
                        className="w-full rounded-lg border border-[#B0B0B0] bg-white py-2.5 pr-3.5 pl-10 text-sm text-[#222222] placeholder:text-[#717171]/70 focus:border-[#222222] focus:outline-hidden"
                      />
                    </div>
                  </div>
                )}

                {mode !== 'reset_password' && (
                  <div>
                    <label
                      htmlFor="gate-email"
                      className="block text-xs font-semibold text-[#222222]"
                    >
                      Host Email Address
                    </label>
                    <div className="relative mt-1.5">
                      <Mail className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-[#717171]" />
                      <input
                        id="gate-email"
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
                        htmlFor="gate-password"
                        className="block text-xs font-semibold text-[#222222]"
                      >
                        {mode === 'reset_password' ? 'New Password' : 'Password'}
                      </label>
                      {mode === 'login' && (
                        <button
                          type="button"
                          onClick={() => switchMode('forgot_password')}
                          className="text-xs font-semibold text-[#222222] underline hover:text-[#FF385C]"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative mt-1.5">
                      <Lock className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-[#717171]" />
                      <input
                        id="gate-password"
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
                      htmlFor="gate-confirm-password"
                      className="block text-xs font-semibold text-[#222222]"
                    >
                      Confirm New Password
                    </label>
                    <div className="relative mt-1.5">
                      <Lock className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-[#717171]" />
                      <input
                        id="gate-confirm-password"
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
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#FF385C] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#E00B41] disabled:opacity-50"
                >
                  <span>
                    {mode === 'login' && 'Continue to Host Workspace'}
                    {mode === 'signup' && 'Create Host Account'}
                    {mode === 'forgot_password' && 'Send Password Reset Link'}
                    {mode === 'reset_password' && 'Save New Password'}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              {/* Quiet Test Host Helper + Sandbox Link */}
              <div className="mt-6 space-y-3 border-t border-[#EBEBEB] pt-5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F7F7F7] px-3.5 py-2.5">
                  <div>
                    <span className="font-semibold text-[#222222]">Preview Host Login:</span>{' '}
                    <span className="text-[#717171]">clara@horizonstays.com</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleFillTestAccount}
                    className="font-semibold text-[#222222] underline hover:text-[#FF385C] whitespace-nowrap shrink-0"
                  >
                    Autofill Host Login
                  </button>
                </div>

                <div className="flex flex-col items-center justify-between gap-2 text-[#717171] sm:flex-row">
                  <span>Want to explore sample properties first?</span>
                  <button
                    type="button"
                    onClick={onEnterDemoSandbox}
                    className="font-semibold text-[#222222] underline hover:text-[#FF385C] whitespace-nowrap"
                  >
                    Enter Isolated DEMO Sandbox →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-[#EBEBEB] bg-[#F7F7F7] px-6 py-4 text-xs text-[#717171]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <span>GapFill — Independent Short-Term Rental Host Revenue Intelligence</span>
          <span>
            {supabaseConnected
              ? 'Protected Host Workspace · Supabase Auth Active'
              : 'Protected Host Workspace · Private Session Guard Active'}
          </span>
        </div>
      </footer>
    </div>
  );
}
