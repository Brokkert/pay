import { describe, it, expect } from 'vitest';
import { chargedIn, formatMonth, isActive, perMonth, perYear, setAside, shiftMonth } from '../src/lib/cadence.js';

describe('perMonth', () => {
  it('converts every cadence to whole cents per month', () => {
    expect(perMonth(1000, 'month')).toBe(1000);
    expect(perMonth(30000, 'year')).toBe(2500);
    expect(perMonth(9000, 'quarter')).toBe(3000);
    expect(perMonth(6000, 'halfyear')).toBe(1000);
    expect(perMonth(1200, 'week')).toBe(5200);
    expect(perMonth(80000, 'once')).toBe(0);
  });

  it('rounds once, and not again and again', () => {
    expect(perMonth(10000, 'year')).toBe(833);
  });
});

describe('perYear', () => {
  it('is the fairest number to compare expenses by', () => {
    expect(perYear(1000, 'month')).toBe(12000);
    expect(perYear(30000, 'year')).toBe(30000);
    expect(perYear(9000, 'quarter')).toBe(36000);
  });
});

describe('isActive', () => {
  const e = (o) => ({ cadence: 'month', ...o });
  it('looks at start, end and pause', () => {
    expect(isActive(e({}), '2026-09')).toBe(true);
    expect(isActive(e({ from: '2026-10-01' }), '2026-09')).toBe(false);
    expect(isActive(e({ from: '2026-09-28' }), '2026-09')).toBe(true);
    expect(isActive(e({ until: '2026-08-31' }), '2026-09')).toBe(false);
    expect(isActive(e({ until: '2026-09-02' }), '2026-09')).toBe(true);
    expect(isActive(e({ paused: true }), '2026-09')).toBe(false);
    expect(isActive(e({ cadence: 'once' }), '2026-09')).toBe(false);
  });
});

describe('months', () => {
  it('shifts across year boundaries', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-09', -12)).toBe('2025-09');
  });

  it('writes a month out in full', () => {
    expect(formatMonth('2026-09')).toBe('september 2026');
  });
});

describe('saving up for what is charged less often', () => {
  const yearly = { cadence: 'year', amount: 60000, from: '2020-03-01' };
  const quarterly = { cadence: 'quarter', amount: 9000, from: '2024-01-15' };

  it('knows which month the money actually leaves', () => {
    expect(chargedIn(yearly, '2026-03')).toBe(true);
    expect(chargedIn(yearly, '2026-04')).toBe(false);
    // Every three months from January: April, July, October.
    expect(chargedIn(quarterly, '2026-07')).toBe(true);
    expect(chargedIn(quarterly, '2026-08')).toBe(false);
    // Monthly ones leave every month by definition.
    expect(chargedIn({ cadence: 'month', amount: 100 }, '2026-08')).toBe(true);
  });

  it('says it does not know rather than guessing', () => {
    expect(chargedIn({ cadence: 'year', amount: 60000 }, '2026-03')).toBe(null);
  });

  it('counts one instalment for every month since it last went out', () => {
    // 600 a year is 50 a month. Charged in March, so by September six are in.
    expect(setAside(yearly, '2026-03')).toBe(0);
    expect(setAside(yearly, '2026-04')).toBe(5000);
    expect(setAside(yearly, '2026-09')).toBe(30000);
    // And a full period is never reached: the next charge empties it.
    expect(setAside(yearly, '2027-02')).toBe(55000);
    expect(setAside(yearly, '2027-03')).toBe(0);
  });

  it('sets nothing aside for something charged every month', () => {
    expect(setAside({ cadence: 'month', amount: 5000, from: '2020-01-01' }, '2026-09')).toBe(0);
  });
});
