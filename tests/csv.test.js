import { describe, it, expect } from 'vitest';
import { naarCsv, leesPlak } from '../src/lib/csv.js';

const personen = [{ id: 'a', naam: 'Ik', is_mij: true }, { id: 'b', naam: 'Anne' }];
const rekeningen = [{ id: 'r', naam: 'Gezamenlijk', soort: 'gezamenlijk', deelnemers: ['a', 'b'] }];
const posten = [{
  id: '1', naam: 'Huur', bedrag: 140000, ritme: 'maand', categorie: 'wonen',
  betaler: { soort: 'rekening', id: 'r' },
  verdeling: { soort: 'gelijk', deelnemers: ['a', 'b'] },
}];

describe('naarCsv', () => {
  it('schrijft een blad dat Excel meteen in kolommen zet', () => {
    const regels = naarCsv({ posten, personen, rekeningen }).split('\r\n');
    expect(regels[0].split(';')).toContain('Aandeel Anne');
    expect(regels[1]).toContain('Huur;Wonen;1400,00');
    expect(regels[1].endsWith('700,00;700,00')).toBe(true);
  });

  it('zet aanhalingstekens om velden met een puntkomma erin', () => {
    const raar = [{ ...posten[0], naam: 'Huur; incl. servicekosten' }];
    expect(naarCsv({ posten: raar, personen, rekeningen })).toContain('"Huur; incl. servicekosten"');
  });
});

describe('leesPlak', () => {
  it('leest wat je uit Excel kopieert', () => {
    expect(leesPlak('Huur\t1400,00\nNetflix\t13,99')).toEqual([
      { naam: 'Huur', bedrag: 140000, ritme: 'maand' },
      { naam: 'Netflix', bedrag: 1399, ritme: 'maand' },
    ]);
  });

  it('gaat om met puntkomma\'s, euro-tekens en een kopregel', () => {
    expect(leesPlak('Omschrijving;Bedrag\nInternet;€ 49,00')).toEqual([
      { naam: 'Internet', bedrag: 4900, ritme: 'maand' },
    ]);
  });

  it('pikt een ritme op als je dat erbij hebt staan', () => {
    expect(leesPlak('Opstalverzekering;300,00;per jaar')).toEqual([
      { naam: 'Opstalverzekering', bedrag: 30000, ritme: 'jaar' },
    ]);
  });

  it('slaat regels zonder bedrag over', () => {
    expect(leesPlak('\n VASTE LASTEN \nHuur;1400')).toEqual([
      { naam: 'Huur', bedrag: 140000, ritme: 'maand' },
    ]);
  });
});
