// An expense, read.
//
// Opening one is nearly always to look, not to change: what is it, what does it
// cost a year, who pays it, what does it leave me with. Dropping straight into
// a form for that means the keyboard covers half the screen before you have
// read a word, and every stray tap edits something.
//
// So this is the plain answer, and changing it is a step you take on purpose.

import { Sheet, Line, Total, Money, BearerAvatar, Icon } from './ui.jsx';
import { perMonth, perYear, cadenceOf, isActive, formatMonth } from '../lib/cadence.js';
import { split, possibleBearers, bearerName } from '../lib/split.js';
import { categoryOf } from '../data/categories.js';
import { formatMoney } from '../lib/money.js';

export default function ExpenseView({ expense, people, accounts, month, onEdit, onClose }) {
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
        {expense.charge && <Line what={expense.charge} sub="groep" />}
        {expense.business && <Line what="Zakelijk geboekt" sub="je krijgt dit terug van de zaak" />}
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
