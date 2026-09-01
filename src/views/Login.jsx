// The sign-in screen. Signing up goes through an invite; the front page does not
// offer it on its own.

import { useEffect, useState } from 'react';
import { Field, Notice, Icon } from '../components/ui.jsx';
import { sendMagicLink, verifyCode, needsBootstrap } from '../lib/auth.js';

export default function Login({ configured, joinCode, onSkip }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [firstAllowed, setFirstAllowed] = useState(false);

  useEffect(() => {
    if (configured) needsBootstrap().then(setFirstAllowed).catch(() => {});
  }, [configured]);

  const send = async (withSignUp) => {
    setBusy(true);
    setError(null);
    try {
      await sendMagicLink(email, { invite: joinCode, allowCreate: withSignUp });
      setSent(true);
    } catch (err) {
      setError(err.message || String(err));
    }
    setBusy(false);
  };

  const enterCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyCode(email, code);
    } catch (err) {
      setError(err.message || String(err));
    }
    setBusy(false);
  };

  return (
    <div className="auth">
      <div className="brand"><Icon name="receipt" size={38} /></div>
      <h1>Pay</h1>
      <p className="tagline">
        Wat er loopt, waar het vanaf gaat,
        <br />
        en wie wie wat schuldig is.
      </p>

      {error && <Notice tone="error">{error}</Notice>}

      {!configured ? (
        <>
          <Notice tone="info">
            Pay is nog niet aan een Supabase-project gekoppeld. Dat hoeft ook niet: lokaal werkt
            alles meteen, alleen blijft het dan in deze browser en kan je huisgenoot niet meekijken.
          </Notice>
          <button className="btn primary wide" onClick={onSkip}>Beginnen zonder account</button>
        </>
      ) : sent ? (
        <>
          <Notice tone="ok">
            Er is een mail onderweg naar <strong>{email}</strong>. Klik op de link en je bent binnen.
          </Notice>
          <details className="disclose">
            <summary>Mail op je telefoon, app op je laptop?</summary>
            <div style={{ marginTop: 14 }}>
              <Field label="Code uit de mail" htmlFor="pay-code">
                <input id="pay-code" className="input" inputMode="numeric" placeholder="123456"
                  value={code} onChange={(e) => setCode(e.target.value)} />
              </Field>
              <button className="btn wide" disabled={busy || code.length < 6} onClick={enterCode}>
                Invoeren
              </button>
            </div>
          </details>
          <button className="btn quiet wide" style={{ marginTop: 14 }} onClick={() => setSent(false)}>
            Ander adres gebruiken
          </button>
        </>
      ) : (
        <>
          {joinCode && (
            <Notice tone="ok">
              Je hebt een uitnodiging. Vul je e-mailadres in en je zit meteen in het juiste
              huishouden.
            </Notice>
          )}
          <Field label="E-mailadres" htmlFor="pay-email">
            <input
              id="pay-email"
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="jij@voorbeeld.nl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email.includes('@') && send(firstAllowed)}
            />
          </Field>
          <button
            className="btn primary wide"
            disabled={busy || !email.includes('@')}
            onClick={() => send(firstAllowed)}
          >
            {busy ? <span className="spinner" /> : joinCode ? 'Account aanmaken' : 'Stuur me een link'}
          </button>

          {firstAllowed && !joinCode && (
            <Notice tone="info">
              Nog niemand hier. Het eerste account mag zonder uitnodiging binnen — daarna heeft
              iedereen er een nodig, jij incluis.
            </Notice>
          )}
          {!firstAllowed && !joinCode && (
            <div className="hint center">
              Aanmelden gaat via een uitnodiging. Heb je er een, open dan die link.
            </div>
          )}

          <button className="btn quiet wide" style={{ marginTop: 22 }} onClick={onSkip}>
            Liever zonder account, alleen in deze browser
          </button>
        </>
      )}
    </div>
  );
}
