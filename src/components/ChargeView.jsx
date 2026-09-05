// One charge, read.
//
// A charge is a single line on your bank statement with several expenses
// behind it — five charities in one direct debit, a package of insurances. The
// list of expenses can tell you what it consists of, but not what the bank will
// actually take, because a yearly post in there costs a twelfth per month and
// the whole amount in one.
//
// So this answers both, in that order: what comes off, and what it costs.

import { Sheet, Line, Total, Icon } from './ui.jsx';
import { formatMonth, cadenceOf, chargedIn, setAside } from '../lib/cadence.js';
import { formatMoney } from '../lib/money.js';
import { count } from '../lib/words.js';

export default function ChargeView({ charge, accounts, month, onClose }) {
  const named = charge.accounts
    .map((id) => accounts.find((a) => a.id === id)?.name)
    .filter(Boolean);
  // Everything in it is charged monthly: then what comes off and what it costs
  // are the same number, and saying it twice only invites the question which is
  // which.
  const even = !charge.chargeUnknown && charge.charged === charge.month;
  const aside = charge.lines.reduce((sum, l) => sum + setAside(l.expense, month), 0);

  return (
    <Sheet title={charge.name} onClose={onClose}>
      <div className="headline">
        <div className="label">
          {even ? 'Elke maand' : `Gaat er in ${formatMonth(month).split(' ')[0]} af`}
        </div>
        <div className="figure">{formatMoney(even ? charge.month : charge.charged)}</div>
        <div className="under">
          {[
            !even && `${formatMoney(charge.month)} per maand`,
            count(charge.lines.length, 'post', 'posten'),
            named.length === 1 && `van ${named[0]}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>

      {charge.chargeUnknown && (
        <div className="hint warn" style={{ marginBottom: 14 }}>
          Bij een post hieronder is niet ingevuld in welke maand hij wordt afgeschreven, dus telt
          hij hier niet mee. Vul bij die post <strong>Wordt afgeschreven in</strong> in.
        </div>
      )}

      {named.length > 1 && (
        <div className="hint warn" style={{ marginBottom: 14 }}>
          Deze posten gaan van verschillende rekeningen af ({named.join(', ')}). Dan is het geen
          één afschrijving en klopt het bedrag hierboven niet met je afschrift. Waarschijnlijk staat
          bij een post de verkeerde rekening.
        </div>
      )}

      <div className="section">Wat erin zit</div>
      <div className="panel">
        {charge.lines.map(({ expense, amount }) => {
          const cadence = cadenceOf(expense.cadence);
          const due = chargedIn(expense, month);
          return (
            <Line
              key={expense.id}
              what={expense.name}
              sub={
                expense.cadence === 'once'
                  ? 'eenmalig'
                  : cadence.perYear >= 12
                    ? cadence.id === 'month'
                      ? 'elke maand'
                      : `${formatMoney(expense.amount)} ${cadence.label}`
                    : due === null
                      ? `${formatMoney(expense.amount)} ${cadence.short} · afschrijfmaand onbekend`
                      : due
                        ? `${formatMoney(expense.amount)} ${cadence.short} · deze maand`
                        : `${formatMoney(expense.amount)} ${cadence.short} · niet deze maand`
              }
              cents={amount}
            />
          );
        })}
        <Total label="Per maand" cents={charge.month} />
      </div>

      {aside > 0 && (
        <>
          <div className="panel" style={{ marginTop: 14 }}>
            <Line
              what="Staat hiervoor opzij"
              sub="uit wat er elke maand voor wordt ingelegd"
              cents={aside}
            />
          </div>
          <div className="hint">
            De maandlast hierboven is uitgesmeerd over het jaar; het echte bedrag gaat in één keer
            af. Dit is wat daar tot nu toe voor opzij staat.
          </div>
        </>
      )}

      <div className="hint" style={{ marginTop: 14 }}>
        <Icon name="receipt" size={13} /> Dit bedrag hoort op je afschrift te staan. Wijkt het af,
        dan mist er hier een post of staat er een te veel op deze incasso.
      </div>
    </Sheet>
  );
}
