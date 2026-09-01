// Verbinding met je eigen (gratis) Supabase-project.
//
// Vul deze twee waarden in met wat er in Supabase onder Settings → API staat.
// De publishable key hoort in de broncode thuis: hij is bedoeld om openbaar te
// zijn en geeft in zijn eentje nergens toegang toe — dat regelt Row Level
// Security in de database (zie supabase/schema.sql).
//
// Zolang hier niets staat draait Pay als lokale kluis: alles blijft in deze
// browser, en samen bijhouden is uit.
export const SUPABASE_URL = '';
export const SUPABASE_KEY = '';

// Handig om zonder herbouwen te testen: wat je in Instellingen invult, wint.
const OVERRIDE = 'pay:supabase';

export function readConfig() {
  try {
    const bewaard = JSON.parse(localStorage.getItem(OVERRIDE) || 'null');
    if (bewaard?.url && bewaard?.key) return { url: bewaard.url, key: bewaard.key, bron: 'lokaal' };
  } catch {
    /* kapotte localStorage negeren we gewoon */
  }
  if (SUPABASE_URL && SUPABASE_KEY) {
    return { url: SUPABASE_URL, key: SUPABASE_KEY, bron: 'ingebouwd' };
  }
  return { url: '', key: '', bron: 'geen' };
}

export function writeConfig(url, key) {
  if (!url || !key) localStorage.removeItem(OVERRIDE);
  else localStorage.setItem(OVERRIDE, JSON.stringify({ url: url.trim(), key: key.trim() }));
}

export const isConfigured = () => Boolean(readConfig().url);
