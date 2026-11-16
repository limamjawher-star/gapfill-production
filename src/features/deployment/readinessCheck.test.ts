import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDeploymentReadiness } from './readinessCheck';

test('evaluateDeploymentReadiness reports ready_for_host_pilot when all env vars are configured', () => {
  const report = evaluateDeploymentReadiness({
    geminiApiKey: 'AIzaTestKey12345',
    supabaseUrl: 'https://demo-project.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
    appUrl: 'https://gapfill.example.com',
  });
  assert.equal(report.overallStatus, 'ready_for_host_pilot');
  assert.equal(report.freeTierCompliant, true);
  assert.equal(
    report.checks.every((c) => c.status === 'ready'),
    true
  );
});

test('evaluateDeploymentReadiness gracefully falls back when optional keys are placeholders', () => {
  const report = evaluateDeploymentReadiness({
    geminiApiKey: 'MY_GEMINI_API_KEY',
    supabaseUrl: '',
    supabaseAnonKey: '',
    appUrl: 'MY_APP_URL',
  });
  assert.equal(report.overallStatus, 'ready_with_local_fallbacks');
  assert.equal(
    report.checks.find((c) => c.id === 'gemini_free_tier')?.status,
    'fallback_active'
  );
  assert.equal(
    report.checks.find((c) => c.id === 'zero_paid_dependencies')?.status,
    'ready'
  );
});
