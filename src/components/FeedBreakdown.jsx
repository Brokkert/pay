// What one account has to cover in a month, and the sheet that shows it.
//
// Two tabs ask the same question of the same account — "Overhouden" because it
// wants to know what is left on it, "Verrekenen" because that amount is a
// transfer you make — so the sum lives here rather than in either of them. Two
// copies of it are two answers waiting to drift apart.

import { formatMoney } from '../lib/money.js';
import { cadenceOf } from '../lib/cadence.js';
import { categoryOf } from '../data/categories.js';
import Breakdown from './Breakdown.jsx';

/** The colour that says which category a post belongs to. */
export const dot = (expense) => (
  <span className="cat-dot" style={{ background: categoryOf(expense.category).colour }} />
);

/**
 * One post, in a sheet that is about either the whole amount or your share.
 *
 * The same row either way: the figure the sheet is about, and under it what it
 * is a part of or what part of it is yours. Two sheets that put the same two
 * numbers in a different order are two sheets you have to learn separately —
 * and reading one as the other is how you end up counting a bill twice.
 */
export function postRow(line, { showing, me, from = null }) {
  const whole = line.amount;
  const share = (me && line.shares[me.id]) || 0;
  const bits = [];
  // Every figure here is per month; a bill that comes once a year says so, or
  // the row cannot be found on a bank statement.
  if (line.expense.cadence !== 'month') {
    bits.push(`${formatMoney(line.expense.amount)} ${cadenceOf(line.expense.cadence).short}`);
  }
  if (showing === 'whole') {
    if (share) bits.push(share === whole ? 'helemaal van jou' : `waarvan jij ${formatMoney(share)}`);
  } else {
    bits.push(share === whole ? 'helemaal van jou' : `jouw deel van ${formatMoney(whole)}`);
    if (from) bits.push(`van ${from}`);
  }
  return {
    key: line.expense.id,
    left: dot(line.expense),
    what: line.expense.name,
    sub: bits.length ? bits.join(' · ') : undefined,
    cents: showing === 'whole' ? whole : share,
  };
}

/**
 * Everything one account has to cover in a month.
 *
 * The same sum the account's own block is built from, so the two can never say
 * different things: its posts, what it settles with other accounts, and — where
 * asked for — what it costs outside the posts.
 */
export function needRows(pot, lines, accounts, me, { overhead = false } = {}) {
  const nameOf = (id) => accounts.find((a) => a.id === id)?.name || 'een andere rekening';
  const rows = lines
    .filter(
      (line) =>
        line.expense.payer?.kind === 'account' && line.expense.payer.id === pot?.account.id
    )
    .map((line) => postRow(line, { showing: 'whole', me }))
    .sort((a, b) => b.cents - a.cents);

  // Traffic with other accounts: this one fronting for another, or the other way
  // round. It leaves and arrives just like a post does.
  for (const [id, cents] of Object.entries(pot?.toAccounts || {})) {
    rows.push({ key: `to-${id}`, what: `Betaalt door aan ${nameOf(id)}`, cents });
  }
  for (const [id, cents] of Object.entries(pot?.fromAccounts || {})) {
    rows.push({
      key: `from-${id}`,
      what: `Krijgt terug van ${nameOf(id)}`,
      cents: -cents,
      tone: 'credit',
    });
  }
  if (overhead && pot?.overhead > 0) {
    rows.push({
      key: 'overhead',
      what: 'Kosten buiten je posten om',
      sub: 'kosten van die rekening die je met niemand deelt',
      cents: pot.overhead,
    });
  }
  return rows;
}

/** What an account it feeds has to cover, and whether the standing order fits. */
export default function FeedBreakdown({ feed, pot, lines, accounts, me, onClose }) {
  return (
    <Breakdown
      title={`Naar ${feed.account.name}`}
      label="Wat die rekening elke maand nodig heeft"
      cents={feed.needed}
      rows={needRows(pot, lines, accounts, me, { overhead: true })}
      empty={`Er staan nog geen posten op ${feed.account.name}, dus valt er niets te berekenen.`}
      note={
        <>
          {feed.order
            ? feed.order === feed.needed
              ? `Je maakt er ${formatMoney(feed.order)} per maand naartoe over. Dat is precies genoeg.`
              : `Je maakt er ${formatMoney(feed.order)} per maand naartoe over, ${
                  feed.order > feed.needed ? 'meer' : 'minder'
                } dan de ${formatMoney(feed.needed)} hierboven. Pas je vaste inleg bij ${
                  feed.account.name
                } aan, of laat het staan als je bewust een buffer opbouwt.`
            : `Er staat nog geen vaste inleg bij ${feed.account.name}. Zolang die er niet is, rekent Pay met dit bedrag.`}
          {feed.aside > 0 && (
            <>
              {' '}
              Daar bovenop hoort <strong>{formatMoney(feed.aside)}</strong> op die rekening te staan
              voor posten die niet elke maand worden afgeschreven.
            </>
          )}
        </>
      }
      onClose={onClose}
    />
  );
}
