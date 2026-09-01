// Het inlogscherm. Aanmelden gaat via een uitnodiging; de voorpagina biedt het
// niet uit zichzelf aan.

import { useEffect, useState } from 'react';
import { Veld, Melding, Icoon } from '../components/ui.jsx';
import { sendMagicLink, verifyCode, needsBootstrap } from '../lib/auth.js';

export default function Login({ configured, joinCode, onOverslaan }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [verstuurd, setVerstuurd] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState(null);
  const [eersteMag, setEersteMag] = useState(false);

  useEffect(() => {
    if (configured) needsBootstrap().then(setEersteMag).catch(() => {});
  }, [configured]);

  const versturen = async (metAanmelden) => {
    setBezig(true);
    setFout(null);
    try {
      await sendMagicLink(email, { invite: joinCode, allowCreate: metAanmelden });
      setVerstuurd(true);
    } catch (err) {
      setFout(err.message || String(err));
    }
    setBezig(false);
  };

  const codeInvoeren = async () => {
    setBezig(true);
    setFout(null);
    try {
      await verifyCode(email, code);
    } catch (err) {
      setFout(err.message || String(err));
    }
    setBezig(false);
  };

  return (
    <div className="inlog">
      <div className="merk"><Icoon naam="bon" maat={38} /></div>
      <h1>Pay</h1>
      <p className="onderschrift">
        Wat er loopt, waar het vanaf gaat,
        <br />
        en wie wie wat schuldig is.
      </p>

      {fout && <Melding toon="mis">{fout}</Melding>}

      {!configured ? (
        <>
          <Melding toon="info">
            Pay is nog niet aan een Supabase-project gekoppeld. Dat hoeft ook niet: als lokale kluis
            werkt alles meteen, alleen blijft het dan in deze browser en kan je vriendin niet
            meekijken.
          </Melding>
          <button className="knop hoofd breed" onClick={onOverslaan}>Beginnen zonder account</button>
        </>
      ) : verstuurd ? (
        <>
          <Melding toon="goed">
            Er is een mail onderweg naar <strong>{email}</strong>. Klik op de link en je bent binnen.
          </Melding>
          <details className="uitklap">
            <summary>Mail op je telefoon, app op je laptop?</summary>
            <div style={{ marginTop: 14 }}>
              <Veld label="Code uit de mail">
                <input className="invoer" inputMode="numeric" placeholder="123456" value={code}
                  onChange={(e) => setCode(e.target.value)} />
              </Veld>
              <button className="knop breed" disabled={bezig || code.length < 6} onClick={codeInvoeren}>
                Invoeren
              </button>
            </div>
          </details>
          <button className="knop stil breed" style={{ marginTop: 14 }} onClick={() => setVerstuurd(false)}>
            Ander adres gebruiken
          </button>
        </>
      ) : (
        <>
          {joinCode && (
            <Melding toon="goed">
              Je hebt een uitnodiging. Vul je e-mailadres in en je zit meteen in het juiste
              huishouden.
            </Melding>
          )}
          <Veld label="E-mailadres">
            <input
              className="invoer"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="jij@voorbeeld.nl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email.includes('@') && versturen(eersteMag)}
            />
          </Veld>
          <button
            className="knop hoofd breed"
            disabled={bezig || !email.includes('@')}
            onClick={() => versturen(eersteMag)}
          >
            {bezig ? <span className="draai" /> : joinCode ? 'Account aanmaken' : 'Stuur me een link'}
          </button>

          {eersteMag && !joinCode && (
            <Melding toon="info">
              Nog niemand hier. Het eerste account mag zonder uitnodiging binnen — daarna heeft
              iedereen er een nodig, jij incluis.
            </Melding>
          )}
          {!eersteMag && !joinCode && (
            <div className="tip midden">
              Aanmelden gaat via een uitnodiging. Heb je er een, open dan die link.
            </div>
          )}

          <button className="knop stil breed" style={{ marginTop: 22 }} onClick={onOverslaan}>
            Liever zonder account, alleen in deze browser
          </button>
        </>
      )}
    </div>
  );
}
