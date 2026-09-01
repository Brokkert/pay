// De deur van de kluis.
//
// Vier situaties, één scherm: je stelt een wachtwoordzin in, je tikt hem in, je
// vraagt toegang tot een bestaand huishouden, of je wacht tot iemand op de knop
// drukt.

import { useState } from 'react';
import { Veld, Melding, Icoon } from '../components/ui.jsx';

const MINIMUM = 10;

export default function Ontgrendel({ ring, email, onUitloggen }) {
  const [zin, setZin] = useState('');
  const [herhaal, setHerhaal] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState(null);

  const nieuw = ring.staat === 'nieuw';
  const toegang = ring.staat === 'toegang';
  const instellen = nieuw || toegang;

  const kan = instellen ? zin.length >= MINIMUM && zin === herhaal : zin.length > 0;

  const doen = async () => {
    setBezig(true);
    setFout(null);
    try {
      if (nieuw) await ring.maakAan(zin);
      else if (toegang) await ring.vraagToegang(zin);
      else await ring.ontgrendel(zin);
      setZin('');
      setHerhaal('');
    } catch (err) {
      setFout(err.message || String(err));
    }
    setBezig(false);
  };

  if (ring.staat === 'wachten') {
    return (
      <div className="inlog">
        <div className="merk"><Icoon naam="sleutel" maat={38} /></div>
        <h1>Even wachten</h1>
        <p className="onderschrift">
          Je sleutel staat klaar. Vraag een huisgenoot om Pay te openen en jou binnen te laten —
          dat is één klik bij <strong>Meer</strong>.
        </p>
        <Melding toon="info">
          Alleen iemand die er al bij kan, kan jou erbij laten. Dat is precies de bedoeling: er
          gaat nooit een sleutel over de lijn die iemand anders kan onderscheppen.
        </Melding>
        <button className="knop hoofd breed" onClick={() => ring.opnieuwKijken()}>
          Kijk of het al kan
        </button>
        {onUitloggen && (
          <button className="knop stil breed" style={{ marginTop: 14 }} onClick={onUitloggen}>
            Uitloggen
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="inlog">
      <div className="merk"><Icoon naam="sleutel" maat={38} /></div>
      <h1>{instellen ? 'Kies een wachtwoordzin' : 'Ontgrendelen'}</h1>
      <p className="onderschrift">
        {instellen
          ? 'Hiermee wordt alles versleuteld voordat het je apparaat verlaat.'
          : email
            ? `Voor ${email}`
            : 'Tik je wachtwoordzin in om je gegevens te openen.'}
      </p>

      {fout && <Melding toon="mis">{fout}</Melding>}
      {ring.fout && !fout && <Melding toon="mis">{ring.fout}</Melding>}

      {instellen && (
        <Melding toon="let">
          <strong>Deze zin kan niet hersteld worden.</strong> Hij staat nergens — niet bij ons, niet
          bij Supabase. Ben je hem kwijt, dan zijn je gegevens onleesbaar. Neem een zin van een paar
          woorden die je niet vergeet, en schrijf hem ergens veilig op.
        </Melding>
      )}

      <Veld
        label="Wachtwoordzin"
        voor="pay-zin"
        tip={instellen ? `Minstens ${MINIMUM} tekens. Een korte zin werkt beter dan een kort woord.` : null}
      >
        <input
          id="pay-zin"
          className="invoer"
          type="password"
          autoFocus
          autoComplete={instellen ? 'new-password' : 'current-password'}
          value={zin}
          onChange={(e) => setZin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && kan && doen()}
        />
      </Veld>

      {instellen && (
        <Veld label="Nog een keer" voor="pay-zin-2">
          <input
            id="pay-zin-2"
            className="invoer"
            type="password"
            autoComplete="new-password"
            value={herhaal}
            onChange={(e) => setHerhaal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && kan && doen()}
          />
        </Veld>
      )}

      <button className="knop hoofd breed" disabled={!kan || bezig} onClick={doen}>
        {bezig ? <span className="draai" /> : instellen ? 'Instellen' : 'Ontgrendelen'}
      </button>

      {instellen && zin.length > 0 && zin.length < MINIMUM && (
        <div className="tip let">Nog {MINIMUM - zin.length} tekens te gaan.</div>
      )}
      {instellen && herhaal.length > 0 && zin !== herhaal && (
        <div className="tip let">De twee zinnen zijn nog niet gelijk.</div>
      )}

      {toegang && (
        <div className="tip">
          Je komt in een bestaand huishouden. Na het instellen vraagt Pay een huisgenoot om je
          binnen te laten; die klik heeft niemand anders nodig.
        </div>
      )}

      {onUitloggen && (
        <button className="knop stil breed" style={{ marginTop: 20 }} onClick={onUitloggen}>
          Uitloggen
        </button>
      )}
    </div>
  );
}
