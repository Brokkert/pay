// Connection to your own (free) Supabase project.
//
// Fill in the two values from Supabase under Settings → API. The publishable key
// belongs in source code: it is meant to be public and grants nothing on its own
// — Row Level Security handles that (see supabase/schema.sql).
//
// While these are empty, Pay runs in local mode: everything stays in this
// browser and sharing is off.
export const SUPABASE_URL = '';
export const SUPABASE_KEY = '';

// Handy for testing without a rebuild: what you fill in under Settings wins.
const OVERRIDE = 'pay:supabase';

export function readConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(OVERRIDE) || 'null');
    if (saved?.url && saved?.key) return { url: saved.url, key: saved.key, source: 'local' };
  } catch {
    /* broken localStorage is simply ignored */
  }
  if (SUPABASE_URL && SUPABASE_KEY) {
    return { url: SUPABASE_URL, key: SUPABASE_KEY, source: 'built-in' };
  }
  return { url: '', key: '', source: 'none' };
}

export function writeConfig(url, key) {
  if (!url || !key) localStorage.removeItem(OVERRIDE);
  else localStorage.setItem(OVERRIDE, JSON.stringify({ url: url.trim(), key: key.trim() }));
}

export const isConfigured = () => Boolean(readConfig().url);
