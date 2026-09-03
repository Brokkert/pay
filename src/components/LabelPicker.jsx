// Picking a label: a category, or a charge.
//
// Both are the same thing mechanically — a name you put on an expense, shared
// with the other expenses that carry it — and they differ only in what they
// answer. So they get the same control, and the difference lives in the words
// above it instead of in two kinds of field.
//
// The names on offer are the ones already in use. Picking from them is what
// keeps "Verzekeringspakket" and "Verzekeringpakket" from quietly becoming two.

import { useState } from 'react';
import { Field, Icon } from './ui.jsx';

export default function LabelPicker({
  label,
  hint,
  icon,
  known,
  suggestions = [],
  value,
  placeholder,
  clearable = true,
  onChange,
}) {
  const [naming, setNaming] = useState(() => Boolean(value) && !known.includes(value));

  return (
    <Field label={label} hint={hint}>
      <div className="chips">
        {/* Tapping the chosen one again also lets go of it, but nothing on
            screen says so. A choice you can decline needs somewhere to say no. */}
        {clearable && (
          <button
            type="button"
            className={`chip${value ? '' : ' on'}`}
            onClick={() => {
              setNaming(false);
              onChange('');
            }}
          >
            Geen
          </button>
        )}
        {known.map((name) => (
          <button
            key={name}
            type="button"
            className={`chip${value === name ? ' on' : ''}`}
            onClick={() => {
              setNaming(false);
              onChange(value === name && clearable ? '' : name);
            }}
          >
            <Icon name={icon} size={14} /> {name}
          </button>
        ))}
        <button
          type="button"
          className={`chip${naming ? ' on' : ''}`}
          onClick={() => {
            setNaming(true);
            if (known.includes(value)) onChange('');
          }}
        >
          <Icon name="plus" size={14} /> Nieuwe
        </button>
      </div>
      {naming && (
        <>
          <input
            className="input"
            style={{ marginTop: 9 }}
            autoFocus
            placeholder={placeholder}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          />
          {/* Suggestions belong to making a new one, not to the row you pick
              from every day. Once you have your own names, a starter set among
              them is just a list of things you never chose. */}
          {suggestions.length > 0 && (
            <div className="chips" style={{ marginTop: 9 }}>
              {suggestions.map((name) => (
                <button key={name} type="button" className="chip quiet" onClick={() => onChange(name)}>
                  {name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Field>
  );
}
