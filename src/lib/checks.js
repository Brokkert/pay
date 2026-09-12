// Everything Pay can check about itself.
//
// It knows the whole chain: every post, who carries it, which account it comes
// off, what fills that account, and what everyone has to transfer. So it can
// say whether that adds up — and it should say it in one place, not as a hint
// on whichever screen happens to show the account it went wrong on.
//
// Nothing here changes a figure. It reads the month that has already been
// worked out and reports what does not close.

import { formatMoney } from './money.js';

/**
 * Runs every check over one worked-out month.
 *
 * Only what is wrong: a figure elsewhere in the app is not to be trusted until
 * you fix it. Everything that merely asks something of you is on the account it
 * is about — a list of those at the top of the first screen is a list nobody
 * opens twice.
 */
export function runChecks({ accounts = [] }, result) {
  const found = [];
  const add = (id, tone, text) => found.push({ id, tone, text });

  // What the ledger itself ran into while dividing: an expense without a valid
  // account, fixed amounts that do not add up. Those come with their own words.
  for (const [i, text] of (result.warnings || []).entries()) {
    add(`ledger-${i}`, 'warn', text);
  }

  for (const pot of result.pots) {
    const name = pot.account.name;

    // A pot people pay into holds nothing of its own: everything arriving
    // leaves again. Anything else means a share nobody carries.
    if (pot.account.kind === 'shared' && pot.closes !== 0) {
      add(
        `closes-${pot.account.id}`,
        'warn',
        `Op ${name} komt ${formatMoney(Math.abs(pot.closes))} niet uit. Er gaat iets af dat niemand draagt, of er komt meer op dan er af gaat.`
      );
    }

    // Without a charge month a yearly post cannot say how much has to be on the
    // account yet, so that figure is wrong rather than merely absent.
    if (pot.chargeUnknown) {
      add(
        `charge-${pot.account.id}`,
        'warn',
        `Bij een post op ${name} is niet ingevuld in welke maand hij wordt afgeschreven. Daardoor klopt niet wat er nu op die rekening hoort te staan.`
      );
    }

  }

  return found;
}
