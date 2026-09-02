// The store: people, accounts and expenses.
//
// Everything that is content — a name, an amount, a note — goes through
// encryption before it is written here, and only comes back on the way in. What
// lands in the database or in localStorage is a blob.
//
// What stays outside the blob is the minimum needed to know who may see it: the
// household, the row id, and for a person the link to an account. No names, no
// amounts.
//
// Pay runs in two modes. With a Supabase project behind it everything lives in
// the database, walled off per household. Without one — or when you are not
// signed in — there is local mode: everything in this browser, encrypted there
// as well.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getClient } from './supabase.js';
import { encrypt, decrypt } from './crypto.js';
import { isAccountBearer, asAccountBearer, accountOfBearer } from './split.js';

const LOCAL = 'pay:store';
const cacheKey = (userId) => `pay:cache:${userId}`;

const empty = () => ({ people: [], accounts: [], expenses: [] });

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* full or blocked; not fatal */
  }
};

export const newId = () =>
  crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const TABLE = { people: 'pay_people', accounts: 'pay_accounts', expenses: 'pay_expenses' };

// What stays outside the encryption, per kind. This is all the server sees.
const OPEN_FIELDS = { people: ['linked_user'], accounts: [], expenses: [] };

/** From a plain record to what gets written. */
async function toStorage(kind, record, key) {
  const open = {};
  const content = { ...record };
  delete content.id;
  delete content.created_at;
  delete content.secret;
  for (const field of OPEN_FIELDS[kind]) {
    if (record[field] !== undefined) open[field] = record[field];
    delete content[field];
  }
  if (kind === 'expenses') {
    content.amount = Math.round(Number(content.amount) || 0);
    // Empty date fields arrive from <input type="date"> as ''.
    for (const date of ['from', 'until']) if (content[date] === '') content[date] = null;
  }
  return { ...open, secret: await encrypt(key, content) };
}

/** And back. A row that will not open is skipped rather than crashing the app. */
async function fromStorage(kind, row, key) {
  try {
    const content = await decrypt(key, row.secret);
    if (!content) return null;
    const out = { ...content, id: row.id, created_at: row.created_at };
    for (const field of OPEN_FIELDS[kind]) out[field] = row[field] ?? null;
    return out;
  } catch {
    return null;
  }
}

const allFrom = async (kind, rows, key) =>
  (await Promise.all((rows || []).map((r) => fromStorage(kind, r, key)))).filter(Boolean);

/** The household you belong to, or null in local mode. */
async function myHousehold() {
  const { data, error } = await getClient().rpc('pay_my_household');
  if (error) throw error;
  return data ?? null;
}

export function useStore(user, key) {
  const cloud = Boolean(getClient() && user);
  const [state, setState] = useState(empty);
  const [household, setHousehold] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offline, setOffline] = useState(false);

  const withMe = useCallback(
    async (rows) =>
      (await allFrom('people', rows, key)).map((p) => ({ ...p, isMe: p.linked_user === user?.id })),
    [key, user?.id]
  );

  const refresh = useCallback(async () => {
    setError(null);
    if (!key) {
      setState(empty());
      setLoading(false);
      return;
    }

    if (!cloud) {
      const raw = { ...empty(), ...readJson(LOCAL, empty()) };
      setState({
        people: await allFrom('people', raw.people, key),
        accounts: await allFrom('accounts', raw.accounts, key),
        expenses: await allFrom('expenses', raw.expenses, key),
      });
      setHousehold(null);
      setLoading(false);
      return;
    }

    const supabase = getClient();
    try {
      setHousehold(await myHousehold());
      const [people, accounts, expenses] = await Promise.all([
        supabase.from('pay_people').select('*').order('created_at'),
        supabase.from('pay_accounts').select('*').order('created_at'),
        supabase.from('pay_expenses').select('*').order('created_at'),
      ]);
      const failed = people.error || accounts.error || expenses.error;
      if (failed) throw failed;

      setState({
        // Who "I" am differs per viewer: for you that is your person, for your
        // housemate hers. In the cloud the account link decides that, not a flag
        // in the data — that one is the same for everybody and would point at
        // the wrong person on her screen.
        people: await withMe(people.data),
        accounts: await allFrom('accounts', accounts.data, key),
        expenses: await allFrom('expenses', expenses.data, key),
      });
      setOffline(false);
      // The copy for on the road is encrypted too: it holds the rows exactly as
      // they came out of the database.
      writeJson(cacheKey(user.id), {
        people: people.data,
        accounts: accounts.data,
        expenses: expenses.data,
      });
    } catch (err) {
      // No signal? Fall back on last time's copy.
      const copy = readJson(cacheKey(user.id), null);
      if (copy) {
        setState({
          people: await withMe(copy.people),
          accounts: await allFrom('accounts', copy.accounts, key),
          expenses: await allFrom('expenses', copy.expenses, key),
        });
        setOffline(true);
      } else {
        setError(err.message || String(err));
      }
    }
    setLoading(false);
  }, [cloud, user?.id, key, withMe]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const saveLocal = useCallback(
    async (next) => {
      writeJson(LOCAL, next);
      setState({
        people: await allFrom('people', next.people, key),
        accounts: await allFrom('accounts', next.accounts, key),
        expenses: await allFrom('expenses', next.expenses, key),
      });
    },
    [key]
  );

  const save = useCallback(
    async (kind, record) => {
      if (!key) throw new Error('De kluis is vergrendeld.');
      const stored = await toStorage(kind, record, key);

      if (!cloud) {
        const raw = { ...empty(), ...readJson(LOCAL, empty()) };
        const now = new Date().toISOString();
        raw[kind] = record.id
          ? raw[kind].map((r) => (r.id === record.id ? { ...r, ...stored } : r))
          : [...raw[kind], { ...stored, id: newId(), created_at: now }];
        await saveLocal(raw);
        return record;
      }

      const supabase = getClient();
      if (record.id) {
        const { error: err } = await supabase.from(TABLE[kind]).update(stored).eq('id', record.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from(TABLE[kind]).insert(stored);
        if (err) throw err;
      }
      await refresh();
      return record;
    },
    [cloud, key, saveLocal, refresh]
  );

  const remove = useCallback(
    async (kind, id) => {
      if (!cloud) {
        const raw = { ...empty(), ...readJson(LOCAL, empty()) };
        raw[kind] = raw[kind].filter((r) => r.id !== id);
        await saveLocal(raw);
        return;
      }
      const { error: err } = await getClient().from(TABLE[kind]).delete().eq('id', id);
      if (err) throw err;
      setState((s) => ({ ...s, [kind]: s[kind].filter((r) => r.id !== id) }));
    },
    [cloud, saveLocal]
  );

  /**
   * Importing a whole set at once.
   *
   * The order is not optional: accounts point at people and expenses at both, so
   * the old ids have to be translated before we write them. In the cloud the
   * database hands out the ids, so there it goes row by row.
   */
  const importAll = useCallback(
    async (set) => {
      if (!key) throw new Error('De kluis is vergrendeld.');
      const count = set.people.length + set.accounts.length + set.expenses.length;
      if (!count) return 0;

      if (!cloud) {
        const raw = { ...empty(), ...readJson(LOCAL, empty()) };
        const now = new Date().toISOString();
        for (const kind of ['people', 'accounts', 'expenses']) {
          for (const record of set[kind]) {
            raw[kind].push({ ...(await toStorage(kind, record, key)), id: record.id, created_at: now });
          }
        }
        await saveLocal(raw);
        return count;
      }

      const supabase = getClient();
      const map = new Map();
      for (const kind of ['people', 'accounts', 'expenses']) {
        for (const record of set[kind]) {
          const stored = await toStorage(kind, retarget(record, map), key);
          const { data, error: err } = await supabase
            .from(TABLE[kind]).insert(stored).select('id').single();
          if (err) throw err;
          map.set(record.id, data.id);
        }
      }
      await refresh();
      return count;
    },
    [cloud, key, saveLocal, refresh]
  );

  /** Lifting everything from local mode into your household, after signing in. */
  const migrateLocal = useCallback(async () => {
    const raw = { ...empty(), ...readJson(LOCAL, empty()) };
    const count = await importAll({
      people: await allFrom('people', raw.people, key),
      accounts: await allFrom('accounts', raw.accounts, key),
      expenses: await allFrom('expenses', raw.expenses, key),
    });
    if (count) writeJson(LOCAL, empty());
    return count;
  }, [importAll, key]);

  const localCount = useMemo(() => {
    const l = readJson(LOCAL, empty());
    return (l.people?.length || 0) + (l.accounts?.length || 0) + (l.expenses?.length || 0);
  }, [state]);

  /** Ticking "this is me" on a person. */
  const claim = useCallback(
    async (personId) => {
      if (!cloud) {
        for (const p of state.people) {
          if (Boolean(p.isMe) !== (p.id === personId)) {
            await save('people', { ...p, isMe: p.id === personId });
          }
        }
        return;
      }
      const supabase = getClient();
      const current = state.people.find((p) => p.linked_user === user.id);
      if (current && current.id !== personId) {
        const { error: err } = await supabase
          .from('pay_people').update({ linked_user: null }).eq('id', current.id);
        if (err) throw err;
      }
      const { error: err } = await supabase
        .from('pay_people').update({ linked_user: user.id }).eq('id', personId);
      if (err) throw err;
      await refresh();
    },
    [cloud, state, user?.id, save, refresh]
  );

  return {
    ...state,
    household,
    loading,
    error,
    offline,
    cloud,
    localCount,
    refresh,
    save,
    remove,
    migrateLocal,
    importAll,
    claim,
  };
}

/** Replacing old (local) ids with the new ones from the database. */
function retarget(record, map) {
  const to = (id) => map.get(id) ?? id;
  const out = { ...record };
  if (out.ownerId) out.ownerId = to(out.ownerId);
  if (Array.isArray(out.members)) out.members = out.members.map(to);
  if (out.contributions) {
    out.contributions = Object.fromEntries(
      Object.entries(out.contributions).map(([id, c]) => [to(id), c])
    );
  }
  if (out.payer?.id) out.payer = { ...out.payer, id: to(out.payer.id) };
  if (out.split) {
    const s = { ...out.split };
    if (Array.isArray(s.participants)) s.participants = s.participants.map(to);
    // A weight key is either a person id or "account:<id>"; the prefix has to
    // come off before the lookup, or an account's own share keeps pointing at
    // the id it had before the import.
    if (s.weights) {
      s.weights = Object.fromEntries(
        Object.entries(s.weights).map(([key, w]) => [
          isAccountBearer(key) ? asAccountBearer(to(accountOfBearer(key))) : to(key),
          w,
        ])
      );
    }
    out.split = s;
  }
  return out;
}
