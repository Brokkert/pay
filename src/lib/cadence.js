// How often an expense comes back, and what that means per month.
//
// The `id` values are stored inside the encrypted blob, so they are data rather
// than display text; the labels next to them are what people read.

// `keywords` is what the paste importer looks for in a pasted third column.
// Order matters there: "half jaar" has to be tried before "jaar", or every
// half-yearly line would come in as yearly.
export const CADENCES = [
  { id: 'month', label: 'per maand', short: '/mnd', perYear: 12, keywords: ['maand'] },
  // Thirteen charges a year, not twelve: a four-weekly bill entered as monthly
  // is understated by a whole month's worth. It stays above twelve a year, so
  // there is nothing to save up for and no charge month to ask about — some
  // month simply carries two of them.
  { id: 'fourweek', label: 'per 4 weken', short: '/4wk', perYear: 13, keywords: ['4 weken', 'vier weken', '4-weken', '4wk'] },
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
 * The month an expense is charged in, as 0-11, or null when it is not known.
 *
 * Asked for directly, because that is the fact: an insurance is charged in
 * March. The start date is only a fallback for expenses entered before there
 * was a field for it — it happened to give the right answer when a policy is
 * charged in the month it started, and the wrong one whenever the renewal has
 * since moved.
 *
 * Only the month matters, never the year: every rhythm here divides twelve, so
 * a quarterly bill charged in January is charged in April, July and October
 * too, year in year out.
 */
export function chargeAnchor(expense) {
  const given = Number(expense?.chargeMonth);
  if (given >= 1 && given <= 12) return given - 1;
  if (expense?.from) return Number(expense.from.slice(5, 7)) - 1;
  return null;
}

/** How many months apart this expense is charged. */
const stepOf = (cadence) => 12 / cadenceOf(cadence).perYear;

/** Months from the last charge to this one, 0 in the month it goes out. */
function sinceCharge(expense, month) {
  const anchor = chargeAnchor(expense);
  if (anchor === null) return null;
  const step = stepOf(expense.cadence);
  return (((Number(String(month).slice(5, 7)) - 1 - anchor) % step) + step) % step;
}

/**
 * Is this the month the money actually leaves?
 *
 * An expense charged less often than monthly still counts every month in the
 * books — that is the saving up — but the account only feels it once. Returns
 * null when the charge month is not known, because then guessing would be
 * worse than saying so.
 */
export function chargedIn(expense, month) {
  const c = cadenceOf(expense.cadence);
  if (c.id === 'once') return false;
  if (c.perYear >= 12) return true;
  const since = sinceCharge(expense, month);
  return since === null ? null : since === 0;
}

/** The day of the month the bank takes it, when that has been filled in. */
export function chargeDayOf(expense) {
  const day = Number(expense?.chargeDay);
  return day >= 1 && day <= 31 ? day : null;
}

/** Today, as the app writes a date. */
export const todayISO = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** How many days this month has — February being the reason to ask. */
export function daysInMonth(month) {
  const year = Number(String(month).slice(0, 4));
  const index = Number(String(month).slice(5, 7));
  return new Date(year, index, 0).getDate();
}

/**
 * The day a charge set to this day really lands on, in this month.
 *
 * A charge on the 31st is a charge on the last day: nobody means "skip
 * February". Clamping here is what banks do too, and without it a day past the
 * end of a short month would sit as "moet nog" for the whole month and never
 * happen.
 */
export const dayInMonth = (day, month) => Math.min(day, daysInMonth(month));

/**
 * At this point in time, has this month's charge already left the account?
 *
 * Two things make the question unanswerable, and both mean the same as it
 * always did — the whole month counts as done: no day filled in, and a month
 * that is not the one we are living in. A month you page back to has no "now".
 */
export function chargePassed(expense, month, today) {
  if (!today || String(today).slice(0, 7) !== String(month)) return true;
  const day = chargeDayOf(expense);
  if (day === null) return true;
  return Number(String(today).slice(8, 10)) >= dayInMonth(day, month);
}

/**
 * What is set aside for it by this month: one monthly instalment for every
 * month since it was last charged. Nothing in the month it goes out, because
 * that is when the saving is spent — but not one day before it actually goes.
 *
 * Without the day that is the whole month, and for the twenty-six days before
 * the bank takes it Pay reported nought while the money was still there. That
 * is the one answer your bank statement openly contradicts, so where the day is
 * known a full cycle of instalments stands until it is spent.
 */
export function setAside(expense, month, today = null) {
  const c = cadenceOf(expense.cadence);
  if (c.perYear >= 12 || c.id === 'once') return 0;
  const since = sinceCharge(expense, month);
  if (since === null) return 0;
  if (since === 0) {
    return chargePassed(expense, month, today)
      ? 0
      : stepOf(expense.cadence) * perMonth(expense.amount, expense.cadence);
  }
  return since * perMonth(expense.amount, expense.cadence);
}

/**
 * The next month it is charged, from its start and its rhythm. The month itself
 * if that is the one, so "when does this go out" and "does it go out now" agree.
 */
export function nextCharge(expense, month) {
  const c = cadenceOf(expense.cadence);
  if (c.id === 'once' || c.perYear >= 12 || chargeAnchor(expense) === null) return null;
  const step = stepOf(expense.cadence);
  let candidate = month;
  for (let i = 0; i <= step; i += 1) {
    if (chargedIn(expense, candidate)) return candidate;
    candidate = shiftMonth(candidate, 1);
  }
  return null;
}

export const MONTH_NAMES = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
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
