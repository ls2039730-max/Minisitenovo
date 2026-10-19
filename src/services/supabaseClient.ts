import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Public Supabase configuration for browser/client side
// SECURITY RULE: Never expose SUPABASE_SECRET_KEY or service role keys here!
const supabaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  'https://your-project.supabase.co';

const supabaseAnonKey =
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_SUPABASE_ANON_KEY || import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY)) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy-anon-key';

export const isSupabaseConfigured =
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('your-project') &&
  supabaseAnonKey.length > 20 &&
  !supabaseAnonKey.includes('dummy-anon-key');

/**
 * Public client-side Supabase client for authenticated user operations,
 * Row Level Security (RLS) enforcement, and real-time listeners.
 */
export const supabaseClient: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
