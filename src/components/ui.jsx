// Kleine bouwstenen die overal terugkomen.

import { useEffect, useState } from 'react';
import { toonGeld } from '../lib/geld.js';
import { parseGeld, alsInvoer } from '../lib/geld.js';

export function Sheet({ title, onClose, children, actions = null }) {
  // Achtergrond niet laten meescrollen zolang het paneel open staat.
  useEffect(() => {
    const vorige = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const opToets = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', opToets);
    return () => {
      document.body.style.overflow = vorige;
      window.removeEventListener('keydown', opToets);
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          {actions}
          <button className="btn ghost icon" onClick={onClose} aria-label="Sluiten">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export const Note = ({ tone = 'info', children }) => <div className={`note ${tone}`}>{children}</div>;

export function Empty({ art, title, children }) {
  return (
    <div className="empty">
      <div className="art">{art}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

/** Een bedrag. Altijd mono en rechts uitgelijnd — zie styles.css. */
export const Geld = ({ centen, maat = '', toon = 'neutraal', ...rest }) => (
  <span className={`geld ${maat} ${toon === 'neutraal' ? '' : toon}`} {...rest}>
    {toonGeld(centen)}
  </span>
);

/** Regel in het kasboek: omschrijving links, bedrag rechts. */
export const Boekregel = ({ wat, onder, centen, toon, achter = null }) => (
  <div className="boekregel">
    <div className="wat">
      <div className="small strong truncate">{wat}</div>
      {onder && <div className="tiny faint truncate">{onder}</div>}
    </div>
    <div className="vul" />
    {centen != null && <Geld centen={centen} toon={toon} />}
    {achter}
  </div>
);

export const Totaal = ({ label, centen, toon }) => (
  <div className="totaal">
    <span className="k">{label}</span>
    <span className="vul" />
    <Geld centen={centen} maat="mid" toon={toon} />
  </div>
);

export function Penning({ persoon, maat = '' }) {
  if (!persoon) return <span className={`penning ${maat}`}>?</span>;
  return (
    <span
      className={`penning ${maat}`}
      style={persoon.kleur ? { background: `${persoon.kleur}22`, borderColor: persoon.kleur } : undefined}
      title={persoon.naam}
    >
      {persoon.emoji || persoon.naam?.[0]?.toUpperCase() || '?'}
    </span>
  );
}

export const Wie = ({ persoon, maat = 'klein' }) => (
  <span className="row" style={{ gap: 6, minWidth: 0 }}>
    <Penning persoon={persoon} maat={maat} />
    <span className="small truncate">{persoon?.naam || 'onbekend'}</span>
  </span>
);

/** Invoerveld voor een bedrag. Werkt in centen naar buiten, tekst naar binnen. */
export function BedragVeld({ centen, onChange, autoFocus = false, placeholder = '0,00' }) {
  // Nul is een leeg veld, geen "0,00". Anders staat er in een nieuw formulier
  // al iets waar je overheen moet, en typ je er in de praktijk achter.
  const alsTekst = (c) => (c ? alsInvoer(c) : '');
  const [tekst, setTekst] = useState(() => alsTekst(centen));

  // Van buitenaf gewijzigd (ander formulier geopend): veld meenemen. Tijdens
  // het typen niet, anders kun je geen komma zetten.
  useEffect(() => {
    setTekst((huidig) => ((parseGeld(huidig) ?? 0) === centen ? huidig : alsTekst(centen)));
  }, [centen]);

  return (
    <div className="bedragveld">
      <span className="teken">€</span>
      <input
        className="input geld"
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={tekst}
        onChange={(e) => {
          setTekst(e.target.value);
          onChange(parseGeld(e.target.value) ?? 0);
        }}
        onBlur={() => setTekst(alsTekst(parseGeld(tekst) ?? 0))}
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

/** Kopieert naar het klembord en geeft terug of het lukte. */
export async function kopieer(tekst) {
  try {
    await navigator.clipboard.writeText(tekst);
    return true;
  } catch {
    // Zonder https of zonder toestemming: ouderwets via een tekstveld.
    const vak = document.createElement('textarea');
    vak.value = tekst;
    vak.style.position = 'fixed';
    vak.style.opacity = '0';
    document.body.appendChild(vak);
    vak.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    vak.remove();
    return ok;
  }
}
