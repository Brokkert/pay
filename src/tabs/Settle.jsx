// Per person: what runs between the two of you, and where that comes from.
//
// The overview gives the final number; this is the reasoning behind it. That is
// not redundant — a settlement you cannot retrace is one you will not trust.

import { useMemo, useState } from 'react';
import { Line, Total, Money, Avatar, Empty, Sheet, Notice } from '../components/ui.jsx';
import {
  forMonth,
  openSettlements,
  payerParty,
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

  const withAccounts = result.transfers.filter((t) => isAccountParty(t.from) !== isAccountParty(t.to));

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
              return (
                <Line
                  key={`${t.from}-${t.to}`}
                  left={<Avatar person={person} size="sm" />}
                  what={person?.name || '?'}
                  sub={inbound ? `stort op ${accountName}` : `krijgt terug van ${accountName}`}
                  cents={inbound ? t.cents : -t.cents}
                  tone={inbound ? '' : 'credit'}
                />
              );
            })}
            <Total
              label={`Per maand · ${formatMonth(month)}`}
              cents={withAccounts.reduce((s, t) => s + (isAccountParty(t.from) ? -t.cents : t.cents), 0)}
            />
          </div>
          <div className="hint">
            Storten is geen kostenpost — je zet er geld klaar waar de gedeelde lasten van afgaan.
            Wat ieder werkelijk draagt staat op het overzicht.
          </div>
        </>
      )}

      {rows.length > 0 && <div className="section">Onderling</div>}
      {rows.length > 0 && (
        <div className="panel">
          {rows.map((r) => (
            <button key={r.person.id} className="item" onClick={() => setOpen(r.person)}>
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
              <span className="right">
                <Money
                  cents={Math.abs(r.monthly)}
                  size="mid"
                  tone={r.monthly === 0 ? '' : r.monthly > 0 ? 'credit' : 'debt'}
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
            </button>
          ))}
        </div>
      )}

      {open && (
        <Breakdown
          person={open}
          me={me}
          result={result}
          loose={loose}
          accounts={accounts}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/** Where the amount comes from: every expense that plays between the two of you. */
function Breakdown({ person, me, result, loose, accounts, onClose }) {
  const rows = [...result.lines, ...loose.lines]
    .map((line) => {
      const party = line.party ?? payerParty(line.expense, accounts);
      const payer = isAccountParty(party) ? null : partyId(party);
      // Only expenses where exactly one of you pays and the other bears a share:
      // those are the only ones that move money between you.
      if (payer === me.id && line.shares[person.id]) {
        return { expense: line.expense, cents: line.shares[person.id] };
      }
      if (payer === person.id && line.shares[me.id]) {
        return { expense: line.expense, cents: -line.shares[me.id] };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));

  const total = rows.reduce((sum, r) => sum + r.cents, 0);

  return (
    <Sheet title={`Jij en ${person.name}`} onClose={onClose}>
      <div className="panel">
        {rows.map(({ expense, cents }) => (
          <Line
            key={expense.id}
            left={<span className="cat-dot" style={{ background: categoryOf(expense.category).colour }} />}
            what={expense.name}
            sub={
              cents > 0
                ? `jij betaalt, ${person.name} draagt mee`
                : `${person.name} betaalt, jij draagt mee`
            }
            cents={cents}
            tone={cents > 0 ? 'credit' : 'debt'}
          />
        ))}
        <Total
          label={total >= 0 ? `${person.name} → jij` : `jij → ${person.name}`}
          cents={Math.abs(total)}
          tone={total >= 0 ? 'credit' : 'debt'}
        />
      </div>
      <div className="hint">
        Alles wat maar één kant op wijst is al weggestreept: dit is het bedrag dat er netto
        overblijft. Eenmalige posten staan er tegen hun volle bedrag bij, de rest per maand.
      </div>
    </Sheet>
  );
}
