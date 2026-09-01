import { describe, it, expect } from 'vitest';
import { parseMoney, formatMoney, formatShort, toInput } from '../src/lib/money.js';

describe('parseMoney', () => {
  it('reads Dutch notation', () => {
    expect(parseMoney('12,50')).toBe(1250);
    expect(parseMoney('€ 12,50')).toBe(1250);
    expect(parseMoney('1.234,56')).toBe(123456);
    expect(parseMoney('12,5')).toBe(1250);
  });

  it('reads English notation, because you paste that just as often', () => {
    expect(parseMoney('12.50')).toBe(1250);
    expect(parseMoney('1,234.56')).toBe(123456);
  });

  it('recognises a thousands separator by the three digits behind it', () => {
    expect(parseMoney('1.234')).toBe(123400);
    expect(parseMoney('12.345')).toBe(1234500);
    expect(parseMoney('1.234.567')).toBe(123456700);
    // But not when there is nothing sensible in front of it, and never for a
    // comma — that one is decimal here. And not when the sequence does not look
    // like groups of three, which is what you get when someone types into a
    // field that already had something in it.
    expect(parseMoney('0.001')).toBe(0);
    expect(parseMoney('10,999')).toBe(1100);
    expect(parseMoney('0,0012,50')).toBe(1250);
  });

  it('copes with whole numbers and surrounding junk', () => {
    expect(parseMoney('9')).toBe(900);
    expect(parseMoney('  EUR 9  ')).toBe(900);
    expect(parseMoney('-12,50')).toBe(-1250);
    expect(parseMoney('')).toBe(null);
    expect(parseMoney('n.v.t.')).toBe(null);
  });

  it('rounds to whole cents', () => {
    expect(parseMoney('0,005')).toBe(1);
  });
});

describe('formatting', () => {
  it('turns cents into a readable amount', () => {
    expect(formatMoney(1250)).toBe('€ 12,50');
    expect(formatMoney(123456)).toBe('€ 1.234,56');
    expect(formatMoney(-500)).toBe('−€ 5,00');
    expect(formatMoney(0)).toBe('€ 0,00');
  });

  it('drops the cents when the amount is round', () => {
    expect(formatShort(120000)).toBe('€ 1.200');
    expect(formatShort(120050)).toBe('€ 1.200,50');
  });

  it('gives an input field something to start from', () => {
    expect(toInput(1250)).toBe('12,50');
    expect(toInput(null)).toBe('');
  });

  it('reads back what it writes', () => {
    for (const cents of [0, 1, 99, 100, 12345, 999999]) {
      expect(parseMoney(toInput(cents))).toBe(cents);
    }
  });
});
