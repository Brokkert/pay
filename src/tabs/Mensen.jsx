// Personen en rekeningen. De twee dingen waar alle berekeningen op leunen.

import { useState } from 'react';
import { Sheet, Field, Note, Penning, BedragVeld, Confirm, Totaal, Geld } from '../components/ui.jsx';
import { SOORTEN_REKENING, soortVan, KLEUREN, EMOJI_KEUZE } from '../data/categorieen.js';

export default function Mensen({ kasboek }) {
  const { personen, rekeningen, bewaar, verwijder, claim, cloud } = kasboek;
  const [persoon, setPersoon] = useState(null);
  const [rekening, setRekening] = useState(null);

  return (
    <>
      <div className="section-title">Personen</div>
      {!personen.length && (
        <Note tone="info">
          Voeg jezelf toe, je vriendin, en iedereen met wie je iets deelt. Vrienden hoeven geen
          account te hebben — je houdt gewoon bij wat er tussen jullie loopt.
        </Note>
      )}
      {personen.map((p) => (
        <button key={p.id} className="card pressable tight" onClick={() => setPersoon(p)}>
          <div className="row">
            <Penning persoon={p} maat="groot" />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="strong truncate">{p.naam}</div>
              <div className="tiny faint">
                {p.is_mij ? 'dat ben jij' : p.gekoppeld_aan ? 'heeft een eigen account' : 'geen account'}
              </div>
            </div>
            <span className="faint">›</span>
          </div>
        </button>
      ))}
      <button className="btn wide" onClick={() => setPersoon({})} style={{ marginTop: 4 }}>
        + Persoon toevoegen
      </button>

      <div className="section-title">Rekeningen</div>
      {!rekeningen.length && (
        <Note tone="info">
          Een rekening is waar het geld daadwerkelijk vanaf gaat. Maak er in elk geval één
          gezamenlijke aan als jullie een gedeelde pot hebben.
        </Note>
      )}
      {rekeningen.map((r) => {
        const soort = soortVan(r.soort);
        const eigenaar = personen.find((p) => p.id === r.eigenaar_id);
        const inleg = Object.values(r.stortingen || {}).reduce((s, c) => s + (Number(c) || 0), 0);
        return (
          <button key={r.id} className="card pressable tight" onClick={() => setRekening(r)}>
            <div className="row">
              <span className="penning groot">{r.emoji || soort.emoji}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="strong truncate">{r.naam}</div>
                <div className="tiny faint truncate">
                  {soort.label}
                  {r.soort === 'gezamenlijk'
                    ? ` · ${(r.deelnemers || []).length} deelnemers`
                    : eigenaar ? ` · van ${eigenaar.naam}` : ' · geen eigenaar'}
                </div>
              </div>
              {inleg > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <Geld centen={inleg} />
                  <div className="tiny faint">inleg /mnd</div>
                </div>
              )}
              <span className="faint">›</span>
            </div>
          </button>
        );
      })}
      <button className="btn wide" onClick={() => setRekening({})} style={{ marginTop: 4 }}>
        + Rekening toevoegen
      </button>

      {persoon && (
        <PersoonForm
          persoon={persoon}
          personen={personen}
          cloud={cloud}
          onClaim={claim}
          onBewaar={(rij) => bewaar('personen', rij)}
          onVerwijder={(id) => verwijder('personen', id)}
          onClose={() => setPersoon(null)}
        />
      )}
      {rekening && (
        <RekeningForm
          rekening={rekening}
          personen={personen}
          onBewaar={(rij) => bewaar('rekeningen', rij)}
          onVerwijder={(id) => verwijder('rekeningen', id)}
          onClose={() => setRekening(null)}
        />
      )}
    </>
  );
}

function PersoonForm({ persoon, personen, cloud, onClaim, onBewaar, onVerwijder, onClose }) {
  const [concept, setConcept] = useState(() => ({
    naam: '', emoji: '🙂', kleur: KLEUREN[personen.length % KLEUREN.length], is_mij: false, ...persoon,
  }));
  const [fout, setFout] = useState(null);
  const [vraag, setVraag] = useState(false);
  const zet = (patch) => setConcept((c) => ({ ...c, ...patch }));
  const alIemandIk = personen.some((p) => p.is_mij && p.id !== persoon.id);

  const bewaren = async () => {
    try {
      await onBewaar({ ...concept, naam: concept.naam.trim() });
      onClose();
    } catch (err) {
      setFout(err.message || String(err));
    }
  };

  return (
    <Sheet title={persoon.id ? 'Persoon wijzigen' : 'Nieuwe persoon'} onClose={onClose}>
      {fout && <Note tone="bad">{fout}</Note>}

      <Field label="Naam">
        <input
          className="input"
          autoFocus
          value={concept.naam}
          onChange={(e) => zet({ naam: e.target.value })}
        />
      </Field>

      <Field label="Poppetje">
        <div className="chips">
          {EMOJI_KEUZE.map((e) => (
            <button
              key={e}
              type="button"
              className={`chip${concept.emoji === e ? ' on' : ''}`}
              onClick={() => zet({ emoji: e })}
            >
              {e}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Kleur" hint="Waar je deze persoon aan herkent in de verdeelbalkjes.">
        <div className="chips">
          {KLEUREN.map((k) => (
            <button
              key={k}
              type="button"
              className={`chip${concept.kleur === k ? ' on' : ''}`}
              onClick={() => zet({ kleur: k })}
              style={{ background: `${k}33`, borderColor: concept.kleur === k ? k : undefined }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 999, background: k, display: 'inline-block' }} />
            </button>
          ))}
        </div>
      </Field>

      {cloud ? (
        persoon.id && (
          <div className="card tight" style={{ marginBottom: 14 }}>
            {concept.is_mij ? (
              <div className="small">✓ Dit ben jij — gekoppeld aan je account.</div>
            ) : (
              <>
                <div className="small">
                  {concept.gekoppeld_aan
                    ? 'Deze persoon heeft een eigen account.'
                    : 'Deze persoon heeft geen account.'}
                </div>
                {!concept.gekoppeld_aan && (
                  <button
                    className="btn sm"
                    style={{ marginTop: 8 }}
                    onClick={async () => {
                      try {
                        await onClaim(persoon.id);
                        onClose();
                      } catch (err) {
                        setFout(err.message || String(err));
                      }
                    }}
                  >
                    Dit ben ik
                  </button>
                )}
              </>
            )}
          </div>
        )
      ) : (
        <label className="row" style={{ gap: 9, marginBottom: 14 }}>
          <input
            type="checkbox"
            checked={Boolean(concept.is_mij)}
            disabled={alIemandIk && !concept.is_mij}
            onChange={(e) => zet({ is_mij: e.target.checked })}
          />
          <span className="small">
            Dit ben ik
            {alIemandIk && !concept.is_mij && (
              <span className="faint"> — al aan iemand anders toegekend</span>
            )}
          </span>
        </label>
      )}

      <div className="row" style={{ gap: 8 }}>
        {persoon.id && (
          <button className="btn danger" onClick={() => setVraag(true)}>Verwijderen</button>
        )}
        <button className="btn primary grow" disabled={!concept.naam.trim()} onClick={bewaren}>
          Bewaren
        </button>
      </div>

      {vraag && (
        <Confirm
          title={`${concept.naam} verwijderen?`}
          body="Posten waarin deze persoon meedeelt blijven bestaan, maar zijn aandeel verdwijnt uit de berekening. Loop de betreffende posten daarna even na."
          onConfirm={() => { onVerwijder(persoon.id); onClose(); }}
          onClose={() => setVraag(false)}
        />
      )}
    </Sheet>
  );
}

function RekeningForm({ rekening, personen, onBewaar, onVerwijder, onClose }) {
  const [concept, setConcept] = useState(() => ({
    naam: '', soort: 'gezamenlijk', eigenaar_id: null, deelnemers: [], stortingen: {}, iban: '', emoji: '', ...rekening,
  }));
  const [fout, setFout] = useState(null);
  const [vraag, setVraag] = useState(false);
  const zet = (patch) => setConcept((c) => ({ ...c, ...patch }));

  const gezamenlijk = concept.soort === 'gezamenlijk';
  const deelnemers = concept.deelnemers || [];
  const inleg = Object.values(concept.stortingen || {}).reduce((s, c) => s + (Number(c) || 0), 0);

  const wisselDeelnemer = (id) =>
    zet({ deelnemers: deelnemers.includes(id) ? deelnemers.filter((x) => x !== id) : [...deelnemers, id] });

  const bewaren = async () => {
    try {
      // Stortingen van wie niet meer meedoet horen niet mee te reizen.
      const stortingen = Object.fromEntries(
        Object.entries(concept.stortingen || {}).filter(([id]) => deelnemers.includes(id))
      );
      await onBewaar({
        ...concept,
        naam: concept.naam.trim(),
        deelnemers: gezamenlijk ? deelnemers : [],
        stortingen: gezamenlijk ? stortingen : {},
        eigenaar_id: gezamenlijk ? null : concept.eigenaar_id,
      });
      onClose();
    } catch (err) {
      setFout(err.message || String(err));
    }
  };

  const kanBewaren = concept.naam.trim() && (gezamenlijk ? deelnemers.length > 0 : concept.eigenaar_id);

  return (
    <Sheet title={rekening.id ? 'Rekening wijzigen' : 'Nieuwe rekening'} onClose={onClose}>
      {fout && <Note tone="bad">{fout}</Note>}

      <Field label="Naam">
        <input
          className="input"
          autoFocus
          placeholder="Gezamenlijk, Privé, Zaak…"
          value={concept.naam}
          onChange={(e) => zet({ naam: e.target.value })}
        />
      </Field>

      <Field label="Wat voor rekening">
        <div className="col">
          {SOORTEN_REKENING.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`chip${concept.soort === s.id ? ' on' : ''}`}
              style={{ justifyContent: 'flex-start', textAlign: 'left', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}
              onClick={() => zet({ soort: s.id })}
            >
              <span>{s.emoji}</span>
              <span>
                <span className="strong">{s.label}</span>
                <span className="tiny faint" style={{ display: 'block', marginTop: 2 }}>{s.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </Field>

      {gezamenlijk ? (
        <>
          <Field label="Wie storten erop">
            <div className="chips">
              {personen.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`chip${deelnemers.includes(p.id) ? ' on' : ''}`}
                  onClick={() => wisselDeelnemer(p.id)}
                >
                  <Penning persoon={p} maat="klein" /> {p.naam}
                </button>
              ))}
            </div>
          </Field>

          {deelnemers.length > 0 && (
            <Field
              label="Vaste inleg per maand"
              hint="Wat er nu daadwerkelijk maandelijks op gestort wordt. Pay zet dat naast het werkelijke aandeel, zodat je ziet of de pot uitkomt. Laat leeg als jullie precies het aandeel overmaken."
            >
              <div className="card tight" style={{ marginBottom: 0 }}>
                {deelnemers.map((id) => {
                  const p = personen.find((x) => x.id === id);
                  return (
                    <div key={id} className="boekregel">
                      <div className="wat row" style={{ gap: 7 }}>
                        <Penning persoon={p} maat="klein" />
                        <span className="small">{p?.naam}</span>
                      </div>
                      <div className="vul" />
                      <div style={{ width: 140 }}>
                        <BedragVeld
                          centen={concept.stortingen?.[id] || 0}
                          onChange={(c) => zet({ stortingen: { ...(concept.stortingen || {}), [id]: c } })}
                        />
                      </div>
                    </div>
                  );
                })}
                <Totaal label="Samen per maand" centen={inleg} />
              </div>
            </Field>
          )}
        </>
      ) : (
        <Field label="Van wie is deze rekening">
          <div className="chips">
            {personen.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`chip${concept.eigenaar_id === p.id ? ' on' : ''}`}
                onClick={() => zet({ eigenaar_id: p.id })}
              >
                <Penning persoon={p} maat="klein" /> {p.naam}
              </button>
            ))}
          </div>
          <div className="hint">
            Wat anderen meegebruiken van deze rekening, staat bij deze persoon in het krijt.
          </div>
        </Field>
      )}

      <details className="fallback" style={{ marginBottom: 14 }}>
        <summary>Rekeningnummer en icoon</summary>
        <div style={{ marginTop: 12 }}>
          <Field label="IBAN" hint="Alleen om over te tikken bij het overmaken. Blijft in je eigen huishouden.">
            <input
              className="input"
              placeholder="NL00 BANK 0000 0000 00"
              value={concept.iban || ''}
              onChange={(e) => zet({ iban: e.target.value })}
            />
          </Field>
          <Field label="Icoon">
            <input
              className="input"
              placeholder={soortVan(concept.soort).emoji}
              maxLength={4}
              value={concept.emoji || ''}
              onChange={(e) => zet({ emoji: e.target.value })}
            />
          </Field>
        </div>
      </details>

      <div className="row" style={{ gap: 8 }}>
        {rekening.id && (
          <button className="btn danger" onClick={() => setVraag(true)}>Verwijderen</button>
        )}
        <button className="btn primary grow" disabled={!kanBewaren} onClick={bewaren}>Bewaren</button>
      </div>
      {!kanBewaren && (
        <div className="hint">
          {gezamenlijk ? 'Kies minstens één deelnemer.' : 'Kies van wie deze rekening is.'}
        </div>
      )}

      {vraag && (
        <Confirm
          title={`${concept.naam} verwijderen?`}
          body="Posten die van deze rekening afgingen houden geen betaler meer over en tellen dan niet mee. Pay waarschuwt daar wel over op het overzicht."
          onConfirm={() => { onVerwijder(rekening.id); onClose(); }}
          onClose={() => setVraag(false)}
        />
      )}
    </Sheet>
  );
}
