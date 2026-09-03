// The overview: what is running, and who owes who what.

import { useMemo } from 'react';
import { Line, Total, Money, Avatar, BearerAvatar, Notice, Empty, Icon } from '../components/ui.jsx';
import {
  forMonth,
  openSettlements,
  explainTransfer,
  isAccountParty,
  partyId,
  partyName,
} from '../lib/ledger.js';
import { formatMonth, shiftMonth, thisMonth } from '../lib/cadence.js';
import { categoryOf, accountKindOf } from '../data/categories.js';
import { possibleBearers } from '../lib/split.js';
import { formatMoney } from '../lib/money.js';

export default function Overview({ store, month, onMonth }) {
  const { people, accounts, expenses } = store;
  const result = useMemo(
    () => forMonth({ people, accounts, expenses }, month),
    [people, accounts, expenses, month]
  );
  const loose = useMemo(() => openSettlements(expenses, accounts), [expenses, accounts]);
  const me = people.find((p) => p.isMe);
  const context = { people, accounts, lines: result.lines };

  if (!expenses.length) {
    return (
      <Empty icon="receipt" title="Nog niets geboekt">
        Voeg je eerste vaste last toe met de knop rechtsonder. Heb je al een overzicht in Excel of
        Numbers? Plak het dan in één keer via <strong>Meer → Plakken</strong>.
      </Empty>
    );
  }

  const business = result.lines.filter((l) => l.expense.business).reduce((s, l) => s + l.amount, 0);
  const charges = Object.entries(result.perCharge).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <MonthPicker month={month} onMonth={onMonth} />

      {result.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}

      {/* The two numbers it is all about: what runs in total, and how much of
          that is ultimately yours. The one card in the app that carries colour —
          everything else stays quiet so your eye lands here. */}
      <div className="hero">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="label">Loopt deze maand</div>
            <div className="figure">{formatMoney(result.monthlyTotal)}</div>
            <div className="under">
              {formatMoney(result.yearlyTotal)} per jaar · {result.lines.length} posten
            </div>
          </div>
          {me && (
            <div className="side">
              <div className="label">Jouw deel</div>
              <div className="figure">{formatMoney(result.borne[me.id] || 0)}</div>
            </div>
          )}
        </div>
        {business > 0 && (
          <div className="strip">
            <span className="grow">Waarvan zakelijk geboekt</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(business)}</span>
          </div>
        )}
      </div>

      {/* The answer to "what does she have to transfer". */}
      {result.transfers.length > 0 && (
        <>
          <div className="section">Elke maand overmaken</div>
          <div className="panel">
            {result.transfers.map((t) => (
              <Transfer key={`${t.from}-${t.to}`} transfer={t} context={context} me={me} explain />
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
        <Pot key={pot.account.id} pot={pot} people={people} hub={result.hub} />
      ))}

      {charges.length > 0 && (
        <>
          <div className="section">Per groep</div>
          <div className="panel">
            {charges.map(([name, cents]) => (
              <Line
                key={name}
                what={name}
                sub={`${result.lines.filter((l) => l.expense.charge === name).length} posten bij elkaar`}
                cents={cents}
              />
            ))}
          </div>
          <div className="hint" style={{ marginTop: -4 }}>
            Posten die je bij elkaar wilt zien. Staan ze samen op één afschrijving, dan is dit het
            bedrag dat je op je bankafschrift terugvindt.
          </div>
        </>
      )}

      {loose.transfers.length > 0 && (
        <>
          <div className="section">Nog los af te rekenen</div>
          <div className="panel">
            {loose.transfers.map((t) => (
              <Transfer key={`loose-${t.from}-${t.to}`} transfer={t} context={context} me={me} />
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
            />
          );
        })}
        <Total label="Per maand" cents={result.monthlyTotal} />
      </div>

      <div className="section">Wat er van welke rekening af gaat</div>
      <div className="panel">
        {accounts.map((a) => (
          <Line key={a.id} what={a.name} sub={accountKindOf(a.kind).label} cents={result.perAccount[a.id] || 0} />
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
            />
          ))}
        {result.unassigned !== 0 && (
          <Line
            left={<span className="cat-dot" style={{ background: 'var(--debt)' }} />}
            what="Nog niet verdeeld"
            sub="vaste bedragen die niet optellen tot de post"
            cents={result.unassigned}
            tone="debt"
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

function Transfer({ transfer, context, me, explain = false }) {
  // Red and green mean "in debt" and "owed to you". Money into your own shared
  // account is neither — that is moving your own money — so it stays neutral.
  const mine = me ? `person:${me.id}` : null;
  const betweenPeople = !isAccountParty(transfer.from) && !isAccountParty(transfer.to);
  const tone = !betweenPeople
    ? ''
    : transfer.from === mine ? 'debt' : transfer.to === mine ? 'credit' : '';

  return (
    <div className="transfer-row">
      <div className="transfer">
        <Party party={transfer.from} context={context} />
        <span className="arrow"><Icon name="arrow" size={15} /></span>
        <span className="grow" style={{ minWidth: 0 }}>
          <Party party={transfer.to} context={context} />
        </span>
        <Money cents={transfer.cents} size="mid" tone={tone} />
      </div>
      {explain && <Origin transfer={transfer} context={context} />}
    </div>
  );
}

function Pot({ pot, people, hub }) {
  const hasContributions = Object.values(pot.contributions || {}).some((c) => Number(c) > 0);
  const isHub = hub?.id === pot.account.id;
  const nameOf = (id) => people.find((p) => p.id === id)?.name || '?';

  return (
    <>
      <div className="section">{pot.account.name}</div>
      <div className="panel">
        <Line what="Gaat er deze maand af" cents={pot.out} />
        {Object.entries(pot.incoming).map(([id, cents]) => (
          <Line
            key={`in-${id}`}
            left={<Avatar person={people.find((p) => p.id === id)} size="sm" />}
            what={`${nameOf(id)} stort`}
            cents={cents}
          />
        ))}
        {Object.entries(pot.outgoing).map(([id, cents]) => (
          <Line
            key={`out-${id}`}
            left={<Avatar person={people.find((p) => p.id === id)} size="sm" />}
            what={`Terug naar ${nameOf(id)}`}
            sub="voorgeschoten van een andere rekening"
            cents={-cents}
          />
        ))}
        {hasContributions && (
          <>
            <Line what="Staat als vaste inleg ingesteld" cents={pot.paidIn} />
            <Total
              label={pot.difference >= 0 ? 'Blijft over' : 'Komt tekort'}
              cents={Math.abs(pot.difference)}
              tone={pot.difference >= 0 ? 'credit' : 'debt'}
            />
          </>
        )}
      </div>
      {isHub && (
        <div className="hint" style={{ marginTop: -4 }}>
          Alle onderlinge verrekeningen lopen hierlangs. Wat iemand voorschoot van een eigen of
          zakelijke rekening, komt hier binnen en gaat er weer uit — dat is de reden dat je zelf
          minder hoeft te storten.
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
