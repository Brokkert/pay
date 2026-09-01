import { describe, it, expect } from 'vitest';
import { byWeight, split, describeSplit, possibleBearers, bearerName } from '../src/lib/split.js';

const sum = (o) => Object.values(o).reduce((s, c) => s + c, 0);

describe('byWeight', () => {
  it('divides evenly when it divides evenly', () => {
    expect(byWeight(1000, { a: 1, b: 1 })).toEqual({ a: 500, b: 500 });
  });

  it('loses no cent when it does not divide evenly', () => {
    const out = byWeight(1000, { a: 1, b: 1, c: 1 });
    expect(sum(out)).toBe(1000);
    expect(out).toEqual({ a: 334, b: 333, c: 333 });
  });

  it('always gives the same result for the same input', () => {
    const one = byWeight(10, { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 });
    const two = byWeight(10, { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 });
    expect(one).toEqual(two);
  });

  it('works with unequal weights', () => {
    expect(byWeight(10000, { a: 60, b: 40 })).toEqual({ a: 6000, b: 4000 });
    expect(sum(byWeight(9999, { a: 2, b: 1 }))).toBe(9999);
  });

  it('adds up exactly at every amount', () => {
    for (let cents = 0; cents < 500; cents += 1) {
      for (const weights of [{ a: 1, b: 1, c: 1 }, { a: 3, b: 2, c: 1, d: 1 }, { a: 7, b: 11 }]) {
        expect(sum(byWeight(cents, weights))).toBe(cents);
      }
    }
  });

  it('ignores anyone on zero', () => {
    expect(byWeight(1000, { a: 1, b: 0 })).toEqual({ a: 1000 });
  });
});

describe('split', () => {
  it('divides equally over the participants', () => {
    const { parts, remainder } = split(1000, { kind: 'equal', participants: ['a', 'b'] });
    expect(parts).toEqual({ a: 500, b: 500 });
    expect(remainder).toBe(0);
  });

  it('divides by percentage', () => {
    const { parts } = split(20000, { kind: 'percent', weights: { a: 65, b: 35 } });
    expect(parts).toEqual({ a: 13000, b: 7000 });
  });

  it('divides by shares (two of the five seats)', () => {
    const { parts } = split(1799, { kind: 'shares', weights: { a: 2, b: 1, c: 1, d: 1 } });
    expect(sum(parts)).toBe(1799);
    expect(parts.a).toBeGreaterThan(parts.b);
  });

  it('reports it when fixed amounts do not add up', () => {
    const { parts, remainder } = split(1000, { kind: 'amount', weights: { a: 600, b: 300 } });
    expect(parts).toEqual({ a: 600, b: 300 });
    expect(remainder).toBe(100);
  });
});

describe('bearers', () => {
  const people = [{ id: 'a', name: 'Anne' }, { id: 'b', name: 'Bram' }];
  const accounts = [
    { id: 'x', name: 'Zaak', kind: 'business' },
    { id: 'y', name: 'Privé', kind: 'personal' },
    { id: 'z', name: 'Samen', kind: 'shared' },
  ];

  it('offers people plus business accounts, and nothing else', () => {
    expect(possibleBearers(people, accounts).map((b) => b.key)).toEqual(['a', 'b', 'account:x']);
  });

  it('knows the name behind a key', () => {
    expect(bearerName('a', people, accounts)).toBe('Anne');
    expect(bearerName('account:x', people, accounts)).toBe('Zaak');
  });
});

describe('describeSplit', () => {
  const nameOf = (id) => ({ a: 'Anne', b: 'Bram' }[id] || id);
  it('sums the split up', () => {
    expect(describeSplit({ kind: 'equal', participants: ['a', 'b'] }, nameOf)).toBe('gelijk over 2');
    expect(describeSplit({ kind: 'equal', participants: ['a'] }, nameOf)).toBe('helemaal voor Anne');
    expect(describeSplit({ kind: 'percent', weights: { a: 60, b: 40 } }, nameOf)).toBe('60%/40%');
  });
});
