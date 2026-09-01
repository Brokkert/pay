import { describe, it, expect } from 'vitest';
import { rekenMaand, losseSaldi, net, betalerPartij } from '../src/lib/saldo.js';

// Een huishouden zoals het er in het echt uitziet: twee mensen met een
// gezamenlijke pot, een zakelijke rekening waar wél gedeelde dingen van af
// gaan, en twee vrienden die alleen in een abonnement zitten.
const IK = 'p-ik';
const ANNE = 'p-anne';
const PIETER = 'p-pieter';
const SANNE = 'p-sanne';

const personen = [
  { id: IK, naam: 'Ik', is_mij: true },
  { id: ANNE, naam: 'Anne' },
  { id: PIETER, naam: 'Pieter' },
  { id: SANNE, naam: 'Sanne' },
];

const rekeningen = [
  { id: 'r-samen', naam: 'Gezamenlijk', soort: 'gezamenlijk',
    deelnemers: [IK, ANNE], stortingen: { [IK]: 90000, [ANNE]: 70000 } },
  { id: 'r-zaak', naam: 'Zakelijk', soort: 'zakelijk', eigenaar_id: IK },
  { id: 'r-prive', naam: 'Privé', soort: 'prive', eigenaar_id: IK },
];

const post = (o) => ({
  ritme: 'maand', categorie: 'overig', verdeling: { soort: 'gelijk', deelnemers: [IK] }, ...o,
});

const stroom = (uitkomst, van, naar) =>
  uitkomst.stromen.find((s) => s.van === van && s.naar === naar)?.centen ?? 0;

describe('rekenMaand', () => {
  it('legt het aandeel in een gedeelde last bij de pot neer', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [post({
        id: '1', naam: 'Huur', bedrag: 140000, betaler: { soort: 'rekening', id: 'r-samen' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, ANNE] },
      })],
    }, '2026-09');

    expect(uit.maandlast).toBe(140000);
    expect(stroom(uit, IK, 'pot:r-samen')).toBe(70000);
    expect(stroom(uit, ANNE, 'pot:r-samen')).toBe(70000);
  });

  it('rekent een zakelijk betaald abonnement gewoon terug naar de betaler', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [post({
        id: '2', naam: 'YouTube Family', bedrag: 2599, betaler: { soort: 'rekening', id: 'r-zaak' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, ANNE, PIETER, SANNE] },
      })],
    }, '2026-09');

    // 2599 over vier: 650/650/650/649 — samen precies 2599.
    expect(Object.values(uit.regels[0].delen).reduce((s, c) => s + c, 0)).toBe(2599);
    // Mijn eigen deel is geen schuld: ik heb het zelf betaald.
    expect(stroom(uit, IK, `persoon:${IK}`)).toBe(0);
    expect(stroom(uit, ANNE, `persoon:${IK}`)).toBe(650);
    expect(stroom(uit, PIETER, `persoon:${IK}`)).toBe(650);
  });

  it('streept kruislingse abonnementen tegen elkaar weg', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [
        post({
          id: '3', naam: 'YouTube Family', bedrag: 2400, betaler: { soort: 'rekening', id: 'r-prive' },
          verdeling: { soort: 'gelijk', deelnemers: [IK, PIETER] },
        }),
        // Pieter betaalt Spotify van zijn eigen rekening; ik doe mee.
        post({
          id: '4', naam: 'Spotify Duo', bedrag: 1400, betaler: { soort: 'persoon', id: PIETER },
          verdeling: { soort: 'gelijk', deelnemers: [IK, PIETER] },
        }),
      ],
    }, '2026-09');

    // Pieter is mij 1200 schuldig, ik hem 700 — er blijft één regel van 500 over.
    const tussen = uit.stromen.filter(
      (s) => [s.van, s.naar].join().includes(PIETER) && [s.van, s.naar].join().includes(IK)
    );
    expect(tussen).toHaveLength(1);
    expect(tussen[0]).toMatchObject({ van: PIETER, naar: `persoon:${IK}`, centen: 500 });
  });

  it('rekent jaarlijkse en driemaandelijkse posten om naar de maand', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [
        post({ id: '5', naam: 'Opstalverzekering', bedrag: 30000, ritme: 'jaar',
          betaler: { soort: 'rekening', id: 'r-samen' },
          verdeling: { soort: 'gelijk', deelnemers: [IK, ANNE] } }),
        post({ id: '6', naam: 'Waterschap', bedrag: 9000, ritme: 'kwartaal',
          betaler: { soort: 'rekening', id: 'r-samen' },
          verdeling: { soort: 'gelijk', deelnemers: [IK, ANNE] } }),
      ],
    }, '2026-09');

    expect(uit.maandlast).toBe(2500 + 3000);
    expect(uit.jaarlast).toBe(30000 + 36000);
  });

  it('laat eenmalige posten uit de maandlast', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [post({ id: '7', naam: 'Bank', bedrag: 80000, ritme: 'eenmalig',
        betaler: { soort: 'rekening', id: 'r-prive' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, ANNE] } })],
    }, '2026-09');
    expect(uit.maandlast).toBe(0);
    expect(uit.stromen).toHaveLength(0);
  });

  it('slaat posten over die nog niet lopen of al zijn opgezegd', () => {
    const posten = [
      post({ id: '8', naam: 'Sportschool', bedrag: 3000, vanaf: '2026-11-01',
        betaler: { soort: 'rekening', id: 'r-prive' } }),
      post({ id: '9', naam: 'Krant', bedrag: 2000, tot: '2026-06-30',
        betaler: { soort: 'rekening', id: 'r-prive' } }),
      post({ id: '10', naam: 'Storage', bedrag: 1000, gepauzeerd: true,
        betaler: { soort: 'rekening', id: 'r-prive' } }),
    ];
    expect(rekenMaand({ personen, rekeningen, posten }, '2026-09').maandlast).toBe(0);
    expect(rekenMaand({ personen, rekeningen, posten }, '2026-11').maandlast).toBe(3000);
  });

  it('zet naast wat de pot kost ook wat erin gestort wordt', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [post({ id: '11', naam: 'Huur', bedrag: 140000,
        betaler: { soort: 'rekening', id: 'r-samen' },
        verdeling: { soort: 'procent', gewichten: { [IK]: 60, [ANNE]: 40 } } })],
    }, '2026-09');

    const pot = uit.potten[0];
    expect(pot.uit).toBe(140000);
    expect(pot.aandeel[ANNE]).toBe(56000);
    expect(pot.inleg).toBe(160000);
    expect(pot.verschil).toBe(20000);
  });

  it('waarschuwt als vaste bedragen niet optellen, en legt de rest bij de betaler', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [post({ id: '12', naam: 'Vakantiehuis', bedrag: 100000,
        betaler: { soort: 'rekening', id: 'r-prive' },
        verdeling: { soort: 'bedrag', gewichten: { [ANNE]: 30000, [PIETER]: 30000 } } })],
    }, '2026-09');

    expect(uit.waarschuwingen).toHaveLength(1);
    expect(uit.draagt[IK]).toBe(40000);
    expect(stroom(uit, ANNE, `persoon:${IK}`)).toBe(30000);
  });

  it('telt een post zonder geldige betaler niet mee, maar zegt het wel', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [post({ id: '13', naam: 'Zwevend', bedrag: 500, betaler: { soort: 'rekening', id: 'weg' } })],
    }, '2026-09');
    expect(uit.maandlast).toBe(0);
    expect(uit.waarschuwingen[0]).toContain('Zwevend');
  });
});

describe('losseSaldi', () => {
  it('houdt eenmalige posten apart tot ze zijn afgerekend', () => {
    const posten = [
      post({ id: '14', naam: 'Bank', bedrag: 80000, ritme: 'eenmalig',
        betaler: { soort: 'rekening', id: 'r-prive' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, ANNE] } }),
      post({ id: '15', naam: 'Concert', bedrag: 12000, ritme: 'eenmalig', afgerekend: true,
        betaler: { soort: 'rekening', id: 'r-prive' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, ANNE] } }),
    ];
    const uit = losseSaldi(posten, rekeningen);
    expect(uit.regels).toHaveLength(1);
    expect(uit.stromen).toEqual([{ van: ANNE, naar: `persoon:${IK}`, centen: 40000 }]);
  });
});

describe('net', () => {
  it('laat een pot met rust — daar gaat het maar één kant op', () => {
    expect(net({ [ANNE]: { 'pot:r-samen': 500 }, [IK]: { 'pot:r-samen': 700 } })).toEqual([
      { van: IK, naar: 'pot:r-samen', centen: 700 },
      { van: ANNE, naar: 'pot:r-samen', centen: 500 },
    ]);
  });

  it('laat niets over als twee mensen quitte staan', () => {
    expect(net({ a: { 'persoon:b': 500 }, b: { 'persoon:a': 500 } })).toEqual([]);
  });

  it('draait de richting om als de ander meer schuldig is', () => {
    expect(net({ a: { 'persoon:b': 200 }, b: { 'persoon:a': 900 } })).toEqual([
      { van: 'b', naar: 'persoon:a', centen: 700 },
    ]);
  });
});

describe('betalerPartij', () => {
  it('kiest de pot bij een gezamenlijke rekening en de eigenaar bij een eigen rekening', () => {
    expect(betalerPartij({ betaler: { soort: 'rekening', id: 'r-samen' } }, rekeningen)).toBe('pot:r-samen');
    expect(betalerPartij({ betaler: { soort: 'rekening', id: 'r-zaak' } }, rekeningen)).toBe(`persoon:${IK}`);
    expect(betalerPartij({ betaler: { soort: 'persoon', id: PIETER } }, rekeningen)).toBe(`persoon:${PIETER}`);
    expect(betalerPartij({ betaler: { soort: 'rekening', id: 'weg' } }, rekeningen)).toBe(null);
  });
});
