// Per person: what runs between the two of you, and where that comes from.
//
// The overview gives the final number; this is the reasoning behind it. That is
// not redundant — a settlement you cannot retrace is one you will not trust.

import { useMemo, useState } from 'react';
import { Line, Total, CopyMoney, Avatar, Empty, Sheet, Notice } from '../components/ui.jsx';
import Breakdown from '../components/Breakdown.jsx';
import {
  forMonth,
  openSettlements,
  mineFirst,
  payerParty,
  explainTransfer,
  isAccountParty,
  partyId,
  partyName,
} from '../lib/ledger.js';
import { formatMonth } from '../lib/cadence.js';
import { categoryOf } from '../data/categories.js';
import { formatMoney } from '../lib/money.js';

export default function Settle({ store, month }) {
  const { people, accounts, expenses } = store;
  const [open, setOpen] = useState(null);

  const result = useMemo(
    () => forMonth({ people, accounts, expenses }, month),
    [people, accounts, expenses, month]
  );
  const loose = useMemo(() => openSettlements(expenses, accounts), [expenses, accounts]);
  const me = people.find((p) => p.isMe);

  // One line per person: what runs monthly between you and them, and what is
  // still open loosely. Positive means: coming your way.
  const rows = useMemo(() => {
    if (!me) return [];
    const mine = `person:${me.id}`;
    const tally = (transfers) => {
      const per = {};
      for (const t of transfers) {
        // Only what runs between two people; traffic with a shared account is
        // listed separately above.
        if (isAccountParty(t.from) || isAccountParty(t.to)) continue;
        if (t.from === mine) per[partyId(t.to)] = (per[partyId(t.to)] || 0) - t.cents;
        else if (t.to === mine) per[partyId(t.from)] = (per[partyId(t.from)] || 0) + t.cents;
      }
      return per;
    };
    const monthly = tally(result.transfers);
    const once = tally(loose.transfers);
    const ids = new Set([...Object.keys(monthly), ...Object.keys(once)]);
    return [...ids]
      .map((id) => ({
        person: people.find((p) => p.id === id),
        monthly: monthly[id] || 0,
        once: once[id] || 0,
      }))
      .filter((r) => r.person && (r.monthly || r.once))
      .sort(
        (a, b) => Math.abs(b.monthly) + Math.abs(b.once) - Math.abs(a.monthly) - Math.abs(a.once)
      );
  }, [result.transfers, loose.transfers, people, me]);

  const withAccounts = mineFirst(
    result.transfers.filter((t) => isAccountParty(t.from) !== isAccountParty(t.to)),
    me?.id
  );

  if (!me) {
    return (
      <Notice tone="warn">
        Geef bij <strong>Mensen</strong> eerst aan wie van de personen jij bent. Zonder dat weet Pay
        niet vanuit wie het moet rekenen.
      </Notice>
    );
  }

  if (!rows.length && !withAccounts.length) {
    return (
      <Empty icon="settle" title="Niets te verrekenen">
        Zodra iemand meedoet aan een post die jij betaalt — of jij aan een van hen — staat het hier.
      </Empty>
    );
  }

  return (
    <>
      {withAccounts.length > 0 && (
        <>
          <div className="section">Met de gezamenlijke rekeningen</div>
          <div className="panel">
            {withAccounts.map((t) => {
              const inbound = !isAccountParty(t.from);
              const person = people.find((p) => p.id === partyId(inbound ? t.from : t.to));
              const accountName = partyName(inbound ? t.to : t.from, { people, accounts });
              // Where an account rounds its members' deposits up, the figure to
              // transfer is the rounded one — that is the whole point of it, and
              // this is the list you copy from.
              const pot = result.pots.find(
                (p) => p.account.id === partyId(inbound ? t.to : t.from)
              );
              const up = inbound && person ? pot?.rounded[person.id] : 0;
              // Neither direction gets a colour. Green reads as "coming your
              // way", and an amount leaving the account is the opposite: you
              // fill that account, so you are the one paying it. The minus and
              // the line underneath already say which way it goes.
              return (
                <Line
                  key={`${t.from}-${t.to}`}
                  left={<Avatar person={person} size="sm" />}
                  what={person?.name || '?'}
                  sub={
                    up
                      ? `stort op ${accountName} · ${formatMoney(t.cents)} nodig`
                      : inbound
                        ? `stort op ${accountName}`
                        : `krijgt terug van ${accountName}`
                  }
                  cents={up || (inbound ? t.cents : -t.cents)}
                  onClick={() => setOpen({ transfer: t })}
                  copy
                />
              );
            })}
            <Total
              label={`Per maand · ${formatMonth(month)}`}
              cents={withAccounts.reduce((sum, t) => {
                if (isAccountParty(t.from)) return sum - t.cents;
                const pot = result.pots.find((p) => p.account.id === partyId(t.to));
                return sum + (pot?.rounded[partyId(t.from)] || t.cents);
              }, 0)}
              copy
            />
          </div>
          <div className="hint">
            Storten is geen kostenpost: je zet geld klaar waar de gedeelde lasten van afgaan. Tik op een
            naam voor de posten erachter, of op een bedrag om het te kopiëren.
          </div>
        </>
      )}

      {rows.length > 0 && <div className="section">Onderling</div>}
      {rows.length > 0 && (
        <div className="panel">
          {rows.map((r) => (
            /* The name opens the reasoning, the amount goes to the clipboard.
               Two separate controls, because one cannot do both. */
            <div key={r.person.id} className="item has-copy">
              <button type="button" className="item-open" onClick={() => setOpen(r.person)}>
                <Avatar person={r.person} size="lg" />
                <span className="mid">
                  <span className="title truncate" style={{ display: 'block' }}>{r.person.name}</span>
                  <span className="sub" style={{ display: 'block' }}>
                    {r.monthly === 0
                      ? 'alleen iets losstaands'
                      : r.monthly > 0
                        ? 'staat bij jou in het krijt'
                        : 'daar sta jij in het krijt'}
                  </span>
                </span>
              </button>
              <span className="right">
                <CopyMoney
                  cents={Math.abs(r.monthly)}
                  size="mid"
                  tone={r.monthly === 0 ? '' : r.monthly > 0 ? 'credit' : 'debt'}
                  label={r.person.name}
                />
                <span className="sub" style={{ display: 'block' }}>
                  {r.monthly >= 0 ? 'krijg je' : 'betaal je'} /mnd
                </span>
                {r.once !== 0 && (
                  <span
                    className="sub"
                    style={{ display: 'block', color: r.once > 0 ? 'var(--credit)' : 'var(--debt)' }}
                  >
                    {formatMoney(Math.abs(r.once))} los
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {open?.transfer && (
        <TransferBreakdown
          transfer={open.transfer}
          context={{ people, accounts, lines: result.lines }}
          onClose={() => setOpen(null)}
        />
      )}

      {open && !open.transfer && (
        <BetweenTwo
          person={open}
          me={me}
          result={result}
          loose={loose}
          accounts={accounts}
          hub={result.hub}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/**
 * Big to small, but everything that pulls the other way underneath.
 *
 * On size alone a minus lands in the middle of the list, where it reads as one
 * more post you pay until you notice the sign. Kept together at the bottom they
 * are what they are: the ones that make the amount smaller.
 */
const bySizeMinusLast = (a, b) =>
  (a.cents < 0) - (b.cents < 0) || Math.abs(b.cents) - Math.abs(a.cents);

/** Where the amount comes from: every expense that plays between the two of you. */
function BetweenTwo({ person, me, result, loose, accounts, hub, onClose }) {
  const between = (line, viaHub) => {
    const party = line.party ?? payerParty(line.expense, accounts);
    const payer = isAccountParty(party) ? null : partyId(party);
    // Expenses where exactly one of you pays and the other bears a share: those
    // move money between you directly.
    if (payer === me.id && line.shares[person.id]) {
      return { expense: line.expense, cents: line.shares[person.id] };
    }
    if (payer === person.id && line.shares[me.id]) {
      return { expense: line.expense, cents: -line.shares[me.id] };
    }
    // And, for the account everything is settled through: what the other person
    // owes it. That is the other half of the sum — without it a netted amount
    // looks like it came out of nowhere.
    if (viaHub && hub && isAccountParty(party) && partyId(party) === hub.id && line.shares[person.id]) {
      return { expense: line.expense, cents: line.shares[person.id], hub: true };
    }
    return null;
  };

  const rows = [
    ...result.lines.map((line) => between(line, true)),
    // One-offs are never routed through an account, so only the direct ones.
    ...loose.lines.map((line) => between(line, false)),
  ]
    .filter(Boolean)
    .sort(bySizeMinusLast);

  const total = rows.reduce((sum, r) => sum + r.cents, 0);

  return (
    <Sheet title={`Jij en ${person.name}`} onClose={onClose}>
      <div className="panel">
        {rows.map(({ expense, cents, hub: viaHub }) => (
          <Line
            key={expense.id}
            left={<span className="cat-dot" style={{ background: categoryOf(expense.category).colour }} />}
            what={expense.name}
            sub={
              viaHub
                ? `gaat van ${hub.name} af, ${person.name} draagt mee`
                : cents > 0
                  ? `jij betaalt, ${person.name} draagt mee`
                  : `${person.name} betaalt, jij draagt mee`
            }
            cents={cents}
            tone={cents > 0 ? 'credit' : 'debt'}
          />
        ))}
        <Total
          label={
            (total >= 0 ? `${person.name} → jij` : `jij → ${person.name}`) +
            (rows.some((r) => r.hub) ? ` · via ${hub.name}` : '')
          }
          cents={Math.abs(total)}
          tone={total >= 0 ? 'credit' : 'debt'}
          copy
        />
      </div>
      <div className="hint">
        Elke post voor zijn volle bedrag; onderaan wat er ná wegstrepen overblijft — tik erop om het
        te kopiëren. Staat er "via" bij, dan loopt de betaling langs die rekening.
      </div>
    </Sheet>
  );
}

/** One deposit, taken apart: every post that is netted into it. */
function TransferBreakdown({ transfer, context, onClose }) {
  const rows = explainTransfer(transfer, context)
    .map(({ expense, cents }) => ({
      key: expense.id,
      left: <span className="cat-dot" style={{ background: categoryOf(expense.category).colour }} />,
      what: expense.name,
      sub: cents < 0 ? 'trekt de andere kant op' : undefined,
      cents,
      tone: cents < 0 ? 'credit' : '',
    }))
    .sort(bySizeMinusLast);

  return (
    <Breakdown
      title={`${partyName(transfer.from, context)} → ${partyName(transfer.to, context)}`}
      label="Per maand"
      cents={transfer.cents}
      rows={rows}
      empty="Hier zit niets in."
      note="De posten die in dit ene bedrag zijn weggestreept. Groen trekt de andere kant op en maakt het bedrag dus kleiner."
      onClose={onClose}
    />
  );
}
