// Who bears which part of an expense.
//
// All four shapes come down to the same thing: a whole number of cents per
// bearer, adding up to exactly the amount. Not a cent more, not a cent less.
//
// A bearer is usually a person, but does not have to be. Part of your bank
// charges can be a business cost: then the business account bears that part and
// nobody personally. Those bearers are stored as 'account:<id>'; a bare id is a
// person. The arithmetic does not care — they are keys.

export const SPLIT_KINDS = [
  { id: 'equal', label: 'Gelijk', blurb: 'Ieder evenveel.' },
  { id: 'shares', label: 'In delen', blurb: 'Bijvoorbeeld 2 om 1, of naar aantal plekken.' },
  { id: 'percent', label: 'In procenten', blurb: 'Bijvoorbeeld 60/40 naar inkomen.' },
  { id: 'amount', label: 'Vaste bedragen', blurb: 'Je tikt per drager het bedrag in.' },
];

export const emptySplit = (participants = []) => ({ kind: 'equal', participants, weights: {} });

export const ACCOUNT_PREFIX = 'account:';
export const asAccountBearer = (id) => `${ACCOUNT_PREFIX}${id}`;
export const isAccountBearer = (key) => String(key).startsWith(ACCOUNT_PREFIX);
export const accountOfBearer = (key) =>
  isAccountBearer(key) ? String(key).slice(ACCOUNT_PREFIX.length) : null;

/**
 * Everyone who can bear a share.
 *
 * People, plus your business accounts. A business account is not there for show:
 * if a quarter of your bank charges is a business cost, the business bears that
 * quarter and nobody personally. A personal account is deliberately absent — it
 * *is* the person who owns it, so that would be the same thing twice.
 */
export function possibleBearers(people = [], accounts = []) {
  return [
    ...people.map((p) => ({ key: p.id, name: p.name, colour: p.colour, account: null })),
    ...accounts
      .filter((a) => a.kind === 'business')
      .map((a) => ({ key: asAccountBearer(a.id), name: a.name, colour: null, account: a })),
  ];
}

/**
 * Who carries an expense when nobody has said otherwise.
 *
 * Which account the bank empties is not the same question, but it does answer
 * this one nearly every time: a household bill is the household's, and what one
 * of your own accounts pays is yours. So the form fills it in from there rather
 * than asking twice with the same names under each.
 *
 * An account of the business owned by someone answers with that someone, not
 * with itself. A car it pays for is still a car you drive; leaving it off you
 * would take a cost of yours out of your own list, and it is your list. An
 * account only carries a cost that belongs to nobody's life — the accountant,
 * software of the company — and that is a thing you tick on purpose.
 */
export function defaultBearers(payer, people = [], accounts = []) {
  const me = people.find((p) => p.isMe);
  const mine = me ? [me.id] : [];
  if (payer?.kind === 'person') return payer.id ? [payer.id] : mine;
  if (payer?.kind !== 'account') return mine;
  const account = accounts.find((a) => a.id === payer.id);
  if (!account) return mine;
  if (account.kind === 'business' && !account.ownerId) return [asAccountBearer(account.id)];
  if (account.kind === 'shared') {
    const members = (account.members || []).filter((id) => people.some((p) => p.id === id));
    return members.length ? members : mine;
  }
  // A personal account is the person who owns it.
  return account.ownerId ? [account.ownerId] : mine;
}

/** The name behind a key from a split. */
export function bearerName(key, people = [], accounts = []) {
  if (isAccountBearer(key)) {
    return accounts.find((a) => a.id === accountOfBearer(key))?.name || 'rekening';
  }
  return people.find((p) => p.id === key)?.name || 'onbekend';
}

/** Who takes part, in a fixed order — that order decides the leftover cent. */
export function participantsOf(split) {
  const s = split || {};
  if (s.kind === 'amount' || s.kind === 'shares' || s.kind === 'percent') {
    return Object.keys(s.weights || {}).filter((id) => Number(s.weights[id]) > 0);
  }
  return [...(s.participants || [])];
}

/**
 * Divides an amount by weight, using the largest remainder method.
 *
 * Everyone first gets their share rounded down; the cents left over go to
 * whoever was closest to a whole cent. On a tie the first in the given order
 * wins, so the same input always gives the same result — a split that shifts
 * between runs is useless.
 */
export function byWeight(cents, weights) {
  const ids = Object.keys(weights).filter((id) => Number(weights[id]) > 0);
  const total = ids.reduce((sum, id) => sum + Number(weights[id]), 0);
  if (!ids.length || total <= 0) return {};

  const negative = cents < 0;
  const amount = Math.abs(cents);

  const rows = ids.map((id, i) => {
    const exact = (amount * Number(weights[id])) / total;
    const whole = Math.floor(exact);
    return { id, i, whole, rest: exact - whole };
  });

  // At most ids.length - 1 remain, because every round-down loses less than a
  // whole cent.
  const over = amount - rows.reduce((sum, r) => sum + r.whole, 0);
  const order = [...rows].sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let n = 0; n < over; n += 1) order[n].whole += 1;

  const out = {};
  for (const r of rows) out[r.id] = negative ? -r.whole : r.whole;
  return out;
}

/**
 * The amount of an expense across its bearers.
 *
 * Also returns `remainder`: with fixed amounts the parts may not add up to the
 * total. We neither hide that nor quietly push it onto someone — the caller
 * (the ledger) puts it with the payer, and the form warns about it.
 */
export function split(cents, spec) {
  const s = spec || {};

  if (s.kind === 'amount') {
    const parts = {};
    let sum = 0;
    for (const [id, amount] of Object.entries(s.weights || {})) {
      const c = Math.round(Number(amount) || 0);
      if (!c) continue;
      parts[id] = c;
      sum += c;
    }
    return { parts, remainder: cents - sum };
  }

  const weights = {};
  if (s.kind === 'shares' || s.kind === 'percent') {
    for (const [id, w] of Object.entries(s.weights || {})) {
      const n = Number(w);
      if (n > 0) weights[id] = n;
    }
  } else {
    for (const id of s.participants || []) weights[id] = 1;
  }

  const parts = byWeight(cents, weights);
  const sum = Object.values(parts).reduce((total, c) => total + c, 0);
  return { parts, remainder: cents - sum };
}

/** Short description for a list: "gelijk over 4" or "60%/40%". */
export function describeSplit(spec, nameOf) {
  const s = spec || {};
  const ids = participantsOf(s);
  if (!ids.length) return 'niemand';
  if (ids.length === 1) return `helemaal voor ${nameOf(ids[0])}`;

  if (s.kind === 'equal') return `gelijk over ${ids.length}`;
  if (s.kind === 'percent') return ids.map((id) => `${Number(s.weights[id])}%`).join('/');
  if (s.kind === 'shares') return ids.map((id) => Number(s.weights[id])).join(' om ');
  return 'vaste bedragen';
}
