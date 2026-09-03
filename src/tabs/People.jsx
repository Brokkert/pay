// People and accounts. The two things every calculation leans on.

import { useState } from 'react';
import { Sheet, Field, Notice, Avatar, AmountInput, Confirm, Total, Money, Icon } from '../components/ui.jsx';
import { ACCOUNT_KINDS, accountKindOf, COLOURS } from '../data/categories.js';
import { count } from '../lib/words.js';

export default function People({ store }) {
  const { people, accounts, save, remove, claim, cloud } = store;
  const [person, setPerson] = useState(null);
  const [account, setAccount] = useState(null);

  return (
    <>
      <div className="section">Personen</div>
      {!people.length && (
        <Notice tone="info">
          Voeg jezelf toe, je huisgenoot, en iedereen met wie je iets deelt. Vrienden hoeven geen
          account te hebben — je houdt gewoon bij wat er tussen jullie loopt.
        </Notice>
      )}
      {people.length > 0 && (
        <div className="panel">
          {people.map((p) => (
            <button key={p.id} className="item" onClick={() => setPerson(p)}>
              <Avatar person={p} size="lg" />
              <span className="mid">
                <span className="title truncate" style={{ display: 'block' }}>{p.name}</span>
                <span className="sub" style={{ display: 'block' }}>
                  {p.isMe ? 'dat ben jij' : p.linked_user ? 'heeft een eigen account' : 'geen account'}
                </span>
              </span>
              <span className="chev"><Icon name="right" size={16} /></span>
            </button>
          ))}
        </div>
      )}
      <button className="btn wide" onClick={() => setPerson({})}>
        <Icon name="plus" size={16} /> Persoon toevoegen
      </button>

      <div className="section">Rekeningen</div>
      {!accounts.length && (
        <Notice tone="info">
          Een rekening is waar het geld daadwerkelijk vanaf gaat. Maak er in elk geval één
          gezamenlijke aan als jullie een gedeelde pot hebben.
        </Notice>
      )}
      {accounts.length > 0 && (
        <div className="panel">
          {accounts.map((a) => {
            const kind = accountKindOf(a.kind);
            const owner = people.find((p) => p.id === a.ownerId);
            const paidIn = Object.values(a.contributions || {}).reduce((s, c) => s + (Number(c) || 0), 0);
            return (
              <button key={a.id} className="item" onClick={() => setAccount(a)}>
                <span className="mid">
                  <span className="title truncate" style={{ display: 'block' }}>{a.name}</span>
                  <span className="sub truncate" style={{ display: 'block' }}>
                    {kind.label}
                    {a.kind === 'shared'
                      ? ` · ${count((a.members || []).length, 'deelnemer', 'deelnemers')}`
                      : owner ? ` · van ${owner.name}` : ' · geen eigenaar'}
                  </span>
                </span>
                {paidIn > 0 && (
                  <span className="right">
                    <Money cents={paidIn} />
                    <span className="sub" style={{ display: 'block' }}>inleg /mnd</span>
                  </span>
                )}
                <span className="chev"><Icon name="right" size={16} /></span>
              </button>
            );
          })}
        </div>
      )}
      <button className="btn wide" onClick={() => setAccount({})}>
        <Icon name="plus" size={16} /> Rekening toevoegen
      </button>

      {person && (
        <PersonForm
          person={person}
          people={people}
          cloud={cloud}
          onClaim={claim}
          onSave={(record) => save('people', record)}
          onRemove={(id) => remove('people', id)}
          onClose={() => setPerson(null)}
        />
      )}
      {account && (
        <AccountForm
          account={account}
          people={people}
          accounts={accounts}
          onSave={(record) => save('accounts', record)}
          onRemove={(id) => remove('accounts', id)}
          onClose={() => setAccount(null)}
        />
      )}
    </>
  );
}

function PersonForm({ person, people, cloud, onClaim, onSave, onRemove, onClose }) {
  const [draft, setDraft] = useState(() => ({
    name: '',
    colour: COLOURS[people.length % COLOURS.length],
    isMe: false,
    ...person,
  }));
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const someoneElseIsMe = people.some((p) => p.isMe && p.id !== person.id);

  const save = async () => {
    try {
      await onSave({ ...draft, name: draft.name.trim() });
      onClose();
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  return (
    <Sheet title={person.id ? 'Persoon wijzigen' : 'Nieuwe persoon'} onClose={onClose}>
      {error && <Notice tone="error">{error}</Notice>}

      <div className="row" style={{ gap: 14, marginBottom: 18 }}>
        <Avatar person={draft} size="lg" />
        <div className="grow">
          <input
            className="input"
            autoFocus
            placeholder="Naam"
            aria-label="Naam"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
      </div>

      <Field label="Kleur" hint="Waar je deze persoon aan herkent in de lijsten en balkjes.">
        <div className="chips">
          {COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Kleur ${c}`}
              onClick={() => set({ colour: c })}
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: c,
                border: draft.colour === c ? '2px solid var(--text)' : '2px solid transparent',
                boxShadow: draft.colour === c ? '0 0 0 2px var(--bg) inset' : 'none',
              }}
            />
          ))}
        </div>
      </Field>

      {cloud ? (
        person.id && (
          <div className="panel" style={{ marginBottom: 18 }}>
            <div className="box">
              {draft.isMe ? (
                <div className="small">Dit ben jij — gekoppeld aan je account.</div>
              ) : (
                <>
                  <div className="small muted">
                    {draft.linked_user
                      ? 'Deze persoon heeft een eigen account.'
                      : 'Deze persoon heeft geen account.'}
                  </div>
                  {!draft.linked_user && (
                    <button
                      className="btn sm"
                      style={{ marginTop: 10 }}
                      onClick={async () => {
                        try {
                          await onClaim(person.id);
                          onClose();
                        } catch (err) {
                          setError(err.message || String(err));
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
        <label className="row" style={{ gap: 10, marginBottom: 18 }}>
          <input
            type="checkbox"
            checked={Boolean(draft.isMe)}
            disabled={someoneElseIsMe && !draft.isMe}
            onChange={(e) => set({ isMe: e.target.checked })}
          />
          <span className="small">
            Dit ben ik
            {someoneElseIsMe && !draft.isMe && <span className="dim"> — al aan iemand anders toegekend</span>}
          </span>
        </label>
      )}

      <div className="row" style={{ gap: 8 }}>
        {person.id && <button className="btn danger" onClick={() => setAsking(true)}>Verwijderen</button>}
        <button className="btn primary grow" disabled={!draft.name.trim()} onClick={save}>
          Bewaren
        </button>
      </div>

      {asking && (
        <Confirm
          title={`${draft.name} verwijderen?`}
          body="Posten waarin deze persoon meedeelt blijven bestaan, maar zijn aandeel verdwijnt uit de berekening. Loop die posten daarna even na."
          onConfirm={() => { onRemove(person.id); onClose(); }}
          onClose={() => setAsking(false)}
        />
      )}
    </Sheet>
  );
}

function AccountForm({ account, people, accounts, onSave, onRemove, onClose }) {
  const [draft, setDraft] = useState(() => ({
    name: '', kind: 'shared', ownerId: null, members: [], contributions: {},
    iban: '', settlement: false, ...account,
  }));
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const shared = draft.kind === 'shared';
  const members = draft.members || [];
  const paidIn = Object.values(draft.contributions || {}).reduce((s, c) => s + (Number(c) || 0), 0);

  const toggleMember = (id) =>
    set({ members: members.includes(id) ? members.filter((x) => x !== id) : [...members, id] });

  const save = async () => {
    try {
      // Contributions from people who no longer take part should not travel along.
      const contributions = Object.fromEntries(
        Object.entries(draft.contributions || {}).filter(([id]) => members.includes(id))
      );
      // Only one account can be the settlement point; otherwise the engine would
      // not know where a settlement should go. So switch it off on the rest.
      if (draft.settlement && shared) {
        for (const other of accounts) {
          if (other.id !== account.id && other.settlement) {
            await onSave({ ...other, settlement: false });
          }
        }
      }
      await onSave({
        ...draft,
        name: draft.name.trim(),
        members: shared ? members : [],
        contributions: shared ? contributions : {},
        ownerId: shared ? null : draft.ownerId,
        settlement: shared ? Boolean(draft.settlement) : false,
      });
      onClose();
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  const canSave = draft.name.trim() && (shared ? members.length > 0 : draft.ownerId);

  return (
    <Sheet title={account.id ? 'Rekening wijzigen' : 'Nieuwe rekening'} onClose={onClose}>
      {error && <Notice tone="error">{error}</Notice>}

      <Field label="Naam">
        <input
          className="input"
          autoFocus
          placeholder="Vaste lasten, privé, zaak…"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>

      <Field label="Wat voor rekening">
        <div className="col">
          {ACCOUNT_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`option${draft.kind === k.id ? ' on' : ''}`}
              onClick={() => set({ kind: k.id })}
            >
              <span className="dot" />
              <span>
                <span className="t" style={{ display: 'block' }}>{k.label}</span>
                <span className="b" style={{ display: 'block' }}>{k.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </Field>

      {shared ? (
        <>
          <Field label="Wie storten erop">
            <div className="chips">
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`chip${members.includes(p.id) ? ' on' : ''}`}
                  onClick={() => toggleMember(p.id)}
                >
                  <Avatar person={p} size="sm" /> {p.name}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Verrekenen">
            <label className="option" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={Boolean(draft.settlement)}
                onChange={(e) => set({ settlement: e.target.checked })}
                style={{ marginTop: 3 }}
              />
              <span>
                <span className="t" style={{ display: 'block' }}>
                  Onderlinge verrekeningen lopen hierlangs
                </span>
                <span className="b" style={{ display: 'block' }}>
                  Iedereen stort zijn hele aandeel op deze rekening — ook voor dingen die van een
                  eigen of zakelijke rekening af gingen, en ook vrienden die alleen een abonnement
                  met je delen. Deze rekening betaalt het daarna terug aan wie het voorschoot, zodat
                  er één bedrag per persoon overblijft in plaats van losse verrekeningen. Schiet jij
                  iets voor, dan hoef je zelf minder te storten.
                </span>
              </span>
            </label>
          </Field>

          {members.length > 0 && (
            <Field
              label="Vaste inleg per maand"
              hint="Wat er nu daadwerkelijk maandelijks op gestort wordt. Pay zet dat naast het werkelijke aandeel, zodat je ziet of de pot uitkomt. Laat leeg als jullie precies het aandeel overmaken."
            >
              <div className="panel" style={{ marginBottom: 0 }}>
                {members.map((id) => {
                  const p = people.find((x) => x.id === id);
                  return (
                    <div key={id} className="line">
                      <Avatar person={p} size="sm" />
                      <div className="what"><div className="n">{p?.name}</div></div>
                      <span style={{ width: 132 }}>
                        <AmountInput
                          cents={draft.contributions?.[id] || 0}
                          onChange={(c) => set({ contributions: { ...(draft.contributions || {}), [id]: c } })}
                        />
                      </span>
                    </div>
                  );
                })}
                <Total label="Samen per maand" cents={paidIn} />
              </div>
            </Field>
          )}
        </>
      ) : (
        <Field
          label="Van wie is deze rekening"
          hint="Wat anderen meegebruiken van deze rekening, staat bij deze persoon in het krijt."
        >
          <div className="chips">
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`chip${draft.ownerId === p.id ? ' on' : ''}`}
                onClick={() => set({ ownerId: p.id })}
              >
                <Avatar person={p} size="sm" /> {p.name}
              </button>
            ))}
          </div>
        </Field>
      )}

      <details className="disclose" style={{ marginBottom: 18 }}>
        <summary>Rekeningnummer</summary>
        <div style={{ marginTop: 16 }}>
          <Field label="IBAN" hint="Alleen om over te tikken bij het overmaken. Blijft in je eigen huishouden.">
            <input
              className="input"
              placeholder="NL00 BANK 0000 0000 00"
              value={draft.iban || ''}
              onChange={(e) => set({ iban: e.target.value })}
            />
          </Field>
        </div>
      </details>

      <div className="row" style={{ gap: 8 }}>
        {account.id && <button className="btn danger" onClick={() => setAsking(true)}>Verwijderen</button>}
        <button className="btn primary grow" disabled={!canSave} onClick={save}>Bewaren</button>
      </div>
      {!canSave && (
        <div className="hint">
          {shared ? 'Kies minstens één deelnemer.' : 'Kies van wie deze rekening is.'}
        </div>
      )}

      {asking && (
        <Confirm
          title={`${draft.name} verwijderen?`}
          body="Posten die van deze rekening afgingen houden geen rekening meer over en tellen dan niet mee. Pay waarschuwt daar wel over op het overzicht."
          onConfirm={() => { onRemove(account.id); onClose(); }}
          onClose={() => setAsking(false)}
        />
      )}
    </Sheet>
  );
}
