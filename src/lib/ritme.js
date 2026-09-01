// Hoe vaak een post terugkomt, en wat dat per maand betekent.

export const RITMES = [
  { id: 'maand', label: 'per maand', kort: '/mnd', perJaar: 12 },
  { id: 'kwartaal', label: 'per kwartaal', kort: '/kwt', perJaar: 4 },
  { id: 'halfjaar', label: 'per half jaar', kort: '/hj', perJaar: 2 },
  { id: 'jaar', label: 'per jaar', kort: '/jr', perJaar: 1 },
  { id: 'week', label: 'per week', kort: '/wk', perJaar: 52 },
  { id: 'eenmalig', label: 'eenmalig', kort: 'eenmalig', perJaar: 0 },
];

export const ritmeVan = (id) => RITMES.find((r) => r.id === id) || RITMES[0];

/**
 * Wat een post per maand kost.
 *
 * Hier wordt één keer afgerond, en daarna niet meer: alle verdelingen verderop
 * werken op dit hele aantal centen. Een abonnement van € 100 per jaar staat dus
 * als € 8,33 per maand in de boeken, en niet als € 8,3333… dat later alsnog
 * ergens een cent zoekraakt.
 *
 * Eenmalige posten kosten per maand niets — die horen niet in een vaste last
 * thuis, maar in de losse verrekeningen.
 */
export function perMaand(centen, ritme) {
  const r = ritmeVan(ritme);
  if (!r.perJaar) return 0;
  return Math.round((centen * r.perJaar) / 12);
}

/** Wat een post per jaar kost — het eerlijkste getal om posten mee te vergelijken. */
export function perJaar(centen, ritme) {
  return Math.round(centen * ritmeVan(ritme).perJaar);
}

/** Loopt de post in deze maand? (jjjj-mm) */
export function loopt(post, maand) {
  if (post.ritme === 'eenmalig') return false;
  if (post.vanaf && post.vanaf.slice(0, 7) > maand) return false;
  if (post.tot && post.tot.slice(0, 7) < maand) return false;
  return !post.gepauzeerd;
}

export const dezeMaand = () => new Date().toISOString().slice(0, 7);

const MAANDNAMEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

export function toonMaand(maand) {
  const [jaar, mnd] = String(maand).split('-');
  return `${MAANDNAMEN[Number(mnd) - 1]} ${jaar}`;
}

export function verschuifMaand(maand, stappen) {
  const [jaar, mnd] = String(maand).split('-').map(Number);
  const totaal = jaar * 12 + (mnd - 1) + stappen;
  return `${Math.floor(totaal / 12)}-${String((totaal % 12) + 1).padStart(2, '0')}`;
}
