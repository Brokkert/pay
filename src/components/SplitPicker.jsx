// Who bears which part.
//
// The most important part of the form, which is why what the chosen split means
// in euros sits right underneath it. A percentage says nothing; "Partner
// € 152,64 per maand" does.

import { SPLIT_KINDS, split, possibleBearers, ACCOUNT_PREFIX } from '../lib/split.js';
import { perMonth } from '../lib/cadence.js';
import { Field, Money, BearerAvatar, AmountInput } from './ui.jsx';

export default function SplitPicker({ amount, cadence, spec, people, accounts = [], onChange }) {
  const bearers = possibleBearers(people, accounts);
  const bearerOf = (key) => bearers.find((b) => b.key === key);

  const s = spec || { kind: 'equal', participants: [], weights: {} };
  // Who is in this split according to the editor — including anyone sitting at
  // zero for a moment. participantsOf() answers "who actually bears something"
  // and rightly leaves zeroes out, but using that here meant that clearing a
  // field to retype it dropped the row, and with it the field being typed in.
  // Taking someone off the split is what the chips are for.
  const taking =
    s.kind === 'equal' ? [...(s.participants || [])] : Object.keys(s.weights || {});
  const inSet = new Set(taking);
  const shown = cadence === 'once' ? amount : perMonth(amount, cadence);
  const { parts, remainder } = split(shown, s);
  const me = people.find((p) => p.isMe);

  const setKind = (kind) => {
    const ids = [...taking];
    if (kind === 'equal') return onChange({ kind, participants: ids, weights: {} });
    if (kind === 'percent') {
      // Sensible starting values: divided equally over whoever was already in.
      const each = ids.length ? Math.round(100 / ids.length) : 0;
      const weights = Object.fromEntries(ids.map((id) => [id, each]));
      if (ids.length) weights[ids[0]] = 100 - each * (ids.length - 1);
      return onChange({ kind, participants: ids, weights });
    }
    if (kind === 'shares') {
      return onChange({ kind, participants: ids, weights: Object.fromEntries(ids.map((id) => [id, 1])) });
    }
    // Fixed amounts start from the split that is there now, so you only have to
    // adjust instead of typing everything again.
    return onChange({ kind, participants: ids, weights: { ...parts } });
  };

  const toggle = (key) => {
    const on = inSet.has(key);
    if (s.kind === 'equal') {
      const ids = on ? (s.participants || []).filter((x) => x !== key) : [...(s.participants || []), key];
      return onChange({ ...s, participants: ids });
    }
    const weights = { ...(s.weights || {}) };
    if (on) delete weights[key];
    else weights[key] = s.kind === 'shares' ? 1 : 0;
    return onChange({ ...s, weights });
  };

  const setWeight = (key, value) =>
    onChange({ ...s, weights: { ...(s.weights || {}), [key]: value } });

  const percentTotal = Object.values(s.weights || {}).reduce((sum, w) => sum + (Number(w) || 0), 0);

  return (
    <>
      <Field
        label="Wie draagt het"
        hint={!taking.length ? 'Kies minstens één persoon, anders telt deze post nergens mee.' : null}
        warn={!taking.length}
      >
        <div className="chips">
          {bearers.map((b) => (
            <button
              key={b.key}
              type="button"
              className={`chip${inSet.has(b.key) ? ' on' : ''}`}
              onClick={() => toggle(b.key)}
            >
              <BearerAvatar bearer={b} size="sm" /> {b.name}
            </button>
          ))}
        </div>
        {taking.some((key) => key.startsWith(ACCOUNT_PREFIX)) && (
          <div className="hint">
            Een zakelijke rekening draagt dit deel zelf, dus het staat niet bij jou privé — en je
            ziet meteen wat je bij de zaak kunt terughalen.
          </div>
        )}
      </Field>

      {taking.length > 1 && (
        <Field label="Verdeling" hint={SPLIT_KINDS.find((k) => k.id === s.kind)?.blurb}>
          <div className="chips">
            {SPLIT_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                className={`chip${s.kind === k.id ? ' on' : ''}`}
                onClick={() => setKind(k.id)}
              >
                {k.label}
              </button>
            ))}
          </div>
        </Field>
      )}

      {taking.length > 0 && (
        <div className="field">
          <label className="field-label">Komt neer op {cadence === 'once' ? '(eenmalig)' : '(per maand)'}</label>
          <div className="panel">
            {taking.map((key) => {
              const bearer = bearerOf(key);
              return (
                <div key={key} className="line">
                  <BearerAvatar bearer={bearer} size="sm" />
                  <div className="what"><div className="n truncate">{bearer?.name || 'onbekend'}</div></div>

                  {s.kind === 'shares' && (
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1"
                      aria-label={`Aantal delen voor ${bearer?.name}`}
                      style={{ width: 58, padding: '5px 8px', textAlign: 'right', fontSize: 14 }}
                      value={s.weights?.[key] ?? 1}
                      onChange={(e) => setWeight(key, Number(e.target.value))}
                    />
                  )}
                  {s.kind === 'percent' && (
                    <span className="row" style={{ gap: 4 }}>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        aria-label={`Percentage voor ${bearer?.name}`}
                        style={{ width: 58, padding: '5px 8px', textAlign: 'right', fontSize: 14 }}
                        value={s.weights?.[key] ?? 0}
                        onChange={(e) => setWeight(key, Number(e.target.value))}
                      />
                      <span className="tiny dim">%</span>
                    </span>
                  )}
                  {s.kind === 'amount' && (
                    <span style={{ width: 128 }}>
                      <AmountInput cents={s.weights?.[key] ?? 0} onChange={(c) => setWeight(key, c)} />
                    </span>
                  )}

                  {s.kind === 'amount' ? (
                    <Money cents={parts[key] || 0} />
                  ) : (
                    // Wanting to change one person's amount is how this starts,
                    // not "I would like a different division method". So the
                    // amount itself is the way in.
                    <button
                      type="button"
                      className="as-amount"
                      aria-label={`Bedrag voor ${bearer?.name} zelf invullen`}
                      onClick={() => setKind('amount')}
                    >
                      <Money cents={parts[key] || 0} />
                    </button>
                  )}
                </div>
              );
            })}

            <div className="box tight">
              <SplitBar parts={parts} bearerOf={bearerOf} />
            </div>
          </div>

          {s.kind === 'percent' && taking.length > 1 && percentTotal !== 100 && (
            <div className="hint warn">
              De percentages tellen op tot {percentTotal}%. Het bedrag wordt naar verhouding
              verdeeld, dus het klopt wel — maar waarschijnlijk bedoelde je 100.
            </div>
          )}
          {remainder !== 0 && (
            <div className="hint warn">
              Er blijft <Money cents={remainder} /> over, en dat ligt nu bij niemand. Verdelen doe
              je hier — een rekening kan niets dragen.
              {me && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="btn quiet sm"
                    style={{ marginTop: 7 }}
                    onClick={() =>
                      setWeight(me.id, (s.weights?.[me.id] ?? 0) + remainder)
                    }
                  >
                    Zet de rest op {me.name}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** The bar underneath: one block per bearer, proportional to the amount. */
function SplitBar({ parts, bearerOf }) {
  const total = Object.values(parts).reduce((sum, c) => sum + Math.abs(c), 0);
  if (!total) return null;
  return (
    <div className="split-bar">
      {Object.entries(parts).map(([key, cents]) => (
        <span
          key={key}
          style={{
            width: `${(Math.abs(cents) / total) * 100}%`,
            background: bearerOf(key)?.colour || 'var(--text-3)',
          }}
        />
      ))}
    </div>
  );
}
