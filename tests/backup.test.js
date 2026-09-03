// Reading a backup back in.
//
// The point of these is the refusals: a file that is wrong has to say so before
// a single row is stored, because a half-finished import is worse than none.

import { describe, it, expect } from 'vitest';
import { readBackup } from '../src/lib/backup.js';
import { exampleHousehold } from '../src/data/example.js';

const backupOf = (set) =>
  JSON.stringify({ version: 2, people: set.people, accounts: set.accounts, expenses: set.expenses });

describe('readBackup', () => {
  it('takes back what the app writes out', () => {
    const set = exampleHousehold();
    const back = readBackup(backupOf(set));

    expect(back.people.length).toBe(set.people.length);
    expect(back.accounts.length).toBe(set.accounts.length);
    expect(back.expenses.length).toBe(set.expenses.length);
    expect(back.expenses.map((e) => e.name)).toEqual(set.expenses.map((e) => e.name));
    expect(back.expenses.map((e) => e.amount)).toEqual(set.expenses.map((e) => e.amount));
  });

  it('gives everything a new id and keeps every reference pointing right', () => {
    const set = exampleHousehold();
    const back = readBackup(backupOf(set));

    const oldIds = new Set([...set.people, ...set.accounts, ...set.expenses].map((r) => r.id));
    for (const record of [...back.people, ...back.accounts, ...back.expenses]) {
      expect(oldIds.has(record.id)).toBe(false);
    }

    const people = new Set(back.people.map((p) => p.id));
    const accounts = new Set(back.accounts.map((a) => a.id));
    for (const account of back.accounts) {
      for (const member of account.members || []) expect(people.has(member)).toBe(true);
      if (account.ownerId) expect(people.has(account.ownerId)).toBe(true);
    }
    for (const expense of back.expenses) {
      const pool = expense.payer.kind === 'person' ? people : accounts;
      expect(pool.has(expense.payer.id)).toBe(true);
      for (const key of [...expense.split.participants, ...Object.keys(expense.split.weights)]) {
        const account = String(key).startsWith('account:');
        expect((account ? accounts : people).has(account ? key.slice(8) : key)).toBe(true);
      }
    }
  });

  it("carries an account's own share across", () => {
    const set = exampleHousehold();
    const business = set.accounts.find((a) => a.kind === 'business');
    const back = readBackup(backupOf(set));

    const charges = back.expenses.find((e) => e.name === 'Bankkosten');
    const borne = Object.keys(charges.split.weights).filter((k) => k.startsWith('account:'));
    expect(borne.length).toBe(1);
    // Repointed at the new account, not left on the old id.
    expect(borne[0]).not.toBe(`account:${business.id}`);
    expect(back.accounts.some((a) => `account:${a.id}` === borne[0])).toBe(true);
  });

  it('refuses what it cannot trust', () => {
    const set = exampleHousehold();
    const bad = (change, message) => {
      const copy = JSON.parse(backupOf(set));
      change(copy);
      expect(() => readBackup(JSON.stringify(copy))).toThrow(message);
    };

    expect(() => readBackup('niet eens json')).toThrow(/geldig JSON/i);
    expect(() => readBackup('{}')).toThrow(/ontbreekt een lijst/i);
    expect(() => readBackup('{"people":[],"accounts":[],"expenses":[]}')).toThrow(/leeg/i);

    bad((c) => { c.expenses[0].amount = 12.5; }, /heel aantal centen/i);
    bad((c) => { c.expenses[0].cadence = 'weekly'; }, /ritme/i);
    bad((c) => { c.expenses[0].name = '   '; }, /naam ontbreekt/i);
    bad((c) => { c.expenses[0].payer = { kind: 'kat', id: 'x' }; }, /persoon of een rekening/i);
    bad((c) => { c.expenses[0].payer.id = 'bestaat-niet'; }, /niet in het bestand/i);
    bad((c) => { c.expenses[0].split.participants = ['bestaat-niet']; }, /niet in het bestand/i);
    bad((c) => { c.expenses[0].split = { kind: 'equal', participants: [], weights: {} }; }, /draagt niemand/i);
    bad((c) => { c.people[1].id = c.people[0].id; }, /twee keer/i);
    bad((c) => { c.accounts[0].kind = 'spaarpot'; }, /soort/i);
  });

  it('fills in the optional fields it is allowed to assume', () => {
    const person = 'p1';
    const account = 'a1';
    const minimal = {
      people: [{ id: person, name: 'Ik', isMe: true }],
      accounts: [{ id: account, name: 'Rekening', kind: 'shared', members: [person] }],
      expenses: [
        {
          name: 'Krant',
          amount: 1250,
          payer: { kind: 'account', id: account },
          split: { kind: 'equal', participants: [person] },
        },
      ],
    };
    const back = readBackup(JSON.stringify(minimal));
    expect(back.expenses[0]).toMatchObject({
      cadence: 'month', category: 'Overig', charge: '', note: '', paused: false,
    });
    // Whether it is business follows from the account, so it is not a field.
    expect(back.expenses[0].business).toBeUndefined();
    expect(back.expenses[0].id).toBeTruthy();
  });
});
