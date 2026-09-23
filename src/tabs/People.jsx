// People and accounts. The two things every calculation leans on.

import { useState } from 'react';
import { Sheet, Field, Notice, Avatar, AmountInput, Confirm, Total, Money, Icon, DayPicker } from '../components/ui.jsx';
import { ACCOUNT_KINDS, accountKindOf, COLOURS } from '../data/categories.js';
import { count } from '../lib/words.js';
import { formatMoney } from '../lib/money.js';

export default function People({ store }) {
  const { people, accounts, expenses, save, remove, claim, cloud } = store;
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
          accounts={accounts}
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
          expenses={expenses}
          onSave={(record) => save('accounts', record)}
          onRemove={(id) => remove('accounts', id)}
          onClose={() => setAccount(null)}
        />
      )}
    </>
  );
}

function PersonForm({ person, people, accounts = [], cloud, onClaim, onSave, onRemove, onClose }) {
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

      {/* Optional, and it changes nothing in the ledger: the whole app answers
          "what does this cost and who carries it", and this is the one number
          that turns that into "so what is left". Without it nothing is shown;
          with it, one line per person. */}
      <Field
        label="Inkomen per maand"
        hint="Netto, wat er binnenkomt. Alleen voor je overhouden; aan de verdeling verandert het niets. Leeg mag."
      >
        <AmountInput cents={draft.income || 0} onChange={(c) => set({ income: c })} />
        {draft.income > 0 && accounts.length > 0 && (
          <>
            <div className="tiny dim" style={{ margin: '12px 0 7px' }}>
              Wordt dit vanaf een rekening in Pay betaald? Dan telt het daar als uitgave.
            </div>
            <div className="chips">
              <button
                type="button"
                className={`chip${!draft.incomeFrom ? ' on' : ''}`}
                onClick={() => set({ incomeFrom: '' })}
              >
                Van buiten Pay
              </button>
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`chip${draft.incomeFrom === a.id ? ' on' : ''}`}
                  onClick={() => set({ incomeFrom: a.id })}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </>
        )}
      </Field>

      {/* Straight off the payslip, and only where the salary comes from an
          account in Pay: the withholding leaves that account too. Entering it
          here rather than as a cost of its own keeps one payslip as one place
          to change when it changes. */}
      {draft.income > 0 && draft.incomeFrom && (
        <Field
          label="Ingehouden op dat salaris"
          hint="Loonbelasting plus Zvw, zoals op je loonstrook. Die rekening draagt het af aan de Belastingdienst."
        >
          <AmountInput cents={draft.withheld || 0} onChange={(c) => set({ withheld: c })} />
          {draft.withheld > 0 && (
            <>
              {/* Withheld on the payslip, paid to the tax office later — often
                  the last day of the month after. One payslip, two dates, so
                  the day is asked here rather than borrowed from the salary. */}
              <div style={{ marginTop: 10 }}>
                <DayPicker
                  value={draft.withheldDay}
                  onChange={(day) => set({ withheldDay: day })}
                  empty="Gaat af op de dag van het salaris"
                />
              </div>
              <div className="hint" style={{ marginTop: 8 }}>
                Kost die rekening dus <strong>{formatMoney(draft.income + draft.withheld)}</strong>{' '}
                bruto per maand. Dat hoort het brutoloon op je loonstrook te zijn. Draag je de
                loonheffing op een andere dag af dan het salaris, zet die dag dan hierboven.
              </div>
            </>
          )}
        </Field>
      )}

      {/* Only where the salary comes off an account in Pay. Paid from outside,
          there is no balance the day could move, and asking for it would be
          asking for something to do with nothing. */}
      {draft.income > 0 && draft.incomeFrom && (
        <Field
          label="Salaris komt binnen op"
          hint="Mag leeg. Vul je hem in, dan weet Pay of het salaris deze maand al van die rekening af is — en klopt wat er vandaag op hoort te staan."
        >
          <DayPicker value={draft.incomeDay} onChange={(day) => set({ incomeDay: day })} />
        </Field>
      )}

      <Field label="Kleur" hint="Waaraan je deze persoon herkent in de lijsten.">
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

function AccountForm({ account, people, accounts, expenses = [], onSave, onRemove, onClose }) {
  const [draft, setDraft] = useState(() => ({
    name: '', kind: 'shared', ownerId: null, members: [], contributions: {},
    iban: '', settlement: false, ...account,
  }));
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const shared = draft.kind === 'shared';
  const members = draft.members || [];
  // Everyone whose money lands on this account: the members, plus anyone who
  // carries a share of something it pays. Being a member is only about who is
  // proposed on a new post and whose deposit gets rounded up — it was never a
  // list of who transfers, and asking only members when their deposit arrives
  // left out exactly the people who transfer it by hand.
  const depositors = [
    ...new Set([
      ...members,
      ...expenses
        .filter((e) => e.payer?.kind === 'account' && e.payer.id === draft.id)
        .flatMap((e) => [
          ...(e.split?.participants || []),
          ...Object.keys(e.split?.weights || {}),
        ])
        .filter((key) => !String(key).startsWith('account:')),
      // On the account everything is settled through, money also goes the other
      // way: to whoever paid something the rest of you carry. That is the same
      // one transfer, on the same day, so they belong in this list too.
      ...(draft.settlement
        ? expenses.filter((e) => e.payer?.kind === 'person').map((e) => e.payer.id)
        : []),
    ]),
  ].filter((id) => people.some((p) => p.id === id));
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
        // On an account of your own the standing order is the owner's, and
        // there are no members to filter it against — the members filter above
        // would throw it away every time you saved.
        depositDays: shared
          ? Object.fromEntries(
              Object.entries(draft.depositDays || {}).filter(
                ([id, day]) => depositors.includes(id) && Number(day) >= 1 && Number(day) <= 31
              )
            )
          : {},
        contributions: shared
          ? contributions
          : draft.ownerId && Number(draft.contributions?.[draft.ownerId])
            ? { [draft.ownerId]: Number(draft.contributions[draft.ownerId]) }
            : {},
        ownerId: shared ? null : draft.ownerId,
        settlement: shared ? Boolean(draft.settlement) : false,
        // Neither question is asked of a shared account, so neither may be left
        // behind on one that used to be your own — an answer you cannot see is
        // an answer you cannot correct.
        overhead: shared ? 0 : Number(draft.overhead) || 0,
        fundedBy: shared ? '' : draft.fundedBy || '',
        frontedByOwner:
          !shared && draft.kind === 'business' && Boolean(draft.frontedByOwner),
        roundTo: shared ? Number(draft.roundTo) || 0 : 0,
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
                  Alles wordt hier verrekend
                </span>
                <span className="b" style={{ display: 'block' }}>
                  Iedereen stort zijn hele aandeel hierop, ook voor posten die van een andere
                  rekening af gingen. Wie iets voorschoot krijgt het hiervandaan terug, dus dan
                  hoef je zelf minder te storten. Zo blijft er per persoon één bedrag over.
                </span>
              </span>
            </label>
          </Field>

          {depositors.length > 0 && (
            <Field
              label="Wie stort of krijgt, en wanneer"
              hint="Het bedrag is je vaste overboeking bij de bank, alleen om naast het aandeel te leggen. De dag is wanneer dat geld overgaat — binnen of eruit, het is dezelfde overboeking. Allebei leeg mag."
            >
              <div className="panel" style={{ marginBottom: 0 }}>
                {depositors.map((id) => {
                  const p = people.find((x) => x.id === id);
                  return (
                    <div key={id} className="line">
                      <Avatar person={p} size="sm" />
                      <div className="what">
                        <div className="n">{p?.name}</div>
                        {/* Whose money lands when. Empty means the day set for
                            the account as a whole — which is the answer for
                            everyone in one direct debit batch, and wrong only
                            for whoever transfers it themselves. */}
                        <div style={{ marginTop: 6 }}>
                          <DayPicker
                            value={draft.depositDays?.[id]}
                            onChange={(day) =>
                              set({ depositDays: { ...(draft.depositDays || {}), [id]: day } })
                            }
                            empty={
                              draft.depositDay ? `de ${draft.depositDay}e, zoals de rekening` : 'Dag onbekend'
                            }
                          />
                        </div>
                      </div>
                      {/* Only a member has a standing order to hold against the
                          share; anyone else simply transfers what they owe. */}
                      {members.includes(id) && (
                        <span style={{ width: 132 }}>
                          <AmountInput
                            cents={draft.contributions?.[id] || 0}
                            onChange={(c) => set({ contributions: { ...(draft.contributions || {}), [id]: c } })}
                          />
                        </span>
                      )}
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
          hint="Betaalt deze rekening iets voor een ander, dan staat dat bij deze persoon in het krijt."
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

      {/* A standing order is not only for a pot other people pay into. Money is
          put on a business expenses account every month in exactly the same
          way, and the same question follows: does what I set at the bank still
          match what comes off? One amount here, because there is one person. */}
      {!shared && (
        <Field
          label="Komt er maandelijks op"
          hint="Geld dat van buiten Pay binnenkomt, zoals omzet. Daarmee kan Pay zeggen wat er op deze rekening blijft staan."
        >
          <AmountInput cents={draft.income || 0} onChange={(c) => set({ income: c })} />
          {draft.income > 0 && (
            <div style={{ marginTop: 10 }}>
              <DayPicker
                value={draft.incomeDay}
                onChange={(day) => set({ incomeDay: day })}
                empty="Dag onbekend"
              />
            </div>
          )}
        </Field>
      )}

      {/* Only a business account can bear a share of something another account
          paid, so only there is there anything to front. */}
      {!shared && draft.kind === 'business' && draft.ownerId && (
        <Field
          label="Meebetalen aan posten van een andere rekening"
          hint="Betaalt deze rekening mee aan een post van elders, dan moet dat geld daarheen. Doe jij dat zelf, zet dit dan aan — Pay houdt bij hoeveel."
        >
          <label className="option" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={Boolean(draft.frontedByOwner)}
              onChange={(e) => set({ frontedByOwner: e.target.checked })}
              style={{ marginTop: 3 }}
            />
            <span>
              <span className="t" style={{ display: 'block' }}>
                Dat schiet ik privé voor
              </span>
              <span className="b" style={{ display: 'block' }}>
                De kost blijft van deze rekening, alleen de betaling is van jou. Wanneer je het
                met de zaak rechttrekt is aan jou.
              </span>
            </span>
          </label>
        </Field>
      )}

      {/* A standing order is easier to live with as a round number, and what
          the rounding adds stays on the account instead of going anywhere. Only
          for the people on the account: someone paying a one-off share is asked
          for what they owe, not for a tidy figure. */}
      {shared && (
        <Field
          label="Stortingen afronden naar boven"
          hint="Geldt voor de deelnemers hierboven. Wat de afronding erbij doet blijft op de rekening staan."
        >
          <div className="chips">
            {[0, 100, 500, 1000, 2500, 5000].map((cents) => (
              <button
                key={cents}
                type="button"
                className={`chip${(Number(draft.roundTo) || 0) === cents ? ' on' : ''}`}
                onClick={() => set({ roundTo: cents })}
              >
                {cents === 0 ? 'Niet afronden' : formatMoney(cents, { decimals: 0 })}
              </button>
            ))}
          </div>
        </Field>
      )}

      {shared && (
        <Field
          label="Stortingen komen binnen op"
          hint="Mag leeg. Met een dag erbij weet Pay of de stortingen van deze maand al binnen zijn, en klopt wat er vandaag op hoort te staan."
        >
          <DayPicker value={draft.depositDay} onChange={(day) => set({ depositDay: day })} />
        </Field>
      )}

      {!shared && (
        <Field
          label="Gaat er maandelijks af, buiten je posten om"
          hint="Kosten van deze rekening die je met niemand deelt. Tellen niet mee in je maandlast, alleen bij Overhouden."
        >
          <AmountInput cents={draft.overhead || 0} onChange={(c) => set({ overhead: c })} />
          {draft.overhead > 0 && (
            <div style={{ marginTop: 10 }}>
              <DayPicker value={draft.overheadDay} onChange={(day) => set({ overheadDay: day })} />
            </div>
          )}
        </Field>
      )}

      {!shared && draft.ownerId && (
        <Field
          label="Vaste inleg per maand"
          hint="Zet je hier maandelijks een vast bedrag op? Dan legt Pay het naast wat er af gaat. Leeg mag."
        >
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="line">
              <Avatar person={people.find((p) => p.id === draft.ownerId)} size="sm" />
              <div className="what">
                <div className="n">{people.find((p) => p.id === draft.ownerId)?.name}</div>
                <div className="s">zet hier maandelijks op</div>
              </div>
              <span style={{ width: 132 }}>
                <AmountInput
                  cents={draft.contributions?.[draft.ownerId] || 0}
                  onChange={(c) => set({ contributions: { [draft.ownerId]: c } })}
                />
              </span>
            </div>
          </div>
        </Field>
      )}

      {/* Where this account is filled from, asked on its own. It used to hang
          under the standing order and only appear once an amount had been
          typed, which put the answer behind the question: an account fed by
          another one but with no amount set yet is exactly the one that has to
          say so, because then Pay works out the amount itself. */}
      {!shared && draft.ownerId && accounts.some((a) => a.id !== draft.id) && (
        <Field
          label="Wordt gevuld vanaf"
          hint={
            Number(draft.contributions?.[draft.ownerId]) > 0
              ? 'Komt die vaste inleg van een andere rekening in Pay? Dan telt hij daar als uitgave.'
              : 'Komt het geld voor deze rekening van een andere rekening in Pay? Dan telt het daar als uitgave. Zonder vaste inleg hierboven rekent Pay met wat deze rekening per maand nodig heeft.'
          }
        >
          <div className="chips">
            <button
              type="button"
              className={`chip${!draft.fundedBy ? ' on' : ''}`}
              onClick={() => set({ fundedBy: '' })}
            >
              Van buiten Pay
            </button>
            {accounts
              .filter((a) => a.id !== draft.id)
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`chip${draft.fundedBy === a.id ? ' on' : ''}`}
                  onClick={() => set({ fundedBy: a.id })}
                >
                  {a.name}
                </button>
              ))}
          </div>
          {draft.fundedBy && (
            <div style={{ marginTop: 10 }}>
              <DayPicker
                value={draft.feedDay}
                onChange={(day) => set({ feedDay: day })}
                empty="Dag van die overboeking onbekend"
              />
            </div>
          )}
        </Field>
      )}

      <details className="disclose" style={{ marginBottom: 18 }}>
        <summary>Rekeningnummer</summary>
        <div style={{ marginTop: 16 }}>
          <Field label="IBAN" hint="Om over te tikken bij het overmaken.">
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
