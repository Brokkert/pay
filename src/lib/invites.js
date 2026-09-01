// Invites for your household.
//
// The database only keeps a SHA-256 hash of the code. The code itself lives
// solely in the link you forward — whoever reads the database cannot reconstruct
// a working invite from it. And there is no key in the link either: see
// crypto.js for how someone actually gets access.

import { getClient } from './supabase.js';

const hex = (buffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hash(code) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)));
}

function makeCode() {
  const raw = crypto.getRandomValues(new Uint8Array(16));
  return [...raw].map((b) => b.toString(36)).join('').slice(0, 22);
}

export function inviteLink(code) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/join/${code}`;
}

export async function createInvite({ maxUses = 1, daysValid = 14 } = {}) {
  const supabase = getClient();
  if (!supabase) throw new Error('Niet verbonden.');
  const code = makeCode();
  const expires = daysValid ? new Date(Date.now() + daysValid * 864e5).toISOString() : null;

  const { error } = await supabase.from('pay_invites').insert({
    code_hash: await hash(code),
    max_uses: maxUses || null,
    expires_at: expires,
  });
  if (error) throw error;
  return { code, link: inviteLink(code) };
}

export async function listInvites() {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pay_invites').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function revokeInvite(id) {
  const supabase = getClient();
  if (!supabase) throw new Error('Niet verbonden.');
  const { error } = await supabase
    .from('pay_invites').update({ revoked_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
