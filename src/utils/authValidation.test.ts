import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessProtectedWorkspace,
  validateAuthForm,
} from './authValidation';

test('validateAuthForm rejects invalid emails and short passwords', () => {
  const emptyEmail = validateAuthForm({
    mode: 'login',
    email: '   ',
    password: 'password123',
  });
  assert.equal(emptyEmail.valid, false);
  assert.equal(emptyEmail.error, 'Email address is required.');

  const badEmail = validateAuthForm({
    mode: 'login',
    email: 'not-an-email',
    password: 'password123',
  });
  assert.equal(badEmail.valid, false);

  const shortPass = validateAuthForm({
    mode: 'login',
    email: 'host@gapfill.app',
    password: 'short',
  });
  assert.equal(shortPass.valid, false);
  assert.equal(shortPass.error, 'Password must be at least 8 characters long.');

  const validLogin = validateAuthForm({
    mode: 'login',
    email: '  Host@GapFill.app ',
    password: 'securePassword123',
  });
  assert.equal(validLogin.valid, true);
  assert.equal(validLogin.normalizedEmail, 'host@gapfill.app');
});

test('validateAuthForm enforces full name on signup and matching passwords on reset', () => {
  const missingName = validateAuthForm({
    mode: 'signup',
    email: 'host@gapfill.app',
    password: 'securePassword123',
    fullName: 'A',
  });
  assert.equal(missingName.valid, false);

  const mismatchReset = validateAuthForm({
    mode: 'reset_password',
    email: '',
    password: 'newPassword123',
    confirmPassword: 'differentPassword123',
  });
  assert.equal(mismatchReset.valid, false);
  assert.equal(
    mismatchReset.error,
    'New password and confirmation password do not match.'
  );

  const validReset = validateAuthForm({
    mode: 'reset_password',
    email: '',
    password: 'newPassword123',
    confirmPassword: 'newPassword123',
  });
  assert.equal(validReset.valid, true);
});

test('canAccessProtectedWorkspace blocks logged-out visitors and expired sessions from private data', () => {
  // Logged-out visitor attempting to access live_supabase -> blocked
  const loggedOutLive = canAccessProtectedWorkspace({
    isAuthenticated: false,
    isDemoSession: false,
    sessionExpired: false,
    workspaceMode: 'live_supabase',
  });
  assert.equal(loggedOutLive.allowed, false);
  assert.equal(loggedOutLive.reason, 'unauthenticated');

  // Demo session attempting to switch to live_supabase without real auth -> blocked
  const demoTryingLive = canAccessProtectedWorkspace({
    isAuthenticated: false,
    isDemoSession: true,
    sessionExpired: false,
    workspaceMode: 'live_supabase',
  });
  assert.equal(demoTryingLive.allowed, false);
  assert.equal(demoTryingLive.reason, 'unauthenticated');

  // Expired session -> blocked even if previously authenticated
  const expired = canAccessProtectedWorkspace({
    isAuthenticated: true,
    isDemoSession: false,
    sessionExpired: true,
    workspaceMode: 'live_supabase',
  });
  assert.equal(expired.allowed, false);
  assert.equal(expired.reason, 'expired_session');

  // Authenticated host -> allowed
  const authenticated = canAccessProtectedWorkspace({
    isAuthenticated: true,
    isDemoSession: false,
    sessionExpired: false,
    workspaceMode: 'live_supabase',
  });
  assert.equal(authenticated.allowed, true);
  assert.equal(authenticated.reason, 'authenticated');
});
