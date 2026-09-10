// What is left, per account and per person.
//
// The rest of the app derives everything from the expenses: what a thing costs,
// who carries it, who transfers what. Not a figure in it is typed twice.
//
// This one is different, and it should say so. Turnover, salary, payroll tax —
// none of that is a cost anybody shares, and none of it can be worked out from
// the ledger. You type it, the way you would in a spreadsheet, and Pay adds the
// one part you never wanted to keep by hand: your fixed costs. So it is a plan
// against which you hold your bank once a month, not a truth.
//
// It lives on its own tab for the same reason. Beside a settlement that is
// right to the cent, an estimate reads as if it were one too.

import { Fragment, useMemo, useState } from 'react';
import { Line, Total, Empty, Notice } from '../components/ui.jsx';
import Breakdown from '../components/Breakdown.jsx';
import { forMonth } from '../lib/ledger.js';
import { formatMoney } from '../lib/money.js';
import { cadenceOf } from '../lib/cadence.js';
import { categoryOf } from '../data/categories.js';

export default function Leftover({ store, month }) {
  const { people, accounts, expenses } = store;
  const me = people.find((p) => p.isMe) || null;
  const result = useMemo(
    () => forMonth({ people, accounts, expenses }, month),
    [people, accounts, expenses, month]
  );

  const [open, setOpen] = useState(null);

  // Only where something comes in. An account with costs and no inflow has
  // nothing to be left over from, and calling that a shortfall would be a claim
  // about money Pay has never been told about. An account that feeds another —
  // or is fed by one — does have an inflow, even when nothing was typed on it.
  const chains = result.pots.filter(
    (pot) =>
      pot.account.kind !== 'shared' &&
      (pot.income > 0 ||
        pot.paidIn > 0 ||
        pot.overhead > 0 ||
        pot.feeds.length > 0 ||
        Boolean(pot.fedBy))
  );
  const shared = result.pots.filter((pot) => pot.account.kind === 'shared');
  const persons = people
    .filter((p) => Number(p.income) > 0)
    .map((person) => {
      const borne = result.borne[person.id] || 0;
      // Of that, what a company account paid. Still a cost of theirs — it is in
      // the list above and in every total — but not one their income paid for,
      // so it goes back on before the bottom line.
      const fronted = result.fronted[person.id] || 0;
      return {
        person,
        income: Number(person.income),
        borne,
        fronted,
        // Part of those same fixed costs, and not spending at all.
        saved: result.saved[person.id] || 0,
        left: Number(person.income) - borne + fronted,
      };
    })
    .sort((a, b) => Number(b.person.isMe) - Number(a.person.isMe) || b.left - a.left);

  // Top to bottom, the way the money actually moves: the account nobody feeds
  // first, then what it feeds, then whoever draws a salary out of it. Read as
  // separate blocks in whatever order they happened to be created, the same
  // figures are a pile of facts; in this order they are one chain from turnover
  // to what you keep.
  const chain = useMemo(() => {
    const byId = new Map(chains.map((pot) => [pot.account.id, pot]));
    const items = [];
    const seen = new Set();

    const visit = (pot, from) => {
      if (!pot || seen.has(pot.account.id)) return;
      seen.add(pot.account.id);
      items.push({ key: `a-${pot.account.id}`, kind: 'account', pot, from });
      for (const feed of pot.feeds) {
        visit(byId.get(feed.account.id), {
          cents: feed.cents,
          label: `vanaf ${pot.account.name}`,
        });
      }
    };

    // Start where money comes in from outside, so the top of the chain is the
    // top of the list.
    for (const pot of chains) if (!pot.fedBy) visit(pot, null);
    for (const pot of chains) visit(pot, null);

    for (const row of persons) {
      const source = row.person.incomeFrom && byId.get(row.person.incomeFrom);
      items.push({
        key: `p-${row.person.id}`,
        kind: 'person',
        row,
        from: source ? { cents: row.income, label: `salaris vanaf ${source.account.name}` } : null,
      });
    }
    return items;
  }, [chains, persons]);

  if (!chains.length && !persons.length) {
    return (
      <Empty icon="settle" title="Nog niets ingevuld">
        Vul bij <strong>Mensen</strong> je inkomen in, en bij een eigen rekening wat er maandelijks
        op binnenkomt. Dan staat hier van boven naar beneden waar je geld heen gaat en wat er
        overblijft.
      </Empty>
    );
  }

  return (
    <>
      <Notice tone="info">
        Deze bedragen vul je zelf in. Alleen je vaste lasten komen uit je posten. Het is dus een
        plan — leg het één keer per maand naast je bankapp.
      </Notice>

      {chain.map((item) =>
        item.kind === 'account' ? (
          <Fragment key={item.key}>
            {item.from && <Flows {...item.from} />}
            <Chain
              pot={item.pot}
              onOpenFeed={(feed) => setOpen({ kind: 'feed', feed })}
              onOpenCosts={() => setOpen({ kind: 'costs', pot: item.pot })}
            />
          </Fragment>
        ) : (
          <PersonBlock
            key={item.key}
            {...item.row}
            from={item.from}
            onOpen={(kind, cents) => setOpen({ kind, person: item.row.person, cents })}
          />
        )
      )}

      {/* A pot you share has the same shape as an account of your own, and
          leaving it out without a word reads as something missing rather than
          as a different question being asked elsewhere. */}
      {shared.length > 0 && (
        <div className="hint">
          {shared.length === 1 ? 'Je gedeelde rekening' : 'Je gedeelde rekeningen'}{' '}
          <strong>{shared.map((pot) => pot.account.name).join(', ')}</strong>{' '}
          {shared.length === 1 ? 'staat' : 'staan'} hier niet. Wat daarop staat is deels van jou en
          deels van iemand anders, dus valt er geen bedrag van te maken dat jij overhoudt — bij een
          gezamenlijke spaarrekening is de helft wel degelijk van jou, maar de helft ook niet. Wat er
          maandelijks af gaat en wie er wat op stort staat op <strong>Overzicht</strong>. Jouw deel
          van die posten zit hierboven gewoon in je vaste lasten.
        </div>
      )}

      <Sheets
        open={open}
        setOpen={setOpen}
        result={result}
        accounts={accounts}
        people={people}
        me={me}
      />
    </>
  );
}

/** The link between two blocks: what leaves the one above and lands below. */
const Flows = ({ cents, label }) => (
  <div className="flows">
    <span aria-hidden="true">↓</span> {formatMoney(cents)} {label}
  </div>
);

function PersonBlock({ person, income, borne, fronted, saved, left, from, onOpen }) {
  return (
    <>
      {from && <Flows {...from} />}
      <div>
          {/* By name, never "Privé": an account can be called that too, and two
              headings that read the same are two things you have to tell
              apart before you can read either. */}
          <div className="section">{person.name}</div>
          <div className="panel">
            <Line what="Inkomen" sub="wat er netto binnenkomt" cents={income} />
            <Line
              what="Vaste lasten"
              sub="wat je van alle posten draagt — rekent Pay uit"
              cents={-borne}
              onClick={() => onOpen('borne', borne)}
            />
            {fronted > 0 && (
              <Line
                what="Betaalt je zaak voor je"
                sub="posten hierboven die van een zakelijke rekening af gaan — die komen niet van je salaris"
                cents={fronted}
                onClick={() => onOpen('fronted', fronted)}
              />
            )}
            <Total
              label="Houd je over"
              cents={left}
              tone={left < 0 ? 'debt' : 'credit'}
            />
          </div>
          {/* The bottom line is what is free to spend, and that is the number
              you want most months. It is not the same as what you are worse off
              by: a part of those fixed costs is still yours the day after. */}
          {saved > 0 && (
            <div className="hint" style={{ marginTop: -4 }}>
              <strong>{formatMoney(saved)}</strong> van die vaste lasten is sparen of beleggen — dat
              geld ben je niet kwijt. Je zet dat elke maand opzij en houdt daarnaast{' '}
              {formatMoney(left)} over.
            </div>
          )}
      </div>
    </>
  );
}

function Sheets({ open, setOpen, result, accounts, people, me }) {
  return (
    <>
      {open?.kind === 'feed' && (
        <FeedBreakdown
          feed={open.feed}
          pot={result.pots.find((p) => p.account.id === open.feed.account.id)}
          lines={result.lines}
          accounts={accounts}
          me={me}
          onClose={() => setOpen(null)}
        />
      )}

      {open?.kind === 'costs' && (
        <AccountCosts
          pot={open.pot}
          lines={result.lines}
          accounts={accounts}
          me={me}
          onClose={() => setOpen(null)}
        />
      )}

      {(open?.kind === 'borne' || open?.kind === 'fronted') && (
        <BorneBreakdown
          person={open.person}
          cents={open.cents}
          lines={result.lines}
          people={people}
          accounts={accounts}
          onlyBusiness={open.kind === 'fronted'}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/** One account, top to bottom: what comes in, what goes out, what stays. */
function Chain({ pot, onOpenFeed, onOpenCosts }) {
  // Not only the posts: an account can also be settling with another account —
  // fronting for it, or being paid back. That is money leaving here too, and
  // calling the sum "the posts of this account" made it a figure you could hold
  // against the list of posts and find short.
  const out = pot.needed;
  const settles =
    Object.keys(pot.toAccounts || {}).length > 0 || Object.keys(pot.fromAccounts || {}).length > 0;
  return (
    <>
      <div className="section">{pot.account.name}</div>
      <div className="panel">
        {pot.income > 0 && (
          <Line what="Komt binnen" sub="geld dat van buiten Pay op deze rekening komt" cents={pot.income} />
        )}
        {pot.paidIn > 0 && (
          <Line
            what="Vaste inleg erop"
            sub={
              pot.fedBy
                ? `wat je er maandelijks vanaf ${pot.fedBy.account.name} op zet`
                : 'wat je er zelf maandelijks op zet'
            }
            cents={pot.paidIn}
          />
        )}
        {/* Fed, but no standing order typed yet. The money still arrives, so
            leave it out and the block reports a shortfall for something that is
            not one. */}
        {pot.fedBy && !pot.fedBy.order && pot.fedBy.cents !== 0 && (
          <Line
            what={`Komt van ${pot.fedBy.account.name}`}
            sub="nog geen vast bedrag ingesteld — dit is wat deze rekening nodig heeft"
            cents={pot.fedBy.cents}
          />
        )}
        {out !== 0 && (
          <Line
            what="Vaste lasten eraf"
            sub={
              settles
                ? 'de posten van deze rekening, plus wat hij met een andere rekening verrekent'
                : 'de posten die van deze rekening afgaan'
            }
            cents={-out}
            onClick={onOpenCosts}
          />
        )}
        {pot.overhead > 0 && (
          <Line
            what="Kosten buiten je posten om"
            sub="kosten van deze rekening die je met niemand deelt"
            cents={-pot.overhead}
          />
        )}
        {pot.salaries.map((row) => (
          <Fragment key={row.person.id}>
            <Line
              what={`Salaris naar ${row.person.name}`}
              sub={row.withheld > 0 ? 'netto, wat er op de rekening wordt gestort' : undefined}
              cents={-row.cents}
            />
            {row.withheld > 0 && (
              <Line
                what="Loonheffing daarover"
                sub="wat er van dat salaris is ingehouden en wordt afgedragen"
                cents={-row.withheld}
              />
            )}
          </Fragment>
        ))}
        {pot.feeds.map((row) => (
          <Line
            key={row.account.id}
            what={`Naar ${row.account.name}`}
            sub={
              !row.order
                ? 'nog geen vast bedrag ingesteld — dit is wat die rekening nodig heeft'
                : row.order === row.needed
                  ? 'de vaste inleg die je daarheen overmaakt — precies genoeg'
                  : `je stort dit; de posten daar kosten ${formatMoney(row.needed)} per maand`
            }
            cents={-row.cents}
            onClick={() => onOpenFeed(row)}
          />
        ))}
        {/* Nought is not "nothing stays" but "it balances", and that is the
            answer this whole block is asked for. And below nought is not a
            shortfall you have — it is money that still has to go on there,
            which is something you do rather than something to worry about. */}
        <Total
          label={
            pot.difference === 0
              ? 'Komt uit op'
              : pot.difference > 0
                ? 'Blijft staan'
                : 'Moet er nog bij'
          }
          cents={Math.abs(pot.difference)}
          tone="credit"
        />
      </div>
      {/* The blocks are each about one account, and they overlap: an expense the
          business pays but you carry half of comes off here in full and off
          your own income by half. Adding them up counts that half twice, so
          say what each block is before someone reaches for a calculator. */}
      <div className="hint" style={{ marginTop: -4 }}>
        Dit is wat er op deze rekening gebeurt. Wat anderen van deze posten dragen komt bij jou
        privé terug via de verrekening, niet op deze rekening — tel de blokken hieronder dus niet
        bij elkaar op.
      </div>
      {pot.aside > 0 && (
        <div className="hint" style={{ marginTop: -4 }}>
          Daar bovenop hoort <strong>{formatMoney(pot.aside)}</strong> op deze rekening te blijven
          staan voor posten die niet elke maand worden afgeschreven.
        </div>
      )}
    </>
  );
}

/** A dot in the colour of the post's category. */
const dot = (expense) => (
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
function postRow(line, { showing, me, from = null }) {
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
function needRows(pot, lines, accounts, me, { overhead = false } = {}) {
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

/** The posts that come off one account, at their full amount. */
function AccountCosts({ pot, lines, accounts, me, onClose }) {
  return (
    <Breakdown
      title={`Vaste lasten van ${pot.account.name}`}
      label="Gaat er elke maand af"
      cents={pot.needed}
      rows={needRows(pot, lines, accounts, me)}
      empty={`Er staan geen posten op ${pot.account.name}.`}
      note={
        <>
          Groot staat het volle bedrag, want dat is wat er van deze rekening af gaat; klein wat
          jij ervan draagt. Bij een persoon staat het andersom. Wat anderen dragen komt via de
          verrekening bij je terug, niet op deze rekening.
          {pot.aside > 0 && (
            <>
              {' '}
              Daar bovenop hoort <strong>{formatMoney(pot.aside)}</strong> op deze rekening te
              staan voor posten die niet elke maand worden afgeschreven.
            </>
          )}
        </>
      }
      onClose={onClose}
    />
  );
}

/**
 * What one person carries of everything that runs.
 *
 * Their share per post, not the post — the block above is about what is left of
 * their income, and only their own part of a bill comes off that.
 */
function BorneBreakdown({ person, cents, lines, people, accounts, onlyBusiness = false, onClose }) {
  const payerName = (expense) =>
    expense.payer?.kind === 'account'
      ? accounts.find((a) => a.id === expense.payer.id)?.name
      : people.find((p) => p.id === expense.payer?.id)?.name;
  const fromBusiness = (expense) =>
    expense.payer?.kind === 'account' &&
    accounts.some((a) => a.id === expense.payer.id && a.kind === 'business');

  const rows = lines
    .filter((line) => line.shares[person.id])
    .filter((line) => !onlyBusiness || fromBusiness(line.expense))
    // What it is a share of, and off whose account it goes — the two things
    // that make a share you did not set yourself explainable.
    .map((line) => postRow(line, { showing: 'share', me: person, from: payerName(line.expense) }))
    .sort((a, b) => b.cents - a.cents);

  return (
    <Breakdown
      title={
        onlyBusiness ? `Wat de zaak voor ${person.name} betaalt` : `Vaste lasten van ${person.name}`
      }
      label={onlyBusiness ? 'Gaat niet van het salaris af' : 'Draagt per maand'}
      cents={cents}
      rows={rows}
      empty={
        onlyBusiness
          ? 'Geen enkele post van een zakelijke rekening staat op deze persoon.'
          : `${person.name} draagt van geen enkele post een deel.`
      }
      note={
        onlyBusiness
          ? 'Deze posten staan gewoon in de lijst hierboven — het zijn kosten van jou. Alleen komen ze van een zakelijke rekening en niet van je salaris, dus tellen ze niet mee in wat je van je inkomen overhoudt.'
          : 'Groot staat jouw deel, want dat is wat je van deze post draagt; klein waar het een deel van is. Bij een rekening staat het andersom. Tel de twee dus niet bij elkaar op — dan telt hetzelfde bedrag dubbel.'
      }
      onClose={onClose}
    />
  );
}

/**
 * What a fed account actually has to cover in a month, spelled out.
 *
 * The standing order is a figure you typed; this is the bill behind it. Every
 * post that comes off that account, every cent it settles with another account,
 * and what it costs outside the posts — the same sum the account's own block is
 * built from, so the two can never say different things.
 */
function FeedBreakdown({ feed, pot, lines, accounts, me, onClose }) {
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
