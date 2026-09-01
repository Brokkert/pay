// The keyring: how the household key ends up on this device.
//
// See crypto.js for the why and the maths. This file does the logistics: where
// the package lives, when you have to type your passphrase, and how a second
// person gets in.
//
// The unlocked key sits in this device's localStorage by default, because
// otherwise you type a passphrase every time you open the app and nobody uses
// it. That is a deliberate trade-off, not an oversight: the point of this whole
// construction is that the *key* never reaches the server. Anyone who can get at
// your unlocked phone can get at your bank app too. "Vergrendelen" throws it off.

import { useCallback, useEffect, useState } from 'react';
import { getClient } from './supabase.js';
import {
  newHouseholdKey,
  keyToRaw,
  keyFromRaw,
  wrapWithPassphrase,
  unwrapWithPassphrase,
  newKeyPair,
  publicToJwk,
  privateToRaw,
  privateFromRaw,
  wrapFor,
  unwrapForMe,
  toB64,
  fromB64,
} from './crypto.js';

const WRAPPED = 'pay:key';          // wrapped with your passphrase
const UNLOCKED = 'pay:key:open';    // unlocked, on this device only
const KEYPAIR = 'pay:keypair';      // your private key, while you wait (fast path)

const read = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* blocked localStorage: then you type your passphrase every time */
  }
};

export function clearKeys() {
  for (const k of [WRAPPED, UNLOCKED, KEYPAIR]) write(k, null);
}

/**
 * The state of the keyring.
 *
 *   loading  — still working out what is there
 *   fresh    — no key yet; pick a passphrase
 *   locked   — there is a package; type your passphrase
 *   joining  — an existing household; pick a passphrase to request access
 *   waiting  — access requested, a housemate still has to click
 *   open     — the key is in memory, you can get to work
 */
export function useKeyring(user) {
  const cloud = Boolean(getClient() && user);
  const [key, setKey] = useState(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState(null);
  const [waiting, setWaiting] = useState([]);

  const openWith = useCallback(async (raw) => {
    const k = await keyFromRaw(raw);
    write(UNLOCKED, toB64(raw));
    setKey(k);
    setState('open');
    return k;
  }, []);

  const inspect = useCallback(async () => {
    setError(null);
    const unlocked = read(UNLOCKED);
    if (unlocked) {
      try {
        setKey(await keyFromRaw(fromB64(unlocked)));
        setState('open');
        return;
      } catch {
        write(UNLOCKED, null);
      }
    }

    if (!cloud) {
      setState(read(WRAPPED) ? 'locked' : 'fresh');
      return;
    }

    const supabase = getClient();
    try {
      const [secrets, members, keys] = await Promise.all([
        supabase.from('pay_secrets').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('pay_members').select('user_id'),
        supabase.from('pay_keys').select('*'),
      ]);
      const failed = members.error || keys.error;
      if (failed) throw failed;

      setWaiting((keys.data || []).filter((r) => r.user_id !== user.id && r.public_key && !r.for_me));

      if (secrets.data?.wrapped_key) {
        setState('locked');
        return;
      }

      // Has a housemate already put the key out for me? Then one thing is left:
      // my passphrase, to wrap it my own way.
      const mine = (keys.data || []).find((r) => r.user_id === user.id);
      if (mine?.for_me && (read(KEYPAIR) || secrets.data?.private_wrapped)) {
        setState('locked');
        return;
      }
      if (mine?.public_key) {
        setState('waiting');
        return;
      }

      // If I am the only one here, it starts with me and I make the key.
      setState((members.data || []).length <= 1 ? 'fresh' : 'joining');
    } catch (err) {
      setError(err.message || String(err));
      setState('fresh');
    }
  }, [cloud, user?.id]);

  useEffect(() => {
    setState('loading');
    setKey(null);
    inspect();
  }, [inspect]);

  /** The very first time: make a key and wrap it with your passphrase. */
  const create = useCallback(
    async (passphrase) => {
      const fresh = await newHouseholdKey();
      const raw = await keyToRaw(fresh);
      const pkg = await wrapWithPassphrase(raw, passphrase);
      if (cloud) {
        const { error: err } = await getClient()
          .from('pay_secrets')
          .upsert({ user_id: user.id, wrapped_key: pkg });
        if (err) throw err;
      } else {
        write(WRAPPED, pkg);
      }
      await openWith(raw);
    },
    [cloud, user?.id, openWith]
  );

  /** Every time after that: type your passphrase. */
  const unlock = useCallback(
    async (passphrase) => {
      let pkg = read(WRAPPED);
      let forMe = null;
      let pairPkg = read(KEYPAIR);
      if (cloud) {
        const supabase = getClient();
        const [secrets, keys] = await Promise.all([
          supabase.from('pay_secrets').select('*').eq('user_id', user.id).maybeSingle(),
          supabase.from('pay_keys').select('*').eq('user_id', user.id).maybeSingle(),
        ]);
        pkg = secrets.data?.wrapped_key || null;
        forMe = keys.data?.for_me || null;
        // The wrapped private key also lives in the database, encrypted with
        // this same passphrase. Without that you could only finish on the exact
        // browser where you requested access — request it on your phone, get let
        // in, open your laptop, and you would be stuck.
        pairPkg = pairPkg || secrets.data?.private_wrapped || null;
      }

      if (pkg) {
        await openWith(await unwrapWithPassphrase(pkg, passphrase));
        return;
      }

      // No package of my own yet, but one a housemate wrapped for me: open the
      // private key with my passphrase, then the household key, and store that
      // one my own way from now on.
      if (!forMe || !pairPkg) throw new Error('Er staat nog geen sleutel voor je klaar.');

      const priv = await privateFromRaw(await unwrapWithPassphrase(pairPkg, passphrase));
      const household = await unwrapForMe(forMe, priv);
      const raw = await keyToRaw(household);
      const { error: err } = await getClient().from('pay_secrets').upsert({
        user_id: user.id,
        wrapped_key: await wrapWithPassphrase(raw, passphrase),
        private_wrapped: null,
      });
      if (err) throw err;
      write(KEYPAIR, null);
      await openWith(raw);
    },
    [cloud, user?.id, openWith]
  );

  /** Requesting access: make a key pair and put the public half out there. */
  const requestAccess = useCallback(
    async (passphrase) => {
      const pair = await newKeyPair();
      const wrappedPrivate = await wrapWithPassphrase(await privateToRaw(pair.privateKey), passphrase);
      write(KEYPAIR, wrappedPrivate);

      const supabase = getClient();
      const { error: keyErr } = await supabase
        .from('pay_keys')
        .upsert({ user_id: user.id, public_key: await publicToJwk(pair.publicKey), for_me: null });
      if (keyErr) throw keyErr;
      const { error: secretErr } = await supabase
        .from('pay_secrets')
        .upsert({ user_id: user.id, private_wrapped: wrappedPrivate });
      if (secretErr) throw secretErr;
      setState('waiting');
    },
    [user?.id]
  );

  /** Letting someone in: wrap the household key with their public key. */
  const grantAccess = useCallback(
    async (row) => {
      if (!key) throw new Error('Ontgrendel eerst je eigen kluis.');
      const pkg = await wrapFor(row.public_key, key);
      const { error: err } = await getClient().rpc('pay_share_key', {
        p_user: row.user_id,
        p_package: pkg,
      });
      if (err) throw err;
      await inspect();
    },
    [key, inspect]
  );

  const lock = useCallback(() => {
    write(UNLOCKED, null);
    setKey(null);
    setState('locked');
  }, []);

  return {
    key,
    state,
    error,
    cloud,
    waiting,
    create,
    unlock,
    requestAccess,
    grantAccess,
    lock,
    recheck: inspect,
  };
}
