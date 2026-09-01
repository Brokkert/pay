import { describe, it, expect } from 'vitest';
import { perMaand, perJaar, loopt, verschuifMaand, toonMaand } from '../src/lib/ritme.js';

describe('perMaand', () => {
  it('rekent elk ritme om naar hele centen per maand', () => {
    expect(perMaand(1000, 'maand')).toBe(1000);
    expect(perMaand(30000, 'jaar')).toBe(2500);
    expect(perMaand(9000, 'kwartaal')).toBe(3000);
    expect(perMaand(6000, 'halfjaar')).toBe(1000);
    expect(perMaand(1200, 'week')).toBe(5200);
    expect(perMaand(80000, 'eenmalig')).toBe(0);
  });

  it('rondt één keer af en niet steeds opnieuw', () => {
    expect(perMaand(10000, 'jaar')).toBe(833);
  });
});

describe('perJaar', () => {
  it('is het eerlijkste getal om posten mee te vergelijken', () => {
    expect(perJaar(1000, 'maand')).toBe(12000);
    expect(perJaar(30000, 'jaar')).toBe(30000);
    expect(perJaar(9000, 'kwartaal')).toBe(36000);
  });
});

describe('loopt', () => {
  const p = (o) => ({ ritme: 'maand', ...o });
  it('kijkt naar begin, einde en pauze', () => {
    expect(loopt(p({}), '2026-09')).toBe(true);
    expect(loopt(p({ vanaf: '2026-10-01' }), '2026-09')).toBe(false);
    expect(loopt(p({ vanaf: '2026-09-28' }), '2026-09')).toBe(true);
    expect(loopt(p({ tot: '2026-08-31' }), '2026-09')).toBe(false);
    expect(loopt(p({ tot: '2026-09-02' }), '2026-09')).toBe(true);
    expect(loopt(p({ gepauzeerd: true }), '2026-09')).toBe(false);
    expect(loopt(p({ ritme: 'eenmalig' }), '2026-09')).toBe(false);
  });
});

describe('maanden', () => {
  it('schuift over jaargrenzen heen', () => {
    expect(verschuifMaand('2026-09', 1)).toBe('2026-10');
    expect(verschuifMaand('2026-12', 1)).toBe('2027-01');
    expect(verschuifMaand('2026-01', -1)).toBe('2025-12');
    expect(verschuifMaand('2026-09', -12)).toBe('2025-09');
  });

  it('schrijft een maand voluit', () => {
    expect(toonMaand('2026-09')).toBe('september 2026');
  });
});
