import { describe, it, expect } from 'vitest';
import { rekenMaand, losseSaldi, net, betalerPartij } from '../src/lib/saldo.js';

// Een huishouden zoals het er in het echt uitziet: twee mensen met een
// vaste-lastenrekening, een zakelijke rekening waar wél gedeelde dingen van af
// gaan, en twee vrienden die alleen in een abonnement zitten.
const IK = 'p-ik';
const MAU = 'p-mau';
const PIETER = 'p-pieter';
const SANNE = 'p-sanne';

const personen = [
  { id: IK, naam: 'Ik', is_mij: true },
  { id: MAU, naam: 'Mau' },
  { id: PIETER, naam: 'Pieter' },
  { id: SANNE, naam: 'Sanne' },
];

const rekening = (extra) => ({
  id: 'r-vast', naam: 'Vaste lasten', soort: 'gezamenlijk',
  deelnemers: [IK, MAU], stortingen: { [IK]: 90000, [MAU]: 70000 }, ...extra,
});

const rekeningen = [
  rekening(),
  { id: 'r-zaak', naam: 'Zaak', soort: 'zakelijk', eigenaar_id: IK },
  { id: 'r-prive', naam: 'Privé', soort: 'prive', eigenaar_id: IK },
  { id: 'r-hyp', naam: 'Hypotheek', soort: 'gezamenlijk', deelnemers: [IK, MAU] },
];

// Dezelfde rekeningen, maar met de vaste-lastenrekening als afrekenpunt.
const metHub = [{ ...rekeningen[0], afrekenpot: true }, ...rekeningen.slice(1)];

const post = (o) => ({
  ritme: 'maand', categorie: 'overig', verdeling: { soort: 'gelijk', deelnemers: [IK] }, ...o,
});

const stroom = (uit, van, naar) =>
  uit.stromen.find((s) => s.van === van && s.naar === naar)?.centen ?? 0;

describe('rekenMaand', () => {
  it('legt het aandeel in een gedeelde last bij de rekening neer', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [post({
        id: '1', naam: 'Gas/Stroom', bedrag: 11700, betaler: { soort: 'rekening', id: 'r-vast' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, MAU] },
      })],
    }, '2026-09');

    expect(uit.maandlast).toBe(11700);
    expect(stroom(uit, `persoon:${IK}`, 'pot:r-vast')).toBe(5850);
    expect(stroom(uit, `persoon:${MAU}`, 'pot:r-vast')).toBe(5850);
  });

  it('rekent een zakelijk betaald abonnement terug naar de eigenaar', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [post({
        id: '2', naam: 'YouTube Family', bedrag: 2599, betaler: { soort: 'rekening', id: 'r-zaak' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, MAU, PIETER, SANNE] },
      })],
    }, '2026-09');

    // 2599 over vier: 650/650/650/649 — samen precies 2599.
    expect(Object.values(uit.regels[0].delen).reduce((s, c) => s + c, 0)).toBe(2599);
    // Mijn eigen deel is geen schuld: ik heb het zelf betaald.
    expect(stroom(uit, `persoon:${IK}`, `persoon:${IK}`)).toBe(0);
    expect(stroom(uit, `persoon:${MAU}`, `persoon:${IK}`)).toBe(650);
    expect(stroom(uit, `persoon:${PIETER}`, `persoon:${IK}`)).toBe(650);
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

    const tussen = uit.stromen.filter((s) => [s.van, s.naar].join().includes(PIETER));
    expect(tussen).toHaveLength(1);
    expect(tussen[0]).toMatchObject({ van: `persoon:${PIETER}`, naar: `persoon:${IK}`, centen: 500 });
  });

  it('rekent jaarlijkse en driemaandelijkse posten om naar de maand', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [
        post({ id: '5', naam: 'Inboedel', bedrag: 18600, ritme: 'jaar',
          betaler: { soort: 'rekening', id: 'r-vast' },
          verdeling: { soort: 'gelijk', deelnemers: [IK, MAU] } }),
        post({ id: '6', naam: 'SVHW', bedrag: 8700, ritme: 'kwartaal',
          betaler: { soort: 'rekening', id: 'r-vast' },
          verdeling: { soort: 'gelijk', deelnemers: [IK, MAU] } }),
      ],
    }, '2026-09');

    expect(uit.maandlast).toBe(1550 + 2900);
    expect(uit.jaarlast).toBe(18600 + 34800);
  });

  it('laat eenmalige posten uit de maandlast', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [post({ id: '7', naam: 'Bank', bedrag: 80000, ritme: 'eenmalig',
        betaler: { soort: 'rekening', id: 'r-prive' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, MAU] } })],
    }, '2026-09');
    expect(uit.maandlast).toBe(0);
    expect(uit.stromen).toHaveLength(0);
  });

  it('slaat posten over die nog niet lopen of al zijn opgezegd', () => {
    const posten = [
      post({ id: '8', naam: 'Sportschool', bedrag: 4000, vanaf: '2026-11-01',
        betaler: { soort: 'rekening', id: 'r-prive' } }),
      post({ id: '9', naam: 'AD', bedrag: 1095, tot: '2026-06-30',
        betaler: { soort: 'rekening', id: 'r-prive' } }),
      post({ id: '10', naam: 'Tidal', bedrag: 417, gepauzeerd: true,
        betaler: { soort: 'rekening', id: 'r-prive' } }),
    ];
    expect(rekenMaand({ personen, rekeningen, posten }, '2026-09').maandlast).toBe(0);
    expect(rekenMaand({ personen, rekeningen, posten }, '2026-11').maandlast).toBe(4000);
  });

  it('zet naast wat de rekening kost ook wat erin gestort wordt', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [post({ id: '11', naam: 'Huur', bedrag: 140000,
        betaler: { soort: 'rekening', id: 'r-vast' },
        verdeling: { soort: 'procent', gewichten: { [IK]: 60, [MAU]: 40 } } })],
    }, '2026-09');

    const pot = uit.potten.find((p) => p.rekening.id === 'r-vast');
    expect(pot.uit).toBe(140000);
    expect(pot.erin[MAU]).toBe(56000);
    expect(pot.inleg).toBe(160000);
    expect(pot.verschil).toBe(20000);
  });

  it('telt op per bundel, zodat je het tegen je afschrift kunt houden', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [
        post({ id: '12', naam: 'Inboedel', bedrag: 1469, bundel: 'Verzekeringspakket',
          betaler: { soort: 'rekening', id: 'r-vast' } }),
        post({ id: '13', naam: 'Motorverzekering', bedrag: 10758, bundel: 'Verzekeringspakket',
          betaler: { soort: 'rekening', id: 'r-vast' } }),
        post({ id: '14', naam: 'Zorgverzekering', bedrag: 15807, bundel: 'VGZ',
          betaler: { soort: 'rekening', id: 'r-vast' } }),
        post({ id: '15', naam: 'Tidal', bedrag: 417, betaler: { soort: 'rekening', id: 'r-vast' } }),
      ],
    }, '2026-09');

    expect(uit.perBundel).toEqual({ Verzekeringspakket: 12227, VGZ: 15807 });
  });

  it('waarschuwt als vaste bedragen niet optellen, en legt de rest bij de betaler', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [post({ id: '16', naam: 'Vakantiehuis', bedrag: 100000,
        betaler: { soort: 'rekening', id: 'r-prive' },
        verdeling: { soort: 'bedrag', gewichten: { [MAU]: 30000, [PIETER]: 30000 } } })],
    }, '2026-09');

    expect(uit.waarschuwingen).toHaveLength(1);
    expect(uit.draagt[IK]).toBe(40000);
    expect(stroom(uit, `persoon:${MAU}`, `persoon:${IK}`)).toBe(30000);
  });

  it('telt een post zonder geldige rekening niet mee, maar zegt het wel', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [post({ id: '17', naam: 'Zwevend', bedrag: 500, betaler: { soort: 'rekening', id: 'weg' } })],
    }, '2026-09');
    expect(uit.maandlast).toBe(0);
    expect(uit.waarschuwingen[0]).toContain('Zwevend');
  });
});

describe('verrekenen via de vaste-lastenrekening', () => {
  // Precies het geval uit de spreadsheet: internet loopt op de zaak, maar Mau
  // stort haar helft gewoon op de vaste-lastenrekening. Zij maakt dus één bedrag
  // over, en ik hoef er zelf minder in te doen.
  const posten = [
    post({ id: 'a', naam: 'Gas/Stroom', bedrag: 11700, betaler: { soort: 'rekening', id: 'r-vast' },
      verdeling: { soort: 'gelijk', deelnemers: [IK, MAU] } }),
    post({ id: 'b', naam: 'TV+Internet+Netflix', bedrag: 6739, betaler: { soort: 'rekening', id: 'r-zaak' },
      verdeling: { soort: 'gelijk', deelnemers: [IK, MAU] } }),
  ];

  it('laat Mau één bedrag overmaken in plaats van twee', () => {
    const uit = rekenMaand({ personen, rekeningen: metHub, posten }, '2026-09');
    const vanMau = uit.stromen.filter((s) => s.van === `persoon:${MAU}`);
    expect(vanMau).toHaveLength(1);
    // 5850 (haar helft van gas/stroom) + 3369 (haar helft van het internet, dat
    // de zaak betaalde; 6739 deelt niet gelijk, dus zij krijgt de kleinste helft)
    // = 9219.
    expect(vanMau[0]).toMatchObject({ naar: 'pot:r-vast', centen: 9219 });
  });

  it('trekt af wat ik zelf al heb voorgeschoten', () => {
    const uit = rekenMaand({ personen, rekeningen: metHub, posten }, '2026-09');
    const vanMij = uit.stromen.filter((s) => s.van === `persoon:${IK}` || s.naar === `persoon:${IK}`);
    expect(vanMij).toHaveLength(1);
    // Mijn aandeel in gas/stroom is 5850. De pot is mij 3369 schuldig, want dat
    // stort Mau erop voor iets wat de zaak al betaald heeft. Blijft 2481 over.
    expect(vanMij[0]).toMatchObject({ van: `persoon:${IK}`, naar: 'pot:r-vast', centen: 2481 });
  });

  it('laat de som van alle stromen precies de maandlast zijn', () => {
    const uit = rekenMaand({ personen, rekeningen: metHub, posten }, '2026-09');
    const naarDePot = uit.stromen
      .filter((s) => s.naar === 'pot:r-vast')
      .reduce((s, x) => s + x.centen, 0);
    // 9219 + 2481 = 11700, precies wat de pot zelf betaalt. Wat de zaak
    // voorschoot komt erin en gaat er weer uit, en dat streept weg.
    expect(naarDePot).toBe(11700);
  });

  it('laat een vriend buiten de pot met rust', () => {
    const uit = rekenMaand({
      personen, rekeningen: metHub,
      posten: [post({ id: 'c', naam: 'Spotify', bedrag: 1400,
        betaler: { soort: 'persoon', id: PIETER },
        verdeling: { soort: 'gelijk', deelnemers: [IK, PIETER] } })],
    }, '2026-09');
    expect(uit.stromen).toEqual([
      { van: `persoon:${IK}`, naar: `persoon:${PIETER}`, centen: 700 },
    ]);
  });

  it('laat een tweede gezamenlijke rekening zijn eigen gang gaan', () => {
    const uit = rekenMaand({
      personen, rekeningen: metHub,
      posten: [post({ id: 'd', naam: 'Hypotheek', bedrag: 120000,
        betaler: { soort: 'rekening', id: 'r-hyp' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, MAU] } })],
    }, '2026-09');
    // Naar de hypotheekrekening, niet via de vaste lasten.
    expect(uit.stromen.every((s) => s.naar === 'pot:r-hyp')).toBe(true);
    expect(uit.stromen).toHaveLength(2);
  });
});

describe('losseSaldi', () => {
  it('houdt eenmalige posten apart tot ze zijn afgerekend', () => {
    const posten = [
      post({ id: '18', naam: 'Bank', bedrag: 80000, ritme: 'eenmalig',
        betaler: { soort: 'rekening', id: 'r-prive' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, MAU] } }),
      post({ id: '19', naam: 'Concert', bedrag: 12000, ritme: 'eenmalig', afgerekend: true,
        betaler: { soort: 'rekening', id: 'r-prive' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, MAU] } }),
    ];
    const uit = losseSaldi(posten, metHub);
    expect(uit.regels).toHaveLength(1);
    // Rechtstreeks, niet via de pot: een tikkie reken je niet af met je
    // maandelijkse storting.
    expect(uit.stromen).toEqual([
      { van: `persoon:${MAU}`, naar: `persoon:${IK}`, centen: 40000 },
    ]);
  });
});

describe('net', () => {
  it('laat een pot met rust als er maar één richting is', () => {
    expect(net({ 'persoon:a': { 'pot:x': 500 }, 'persoon:b': { 'pot:x': 700 } })).toEqual([
      { van: 'persoon:b', naar: 'pot:x', centen: 700 },
      { van: 'persoon:a', naar: 'pot:x', centen: 500 },
    ]);
  });

  it('laat niets over als twee partijen quitte staan', () => {
    expect(net({ 'persoon:a': { 'persoon:b': 500 }, 'persoon:b': { 'persoon:a': 500 } })).toEqual([]);
  });

  it('draait de richting om als de ander meer schuldig is', () => {
    expect(net({ 'persoon:a': { 'persoon:b': 200 }, 'persoon:b': { 'persoon:a': 900 } })).toEqual([
      { van: 'persoon:b', naar: 'persoon:a', centen: 700 },
    ]);
  });

  it('streept ook weg tussen een persoon en een pot', () => {
    expect(net({ 'persoon:a': { 'pot:x': 900 }, 'pot:x': { 'persoon:a': 400 } })).toEqual([
      { van: 'persoon:a', naar: 'pot:x', centen: 500 },
    ]);
  });
});

describe('betalerPartij', () => {
  it('kiest de pot bij een gezamenlijke rekening en de eigenaar bij een eigen rekening', () => {
    expect(betalerPartij({ betaler: { soort: 'rekening', id: 'r-vast' } }, rekeningen)).toBe('pot:r-vast');
    expect(betalerPartij({ betaler: { soort: 'rekening', id: 'r-zaak' } }, rekeningen)).toBe(`persoon:${IK}`);
    expect(betalerPartij({ betaler: { soort: 'persoon', id: PIETER } }, rekeningen)).toBe(`persoon:${PIETER}`);
    expect(betalerPartij({ betaler: { soort: 'rekening', id: 'weg' } }, rekeningen)).toBe(null);
  });
});
