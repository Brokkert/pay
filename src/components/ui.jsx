// Small building blocks that come back everywhere.

import { useEffect, useState } from 'react';
import { formatMoney, parseMoney, toInput } from '../lib/money.js';
import Icon from './icons.jsx';

export function Sheet({ title, onClose, children, actions = null }) {
  // Keep the background from scrolling along while the sheet is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          {actions}
          <button className="btn quiet icon" onClick={onClose} aria-label="Sluiten">
            <Icon name="close" size={19} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, warn = false, htmlFor = null, children }) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor || undefined}>{label}</label>}
      {children}
      {hint && <div className={`hint${warn ? ' warn' : ''}`}>{hint}</div>}
    </div>
  );
}

export const Notice = ({ tone = 'info', children }) => (
  <div className={`notice ${tone}`}>{children}</div>
);

export function Empty({ icon = 'empty', title, children }) {
  return (
    <div className="empty">
      <div className="art"><Icon name={icon} size={40} /></div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

/** An amount. Always mono with equal-width digits — see styles.css. */
export const Money = ({ cents, size = '', tone = '' }) => (
  <span className={`amount ${size} ${tone}`.trim()}>{formatMoney(cents)}</span>
);

/** A line with an amount: description on the left, number on the right. */
export const Line = ({ what, sub, cents, tone, left = null, right = null, onClick = null }) => {
  const body = (
    <>
      {left}
      <div className="what">
        <div className="n truncate">{what}</div>
        {sub && <div className="s truncate">{sub}</div>}
      </div>
      {cents != null && <Money cents={cents} tone={tone} />}
      {right}
    </>
  );
  // A line that explains itself when you tap it is still a line; it just has to
  // be a button so the keyboard and a screen reader can reach it too.
  return onClick ? (
    <button type="button" className="line tappable" onClick={onClick}>{body}</button>
  ) : (
    <div className="line">{body}</div>
  );
};

export const Total = ({ label, cents, tone }) => (
  <div className="total">
    <span className="k">{label}</span>
    <Money cents={cents} size="mid" tone={tone} />
  </div>
);

/** A person's initials, in their own colour. */
export function Avatar({ person, size = '' }) {
  const letters = (person?.name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <span
      className={`avatar ${size}`.trim()}
      style={person?.colour ? { background: person.colour } : undefined}
      title={person?.name}
    >
      {letters}
    </span>
  );
}

/** The badge of a bearer: initials for a person, a mark for an account. */
export function BearerAvatar({ bearer, size = '' }) {
  if (bearer?.account) {
    return (
      <span
        className={`avatar ${size}`.trim()}
        style={{ background: 'var(--text-2)', borderRadius: 7 }}
        title={bearer.name}
      >
        <Icon name="key" size={size === 'sm' ? 12 : 15} />
      </span>
    );
  }
  return <Avatar person={bearer} size={size} />;
}

export const NamedAvatar = ({ person, size = 'sm' }) => (
  <span className="row" style={{ gap: 7, minWidth: 0 }}>
    <Avatar person={person} size={size} />
    <span className="small truncate">{person?.name || 'onbekend'}</span>
  </span>
);

/** Input for an amount. Cents on the outside, text on the inside. */
export function AmountInput({ cents, onChange, autoFocus = false, placeholder = '0,00', id = null }) {
  // Zero is an empty field, not "0,00". Otherwise a new form already has
  // something in it that you have to clear, and in practice you type behind it.
  const asText = (c) => (c ? toInput(c) : '');
  const [text, setText] = useState(() => asText(cents));

  // Changed from the outside (another form opened): follow along. Not while
  // typing, or you could never enter a comma.
  useEffect(() => {
    setText((current) => ((parseMoney(current) ?? 0) === cents ? current : asText(cents)));
  }, [cents]);

  return (
    <div className="money-input">
      <span className="sign">€</span>
      <input
        id={id || undefined}
        className="input"
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseMoney(e.target.value) ?? 0);
        }}
        onBlur={() => setText(asText(parseMoney(text) ?? 0))}
      />
    </div>
  );
}

export function Confirm({ title, body, confirmLabel = 'Verwijderen', onConfirm, onClose }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="small muted" style={{ marginTop: 0, lineHeight: 1.6 }}>{body}</p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow" onClick={onClose}>Annuleren</button>
        <button className="btn danger grow" onClick={() => { onConfirm(); onClose(); }}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

/** Copies to the clipboard and reports whether it worked. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Without https or without permission: the old-fashioned way, via a textarea.
    const box = document.createElement('textarea');
    box.value = text;
    box.style.position = 'fixed';
    box.style.opacity = '0';
    document.body.appendChild(box);
    box.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    box.remove();
    return ok;
  }
}

export { Icon };
