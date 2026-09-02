// Everything you touch a few times at most: theme, key, connection, invites,
// and getting data in and out.

import { useEffect, useState } from 'react';
import { Sheet, Field, Notice, Line, copyText, Icon } from '../components/ui.jsx';
import { readConfig, writeConfig } from '../lib/config.js';
import { resetClient } from '../lib/supabase.js';
import { signOut } from '../lib/auth.js';
import { toCsv, parsePaste, download } from '../lib/csv.js';
import { createInvite, listInvites, revokeInvite } from '../lib/invites.js';
import { exampleHousehold } from '../data/example.js';
import { readBackup } from '../lib/backup.js';
import { CADENCES } from '../lib/cadence.js';
import { CATEGORIES } from '../data/categories.js';

export default function Settings({ user, store, keyring, theme, onTheme, onSignIn }) {
  const [panel, setPanel] = useState(null);
  const [message, setMessage] = useState(null);
  const config = readConfig();

  const stamp = () => new Date().toISOString().slice(0, 10);

  // Restoring is deliberately additive: it never wipes what is already there,
  // so a wrong file costs you a delete rather than everything you had.
  const restore = async (file) => {
    if (!file) return;
    setMessage('Bezig…');
    try {
      const set = readBackup(await file.text());
      const count = await store.importAll(set);
      setMessage(`${count} regels toegevoegd uit ${file.name}.`);
    } catch (err) {
      setMessage(err.message || String(err));
    }
  };

  const fillExample = async () => {
    setMessage('Bezig…');
    try {
      const count = await store.importAll(exampleHousehold());
      setMessage(`Voorbeeld toegevoegd (${count} regels). Gooi weg wat je niet herkent.`);
    } catch (err) {
      setMessage(err.message || String(err));
    }
  };

  return (
    <>
      {message && <Notice tone="info">{message}</Notice>}

      <div className="section">Weergave</div>
      <div className="panel">
        <div className="box">
          <div className="row">
            <span className="grow small">Thema</span>
            <div className="chips">
              {[['light', 'Dag'], ['dark', 'Nacht']].map(([id, label]) => (
                <button key={id} className={`chip${theme === id ? ' on' : ''}`} onClick={() => onTheme(id)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="section">Sleutel</div>
      <div className="panel">
        <div className="box">
          <div className="small">
            Alles wat je hier invult wordt versleuteld voordat het je apparaat verlaat. De sleutel
            komt uit je wachtwoordzin en staat nergens anders — ook niet bij Supabase.
          </div>
        </div>
        {(keyring?.waiting || []).map((row) => (
          <div key={row.user_id} className="box">
            <div className="small bold">Iemand wacht op toegang</div>
            <div className="tiny dim" style={{ marginTop: 3 }}>
              Er staat een sleutel klaar van een huisgenoot die net is ingelogd. Laat je haar
              binnen, dan pakt jouw browser de huishoudsleutel in met háár sleutel — er gaat niets
              leesbaars over de lijn.
            </div>
            <button
              className="btn primary sm"
              style={{ marginTop: 10 }}
              onClick={async () => {
                setMessage('Bezig…');
                try {
                  await keyring.grantAccess(row);
                  setMessage('Gelukt. Zij kan nu ontgrendelen met haar eigen wachtwoordzin.');
                } catch (err) {
                  setMessage(err.message || String(err));
                }
              }}
            >
              Binnenlaten
            </button>
          </div>
        ))}
      </div>
      <button className="btn wide" onClick={() => keyring?.lock()}>
        <Icon name="key" size={17} /> Vergrendelen
      </button>
      <div className="hint">
        Gooit de sleutel van dit apparaat af. Je gegevens blijven staan, maar je hebt je
        wachtwoordzin weer nodig om ze te openen.
      </div>

      <div className="section">Gegevens</div>
      <div className="panel">
        <Line what="Personen" right={<span className="amount">{store.people.length}</span>} />
        <Line what="Rekeningen" right={<span className="amount">{store.accounts.length}</span>} />
        <Line what="Posten" right={<span className="amount">{store.expenses.length}</span>} />
      </div>
      <div className="col" style={{ gap: 8 }}>
        <button className="btn wide" onClick={() => setPanel('paste')}>
          <Icon name="paste" size={17} /> Plakken uit Excel of Numbers
        </button>
        <button className="btn wide" onClick={() => download(`pay-${stamp()}.csv`, toCsv(store))}>
          <Icon name="download" size={17} /> Exporteren naar CSV
        </button>
        <button
          className="btn wide"
          onClick={() =>
            download(
              `pay-backup-${stamp()}.json`,
              JSON.stringify(
                { version: 2, people: store.people, accounts: store.accounts, expenses: store.expenses },
                null,
                2
              ),
              'application/json'
            )
          }
        >
          <Icon name="download" size={17} /> Volledige reservekopie (JSON)
        </button>
        <label className="btn wide" style={{ cursor: 'pointer' }}>
          <Icon name="paste" size={17} /> Herstellen uit reservekopie (JSON)
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(event) => {
              restore(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
        {!store.expenses.length && (
          <button className="btn wide" onClick={fillExample}>Vul een voorbeeldhuishouden</button>
        )}
      </div>
      <div className="hint">
        De CSV opent rechtstreeks in Excel en Numbers, met per post het maandbedrag, het jaarbedrag
        en het aandeel van iedereen in een eigen kolom. Let op: die twee bestanden zijn níét
        versleuteld — bewaar ze zoals je een bankafschrift zou bewaren.
        <br />
        <br />
        Herstellen leest zo'n JSON weer in. Het vult aan wat er al staat en gooit niets weg, en
        het bestand wordt pas versleuteld op het moment dat het hier binnenkomt.
      </div>

      <div className="section">Samen bijhouden</div>
      {store.cloud ? (
        <>
          <div className="panel">
            <div className="box">
              <div className="small">Ingelogd als <strong>{user?.email}</strong></div>
              <div className="tiny dim" style={{ marginTop: 3 }}>
                Alles staat in je eigen Supabase-project, afgeschermd per huishouden.
              </div>
            </div>
          </div>
          <div className="col" style={{ gap: 8 }}>
            <button className="btn wide" onClick={() => setPanel('invite')}>
              <Icon name="mail" size={17} /> Iemand toegang geven
            </button>
            {store.localCount > 0 && (
              <button
                className="btn wide"
                onClick={async () => {
                  setMessage('Bezig met overzetten…');
                  try {
                    const n = await store.migrateLocal();
                    setMessage(`${n} regels overgezet naar je huishouden.`);
                  } catch (err) {
                    setMessage(err.message || String(err));
                  }
                }}
              >
                {store.localCount} regels uit de lokale stand overzetten
              </button>
            )}
            <button className="btn wide danger" onClick={() => signOut()}>Uitloggen</button>
          </div>
        </>
      ) : (
        <>
          <Notice tone="info">
            Pay draait nu <strong>lokaal</strong>: alles staat versleuteld in deze browser en gaat
            nergens heen.{' '}
            {config.source === 'none' ? (
              <>
                Wil je dat je huisgenoot meekijkt en dat het tussen je telefoon en laptop
                gelijkloopt, dan koppel je een eigen (gratis) Supabase-project. Zie
                SUPABASE_SETUP.md.
              </>
            ) : (
              <>
                Er ís een project gekoppeld — log in met je e-mail en je houdt het samen bij, op al
                je apparaten. Wat je hier lokaal hebt staan, zet je daarna in één klik over.
              </>
            )}
          </Notice>
          <div className="col" style={{ gap: 8 }}>
            {config.source !== 'none' && onSignIn && (
              <button className="btn wide" onClick={onSignIn}>
                <Icon name="mail" size={17} /> Inloggen met e-mail
              </button>
            )}
            <button className="btn wide" onClick={() => setPanel('connection')}>
              <Icon name="key" size={17} /> Verbinding instellen
            </button>
          </div>
        </>
      )}
      {config.source === 'local' && (
        <div className="hint">
          Er staan verbindingsgegevens in deze browser, ingevuld bij Verbinding. Die winnen van wat
          er in de broncode staat.
        </div>
      )}

      <div className="tiny dim center" style={{ marginTop: 32 }}>
        Pay · gebouwd {typeof __BUILD__ === 'string' ? __BUILD__ : 'lokaal'}
      </div>

      {panel === 'paste' && (
        <PastePanel
          store={store}
          onDone={(n) => { setMessage(`${n} posten toegevoegd.`); setPanel(null); }}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'connection' && <ConnectionPanel onClose={() => setPanel(null)} />}
      {panel === 'invite' && <InvitePanel onClose={() => setPanel(null)} />}
    </>
  );
}

/** Pasting from an existing overview. The fastest way out of a big spreadsheet. */
function PastePanel({ store, onDone, onClose }) {
  const { people, accounts } = store;
  const [text, setText] = useState('');
  const [account, setAccount] = useState(accounts[0]?.id || null);
  const [participants, setParticipants] = useState(() => people.filter((p) => p.isMe).map((p) => p.id));
  const [category, setCategory] = useState('other');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const found = parsePaste(text);
  const canImport = found.length > 0 && account && participants.length > 0;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const row of found) {
        await store.save('expenses', {
          name: row.name,
          amount: row.amount,
          cadence: row.cadence,
          category,
          charge: '',
          payer: { kind: 'account', id: account },
          split: { kind: 'equal', participants, weights: {} },
          paused: false,
          business: false,
          note: '',
        });
      }
      onDone(found.length);
    } catch (err) {
      setError(err.message || String(err));
      setBusy(false);
    }
  };

  return (
    <Sheet title="Plakken uit Excel of Numbers" onClose={onClose}>
      {error && <Notice tone="error">{error}</Notice>}
      <Field
        label="Plak hier twee kolommen"
        hint="Een kolom met de omschrijving en een kolom met het bedrag. Staat er een derde kolom met 'per jaar' of 'per kwartaal' bij, dan wordt die ook meegenomen. Kopregels vallen vanzelf af."
      >
        <textarea
          className="textarea"
          style={{ minHeight: 160, fontFamily: 'var(--num)', fontSize: 13 }}
          autoFocus
          placeholder={'Energie\t90,00\nInternet\t50,00\nVerzekering\t18,00\tper jaar'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>

      {found.length > 0 && (
        <>
          <div className="section" style={{ marginTop: 4 }}>
            {found.length} {found.length === 1 ? 'post' : 'posten'} herkend
          </div>
          <div className="panel">
            {found.slice(0, 8).map((r, i) => (
              <Line
                key={`${r.name}-${i}`}
                what={r.name}
                sub={CADENCES.find((c) => c.id === r.cadence)?.label}
                cents={r.amount}
              />
            ))}
            {found.length > 8 && (
              <div className="box tight tiny dim">… en nog {found.length - 8}.</div>
            )}
          </div>

          <Field label="Alle posten gaan van" hint="Achteraf per post te wijzigen.">
            <div className="chips">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  className={`chip${account === a.id ? ' on' : ''}`}
                  onClick={() => setAccount(a.id)}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </Field>

          <Field label="En worden gedeeld door">
            <div className="chips">
              {people.map((p) => (
                <button
                  key={p.id}
                  className={`chip${participants.includes(p.id) ? ' on' : ''}`}
                  onClick={() =>
                    setParticipants((d) => (d.includes(p.id) ? d.filter((x) => x !== p.id) : [...d, p.id]))
                  }
                >
                  {p.name}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Categorie">
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>

          <button className="btn primary wide" disabled={!canImport || busy} onClick={run}>
            {busy ? <span className="spinner" /> : `${found.length} posten toevoegen`}
          </button>
          {!canImport && <div className="hint">Kies een rekening en minstens één persoon die het draagt.</div>}
        </>
      )}
    </Sheet>
  );
}

function ConnectionPanel({ onClose }) {
  const current = readConfig();
  const [url, setUrl] = useState(current.url);
  const [key, setKey] = useState(current.key);

  return (
    <Sheet title="Verbinding" onClose={onClose}>
      <Notice tone="info">
        Deze twee waarden staan in je Supabase-project onder <strong>Settings → API</strong>. De
        publishable key hoort openbaar te zijn en geeft in zijn eentje nergens toegang toe — dat
        regelt Row Level Security in de database. Gebruik nooit de service_role-sleutel.
      </Notice>
      <Field label="Project URL">
        <input className="input" placeholder="https://xxxx.supabase.co" value={url}
          onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="Publishable key">
        <input className="input" placeholder="sb_publishable_…" value={key}
          onChange={(e) => setKey(e.target.value)} />
      </Field>
      <button
        className="btn primary wide"
        onClick={() => { writeConfig(url, key); resetClient(); window.location.reload(); }}
      >
        Bewaren en herladen
      </button>
      <button
        className="btn wide"
        style={{ marginTop: 8 }}
        onClick={() => { writeConfig('', ''); resetClient(); window.location.reload(); }}
      >
        Wissen — terug naar de lokale stand
      </button>
    </Sheet>
  );
}

function InvitePanel({ onClose }) {
  const [list, setList] = useState([]);
  const [fresh, setFresh] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = () => listInvites().then(setList).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  return (
    <Sheet title="Iemand toegang geven" onClose={onClose}>
      {error && <Notice tone="error">{error}</Notice>}
      <Notice tone="info">
        Wie deze link opent en zijn e-mailadres invult, komt in jóuw huishouden. Daarna moet je hem
        nog één keer binnenlaten — dat staat hierboven bij <strong>Sleutel</strong> zodra het zover
        is. In de link zit alleen een code, nooit een sleutel: ook al onderschept iemand hem, dan
        valt er nog niets te lezen.
      </Notice>

      {fresh && (
        <div className="link-row" style={{ marginBottom: 14 }}>
          <span className="url">{fresh.link}</span>
          <button className="btn sm" onClick={async () => setCopied(await copyText(fresh.link))}>
            {copied ? 'Gekopieerd' : 'Kopieer'}
          </button>
        </div>
      )}

      <button
        className="btn primary wide"
        onClick={async () => {
          setError(null);
          try {
            setFresh(await createInvite({ maxUses: 1, daysValid: 14 }));
            setCopied(false);
            load();
          } catch (err) {
            setError(err.message || String(err));
          }
        }}
      >
        Nieuwe uitnodiging maken
      </button>
      <div className="hint">Eén keer bruikbaar, veertien dagen geldig.</div>

      {list.length > 0 && (
        <>
          <div className="section">Uitstaand</div>
          <div className="panel">
            {list.map((invite) => {
              const dead =
                invite.revoked_at ||
                (invite.expires_at && invite.expires_at < new Date().toISOString()) ||
                (invite.max_uses && invite.uses >= invite.max_uses);
              return (
                <Line
                  key={invite.id}
                  what="Uitnodiging"
                  sub={dead ? 'niet meer bruikbaar' : `${invite.uses || 0} van ${invite.max_uses ?? '∞'} gebruikt`}
                  right={
                    dead ? null : (
                      <button className="btn sm danger" onClick={() => revokeInvite(invite.id).then(load)}>
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
    </Sheet>
  );
}
