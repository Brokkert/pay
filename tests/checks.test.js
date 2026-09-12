import { describe, it, expect } from 'vitest';
import { forMonth } from '../src/lib/ledger.js';
import { runChecks } from '../src/lib/checks.js';

const ME = 'p-me';
const PARTNER = 'p-partner';
const people = [
  { id: ME, name: 'Ik', isMe: true },
  { id: PARTNER, name: 'Partner' },
];
const bills = { id: 'a-bills', name: 'Vaste lasten', kind: 'shared', members: [ME, PARTNER] };
const expense = (o) => ({
  cadence: 'month', category: 'other', from: '2020-01',
  split: { kind: 'equal', participants: [ME, PARTNER] }, ...o,
});
const run = (store) => runChecks(store, forMonth(store, '2026-09'));
const texts = (found) => found.map((f) => f.text).join(' | ');

describe('checking the whole chain at once', () => {
  it('says nothing when there is nothing to say', () => {
    const store = {
      people,
      accounts: [bills],
      expenses: [expense({ id: '1', name: 'Energie', amount: 9000,
        payer: { kind: 'account', id: 'a-bills' } })],
    };
    expect(run(store)).toEqual([]);
  });

  it('catches a share nobody carries', () => {
    const store = {
      people,
      accounts: [bills],
      expenses: [expense({ id: '1', name: 'Energie', amount: 9000,
        payer: { kind: 'account', id: 'a-bills' },
        split: { kind: 'amount', weights: { [ME]: 4000, [PARTNER]: 4000 } } })],
    };
    const found = run(store);
    expect(found.some((f) => f.tone === 'warn')).toBe(true);
    expect(texts(found)).toMatch(/10,00/);
  });

  it('catches a yearly post with no charge month', () => {
    const store = {
      people,
      accounts: [bills],
      expenses: [expense({ id: '1', name: 'Verzekering', amount: 12000, cadence: 'year',
        from: '', payer: { kind: 'account', id: 'a-bills' } })],
    };
    const found = run(store);
    expect(found.some((f) => f.tone === 'warn' && /afgeschreven/.test(f.text))).toBe(true);
  });

  it('says nothing about what merely asks something of you', () => {
    const store = {
      people,
      accounts: [{ ...bills, contributions: { [ME]: 6000, [PARTNER]: 6000 } }],
      expenses: [
        // A standing order well over what the posts need, and a quarterly bill
        // whose year does not divide by twelve. Both worth knowing, both on the
        // account they are about — not in a list at the top of another screen.
        expense({ id: '1', name: 'Wegenbelasting', amount: 21700, cadence: 'quarter',
          chargeMonth: 1, payer: { kind: 'account', id: 'a-bills' } }),
      ],
    };
    expect(run(store)).toEqual([]);
  });
});
