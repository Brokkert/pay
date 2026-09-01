import { describe, it, expect } from 'vitest';
import { rekenMaand, losseSaldi, net, betalerPartij } from '../src/lib/saldo.js';

// Een huishouden met alles erin wat het lastig maakt: twee mensen met een
// vaste-lastenrekening, een zakelijke rekening waar ook gedeelde dingen van af
// gaan, een tweede gezamenlijke rekening, en twee mensen die alleen in een
// abonnement meedoen.
//
// De namen en bedragen zijn verzonnen, maar wel zo gekozen dat de randgevallen
// erin zitten: delingen die niet opgaan, en een verdeling waarbij twee dragers
// de restcent moeten krijgen.
const IK = 'p-ik';
const PARTNER = 'p-partner';
const VRIEND = 'p-vriend';
const BUUR = 'p-buur';

const personen = [
  { id: IK, naam: 'Ik', is_mij: true },
  { id: PARTNER, naam: 'Partner' },
  { id: VRIEND, naam: 'Vriend' },
  { id: BUUR, naam: 'Buur' },
];

const rekeningen = [
  { id: 'r-vast', naam: 'Vaste lasten', soort: 'gezamenlijk',
    deelnemers: [IK, PARTNER], stortingen: { [IK]: 90000, [PARTNER]: 70000 } },
  { id: 'r-zaak', naam: 'Zaak', soort: 'zakelijk', eigenaar_id: IK },
  { id: 'r-prive', naam: 'Privé', soort: 'prive', eigenaar_id: IK },
  { id: 'r-tweede', naam: 'Tweede pot', soort: 'gezamenlijk', deelnemers: [IK, PARTNER] },
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
        id: '1', naam: 'Energie', bedrag: 9000, betaler: { soort: 'rekening', id: 'r-vast' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, PARTNER] },
      })],
    }, '2026-09');

    expect(uit.maandlast).toBe(9000);
    expect(stroom(uit, `persoon:${IK}`, 'pot:r-vast')).toBe(4500);
    expect(stroom(uit, `persoon:${PARTNER}`, 'pot:r-vast')).toBe(4500);
  });

  it('rekent een zakelijk betaald abonnement terug naar de eigenaar', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [post({
        id: '2', naam: 'Streamingdienst', bedrag: 4999, betaler: { soort: 'rekening', id: 'r-zaak' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, PARTNER, VRIEND, BUUR] },
      })],
    }, '2026-09');

    // 4999 over vier: 1250/1250/1250/1249 — samen precies 4999.
    expect(Object.values(uit.regels[0].delen).reduce((s, c) => s + c, 0)).toBe(4999);
    // Mijn eigen deel is geen schuld: ik heb het zelf betaald.
    expect(stroom(uit, `persoon:${IK}`, `persoon:${IK}`)).toBe(0);
    expect(stroom(uit, `persoon:${PARTNER}`, `persoon:${IK}`)).toBe(1250);
    expect(stroom(uit, `persoon:${BUUR}`, `persoon:${IK}`)).toBe(1249);
  });

  it('streept kruislingse abonnementen tegen elkaar weg', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [
        post({
          id: '3', naam: 'Streamingdienst', bedrag: 2400, betaler: { soort: 'rekening', id: 'r-prive' },
          verdeling: { soort: 'gelijk', deelnemers: [IK, VRIEND] },
        }),
        // De vriend betaalt zijn eigen abonnement; ik doe mee.
        post({
          id: '4', naam: 'Muziekdienst', bedrag: 1400, betaler: { soort: 'persoon', id: VRIEND },
          verdeling: { soort: 'gelijk', deelnemers: [IK, VRIEND] },
        }),
      ],
    }, '2026-09');

    const tussen = uit.stromen.filter((s) => [s.van, s.naar].join().includes(VRIEND));
    expect(tussen).toHaveLength(1);
    expect(tussen[0]).toMatchObject({ van: `persoon:${VRIEND}`, naar: `persoon:${IK}`, centen: 500 });
  });

  it('rekent jaarlijkse en driemaandelijkse posten om naar de maand', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [
        post({ id: '5', naam: 'Verzekering', bedrag: 18000, ritme: 'jaar',
          betaler: { soort: 'rekening', id: 'r-vast' },
          verdeling: { soort: 'gelijk', deelnemers: [IK, PARTNER] } }),
        post({ id: '6', naam: 'Heffingen', bedrag: 9000, ritme: 'kwartaal',
          betaler: { soort: 'rekening', id: 'r-vast' },
          verdeling: { soort: 'gelijk', deelnemers: [IK, PARTNER] } }),
      ],
    }, '2026-09');

    expect(uit.maandlast).toBe(1500 + 3000);
    expect(uit.jaarlast).toBe(18000 + 36000);
  });

  it('laat eenmalige posten uit de maandlast', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [post({ id: '7', naam: 'Bank', bedrag: 80000, ritme: 'eenmalig',
        betaler: { soort: 'rekening', id: 'r-prive' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, PARTNER] } })],
    }, '2026-09');
    expect(uit.maandlast).toBe(0);
    expect(uit.stromen).toHaveLength(0);
  });

  it('slaat posten over die nog niet lopen of al zijn opgezegd', () => {
    const posten = [
      post({ id: '8', naam: 'Sportclub', bedrag: 2500, vanaf: '2026-11-01',
        betaler: { soort: 'rekening', id: 'r-prive' } }),
      post({ id: '9', naam: 'Krant', bedrag: 1200, tot: '2026-06-30',
        betaler: { soort: 'rekening', id: 'r-prive' } }),
      post({ id: '10', naam: 'Muziek', bedrag: 500, gepauzeerd: true,
        betaler: { soort: 'rekening', id: 'r-prive' } }),
    ];
    expect(rekenMaand({ personen, rekeningen, posten }, '2026-09').maandlast).toBe(0);
    expect(rekenMaand({ personen, rekeningen, posten }, '2026-11').maandlast).toBe(2500);
  });

  it('zet naast wat de rekening kost ook wat erin gestort wordt', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [post({ id: '11', naam: 'Woonlasten', bedrag: 100000,
        betaler: { soort: 'rekening', id: 'r-vast' },
        verdeling: { soort: 'procent', gewichten: { [IK]: 60, [PARTNER]: 40 } } })],
    }, '2026-09');

    const pot = uit.potten.find((p) => p.rekening.id === 'r-vast');
    expect(pot.uit).toBe(100000);
    expect(pot.erin[PARTNER]).toBe(40000);
    expect(pot.inleg).toBe(160000);
    expect(pot.verschil).toBe(60000);
  });

  it('telt op per bundel, zodat je het tegen je afschrift kunt houden', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [
        post({ id: '12', naam: 'Inboedel', bedrag: 1200, bundel: 'Verzekeringen',
          betaler: { soort: 'rekening', id: 'r-vast' } }),
        post({ id: '13', naam: 'Opstal', bedrag: 3000, bundel: 'Verzekeringen',
          betaler: { soort: 'rekening', id: 'r-vast' } }),
        post({ id: '14', naam: 'Zorg', bedrag: 5000, bundel: 'Zorgverzekeraar',
          betaler: { soort: 'rekening', id: 'r-vast' } }),
        post({ id: '15', naam: 'Muziek', bedrag: 500, betaler: { soort: 'rekening', id: 'r-vast' } }),
      ],
    }, '2026-09');

    expect(uit.perBundel).toEqual({ Verzekeringen: 4200, Zorgverzekeraar: 5000 });
  });

  it('waarschuwt als vaste bedragen niet optellen, en legt de rest bij de betaler', () => {
    const uit = rekenMaand({
      personen, rekeningen,
      posten: [post({ id: '16', naam: 'Vakantiehuis', bedrag: 100000,
        betaler: { soort: 'rekening', id: 'r-prive' },
        verdeling: { soort: 'bedrag', gewichten: { [PARTNER]: 30000, [VRIEND]: 30000 } } })],
    }, '2026-09');

    expect(uit.waarschuwingen).toHaveLength(1);
    expect(uit.draagt[IK]).toBe(40000);
    expect(stroom(uit, `persoon:${PARTNER}`, `persoon:${IK}`)).toBe(30000);
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
  // Het lastige geval: het internet loopt op de zaak, maar de partner stort
  // haar helft gewoon op de vaste-lastenrekening. Zij maakt dus één bedrag
  // over, en ik hoef er zelf minder in te doen.
  const posten = [
    post({ id: 'a', naam: 'Energie', bedrag: 9000, betaler: { soort: 'rekening', id: 'r-vast' },
      verdeling: { soort: 'gelijk', deelnemers: [IK, PARTNER] } }),
    post({ id: 'b', naam: 'Internet', bedrag: 5001, betaler: { soort: 'rekening', id: 'r-zaak' },
      verdeling: { soort: 'gelijk', deelnemers: [IK, PARTNER] } }),
  ];

  it('laat de partner één bedrag overmaken in plaats van twee', () => {
    const uit = rekenMaand({ personen, rekeningen: metHub, posten }, '2026-09');
    const vanPartner = uit.stromen.filter((s) => s.van === `persoon:${PARTNER}`);
    expect(vanPartner).toHaveLength(1);
    // 4500 (haar helft van de energie) + 2500 (haar helft van het internet, dat
    // de zaak betaalde; 5001 deelt niet gelijk, dus zij krijgt de kleinste
    // helft) = 7000.
    expect(vanPartner[0]).toMatchObject({ naar: 'pot:r-vast', centen: 7000 });
  });

  it('trekt af wat ik zelf al heb voorgeschoten', () => {
    const uit = rekenMaand({ personen, rekeningen: metHub, posten }, '2026-09');
    const metMij = uit.stromen.filter((s) => s.van === `persoon:${IK}` || s.naar === `persoon:${IK}`);
    expect(metMij).toHaveLength(1);
    // Mijn aandeel in de energie is 4500. De pot is mij 2500 schuldig, want dat
    // stort de partner erop voor iets wat de zaak al betaald heeft. Blijft 2000.
    expect(metMij[0]).toMatchObject({ van: `persoon:${IK}`, naar: 'pot:r-vast', centen: 2000 });
  });

  it('laat de som van alle stromen precies dekken wat de pot betaalt', () => {
    const uit = rekenMaand({ personen, rekeningen: metHub, posten }, '2026-09');
    const naarDePot = uit.stromen
      .filter((s) => s.naar === 'pot:r-vast')
      .reduce((s, x) => s + x.centen, 0);
    // 7000 + 2000 = 9000, precies wat de pot zelf betaalt. Wat de zaak
    // voorschoot komt erin en gaat er weer uit, en dat streept weg.
    expect(naarDePot).toBe(9000);
  });

  it('laat iemand buiten de pot met rust', () => {
    const uit = rekenMaand({
      personen, rekeningen: metHub,
      posten: [post({ id: 'c', naam: 'Muziekdienst', bedrag: 1400,
        betaler: { soort: 'persoon', id: VRIEND },
        verdeling: { soort: 'gelijk', deelnemers: [IK, VRIEND] } })],
    }, '2026-09');
    expect(uit.stromen).toEqual([
      { van: `persoon:${IK}`, naar: `persoon:${VRIEND}`, centen: 700 },
    ]);
  });

  it('laat een tweede gezamenlijke rekening zijn eigen gang gaan', () => {
    const uit = rekenMaand({
      personen, rekeningen: metHub,
      posten: [post({ id: 'd', naam: 'Woonlasten', bedrag: 120000,
        betaler: { soort: 'rekening', id: 'r-tweede' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, PARTNER] } })],
    }, '2026-09');
    // Naar de tweede rekening, niet via de vaste lasten.
    expect(uit.stromen.every((s) => s.naar === 'pot:r-tweede')).toBe(true);
    expect(uit.stromen).toHaveLength(2);
  });
});

describe('een rekening die zelf een deel draagt', () => {
  // Bankkosten: vier delen, waarvan er één zakelijk is. Dat deel is geen
  // privékostenpost — het staat bij de zaak, en die moet het terugbetalen.
  const bankkosten = post({
    id: 'bank', naam: 'Bankkosten', bedrag: 1799,
    betaler: { soort: 'rekening', id: 'r-vast' },
    verdeling: { soort: 'delen', gewichten: { [IK]: 2, [PARTNER]: 1, 'rekening:r-zaak': 1 } },
  });

  it('legt het zakelijke deel bij de zaak en niet bij mij privé', () => {
    const uit = rekenMaand({ personen, rekeningen: metHub, posten: [bankkosten] }, '2026-09');
    // 1799 over 2:1:1 wordt 899 / 450 / 450 — samen precies 1799.
    expect(uit.draagt[IK]).toBe(899);
    expect(uit.draagt[PARTNER]).toBe(450);
    expect(uit.draagt['rekening:r-zaak']).toBe(450);
    expect(uit.draagt[IK] + uit.draagt[PARTNER] + uit.draagt['rekening:r-zaak']).toBe(uit.maandlast);
  });

  it('laat de zaak zelf overmaken, buiten de verrekening tussen ons om', () => {
    const uit = rekenMaand({ personen, rekeningen: metHub, posten: [bankkosten] }, '2026-09');
    expect(stroom(uit, 'pot:r-zaak', 'pot:r-vast')).toBe(450);
    // En het loopt niet stiekem via mij: de zaak is geen deelnemer van de
    // vaste-lastenrekening, dus daar wordt niets langs geleid.
    expect(stroom(uit, `persoon:${IK}`, 'pot:r-vast')).toBe(899);
  });

  it('streept weg als de zaak het zelf al betaalde', () => {
    const uit = rekenMaand({
      personen, rekeningen: metHub,
      posten: [{ ...bankkosten, betaler: { soort: 'rekening', id: 'r-zaak' } }],
    }, '2026-09');
    // De zaak betaalt en draagt een kwart; die twee heffen elkaar op — er is
    // niets terug te betalen aan jezelf.
    expect(uit.stromen.some((s) => s.van === 'pot:r-zaak')).toBe(false);
    // Het blijft wel een zakelijke kostenpost, dus het telt gewoon mee in wat
    // de zaak draagt.
    expect(uit.draagt['rekening:r-zaak']).toBe(450);
    // De partner stort haar deel op de vaste-lastenrekening; ik schoot de rest
    // voor via de zaak, dus die rekening betaalt mij terug.
    expect(stroom(uit, `persoon:${PARTNER}`, 'pot:r-vast')).toBe(450);
    expect(stroom(uit, 'pot:r-vast', `persoon:${IK}`)).toBe(450);
  });
});

describe('losseSaldi', () => {
  it('houdt eenmalige posten apart tot ze zijn afgerekend', () => {
    const posten = [
      post({ id: '18', naam: 'Bank', bedrag: 80000, ritme: 'eenmalig',
        betaler: { soort: 'rekening', id: 'r-prive' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, PARTNER] } }),
      post({ id: '19', naam: 'Concert', bedrag: 12000, ritme: 'eenmalig', afgerekend: true,
        betaler: { soort: 'rekening', id: 'r-prive' },
        verdeling: { soort: 'gelijk', deelnemers: [IK, PARTNER] } }),
    ];
    const uit = losseSaldi(posten, metHub);
    expect(uit.regels).toHaveLength(1);
    // Rechtstreeks, niet via de pot: een tikkie reken je niet af met je
    // maandelijkse storting.
    expect(uit.stromen).toEqual([
      { van: `persoon:${PARTNER}`, naar: `persoon:${IK}`, centen: 40000 },
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
    expect(betalerPartij({ betaler: { soort: 'persoon', id: VRIEND } }, rekeningen)).toBe(`persoon:${VRIEND}`);
    expect(betalerPartij({ betaler: { soort: 'rekening', id: 'weg' } }, rekeningen)).toBe(null);
  });
});
