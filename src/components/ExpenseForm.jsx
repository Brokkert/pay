// Creating or changing an expense.

import { useMemo, useState } from 'react';
import { Sheet, Field, Notice, AmountInput, Avatar, Confirm, Icon } from './ui.jsx';
import SplitPicker from './SplitPicker.jsx';
import { CADENCES } from '../lib/cadence.js';
import { CATEGORIES } from '../data/categories.js';

const blank = (meId) => ({
  name: '',
  amount: 0,
  cadence: 'month',
  category: 'other',
  charge: '',
  payer: { kind: 'account', id: null },
  split: { kind: 'equal', participants: meId ? [meId] : [], weights: {} },
  from: '',
  until: '',
  paused: false,
  business: false,
  note: '',
});

export default function ExpenseForm({
  expense,
  people,
  accounts,
  charges = [],
  onSave,
  onRemove,
  onClose,
}) {
  const meId = people.find((p) => p.isMe)?.id;
  const [draft, setDraft] = useState(() => ({ ...blank(meId), ...expense }));
  // Charges are not a list you maintain somewhere — they are simply the names
  // already in use, plus whatever you type here. One less thing to keep tidy,
  // and picking from them is what stops "Verzekeringspakket" and
  // "Verzekeringpakket" from quietly becoming two different charges.
  const known = useMemo(
    () => [...new Set([...charges, expense?.charge].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl')),
    [charges, expense?.charge]
  );
  const [naming, setNaming] = useState(() => Boolean(expense?.charge) && !charges.includes(expense.charge));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const canSave = draft.name.trim() && draft.amount > 0 && Boolean(draft.payer?.id);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...draft, name: draft.name.trim() });
      onClose();
    } catch (err) {
      setError(err.message || String(err));
      setBusy(false);
    }
  };

  return (
    <Sheet title={expense?.id ? 'Post wijzigen' : 'Nieuwe post'} onClose={onClose}>
      {error && <Notice tone="error">{error}</Notice>}

      <Field label="Wat is het">
        <input
          className="input"
          // Only on a new expense, where an empty field is the first thing you
          // came to fill in. On an existing one it just throws the keyboard over
          // half the screen before you have read anything.
          autoFocus={!expense?.id}
          placeholder="Energie, internet, verzekering…"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>

      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="grow">
          <Field label="Bedrag">
            <AmountInput cents={draft.amount} onChange={(c) => set({ amount: c })} />
          </Field>
        </div>
        <div style={{ width: 148 }}>
          <Field label="Hoe vaak">
            <select className="select" value={draft.cadence} onChange={(e) => set({ cadence: e.target.value })}>
              {CADENCES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <Field
        label="Waar gaat het vanaf"
        hint="De rekening waar het daadwerkelijk van afgeschreven wordt. Dat hoeft niet dezelfde te zijn als wie het uiteindelijk draagt — daar is de verdeling hieronder voor."
      >
        <div className="chips">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`chip${draft.payer?.kind === 'account' && draft.payer.id === a.id ? ' on' : ''}`}
              onClick={() => set({ payer: { kind: 'account', id: a.id } })}
            >
              {a.name}
            </button>
          ))}
        </div>
        {people.filter((p) => !p.isMe).length > 0 && (
          <>
            <div className="tiny dim" style={{ margin: '12px 0 7px' }}>
              Of iemand anders betaalt het en jij doet mee:
            </div>
            <div className="chips">
              {people.filter((p) => !p.isMe).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`chip${draft.payer?.kind === 'person' && draft.payer.id === p.id ? ' on' : ''}`}
                  onClick={() => set({ payer: { kind: 'person', id: p.id } })}
                >
                  <Avatar person={p} size="sm" /> {p.name}
                </button>
              ))}
            </div>
          </>
        )}
      </Field>

      <SplitPicker
        amount={draft.amount}
        cadence={draft.cadence}
        spec={draft.split}
        people={people}
        accounts={accounts}
        onChange={(spec) => set({ split: spec })}
      />

      <Field label="Categorie">
        <select className="select" value={draft.category} onChange={(e) => set({ category: e.target.value })}>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Field>

      <Field
        label="Incasso"
        hint="Alleen voor posten die als één regel van je rekening gaan: je verzekeringspakket, je zorgverzekeraar. Pay telt ze op, zodat je dat bedrag herkent op je afschrift. Wat een post ís hoort bij de categorie hierboven — daar is dit niet voor."
      >
        <div className="chips">
          {known.map((name) => (
            <button
              key={name}
              type="button"
              className={`chip${draft.charge === name ? ' on' : ''}`}
              onClick={() => {
                setNaming(false);
                set({ charge: draft.charge === name ? '' : name });
              }}
            >
              <Icon name="receipt" size={14} /> {name}
            </button>
          ))}
          <button
            type="button"
            className={`chip${naming ? ' on' : ''}`}
            onClick={() => {
              setNaming(true);
              if (known.includes(draft.charge)) set({ charge: '' });
            }}
          >
            <Icon name="plus" size={14} /> Nieuwe
          </button>
        </div>
        {naming && (
          <input
            className="input"
            style={{ marginTop: 9 }}
            autoFocus
            placeholder="Naam van de afschrijving"
            value={draft.charge || ''}
            onChange={(e) => set({ charge: e.target.value })}
          />
        )}
      </Field>

      <details className="disclose" style={{ marginBottom: 18 }}>
        <summary>Looptijd, notitie en zakelijk</summary>
        <div style={{ marginTop: 16 }}>
          <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            <div className="grow">
              <Field label="Loopt vanaf" hint="Leeg = loopt al">
                <input className="input" type="date" value={draft.from || ''}
                  onChange={(e) => set({ from: e.target.value })} />
              </Field>
            </div>
            <div className="grow">
              <Field label="Loopt tot" hint="Leeg = doorlopend">
                <input className="input" type="date" value={draft.until || ''}
                  onChange={(e) => set({ until: e.target.value })} />
              </Field>
            </div>
          </div>

          <Field label="Notitie">
            <textarea
              className="textarea"
              placeholder="Opzegtermijn, klantnummer, waar hij op meelift — wat je ook wilt onthouden."
              value={draft.note || ''}
              onChange={(e) => set({ note: e.target.value })}
            />
          </Field>

          <label className="row" style={{ gap: 10, marginBottom: 12 }}>
            <input type="checkbox" checked={Boolean(draft.business)}
              onChange={(e) => set({ business: e.target.checked })} />
            <span className="small">Zakelijk — apart optellen voor de boekhouding</span>
          </label>

          <label className="row" style={{ gap: 10 }}>
            <input type="checkbox" checked={Boolean(draft.paused)}
              onChange={(e) => set({ paused: e.target.checked })} />
            <span className="small">Even gepauzeerd — telt tijdelijk niet mee</span>
          </label>
        </div>
      </details>

      <div className="row" style={{ gap: 8 }}>
        {expense?.id && <button className="btn danger" onClick={() => setAsking(true)}>Verwijderen</button>}
        <button className="btn primary grow" disabled={!canSave || busy} onClick={save}>
          {busy ? <span className="spinner" /> : 'Bewaren'}
        </button>
      </div>
      {!canSave && (
        <div className="hint">Een naam, een bedrag en een rekening waar het vanaf gaat zijn het minimum.</div>
      )}

      {asking && (
        <Confirm
          title={`"${draft.name}" verwijderen?`}
          body="De post verdwijnt uit alle overzichten en berekeningen. Wil je hem alleen tijdelijk stopzetten, gebruik dan 'gepauzeerd' of vul een einddatum in."
          onConfirm={() => { onRemove(expense.id); onClose(); }}
          onClose={() => setAsking(false)}
        />
      )}
    </Sheet>
  );
}
