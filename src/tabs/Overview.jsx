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
  note: 'Alles wat in dit ene bedrag is weggestreept. Wat groen staat trekt de andere kant op en maakt het bedrag dus kleiner.',
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
    note: 'Alles wat er loopt, op het maandbedrag — ook de delen die anderen dragen. Wat een jaarpost kost is uitgesmeerd over twaalf maanden.',
  };

  // What ran on the business this month: exactly what came off the business
  // accounts, which the panel further down lists per account anyway.
  const business = accounts
    .filter((a) => a.kind === 'business')
    .reduce((sum, a) => sum + (result.perAccount[a.id] || 0), 0);

  return (
    <>
      <MonthPicker month={month} onMonth={onMonth} />

      {result.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}

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
                      note: 'Wat jij uiteindelijk draagt, ongeacht van welke rekening het wordt afgeschreven.',
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
                label: 'Per maand',
                cents: business,
                rows: postRows(result.lines.filter((l) => isBusiness(l.expense, accounts))),
                note: 'Posten die van een zakelijke rekening afgaan. Dat zegt nog niets over wie het draagt — dat staat onderaan.',
              })
            }
          >
            <span className="grow">Waarvan zakelijk geboekt</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(business)}</span>
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
                Alles is weggestreept en langs <strong>{result.hub.name}</strong> geleid: ook wat er
                van een andere rekening af ging, wordt daar verrekend. Ieder maakt dus één bedrag
                over.
              </>
            ) : (
              <>
                Dit zijn de bedragen ná wegstrepen. Zet ze als vaste overboeking klaar en je hoeft
                er geen maand meer naar om te kijken.
              </>
            )}
          </div>
        </>
      )}

      {result.pots.map((pot) => (
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
            Posten die samen als één regel van je rekening gaan. Tik erop om te zien wat erin zit en
            wat de bank deze maand echt afschrijft.
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
            Eenmalige uitgaven, rechtstreeks af te rekenen. Vink ze bij <strong>Lasten</strong> af
            zodra dat gebeurd is.
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
                  note: 'Alle posten in deze categorie, op hun maandbedrag.',
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
                note: 'Wat er van deze rekening wordt afgeschreven, op het maandbedrag. Wie het draagt kan iemand anders zijn.',
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
                  note: 'De posten waarin dit aandeel zit, met het deel dat hier landt.',
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
                note: 'Bij deze posten tellen de vaste bedragen niet op tot het postbedrag, en het verschil ligt bij niemand. Open de post en vul in wie dat deel draagt.',
              })
            }
          />
        )}
        <Total label="Samen" cents={result.monthlyTotal} />
      </div>
      <div className="hint">
        Dit is de last ná verdeling, ongeacht van wiens rekening het afgeschreven wordt. De som is
        precies de maandlast: er raakt geen cent zoek en er komt er geen bij.
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
  // Twelve monthly instalments do not always add up to the year: 100,00 a year
  // is 8,33 a month, and twelve of those is 99,96. Kept as one number per
  // account so it can be said out loud rather than turning up on a statement.
  const drift = mine.reduce(
    (sum, l) =>
      sum +
      12 * perMonth(l.expense.amount, l.expense.cadence) -
      perYear(l.expense.amount, l.expense.cadence),
    0
  );
  const transferBetween = (from, to) =>
    transfers.find((t) => t.from === from && t.to === to) || null;
  const accountName = (id) => context.accounts.find((a) => a.id === id)?.name || 'rekening';

  return (
    <>
      <div className="section">{pot.account.name}</div>
      <div className="panel">
        <Line
          what="Maandlast"
          sub="wat jaarposten kosten is hierin uitgesmeerd over twaalf maanden"
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
                note: 'Wat de bank deze maand echt afschrijft — het volle bedrag, niet het maandgemiddelde.',
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
              note: 'Zet dit bedrag erop en stort daarna elke maand de maandlast, dan staat er genoeg op het moment dat een jaarpost wordt afgeschreven — en is de rekening daarna weer leeg. Op een paar cent na: een jaarbedrag dat niet door twaalf deelt, past nu eenmaal niet in twaalf gelijke maandbedragen. Staat bij een post geen afschrijfmaand, dan weet Pay niet wanneer hij eraf gaat; die telt hier voor niets mee.',
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
        {Object.entries(pot.incoming).map(([id, cents]) => {
          const transfer = transferBetween(`person:${id}`, `account:${pot.account.id}`);
          return (
            <Line
              key={`in-${id}`}
              left={<Avatar person={people.find((p) => p.id === id)} size="sm" />}
              what={`${nameOf(id)} stort`}
              cents={cents}
              onClick={transfer ? () => onDetail(transferDetail(transfer, context)) : null}
            />
          );
        })}
        {Object.entries(pot.fromAccounts).map(([id, cents]) => {
          const transfer = transferBetween(`account:${id}`, `account:${pot.account.id}`);
          return (
            <Line
              key={`acc-in-${id}`}
              left={<AccountMark />}
              what={`${accountName(id)} stort`}
              sub="het deel dat die rekening zelf draagt"
              cents={cents}
              onClick={transfer ? () => onDetail(transferDetail(transfer, context)) : null}
            />
          );
        })}
        {Object.entries(pot.toAccounts).map(([id, cents]) => (
          <Line
            key={`acc-out-${id}`}
            left={<AccountMark />}
            what={`Terug naar ${accountName(id)}`}
            sub="voorgeschoten van die rekening"
            cents={-cents}
          />
        ))}
        {Object.entries(pot.outgoing).map(([id, cents]) => {
          const transfer = transferBetween(`account:${pot.account.id}`, `person:${id}`);
          return (
            <Line
              key={`out-${id}`}
              left={<Avatar person={people.find((p) => p.id === id)} size="sm" />}
              what={`Terug naar ${nameOf(id)}`}
              sub="voorgeschoten van een andere rekening"
              cents={-cents}
              onClick={transfer ? () => onDetail(transferDetail(transfer, context)) : null}
            />
          );
        })}
        {hasContributions && (
          <>
            {pot.needed !== pot.out && (
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
                    note: 'Wat er volgens de posten door personen op deze rekening moet worden gestort. Dat is de maandlast plus wat er weer uit gaat naar wie iets voorschoot — dat geld gaat er alleen doorheen. Wat een andere rekening zelf bijdraagt staat hier niet in; dat komt daarvandaan, niet van jullie.',
                  })
                }
              />
            )}
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
                  note: 'Wat er bij de bank als vaste overboeking staat ingesteld. Dit telt nergens in mee bij het verdelen — het staat er alleen naast, zodat je ziet of de rekening uitkomt.',
                })
              }
            />
            {/* Nothing is booked on this account, so there is nothing to hold
                the standing orders against. Calling the whole deposit a
                surplus would be a claim about money Pay knows nothing about —
                a groceries pot is emptied by groceries it has never seen. */}
            {mine.length === 0 ? null : (
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
                  note: 'Per persoon het verschil tussen de vaste overboeking en wat er volgens de posten op moet komen. Staat er iets bij, dan loopt de rekening op den duur vol of leeg.',
                })
              }
            />
            )}
          </>
        )}
      </div>
      {cycling.length > 0 && (
        <div className="hint" style={{ marginTop: -4 }}>
          Hier staat {count(cycling.length, 'post', 'posten')} die vaker dan maandelijks wordt
          afgeschreven. Over een jaar komt dat precies uit, maar één maand per jaar valt er een
          extra afschrijving in. Houd daarvoor ongeveer <strong>{formatMoney(cushion)}</strong> als
          bodem aan. Welke maand dat is kan Pay niet zeggen: zo'n cyclus loopt niet met de
          kalender mee.
        </div>
      )}
      {pot.chargeUnknown && (
        <div className="hint warn" style={{ marginTop: -4 }}>
          Van een post op deze rekening is niet bekend in welke maand hij wordt afgeschreven.
          Vul bij die post <strong>Wordt afgeschreven in</strong> in.
        </div>
      )}
      {isHub && (
        <div className="hint" style={{ marginTop: -4 }}>
          Alle onderlinge verrekeningen lopen hierlangs. Wat iemand voorschoot van een eigen of
          zakelijke rekening, komt hier binnen en gaat er weer uit — dat is de reden dat je zelf
          minder hoeft te storten.
        </div>
      )}
      {hasContributions && mine.length === 0 && (
        <div className="hint" style={{ marginTop: -4 }}>
          Er staan geen posten op deze rekening, dus Pay weet niet waar dit geld heen gaat en kan
          niet zeggen of de inleg klopt. Voor een pot waar je variabele uitgaven van doet — de
          boodschappen — is dat ook zo bedoeld: de inleg staat er als afspraak, niet als som.
        </div>
      )}
      {!hasContributions && !isHub && (
        <div className="hint" style={{ marginTop: -4 }}>
          Vul bij <strong>Mensen</strong> in wat ieder maandelijks stort, dan zie je hier meteen of
          de rekening uitkomt.
        </div>
      )}
    </>
  );
}
