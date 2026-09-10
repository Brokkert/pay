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

/** A finding, in the order you would want to act on it. */
const RANK = { warn: 0, todo: 1, info: 2 };

/**
 * Runs every check over one worked-out month.
 *
 * `warn` is something wrong: a figure elsewhere in the app is not to be trusted
 * until you fix it. `todo` is right but asks something of you once. `info` is
 * worth knowing and needs nothing.
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

    // A standing order you set against what the posts actually need.
    if (pot.paidIn > 0 && pot.account.kind === 'shared' && pot.paidIn !== pot.needed) {
      const over = pot.paidIn > pot.needed;
      add(
        `order-${pot.account.id}`,
        'todo',
        `Op ${name} staat ${formatMoney(pot.paidIn)} als vaste inleg, terwijl er ${formatMoney(pot.needed)} per maand nodig is. Zo loopt die rekening langzaam ${over ? 'vol' : 'leeg'}.`
      );
    }

    for (const feed of pot.feeds) {
      if (feed.order && feed.order !== feed.needed) {
        const over = feed.order > feed.needed;
        add(
          `feed-${feed.account.id}`,
          'todo',
          `Je stort ${formatMoney(feed.order)} van ${name} naar ${feed.account.name}, terwijl daar ${formatMoney(feed.needed)} per maand nodig is. Zo loopt die rekening langzaam ${over ? 'vol' : 'leeg'}.`
        );
      }
    }

    // Twelve equal instalments against a year that does not divide by twelve.
    if (pot.drift !== 0) {
      add(
        `drift-${pot.account.id}`,
        'info',
        pot.drift < 0
          ? `Op ${name} dekken twaalf maandlasten het jaar net niet. Stort er één keer per jaar ${formatMoney(-pot.drift)} bij, dan komt die rekening precies op nul uit.`
          : `Op ${name} blijft ${formatMoney(pot.drift)} per jaar staan omdat twaalf maandlasten iets meer zijn dan het jaar kost. Haal dat er één keer per jaar af.`
      );
    }
  }

  // An account nobody can reach: it is in the list and nothing runs on it.
  for (const account of accounts) {
    if (result.pots.some((p) => p.account.id === account.id)) continue;
    if (account.kind === 'shared') continue;
    add(
      `idle-${account.id}`,
      'info',
      `Op ${account.name} staat geen enkele post, dus Pay heeft er niets over te zeggen.`
    );
  }

  return found.sort((a, b) => RANK[a.tone] - RANK[b.tone]);
}
