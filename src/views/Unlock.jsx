// The door of the vault.
//
// Four situations, one screen: you set a passphrase, you type it, you request
// access to an existing household, or you wait for someone to press the button.

import { useState } from 'react';
import { Field, Notice, Icon } from '../components/ui.jsx';

const MINIMUM = 10;

export default function Unlock({ keyring, email, onSignOut }) {
  const [phrase, setPhrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const fresh = keyring.state === 'fresh';
  const joining = keyring.state === 'joining';
  const choosing = fresh || joining;

  const can = choosing ? phrase.length >= MINIMUM && phrase === repeat : phrase.length > 0;

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      if (fresh) await keyring.create(phrase);
      else if (joining) await keyring.requestAccess(phrase);
      else await keyring.unlock(phrase);
      setPhrase('');
      setRepeat('');
    } catch (err) {
      setError(err.message || String(err));
    }
    setBusy(false);
  };

  if (keyring.state === 'waiting') {
    return (
      <div className="auth">
        <div className="brand"><Icon name="key" size={38} /></div>
        <h1>Even wachten</h1>
        <p className="tagline">
          Je sleutel staat klaar. Vraag een huisgenoot om Pay te openen en jou binnen te laten —
          dat is één klik bij <strong>Meer</strong>.
        </p>
        <Notice tone="info">
          Alleen iemand die er al bij kan, kan jou erbij laten. Dat is precies de bedoeling: er gaat
          nooit een sleutel over de lijn die iemand anders kan onderscheppen.
        </Notice>
        <button className="btn primary wide" onClick={() => keyring.recheck()}>
          Kijk of het al kan
        </button>
        {onSignOut && (
          <button className="btn quiet wide" style={{ marginTop: 14 }} onClick={onSignOut}>
            Uitloggen
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="brand"><Icon name="key" size={38} /></div>
      <h1>{choosing ? 'Kies een wachtwoordzin' : 'Ontgrendelen'}</h1>
      <p className="tagline">
        {choosing
          ? 'Hiermee wordt alles versleuteld voordat het je apparaat verlaat.'
          : email
            ? `Voor ${email}`
            : 'Tik je wachtwoordzin in om je gegevens te openen.'}
      </p>

      {error && <Notice tone="error">{error}</Notice>}
      {keyring.error && !error && <Notice tone="error">{keyring.error}</Notice>}

      {choosing && (
        <Notice tone="warn">
          <strong>Deze zin kan niet hersteld worden.</strong> Hij staat nergens — niet bij ons, niet
          bij Supabase. Ben je hem kwijt, dan zijn je gegevens onleesbaar. Neem een zin van een paar
          woorden die je niet vergeet, en schrijf hem ergens veilig op.
        </Notice>
      )}

      <Field
        label="Wachtwoordzin"
        htmlFor="pay-phrase"
        hint={choosing ? `Minstens ${MINIMUM} tekens. Een korte zin werkt beter dan een kort woord.` : null}
      >
        <input
          id="pay-phrase"
          className="input"
          type="password"
          autoFocus
          autoComplete={choosing ? 'new-password' : 'current-password'}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && can && go()}
        />
      </Field>

      {choosing && (
        <Field label="Nog een keer" htmlFor="pay-phrase-2">
          <input
            id="pay-phrase-2"
            className="input"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && can && go()}
          />
        </Field>
      )}

      <button className="btn primary wide" disabled={!can || busy} onClick={go}>
        {busy ? <span className="spinner" /> : choosing ? 'Instellen' : 'Ontgrendelen'}
      </button>

      {choosing && phrase.length > 0 && phrase.length < MINIMUM && (
        <div className="hint warn">Nog {MINIMUM - phrase.length} tekens te gaan.</div>
      )}
      {choosing && repeat.length > 0 && phrase !== repeat && (
        <div className="hint warn">De twee zinnen zijn nog niet gelijk.</div>
      )}

      {joining && (
        <div className="hint">
          Je komt in een bestaand huishouden. Na het instellen vraagt Pay een huisgenoot om je
          binnen te laten; die klik heeft niemand anders nodig.
        </div>
      )}

      {onSignOut && (
        <button className="btn quiet wide" style={{ marginTop: 20 }} onClick={onSignOut}>
          Uitloggen
        </button>
      )}
    </div>
  );
}
