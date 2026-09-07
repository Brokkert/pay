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

import { useMemo } from 'react';
import { Line, Total, Empty, Notice } from '../components/ui.jsx';
import { forMonth } from '../lib/ledger.js';
import { formatMoney } from '../lib/money.js';

export default function Leftover({ store, month }) {
  const { people, accounts, expenses } = store;
  const result = useMemo(
    () => forMonth({ people, accounts, expenses }, month),
    [people, accounts, expenses, month]
  );

  // Only where something comes in. An account with costs and no inflow has
  // nothing to be left over from, and calling that a shortfall would be a claim
  // about money Pay has never been told about.
  const chains = result.pots.filter(
    (pot) => pot.account.kind !== 'shared' && (pot.income > 0 || pot.paidIn > 0)
  );
  const persons = people
    .filter((p) => Number(p.income) > 0)
    .map((person) => ({
      person,
      income: Number(person.income),
      borne: result.borne[person.id] || 0,
      left: Number(person.income) - (result.borne[person.id] || 0),
    }))
    .sort((a, b) => Number(b.person.isMe) - Number(a.person.isMe) || b.left - a.left);

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

      {chains.map((pot) => (
        <Chain key={pot.account.id} pot={pot} />
      ))}

      {persons.map(({ person, income, borne, left }) => (
        <div key={person.id}>
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
            />
            <Total
              label="Houd je over"
              cents={left}
              tone={left < 0 ? 'debt' : 'credit'}
            />
          </div>
        </div>
      ))}
    </>
  );
}

/** One account, top to bottom: what comes in, what goes out, what stays. */
function Chain({ pot }) {
  const out = pot.needed;
  return (
    <>
      <div className="section">{pot.account.name}</div>
      <div className="panel">
        {pot.income > 0 && (
          <Line what="Komt binnen" sub="geld dat van buiten Pay op deze rekening komt" cents={pot.income} />
        )}
        {pot.paidIn > 0 && (
          <Line what="Vaste inleg erop" sub="wat je er zelf maandelijks op zet" cents={pot.paidIn} />
        )}
        {out !== 0 && (
          <Line
            what="Vaste lasten eraf"
            sub="de posten die van deze rekening afgaan"
            cents={-out}
          />
        )}
        {pot.salaries.map((row) => (
          <Line key={row.person.id} what={`Salaris naar ${row.person.name}`} cents={-row.cents} />
        ))}
        {pot.feeds.map((row) => (
          <Line
            key={row.account.id}
            what={`Naar ${row.account.name}`}
            sub="de vaste inleg die je daarheen overmaakt"
            cents={-row.cents}
          />
        ))}
        <Total
          label={pot.difference >= 0 ? 'Blijft staan' : 'Komt tekort'}
          cents={pot.difference}
          tone={pot.difference < 0 ? 'debt' : 'credit'}
        />
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
