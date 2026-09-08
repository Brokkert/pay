// Every expense, with filters. This is where you look up what is actually
// running.

import { useMemo, useState } from 'react';
import { Money, Empty, BearerAvatar, Icon } from '../components/ui.jsx';
import { perMonth, cadenceOf, isActive } from '../lib/cadence.js';
import { split, possibleBearers } from '../lib/split.js';
import { isBusiness } from '../lib/ledger.js';
import { categoryOf } from '../data/categories.js';
import { formatMoney } from '../lib/money.js';
import { count } from '../lib/words.js';

const SORTS = [
  { id: 'amount', label: 'Duurste eerst' },
  { id: 'name', label: 'Op naam' },
  { id: 'category', label: 'Op categorie' },
];

// Which amount the list is about. The full amount is what leaves the account
// and what the split is worked out from, so it is where the list starts; your
// own share answers a different question and gets the same column when you ask
// for it. One switch for the whole list, never per row — two rows in one list
// meaning different things is a list you cannot read, let alone add up.
const VIEWS = [
  { id: 'full', label: 'Volledig' },
  { id: 'mine', label: 'Mijn deel' },
];

const VIEW_KEY = 'pay:view:expenses';

const readView = () => {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    return VIEWS.some((v) => v.id === saved) ? saved : 'full';
  } catch {
    // A browser that refuses storage still gets a working list.
    return 'full';
  }
};

const FILTERS = [
  ['all', 'Alles'],
  ['running', 'Loopt nu'],
  ['shared', 'Gedeeld'],
  ['mine', 'Alleen ik'],
  ['once', 'Eenmalig'],
  ['business', 'Zakelijk'],
  ['stopped', 'Loopt niet'],
];

export default function Expenses({ store, month, onOpen, onNew, onSave }) {
  const { people, accounts, expenses } = store;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('amount');
  const [view, setView] = useState(readView);
  const me = people.find((p) => p.isMe);
  // Only a question you can ask once Pay knows which of the people is you.
  const mode = me ? view : 'full';
  const mine = mode === 'mine';

  const chooseView = (id) => {
    setView(id);
    try {
      localStorage.setItem(VIEW_KEY, id);
    } catch {
      /* not remembering it is better than not switching at all */
    }
  };

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return expenses
      .filter((e) => {
        if (term && !`${e.name} ${e.note || ''}`.toLowerCase().includes(term)) return false;
        const participants =
          (e.split?.participants?.length || 0) + Object.keys(e.split?.weights || {}).length;
        if (filter === 'running') return isActive(e, month);
        if (filter === 'once') return e.cadence === 'once';
        if (filter === 'shared') return participants > 1;
        if (filter === 'mine') return participants === 1 && me && e.split?.participants?.[0] === me.id;
        if (filter === 'business') return isBusiness(e, accounts);
        if (filter === 'stopped') return !isActive(e, month) && e.cadence !== 'once';
        return true;
      })
      .map((expense) => {
        const monthly = perMonth(expense.amount, expense.cadence);
        const { parts } = split(expense.cadence === 'once' ? expense.amount : monthly, expense.split);
        // Your share of what the row shows, and of what the column adds up. For
        // a one-off those differ: the row is about the whole amount, the column
        // is per month and a one-off costs nothing per month.
        const share = (me && parts[me.id]) || 0;
        return {
          expense,
          monthly,
          parts,
          share,
          shareMonthly: expense.cadence === 'once' ? 0 : share,
        };
      })
      .sort((a, b) => {
        if (sort === 'name') return a.expense.name.localeCompare(b.expense.name, 'nl');
        if (sort === 'category') {
          return (a.expense.category || '').localeCompare(b.expense.category || '', 'nl')
            || b.monthly - a.monthly;
        }
        return b.monthly - a.monthly || a.expense.name.localeCompare(b.expense.name, 'nl');
      });
  }, [expenses, query, filter, sort, month, me]);

  const amountOf = (row) => (mine ? row.shareMonthly : row.monthly);
  const total = rows.reduce((sum, r) => sum + amountOf(r), 0);

  // One list, or one per category when that is what you sorted on.
  const groups = useMemo(() => {
    if (sort !== 'category') return [{ label: null, rows, total }];
    const out = [];
    for (const row of rows) {
      const label = categoryOf(row.expense.category).label;
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(row);
      else out.push({ label, rows: [row], total: 0 });
    }
    for (const group of out) {
      group.total = group.rows.reduce((sum, r) => sum + (mine ? r.shareMonthly : r.monthly), 0);
    }
    return out;
  }, [rows, sort, total, mine]);

  return (
    <>
      <div style={{ margin: '4px 0 12px', position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-3)' }}>
          <Icon name="search" size={18} />
        </span>
        <input
          className="input"
          style={{ paddingLeft: 40 }}
          placeholder="Zoeken"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="scroller">
        {FILTERS.map(([id, label]) => (
          <button key={id} className={`chip${filter === id ? ' on' : ''}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      {me && (
        <div className="segment" role="group" aria-label="Welk bedrag">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={mode === v.id ? 'on' : ''}
              aria-pressed={mode === v.id}
              onClick={() => chooseView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      <div className="row small dim" style={{ marginBottom: 10 }}>
        <span className="grow">
          {count(rows.length, 'post', 'posten')} · {formatMoney(total)}
          {mine ? ' voor jou' : ''} per maand
        </span>
        <select
          className="select"
          style={{ width: 'auto', padding: '5px 30px 5px 10px', fontSize: 12.5 }}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sortering"
        >
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {!rows.length ? (
        <Empty icon="search" title="Niets gevonden">
          Pas het filter aan, of voeg een post toe met de knop rechtsonder.
        </Empty>
      ) : (
        /* Sorted by category, the list is already in groups — it just does not
           look like it. Thirty rows in a row is a wall whichever way you sort
           them; with a heading and a subtotal it is six short lists. */
        groups.map(({ label, rows: group, total: sum }) => (
          <div key={label || 'all'}>
            {label && (
              <div className="row" style={{ margin: '2px 2px 8px', alignItems: 'baseline' }}>
                <div className="section grow" style={{ margin: 0 }}>{label}</div>
                <Money cents={sum} />
              </div>
            )}
            <div className="panel">
              {group.map((row) => (
                <ExpenseRow
                  key={row.expense.id}
                  row={row}
                  mine={mine}
                  month={month}
                  people={people}
                  accounts={accounts}
                  onOpen={onOpen}
                  onSave={onSave}
                />
              ))}
            </div>
          </div>
        ))
      )}

      <button className="fab" onClick={onNew} aria-label="Nieuwe post">
        <Icon name="plus" size={22} />
      </button>
    </>
  );
}

function ExpenseRow({ row, mine, month, people, accounts, onOpen, onSave }) {
  const { expense, monthly, parts, share } = row;
  // What the row is about, and what it is a part of.
  const whole = expense.cadence === 'once' ? expense.amount : monthly;
  const shown = mine ? share : whole;
  const cat = categoryOf(expense.category);
  const cadence = cadenceOf(expense.cadence);
  const active = isActive(expense, month) || expense.cadence === 'once';
  // This should show the account the money leaves from, not the party from the
  // books: for a business account that is "Zaak", not your own name.
  const payer =
    expense.payer?.kind === 'account'
      ? accounts.find((a) => a.id === expense.payer.id)?.name
      : people.find((p) => p.id === expense.payer?.id)?.name;
  const bearers = possibleBearers(people, accounts);
  const taking = Object.keys(parts);

  return (
    <button className="item" onClick={() => onOpen(expense)} style={active ? undefined : { opacity: 0.5 }}>
      <span className="cat-dot" style={{ background: cat.colour, alignSelf: 'flex-start', marginTop: 7 }} />

      <span className="mid">
        {/* The name gets the line to itself. It used to share it with a badge
            for the charge and one for "zakelijk", and on a phone that left
            "Autov…" beside a charge that ran off the edge anyway: three things
            competing, none of them readable. */}
        <span className="row" style={{ gap: 7 }}>
          <span className="title truncate">{expense.name}</span>
          {expense.paused && <span className="chip static tiny">gepauzeerd</span>}
          {expense.cadence === 'once' && expense.settled && (
            <span className="chip static tiny">afgerekend</span>
          )}
        </span>
        {/* Underneath, in one grey line: what it is, where it goes off, and —
            if it rides along on a debit with others — which one. Zakelijk is
            not repeated here: the account it comes off is the business itself. */}
        <span className="sub truncate" style={{ display: 'block' }}>
          {cat.label} · {payer ? `van ${payer}` : 'geen rekening'}
          {expense.charge && (
            <>
              {' · '}
              <Icon name="receipt" size={10} style={{ display: 'inline', verticalAlign: -1 }} />
              {' '}
              {expense.charge}
            </>
          )}
        </span>
        <span className="stack" style={{ marginTop: 6 }}>
          {taking.slice(0, 5).map((key) => (
            <BearerAvatar key={key} bearer={bearers.find((b) => b.key === key)} size="sm" />
          ))}
          {taking.length > 5 && (
            <span className="tiny dim" style={{ marginLeft: 8, alignSelf: 'center' }}>
              +{taking.length - 5}
            </span>
          )}
        </span>
      </span>

      <span className="right">
        <Money cents={shown} size="mid" />
        {/* Showing your share, say what it is a share of — otherwise the row no
            longer matches your bank statement and nothing on it says why. */}
        {mine && (
          <span className="sub" style={{ display: 'block' }}>
            van {formatMoney(whole)}
          </span>
        )}
        {/* The column is per month — the header above says so — and repeating
            "/mnd" on every row says nothing. What is worth a second line is an
            expense charged in some other rhythm, because then the big number is
            not what leaves your account. */}
        {expense.cadence !== 'month' && expense.cadence !== 'once' && (
          <span className="sub" style={{ display: 'block' }}>
            {formatMoney(expense.amount)} {cadence.short}
          </span>
        )}
        {expense.cadence === 'once' && (
          <span
            className="btn sm"
            role="button"
            tabIndex={0}
            style={{ marginTop: 6 }}
            onClick={(e) => { e.stopPropagation(); onSave({ ...expense, settled: !expense.settled }); }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.stopPropagation();
              e.preventDefault();
              onSave({ ...expense, settled: !expense.settled });
            }}
          >
            {expense.settled ? 'Heropenen' : 'Afgerekend'}
          </span>
        )}
      </span>
    </button>
  );
}
