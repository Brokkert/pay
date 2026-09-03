// In and out. Two directions, both without fuss.
//
// Out: a CSV you open straight in Excel, with everything worked out — per
// expense the monthly amount, the yearly amount, and every bearer's share in its
// own column. That is exactly the sheet people keep by hand.
//
// In: pasting. Your existing overview has a column of names and a column of
// amounts; you drag those two over here and fill in the rest once.

import { perMonth, perYear, cadenceOf, CADENCES } from './cadence.js';
import { split, possibleBearers } from './split.js';
import { payerParty, isAccountParty, partyId } from './ledger.js';
import { parseMoney } from './money.js';
import { categoryOf } from '../data/categories.js';

const cell = (value) => {
  const text = String(value ?? '');
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Excel in Dutch expects a semicolon and a decimal comma. With a dot-and-comma
// combination everything lands in one column.
const amount = (cents) => String((cents / 100).toFixed(2)).replace('.', ',');

export function toCsv({ expenses, people, accounts }) {
  const bearers = possibleBearers(people, accounts);
  const header = [
    'Post', 'Categorie', 'Groep', 'Bedrag', 'Ritme', 'Per maand', 'Per jaar',
    'Betaald door', 'Zakelijk', 'Loopt vanaf', 'Loopt tot', 'Notitie',
    ...bearers.map((b) => `Aandeel ${b.name}`),
  ];

  const rows = expenses.map((expense) => {
    const monthly = perMonth(expense.amount, expense.cadence);
    const party = payerParty(expense, accounts);
    const { parts } = split(expense.cadence === 'once' ? expense.amount : monthly, expense.split);
    const payer = isAccountParty(party)
      ? accounts.find((a) => a.id === partyId(party))?.name
      : people.find((p) => p.id === partyId(party))?.name;

    return [
      expense.name,
      categoryOf(expense.category).label,
      expense.charge || '',
      amount(expense.amount),
      cadenceOf(expense.cadence).label,
      amount(monthly),
      amount(perYear(expense.amount, expense.cadence)),
      payer || '',
      expense.business ? 'ja' : '',
      expense.from || '',
      expense.until || '',
      expense.note || '',
      ...bearers.map((b) => amount(parts[b.key] || 0)),
    ];
  });

  return [header, ...rows].map((row) => row.map(cell).join(';')).join('\r\n');
}

/**
 * Reads a pasted piece of table.
 *
 * Excel gives you tabs when you copy a selection; an export gives semicolons or
 * commas. We look at which one occurs most per line and use that — so there is
 * nothing to configure.
 *
 * The first column with text is the name, the first column that reads as an
 * amount is the amount. A header row ("Omschrijving  Bedrag") has no amount and
 * drops out by itself.
 */
export function parsePaste(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];

  for (const line of lines) {
    const separator = ['\t', ';', ','].sort((a, b) => line.split(b).length - line.split(a).length)[0];
    const columns = line.split(separator).map((c) => c.trim().replace(/^"|"$/g, ''));

    let name = '';
    let cents = null;
    let cadence = 'month';

    for (const column of columns) {
      if (!column) continue;
      const asAmount = /\d/.test(column) ? parseMoney(column) : null;
      // A column holding only digits and separators is an amount; if there is
      // text in it too, it is the name (or the cadence).
      const numericOnly = /^[^A-Za-z]*$/.test(column.replace(/€|EUR/gi, ''));
      if (asAmount !== null && numericOnly && cents === null) cents = asAmount;
      else if (!name) name = column;
      else {
        const lower = column.toLowerCase();
        const found = CADENCES.find((c) => c.keywords.some((w) => lower.includes(w)));
        if (found) cadence = found.id;
      }
    }

    if (name && cents) out.push({ name, amount: cents, cadence });
  }

  return out;
}

export function download(name, content, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿', content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
