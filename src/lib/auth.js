// Signing in with a magic link. No passwords to forget — and it saves having a
// password you would otherwise share with your partner, which is exactly what
// you do not want.

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
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      setSession(next ?? null);
      setReady(true);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  return { session, ready, user: session?.user ?? null };
}

/** Where the magic link is allowed to return to. */
function redirectTarget() {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}

/** Is this project still completely empty? Then the first person gets in without an invite. */
export async function needsBootstrap() {
  const supabase = getClient();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('pay_needs_bootstrap');
  if (error) return false;
  return Boolean(data);
}

/**
 * Sends a sign-in mail.
 *
 * Without an invite code this never creates a new user (shouldCreateUser: false)
 * — an unknown address simply gets an error. With a code an account may be
 * created, and the code travels in options.data so the database trigger can
 * check it.
 */
export async function sendMagicLink(email, { invite = null, allowCreate = false } = {}) {
  const supabase = getClient();
  if (!supabase) throw new Error('Pay is nog niet aan een Supabase-project gekoppeld.');

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      emailRedirectTo: redirectTarget(),
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

/**
 * Signing out — taking this device's key with it.
 *
 * The copy for on the road is encrypted, so it is unreadable on its own. But the
 * unlocked key sits next to it, because otherwise you would type your passphrase
 * every time you open the app. Together those two *are* readable, so they do not
 * belong on a computer you are walking away from. Dropping only the session
 * would be locking the door while the window stays open.
 */
export async function signOut() {
  await getClient()?.auth.signOut();
  clearLocalCopy();
}

export function clearLocalCopy() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('pay:cache:') || key.startsWith('pay:key')) localStorage.removeItem(key);
    }
  } catch {
    /* blocked localStorage: then there is nothing in it either */
  }
}
