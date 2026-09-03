// An expense, read.
//
// Opening one is nearly always to look, not to change: what is it, what does it
// cost a year, who pays it, what does it leave me with. Dropping straight into
// a form for that means the keyboard covers half the screen before you have
// read a word, and every stray tap edits something.
//
// So this is the plain answer, and changing it is a step you take on purpose.

import { useMemo } from 'react';
import { Sheet, Line, Total, BearerAvatar, Icon } from './ui.jsx';
import {
  forMonth,
  explainTransfer,
  partyName,
  personParty,
  accountParty,
  isBusiness,
} from '../lib/ledger.js';
import {
  perMonth,
  perYear,
  cadenceOf,
  isActive,
  formatMonth,
  shiftMonth,
  chargedIn,
  setAside,
} from '../lib/cadence.js';
import { split, possibleBearers, bearerName } from '../lib/split.js';
import { categoryOf } from '../data/categories.js';
import { formatMoney } from '../lib/money.js';
import { count } from '../lib/words.js';

/** The next month this expense is charged, from its start and its rhythm. */
function nextCharge(expense, month) {
  const step = 12 / cadenceOf(expense.cadence).perYear;
  let candidate = month;
  for (let i = 0; i < step; i += 1) {
    candidate = shiftMonth(candidate, 1);
    if (chargedIn(expense, candidate)) return candidate;
  }
  return candidate;
}

export default function ExpenseView({
  expense,
  expenses,
  people,
  accounts,
  month,
  onEdit,
  onClose,
}) {
  const cadence = cadenceOf(expense.cadence);
  const once = expense.cadence === 'once';
  const monthly = once ? expense.amount : perMonth(expense.amount, expense.cadence);
  const { parts } = split(once ? expense.amount : monthly, expense.split);
  const bearers = possibleBearers(people, accounts);

  const payer =
    expense.payer?.kind === 'account'
      ? accounts.find((a) => a.id === expense.payer.id)?.name
      : people.find((p) => p.id === expense.payer?.id)?.name;

  const running = once || isActive(expense, month);
  const category = categoryOf(expense.category);

  // What this expense ends up inside. Nobody transfers per expense — you
  // transfer one amount per person — so the interesting question from here is
  // which other expenses it was netted against on the way there.
  const settled = useMemo(() => {
    const me = people.find((p) => p.isMe);
    const result = forMonth({ people, accounts, expenses }, month);
    return result.transfers
      .map((transfer) => ({
        transfer,
        rows: explainTransfer(transfer, { lines: result.lines, accounts }),
      }))
      // Your own deposit into the settlement account is not a settlement, it is
      // a contribution: everything you owe that account gathered into one
      // amount. Calling it "verrekend met" and naming three of the thirty
      // expenses in it dresses up a total as a netting. A settlement has
      // someone on the other side.
      .filter(({ transfer }) => {
        const mine = me ? personParty(me.id) : null;
        const hub = result.hub ? accountParty(result.hub.id) : null;
        return !(hub && mine && (
          (transfer.from === mine && transfer.to === hub) ||
          (transfer.from === hub && transfer.to === mine)
        ));
      })
      .filter(({ rows }) => rows.length > 1 && rows.some((r) => r.expense.id === expense.id))
      // A transfer can gather a dozen expenses, and listing all of them here
      // turns the answer into a wall. This one always, then the largest few.
      .map(({ transfer, rows }) => {
        const mine = rows.find((r) => r.expense.id === expense.id);
        const others = rows.filter((r) => r.expense.id !== expense.id);
        return { transfer, mine, others };
      })
      // Only where something actually cancels. Expenses all pulling the same
      // way are added up, not settled against each other, and saying otherwise
      // would make the word mean nothing.
      .filter(({ mine, others }) => others.some((r) => Math.sign(r.cents) !== Math.sign(mine.cents)))
      .map(({ transfer, mine, others }) => {
        // Only what pulls the other way earns a place here. In a pot with
        // thirty expenses in it the biggest ones are simply the biggest ones;
        // showing those under "verrekend met" hides the very thing the heading
        // promises, which is what makes the amount smaller.
        const against = others
          .filter((r) => Math.sign(r.cents) !== Math.sign(mine.cents))
          .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
        const shown = against.slice(0, 3);
        return { transfer, mine, shown, rest: others.length - shown.length };
      });
  }, [expense.id, expenses, people, accounts, month]);

  return (
    <Sheet
      title={expense.name}
      onClose={onClose}
      actions={
        <button className="btn" onClick={onEdit}>
          <Icon name="more" size={16} /> Wijzigen
        </button>
      }
    >
      <div className="headline">
        <div className="label">{once ? 'Eenmalig' : 'Per maand'}</div>
        <div className="figure">{formatMoney(monthly)}</div>
        <div className="under">
          {once
            ? expense.settled ? 'afgerekend' : 'nog af te rekenen'
            : [
                // Repeating the monthly amount under a monthly amount says
                // nothing; what it is charged as only earns a line when that
                // differs from what it costs per month.
                expense.cadence !== 'month' && `${formatMoney(expense.amount)} ${cadence.short}`,
                `${formatMoney(perYear(expense.amount, expense.cadence))} per jaar`,
              ]
                .filter(Boolean)
                .join(' · ')}
        </div>
      </div>

      {/* Charged less often than monthly: then the amount above is what you put
          aside each month, and the account only feels it once. */}
      {!once && cadenceOf(expense.cadence).perYear < 12 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          {expense.from ? (
            <>
              <Line
                what={chargedIn(expense, month) ? `Wordt deze maand afgeschreven` : 'Wordt afgeschreven in'}
                sub={chargedIn(expense, month) ? undefined : formatMonth(nextCharge(expense, month))}
                cents={expense.amount}
              />
              <Line what="Staat er nu opzij" sub="uit wat er elke maand voor wordt ingelegd" cents={setAside(expense, month)} />
            </>
          ) : (
            <div className="box">
              <div className="small muted">
                Vul bij <strong>Loopt vanaf</strong> in wanneer deze post begon, dan weet Pay in
                welke maand hij wordt afgeschreven — en hoeveel er inmiddels voor opzij staat.
              </div>
            </div>
          )}
        </div>
      )}

      {!running && (
        <div className="hint warn" style={{ marginBottom: 14 }}>
          Loopt niet in {formatMonth(month)}, dus telt deze maand nergens in mee.
        </div>
      )}

      <div className="panel" style={{ marginBottom: 14 }}>
        <Line
          left={<span className="cat-dot" style={{ background: category.colour }} />}
          what={category.label}
          sub="categorie"
        />
        <Line what={payer || 'Geen rekening'} sub="gaat hiervan af" />
        {expense.charge && <Line what={expense.charge} sub="incasso" />}
        {isBusiness(expense, accounts) && (
          <Line what="Zakelijk" sub="loopt op een zakelijke rekening" />
        )}
        {expense.paused && <Line what="Gepauzeerd" sub="telt nergens in mee" />}
      </div>

      <div className="section">Wie draagt het</div>
      <div className="panel">
        {Object.entries(parts).map(([key, cents]) => (
          <Line
            key={key}
            left={<BearerAvatar bearer={bearers.find((b) => b.key === key)} size="sm" />}
            what={bearerName(key, people, accounts)}
            cents={cents}
          />
        ))}
        <Total label={once ? 'Eenmalig' : 'Per maand'} cents={monthly} />
      </div>

      {settled.length > 0 && (
        <>
          <div className="section">Verrekend met</div>
          {settled.map(({ transfer, mine, shown, rest }) => (
            <div className="panel" key={`${transfer.from}-${transfer.to}`} style={{ marginBottom: 10 }}>
              <Line what={expense.name} sub="deze post" cents={mine.cents} />
              {shown.map(({ expense: other, cents }) => (
                <Line key={other.id} what={other.name} cents={cents} />
              ))}
              {rest > 0 && (
                <Line
                  what={`En nog ${count(rest, 'post', 'posten')}`}
                  sub="tellen dezelfde kant op"
                />
              )}
              <Total
                label={`${partyName(transfer.from, { people, accounts })} → ${partyName(transfer.to, { people, accounts })}`}
                cents={transfer.cents}
              />
            </div>
          ))}
          <div className="hint">
            Je maakt niet per post iets over, maar één bedrag per persoon. Dit is waar deze post in
            terechtkomt en waar hij tegen wegvalt.
          </div>
        </>
      )}

      {(expense.note || expense.from || expense.until) && (
        <div className="panel" style={{ marginTop: 14 }}>
          {expense.from && <Line what={expense.from} sub="loopt vanaf" />}
          {expense.until && <Line what={expense.until} sub="loopt tot" />}
          {expense.note && (
            <div className="box">
              <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{expense.note}</div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
