// In en uit. Twee richtingen, allebei zonder gedoe.
//
// Uit: een CSV die je zo in Excel opent, met alles al doorgerekend — per post
// het maandbedrag, het jaarbedrag en het aandeel van iedere persoon in een
// eigen kolom. Dat is precies het blad dat je nu met de hand bijhoudt.
//
// In: plakken. Je bestaande overzicht heeft een kolom met namen en een kolom
// met bedragen; die twee sleep je hierheen en de rest vul je één keer in.

import { perMaand, perJaar, ritmeVan, RITMES } from './ritme.js';
import { verdeel } from './verdeel.js';
import { betalerPartij, isPot, partijId } from './saldo.js';
import { parseGeld } from './geld.js';
import { categorieVan } from '../data/categorieen.js';

const veld = (waarde) => {
  const tekst = String(waarde ?? '');
  return /[";\n]/.test(tekst) ? `"${tekst.replace(/"/g, '""')}"` : tekst;
};

// Excel in het Nederlands verwacht een puntkomma en een decimale komma. Met
// een punt-komma-combinatie belandt alles anders in één kolom.
const bedrag = (centen) => String((centen / 100).toFixed(2)).replace('.', ',');

export function naarCsv({ posten, personen, rekeningen }) {
  const kop = [
    'Post', 'Categorie', 'Incasso', 'Bedrag', 'Ritme', 'Per maand', 'Per jaar',
    'Betaald door', 'Zakelijk', 'Loopt vanaf', 'Loopt tot', 'Notitie',
    ...personen.map((p) => `Aandeel ${p.naam}`),
  ];

  const regels = posten.map((post) => {
    const maandbedrag = perMaand(post.bedrag, post.ritme);
    const partij = betalerPartij(post, rekeningen);
    const { delen } = verdeel(post.ritme === 'eenmalig' ? post.bedrag : maandbedrag, post.verdeling);
    const betaler = isPot(partij)
      ? rekeningen.find((r) => r.id === partijId(partij))?.naam
      : personen.find((p) => p.id === partijId(partij))?.naam;

    return [
      post.naam,
      categorieVan(post.categorie).label,
      post.bundel || '',
      bedrag(post.bedrag),
      ritmeVan(post.ritme).label,
      bedrag(maandbedrag),
      bedrag(perJaar(post.bedrag, post.ritme)),
      betaler || '',
      post.zakelijk ? 'ja' : '',
      post.vanaf || '',
      post.tot || '',
      post.notitie || '',
      ...personen.map((p) => bedrag(delen[p.id] || 0)),
    ];
  });

  return [kop, ...regels].map((rij) => rij.map(veld).join(';')).join('\r\n');
}

/**
 * Leest een geplakt stuk tabel.
 *
 * Excel geeft tabs mee als je een selectie kopieert, een export geeft
 * puntkomma's of komma's. We kijken per regel welke het vaakst voorkomt en
 * gebruiken die — je hoeft dus niets in te stellen.
 *
 * De eerste kolom met tekst is de naam, de eerste kolom die als bedrag te lezen
 * is het bedrag. Een kopregel ("Omschrijving  Bedrag") heeft geen bedrag en
 * valt daarmee vanzelf af.
 */
export function leesPlak(tekst) {
  const regels = String(tekst || '').split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const uit = [];

  for (const regel of regels) {
    const scheider = ['\t', ';', ','].sort(
      (a, b) => (regel.split(b).length - regel.split(a).length)
    )[0];
    const kolommen = regel.split(scheider).map((k) => k.trim().replace(/^"|"$/g, ''));

    let naam = '';
    let centen = null;
    let ritme = 'maand';

    for (const kolom of kolommen) {
      if (!kolom) continue;
      const alsBedrag = /\d/.test(kolom) ? parseGeld(kolom) : null;
      // Een kolom die alleen maar cijfers en scheidingstekens bevat is een
      // bedrag; staat er ook tekst in, dan is het de naam (of het ritme).
      const puurGetal = /^[^A-Za-z]*$/.test(kolom.replace(/€|EUR/gi, ''));
      if (alsBedrag !== null && puurGetal && centen === null) centen = alsBedrag;
      else if (!naam) naam = kolom;
      else {
        const gevonden = RITMES.find((r) => kolom.toLowerCase().includes(r.id));
        if (gevonden) ritme = gevonden.id;
      }
    }

    if (naam && centen) uit.push({ naam, bedrag: centen, ritme });
  }

  return uit;
}

export function download(naam, inhoud, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿', inhoud], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = naam;
  link.click();
  URL.revokeObjectURL(url);
}
