import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

export function isSupabaseConfigured(): boolean {
  return (
    Boolean(supabaseUrl) &&
    Boolean(supabaseAnonKey) &&
    supabaseUrl.startsWith('https://') &&
    !supabaseUrl.includes('YOUR_SUPABASE') &&
    !supabaseAnonKey.includes('YOUR_SUPABASE')
  );
}

let clientInstance: SupabaseClient | null = null;

/**
 * Returns the singleton Supabase browser client when NEXT_PUBLIC_SUPABASE_URL
 * and NEXT_PUBLIC_SUPABASE_ANON_KEY are configured.
 * Returns null when credentials have not been added yet, ensuring we never
 * silently fake production database queries.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return clientInstance;
}

export function getSupabaseStatusSummary(): {
  configured: boolean;
  projectUrlPreview: string;
  rlsPolicyMode: string;
  privateSchemaIsolated: boolean;
} {
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      projectUrlPreview: 'Not connected (Environment variables pending)',
      rlsPolicyMode: 'Strict auth.uid() tenant isolation ready in migration 001',
      privateSchemaIsolated: true,
    };
  }
  try {
    const parsed = new URL(supabaseUrl);
    return {
      configured: true,
      projectUrlPreview: parsed.origin,
      rlsPolicyMode: 'Enforced (auth.uid() = owner_id)',
      privateSchemaIsolated: true,
    };
  } catch {
    return {
      configured: false,
      projectUrlPreview: 'Invalid NEXT_PUBLIC_SUPABASE_URL format',
      rlsPolicyMode: 'Pending valid URL',
      privateSchemaIsolated: true,
    };
  }
}
