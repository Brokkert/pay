// The ledger engine.
//
// One idea carries the whole thing: **every expense has one payer and one
// split.** Whether that is the household bills account, your business account,
// or a friend's credit card for a subscription you share — it is always the
// same. Whoever bears a share but is not the payer owes it to that payer. That
// is all.
//
// Because of that, crossing subscriptions settle themselves. If a friend is on
// your shared plan and you are on his, one line comes out instead of two.
//
// In the books a party is either a person or a shared account. That second one
// counts fully: it can be owed money (everyone's share of what went out of it)
// and it can owe money (see routeThrough below).

import { perMonth, perYear, isActive, chargedIn, setAside } from './cadence.js';
import { split, byWeight, isAccountBearer, accountOfBearer } from './split.js';
import { categoryName } from '../data/categories.js';

export const personParty = (id) => `person:${id}`;
export const accountParty = (id) => `account:${id}`;
export const isAccountParty = (party) => String(party || '').startsWith('account:');
export const partyId = (party) => String(party || '').split(':').slice(1).join(':') || null;

/**
 * The party behind a bearer from a split.
 *
 * If an account bears a share itself — part of your bank charges being a
 * business cost, say — then that account is the party, not the person who owns
 * it. That is exactly the difference: such a share is not a personal cost, and
 * what you fronted for it is yours to claim back from that account.
 */
export const bearerParty = (key) =>
  isAccountBearer(key) ? accountParty(accountOfBearer(key)) : personParty(key);

/** The party that fronted the money. */
export function payerParty(expense, accounts) {
  const p = expense.payer || {};
  if (p.kind === 'person') return p.id ? personParty(p.id) : null;
  const account = accounts.find((a) => a.id === p.id);
  if (!account) return null;
  // A shared pot and an account of the business are both parties of their own:
  // what someone owes for a bill goes back to the account the bill came off, so
  // the standing order that fills it drops by what the others put in. A
  // personal account is the exception — that account *is* the person who owns
  // it, and owing yourself is not a payment anyone makes.
  if (account.kind === 'shared' || account.kind === 'business') {
    return accountParty(account.id);
  }
  return account.ownerId ? personParty(account.ownerId) : null;
}

export function partyName(party, { people, accounts }) {
  const id = partyId(party);
  if (isAccountParty(party)) return accounts.find((a) => a.id === id)?.name || 'gezamenlijk';
  return people.find((p) => p.id === id)?.name || 'onbekend';
}

/**
 * Does this expense run on a business account?
 *
 * Derived, never stored. A separate flag next to the payer is a second answer
 * to the same question, and two answers can disagree: ticking "zakelijk" on
 * something paid from the household account would count it as business money
 * that never touched the business.
 */
export function isBusiness(expense, accounts) {
  if (expense?.payer?.kind !== 'account') return false;
  return accounts.some((a) => a.id === expense.payer.id && a.kind === 'business');
}

/** The account that settlements are routed through, if there is one. */
export const settlementAccount = (accounts) =>
  accounts.find((a) => a.kind === 'shared' && a.settlement) || null;


/**
 * Works out one month. `month` is 'yyyy-mm'.
 *
 * Expenses that are not running that month (not started yet, already cancelled,
 * or paused) are left out, and one-off expenses do not belong here at all —
 * those live in openSettlements().
 */
export function forMonth({ expenses = [], people = [], accounts = [] }, month) {
  const running = expenses.filter((e) => isActive(e, month));

  const lines = [];
  const warnings = [];
  const raw = {};
  // What each bearer ends up carrying, keyed by the key from the split — so
  // accounts that bear a share of their own are in here too.
  const borne = Object.fromEntries(people.map((p) => [p.id, 0]));
  // Of what someone carries, the part a company account paid for them. Their
  // salary never saw that money, so subtracting it from their income would say
  // they are poorer than they are — while leaving the cost out of their list
  // altogether would say they do not have it. It is both: a cost of theirs, and
  // one they did not pay out of what comes in.
  const fronted = Object.fromEntries(people.map((p) => [p.id, 0]));
  const perAccount = Object.fromEntries(accounts.map((a) => [a.id, 0]));
  const perCategory = {};
  const charges = {};
  let monthlyTotal = 0;
  let unassigned = 0;
  const realPerAccount = {};
  const asidePerAccount = {};
  const unknownCharge = new Set();
  let yearlyTotal = 0;

  for (const expense of running) {
    const amount = perMonth(expense.amount, expense.cadence);
    const party = payerParty(expense, accounts);

    if (!party) {
      warnings.push(`"${expense.name}" heeft geen geldige rekening en telt niet mee.`);
      continue;
    }

    const { parts, remainder } = split(amount, expense.split);
    // An account cannot bear anything — it only holds what people put in — so a
    // remainder on an expense it pays stays undivided until the expense itself
    // says who carries it. Counted here so it can be shown rather than lost.
    if (remainder !== 0 && isAccountParty(party)) unassigned += remainder;
    if (remainder !== 0) {
      warnings.push(
        `Bij "${expense.name}" tellen de vaste bedragen niet op tot het postbedrag. ` +
          `Er blijft ${(Math.abs(remainder) / 100).toFixed(2).replace('.', ',')} over` +
          (isAccountParty(party)
            ? '; die staat nog bij niemand. Vul in wie dat deel draagt.'
            : ' en dat draagt de betaler.')
      );
    }

    // By name, so an expense saved before categories were names lands in the
    // same bucket as one saved after.
    const category = categoryName(expense.category);
    monthlyTotal += amount;
    yearlyTotal += perYear(expense.amount, expense.cadence);
    if (expense.payer?.kind === 'account') {
      const account = expense.payer.id;
      perAccount[account] += amount;
      // Two more numbers per account, and they answer different questions than
      // the monthly load does. What actually leaves it this month, and what is
      // sitting on it waiting for a bill that comes once a year.
      const charged = chargedIn(expense, month);
      if (charged === null) unknownCharge.add(account);
      else if (charged) realPerAccount[account] = (realPerAccount[account] || 0) + expense.amount;
      const aside = setAside(expense, month);
      if (aside) asidePerAccount[account] = (asidePerAccount[account] || 0) + aside;
    }
    perCategory[category] = (perCategory[category] || 0) + amount;

    // A charge is the line you find on your bank statement, so it needs the
    // same two numbers a pot does: what it costs per month, and what actually
    // comes off in this one. Those differ the moment a yearly post sits in it.
    if (expense.charge) {
      const group = (charges[expense.charge] ||= {
        name: expense.charge,
        month: 0,
        charged: 0,
        chargeUnknown: false,
        accounts: new Set(),
        lines: [],
      });
      group.month += amount;
      const due = chargedIn(expense, month);
      if (due === null) group.chargeUnknown = true;
      else if (due) group.charged += expense.amount;
      if (expense.payer?.kind === 'account') group.accounts.add(expense.payer.id);
    }

    const shares = withRemainder(parts, remainder, party);
    for (const [key, part] of Object.entries(shares)) {
      if (!part) continue;
      borne[key] = (borne[key] || 0) + part;
      if (isBusiness(expense, accounts) && key in fronted) fronted[key] += part;
      if (paidItsOwnShare(key, expense, accounts)) continue;
      book(raw, bearerParty(key), party, part);
    }

    const line = { expense, amount, party, shares, remainder };
    lines.push(line);
    if (expense.charge) charges[expense.charge].lines.push(line);
  }

  const hub = settlementAccount(accounts);
  if (hub) routeThrough(raw, accountParty(hub.id), hub);

  const transfers = net(raw);

  return {
    month,
    lines,
    monthlyTotal,
    yearlyTotal,
    borne,
    fronted,
    unassigned,
    perAccount,
    perCategory,
    charges: Object.values(charges)
      .map((c) => ({ ...c, accounts: [...c.accounts] }))
      .sort((a, b) => b.month - a.month),
    transfers,
    pots: potOverview(
      transfers,
      accounts,
      perAccount,
      { realPerAccount, asidePerAccount, unknownCharge },
      lines,
      people
    ),
    hub,
    warnings: [...new Set(warnings)],
  };
}

/**
 * The remainder on fixed amounts sits with the payer: they did transfer it,
 * after all. If the payer is a shared account, it stays in that account.
 */
function withRemainder(parts, remainder, party) {
  // A person pays, so a person is short: you ask five friends a round amount
  // each and quietly carry the rest. The payer is part of the expense, so this
  // still follows from the expense itself.
  if (!remainder || isAccountParty(party)) return parts;
  const payer = partyId(party);
  return { ...parts, [payer]: (parts[payer] || 0) + remainder };
}

/**
 * Does an account bear part of something that comes out of that same account?
 *
 * Then there is nothing to settle: that part was paid by whoever bears it. This
 * needs its own check, because a business account counts as *payer* like the
 * person who owns it (you front something through the business), but as *bearer*
 * like the business itself (that is a business cost). Without this rule the
 * business would owe you back its own quarter.
 */
function paidItsOwnShare(key, expense, accounts = []) {
  if (expense.payer?.kind !== 'account') return false;
  if (isAccountBearer(key)) return accountOfBearer(key) === expense.payer.id;
  // And the owner of that account carries their own share out of their own
  // money whichever pocket it left from. Booking it would have you transfer to
  // yourself every month, which is not a payment — it is where the money
  // already is.
  return accounts.some((a) => a.id === expense.payer.id && a.ownerId === key);
}

function book(matrix, from, to, cents) {
  if (!cents || from === to) return;
  matrix[from] = matrix[from] || {};
  matrix[from][to] = (matrix[from][to] || 0) + cents;
}

/**
 * Routing settlements through the household bills account.
 *
 * This is exactly how it goes in real life. If the business pays for the
 * internet, your partner owes *you* her half — but she does not transfer that
 * separately: she just pays it into the bills account along with everything
 * else. That account then owes it to you, and that cancels against what you
 * still have to put in. In the end nobody moves a loose amount around, and you
 * transfer less yourself.
 *
 * It holds for everyone, not only the people who fill the account. A friend on
 * a shared subscription pays into it too — that is the account you gave him —
 * and what he pays in is then owed to whoever fronted it. Marking an account as
 * the settlement point says precisely that: settlements run through here.
 *
 * What is already owed straight to the account needs no routing: the money is
 * going to the right place as it is.
 */
function routeThrough(matrix, hub) {
  for (const [from, targets] of Object.entries(matrix)) {
    if (from === hub || isAccountParty(from)) continue;
    for (const [to, cents] of Object.entries(targets)) {
      if (!cents || to === hub || isAccountParty(to)) continue;
      targets[to] = 0;
      book(matrix, from, hub, cents);
      book(matrix, hub, to, cents);
    }
  }
}

/**
 * Cancelling out what offsets itself.
 *
 * Per pair of parties one direction is left. Which way it points follows from
 * the sign; the order within a pair is fixed by name, so the same input always
 * gives the same result.
 */
export function net(matrix) {
  const pairs = new Map();

  for (const [from, targets] of Object.entries(matrix)) {
    for (const [to, cents] of Object.entries(targets)) {
      if (!cents || from === to) continue;
      const forward = from < to;
      const key = forward ? `${from} ${to}` : `${to} ${from}`;
      pairs.set(key, (pairs.get(key) || 0) + (forward ? cents : -cents));
    }
  }

  const out = [];
  for (const [key, cents] of pairs) {
    if (!cents) continue;
    const [a, b] = key.split(' ');
    out.push(cents > 0 ? { from: a, to: b, cents } : { from: b, to: a, cents: -cents });
  }
  return out.sort((x, y) => y.cents - x.cents);
}

/**
 * Per account: what goes out of it, what has to be on it, and — where people
 * pay into it — what should come in and what is set to.
 *
 * Every account with expenses on it, not only the shared ones. A business
 * account is charged the same yearly bills as any other, and "how much has to
 * be sitting on it" is the same question there; it was simply never asked,
 * because the panel started life as a view of a shared pot.
 */
function potOverview(transfers, accounts, perAccount, saving, lines, people) {
  const carries = (id) =>
    lines.some((l) => l.expense.payer?.kind === 'account' && l.expense.payer.id === id) ||
    Number(accounts.find((a) => a.id === id)?.income) > 0 ||
    Number(accounts.find((a) => a.id === id)?.overhead) > 0 ||
    people.some((p) => p.incomeFrom === id) ||
    accounts.some((a) => a.fundedBy === id) ||
    Boolean(accounts.find((a) => a.id === id)?.fundedBy);
  const rows = accounts
    .filter((a) => a.kind === 'shared' || carries(a.id))
    .map((account) => {
      const party = accountParty(account.id);
      const incoming = {};
      const outgoing = {};
      // Money moving between two accounts — a business settling its own share
      // of something this account paid — is kept apart from what people put in,
      // because that is what a standing order is held against. It still has to
      // be shown, or the panel does not add up.
      const fromAccounts = {};
      const toAccounts = {};
      for (const t of transfers) {
        if (t.to === party) {
          if (isAccountParty(t.from)) fromAccounts[partyId(t.from)] = t.cents;
          else incoming[partyId(t.from)] = t.cents;
        }
        if (t.from === party) {
          if (isAccountParty(t.to)) toAccounts[partyId(t.to)] = t.cents;
          else outgoing[partyId(t.to)] = t.cents;
        }
      }
      const contributions = account.contributions || {};
      const paidIn = Object.values(contributions).reduce((sum, c) => sum + (Number(c) || 0), 0);
      const out = perAccount[account.id] || 0;
      // Twelve monthly instalments do not always add up to the year: 100,00 a
      // year is 8,33 a month, and twelve of those is 99,96. Four cents that
      // never leave anyone's account and never arrive either, so an account
      // aiming to end a cycle on zero misses by exactly this much.
      const drift = lines
        .filter((l) => l.expense.payer?.kind === 'account' && l.expense.payer.id === account.id)
        .reduce(
          (sum, l) =>
            sum +
            12 * perMonth(l.expense.amount, l.expense.cadence) -
            perYear(l.expense.amount, l.expense.cadence),
          0
        );

      // What comes in from outside the ledger, and what is drawn out of it the
      // same way. Neither is a cost and neither is a debt — a holding paying
      // out salary is moving its own money — but without them an account at
      // the top of the chain cannot say what is left on it, which is the whole
      // reason to look.
      const income = Number(account.income) || 0;
      // Costs that belong to this account and to nobody else: payroll tax on a
      // holding, an insurance of the company. They are not posts — a post is
      // something you share or carry yourself — so they stay out of the
      // monthly load, the categories and everyone's share, and only count
      // where the question is what is left on this account.
      const overhead = Number(account.overhead) || 0;
      // A salary costs the account the gross: what lands on the person, plus
      // what is withheld from it and paid to the tax office. Both come off the
      // same account on the same day, and both come from one payslip — so
      // neither is typed anywhere twice.
      const salaries = people
        .filter((p) => p.incomeFrom === account.id && Number(p.income) > 0)
        .map((p) => ({
          person: p,
          cents: Number(p.income),
          withheld: Number(p.withheld) || 0,
        }));
      // An account this one feeds: a fixed-costs account of the business, fed by
      // a standing order the way a shared pot is. It is listed whether or not a
      // standing order has been typed yet — a fed account with nothing set is
      // exactly the one worth seeing, and leaving it out made the money look
      // like it stayed here. What it really needs per month is filled in below,
      // once every account has been worked out.
      const feeds = accounts
        .filter((a) => a.fundedBy === account.id && a.id !== account.id)
        .map((a) => ({
          account: a,
          order: Object.values(a.contributions || {}).reduce((sum, c) => sum + (Number(c) || 0), 0),
          needed: 0,
          aside: 0,
          cents: 0,
        }));
      // What has to come in. On an account people pay into that is their
      // deposits: the expenses plus whatever it pays back to someone who
      // fronted, which has to be on it first — holding a standing order
      // against the expenses alone reports a surplus that is already spoken
      // for. On an account of your own nobody deposits, so it is simply what
      // leaves it: the expenses plus what it owes another account, less what
      // another account owes it.
      const total = (o) => Object.values(o).reduce((sum, c) => sum + c, 0);
      // What has to come in. On an account people pay into that is their
      // deposits. On an account of your own it is what you have to put on it
      // yourself: everything it pays, less everything anyone else pays into it.
      const needed =
        account.kind === 'shared'
          ? total(incoming)
          : out +
            total(toAccounts) +
            total(outgoing) -
            total(fromAccounts) -
            total(incoming);
      return {
        account,
        out,
        needed,
        incoming,
        outgoing,
        fromAccounts,
        toAccounts,
        contributions,
        paidIn,
        income,
        overhead,
        salaries,
        feeds,
        // All three filled in below, once the accounts they point at are known.
        fedBy: null,
        drawn: 0,
        difference: 0,
        // What really leaves this month, what is being saved for later, and
        // whether some expense could not say which month it goes out.
        drift,
        charged: saving.realPerAccount[account.id] || 0,
        aside: saving.asidePerAccount[account.id] || 0,
        chargeUnknown: saving.unknownCharge.has(account.id),
      };
    });

  // Second pass: what an account draws out of itself. A standing order to
  // another account can only be held against that account's own bill once every
  // account has been worked out, so it happens here rather than above.
  const byId = new Map(rows.map((row) => [row.account.id, row]));
  for (const row of rows) {
    for (const feed of row.feeds) {
      const fed = byId.get(feed.account.id);
      // Everything that account pays for in a month: its posts, what it settles
      // with other accounts, and its own costs outside the posts.
      feed.needed = fed ? fed.needed + fed.overhead : 0;
      feed.aside = fed ? fed.aside : 0;
      // What actually leaves is the standing order you set. Where none is set
      // yet, the bill it has to cover is the only honest figure — better than
      // silently counting nothing and reporting a surplus.
      feed.cents = feed.order || feed.needed;
      // And from the other side: an account that is fed knows where from. Its
      // own block would otherwise report a shortfall for money that arrives
      // every month, just not from a person.
      if (fed) fed.fedBy = { account: row.account, cents: feed.cents, order: feed.order };
    }
  }
  // Only once every standing order is known, because an account can be both fed
  // and feeding.
  for (const row of rows) {
    row.drawn =
      row.salaries.reduce((sum, r) => sum + r.cents + r.withheld, 0) +
      row.feeds.reduce((sum, r) => sum + r.cents, 0);
    // A typed standing order is already counted as what you put in yourself, so
    // only a feed nobody typed is added here.
    const arrives = row.income + row.paidIn + (row.fedBy && !row.fedBy.order ? row.fedBy.cents : 0);
    row.difference = arrives - row.needed - row.drawn - row.overhead;
  }

  // The ones other people pay into first: those are the ones with someone else
  // waiting on them.
  return rows.sort(
    (a, b) => Number(b.account.kind === 'shared') - Number(a.account.kind === 'shared')
  );
}

/**
 * Transfers in the order you read them: yours first, then the largest.
 *
 * The list is a to-do list, and the rows that are yours to act on should not
 * have to be found among the others. Within each group the biggest first,
 * because that is the one worth checking.
 */
export function mineFirst(transfers, personId) {
  if (!personId) return transfers;
  const me = personParty(personId);
  const mine = (t) => t.from === me || t.to === me;
  return [...transfers].sort((a, b) => {
    if (mine(a) !== mine(b)) return mine(a) ? -1 : 1;
    return b.cents - a.cents;
  });
}

/**
 * The loose ones: one-off expenses that have not been settled yet.
 *
 * These deliberately do *not* go through the bills account. You settle a one-off
 * directly in real life too — with a payment request, not by adjusting your
 * monthly transfer.
 */
export function openSettlements(expenses, accounts) {
  const open = expenses.filter((e) => e.cadence === 'once' && !e.settled);
  const raw = {};
  const lines = [];

  for (const expense of open) {
    const party = payerParty(expense, accounts);
    if (!party) continue;
    const { parts, remainder } = split(expense.amount, expense.split);
    const shares = withRemainder(parts, remainder, party);
    for (const [key, part] of Object.entries(shares)) {
      if (paidItsOwnShare(key, expense, accounts)) continue;
      book(raw, bearerParty(key), party, part);
    }
    lines.push({ expense, party, shares });
  }

  return { lines, transfers: net(raw) };
}

/**
 * Where one person's position comes from: every expense that puts them in
 * credit or in debt, at its full amount.
 *
 * Negative is what they owe, positive what is owed to them. Summed it is
 * exactly the amount they end up transferring, which is the point — a netted
 * figure that you cannot take apart is one nobody believes.
 */
export function positionOf(lines, personId, accounts, keep = () => true) {
  const rows = [];
  for (const line of lines) {
    if (!keep(line)) continue;
    const party = line.party ?? payerParty(line.expense, accounts);
    let cents = 0;

    // What they bear themselves. Paying it from their own account cancels out.
    const own = line.shares[personId] || 0;
    if (own && bearerParty(personId) !== party) cents -= own;

    // And, when they are the one paying, what everybody else bears.
    if (party === personParty(personId)) {
      for (const [key, part] of Object.entries(line.shares)) {
        if (bearerParty(key) !== party) cents += part;
      }
    }

    if (cents) rows.push({ expense: line.expense, cents });
  }
  return rows.sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
}

/** The same, but only what runs between two named people. */
export function betweenTwo(lines, aId, bId, accounts) {
  const rows = [];
  for (const line of lines) {
    const party = line.party ?? payerParty(line.expense, accounts);
    if (party === personParty(aId) && line.shares[bId]) {
      rows.push({ expense: line.expense, cents: line.shares[bId] });
    } else if (party === personParty(bId) && line.shares[aId]) {
      rows.push({ expense: line.expense, cents: -line.shares[aId] });
    }
  }
  return rows.sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
}

/**
 * What a single transfer is made of, seen from the paying side.
 *
 * Between a person and the account everything settles through, that is the
 * person's whole position; between two people it is only what runs between
 * those two.
 */
export function explainTransfer(transfer, { lines, accounts }) {
  const from = transfer.from;
  const to = transfer.to;
  if (isAccountParty(from) && isAccountParty(to)) return [];

  if (isAccountParty(from) || isAccountParty(to)) {
    const account = partyId(isAccountParty(from) ? from : to);
    const person = partyId(isAccountParty(from) ? to : from);
    const hub = settlementAccount(accounts);
    const isHub = hub?.id === account;

    // Only what this account is owed, or owes. A debt from an expense the
    // account paid belongs to that account; a debt between two people belongs
    // wherever settlements are routed. Taking the person's whole position
    // instead was right only while there was one account to pay into — with a
    // second one, both explanations claimed all of it.
    const keep = (line) => {
      const party = line.party ?? payerParty(line.expense, accounts);
      return isAccountParty(party) ? partyId(party) === account : isHub;
    };

    const rows = positionOf(lines, person, accounts, keep);
    // Seen from the payer: money leaving the account is money owed to them.
    return isAccountParty(from) ? rows : rows.map((r) => ({ ...r, cents: -r.cents }));
  }
  return betweenTwo(lines, partyId(from), partyId(to), accounts).map((r) => ({
    ...r,
    cents: -r.cents,
  }));
}
