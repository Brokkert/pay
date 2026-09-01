// De kasboekmotor.
//
// Eén idee draagt het geheel: **elke post heeft één betaler en één verdeling.**
// Of dat nu de vaste-lastenrekening is, je zakelijke rekening, of de creditcard
// van een vriend van wie jij een abonnement meegebruikt — het is telkens
// hetzelfde. Wie een deel draagt maar niet de betaler is, staat bij die betaler
// in het krijt. Meer is er niet.
//
// Daardoor verrekent alles kruislings vanzelf. Zit Pieter in jouw YouTube-abo en
// zit jij in zijn Spotify, dan rolt daar één regel uit in plaats van twee.
//
// In de boekhouding is een partij óf een persoon óf een gezamenlijke rekening.
// Die tweede telt volwaardig mee: hij kan geld te goed hebben (ieders aandeel in
// wat er van hem af ging) én geld schuldig zijn (zie routeerVia hieronder).

import { perMaand, perJaar, loopt } from './ritme.js';
import { verdeel, isRekeningDrager, rekeningVanDrager } from './verdeel.js';

export const persoonPartij = (id) => `persoon:${id}`;

/**
 * De partij achter een drager uit een verdeling.
 *
 * Draagt een rekening zelf een deel — een stuk van je bankkosten dat zakelijk
 * is, bijvoorbeeld — dan is die rekening de partij, en niet de persoon die hem
 * bezit. Precies dat is het verschil: dat deel is geen privékostenpost, en wat
 * jij ervoor voorschoot mag je bij die rekening terughalen.
 */
export const dragerPartij = (sleutel) =>
  isRekeningDrager(sleutel) ? potPartij(rekeningVanDrager(sleutel)) : persoonPartij(sleutel);
export const potPartij = (id) => `pot:${id}`;
export const isPot = (partij) => String(partij || '').startsWith('pot:');
export const partijId = (partij) => String(partij || '').split(':').slice(1).join(':') || null;

/** De partij die het geld heeft voorgeschoten. */
export function betalerPartij(post, rekeningen) {
  const b = post.betaler || {};
  if (b.soort === 'persoon') return b.id ? persoonPartij(b.id) : null;
  const rekening = rekeningen.find((r) => r.id === b.id);
  if (!rekening) return null;
  if (rekening.soort === 'gezamenlijk') return potPartij(rekening.id);
  return rekening.eigenaar_id ? persoonPartij(rekening.eigenaar_id) : null;
}

export function partijNaam(partij, { personen, rekeningen }) {
  const id = partijId(partij);
  if (isPot(partij)) return rekeningen.find((r) => r.id === id)?.naam || 'gezamenlijk';
  return personen.find((p) => p.id === id)?.naam || 'onbekend';
}

/** De rekening waar de onderlinge verrekeningen overheen lopen, als die er is. */
export const afrekenrekening = (rekeningen) =>
  rekeningen.find((r) => r.soort === 'gezamenlijk' && r.afrekenpot) || null;

/**
 * Rekent één maand door. `maand` is 'jjjj-mm'.
 *
 * Posten die in die maand niet lopen (nog niet begonnen, al opgezegd, of even
 * gepauzeerd) doen niet mee, en eenmalige posten horen hier niet thuis — die
 * staan in losseSaldi().
 */
export function rekenMaand({ posten = [], personen = [], rekeningen = [] }, maand) {
  const lopend = posten.filter((p) => loopt(p, maand));

  const regels = [];
  const waarschuwingen = [];
  const ruw = {};
  // Wat ieder uiteindelijk draagt, op de sleutel uit de verdeling — dus ook
  // rekeningen die zelf een deel dragen.
  const draagt = Object.fromEntries(personen.map((p) => [p.id, 0]));
  const perRekening = Object.fromEntries(rekeningen.map((r) => [r.id, 0]));
  const perCategorie = {};
  const perBundel = {};
  let maandlast = 0;
  let jaarlast = 0;

  for (const post of lopend) {
    const bedrag = perMaand(post.bedrag, post.ritme);
    const partij = betalerPartij(post, rekeningen);

    if (!partij) {
      waarschuwingen.push(`"${post.naam}" heeft geen geldige rekening en telt niet mee.`);
      continue;
    }

    const { delen, restant } = verdeel(bedrag, post.verdeling);
    if (restant !== 0) {
      waarschuwingen.push(
        `Bij "${post.naam}" tellen de vaste bedragen niet op tot het postbedrag; ` +
          'het verschil komt bij de betaler te liggen.'
      );
    }

    const categorie = post.categorie || 'overig';
    maandlast += bedrag;
    jaarlast += perJaar(post.bedrag, post.ritme);
    if (post.betaler?.soort === 'rekening') perRekening[post.betaler.id] += bedrag;
    perCategorie[categorie] = (perCategorie[categorie] || 0) + bedrag;
    if (post.bundel) perBundel[post.bundel] = (perBundel[post.bundel] || 0) + bedrag;

    const eigen = eigenDelen(delen, restant, partij);
    for (const [sleutel, deel] of Object.entries(eigen)) {
      if (!deel) continue;
      draagt[sleutel] = (draagt[sleutel] || 0) + deel;
      if (zelfBetaald(sleutel, post)) continue;
      boek(ruw, dragerPartij(sleutel), partij, deel);
    }

    regels.push({ post, bedrag, partij, delen: eigen, restant });
  }

  const hub = afrekenrekening(rekeningen);
  if (hub) routeerVia(ruw, potPartij(hub.id), new Set(hub.deelnemers || []));

  const stromen = net(ruw);

  return {
    maand,
    regels,
    maandlast,
    jaarlast,
    draagt,
    perRekening,
    perCategorie,
    perBundel,
    stromen,
    potten: pottenOverzicht(stromen, rekeningen, perRekening),
    hub,
    waarschuwingen: [...new Set(waarschuwingen)],
  };
}

/**
 * Het restant bij vaste bedragen ligt bij de betaler: die heeft het immers wel
 * overgemaakt. Is de betaler een pot, dan blijft het in de pot hangen.
 */
function eigenDelen(delen, restant, partij) {
  if (!restant || isPot(partij)) return delen;
  const betaler = partijId(partij);
  return { ...delen, [betaler]: (delen[betaler] || 0) + restant };
}

/**
 * Draagt een rekening een deel van iets wat van diezelfde rekening af gaat?
 *
 * Dan is er niets te verrekenen: dat deel is betaald door wie het draagt. Dit
 * moet apart, want een zakelijke rekening telt als bétaler mee als de persoon
 * die hem bezit (je schiet iets voor via de zaak), maar als dráger als de zaak
 * zelf (dat is een zakelijke kostenpost). Zonder deze regel zou de zaak zijn
 * eigen kwart aan jou moeten terugbetalen.
 */
function zelfBetaald(sleutel, post) {
  return (
    isRekeningDrager(sleutel) &&
    post.betaler?.soort === 'rekening' &&
    rekeningVanDrager(sleutel) === post.betaler.id
  );
}

/** Alle dragers die in de verdelingen voorkomen, met hun partij erbij. */
export function dragersIn(posten) {
  const uit = new Set();
  for (const post of posten) {
    const v = post.verdeling || {};
    for (const sleutel of [...(v.deelnemers || []), ...Object.keys(v.gewichten || {})]) {
      uit.add(sleutel);
    }
  }
  return [...uit];
}

function boek(matrix, van, naar, centen) {
  if (!centen || van === naar) return;
  matrix[van] = matrix[van] || {};
  matrix[van][naar] = (matrix[van][naar] || 0) + centen;
}

/**
 * Verrekeningen langs de vaste-lastenrekening leiden.
 *
 * Dit is precies hoe het in het echt gaat. Betaalt de zaak het internet, dan
 * heeft je vriendin jóu haar helft schuldig — maar ze maakt dat niet apart over:
 * ze stort het gewoon op de vaste-lastenrekening, samen met al het andere. Die
 * rekening staat het daarna aan jou schuldig, en dat streept weg tegen wat jij
 * er nog in moet doen. Onder de streep hoef jij dus minder over te maken, en
 * gaat er geen enkel los bedrag heen en weer.
 *
 * Alleen tussen deelnemers van die rekening. Wat je een vriend schuldig bent die
 * er niets mee te maken heeft, betaal je hem gewoon rechtstreeks.
 */
function routeerVia(matrix, hub, deelnemers) {
  for (const [van, naars] of Object.entries(matrix)) {
    if (van === hub || isPot(van) || !deelnemers.has(partijId(van))) continue;
    for (const [naar, centen] of Object.entries(naars)) {
      if (!centen || naar === hub || isPot(naar) || !deelnemers.has(partijId(naar))) continue;
      naars[naar] = 0;
      boek(matrix, van, hub, centen);
      boek(matrix, hub, naar, centen);
    }
  }
}

/**
 * Wegstrepen wat elkaar opheft.
 *
 * Per paar partijen blijft er één richting over. Welke kant dat op wijst volgt
 * uit het teken; de volgorde binnen een paar ligt vast op de naam, zodat
 * dezelfde invoer altijd dezelfde uitkomst geeft.
 */
export function net(matrix) {
  const paren = new Map();

  for (const [van, naars] of Object.entries(matrix)) {
    for (const [naar, centen] of Object.entries(naars)) {
      if (!centen || van === naar) continue;
      const heen = van < naar;
      const sleutel = heen ? `${van} ${naar}` : `${naar} ${van}`;
      paren.set(sleutel, (paren.get(sleutel) || 0) + (heen ? centen : -centen));
    }
  }

  const uit = [];
  for (const [sleutel, centen] of paren) {
    if (!centen) continue;
    const [a, b] = sleutel.split(' ');
    uit.push(centen > 0 ? { van: a, naar: b, centen } : { van: b, naar: a, centen: -centen });
  }
  return uit.sort((x, y) => y.centen - x.centen);
}

/** Per gezamenlijke rekening: wat er af gaat, wat erin moet, en wat erin gestort wordt. */
function pottenOverzicht(stromen, rekeningen, perRekening) {
  return rekeningen
    .filter((r) => r.soort === 'gezamenlijk')
    .map((rekening) => {
      const partij = potPartij(rekening.id);
      const erin = {};
      const eruit = {};
      for (const s of stromen) {
        if (s.naar === partij && !isPot(s.van)) erin[partijId(s.van)] = s.centen;
        if (s.van === partij && !isPot(s.naar)) eruit[partijId(s.naar)] = s.centen;
      }
      const stortingen = rekening.stortingen || {};
      const inleg = Object.values(stortingen).reduce((s, c) => s + (Number(c) || 0), 0);
      const uit = perRekening[rekening.id] || 0;
      return { rekening, uit, erin, eruit, stortingen, inleg, verschil: inleg - uit };
    });
}

/**
 * De losse posten: eenmalige uitgaven die nog niet zijn afgerekend.
 *
 * Die lopen bewust níét langs de vaste-lastenrekening. Een eenmalige uitgave
 * reken je in het echt ook rechtstreeks af — met een tikkie, niet door je
 * maandelijkse storting aan te passen.
 */
export function losseSaldi(posten, rekeningen) {
  const open = posten.filter((p) => p.ritme === 'eenmalig' && !p.afgerekend);
  const ruw = {};
  const regels = [];

  for (const post of open) {
    const partij = betalerPartij(post, rekeningen);
    if (!partij) continue;
    const { delen, restant } = verdeel(post.bedrag, post.verdeling);
    const eigen = eigenDelen(delen, restant, partij);
    for (const [sleutel, deel] of Object.entries(eigen)) {
      if (zelfBetaald(sleutel, post)) continue;
      boek(ruw, dragerPartij(sleutel), partij, deel);
    }
    regels.push({ post, partij, delen: eigen });
  }

  return { regels, stromen: net(ruw) };
}
