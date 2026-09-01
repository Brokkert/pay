// Kleine bouwstenen die overal terugkomen.

import { useEffect, useState } from 'react';
import { toonGeld, parseGeld, alsInvoer } from '../lib/geld.js';
import Icoon from './icons.jsx';

export function Blad({ titel, onSluit, children, acties = null }) {
  // Achtergrond niet laten meescrollen zolang het paneel open staat.
  useEffect(() => {
    const vorige = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const opToets = (e) => e.key === 'Escape' && onSluit?.();
    window.addEventListener('keydown', opToets);
    return () => {
      document.body.style.overflow = vorige;
      window.removeEventListener('keydown', opToets);
    };
  }, [onSluit]);

  return (
    <div className="overlay" onClick={onSluit}>
      <div className="blad" onClick={(e) => e.stopPropagation()}>
        <div className="blad-greep" />
        <div className="blad-kop">
          <h2>{titel}</h2>
          {acties}
          <button className="knop stil icoon" onClick={onSluit} aria-label="Sluiten">
            <Icoon naam="kruis" maat={19} />
          </button>
        </div>
        <div className="blad-lijf">{children}</div>
      </div>
    </div>
  );
}

export function Veld({ label, tip, voor = null, let: letOp = false, children }) {
  return (
    <div className="veld">
      {label && <label htmlFor={voor || undefined}>{label}</label>}
      {children}
      {tip && <div className={`tip${letOp ? ' let' : ''}`}>{tip}</div>}
    </div>
  );
}

export const Melding = ({ toon = 'info', children }) => (
  <div className={`melding ${toon}`}>{children}</div>
);

export function Leeg({ icoon = 'leeg', titel, children }) {
  return (
    <div className="leeg">
      <div className="beeld"><Icoon naam={icoon} maat={40} /></div>
      <h3>{titel}</h3>
      <p>{children}</p>
    </div>
  );
}

/** Een bedrag. Altijd mono met cijfers van gelijke breedte — zie styles.css. */
export const Geld = ({ centen, maat = '', toon = '' }) => (
  <span className={`bedrag ${maat} ${toon}`.trim()}>{toonGeld(centen)}</span>
);

/** Regel met een bedrag: omschrijving links, getal rechts. */
export const Post = ({ wat, onder, centen, toon, links = null, rechts = null }) => (
  <div className="post">
    {links}
    <div className="wat">
      <div className="n kort">{wat}</div>
      {onder && <div className="s kort">{onder}</div>}
    </div>
    {centen != null && <Geld centen={centen} toon={toon} />}
    {rechts}
  </div>
);

export const Som = ({ label, centen, toon }) => (
  <div className="som">
    <span className="k">{label}</span>
    <Geld centen={centen} maat="mid" toon={toon} />
  </div>
);

/** Initialen van een persoon, in zijn eigen kleur. */
export function Wie({ persoon, maat = '' }) {
  const letters = (persoon?.naam || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((deel) => deel[0])
    .join('')
    .toUpperCase();
  return (
    <span
      className={`wie ${maat}`.trim()}
      style={persoon?.kleur ? { background: persoon.kleur } : undefined}
      title={persoon?.naam}
    >
      {letters}
    </span>
  );
}

/** Het rondje van een drager: initialen bij een persoon, een merkje bij een rekening. */
export function Drager({ drager, maat = '' }) {
  if (drager?.rekening) {
    return (
      <span
        className={`wie ${maat}`.trim()}
        style={{ background: 'var(--text-2)', borderRadius: 7 }}
        title={drager.naam}
      >
        <Icoon naam="sleutel" maat={maat === 'klein' ? 12 : 15} />
      </span>
    );
  }
  return <Wie persoon={drager} maat={maat} />;
}

export const WieMetNaam = ({ persoon, maat = 'klein' }) => (
  <span className="rij" style={{ gap: 7, minWidth: 0 }}>
    <Wie persoon={persoon} maat={maat} />
    <span className="klein kort">{persoon?.naam || 'onbekend'}</span>
  </span>
);

/** Invoerveld voor een bedrag. Werkt in centen naar buiten, tekst naar binnen. */
export function Bedrag({ centen, onChange, autoFocus = false, plaatshouder = '0,00' }) {
  // Nul is een leeg veld, geen "0,00". Anders staat er in een nieuw formulier al
  // iets waar je overheen moet, en typ je er in de praktijk achter.
  const alsTekst = (c) => (c ? alsInvoer(c) : '');
  const [tekst, setTekst] = useState(() => alsTekst(centen));

  // Van buitenaf gewijzigd (ander formulier geopend): veld meenemen. Tijdens het
  // typen niet, anders kun je geen komma zetten.
  useEffect(() => {
    setTekst((huidig) => ((parseGeld(huidig) ?? 0) === centen ? huidig : alsTekst(centen)));
  }, [centen]);

  return (
    <div className="euro">
      <span className="teken">€</span>
      <input
        className="invoer"
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={plaatshouder}
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

export function Bevestig({ titel, tekst, knop = 'Verwijderen', onJa, onSluit }) {
  return (
    <Blad titel={titel} onSluit={onSluit}>
      <p className="klein zacht" style={{ marginTop: 0, lineHeight: 1.6 }}>{tekst}</p>
      <div className="rij" style={{ gap: 8 }}>
        <button className="knop groei" onClick={onSluit}>Annuleren</button>
        <button className="knop gevaar groei" onClick={() => { onJa(); onSluit(); }}>{knop}</button>
      </div>
    </Blad>
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

export { Icoon };
