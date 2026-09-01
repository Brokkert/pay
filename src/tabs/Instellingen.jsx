// Alles wat je hooguit een paar keer aanraakt: thema, verbinding, uitnodigingen,
// en het in- en uitvoeren van gegevens.

import { useEffect, useState } from 'react';
import { Sheet, Field, Note, Boekregel, kopieer } from '../components/ui.jsx';
import { readConfig, writeConfig } from '../lib/config.js';
import { resetClient } from '../lib/supabase.js';
import { signOut } from '../lib/auth.js';
import { naarCsv, leesPlak, download } from '../lib/csv.js';
import { maakUitnodiging, lijstUitnodigingen, trekIn } from '../lib/uitnodigingen.js';
import { voorbeeldKasboek } from '../data/voorbeeld.js';
import { RITMES } from '../lib/ritme.js';
import { CATEGORIEEN } from '../data/categorieen.js';

export default function Instellingen({ user, kasboek, thema, onThema }) {
  const [paneel, setPaneel] = useState(null);
  const [melding, setMelding] = useState(null);
  const config = readConfig();

  const exporteer = () => {
    const stempel = new Date().toISOString().slice(0, 10);
    download(`pay-${stempel}.csv`, naarCsv(kasboek));
  };

  const backup = () => {
    const stempel = new Date().toISOString().slice(0, 10);
    const inhoud = JSON.stringify(
      { versie: 1, personen: kasboek.personen, rekeningen: kasboek.rekeningen, posten: kasboek.posten },
      null,
      2
    );
    download(`pay-backup-${stempel}.json`, inhoud, 'application/json');
  };

  const vulVoorbeeld = async () => {
    setMelding('Bezig…');
    try {
      const aantal = await kasboek.voerIn(voorbeeldKasboek());
      setMelding(`Voorbeeld toegevoegd (${aantal} regels). Gooi weg wat je niet herkent.`);
    } catch (err) {
      setMelding(err.message || String(err));
    }
  };

  return (
    <>
      {melding && <Note tone="info">{melding}</Note>}

      <div className="section-title">Weergave</div>
      <div className="card tight">
        <div className="row">
          <span className="grow small">Thema</span>
          <div className="chips">
            {[['light', '☀️ Dag'], ['dark', '🌙 Nacht']].map(([id, label]) => (
              <button key={id} className={`chip${thema === id ? ' on' : ''}`} onClick={() => onThema(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="section-title">Gegevens</div>
      <div className="card tight">
        <Boekregel wat="Personen" centen={null} achter={<span className="geld">{kasboek.personen.length}</span>} />
        <Boekregel wat="Rekeningen" centen={null} achter={<span className="geld">{kasboek.rekeningen.length}</span>} />
        <Boekregel wat="Posten" centen={null} achter={<span className="geld">{kasboek.posten.length}</span>} />
      </div>
      <div className="col" style={{ gap: 8 }}>
        <button className="btn wide" onClick={() => setPaneel('plakken')}>
          📋 Plakken uit Excel
        </button>
        <button className="btn wide" onClick={exporteer}>⬇️ Exporteren naar CSV</button>
        <button className="btn wide" onClick={backup}>💾 Volledige reservekopie (JSON)</button>
        {!kasboek.posten.length && (
          <button className="btn wide" onClick={vulVoorbeeld}>✨ Vul een voorbeeldhuishouden</button>
        )}
      </div>
      <div className="hint">
        De CSV opent rechtstreeks in Excel, met per post het maandbedrag, het jaarbedrag en het
        aandeel van iedereen in een eigen kolom — precies het blad dat je nu met de hand bijhoudt.
      </div>

      <div className="section-title">Samen bijhouden</div>
      {kasboek.cloud ? (
        <>
          <div className="card tight">
            <div className="small">Ingelogd als <strong>{user?.email}</strong></div>
            <div className="tiny faint" style={{ marginTop: 3 }}>
              Alles staat in je eigen Supabase-project, afgeschermd per huishouden.
            </div>
          </div>
          <div className="col" style={{ gap: 8 }}>
            <button className="btn wide" onClick={() => setPaneel('uitnodigen')}>
              ✉️ Iemand toegang geven
            </button>
            {kasboek.lokaalAantal > 0 && (
              <button
                className="btn wide"
                onClick={async () => {
                  setMelding('Bezig met overzetten…');
                  try {
                    const n = await kasboek.tilOver();
                    setMelding(`${n} regels overgezet naar je huishouden.`);
                  } catch (err) {
                    setMelding(err.message || String(err));
                  }
                }}
              >
                ⬆️ {kasboek.lokaalAantal} regels uit de lokale kluis overzetten
              </button>
            )}
            <button className="btn wide danger" onClick={() => signOut()}>Uitloggen</button>
          </div>
        </>
      ) : (
        <>
          <Note tone="info">
            Pay draait nu als <strong>lokale kluis</strong>: alles staat in deze browser en gaat
            nergens heen. Wil je dat je vriendin meekijkt en dat het tussen je telefoon en laptop
            gelijk loopt, dan koppel je een eigen (gratis) Supabase-project. Zie SUPABASE_SETUP.md.
          </Note>
          <button className="btn wide" onClick={() => setPaneel('verbinding')}>
            🔌 Verbinding instellen
          </button>
        </>
      )}
      {config.bron === 'lokaal' && (
        <div className="hint">
          Er staan verbindingsgegevens in deze browser, ingevuld bij Verbinding. Die winnen van wat
          er in de broncode staat.
        </div>
      )}

      <div className="tiny faint center" style={{ marginTop: 28 }}>
        Pay · gebouwd {typeof __BUILD__ === 'string' ? __BUILD__ : 'lokaal'}
      </div>

      {paneel === 'plakken' && (
        <PlakPaneel kasboek={kasboek} onKlaar={(n) => { setMelding(`${n} posten toegevoegd.`); setPaneel(null); }} onClose={() => setPaneel(null)} />
      )}
      {paneel === 'verbinding' && <VerbindingPaneel onClose={() => setPaneel(null)} />}
      {paneel === 'uitnodigen' && <UitnodigenPaneel onClose={() => setPaneel(null)} />}
    </>
  );
}

/** Plakken uit een bestaand overzicht. De snelste weg uit een grote spreadsheet. */
function PlakPaneel({ kasboek, onKlaar, onClose }) {
  const { personen, rekeningen } = kasboek;
  const [tekst, setTekst] = useState('');
  const [rekening, setRekening] = useState(rekeningen[0]?.id || null);
  const [deelnemers, setDeelnemers] = useState(() => personen.filter((p) => p.is_mij).map((p) => p.id));
  const [categorie, setCategorie] = useState('overig');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState(null);

  const gevonden = leesPlak(tekst);
  const kanImporteren = gevonden.length > 0 && rekening && deelnemers.length > 0;

  const invoeren = async () => {
    setBezig(true);
    setFout(null);
    try {
      for (const rij of gevonden) {
        await kasboek.bewaar('posten', {
          naam: rij.naam,
          bedrag: rij.bedrag,
          ritme: rij.ritme,
          categorie,
          betaler: { soort: 'rekening', id: rekening },
          verdeling: { soort: 'gelijk', deelnemers, gewichten: {} },
          gepauzeerd: false,
          zakelijk: false,
          notitie: '',
        });
      }
      onKlaar(gevonden.length);
    } catch (err) {
      setFout(err.message || String(err));
      setBezig(false);
    }
  };

  return (
    <Sheet title="Plakken uit Excel" onClose={onClose}>
      {fout && <Note tone="bad">{fout}</Note>}
      <Field
        label="Plak hier twee kolommen"
        hint="Een kolom met de omschrijving en een kolom met het bedrag. Staat er een derde kolom met 'per jaar' of 'per kwartaal' bij, dan wordt die ook meegenomen. Kopregels vallen vanzelf af."
      >
        <textarea
          className="textarea"
          style={{ minHeight: 150, fontFamily: 'var(--mono)', fontSize: 13 }}
          autoFocus
          placeholder={'Huur\t1325,00\nEnergie\t185,00\nInboedelverzekering\t186,00\tper jaar'}
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
        />
      </Field>

      {gevonden.length > 0 && (
        <>
          <div className="card tight">
            <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>
              {gevonden.length} {gevonden.length === 1 ? 'post' : 'posten'} herkend
            </div>
            {gevonden.slice(0, 8).map((r, i) => (
              <Boekregel key={i} wat={r.naam} onder={RITMES.find((x) => x.id === r.ritme)?.label} centen={r.bedrag} />
            ))}
            {gevonden.length > 8 && (
              <div className="tiny faint" style={{ marginTop: 6 }}>… en nog {gevonden.length - 8}.</div>
            )}
          </div>

          <Field label="Alle posten gaan van" hint="Achteraf per post te wijzigen.">
            <div className="chips">
              {rekeningen.map((r) => (
                <button key={r.id} className={`chip${rekening === r.id ? ' on' : ''}`} onClick={() => setRekening(r.id)}>
                  {r.naam}
                </button>
              ))}
            </div>
          </Field>

          <Field label="En worden gedeeld door">
            <div className="chips">
              {personen.map((p) => (
                <button
                  key={p.id}
                  className={`chip${deelnemers.includes(p.id) ? ' on' : ''}`}
                  onClick={() =>
                    setDeelnemers((d) => (d.includes(p.id) ? d.filter((x) => x !== p.id) : [...d, p.id]))
                  }
                >
                  {p.emoji} {p.naam}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Categorie">
            <select className="select" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
              {CATEGORIEEN.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
          </Field>

          <button className="btn primary wide" disabled={!kanImporteren || bezig} onClick={invoeren}>
            {bezig ? <span className="spinner" /> : `${gevonden.length} posten toevoegen`}
          </button>
          {!kanImporteren && (
            <div className="hint">Kies een rekening en minstens één persoon die het draagt.</div>
          )}
        </>
      )}
    </Sheet>
  );
}

function VerbindingPaneel({ onClose }) {
  const huidig = readConfig();
  const [url, setUrl] = useState(huidig.url);
  const [key, setKey] = useState(huidig.key);

  return (
    <Sheet title="Verbinding" onClose={onClose}>
      <Note tone="info">
        Deze twee waarden staan in je Supabase-project onder <strong>Settings → API</strong>. De
        publishable key hoort openbaar te zijn en geeft in zijn eentje nergens toegang toe — dat
        regelt Row Level Security in de database. Gebruik nooit de service_role-sleutel.
      </Note>
      <Field label="Project URL">
        <input className="input" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="Publishable key">
        <input className="input" placeholder="sb_publishable_…" value={key} onChange={(e) => setKey(e.target.value)} />
      </Field>
      <button
        className="btn primary wide"
        onClick={() => {
          writeConfig(url, key);
          resetClient();
          window.location.reload();
        }}
      >
        Bewaren en herladen
      </button>
      <button
        className="btn wide"
        style={{ marginTop: 8 }}
        onClick={() => {
          writeConfig('', '');
          resetClient();
          window.location.reload();
        }}
      >
        Wissen — terug naar de lokale kluis
      </button>
    </Sheet>
  );
}

function UitnodigenPaneel({ onClose }) {
  const [lijst, setLijst] = useState([]);
  const [nieuw, setNieuw] = useState(null);
  const [fout, setFout] = useState(null);
  const [gekopieerd, setGekopieerd] = useState(false);

  const laden = () => lijstUitnodigingen().then(setLijst).catch((e) => setFout(e.message));
  useEffect(() => { laden(); }, []);

  return (
    <Sheet title="Iemand toegang geven" onClose={onClose}>
      {fout && <Note tone="bad">{fout}</Note>}
      <Note tone="info">
        Wie deze link opent en zijn e-mailadres invult, komt in jóuw huishouden en ziet dezelfde
        posten en verrekeningen. Alleen de code staat in de link; de database bewaart er niet meer
        dan een hash van.
      </Note>

      {nieuw && (
        <div className="deel-link" style={{ marginBottom: 12 }}>
          <span className="url">{nieuw.link}</span>
          <button
            className="btn sm"
            onClick={async () => setGekopieerd(await kopieer(nieuw.link))}
          >
            {gekopieerd ? 'Gekopieerd' : 'Kopieer'}
          </button>
        </div>
      )}

      <button
        className="btn primary wide"
        onClick={async () => {
          setFout(null);
          try {
            setNieuw(await maakUitnodiging({ label: '', maxKeer: 1, dagenGeldig: 14 }));
            setGekopieerd(false);
            laden();
          } catch (err) {
            setFout(err.message || String(err));
          }
        }}
      >
        Nieuwe uitnodiging maken
      </button>
      <div className="hint">Eén keer bruikbaar, veertien dagen geldig.</div>

      {lijst.length > 0 && (
        <>
          <div className="section-title">Uitstaand</div>
          <div className="card tight">
            {lijst.map((u) => {
              const dood = u.ingetrokken_op || (u.verloopt_op && u.verloopt_op < new Date().toISOString())
                || (u.max_keer && u.gebruikt >= u.max_keer);
              return (
                <div key={u.id} className="boekregel">
                  <div className="wat">
                    <div className="small">{u.label || 'Uitnodiging'}</div>
                    <div className="tiny faint">
                      {dood ? 'niet meer bruikbaar' : `${u.gebruikt || 0} van ${u.max_keer ?? '∞'} gebruikt`}
                    </div>
                  </div>
                  <div className="vul" />
                  {!dood && (
                    <button className="btn sm danger" onClick={() => trekIn(u.id).then(laden)}>Intrekken</button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Sheet>
  );
}
