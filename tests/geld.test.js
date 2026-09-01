import { describe, it, expect } from 'vitest';
import { parseGeld, toonGeld, toonKort, alsInvoer } from '../src/lib/geld.js';

describe('parseGeld', () => {
  it('leest Nederlandse notatie', () => {
    expect(parseGeld('12,50')).toBe(1250);
    expect(parseGeld('€ 12,50')).toBe(1250);
    expect(parseGeld('1.234,56')).toBe(123456);
    expect(parseGeld('12,5')).toBe(1250);
  });

  it('leest Engelse notatie, want die plak je net zo vaak', () => {
    expect(parseGeld('12.50')).toBe(1250);
    expect(parseGeld('1,234.56')).toBe(123456);
  });

  it('herkent een duizendtalscheiding aan de drie cijfers erachter', () => {
    expect(parseGeld('1.234')).toBe(123400);
    expect(parseGeld('12.345')).toBe(1234500);
    expect(parseGeld('1.234.567')).toBe(123456700);
    // Maar niet als er niets zinnigs voor staat, en nooit bij een komma —
    // die is hier decimaal.
    expect(parseGeld('0.001')).toBe(0);
    expect(parseGeld('10,999')).toBe(1100);
    // En al helemaal niet als de reeks er niet als groepen van drie uitziet —
    // dat is wat je krijgt als iemand in een veld typt waar al iets in stond.
    expect(parseGeld('0,0012,50')).toBe(1250);
  });

  it('gaat om met hele getallen en rommel eromheen', () => {
    expect(parseGeld('9')).toBe(900);
    expect(parseGeld('  EUR 9  ')).toBe(900);
    expect(parseGeld('-12,50')).toBe(-1250);
    expect(parseGeld('')).toBe(null);
    expect(parseGeld('n.v.t.')).toBe(null);
  });

  it('rondt af op hele centen', () => {
    expect(parseGeld('0,005')).toBe(1);
  });
});

describe('tonen', () => {
  it('zet centen om naar een leesbaar bedrag', () => {
    expect(toonGeld(1250)).toBe('€ 12,50');
    expect(toonGeld(123456)).toBe('€ 1.234,56');
    expect(toonGeld(-500)).toBe('−€ 5,00');
    expect(toonGeld(0)).toBe('€ 0,00');
  });

  it('laat centen weg als het bedrag rond is', () => {
    expect(toonKort(120000)).toBe('€ 1.200');
    expect(toonKort(120050)).toBe('€ 1.200,50');
  });

  it('geeft een invoerveld iets om mee te beginnen', () => {
    expect(alsInvoer(1250)).toBe('12,50');
    expect(alsInvoer(null)).toBe('');
  });

  it('leest terug wat het schrijft', () => {
    for (const centen of [0, 1, 99, 100, 12345, 999999]) {
      expect(parseGeld(alsInvoer(centen))).toBe(centen);
    }
  });
});
