// Money is always a whole number of cents. Never a float: 0.1 + 0.2 is not 0.3
// in JavaScript, and bookkeeping that can lose half a cent is not bookkeeping.

/**
 * Reads an amount the way someone actually types it, and returns cents.
 *
 * Dutch and English notation get mixed constantly: you paste "1.234,56" from a
 * bank statement and "12.50" from an English invoice. So we look at the last
 * separator and count the digits behind it — one or two means a decimal comma,
 * exactly three means a thousands separator.
 */
export function parseMoney(input) {
  if (typeof input === 'number') return Math.round(input * 100);
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  const negative = /^-|^\(.*\)$/.test(raw);
  const clean = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(clean)) return null;

  const commas = (clean.match(/,/g) || []).length;
  const dots = (clean.match(/\./g) || []).length;
  const last = Math.max(clean.lastIndexOf(','), clean.lastIndexOf('.'));

  let whole = clean;
  let fraction = '';

  if (last !== -1) {
    const mark = clean[last];
    const before = clean.slice(0, last);
    const after = clean.slice(last + 1);
    const onlyThisMark = mark === ',' ? dots === 0 : commas === 0;
    const countHere = mark === ',' ? commas : dots;

    // With both marks present the last one is the decimal separator and the
    // other groups thousands — that reads "1.234,56" and "1,234.56" correctly.
    // One kind of mark appearing more than once is grouping. What is left is a
    // single mark: a comma is decimal, because that is how we write it here; a
    // lone dot with exactly three digits after it (and a valid group before it)
    // is a thousands separator, otherwise it is decimal too.
    const grouped =
      onlyThisMark &&
      ((countHere > 1 && new RegExp(`^[1-9]\\d{0,2}(\\${mark}\\d{3})+$`).test(clean)) ||
        (countHere === 1 && mark === '.' && after.length === 3 && /^[1-9]\d{0,2}$/.test(before)));

    if (!grouped) {
      whole = before;
      fraction = after;
    }
  }

  whole = whole.replace(/[.,]/g, '') || '0';
  const cents = Math.round(Number(`${whole}.${fraction || '0'}`) * 100);
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Cents as a readable amount. Formatted by hand rather than through Intl, so the
 * output is identical everywhere — including in a test runner without full
 * locale data.
 */
export function formatMoney(cents, { symbol = true, decimals = 2 } = {}) {
  if (cents == null || !Number.isFinite(cents)) return symbol ? '€ –' : '–';
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = group(Math.floor(abs / 100));
  const rest = String(abs % 100).padStart(2, '0');
  const number = decimals === 0 ? whole : `${whole},${rest}`;
  return `${negative ? '−' : ''}${symbol ? '€ ' : ''}${number}`;
}

/** Short, for a table: € 1.234 without cents when the amount is round. */
export function formatShort(cents) {
  if (cents == null) return '€ –';
  return cents % 100 === 0 ? formatMoney(cents, { decimals: 0 }) : formatMoney(cents);
}

/** The amount as it belongs in an input field (no currency symbol). */
export function toInput(cents) {
  if (cents == null) return '';
  return formatMoney(cents, { symbol: false }).replace('−', '-');
}
