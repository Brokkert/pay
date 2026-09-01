// Alles wat je hooguit een paar keer aanraakt: thema, verbinding, uitnodigingen,
// en het in- en uitvoeren van gegevens.

import { useEffect, useState } from 'react';
import { Blad, Veld, Melding, Post, kopieer, Icoon } from '../components/ui.jsx';
import { readConfig, writeConfig } from '../lib/config.js';
import { resetClient } from '../lib/supabase.js';
import { signOut } from '../lib/auth.js';
import { naarCsv, leesPlak, download } from '../lib/csv.js';
import { maakUitnodiging, lijstUitnodigingen, trekIn } from '../lib/uitnodigingen.js';
import { voorbeeldKasboek } from '../data/voorbeeld.js';
import { RITMES } from '../lib/ritme.js';
import { CATEGORIEEN } from '../data/categorieen.js';

export default function Instellingen({ user, kasboek, ring, thema, onThema }) {
  const [paneel, setPaneel] = useState(null);
  const [melding, setMelding] = useState(null);
  const config = readConfig();

  const stempel = () => new Date().toISOString().slice(0, 10);

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
      {melding && <Melding toon="info">{melding}</Melding>}

      <div className="kop">Weergave</div>
      <div className="paneel">
        <div className="vak">
          <div className="rij">
            <span className="groei klein">Thema</span>
            <div className="blokjes">
              {[['light', 'Dag'], ['dark', 'Nacht']].map(([id, label]) => (
                <button key={id} className={`blokje${thema === id ? ' aan' : ''}`} onClick={() => onThema(id)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="kop">Gegevens</div>
      <div className="paneel">
        <Post wat="Personen" rechts={<span className="bedrag">{kasboek.personen.length}</span>} />
        <Post wat="Rekeningen" rechts={<span className="bedrag">{kasboek.rekeningen.length}</span>} />
        <Post wat="Posten" rechts={<span className="bedrag">{kasboek.posten.length}</span>} />
      </div>
      <div className="kolom" style={{ gap: 8 }}>
        <button className="knop breed" onClick={() => setPaneel('plakken')}>
          <Icoon naam="plak" maat={17} /> Plakken uit Excel of Numbers
        </button>
        <button className="knop breed" onClick={() => download(`pay-${stempel()}.csv`, naarCsv(kasboek))}>
          <Icoon naam="omlaag" maat={17} /> Exporteren naar CSV
        </button>
        <button
          className="knop breed"
          onClick={() =>
            download(
              `pay-backup-${stempel()}.json`,
              JSON.stringify(
                {
                  versie: 1,
                  personen: kasboek.personen,
                  rekeningen: kasboek.rekeningen,
                  posten: kasboek.posten,
                },
                null,
                2
              ),
              'application/json'
            )
          }
        >
          <Icoon naam="omlaag" maat={17} /> Volledige reservekopie (JSON)
        </button>
        {!kasboek.posten.length && (
          <button className="knop breed" onClick={vulVoorbeeld}>Vul een voorbeeldhuishouden</button>
        )}
      </div>
      <div className="tip">
        De CSV opent rechtstreeks in Excel en Numbers, met per post het maandbedrag, het jaarbedrag
        en het aandeel van iedereen in een eigen kolom.
      </div>

      <div className="kop">Sleutel</div>
      <div className="paneel">
        <div className="vak">
          <div className="klein">
            Alles wat je hier invult wordt versleuteld voordat het je apparaat verlaat. De sleutel
            komt uit je wachtwoordzin en staat nergens anders — ook niet bij Supabase.
          </div>
        </div>
        {(ring?.wachtenden || []).map((rij) => (
          <div key={rij.user_id} className="vak">
            <div className="klein dik">Iemand wacht op toegang</div>
            <div className="mini vaag" style={{ marginTop: 3 }}>
              Er staat een sleutel klaar van een huisgenoot die net is ingelogd. Laat je haar
              binnen, dan pakt jouw browser de huishoudsleutel in met háár sleutel — er gaat niets
              leesbaars over de lijn.
            </div>
            <button
              className="knop hoofd sm"
              style={{ marginTop: 10 }}
              onClick={async () => {
                setMelding('Bezig\u2026');
                try {
                  await ring.geefToegang(rij);
                  setMelding('Gelukt. Zij kan nu ontgrendelen met haar eigen wachtwoordzin.');
                } catch (err) {
                  setMelding(err.message || String(err));
                }
              }}
            >
              Binnenlaten
            </button>
          </div>
        ))}
      </div>
      <button className="knop breed" onClick={() => ring?.vergrendel()}>
        <Icoon naam="sleutel" maat={17} /> Vergrendelen
      </button>
      <div className="tip">
        Gooit de sleutel van dit apparaat af. Je gegevens blijven staan, maar je hebt je
        wachtwoordzin weer nodig om ze te openen.
      </div>

      <div className="kop">Samen bijhouden</div>
      {kasboek.cloud ? (
        <>
          <div className="paneel">
            <div className="vak">
              <div className="klein">Ingelogd als <strong>{user?.email}</strong></div>
              <div className="mini vaag" style={{ marginTop: 3 }}>
                Alles staat in je eigen Supabase-project, afgeschermd per huishouden.
              </div>
            </div>
          </div>
          <div className="kolom" style={{ gap: 8 }}>
            <button className="knop breed" onClick={() => setPaneel('uitnodigen')}>
              <Icoon naam="mail" maat={17} /> Iemand toegang geven
            </button>
            {kasboek.lokaalAantal > 0 && (
              <button
                className="knop breed"
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
                {kasboek.lokaalAantal} regels uit de lokale kluis overzetten
              </button>
            )}
            <button className="knop breed gevaar" onClick={() => signOut()}>Uitloggen</button>
          </div>
        </>
      ) : (
        <>
          <Melding toon="info">
            Pay draait nu als <strong>lokale kluis</strong>: alles staat in deze browser en gaat
            nergens heen. Wil je dat je vriendin meekijkt en dat het tussen je telefoon en laptop
            gelijkloopt, dan koppel je een eigen (gratis) Supabase-project. Zie SUPABASE_SETUP.md.
          </Melding>
          <button className="knop breed" onClick={() => setPaneel('verbinding')}>
            <Icoon naam="sleutel" maat={17} /> Verbinding instellen
          </button>
        </>
      )}
      {config.bron === 'lokaal' && (
        <div className="tip">
          Er staan verbindingsgegevens in deze browser, ingevuld bij Verbinding. Die winnen van wat
          er in de broncode staat.
        </div>
      )}

      <div className="mini vaag midden" style={{ marginTop: 32 }}>
        Pay · gebouwd {typeof __BUILD__ === 'string' ? __BUILD__ : 'lokaal'}
      </div>

      {paneel === 'plakken' && (
        <PlakPaneel
          kasboek={kasboek}
          onKlaar={(n) => { setMelding(`${n} posten toegevoegd.`); setPaneel(null); }}
          onSluit={() => setPaneel(null)}
        />
      )}
      {paneel === 'verbinding' && <VerbindingPaneel onSluit={() => setPaneel(null)} />}
      {paneel === 'uitnodigen' && <UitnodigenPaneel onSluit={() => setPaneel(null)} />}
    </>
  );
}

/** Plakken uit een bestaand overzicht. De snelste weg uit een grote spreadsheet. */
function PlakPaneel({ kasboek, onKlaar, onSluit }) {
  const { personen, rekeningen } = kasboek;
  const [tekst, setTekst] = useState('');
  const [rekening, setRekening] = useState(rekeningen[0]?.id || null);
  const [deelnemers, setDeelnemers] = useState(() => personen.filter((p) => p.is_mij).map((p) => p.id));
  const [categorie, setCategorie] = useState('overig');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState(null);

  const gevonden = leesPlak(tekst);
  const kan = gevonden.length > 0 && rekening && deelnemers.length > 0;

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
    <Blad titel="Plakken uit Excel of Numbers" onSluit={onSluit}>
      {fout && <Melding toon="mis">{fout}</Melding>}
      <Veld
        label="Plak hier twee kolommen"
        tip="Een kolom met de omschrijving en een kolom met het bedrag. Staat er een derde kolom met 'per jaar' of 'per kwartaal' bij, dan wordt die ook meegenomen. Kopregels vallen vanzelf af."
      >
        <textarea
          className="tekstvak"
          style={{ minHeight: 160, fontFamily: 'var(--num)', fontSize: 13 }}
          autoFocus
          placeholder={'Energie\t90,00\nInternet\t50,00\nVerzekering\t18,00\tper jaar'}
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
        />
      </Veld>

      {gevonden.length > 0 && (
        <>
          <div className="kop" style={{ marginTop: 4 }}>
            {gevonden.length} {gevonden.length === 1 ? 'post' : 'posten'} herkend
          </div>
          <div className="paneel">
            {gevonden.slice(0, 8).map((r, i) => (
              <Post
                key={`${r.naam}-${i}`}
                wat={r.naam}
                onder={RITMES.find((x) => x.id === r.ritme)?.label}
                centen={r.bedrag}
              />
            ))}
            {gevonden.length > 8 && (
              <div className="vak krap mini vaag">… en nog {gevonden.length - 8}.</div>
            )}
          </div>

          <Veld label="Alle posten gaan van" tip="Achteraf per post te wijzigen.">
            <div className="blokjes">
              {rekeningen.map((r) => (
                <button
                  key={r.id}
                  className={`blokje${rekening === r.id ? ' aan' : ''}`}
                  onClick={() => setRekening(r.id)}
                >
                  {r.naam}
                </button>
              ))}
            </div>
          </Veld>

          <Veld label="En worden gedeeld door">
            <div className="blokjes">
              {personen.map((p) => (
                <button
                  key={p.id}
                  className={`blokje${deelnemers.includes(p.id) ? ' aan' : ''}`}
                  onClick={() =>
                    setDeelnemers((d) => (d.includes(p.id) ? d.filter((x) => x !== p.id) : [...d, p.id]))
                  }
                >
                  {p.naam}
                </button>
              ))}
            </div>
          </Veld>

          <Veld label="Categorie">
            <select className="keuze" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
              {CATEGORIEEN.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Veld>

          <button className="knop hoofd breed" disabled={!kan || bezig} onClick={invoeren}>
            {bezig ? <span className="draai" /> : `${gevonden.length} posten toevoegen`}
          </button>
          {!kan && <div className="tip">Kies een rekening en minstens één persoon die het draagt.</div>}
        </>
      )}
    </Blad>
  );
}

function VerbindingPaneel({ onSluit }) {
  const huidig = readConfig();
  const [url, setUrl] = useState(huidig.url);
  const [key, setKey] = useState(huidig.key);

  return (
    <Blad titel="Verbinding" onSluit={onSluit}>
      <Melding toon="info">
        Deze twee waarden staan in je Supabase-project onder <strong>Settings → API</strong>. De
        publishable key hoort openbaar te zijn en geeft in zijn eentje nergens toegang toe — dat
        regelt Row Level Security in de database. Gebruik nooit de service_role-sleutel.
      </Melding>
      <Veld label="Project URL">
        <input className="invoer" placeholder="https://xxxx.supabase.co" value={url}
          onChange={(e) => setUrl(e.target.value)} />
      </Veld>
      <Veld label="Publishable key">
        <input className="invoer" placeholder="sb_publishable_…" value={key}
          onChange={(e) => setKey(e.target.value)} />
      </Veld>
      <button
        className="knop hoofd breed"
        onClick={() => { writeConfig(url, key); resetClient(); window.location.reload(); }}
      >
        Bewaren en herladen
      </button>
      <button
        className="knop breed"
        style={{ marginTop: 8 }}
        onClick={() => { writeConfig('', ''); resetClient(); window.location.reload(); }}
      >
        Wissen — terug naar de lokale kluis
      </button>
    </Blad>
  );
}

function UitnodigenPaneel({ onSluit }) {
  const [lijst, setLijst] = useState([]);
  const [nieuw, setNieuw] = useState(null);
  const [fout, setFout] = useState(null);
  const [gekopieerd, setGekopieerd] = useState(false);

  const laden = () => lijstUitnodigingen().then(setLijst).catch((e) => setFout(e.message));
  useEffect(() => { laden(); }, []);

  return (
    <Blad titel="Iemand toegang geven" onSluit={onSluit}>
      {fout && <Melding toon="mis">{fout}</Melding>}
      <Melding toon="info">
        Wie deze link opent en zijn e-mailadres invult, komt in jóuw huishouden. Daarna moet je
        hem nog één keer binnenlaten — dat staat hierboven zodra het zover is. In de link zit
        alleen een code, nooit een sleutel: ook al onderschept iemand hem, dan valt er nog niets
        te lezen.
      </Melding>

      {nieuw && (
        <div className="link" style={{ marginBottom: 14 }}>
          <span className="url">{nieuw.link}</span>
          <button className="knop sm" onClick={async () => setGekopieerd(await kopieer(nieuw.link))}>
            {gekopieerd ? 'Gekopieerd' : 'Kopieer'}
          </button>
        </div>
      )}

      <button
        className="knop hoofd breed"
        onClick={async () => {
          setFout(null);
          try {
            setNieuw(await maakUitnodiging({ maxKeer: 1, dagenGeldig: 14 }));
            setGekopieerd(false);
            laden();
          } catch (err) {
            setFout(err.message || String(err));
          }
        }}
      >
        Nieuwe uitnodiging maken
      </button>
      <div className="tip">Eén keer bruikbaar, veertien dagen geldig.</div>

      {lijst.length > 0 && (
        <>
          <div className="kop">Uitstaand</div>
          <div className="paneel">
            {lijst.map((u) => {
              const dood =
                u.ingetrokken_op ||
                (u.verloopt_op && u.verloopt_op < new Date().toISOString()) ||
                (u.max_keer && u.gebruikt >= u.max_keer);
              return (
                <Post
                  key={u.id}
                  wat="Uitnodiging"
                  onder={dood ? 'niet meer bruikbaar' : `${u.gebruikt || 0} van ${u.max_keer ?? '∞'} gebruikt`}
                  rechts={
                    dood ? null : (
                      <button className="knop sm gevaar" onClick={() => trekIn(u.id).then(laden)}>
                        Intrekken
                      </button>
                    )
                  }
                />
              );
            })}
          </div>
        </>
      )}
    </Blad>
  );
}
