import { describe, it, expect } from 'vitest';
import { perMonth, perYear, isActive, shiftMonth, formatMonth } from '../src/lib/cadence.js';

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
