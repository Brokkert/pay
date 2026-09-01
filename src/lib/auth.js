// Inloggen met een magic link. Geen wachtwoorden om te vergeten — en het scheelt
// een wachtwoord dat je met je vriendin zou moeten delen, want dat is precies
// wat je niet wilt.

import { useEffect, useState } from 'react';
import { getClient } from './supabase.js';

export function useSession() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getClient();
    if (!supabase) {
      setReady(true);
      return;
    }
    let leeft = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!leeft) return;
      setSession(data.session ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_gebeurtenis, volgende) => {
      if (!leeft) return;
      setSession(volgende ?? null);
      setReady(true);
    });

    return () => {
      leeft = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  return { session, ready, user: session?.user ?? null };
}

/** Waar de magic link naartoe moet terugkeren. */
function terugNaar() {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}

/** Is dit project nog helemaal leeg? Dan mag de eerste erin zonder uitnodiging. */
export async function needsBootstrap() {
  const supabase = getClient();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('pay_needs_bootstrap');
  if (error) return false;
  return Boolean(data);
}

/**
 * Stuurt een inlogmail.
 *
 * Zonder uitnodigingscode maakt dit nooit een nieuwe gebruiker aan
 * (shouldCreateUser: false) — een onbekend adres krijgt gewoon een foutmelding.
 * Mét code mag er wel een account bij, en gaat de code mee in options.data zodat
 * de trigger in de database hem kan controleren.
 */
export async function sendMagicLink(email, { invite = null, allowCreate = false } = {}) {
  const supabase = getClient();
  if (!supabase) throw new Error('Pay is nog niet aan een Supabase-project gekoppeld.');

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      emailRedirectTo: terugNaar(),
      shouldCreateUser: Boolean(invite) || allowCreate,
      ...(invite ? { data: { invite } } : {}),
    },
  });
  if (error) throw error;
}

export async function verifyCode(email, code) {
  const supabase = getClient();
  if (!supabase) throw new Error('Pay is nog niet aan een Supabase-project gekoppeld.');
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'email',
  });
  if (error) throw error;
}

export async function signOut() {
  await getClient()?.auth.signOut();
}
