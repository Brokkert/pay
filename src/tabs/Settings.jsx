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
import { SUGGESTED, categoryName } from '../data/categories.js';
import { count } from '../lib/words.js';

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

      <div className="section">Labels</div>
      <LabelList store={store} onMessage={setMessage} />

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

      <div className="section">Waarom deze app</div>
      <Why store={store} />

      <div className="tiny dim center" style={{ marginTop: 32 }}>
        Pay · gebouwd {typeof __BUILD__ === 'string' ? __BUILD__ : 'lokaal'}
      </div>

      {panel === 'paste' && (
        <PastePanel
          store={store}
          onDone={(n) => { setMessage(`${count(n, 'post', 'posten')} toegevoegd.`); setPanel(null); }}
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
  const [category, setCategory] = useState('Overig');
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
            {count(found.length, 'post', 'posten')} herkend
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
              {SUGGESTED.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </Field>

          <button className="btn primary wide" disabled={!canImport || busy} onClick={run}>
            {busy ? <span className="spinner" /> : `${count(found.length, 'post', 'posten')} toevoegen`}
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


/**
 * Renaming a category or a charge.
 *
 * Neither is a record of its own — both are just a name carried by the expenses
 * that use it, which is what keeps them from needing a list to maintain. The
 * price is that renaming one means writing every expense that carries it, and
 * that has to happen somewhere. Here.
 */
function LabelList({ store, onMessage }) {
  const [editing, setEditing] = useState(null);

  const namesIn = (field) => {
    const tally = new Map();
    for (const expense of store.expenses) {
      const name = field === 'category' ? categoryName(expense.category) : (expense.charge || '');
      if (name) tally.set(name, (tally.get(name) || 0) + 1);
    }
    return [...tally].sort((a, b) => a[0].localeCompare(b[0], 'nl'));
  };

  // Renaming onto a name that already exists merges the two, which is also how
  // you get rid of one: a label is nothing but the expenses carrying it, so the
  // last expense to leave is the last of the label.
  const rename = async (field, from, to) => {
    const name = to.trim();
    if (name === from) return setEditing(null);
    if (!name && field === 'category') return setEditing(null);
    onMessage('Bezig…');
    try {
      const hit = (expense) =>
        (field === 'category' ? categoryName(expense.category) : expense.charge) === from;
      const touched = store.expenses.filter(hit);
      for (const expense of touched) await store.save('expenses', { ...expense, [field]: name });
      onMessage(
        name
          ? `${count(touched.length, 'post', 'posten')} aangepast.`
          : `Incasso weggehaald bij ${count(touched.length, 'post', 'posten')}.`
      );
      setEditing(null);
    } catch (err) {
      onMessage(err.message || String(err));
    }
  };

  const section = (field, title, empty) => {
    const rows = namesIn(field);
    return (
      <>
        <div className="hint" style={{ marginBottom: 6 }}>{title}</div>
        {rows.length ? (
          <div className="panel" style={{ marginBottom: 14 }}>
            {rows.map(([name, n]) => (
              <Line
                key={name}
                what={name}
                sub={count(n, 'post', 'posten')}
                right={<span className="chev"><Icon name="right" size={16} /></span>}
                onClick={() => setEditing({ field, name })}
              />
            ))}
          </div>
        ) : (
          <div className="panel" style={{ marginBottom: 14 }}>
            <div className="box"><div className="small muted">{empty}</div></div>
          </div>
        )}
      </>
    );
  };

  return (
    <>
      {section('category', 'Categorieën — wát je posten zijn.', 'Nog geen posten.')}
      {section('charge', 'Incasso’s — posten die als één regel van je rekening gaan.',
        'Nog geen incasso ingevuld. Dat hoeft ook niet.')}
      {editing && (
        <RenameSheet
          field={editing.field}
          name={editing.name}
          others={namesIn(editing.field).map(([name]) => name).filter((n) => n !== editing.name)}
          onSave={(to) => rename(editing.field, editing.name, to)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function RenameSheet({ field, name, others, onSave, onClose }) {
  const [value, setValue] = useState(name);
  const category = field === 'category';
  const merges = others.includes(value.trim()) && value.trim() !== name;

  return (
    <Sheet title={`${category ? 'Categorie' : 'Incasso'} hernoemen`} onClose={onClose}>
      <Field
        label="Naam"
        hint={
          merges
            ? `Deze naam bestaat al. De posten van "${name}" gaan er dan bij, en "${name}" verdwijnt.`
            : 'Elke post met deze naam gaat mee.'
        }
      >
        <input className="input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>

      {others.length > 0 && (
        <div className="chips" style={{ marginBottom: 16 }}>
          {others.map((other) => (
            <button key={other} type="button" className="chip quiet" onClick={() => setValue(other)}>
              {other}
            </button>
          ))}
        </div>
      )}

      <button
        className="btn primary wide"
        disabled={!value.trim() || value.trim() === name}
        onClick={() => onSave(value)}
      >
        {merges ? 'Samenvoegen' : 'Bewaren'}
      </button>

      {/* An expense always has a category, so there is nothing to empty there —
          merging into another is how one goes away. A charge can simply be
          absent. */}
      {!category && (
        <button className="btn wide danger" style={{ marginTop: 10 }} onClick={() => onSave('')}>
          Overal weghalen
        </button>
      )}
      <div className="hint">
        {category
          ? 'Een categorie bestaat zolang er posten op staan. Wil je er een kwijt, voeg hem dan samen met een andere.'
          : 'Weghalen laat de posten staan; ze horen daarna alleen niet meer bij één afschrijving.'}
      </div>
    </Sheet>
  );
}


/**
 * What this does that a general-purpose splitter does not.
 *
 * Not a sales page — there is nobody to sell to. It is here because months go
 * by between edits, and by then it is easy to forget why an expense is entered
 * the way it is. Every line below is a decision that came out of one real
 * spreadsheet, and knowing which they are is what keeps the thing usable.
 */
/**
 * What this does for *this* household, written from what is actually in it.
 *
 * A list of features is a brochure, and a brochure ages badly: half of it does
 * not apply to you and you cannot tell which half. So every point here has to
 * earn its place from the ledger — the names are your accounts and your people,
 * and a point that does not apply is simply not there.
 *
 * It also keeps the promise the rest of the app keeps: no name of yours is in
 * this file. They come out of the vault on your own device.
 */
function Why({ store }) {
  const { people = [], accounts = [], expenses = [] } = store || {};
  const me = people.find((p) => p.isMe);
  const others = people.filter((p) => !p.isMe);
  const hub = accounts.find((a) => a.kind === 'shared' && a.settlement);
  const shared = accounts.filter((a) => a.kind === 'shared');
  const business = accounts.filter((a) => a.kind === 'business');
  const live = expenses.filter((e) => e.cadence !== 'once');

  // Someone who takes part in a couple of things is a friend on a
  // subscription; someone in nearly everything is who you live with.
  const shareOf = (person) =>
    live.filter((e) => Object.keys(e.split?.weights || {}).concat(e.split?.participants || []).includes(person.id));
  const housemates = others.filter((p) => shareOf(p).length > live.length / 3);
  const friends = others.filter((p) => shareOf(p).length > 0 && shareOf(p).length <= live.length / 3);

  const fronting = live.filter(
    (e) => e.payer?.kind === 'account' && business.some((a) => a.id === e.payer.id)
  );
  const negative = live.filter((e) => e.amount < 0);
  const yearly = live.filter((e) => ['year', 'halfyear', 'quarter'].includes(e.cadence));
  const cycling = live.filter((e) => e.cadence === 'fourweek' || e.cadence === 'week');
  const grouped = Object.entries(
    live.reduce((all, e) => {
      if (e.charge) all[e.charge] = (all[e.charge] || 0) + 1;
      return all;
    }, {})
  )
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1]);
  const potsWithDeposit = shared.filter((a) =>
    Object.values(a.contributions || {}).some((c) => Number(c) > 0)
  );

  const names = (list) =>
    list.length === 1
      ? list[0].name
      : `${list.slice(0, -1).map((p) => p.name).join(', ')} en ${list[list.length - 1].name}`;

  const points = [
    live.length > 1 && [
      'Eén bedrag per maand, en dat verandert niet',
      `${hub ? `Alles loopt langs ${hub.name}, dus ` : ''}iedereen maakt één bedrag over in plaats van los af te rekenen. Elke maand hetzelfde bedrag, ook met jaarposten erin: die tellen elke maand voor een twaalfde mee. Zet het als automatische overboeking klaar en kijk er niet meer naar om.`,
    ],
    fronting.length > 0 && business.length > 0 && [
      `${business[0].name} schiet voor, jij verrekent privé`,
      `${fronting.length === 1 ? `"${fronting[0].name}" gaat` : `${count(fronting.length, 'post gaat', 'posten gaan')}`} van ${business[0].name} af, terwijl ${housemates.length ? names(housemates) : 'iemand anders'} een deel draagt. Dat komt bij jou terug${hub ? `: je stort minder op ${hub.name}` : ''}. Niemand hoeft geld naar een zakelijke rekening over te maken.`,
    ],
    friends.length > 0 && hub && [
      `${names(friends)} storten op ${hub.name}`,
      `Zij doen aan een paar posten mee, verder niets. Hun deel komt binnen op ${hub.name} en gaat op in het geheel, dus je hoeft ze nergens apart bij te houden.`,
    ],
    negative.length > 0 && [
      'Geld dat terugkomt is een post met een min',
      `${negative.map((e) => `"${e.name}"`).slice(0, 2).join(' en ')} ${negative.length === 1 ? 'staat' : 'staan'} negatief onder de post waar ${negative.length === 1 ? 'hij' : 'ze'} bij hoort. Je ziet dus wat je netto kwijt bent, niet alleen wat de bank incasseert — en het wordt net zo verdeeld als de rest.`,
    ],
    yearly.length > 0 && [
      'Je weet wat er op de rekening hoort te staan',
      `Voor ${count(yearly.length, 'post', 'posten')} die niet elke maand wordt afgeschreven gaat er maandelijks een deel opzij. Je ziet per rekening wat er nu op hoort te staan, zodat er in de maand van de afschrijving precies genoeg is en daarna weer niets.`,
    ],
    cycling.length > 0 && [
      'Vier weken is geen maand',
      `${count(cycling.length, 'post loopt', 'posten lopen')} per vier weken, dus dertien keer per jaar. Dat rekent Pay als dertien, niet als twaalf — een verschil van 8% dat je anders elk jaar mist.`,
    ],
    grouped.length > 0 && [
      'Je afschrift naast je posten',
      `${grouped[0][1]} posten gaan samen als "${grouped[0][0]}" van je rekening. Op het overzicht staan ze ook als één regel, met het bedrag dat je op je afschrift terugvindt.`,
    ],
    potsWithDeposit.length > 0 && [
      'Klopt de vaste inleg nog?',
      `Bij ${names(potsWithDeposit.map((a) => ({ name: a.name })))} staat wat er bij de bank is ingesteld naast wat er volgens de posten op moet komen. Loopt dat uit elkaar, dan loopt die rekening vol of leeg — en zie je dat vóórdat het gebeurt.`,
    ],
    [
      'Niemand kan meelezen',
      'Namen, bedragen en notities worden op je eigen apparaat versleuteld voordat ze weggaan. In de database staat één onleesbaar blok per regel. Geen leesbare kolom, dus ook de partij die de database draait ziet niets.',
    ],
    [
      'Van jou, en het blijft bestaan',
      'Eén bestand op je eigen adres, je eigen database erachter. Er is geen bedrijf dat de prijs kan verhogen, functies kan weghalen of ermee kan stoppen.',
    ],
  ].filter(Boolean);

  return (
    <>
      <div className="panel">
        {points.map(([title, blurb]) => (
          <div className="box" key={title}>
            <div className="small"><strong>{title}</strong></div>
            <div className="tiny dim" style={{ marginTop: 3, lineHeight: 1.55 }}>{blurb}</div>
          </div>
        ))}
      </div>
      <div className="hint">
        Dit is geschreven uit wat er nu in je eigen overzicht staat. Wat je hier niet ziet, gebeurt
        bij jou ook niet.
      </div>
    </>
  );
}
