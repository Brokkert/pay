// Wie draagt welk deel van een post.
//
// Alle vier de vormen komen uit op hetzelfde: een aantal hele centen per
// persoon, die samen precies het bedrag zijn. Geen cent erbij, geen cent eraf.

export const VERDELINGEN = [
  { id: 'gelijk', label: 'Gelijk', blurb: 'Ieder evenveel.' },
  { id: 'delen', label: 'In delen', blurb: 'Bijvoorbeeld 2 om 1, of naar aantal plekken.' },
  { id: 'procent', label: 'In procenten', blurb: 'Bijvoorbeeld 60/40 naar inkomen.' },
  { id: 'bedrag', label: 'Vaste bedragen', blurb: 'Je tikt per persoon het bedrag in.' },
];

export const leegVerdeling = (deelnemers = []) => ({ soort: 'gelijk', deelnemers, gewichten: {} });

/** De personen die meedoen, in een vaste volgorde — die volgorde bepaalt de restcent. */
export function deelnemersVan(verdeling) {
  const v = verdeling || {};
  if (v.soort === 'bedrag' || v.soort === 'delen' || v.soort === 'procent') {
    return Object.keys(v.gewichten || {}).filter((id) => Number(v.gewichten[id]) > 0);
  }
  return [...(v.deelnemers || [])];
}

/**
 * Verdeelt een bedrag naar gewicht met de methode van de grootste rest.
 *
 * Ieder krijgt eerst zijn deel naar beneden afgerond; de centen die dan nog
 * over zijn gaan naar wie het dichtst bij een hele cent zat. Bij een gelijke
 * stand wint de eerste in de opgegeven volgorde, zodat dezelfde invoer altijd
 * dezelfde uitkomst geeft — een verdeling die per keer wisselt is onbruikbaar.
 */
export function naarGewicht(centen, gewichten) {
  const ids = Object.keys(gewichten).filter((id) => Number(gewichten[id]) > 0);
  const totaal = ids.reduce((s, id) => s + Number(gewichten[id]), 0);
  if (!ids.length || totaal <= 0) return {};

  const negatief = centen < 0;
  const bedrag = Math.abs(centen);

  const rijen = ids.map((id, i) => {
    const exact = (bedrag * Number(gewichten[id])) / totaal;
    const heel = Math.floor(exact);
    return { id, i, heel, rest: exact - heel };
  });

  // Er blijven er hoogstens ids.length - 1 over, want elke afronding naar
  // beneden verliest minder dan een hele cent.
  const over = bedrag - rijen.reduce((s, r) => s + r.heel, 0);
  const volgorde = [...rijen].sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let n = 0; n < over; n += 1) volgorde[n].heel += 1;

  const uit = {};
  for (const r of rijen) uit[r.id] = negatief ? -r.heel : r.heel;
  return uit;
}

/**
 * Het bedrag van een post over de deelnemers.
 *
 * Geeft ook `restant` terug: bij vaste bedragen kan de som net niet uitkomen op
 * het postbedrag. Dat verzwijgen we niet en we schuiven het ook niet stilletjes
 * bij iemand naar binnen — de aanroeper (de kasboekmotor) legt het bij de
 * betaler neer, en het formulier waarschuwt erover.
 */
export function verdeel(centen, verdeling) {
  const v = verdeling || {};

  if (v.soort === 'bedrag') {
    const delen = {};
    let som = 0;
    for (const [id, bedrag] of Object.entries(v.gewichten || {})) {
      const c = Math.round(Number(bedrag) || 0);
      if (!c) continue;
      delen[id] = c;
      som += c;
    }
    return { delen, restant: centen - som };
  }

  const gewichten = {};
  if (v.soort === 'delen' || v.soort === 'procent') {
    for (const [id, g] of Object.entries(v.gewichten || {})) {
      const n = Number(g);
      if (n > 0) gewichten[id] = n;
    }
  } else {
    for (const id of v.deelnemers || []) gewichten[id] = 1;
  }

  const delen = naarGewicht(centen, gewichten);
  const som = Object.values(delen).reduce((s, c) => s + c, 0);
  return { delen, restant: centen - som };
}

/** Korte omschrijving voor in een lijst: "gelijk over 4" of "60/40". */
export function omschrijfVerdeling(verdeling, naamVan) {
  const v = verdeling || {};
  const ids = deelnemersVan(v);
  if (!ids.length) return 'niemand';
  if (ids.length === 1) return `helemaal voor ${naamVan(ids[0])}`;

  if (v.soort === 'gelijk') return `gelijk over ${ids.length}`;
  if (v.soort === 'procent') return ids.map((id) => `${Number(v.gewichten[id])}%`).join('/');
  if (v.soort === 'delen') return ids.map((id) => Number(v.gewichten[id])).join(' om ');
  return 'vaste bedragen';
}
