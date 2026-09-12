// The overview: what is running, and who owes who what.

import { useMemo, useState } from 'react';
import { Line, Total, Money, Avatar, BearerAvatar, Notice, Empty, Icon } from '../components/ui.jsx';
import ChargeView from '../components/ChargeView.jsx';
import Breakdown from '../components/Breakdown.jsx';
import {
  forMonth,
  openSettlements,
  explainTransfer,
  mineFirst,
  isAccountParty,
  isBusiness,
  partyId,
  partyName,
} from '../lib/ledger.js';
import {
  formatMonth,
  shiftMonth,
  thisMonth,
  cadenceOf,
  perMonth,
  perYear,
  chargedIn,
  setAside,
  nextCharge,
} from '../lib/cadence.js';
import { categoryOf, categoryName, accountKindOf } from '../data/categories.js';
import { possibleBearers } from '../lib/split.js';
import { formatMoney } from '../lib/money.js';
import { count } from '../lib/words.js';
import { runChecks } from '../lib/checks.js';

/** Under an expense in a breakdown: its category, and what it is charged as. */
const postSub = (expense) => {
  const c = cadenceOf(expense.cadence);
  return [
    categoryName(expense.category),
    c.perYear !== 12 && `${formatMoney(expense.amount)} ${c.short}`,
  ]
    .filter(Boolean)
    .join(' · ');
};

/** Ledger lines as rows for a breakdown, biggest first, nothing that is zero. */
const postRows = (lines, amountOf = (l) => l.amount) =>
  lines
    .map((l) => ({
      key: l.expense.id,
      what: l.expense.name,
      sub: postSub(l.expense),
      cents: amountOf(l),
    }))
    .filter((r) => r.cents !== 0)
    .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));

/** What one transfer is made of: every expense netted into it. */
const transferDetail = (transfer, context) => ({
  title: `${partyName(transfer.from, context)} → ${partyName(transfer.to, context)}`,
  label: 'Per maand',
  cents: transfer.cents,
  rows: explainTransfer(transfer, context)
    .map(({ expense, cents }) => ({
      key: expense.id,
      what: expense.name,
      sub: postSub(expense),
      cents,
      tone: cents < 0 ? 'credit' : '',
    }))
    .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents)),
  note: 'De posten die in dit ene bedrag zijn weggestreept. Groen trekt de andere kant op en maakt het bedrag dus kleiner.',
});

export default function Overview({ store, month, onMonth }) {
  const { people, accounts, expenses } = store;
  const result = useMemo(
    () => forMonth({ people, accounts, expenses }, month),
    [people, accounts, expenses, month]
  );
  const loose = useMemo(() => openSettlements(expenses, accounts), [expenses, accounts]);
  const me = people.find((p) => p.isMe);
  const context = { people, accounts, lines: result.lines };
  const [openCharge, setOpenCharge] = useState(null);
  const charge = result.charges.find((c) => c.name === openCharge) || null;
  // Every figure here is a sum, and a sum you cannot open is one you have to
  // take on trust. Each of them hands this the rows it was made of.
  const [detail, setDetail] = useState(null);

  if (!expenses.length) {
    return (
      <Empty icon="receipt" title="Nog niets geboekt">
        Voeg je eerste vaste last toe met de knop rechtsonder. Heb je al een overzicht in Excel of
        Numbers? Plak het dan in één keer via <strong>Meer → Plakken</strong>.
      </Empty>
    );
  }

  const mine = me ? result.borne[me.id] || 0 : 0;
  const totalDetail = {
    title: 'Loopt in totaal',
    label: 'Per maand',
    cents: result.monthlyTotal,
    rows: postRows(result.lines),
    note: 'Alles wat er loopt, ook de delen die anderen dragen. Jaarposten staan op een twaalfde van hun bedrag.',
  };

  // Everything Pay can say about itself, in one place instead of a hint on
  // whichever screen the account happened to be on.
  const findings = runChecks({ people, accounts, expenses }, result);

  // Both of these are written as "waarvan", so they have to be part of the
  // figure above them — which is your share. At their full amount they were
  // larger than the number they claimed to be inside: the internet the business
  // pays is 24,79, of which your half is 12,40, and the other half is nowhere in
  // "jouw deel".
  const share = (line) => (me ? line.shares[me.id] || 0 : line.amount);
  const businessLines = result.lines.filter((l) => isBusiness(l.expense, accounts));
  const savingLines = result.lines.filter((l) => l.expense.savings);
  const business = businessLines.reduce((sum, l) => sum + share(l), 0);
  const putAway = savingLines.reduce((sum, l) => sum + share(l), 0);

  return (
    <>
      <MonthPicker month={month} onMonth={onMonth} />

      <Checks findings={findings} />

      {/* The two numbers it is all about: what runs in total, and how much of
          that is ultimately yours. The one card in the app that carries colour —
          everything else stays quiet so your eye lands here. */}
      {/* The big number is your own share, not the sum of everything in the
          ledger. That sum counts Mau's half and a friend's part of a
          subscription, so putting a friend on one makes the headline go up
          while your own costs go down — a figure that moves the wrong way on
          good news. Your share moves the way you expect, means the same thing
          every month, and is the one you have to set aside. What runs in total
          stays as context, beside it. */}
      <div className="hero">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <button
            type="button"
            className="bare grow"
            onClick={() =>
              setDetail(
                me
                  ? {
                      title: 'Jouw deel',
                      label: 'Draagt per maand',
                      cents: mine,
                      rows: postRows(result.lines, (l) => l.shares[me.id] || 0),
                      note: 'Jouw deel van elke post, van welke rekening het ook af gaat.',
                    }
                  : totalDetail
              )
            }
          >
            <div className="label">{me ? 'Jouw deel' : 'Loopt deze maand'}</div>
            <div className="figure">{formatMoney(me ? mine : result.monthlyTotal)}</div>
            <div className="under">
              {me
                ? `${formatMoney(mine * 12)} per jaar`
                : `${formatMoney(result.yearlyTotal)} per jaar`}{' '}
              · {count(result.lines.length, 'post', 'posten')}
            </div>
          </button>
          {me && (
            <button type="button" className="bare side" onClick={() => setDetail(totalDetail)}>
              <div className="label">Loopt in totaal</div>
              <div className="figure">{formatMoney(result.monthlyTotal)}</div>
            </button>
          )}
        </div>
        {business > 0 && (
          <button
            type="button"
            className="bare strip"
            onClick={() =>
              setDetail({
                title: 'Zakelijk geboekt',
                label: 'Jouw deel per maand',
                cents: business,
                rows: postRows(businessLines, share),
                note: 'Jouw deel van de posten die van een zakelijke rekening af gaan. Wat die rekeningen in totaal kwijt zijn staat verderop, per rekening.',
              })
            }
          >
            <span className="grow">Waarvan zakelijk geboekt</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(business)}</span>
          </button>
        )}
        {/* Beside it, the other part of that figure that is not what it looks
            like: money that left the account and is still yours. */}
        {putAway > 0 && (
          <button
            type="button"
            className="bare strip"
            onClick={() =>
              setDetail({
                title: 'Opzij gezet',
                label: 'Jouw deel per maand',
                cents: putAway,
                rows: postRows(savingLines, share),
                note: 'Sparen en beleggen. Het gaat wel van je rekening af en staat dus tussen je vaste lasten — maar je bent het niet kwijt.',
              })
            }
          >
            <span className="grow">Waarvan opzij gezet</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(putAway)}</span>
          </button>
        )}
      </div>

      {/* The answer to "what does she have to transfer". */}
      {result.transfers.length > 0 && (
        <>
          <div className="section">Elke maand overmaken</div>
          <div className="panel">
            {mineFirst(result.transfers, me?.id).map((t) => (
              <Transfer
                key={`${t.from}-${t.to}`}
                transfer={t}
                context={context}
                me={me}
                explain
                onOpen={() => setDetail(transferDetail(t, context))}
              />
            ))}
          </div>
          <div className="hint" style={{ marginTop: -4 }}>
            {result.hub ? (
              <>
                Iedereen maakt één bedrag over, langs <strong>{result.hub.name}</strong>. Ook wat
                van een andere rekening af ging is daarin weggestreept. Tik op een regel om te zien
                uit welke posten het bestaat.
              </>
            ) : (
              <>
                Deze bedragen zijn al tegen elkaar weggestreept. Zet ze als vaste overboeking klaar
                en je hoeft er geen maand meer naar om te kijken.
              </>
            )}
          </div>
        </>
      )}

      {result.pots.filter((pot) => pot.account.kind === 'shared').map((pot) => (
        <Pot
          key={pot.account.id}
          pot={pot}
          people={people}
          hub={result.hub}
          month={month}
          lines={result.lines}
          transfers={result.transfers}
          context={context}
          onDetail={setDetail}
        />
      ))}

      {result.charges.length > 0 && (
        <>
          <div className="section">Per incasso</div>
          <div className="panel">
            {result.charges.map((group) => (
              <Line
                key={group.name}
                what={group.name}
                sub={[
                  count(group.lines.length, 'post', 'posten'),
                  // What comes off is the number you hold against your
                  // statement, and it only differs from the monthly load when
                  // something in there is not charged monthly. Then it is worth
                  // saying; otherwise it is the same number twice.
                  !group.chargeUnknown &&
                    group.charged !== group.month &&
                    `${group.charged ? formatMoney(group.charged) : 'niets'} in ${
                      formatMonth(month).split(' ')[0]
                    }`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                cents={group.month}
                onClick={() => setOpenCharge(group.name)}
              />
            ))}
          </div>
          <div className="hint" style={{ marginTop: -4 }}>
            Posten die als één afschrijving van je rekening gaan. Tik erop voor wat erin zit.
          </div>
        </>
      )}

      {loose.transfers.length > 0 && (
        <>
          <div className="section">Nog los af te rekenen</div>
          <div className="panel">
            {mineFirst(loose.transfers, me?.id).map((t) => (
              <Transfer
                key={`loose-${t.from}-${t.to}`}
                transfer={t}
                context={context}
                me={me}
                onOpen={() =>
                  setDetail(transferDetail(t, { people, accounts, lines: loose.lines }))
                }
              />
            ))}
          </div>
          <div className="hint" style={{ marginTop: -4 }}>
            Eenmalige uitgaven. Die reken je rechtstreeks af, niet via je maandbedrag. Vink ze bij
            <strong> Lasten</strong> af zodra dat gebeurd is.
          </div>
        </>
      )}

      <div className="section">Waar het heen gaat</div>
      <div className="panel">
        {Object.entries(result.perCategory).sort((a, b) => b[1] - a[1]).map(([id, cents]) => {
          const cat = categoryOf(id);
          return (
            <Line
              key={id}
              left={<span className="cat-dot" style={{ background: cat.colour }} />}
              what={cat.label}
              sub={`${Math.round((cents / result.monthlyTotal) * 100)}% van het totaal`}
              cents={cents}
              onClick={() =>
                setDetail({
                  title: cat.label,
                  label: 'Per maand',
                  cents,
                  rows: postRows(
                    result.lines.filter((l) => categoryName(l.expense.category) === id)
                  ),
                  note: 'De posten in deze categorie, op hun maandbedrag.',
                })
              }
            />
          );
        })}
        <Total label="Per maand" cents={result.monthlyTotal} />
      </div>

      <div className="section">Wat er van welke rekening af gaat</div>
      <div className="panel">
        {accounts.map((a) => (
          <Line
            key={a.id}
            what={a.name}
            sub={accountKindOf(a.kind).label}
            cents={result.perAccount[a.id] || 0}
            onClick={() =>
              setDetail({
                title: a.name,
                label: 'Per maand',
                cents: result.perAccount[a.id] || 0,
                rows: postRows(
                  result.lines.filter(
                    (l) => l.expense.payer?.kind === 'account' && l.expense.payer.id === a.id
                  )
                ),
                empty: 'Er gaat deze maand niets van deze rekening af.',
                note: 'Wat er van deze rekening af gaat. Wie het draagt kan iemand anders zijn.',
              })
            }
          />
        ))}
      </div>

      <div className="section">Wat ieder uiteindelijk draagt</div>
      <div className="panel">
        {possibleBearers(people, accounts)
          .filter((b) => b.account === null || result.borne[b.key])
          .map((b) => (
            <Line
              key={b.key}
              left={<BearerAvatar bearer={b} size="sm" />}
              what={b.name}
              sub={b.account ? 'zakelijk deel' : people.find((p) => p.id === b.key)?.isMe ? 'jij' : undefined}
              cents={result.borne[b.key] || 0}
              onClick={() =>
                setDetail({
                  title: b.name,
                  label: 'Draagt per maand',
                  cents: result.borne[b.key] || 0,
                  rows: postRows(result.lines, (l) => l.shares[b.key] || 0),
                  note: 'De posten waarin dit aandeel zit, met het deel dat hier terechtkomt.',
                })
              }
            />
          ))}
        {result.unassigned !== 0 && (
          <Line
            left={<span className="cat-dot" style={{ background: 'var(--debt)' }} />}
            what="Nog niet verdeeld"
            sub="vaste bedragen die niet optellen tot de post"
            cents={result.unassigned}
            tone="debt"
            onClick={() =>
              setDetail({
                title: 'Nog niet verdeeld',
                label: 'Per maand',
                cents: result.unassigned,
                rows: postRows(
                  result.lines.filter((l) => l.remainder !== 0 && isAccountParty(l.party)),
                  (l) => l.remainder
                ),
                note: 'Hier tellen de vaste bedragen niet op tot het postbedrag. Open de post en vul in wie dat laatste stuk draagt.',
              })
            }
          />
        )}
        <Total label="Samen" cents={result.monthlyTotal} />
      </div>
      <div className="hint">
        Wat ieder draagt, van welke rekening het ook af ging. Samen precies de maandlast.
        {result.unassigned !== 0 && (
          <>
            {' '}Staat er iets bij <strong>nog niet verdeeld</strong>, dan heeft een post met vaste
            bedragen een deel dat bij niemand ligt. Open die post en vul in wie het draagt.
          </>
        )}
      </div>

      {detail && <Breakdown {...detail} onClose={() => setDetail(null)} />}

      {charge && (
        <ChargeView
          charge={charge}
          accounts={accounts}
          month={month}
          onClose={() => setOpenCharge(null)}
        />
      )}
    </>
  );
}

/**
 * Does it add up — in one line when it does, and in a list when it does not.
 *
 * Silence would be cheaper, but "nothing is wrong" is the thing you actually
 * came to find out, and a screen that only speaks up on trouble never tells you
 * that.
 */
function Checks({ findings }) {
  const [open, setOpen] = useState(false);
  const wrong = findings.filter((f) => f.tone === 'warn');
  const rest = findings.filter((f) => f.tone !== 'warn');

  // Saying so when nothing is wrong reads as a badge rather than as
  // information, and it is the state you are in almost every month.
  if (!findings.length) return null;

  return (
    <>
      {wrong.map((f) => (
        <Notice key={f.id} tone="warn">{f.text}</Notice>
      ))}
      {rest.length > 0 && (
        <div className="checks">
          <button type="button" className="bare" onClick={() => setOpen((v) => !v)}>
            {count(rest.length, 'punt', 'punten')} om een keer naar te kijken
            <span className="chev"> {open ? '▴' : '▾'}</span>
          </button>
          {open && (
            <ul>
              {rest.map((f) => <li key={f.id}>{f.text}</li>)}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

function MonthPicker({ month, onMonth }) {
  return (
    <div className="month">
      <button onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Vorige maand">
        <Icon name="left" size={17} />
      </button>
      <span className="name">{formatMonth(month)}</span>
      <button onClick={() => onMonth(shiftMonth(month, 1))} aria-label="Volgende maand">
        <Icon name="right" size={17} />
      </button>
      {month !== thisMonth() && (
        <button className="btn quiet sm" onClick={() => onMonth(thisMonth())}>nu</button>
      )}
    </div>
  );
}

/** One party in a transfer: a person with initials, or an account. */
function Party({ party, context }) {
  const name = partyName(party, context);
  if (isAccountParty(party)) {
    return (
      <span className="who">
        <span className="avatar sm" style={{ background: 'var(--accent)' }}>
          <Icon name="overview" size={12} />
        </span>
        <span className="small truncate">{name}</span>
      </span>
    );
  }
  return (
    <span className="who">
      <Avatar person={context.people.find((p) => p.id === partyId(party))} size="sm" />
      <span className="small truncate">{name}</span>
    </span>
  );
}

/** "Tidal 8,49 − YouTube Family 4,99": where a netted amount came from. */
function Origin({ transfer, context }) {
  const rows = explainTransfer(transfer, context);
  if (rows.length < 2) return null;

  const shown = rows.slice(0, 3);
  const rest = rows.length - shown.length;
  return (
    <div className="origin">
      {shown.map(({ expense, cents }, i) => (
        <span key={expense.id}>
          {i > 0 && <span className="sign">{cents < 0 ? ' − ' : ' + '}</span>}
          {expense.name} {formatMoney(Math.abs(cents))}
        </span>
      ))}
      {rest > 0 && <span className="sign"> + {rest} meer</span>}
    </div>
  );
}

function Transfer({ transfer, context, me, explain = false, onOpen = null }) {
  // Red and green mean "in debt" and "owed to you". Money into your own shared
  // account is neither — that is moving your own money — so it stays neutral.
  const mine = me ? `person:${me.id}` : null;
  const betweenPeople = !isAccountParty(transfer.from) && !isAccountParty(transfer.to);
  const tone = !betweenPeople
    ? ''
    : transfer.from === mine ? 'debt' : transfer.to === mine ? 'credit' : '';

  const body = (
    <>
      <div className="transfer">
        <Party party={transfer.from} context={context} />
        <span className="arrow"><Icon name="arrow" size={15} /></span>
        <span className="grow" style={{ minWidth: 0 }}>
          <Party party={transfer.to} context={context} />
        </span>
        <Money cents={transfer.cents} size="mid" tone={tone} />
      </div>
      {explain && <Origin transfer={transfer} context={context} />}
    </>
  );

  return onOpen ? (
    <button type="button" className="transfer-row tappable" onClick={onOpen}>{body}</button>
  ) : (
    <div className="transfer-row">{body}</div>
  );
}

/** The mark that stands for an account where a person would have initials. */
const AccountMark = () => (
  <span className="avatar sm" style={{ background: 'var(--accent)' }}>
    <Icon name="overview" size={12} />
  </span>
);

function Pot({ pot, people, hub, month, lines, transfers, context, onDetail }) {
  const shared = pot.account.kind === 'shared';
  const hasContributions = Object.values(pot.contributions || {}).some((c) => Number(c) > 0);
  const isHub = hub?.id === pot.account.id;
  const nameOf = (id) => people.find((p) => p.id === id)?.name || '?';
  const mine = lines.filter(
    (l) => l.expense.payer?.kind === 'account' && l.expense.payer.id === pot.account.id
  );
  // The posts this account has to save up for: the ones it is not charged for
  // every month.
  const saving = mine.filter((l) => cadenceOf(l.expense.cadence).perYear < 12);
  // Charged more often than monthly: four-weekly, weekly. Over a year it comes
  // out even, but one month a year carries an extra charge, and the account has
  // to be able to take it. Which month cannot be known from a month alone — the
  // cycle walks through the calendar — so the cushion is named instead.
  const cycling = mine.filter((l) => cadenceOf(l.expense.cadence).perYear > 12);
  const cushion = cycling.reduce((sum, l) => sum + l.expense.amount, 0);
  // Worked out once, per account, where every other figure about that account
  // comes from — so the leftover tab cannot say a different number.
  const drift = pot.drift;
  const transferBetween = (from, to) =>
    transfers.find((t) => t.from === from && t.to === to) || null;
  const accountName = (id) => context.accounts.find((a) => a.id === id)?.name || 'rekening';
  const opens = (from, to) => {
    const transfer = transferBetween(from, to);
    return transfer ? () => onDetail(transferDetail(transfer, context)) : null;
  };
  const here = `account:${pot.account.id}`;
  const flows = [
    // Money arriving from outside the ledger — turnover on a holding. Not a
    // settlement and not a cost; without it an account at the top of the chain
    // cannot say what stays on it.
    ...(pot.income
      ? [
          {
            key: 'income',
            left: <AccountMark />,
            what: 'Komt erop',
            sub: 'geld dat van buiten Pay binnenkomt',
            cents: pot.income,
          },
        ]
      : []),
    ...Object.entries(pot.incoming).map(([id, cents]) => ({
      key: `in-${id}`,
      left: <Avatar person={people.find((p) => p.id === id)} size="sm" />,
      what: `${nameOf(id)} stort`,
      cents,
      onClick: opens(`person:${id}`, here),
    })),
    ...Object.entries(pot.fromAccounts).map(([id, cents]) => ({
      key: `acc-in-${id}`,
      left: <AccountMark />,
      what: `${accountName(id)} stort`,
      sub: 'het deel dat die rekening zelf draagt',
      cents,
      onClick: opens(`account:${id}`, here),
    })),
  ].sort((a, b) => b.cents - a.cents);
  flows.push(
    ...pot.salaries.map((row) => ({
      key: `salary-${row.person.id}`,
      left: <Avatar person={row.person} size="sm" />,
      what: `Salaris naar ${row.person.name}`,
      sub: 'gaat hiervandaan naar een persoon',
      cents: -row.cents,
    })),
    ...pot.feeds.map((row) => ({
      key: `feed-${row.account.id}`,
      left: <AccountMark />,
      what: `Vaste inleg naar ${row.account.name}`,
      sub: 'wordt hiervandaan overgemaakt',
      cents: -row.cents,
    })),
    ...Object.entries(pot.outgoing)
      .map(([id, cents]) => ({
        key: `out-${id}`,
        left: <Avatar person={people.find((p) => p.id === id)} size="sm" />,
        what: `Terug naar ${nameOf(id)}`,
        sub: 'voorgeschoten van een eigen rekening',
        cents: -cents,
        onClick: opens(here, `person:${id}`),
      }))
      .concat(
        Object.entries(pot.toAccounts).map(([id, cents]) => ({
          key: `acc-out-${id}`,
          left: <AccountMark />,
          what: `Naar ${accountName(id)}`,
          sub: 'het deel dat deze rekening zelf draagt',
          cents: -cents,
          onClick: opens(here, `account:${id}`),
        }))
      )
      .sort((a, b) => a.cents - b.cents)
  );

  return (
    <>
      <div className="section">{pot.account.name}</div>
      <div className="panel">
        <Line
          what="Maandlast"
          sub="jaarposten staan hierin op een twaalfde van hun bedrag"
          cents={pot.out}
          onClick={() =>
            onDetail({
              title: pot.account.name,
              label: 'Maandlast',
              cents: pot.out,
              rows: postRows(mine),
              empty: 'Er gaat deze maand niets van deze rekening af.',
              note: drift
                ? `Alles wat van deze rekening afgaat, op het maandbedrag. Twaalf van deze maandlasten is ${formatMoney(
                    pot.out * 12
                  )}, terwijl deze posten samen ${formatMoney(
                    pot.out * 12 - drift
                  )} per jaar kosten. Er blijft dus ${formatMoney(Math.abs(drift))} per jaar ${
                    drift > 0 ? 'over' : 'tekort'
                  } op deze rekening — een jaarbedrag dat niet door twaalf deelt, past niet in twaalf gelijke maandbedragen.`
                : 'Alles wat van deze rekening afgaat, op het maandbedrag. Twaalf maandlasten is precies wat deze posten samen per jaar kosten, dus de rekening komt elk jaar op nul uit.',
            })
          }
        />
        {(pot.charged !== pot.out || pot.aside > 0) && !pot.chargeUnknown && (
          <Line
            what={`Gaat er in ${formatMonth(month).split(' ')[0]} echt af`}
            cents={pot.charged}
            onClick={() =>
              onDetail({
                title: `Afschrijvingen in ${formatMonth(month)}`,
                label: 'Deze maand',
                cents: pot.charged,
                rows: postRows(
                  mine.filter((l) => chargedIn(l.expense, month) === true),
                  (l) => l.expense.amount
                ),
                empty: 'Deze maand wordt er niets van deze rekening afgeschreven.',
                note: 'Wat de bank deze maand echt weghaalt: het volle bedrag, niet het maandgemiddelde.',
              })
            }
          />
        )}
        {/* Only where something is actually being saved up for. On an account
            with nothing but monthly posts there is nothing to hold, and on a
            savings account — where the money is meant to stay — a nought here
            reads as a claim about the balance, which it is not. */}
        {saving.length > 0 && (
        <Line
          what="Hoort er nu op te staan"
          sub="gespaard voor posten die niet elke maand worden afgeschreven"
          cents={pot.aside}
          onClick={() =>
            onDetail({
              title: 'Hoort er nu op te staan',
              label: `Na de afschrijvingen van ${formatMonth(month).split(' ')[0]}`,
              cents: pot.aside,
              rows: saving.map((l) => {
                const due = nextCharge(l.expense, month);
                const c = cadenceOf(l.expense.cadence);
                return {
                  key: l.expense.id,
                  what: l.expense.name,
                  sub: l.expense.from
                    ? `${formatMoney(l.expense.amount)} ${c.short} · volgende keer ${formatMonth(due).split(' ')[0]}`
                    : `${formatMoney(l.expense.amount)} ${c.short} · afschrijfmaand onbekend`,
                  cents: setAside(l.expense, month),
                };
              }),
              empty: 'Alles op deze rekening wordt maandelijks afgeschreven, dus er hoeft niets op te blijven staan.',
              note: 'Zet dit bedrag op de rekening en stort daarna elke maand de maandlast. Dan is er genoeg als een jaarpost wordt afgeschreven, en is de rekening daarna weer leeg. Mist bij een post de afschrijfmaand, dan telt die hier voor niets mee.',
            })
          }
        />
        )}
        {/* One transfer a year settles what twelve equal instalments cannot.
            Naming the amount is what makes it doable — "a few cents" is not
            something you can put in a banking app. */}
        {drift !== 0 && (
          <Line
            what={drift < 0 ? 'Eén keer per jaar bijstorten' : 'Houd je per jaar over'}
            sub="twaalf maandlasten dekken het jaar net niet precies"
            cents={Math.abs(drift)}
            tone={drift < 0 ? 'debt' : 'credit'}
            onClick={() =>
              onDetail({
                title: 'Rondingsverschil per jaar',
                label: drift < 0 ? 'Bijstorten' : 'Over',
                cents: Math.abs(drift),
                rows: mine
                  .map((l) => ({
                    key: l.expense.id,
                    what: l.expense.name,
                    sub: postSub(l.expense),
                    cents:
                      12 * perMonth(l.expense.amount, l.expense.cadence) -
                      perYear(l.expense.amount, l.expense.cadence),
                  }))
                  .filter((r) => r.cents !== 0)
                  .map((r) => ({ ...r, cents: drift < 0 ? -r.cents : r.cents }))
                  .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents)),
                note:
                  (drift < 0
                    ? 'Maak dit bedrag één keer per jaar extra over en de rekening komt exact op nul uit, zonder dat je maandbedrag hoeft te wiebelen. '
                    : 'Dit blijft er per jaar op staan. Haal het er één keer per jaar af en de rekening komt exact op nul uit, zonder dat je maandbedrag hoeft te wiebelen. ') +
                  'Het komt van posten waarvan het jaarbedrag niet in twaalf gelijke maandbedragen past: € 100,00 per jaar is € 8,33 per maand, en twaalf daarvan is € 99,96.',
              })
            }
          />
        )}
        {/* In and out, each biggest first, whether the money comes from a
            person or from another account. Two lists sorted apart put a
            business paying 7,25 underneath a friend paying 4,13, which reads
            as a sorting fault rather than as two kinds of row. */}
        {flows.map((row) => (
          <Line
            key={row.key}
            left={row.left}
            what={row.what}
            sub={row.sub}
            cents={row.cents}
            onClick={row.onClick}
          />
        ))}
        {/* What everyone together has to put on it is worked out from the
            posts, so it can be said whether or not anybody typed a standing
            order. Only the comparison below it needs one. */}
        {(hasContributions || pot.income > 0 || pot.drawn > 0 || (shared && pot.needed !== 0)) && (
          <>
            {shared && pot.needed !== pot.out && (
              <Line
                what="Moeten jullie samen storten"
                sub="de maandlast plus wat er weer uit gaat naar wie iets voorschoot"
                cents={pot.needed}
                onClick={() =>
                  onDetail({
                    title: 'Moeten jullie samen storten',
                    label: 'Per maand',
                    cents: pot.needed,
                    rows: Object.entries(pot.incoming).map(([id, cents]) => ({
                      key: id,
                      left: <Avatar person={people.find((p) => p.id === id)} size="sm" />,
                      what: nameOf(id),
                      cents,
                    })),
                    note: 'Wat jullie samen op deze rekening moeten storten: de maandlast plus wat er weer uit gaat naar wie iets voorschoot. Dat laatste geld gaat er alleen doorheen. Wat een andere rekening zelf bijdraagt staat hier niet in — dat komt daarvandaan.',
                  })
                }
              />
            )}
            {/* Without a standing order there is nothing to hold against, but
                there is still something worth saying: that everything arriving
                here leaves again. Nought is the answer, and it being anything
                else is the whole reason to print it. */}
            {shared && !hasContributions && (
              <Total
                label="Komt uit op"
                cents={pot.closes}
                tone={pot.closes === 0 ? 'credit' : 'debt'}
              />
            )}
            {hasContributions && (
            <Line
              what="Staat als vaste inleg ingesteld"
              cents={pot.paidIn}
              onClick={() =>
                onDetail({
                  title: 'Vaste inleg',
                  label: 'Per maand',
                  cents: pot.paidIn,
                  rows: Object.entries(pot.contributions)
                    .filter(([, cents]) => Number(cents))
                    .map(([id, cents]) => ({
                      key: id,
                      left: <Avatar person={people.find((p) => p.id === id)} size="sm" />,
                      what: nameOf(id),
                      sub: `hoort ${formatMoney(pot.incoming[id] || 0)} te zijn`,
                      cents: Number(cents),
                    })),
                  note: 'Wat er bij de bank als vaste overboeking staat. Dit verandert niets aan de verdeling; het staat ernaast zodat je ziet of de rekening uitkomt.',
                })
              }
            />
            )}
            {/* Nothing is booked on this account, so there is nothing to hold
                the standing orders against. Calling the whole deposit a
                surplus would be a claim about money Pay knows nothing about —
                a groceries pot is emptied by groceries it has never seen. */}
            {/* Two things have to be there before this means anything: a
                standing order to hold against, and posts to hold it against.
                Without an order it calls the whole deposit a shortfall, right
                under the line saying the account comes out even; without posts
                it calls the whole deposit a surplus. */}
            {(!hasContributions && !pot.income && !pot.drawn) ||
            (mine.length === 0 && !pot.income && !pot.drawn) ? null : (
            <Total
              label={pot.difference >= 0 ? 'Blijft over' : 'Komt tekort'}
              cents={Math.abs(pot.difference)}
              tone={pot.difference >= 0 ? 'credit' : 'debt'}
              onClick={() =>
                onDetail({
                  title: pot.difference >= 0 ? 'Blijft over' : 'Komt tekort',
                  label: 'Per maand',
                  cents: pot.difference,
                  rows: Object.entries(pot.contributions)
                    .filter(([id, cents]) => Number(cents) || pot.incoming[id])
                    .map(([id, cents]) => ({
                      key: id,
                      left: <Avatar person={people.find((p) => p.id === id)} size="sm" />,
                      what: nameOf(id),
                      sub: `${formatMoney(Number(cents) || 0)} ingesteld, ${formatMoney(pot.incoming[id] || 0)} nodig`,
                      cents: (Number(cents) || 0) - (pot.incoming[id] || 0),
                      tone: (Number(cents) || 0) - (pot.incoming[id] || 0) < 0 ? 'debt' : 'credit',
                    })),
                  note: 'Per persoon het verschil tussen de vaste overboeking en wat er op moet komen. Staat hier iets, dan loopt de rekening op den duur vol of leeg.',
                })
              }
            />
            )}
          </>
        )}
      </div>
      {cycling.length > 0 && (
        <div className="hint" style={{ marginTop: -4 }}>
          {count(cycling.length, 'post gaat', 'posten gaan')} hier vaker dan maandelijks af. Eén
          maand per jaar vallen er twee afschrijvingen samen — welke valt niet te zeggen. Houd
          daarvoor <strong>{formatMoney(cushion)}</strong> als bodem aan.
        </div>
      )}
      {shared && !hasContributions && (
        <div className="hint" style={{ marginTop: -4 }}>
          {pot.closes === 0
            ? 'Erop en eraf zijn gelijk: deze rekening houdt niets van zichzelf.'
            : 'Dit hoort nul te zijn. Er gaat iets af dat niemand draagt.'}
        </div>
      )}
      {isHub && (
        <div className="hint" style={{ marginTop: -4 }}>
          Alle onderlinge schulden lopen hierlangs. Wat jij voorschoot komt hier binnen en gaat
          er weer uit, dus hoef je zelf minder te storten.
        </div>
      )}
      {hasContributions && mine.length === 0 && (
        <div className="hint" style={{ marginTop: -4 }}>
          Geen posten op deze rekening, dus valt er niets te controleren. Voor een pot met
          wisselende uitgaven, zoals boodschappen, is dat prima — de inleg is daar een afspraak.
        </div>
      )}
      {shared && !hasContributions && !isHub && (
        <div className="hint" style={{ marginTop: -4 }}>
          Vul bij <strong>Mensen</strong> in wat ieder maandelijks stort, dan zie je hier of deze
          rekening uitkomt.
        </div>
      )}
      {!shared && !hasContributions && (
        <div className="hint" style={{ marginTop: -4 }}>
          Zet je hier zelf maandelijks een vast bedrag op? Vul dat bij <strong>Mensen</strong> in
          als vaste inleg, dan zegt Pay of het nog klopt met wat eraf gaat.
        </div>
      )}
    </>
  );
}
