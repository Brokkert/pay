// Uitnodigingen voor je huishouden.
//
// Net als bij Camp bewaart de database alleen een SHA-256-hash van de code. De
// code zelf staat uitsluitend in de link die jij doorstuurt — wie de database
// leest, kan er geen werkende uitnodiging uit terugrekenen.

import { getClient } from './supabase.js';

const hex = (buffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hash(code) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)));
}

function verzinCode() {
  const ruw = crypto.getRandomValues(new Uint8Array(16));
  return [...ruw].map((b) => b.toString(36)).join('').slice(0, 22);
}

export function uitnodigingsLink(code) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/join/${code}`;
}

export async function maakUitnodiging({ maxKeer = 1, dagenGeldig = 14 } = {}) {
  const supabase = getClient();
  if (!supabase) throw new Error('Niet verbonden.');
  const code = verzinCode();
  const verloopt = dagenGeldig
    ? new Date(Date.now() + dagenGeldig * 864e5).toISOString()
    : null;

  const { error } = await supabase.from('pay_uitnodigingen').insert({
    code_hash: await hash(code),
    max_keer: maxKeer || null,
    verloopt_op: verloopt,
  });
  if (error) throw error;
  return { code, link: uitnodigingsLink(code) };
}

export async function lijstUitnodigingen() {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pay_uitnodigingen').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function trekIn(id) {
  const supabase = getClient();
  if (!supabase) throw new Error('Niet verbonden.');
  const { error } = await supabase
    .from('pay_uitnodigingen').update({ ingetrokken_op: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
