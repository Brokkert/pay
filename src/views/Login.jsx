// Het inlogscherm. Aanmelden gaat via een uitnodiging; de voorpagina biedt het
// niet uit zichzelf aan.

import { useEffect, useState } from 'react';
import { Field, Note } from '../components/ui.jsx';
import { sendMagicLink, verifyCode, needsBootstrap } from '../lib/auth.js';

export default function Login({ configured, joinCode, onSkip }) {
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
    <div className="login-wrap lijnen">
      <div className="logo">🧾</div>
      <h1>Pay</h1>
      <div className="rule" />
      <div className="tag">
        Wat er loopt, wie het betaalt,
        <br />
        en wie wie wat schuldig is.
      </div>

      {fout && <Note tone="bad">{fout}</Note>}

      {!configured ? (
        <>
          <Note tone="info">
            Pay is nog niet aan een Supabase-project gekoppeld. Dat hoeft ook niet: als lokale kluis
            werkt alles meteen, alleen blijft het dan in deze browser en kan je vriendin niet
            meekijken.
          </Note>
          <button className="btn primary wide" onClick={onSkip}>Beginnen zonder account</button>
        </>
      ) : verstuurd ? (
        <>
          <Note tone="good">
            Er is een mail onderweg naar <strong>{email}</strong>. Klik op de link en je bent binnen.
          </Note>
          <details className="fallback">
            <summary>Mail op je telefoon, app op je laptop?</summary>
            <div style={{ marginTop: 10 }}>
              <Field label="Code uit de mail">
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </Field>
              <button className="btn wide" disabled={bezig || code.length < 6} onClick={codeInvoeren}>
                Invoeren
              </button>
            </div>
          </details>
          <button className="btn ghost wide" style={{ marginTop: 12 }} onClick={() => setVerstuurd(false)}>
            Ander adres gebruiken
          </button>
        </>
      ) : (
        <>
          {joinCode && (
            <Note tone="good">
              Je hebt een uitnodiging. Vul je e-mailadres in en je zit meteen in het juiste
              huishouden.
            </Note>
          )}
          <Field label="E-mailadres">
            <input
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="jij@voorbeeld.nl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email.includes('@') && versturen(eersteMag)}
            />
          </Field>
          <button
            className="btn primary wide"
            disabled={bezig || !email.includes('@')}
            onClick={() => versturen(eersteMag)}
          >
            {bezig ? <span className="spinner" /> : joinCode ? 'Account aanmaken' : 'Stuur me een link'}
          </button>

          {eersteMag && !joinCode && (
            <Note tone="info" >
              Nog niemand hier. Het eerste account mag zonder uitnodiging binnen — daarna heeft
              iedereen er een nodig, jij incluis.
            </Note>
          )}
          {!eersteMag && !joinCode && (
            <div className="hint center">
              Aanmelden gaat via een uitnodiging. Heb je er een, open dan die link.
            </div>
          )}

          <button className="btn ghost wide" style={{ marginTop: 18 }} onClick={onSkip}>
            Liever zonder account, alleen in deze browser
          </button>
        </>
      )}
    </div>
  );
}
