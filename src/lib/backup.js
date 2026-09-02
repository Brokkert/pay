// Reading back a full backup.
//
// The JSON that "Volledige reservekopie" writes out is the only format that
// carries everything: people, accounts, and every expense with its payer and
// its split. Pasting a column of names and amounts cannot do that — it has no
// way to say "four shares, one of which is the business".
//
// Two rules here. Every id is regenerated, so importing twice never collides
// with what is already there; and every field is checked before anything is
// stored, so a wrong file fails on the spot instead of halfway through.

import { newId } from './store.js';
import { CADENCES } from './cadence.js';
import { SPLIT_KINDS, ACCOUNT_PREFIX } from './split.js';
import { CATEGORIES, ACCOUNT_KINDS } from '../data/categories.js';

const CADENCE_IDS = new Set(CADENCES.map((c) => c.id));
const SPLIT_IDS = new Set(SPLIT_KINDS.map((s) => s.id));
const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
const ACCOUNT_KIND_IDS = new Set(ACCOUNT_KINDS.map((k) => k.id));

const fail = (message) => {
  throw new Error(message);
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Whole cents only: a backup that carries 12.5 is a backup we do not trust. */
function cents(value, where) {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${where}: bedrag moet een heel aantal centen zijn, niet ${JSON.stringify(value)}.`);
  }
  return value;
}

/**
 * Turns the text of a backup file into records ready for importAll.
 *
 * Throws an Error in Dutch describing the first thing that is wrong, because
 * that message goes straight to the screen.
 */
export function readBackup(source) {
  let raw;
  try {
    raw = JSON.parse(source);
  } catch {
    fail('Dit is geen geldig JSON-bestand.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Dit bestand bevat geen reservekopie.');

  for (const kind of ['people', 'accounts', 'expenses']) {
    if (!Array.isArray(raw[kind])) fail(`Er ontbreekt een lijst "${kind}" in dit bestand.`);
  }
  if (!raw.expenses.length && !raw.people.length && !raw.accounts.length) {
    fail('Dit bestand is leeg.');
  }

  // Old ids only have to survive this function: everything that refers to one
  // is rewritten below, and what goes in is entirely new.
  const ids = new Map();
  const fresh = (old, where) => {
    const id = text(old);
    if (!id) fail(`${where}: id ontbreekt.`);
    if (ids.has(id)) fail(`${where}: id "${id}" komt twee keer voor.`);
    const made = newId();
    ids.set(id, made);
    return made;
  };
  const known = (old, where, what) => {
    const found = ids.get(text(old));
    if (!found) fail(`${where}: verwijst naar een ${what} die niet in het bestand staat.`);
    return found;
  };
  // A bearer key is either a person id or "account:<id>".
  const bearer = (key, where) => {
    const k = text(key);
    if (!k.startsWith(ACCOUNT_PREFIX)) return known(k, where, 'persoon');
    return ACCOUNT_PREFIX + known(k.slice(ACCOUNT_PREFIX.length), where, 'rekening');
  };

  const people = raw.people.map((p, i) => {
    const where = `Persoon ${i + 1}`;
    const name = text(p?.name) || fail(`${where}: naam ontbreekt.`);
    return {
      id: fresh(p.id, where),
      name,
      colour: text(p.colour) || '#8a9099',
      isMe: p.isMe === true,
    };
  });

  const accounts = raw.accounts.map((a, i) => {
    const where = `Rekening ${i + 1}`;
    const name = text(a?.name) || fail(`${where}: naam ontbreekt.`);
    const kind = text(a.kind);
    if (!ACCOUNT_KIND_IDS.has(kind)) fail(`${where}: soort "${kind}" bestaat niet.`);
    return {
      id: fresh(a.id, where),
      name,
      kind,
      ...(a.ownerId ? { ownerId: known(a.ownerId, where, 'persoon') } : {}),
      ...(Array.isArray(a.members) ? { members: a.members.map((m) => known(m, where, 'persoon')) } : {}),
      ...(a.contributions
        ? {
            contributions: Object.fromEntries(
              Object.entries(a.contributions).map(([id, c]) => [
                known(id, where, 'persoon'),
                cents(c, `${where} (inleg)`),
              ])
            ),
          }
        : {}),
      settlement: a.settlement === true,
    };
  });

  const expenses = raw.expenses.map((e, i) => {
    const where = `Post ${i + 1}${e?.name ? ` (${text(e.name)})` : ''}`;
    const name = text(e?.name) || fail(`${where}: naam ontbreekt.`);

    const cadence = text(e.cadence) || 'month';
    if (!CADENCE_IDS.has(cadence)) fail(`${where}: ritme "${cadence}" bestaat niet.`);

    const category = text(e.category) || 'other';
    if (!CATEGORY_IDS.has(category)) fail(`${where}: categorie "${category}" bestaat niet.`);

    const payerKind = text(e.payer?.kind);
    if (payerKind !== 'person' && payerKind !== 'account') {
      fail(`${where}: betaler moet een persoon of een rekening zijn.`);
    }
    const payer = {
      kind: payerKind,
      id: known(e.payer.id, where, payerKind === 'person' ? 'persoon' : 'rekening'),
    };

    const splitKind = text(e.split?.kind);
    if (!SPLIT_IDS.has(splitKind)) fail(`${where}: verdeling "${splitKind}" bestaat niet.`);
    const participants = Array.isArray(e.split.participants)
      ? e.split.participants.map((p) => bearer(p, where))
      : [];
    const weights = Object.fromEntries(
      Object.entries(e.split.weights || {}).map(([k, w]) => {
        if (typeof w !== 'number' || !Number.isFinite(w) || w < 0) {
          fail(`${where}: gewicht ${JSON.stringify(w)} kan niet.`);
        }
        return [bearer(k, where), w];
      })
    );
    if (!participants.length && !Object.keys(weights).length) {
      fail(`${where}: er draagt niemand een deel.`);
    }

    return {
      id: fresh(e.id ?? newId(), where),
      name,
      amount: cents(e.amount, where),
      cadence,
      category,
      charge: text(e.charge),
      note: text(e.note),
      business: e.business === true,
      paused: e.paused === true,
      ...(text(e.from) ? { from: text(e.from) } : {}),
      ...(text(e.until) ? { until: text(e.until) } : {}),
      payer,
      split: { kind: splitKind, participants, weights },
    };
  });

  return { people, accounts, expenses };
}
