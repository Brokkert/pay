// Personen en rekeningen. De twee dingen waar alle berekeningen op leunen.

import { useState } from 'react';
import { Blad, Veld, Melding, Wie, Bedrag, Bevestig, Som, Geld, Icoon } from '../components/ui.jsx';
import { SOORTEN_REKENING, soortVan, KLEUREN } from '../data/categorieen.js';

export default function Mensen({ kasboek }) {
  const { personen, rekeningen, bewaar, verwijder, claim, cloud } = kasboek;
  const [persoon, setPersoon] = useState(null);
  const [rekening, setRekening] = useState(null);

  return (
    <>
      <div className="kop">Personen</div>
      {!personen.length && (
        <Melding toon="info">
          Voeg jezelf toe, je vriendin, en iedereen met wie je iets deelt. Vrienden hoeven geen
          account te hebben — je houdt gewoon bij wat er tussen jullie loopt.
        </Melding>
      )}
      {personen.length > 0 && (
        <div className="paneel">
          {personen.map((p) => (
            <button key={p.id} className="regel" onClick={() => setPersoon(p)}>
              <Wie persoon={p} maat="groot" />
              <span className="mid">
                <span className="titel kort" style={{ display: 'block' }}>{p.naam}</span>
                <span className="onder" style={{ display: 'block' }}>
                  {p.is_mij ? 'dat ben jij' : p.gekoppeld_aan ? 'heeft een eigen account' : 'geen account'}
                </span>
              </span>
              <span className="pijltje"><Icoon naam="rechts" maat={16} /></span>
            </button>
          ))}
        </div>
      )}
      <button className="knop breed" onClick={() => setPersoon({})}>
        <Icoon naam="plus" maat={16} /> Persoon toevoegen
      </button>

      <div className="kop">Rekeningen</div>
      {!rekeningen.length && (
        <Melding toon="info">
          Een rekening is waar het geld daadwerkelijk vanaf gaat. Maak er in elk geval één
          gezamenlijke aan als jullie een gedeelde pot hebben.
        </Melding>
      )}
      {rekeningen.length > 0 && (
        <div className="paneel">
          {rekeningen.map((r) => {
            const soort = soortVan(r.soort);
            const eigenaar = personen.find((p) => p.id === r.eigenaar_id);
            const inleg = Object.values(r.stortingen || {}).reduce((s, c) => s + (Number(c) || 0), 0);
            return (
              <button key={r.id} className="regel" onClick={() => setRekening(r)}>
                <span className="mid">
                  <span className="titel kort" style={{ display: 'block' }}>{r.naam}</span>
                  <span className="onder kort" style={{ display: 'block' }}>
                    {soort.label}
                    {r.soort === 'gezamenlijk'
                      ? ` · ${(r.deelnemers || []).length} deelnemers`
                      : eigenaar ? ` · van ${eigenaar.naam}` : ' · geen eigenaar'}
                  </span>
                </span>
                {inleg > 0 && (
                  <span className="rechts">
                    <Geld centen={inleg} />
                    <span className="onder" style={{ display: 'block' }}>inleg /mnd</span>
                  </span>
                )}
                <span className="pijltje"><Icoon naam="rechts" maat={16} /></span>
              </button>
            );
          })}
        </div>
      )}
      <button className="knop breed" onClick={() => setRekening({})}>
        <Icoon naam="plus" maat={16} /> Rekening toevoegen
      </button>

      {persoon && (
        <PersoonForm
          persoon={persoon}
          personen={personen}
          cloud={cloud}
          onClaim={claim}
          onBewaar={(rij) => bewaar('personen', rij)}
          onVerwijder={(id) => verwijder('personen', id)}
          onSluit={() => setPersoon(null)}
        />
      )}
      {rekening && (
        <RekeningForm
          rekening={rekening}
          personen={personen}
          onBewaar={(rij) => bewaar('rekeningen', rij)}
          onVerwijder={(id) => verwijder('rekeningen', id)}
          onSluit={() => setRekening(null)}
        />
      )}
    </>
  );
}

function PersoonForm({ persoon, personen, cloud, onClaim, onBewaar, onVerwijder, onSluit }) {
  const [concept, setConcept] = useState(() => ({
    naam: '',
    kleur: KLEUREN[personen.length % KLEUREN.length],
    is_mij: false,
    ...persoon,
  }));
  const [fout, setFout] = useState(null);
  const [vraag, setVraag] = useState(false);
  const zet = (patch) => setConcept((c) => ({ ...c, ...patch }));
  const alIemandIk = personen.some((p) => p.is_mij && p.id !== persoon.id);

  const bewaren = async () => {
    try {
      await onBewaar({ ...concept, naam: concept.naam.trim() });
      onSluit();
    } catch (err) {
      setFout(err.message || String(err));
    }
  };

  return (
    <Blad titel={persoon.id ? 'Persoon wijzigen' : 'Nieuwe persoon'} onSluit={onSluit}>
      {fout && <Melding toon="mis">{fout}</Melding>}

      <div className="rij" style={{ gap: 14, marginBottom: 18 }}>
        <Wie persoon={concept} maat="groot" />
        <div className="groei">
          <input
            className="invoer"
            autoFocus
            placeholder="Naam"
            aria-label="Naam"
            value={concept.naam}
            onChange={(e) => zet({ naam: e.target.value })}
          />
        </div>
      </div>

      <Veld label="Kleur" tip="Waar je deze persoon aan herkent in de lijsten en balkjes.">
        <div className="blokjes">
          {KLEUREN.map((k) => (
            <button
              key={k}
              type="button"
              aria-label={`Kleur ${k}`}
              onClick={() => zet({ kleur: k })}
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: k,
                border: concept.kleur === k ? '2px solid var(--text)' : '2px solid transparent',
                boxShadow: concept.kleur === k ? '0 0 0 2px var(--bg) inset' : 'none',
              }}
            />
          ))}
        </div>
      </Veld>

      {cloud ? (
        persoon.id && (
          <div className="paneel" style={{ marginBottom: 18 }}>
            <div className="vak">
              {concept.is_mij ? (
                <div className="klein">Dit ben jij — gekoppeld aan je account.</div>
              ) : (
                <>
                  <div className="klein zacht">
                    {concept.gekoppeld_aan
                      ? 'Deze persoon heeft een eigen account.'
                      : 'Deze persoon heeft geen account.'}
                  </div>
                  {!concept.gekoppeld_aan && (
                    <button
                      className="knop sm"
                      style={{ marginTop: 10 }}
                      onClick={async () => {
                        try {
                          await onClaim(persoon.id);
                          onSluit();
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
          </div>
        )
      ) : (
        <label className="rij" style={{ gap: 10, marginBottom: 18 }}>
          <input
            type="checkbox"
            checked={Boolean(concept.is_mij)}
            disabled={alIemandIk && !concept.is_mij}
            onChange={(e) => zet({ is_mij: e.target.checked })}
          />
          <span className="klein">
            Dit ben ik
            {alIemandIk && !concept.is_mij && <span className="vaag"> — al aan iemand anders toegekend</span>}
          </span>
        </label>
      )}

      <div className="rij" style={{ gap: 8 }}>
        {persoon.id && <button className="knop gevaar" onClick={() => setVraag(true)}>Verwijderen</button>}
        <button className="knop hoofd groei" disabled={!concept.naam.trim()} onClick={bewaren}>
          Bewaren
        </button>
      </div>

      {vraag && (
        <Bevestig
          titel={`${concept.naam} verwijderen?`}
          tekst="Posten waarin deze persoon meedeelt blijven bestaan, maar zijn aandeel verdwijnt uit de berekening. Loop die posten daarna even na."
          onJa={() => { onVerwijder(persoon.id); onSluit(); }}
          onSluit={() => setVraag(false)}
        />
      )}
    </Blad>
  );
}

function RekeningForm({ rekening, personen, onBewaar, onVerwijder, onSluit }) {
  const [concept, setConcept] = useState(() => ({
    naam: '', soort: 'gezamenlijk', eigenaar_id: null, deelnemers: [], stortingen: {}, iban: '', ...rekening,
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
      onSluit();
    } catch (err) {
      setFout(err.message || String(err));
    }
  };

  const kanBewaren = concept.naam.trim() && (gezamenlijk ? deelnemers.length > 0 : concept.eigenaar_id);

  return (
    <Blad titel={rekening.id ? 'Rekening wijzigen' : 'Nieuwe rekening'} onSluit={onSluit}>
      {fout && <Melding toon="mis">{fout}</Melding>}

      <Veld label="Naam">
        <input
          className="invoer"
          autoFocus
          placeholder="Gezamenlijk, BUNQ, RABO zakelijk…"
          value={concept.naam}
          onChange={(e) => zet({ naam: e.target.value })}
        />
      </Veld>

      <Veld label="Wat voor rekening">
        <div className="kolom">
          {SOORTEN_REKENING.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`optie${concept.soort === s.id ? ' aan' : ''}`}
              onClick={() => zet({ soort: s.id })}
            >
              <span className="stip" />
              <span>
                <span className="t" style={{ display: 'block' }}>{s.label}</span>
                <span className="b" style={{ display: 'block' }}>{s.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </Veld>

      {gezamenlijk ? (
        <>
          <Veld label="Wie storten erop">
            <div className="blokjes">
              {personen.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`blokje${deelnemers.includes(p.id) ? ' aan' : ''}`}
                  onClick={() => wisselDeelnemer(p.id)}
                >
                  <Wie persoon={p} maat="klein" /> {p.naam}
                </button>
              ))}
            </div>
          </Veld>

          {deelnemers.length > 0 && (
            <Veld
              label="Vaste inleg per maand"
              tip="Wat er nu daadwerkelijk maandelijks op gestort wordt. Pay zet dat naast het werkelijke aandeel, zodat je ziet of de pot uitkomt. Laat leeg als jullie precies het aandeel overmaken."
            >
              <div className="paneel" style={{ marginBottom: 0 }}>
                {deelnemers.map((id) => {
                  const p = personen.find((x) => x.id === id);
                  return (
                    <div key={id} className="post">
                      <Wie persoon={p} maat="klein" />
                      <div className="wat"><div className="n">{p?.naam}</div></div>
                      <span style={{ width: 132 }}>
                        <Bedrag
                          centen={concept.stortingen?.[id] || 0}
                          onChange={(c) => zet({ stortingen: { ...(concept.stortingen || {}), [id]: c } })}
                        />
                      </span>
                    </div>
                  );
                })}
                <Som label="Samen per maand" centen={inleg} />
              </div>
            </Veld>
          )}
        </>
      ) : (
        <Veld
          label="Van wie is deze rekening"
          tip="Wat anderen meegebruiken van deze rekening, staat bij deze persoon in het krijt."
        >
          <div className="blokjes">
            {personen.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`blokje${concept.eigenaar_id === p.id ? ' aan' : ''}`}
                onClick={() => zet({ eigenaar_id: p.id })}
              >
                <Wie persoon={p} maat="klein" /> {p.naam}
              </button>
            ))}
          </div>
        </Veld>
      )}

      <details className="uitklap" style={{ marginBottom: 18 }}>
        <summary>Rekeningnummer</summary>
        <div style={{ marginTop: 16 }}>
          <Veld label="IBAN" tip="Alleen om over te tikken bij het overmaken. Blijft in je eigen huishouden.">
            <input
              className="invoer"
              placeholder="NL00 BANK 0000 0000 00"
              value={concept.iban || ''}
              onChange={(e) => zet({ iban: e.target.value })}
            />
          </Veld>
        </div>
      </details>

      <div className="rij" style={{ gap: 8 }}>
        {rekening.id && <button className="knop gevaar" onClick={() => setVraag(true)}>Verwijderen</button>}
        <button className="knop hoofd groei" disabled={!kanBewaren} onClick={bewaren}>Bewaren</button>
      </div>
      {!kanBewaren && (
        <div className="tip">
          {gezamenlijk ? 'Kies minstens één deelnemer.' : 'Kies van wie deze rekening is.'}
        </div>
      )}

      {vraag && (
        <Bevestig
          titel={`${concept.naam} verwijderen?`}
          tekst="Posten die van deze rekening afgingen houden geen rekening meer over en tellen dan niet mee. Pay waarschuwt daar wel over op het overzicht."
          onJa={() => { onVerwijder(rekening.id); onSluit(); }}
          onSluit={() => setVraag(false)}
        />
      )}
    </Blad>
  );
}
