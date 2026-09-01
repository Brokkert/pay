// De kasboekmotor.
//
// Eén idee draagt het geheel: **elke post heeft één betaler en één verdeling.**
// Of dat nu de gezamenlijke rekening is, je zakelijke rekening, of de creditcard
// van een vriend van wie jij een abonnement meegebruikt — het is telkens
// hetzelfde. Wie een deel draagt maar niet de betaler is, staat bij die betaler
// in het krijt. Meer is er niet.
//
// Daardoor verrekent alles kruislings vanzelf. Zit Pieter in jouw YouTube-abo
// (€ 4,17 per maand) en zit jij in zijn Spotify (€ 2,50), dan rolt daar netto
// € 1,67 van Pieter naar jou uit, zonder dat je ergens hoeft af te trekken.
//
// De gezamenlijke rekening telt in de boeken als een eigen partij. "Wat moet
// Anne overmaken" is dus geen apart soort som, maar gewoon haar schuld aan die
// partij — precies dezelfde berekening als de rest.

import { perMaand, perJaar, loopt } from './ritme.js';
import { verdeel } from './verdeel.js';

/** De partij die geld ontvangt: een gezamenlijke pot, of anders een persoon. */
export function betalerPartij(post, rekeningen) {
  const b = post.betaler || {};
  if (b.soort === 'persoon') return b.id ? `persoon:${b.id}` : null;
  const rekening = rekeningen.find((r) => r.id === b.id);
  if (!rekening) return null;
  if (rekening.soort === 'gezamenlijk') return `pot:${rekening.id}`;
  return rekening.eigenaar_id ? `persoon:${rekening.eigenaar_id}` : null;
}

export const isPot = (partij) => String(partij || '').startsWith('pot:');
export const partijId = (partij) => String(partij || '').split(':')[1] || null;

export function partijNaam(partij, { personen, rekeningen }) {
  const id = partijId(partij);
  if (isPot(partij)) return rekeningen.find((r) => r.id === id)?.naam || 'gezamenlijk';
  return personen.find((p) => p.id === id)?.naam || 'onbekend';
}

/**
 * Rekent één maand door.
 *
 * `maand` is 'jjjj-mm'. Posten die in die maand niet lopen (nog niet begonnen,
 * al opgezegd, of even gepauzeerd) doen niet mee.
 */
export function rekenMaand({ posten = [], personen = [], rekeningen = [] }, maand) {
  const lopend = posten.filter((p) => loopt(p, maand));

  const regels = [];
  const waarschuwingen = [];
  // schuld[vanPersoon][naarPartij] = centen per maand
  const schuld = {};
  const draagt = Object.fromEntries(personen.map((p) => [p.id, 0]));
  const perRekening = Object.fromEntries(rekeningen.map((r) => [r.id, 0]));
  const perCategorie = {};
  let maandlast = 0;
  let jaarlast = 0;

  for (const post of lopend) {
    const bedrag = perMaand(post.bedrag, post.ritme);
    const partij = betalerPartij(post, rekeningen);
    const { delen, restant } = verdeel(bedrag, post.verdeling);

    if (!partij) {
      waarschuwingen.push(`"${post.naam}" heeft geen geldige betaler en telt niet mee.`);
      continue;
    }
    if (restant !== 0) {
      waarschuwingen.push(
        `Bij "${post.naam}" tellen de vaste bedragen niet op tot het postbedrag; ` +
          'het verschil komt bij de betaler te liggen.'
      );
    }

    maandlast += bedrag;
    jaarlast += perJaar(post.bedrag, post.ritme);
    if (post.betaler?.soort === 'rekening') perRekening[post.betaler.id] += bedrag;
    const cat = post.categorie || 'overig';
    perCategorie[cat] = (perCategorie[cat] || 0) + bedrag;

    // Het restant bij vaste bedragen ligt bij de betaler: die heeft het immers
    // wel overgemaakt. Is de betaler een pot, dan blijft het in de pot hangen.
    const eigen = { ...delen };
    const betalerPersoon = isPot(partij) ? null : partijId(partij);
    if (restant !== 0 && betalerPersoon) {
      eigen[betalerPersoon] = (eigen[betalerPersoon] || 0) + restant;
    }

    for (const [persoonId, deel] of Object.entries(eigen)) {
      if (!deel) continue;
      draagt[persoonId] = (draagt[persoonId] || 0) + deel;
      // Betaal je het zelf, dan ben je jezelf niets schuldig.
      if (`persoon:${persoonId}` === partij) continue;
      schuld[persoonId] = schuld[persoonId] || {};
      schuld[persoonId][partij] = (schuld[persoonId][partij] || 0) + deel;
    }

    regels.push({ post, bedrag, partij, delen: eigen, restant });
  }

  return {
    maand,
    regels,
    maandlast,
    jaarlast,
    draagt,
    perRekening,
    perCategorie,
    stromen: net(schuld),
    potten: pottenOverzicht(schuld, rekeningen, perRekening),
    waarschuwingen: [...new Set(waarschuwingen)],
  };
}

/**
 * Wegstrepen wat elkaar opheft.
 *
 * Tussen twee personen blijft één richting over. Naar een pot toe is er maar
 * één richting mogelijk — een pot betaalt nooit iemands aandeel in andermans
 * abonnement — dus daar valt niets weg te strepen.
 */
export function net(schuld) {
  const netto = new Map();
  const sleutel = (a, b) => `${a}→${b}`;

  for (const [van, naar] of Object.entries(schuld)) {
    for (const [partij, centen] of Object.entries(naar)) {
      if (!centen) continue;
      const tegen = isPot(partij) ? null : sleutel(partijId(partij), `persoon:${van}`);
      if (tegen && netto.has(tegen)) {
        const bestaand = netto.get(tegen);
        bestaand.centen -= centen;
        continue;
      }
      const s = sleutel(van, partij);
      netto.set(s, { van, naar: partij, centen: (netto.get(s)?.centen || 0) + centen });
    }
  }

  const uit = [];
  for (const stroom of netto.values()) {
    if (stroom.centen === 0) continue;
    uit.push(
      stroom.centen > 0
        ? stroom
        : { van: partijId(stroom.naar), naar: `persoon:${stroom.van}`, centen: -stroom.centen }
    );
  }
  return uit.sort((a, b) => b.centen - a.centen);
}

/** Per gezamenlijke rekening: wat er af gaat, wat ieders aandeel is, wat er in komt. */
function pottenOverzicht(schuld, rekeningen, perRekening) {
  return rekeningen
    .filter((r) => r.soort === 'gezamenlijk')
    .map((rekening) => {
      const partij = `pot:${rekening.id}`;
      const aandeel = {};
      for (const [persoonId, naar] of Object.entries(schuld)) {
        if (naar[partij]) aandeel[persoonId] = naar[partij];
      }
      const stortingen = rekening.stortingen || {};
      const inleg = Object.values(stortingen).reduce((s, c) => s + (Number(c) || 0), 0);
      const uit = perRekening[rekening.id] || 0;
      return { rekening, uit, aandeel, stortingen, inleg, verschil: inleg - uit };
    });
}

/**
 * De losse posten: eenmalige uitgaven die nog niet zijn afgerekend.
 * Die horen niet in een maandlast thuis — je zet er geen automatische
 * overboeking voor klaar — maar ze staan wel open.
 */
export function losseSaldi(posten, rekeningen) {
  const open = posten.filter((p) => p.ritme === 'eenmalig' && !p.afgerekend);
  const schuld = {};
  const regels = [];

  for (const post of open) {
    const partij = betalerPartij(post, rekeningen);
    if (!partij) continue;
    const { delen, restant } = verdeel(post.bedrag, post.verdeling);
    const eigen = { ...delen };
    const betalerPersoon = isPot(partij) ? null : partijId(partij);
    if (restant !== 0 && betalerPersoon) {
      eigen[betalerPersoon] = (eigen[betalerPersoon] || 0) + restant;
    }
    for (const [persoonId, deel] of Object.entries(eigen)) {
      if (!deel || `persoon:${persoonId}` === partij) continue;
      schuld[persoonId] = schuld[persoonId] || {};
      schuld[persoonId][partij] = (schuld[persoonId][partij] || 0) + deel;
    }
    regels.push({ post, partij, delen: eigen });
  }

  return { regels, stromen: net(schuld) };
}
