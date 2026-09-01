// Een post aanmaken of wijzigen.

import { useState } from 'react';
import { Sheet, Field, Note, BedragVeld, Penning, Confirm } from './ui.jsx';
import VerdeelKiezer from './VerdeelKiezer.jsx';
import { RITMES } from '../lib/ritme.js';
import { CATEGORIEEN, soortVan } from '../data/categorieen.js';

const leegPost = (mij) => ({
  naam: '',
  bedrag: 0,
  ritme: 'maand',
  categorie: 'overig',
  betaler: { soort: 'rekening', id: null },
  verdeling: { soort: 'gelijk', deelnemers: mij ? [mij] : [], gewichten: {} },
  vanaf: '',
  tot: '',
  gepauzeerd: false,
  zakelijk: false,
  notitie: '',
});

export default function PostForm({ post, personen, rekeningen, onBewaar, onVerwijder, onClose }) {
  const mij = personen.find((p) => p.is_mij)?.id;
  const [concept, setConcept] = useState(() => ({ ...leegPost(mij), ...post }));
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState(null);
  const [vraagVerwijderen, setVraagVerwijderen] = useState(false);
  const zet = (patch) => setConcept((c) => ({ ...c, ...patch }));

  const betalerGekozen = Boolean(concept.betaler?.id);
  const kanBewaren = concept.naam.trim() && concept.bedrag > 0 && betalerGekozen;

  const bewaren = async () => {
    setBezig(true);
    setFout(null);
    try {
      await onBewaar({ ...concept, naam: concept.naam.trim() });
      onClose();
    } catch (err) {
      setFout(err.message || String(err));
      setBezig(false);
    }
  };

  return (
    <Sheet title={post?.id ? 'Post wijzigen' : 'Nieuwe post'} onClose={onClose}>
      {fout && <Note tone="bad">{fout}</Note>}

      <Field label="Wat is het">
        <input
          className="input"
          autoFocus
          placeholder="Huur, Netflix, autoverzekering…"
          value={concept.naam}
          onChange={(e) => zet({ naam: e.target.value })}
        />
      </Field>

      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <div className="grow">
          <Field label="Bedrag">
            <BedragVeld centen={concept.bedrag} onChange={(c) => zet({ bedrag: c })} />
          </Field>
        </div>
        <div style={{ width: 150 }}>
          <Field label="Hoe vaak">
            <select
              className="select"
              value={concept.ritme}
              onChange={(e) => zet({ ritme: e.target.value })}
            >
              {RITMES.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <Field
        label="Wie betaalt het echt"
        hint="De rekening waar het daadwerkelijk van afgeschreven wordt. Dat hoeft niet dezelfde te zijn als wie het uiteindelijk draagt — daar is de verdeling hieronder voor."
      >
        <div className="chips">
          {rekeningen.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`chip${concept.betaler?.soort === 'rekening' && concept.betaler.id === r.id ? ' on' : ''}`}
              onClick={() => zet({ betaler: { soort: 'rekening', id: r.id } })}
            >
              {r.emoji || soortVan(r.soort).emoji} {r.naam}
            </button>
          ))}
        </div>
        <div className="tiny faint" style={{ margin: '10px 0 6px' }}>
          Of iemand anders betaalt het en jij doet mee:
        </div>
        <div className="chips">
          {personen.filter((p) => !p.is_mij).map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chip${concept.betaler?.soort === 'persoon' && concept.betaler.id === p.id ? ' on' : ''}`}
              onClick={() => zet({ betaler: { soort: 'persoon', id: p.id } })}
            >
              <Penning persoon={p} maat="klein" /> {p.naam}
            </button>
          ))}
        </div>
      </Field>

      <VerdeelKiezer
        bedrag={concept.bedrag}
        ritme={concept.ritme}
        verdeling={concept.verdeling}
        personen={personen}
        onChange={(verdeling) => zet({ verdeling })}
      />

      <Field label="Categorie">
        <select
          className="select"
          value={concept.categorie}
          onChange={(e) => zet({ categorie: e.target.value })}
        >
          {CATEGORIEEN.map((c) => (
            <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
          ))}
        </select>
      </Field>

      <details className="fallback" style={{ marginBottom: 14 }}>
        <summary>Looptijd, notitie en zakelijk</summary>
        <div style={{ marginTop: 12 }}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div className="grow">
              <Field label="Loopt vanaf" hint="Leeg = loopt al">
                <input
                  className="input"
                  type="date"
                  value={concept.vanaf || ''}
                  onChange={(e) => zet({ vanaf: e.target.value })}
                />
              </Field>
            </div>
            <div className="grow">
              <Field label="Loopt tot" hint="Leeg = doorlopend">
                <input
                  className="input"
                  type="date"
                  value={concept.tot || ''}
                  onChange={(e) => zet({ tot: e.target.value })}
                />
              </Field>
            </div>
          </div>

          <Field label="Notitie">
            <textarea
              className="textarea"
              placeholder="Opzegtermijn, klantnummer, wat je ook wilt onthouden."
              value={concept.notitie || ''}
              onChange={(e) => zet({ notitie: e.target.value })}
            />
          </Field>

          <label className="row" style={{ gap: 9, marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={Boolean(concept.zakelijk)}
              onChange={(e) => zet({ zakelijk: e.target.checked })}
            />
            <span className="small">Zakelijk — apart optellen voor de boekhouding</span>
          </label>

          <label className="row" style={{ gap: 9 }}>
            <input
              type="checkbox"
              checked={Boolean(concept.gepauzeerd)}
              onChange={(e) => zet({ gepauzeerd: e.target.checked })}
            />
            <span className="small">Even gepauzeerd — telt tijdelijk niet mee</span>
          </label>
        </div>
      </details>

      <div className="row" style={{ gap: 8 }}>
        {post?.id && (
          <button className="btn danger" onClick={() => setVraagVerwijderen(true)}>Verwijderen</button>
        )}
        <button className="btn primary grow" disabled={!kanBewaren || bezig} onClick={bewaren}>
          {bezig ? <span className="spinner" /> : 'Bewaren'}
        </button>
      </div>
      {!kanBewaren && (
        <div className="hint">Een naam, een bedrag en een betalende rekening zijn het minimum.</div>
      )}

      {vraagVerwijderen && (
        <Confirm
          title={`"${concept.naam}" verwijderen?`}
          body="De post verdwijnt uit alle overzichten en berekeningen. Wil je hem alleen tijdelijk stopzetten, gebruik dan 'gepauzeerd' of vul een einddatum in."
          onConfirm={() => { onVerwijder(post.id); onClose(); }}
          onClose={() => setVraagVerwijderen(false)}
        />
      )}
    </Sheet>
  );
}
