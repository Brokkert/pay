import { describe, it, expect } from 'vitest';
import { naarGewicht, verdeel, omschrijfVerdeling } from '../src/lib/verdeel.js';

const som = (o) => Object.values(o).reduce((s, c) => s + c, 0);

describe('naarGewicht', () => {
  it('deelt gelijk als het gelijk opgaat', () => {
    expect(naarGewicht(1000, { a: 1, b: 1 })).toEqual({ a: 500, b: 500 });
  });

  it('laat geen cent verdwijnen als het niet opgaat', () => {
    const uit = naarGewicht(1000, { a: 1, b: 1, c: 1 });
    expect(som(uit)).toBe(1000);
    expect(uit).toEqual({ a: 334, b: 333, c: 333 });
  });

  it('geeft dezelfde invoer altijd dezelfde uitkomst', () => {
    const een = naarGewicht(10, { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 });
    const twee = naarGewicht(10, { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 });
    expect(een).toEqual(twee);
  });

  it('werkt met ongelijke gewichten', () => {
    expect(naarGewicht(10000, { a: 60, b: 40 })).toEqual({ a: 6000, b: 4000 });
    expect(som(naarGewicht(9999, { a: 2, b: 1 }))).toBe(9999);
  });

  it('telt bij elk bedrag precies op', () => {
    for (let centen = 0; centen < 500; centen += 1) {
      for (const gewichten of [{ a: 1, b: 1, c: 1 }, { a: 3, b: 2, c: 1, d: 1 }, { a: 7, b: 11 }]) {
        expect(som(naarGewicht(centen, gewichten))).toBe(centen);
      }
    }
  });

  it('negeert wie op nul staat', () => {
    expect(naarGewicht(1000, { a: 1, b: 0 })).toEqual({ a: 1000 });
  });
});

describe('verdeel', () => {
  it('verdeelt gelijk over de deelnemers', () => {
    const { delen, restant } = verdeel(1000, { soort: 'gelijk', deelnemers: ['a', 'b'] });
    expect(delen).toEqual({ a: 500, b: 500 });
    expect(restant).toBe(0);
  });

  it('verdeelt in procenten', () => {
    const { delen } = verdeel(20000, { soort: 'procent', gewichten: { a: 65, b: 35 } });
    expect(delen).toEqual({ a: 13000, b: 7000 });
  });

  it('verdeelt in delen (twee van de vijf plekken)', () => {
    const { delen } = verdeel(1799, { soort: 'delen', gewichten: { a: 2, b: 1, c: 1, d: 1 } });
    expect(som(delen)).toBe(1799);
    expect(delen.a).toBeGreaterThan(delen.b);
  });

  it('meldt het als vaste bedragen niet optellen', () => {
    const { delen, restant } = verdeel(1000, { soort: 'bedrag', gewichten: { a: 600, b: 300 } });
    expect(delen).toEqual({ a: 600, b: 300 });
    expect(restant).toBe(100);
  });
});

describe('omschrijfVerdeling', () => {
  const naam = (id) => ({ a: 'Anne', b: 'Bram' }[id] || id);
  it('vat de verdeling samen', () => {
    expect(omschrijfVerdeling({ soort: 'gelijk', deelnemers: ['a', 'b'] }, naam)).toBe('gelijk over 2');
    expect(omschrijfVerdeling({ soort: 'gelijk', deelnemers: ['a'] }, naam)).toBe('helemaal voor Anne');
    expect(omschrijfVerdeling({ soort: 'procent', gewichten: { a: 60, b: 40 } }, naam)).toBe('60%/40%');
  });
});
