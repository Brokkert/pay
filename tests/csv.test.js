import { describe, it, expect } from 'vitest';
import { toCsv, parsePaste } from '../src/lib/csv.js';

const people = [{ id: 'a', name: 'Ik', isMe: true }, { id: 'b', name: 'Partner' }];
const accounts = [{ id: 'x', name: 'Vaste lasten', kind: 'shared', members: ['a', 'b'] }];
const expenses = [{
  id: '1', name: 'Energie', amount: 9000, cadence: 'month', category: 'utilities',
  charge: 'Nutsbedrijf', payer: { kind: 'account', id: 'x' },
  split: { kind: 'equal', participants: ['a', 'b'] },
}];

describe('toCsv', () => {
  it('writes a sheet Excel puts straight into columns', () => {
    const rows = toCsv({ expenses, people, accounts }).split('\r\n');
    expect(rows[0].split(';')).toContain('Aandeel Partner');
    expect(rows[0].split(';')).toContain('Incasso');
    expect(rows[1]).toContain('Energie;Energie & water;Nutsbedrijf;90,00');
    expect(rows[1].endsWith('45,00;45,00')).toBe(true);
  });

  it('quotes fields with a semicolon in them', () => {
    const odd = [{ ...expenses[0], name: 'Energie; incl. vastrecht' }];
    expect(toCsv({ expenses: odd, people, accounts })).toContain('"Energie; incl. vastrecht"');
  });
});

describe('parsePaste', () => {
  it('reads what you copy out of Excel', () => {
    expect(parsePaste('Energie\t90,00\nInternet\t49,00')).toEqual([
      { name: 'Energie', amount: 9000, cadence: 'month' },
      { name: 'Internet', amount: 4900, cadence: 'month' },
    ]);
  });

  it('copes with semicolons, currency signs and a header row', () => {
    expect(parsePaste('Omschrijving;Bedrag\nInternet;€ 49,00')).toEqual([
      { name: 'Internet', amount: 4900, cadence: 'month' },
    ]);
  });

  it('picks up a cadence when you paste one alongside', () => {
    expect(parsePaste('Verzekering;300,00;per jaar')).toEqual([
      { name: 'Verzekering', amount: 30000, cadence: 'year' },
    ]);
    // "half jaar" must not be read as "jaar".
    expect(parsePaste('Verzekering;300,00;per half jaar')).toEqual([
      { name: 'Verzekering', amount: 30000, cadence: 'halfyear' },
    ]);
  });

  it('skips lines without an amount', () => {
    expect(parsePaste('\n VASTE LASTEN \nEnergie;90')).toEqual([
      { name: 'Energie', amount: 9000, cadence: 'month' },
    ]);
  });
});
