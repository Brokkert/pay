// Every expense, with filters. This is where you look up what is actually
// running.

import { useMemo, useState } from 'react';
import { Money, Empty, BearerAvatar, Icon } from '../components/ui.jsx';
import { perMonth, perYear, cadenceOf, isActive } from '../lib/cadence.js';
import { split, describeSplit, possibleBearers, bearerName } from '../lib/split.js';
import { categoryOf } from '../data/categories.js';
import { formatMoney } from '../lib/money.js';

const SORTS = [
  { id: 'amount', label: 'Duurste eerst' },
  { id: 'name', label: 'Op naam' },
  { id: 'category', label: 'Op categorie' },
];

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
  const me = people.find((p) => p.isMe);

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
        if (filter === 'business') return Boolean(e.business);
        if (filter === 'stopped') return !isActive(e, month) && e.cadence !== 'once';
        return true;
      })
      .map((expense) => {
        const monthly = perMonth(expense.amount, expense.cadence);
        const { parts } = split(expense.cadence === 'once' ? expense.amount : monthly, expense.split);
        return { expense, monthly, parts };
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

  const total = rows.reduce((sum, r) => sum + r.monthly, 0);

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

      <div className="row small dim" style={{ marginBottom: 10 }}>
        <span className="grow">
          {rows.length} {rows.length === 1 ? 'post' : 'posten'} · {formatMoney(total)} per maand
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
        <div className="panel">
          {rows.map((row) => (
            <ExpenseRow
              key={row.expense.id}
              row={row}
              month={month}
              people={people}
              accounts={accounts}
              onOpen={onOpen}
              onSave={onSave}
            />
          ))}
        </div>
      )}

      <button className="fab" onClick={onNew} aria-label="Nieuwe post">
        <Icon name="plus" size={22} />
      </button>
    </>
  );
}

function ExpenseRow({ row, month, people, accounts, onOpen, onSave }) {
  const { expense, monthly, parts } = row;
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
  const nameOf = (key) => bearerName(key, people, accounts);

  return (
    <button className="item" onClick={() => onOpen(expense)} style={active ? undefined : { opacity: 0.5 }}>
      <span className="cat-dot" style={{ background: cat.colour, alignSelf: 'flex-start', marginTop: 7 }} />

      <span className="mid">
        <span className="row" style={{ gap: 7 }}>
          <span className="title truncate">{expense.name}</span>
          {expense.business && <span className="chip static tiny">zakelijk</span>}
          {expense.paused && <span className="chip static tiny">gepauzeerd</span>}
          {expense.cadence === 'once' && expense.settled && (
            <span className="chip static tiny">afgerekend</span>
          )}
        </span>
        <span className="sub truncate" style={{ display: 'block' }}>
          {cat.label} · {payer ? `van ${payer}` : 'geen rekening'} ·{' '}
          {describeSplit(expense.split, nameOf)}
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
        <Money cents={expense.cadence === 'once' ? expense.amount : monthly} size="mid" />
        <span className="sub" style={{ display: 'block' }}>
          {expense.cadence === 'month' || expense.cadence === 'once'
            ? cadence.short
            : `${formatMoney(expense.amount)} ${cadence.short}`}
        </span>
        {expense.cadence !== 'once' && (
          <span className="sub" style={{ display: 'block' }}>
            {formatMoney(perYear(expense.amount, expense.cadence))} /jr
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
