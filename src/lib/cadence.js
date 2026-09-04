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

/** Whole months from one 'yyyy-mm' to another. Negative if the second is earlier. */
export function monthsBetween(from, to) {
  const [fy, fm] = String(from).split('-').map(Number);
  const [ty, tm] = String(to).split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * Is this the month the money actually leaves?
 *
 * An expense charged less often than monthly still counts every month in the
 * books — that is the saving up — but the account only feels it once. Which
 * month follows from when it starts: a yearly policy running from March is
 * charged every March. Returns null when there is no start date, because then
 * it is not known and guessing would be worse than saying so.
 */
export function chargedIn(expense, month) {
  const c = cadenceOf(expense.cadence);
  if (c.id === 'once') return false;
  if (c.perYear >= 12) return true;
  if (!expense.from) return null;
  const since = monthsBetween(expense.from.slice(0, 7), month);
  return since >= 0 && since % (12 / c.perYear) === 0;
}

/**
 * What is set aside for it by this month: one monthly instalment for every
 * month since it was last charged. Nothing in the month it goes out, because
 * that is when the saving is spent.
 */
export function setAside(expense, month) {
  const c = cadenceOf(expense.cadence);
  if (c.perYear >= 12 || c.id === 'once' || !expense.from) return 0;
  const since = monthsBetween(expense.from.slice(0, 7), month);
  if (since < 0) return 0;
  return (since % (12 / c.perYear)) * perMonth(expense.amount, expense.cadence);
}

/**
 * The next month it is charged, from its start and its rhythm. The month itself
 * if that is the one, so "when does this go out" and "does it go out now" agree.
 */
export function nextCharge(expense, month) {
  const c = cadenceOf(expense.cadence);
  if (c.id === 'once' || c.perYear >= 12 || !expense.from) return null;
  const step = 12 / c.perYear;
  let candidate = month;
  for (let i = 0; i <= step; i += 1) {
    if (chargedIn(expense, candidate)) return candidate;
    candidate = shiftMonth(candidate, 1);
  }
  return null;
}

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
