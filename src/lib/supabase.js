import { createClient } from '@supabase/supabase-js';
import { readConfig } from './config.js';

let client = null;

/** The Supabase client, or null when Pay runs in local mode. */
export function getClient() {
  if (client) return client;
  const { url, key } = readConfig();
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The magic link comes back as #access_token=... in the URL.
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });
  return client;
}

/** Rebuild after the settings change. */
export function resetClient() {
  client = null;
}
