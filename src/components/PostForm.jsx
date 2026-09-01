// Een post aanmaken of wijzigen.

import { useState } from 'react';
import { Blad, Veld, Melding, Bedrag, Wie, Bevestig } from './ui.jsx';
import VerdeelKiezer from './VerdeelKiezer.jsx';
import { RITMES } from '../lib/ritme.js';
import { CATEGORIEEN } from '../data/categorieen.js';

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
  bundel: '',
  notitie: '',
});

export default function PostForm({ post, personen, rekeningen, bundels = [], onBewaar, onVerwijder, onSluit }) {
  const mij = personen.find((p) => p.is_mij)?.id;
  const [concept, setConcept] = useState(() => ({ ...leegPost(mij), ...post }));
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState(null);
  const [vraag, setVraag] = useState(false);
  const zet = (patch) => setConcept((c) => ({ ...c, ...patch }));

  const kanBewaren = concept.naam.trim() && concept.bedrag > 0 && Boolean(concept.betaler?.id);

  const bewaren = async () => {
    setBezig(true);
    setFout(null);
    try {
      await onBewaar({ ...concept, naam: concept.naam.trim() });
      onSluit();
    } catch (err) {
      setFout(err.message || String(err));
      setBezig(false);
    }
  };

  return (
    <Blad titel={post?.id ? 'Post wijzigen' : 'Nieuwe post'} onSluit={onSluit}>
      {fout && <Melding toon="mis">{fout}</Melding>}

      <Veld label="Wat is het">
        <input
          className="invoer"
          autoFocus
          placeholder="Gas/Stroom, YouTube Family, zorgverzekering…"
          value={concept.naam}
          onChange={(e) => zet({ naam: e.target.value })}
        />
      </Veld>

      <div className="rij" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="groei">
          <Veld label="Bedrag">
            <Bedrag centen={concept.bedrag} onChange={(c) => zet({ bedrag: c })} />
          </Veld>
        </div>
        <div style={{ width: 148 }}>
          <Veld label="Hoe vaak">
            <select className="keuze" value={concept.ritme} onChange={(e) => zet({ ritme: e.target.value })}>
              {RITMES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </Veld>
        </div>
      </div>

      <Veld
        label="Waar gaat het vanaf"
        tip="De rekening waar het daadwerkelijk van afgeschreven wordt. Dat hoeft niet dezelfde te zijn als wie het uiteindelijk draagt — daar is de verdeling hieronder voor."
      >
        <div className="blokjes">
          {rekeningen.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`blokje${concept.betaler?.soort === 'rekening' && concept.betaler.id === r.id ? ' aan' : ''}`}
              onClick={() => zet({ betaler: { soort: 'rekening', id: r.id } })}
            >
              {r.naam}
            </button>
          ))}
        </div>
        {personen.filter((p) => !p.is_mij).length > 0 && (
          <>
            <div className="mini vaag" style={{ margin: '12px 0 7px' }}>
              Of iemand anders betaalt het en jij doet mee:
            </div>
            <div className="blokjes">
              {personen.filter((p) => !p.is_mij).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`blokje${concept.betaler?.soort === 'persoon' && concept.betaler.id === p.id ? ' aan' : ''}`}
                  onClick={() => zet({ betaler: { soort: 'persoon', id: p.id } })}
                >
                  <Wie persoon={p} maat="klein" /> {p.naam}
                </button>
              ))}
            </div>
          </>
        )}
      </Veld>

      <VerdeelKiezer
        bedrag={concept.bedrag}
        ritme={concept.ritme}
        verdeling={concept.verdeling}
        personen={personen}
        onChange={(verdeling) => zet({ verdeling })}
      />

      <Veld label="Categorie">
        <select className="keuze" value={concept.categorie} onChange={(e) => zet({ categorie: e.target.value })}>
          {CATEGORIEEN.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Veld>

      <Veld
        label="Incasso"
        tip="Staat deze post samen met andere op één afschrijving? Geef die afschrijving dan een naam, dan telt Pay ze bij elkaar op — handig om tegen je bankafschrift te houden. Leeg laten mag."
      >
        <input
          className="invoer"
          list="pay-bundels"
          placeholder="Verzekeringspakket, VGZ…"
          value={concept.bundel || ''}
          onChange={(e) => zet({ bundel: e.target.value })}
        />
        <datalist id="pay-bundels">
          {bundels.map((b) => <option key={b} value={b} />)}
        </datalist>
      </Veld>

      <details className="uitklap" style={{ marginBottom: 18 }}>
        <summary>Looptijd, notitie en zakelijk</summary>
        <div style={{ marginTop: 16 }}>
          <div className="rij" style={{ gap: 12, alignItems: 'flex-start' }}>
            <div className="groei">
              <Veld label="Loopt vanaf" tip="Leeg = loopt al">
                <input className="invoer" type="date" value={concept.vanaf || ''}
                  onChange={(e) => zet({ vanaf: e.target.value })} />
              </Veld>
            </div>
            <div className="groei">
              <Veld label="Loopt tot" tip="Leeg = doorlopend">
                <input className="invoer" type="date" value={concept.tot || ''}
                  onChange={(e) => zet({ tot: e.target.value })} />
              </Veld>
            </div>
          </div>

          <Veld label="Notitie">
            <textarea
              className="tekstvak"
              placeholder="Opzegtermijn, klantnummer, op welke incasso hij meelift — wat je ook wilt onthouden."
              value={concept.notitie || ''}
              onChange={(e) => zet({ notitie: e.target.value })}
            />
          </Veld>

          <label className="rij" style={{ gap: 10, marginBottom: 12 }}>
            <input type="checkbox" checked={Boolean(concept.zakelijk)}
              onChange={(e) => zet({ zakelijk: e.target.checked })} />
            <span className="klein">Zakelijk — apart optellen voor de boekhouding</span>
          </label>

          <label className="rij" style={{ gap: 10 }}>
            <input type="checkbox" checked={Boolean(concept.gepauzeerd)}
              onChange={(e) => zet({ gepauzeerd: e.target.checked })} />
            <span className="klein">Even gepauzeerd — telt tijdelijk niet mee</span>
          </label>
        </div>
      </details>

      <div className="rij" style={{ gap: 8 }}>
        {post?.id && <button className="knop gevaar" onClick={() => setVraag(true)}>Verwijderen</button>}
        <button className="knop hoofd groei" disabled={!kanBewaren || bezig} onClick={bewaren}>
          {bezig ? <span className="draai" /> : 'Bewaren'}
        </button>
      </div>
      {!kanBewaren && (
        <div className="tip">Een naam, een bedrag en een rekening waar het vanaf gaat zijn het minimum.</div>
      )}

      {vraag && (
        <Bevestig
          titel={`"${concept.naam}" verwijderen?`}
          tekst="De post verdwijnt uit alle overzichten en berekeningen. Wil je hem alleen tijdelijk stopzetten, gebruik dan 'gepauzeerd' of vul een einddatum in."
          onJa={() => { onVerwijder(post.id); onSluit(); }}
          onSluit={() => setVraag(false)}
        />
      )}
    </Blad>
  );
}
