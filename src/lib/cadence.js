// How often an expense comes back, and what that means per month.
//
// The `id` values are stored inside the encrypted blob, so they are data rather
// than display text; the labels next to them are what people read.

// `keywords` is what the paste importer looks for in a pasted third column.
// Order matters there: "half jaar" has to be tried before "jaar", or every
// half-yearly line would come in as yearly.
export const CADENCES = [
  { id: 'month', label: 'per maand', short: '/mnd', perYear: 12, keywords: ['maand'] },
  { id: 'quarter', label: 'per kwartaal', short: '/kwt', perYear: 4, keywords: ['kwartaal'] },
  { id: 'halfyear', label: 'per half jaar', short: '/hj', perYear: 2, keywords: ['half jaar', 'halfjaar'] },
  { id: 'year', label: 'per jaar', short: '/jr', perYear: 1, keywords: ['jaar', 'jaarlijks'] },
  { id: 'week', label: 'per week', short: '/wk', perYear: 52, keywords: ['week'] },
  { id: 'once', label: 'eenmalig', short: 'eenmalig', perYear: 0, keywords: ['eenmalig'] },
];

export const cadenceOf = (id) => CADENCES.find((c) => c.id === id) || CADENCES[0];

/**
 * What an expense costs per month.
 *
 * This rounds once, and nothing rounds after it: every split further down works
 * on this whole number of cents. A subscription of € 100 a year is € 8,33 a
 * month in the books, not € 8,3333… that loses a cent somewhere later.
 *
 * One-off expenses cost nothing per month — they do not belong in a recurring
 * total, but in the loose settlements.
 */
export function perMonth(cents, cadence) {
  const c = cadenceOf(cadence);
  if (!c.perYear) return 0;
  return Math.round((cents * c.perYear) / 12);
}

/** What it costs per year — the fairest number to compare expenses by. */
export function perYear(cents, cadence) {
  return Math.round(cents * cadenceOf(cadence).perYear);
}

/** Is this expense running in the given month? (yyyy-mm) */
export function isActive(expense, month) {
  if (expense.cadence === 'once') return false;
  if (expense.from && expense.from.slice(0, 7) > month) return false;
  if (expense.until && expense.until.slice(0, 7) < month) return false;
  return !expense.paused;
}

export const thisMonth = () => new Date().toISOString().slice(0, 7);

const MONTH_NAMES = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

export function formatMonth(month) {
  const [year, m] = String(month).split('-');
  return `${MONTH_NAMES[Number(m) - 1]} ${year}`;
}

export function shiftMonth(month, steps) {
  const [year, m] = String(month).split('-').map(Number);
  const total = year * 12 + (m - 1) + steps;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
