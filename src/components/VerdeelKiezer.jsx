// Wie draagt welk deel.
//
// Het belangrijkste onderdeel van het formulier, en daarom staat er meteen
// onder wat de gekozen verdeling in euro's betekent. Een percentage zegt niets;
// "Anne € 612,50 per maand" wel.

import { VERDELINGEN, verdeel, deelnemersVan } from '../lib/verdeel.js';
import { perMaand, ritmeVan } from '../lib/ritme.js';
import { Field, Geld, Penning, BedragVeld } from './ui.jsx';

export default function VerdeelKiezer({ bedrag, ritme, verdeling, personen, onChange }) {
  const v = verdeling || { soort: 'gelijk', deelnemers: [], gewichten: {} };
  const meedoen = new Set(deelnemersVan(v));
  const maandbedrag = perMaand(bedrag, ritme);
  const toonbedrag = ritme === 'eenmalig' ? bedrag : maandbedrag;
  const { delen, restant } = verdeel(toonbedrag, v);

  const zetSoort = (soort) => {
    const ids = [...meedoen];
    if (soort === 'gelijk') return onChange({ soort, deelnemers: ids, gewichten: {} });
    if (soort === 'procent') {
      // Nette startwaarden: gelijk verdeeld over wie er al in zat.
      const ieder = ids.length ? Math.round(100 / ids.length) : 0;
      const gewichten = Object.fromEntries(ids.map((id) => [id, ieder]));
      if (ids.length) gewichten[ids[0]] = 100 - ieder * (ids.length - 1);
      return onChange({ soort, deelnemers: ids, gewichten });
    }
    if (soort === 'delen') {
      return onChange({ soort, deelnemers: ids, gewichten: Object.fromEntries(ids.map((id) => [id, 1])) });
    }
    // Vaste bedragen beginnen bij de verdeling die er nu ligt, zodat je alleen
    // hoeft bij te schaven in plaats van alles opnieuw in te tikken.
    return onChange({ soort, deelnemers: ids, gewichten: { ...delen } });
  };

  const wissel = (id) => {
    const aan = meedoen.has(id);
    if (v.soort === 'gelijk') {
      const ids = aan ? v.deelnemers.filter((x) => x !== id) : [...(v.deelnemers || []), id];
      return onChange({ ...v, deelnemers: ids });
    }
    const gewichten = { ...(v.gewichten || {}) };
    if (aan) delete gewichten[id];
    else gewichten[id] = v.soort === 'bedrag' ? 0 : v.soort === 'procent' ? 0 : 1;
    return onChange({ ...v, gewichten });
  };

  const zetGewicht = (id, waarde) =>
    onChange({ ...v, gewichten: { ...(v.gewichten || {}), [id]: waarde } });

  const eenheid = ritme === 'eenmalig' ? 'eenmalig' : ritmeVan('maand').kort;
  const somProcent = v.soort === 'procent'
    ? Object.values(v.gewichten || {}).reduce((s, g) => s + (Number(g) || 0), 0)
    : 100;

  return (
    <>
      <Field label="Wie draagt het">
        <div className="chips">
          {personen.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chip${meedoen.has(p.id) ? ' on' : ''}`}
              onClick={() => wissel(p.id)}
            >
              <Penning persoon={p} maat="klein" /> {p.naam}
            </button>
          ))}
        </div>
        {!meedoen.size && (
          <div className="hint">Kies minstens één persoon, anders telt deze post nergens mee.</div>
        )}
      </Field>

      {meedoen.size > 1 && (
        <Field label="Hoe">
          <div className="chips">
            {VERDELINGEN.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`chip${v.soort === s.id ? ' on' : ''}`}
                onClick={() => zetSoort(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="hint">{VERDELINGEN.find((s) => s.id === v.soort)?.blurb}</div>
        </Field>
      )}

      {meedoen.size > 0 && (
        <div className="card tight" style={{ marginBottom: 14 }}>
          <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
            Komt neer op ({eenheid})
          </div>
          <div style={{ marginTop: 6 }}>
            {[...meedoen].map((id) => {
              const persoon = personen.find((p) => p.id === id);
              return (
                <div key={id} className="boekregel">
                  <div className="wat row" style={{ gap: 7 }}>
                    <Penning persoon={persoon} maat="klein" />
                    <span className="small">{persoon?.naam || 'onbekend'}</span>
                  </div>
                  {v.soort === 'delen' && (
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1"
                      style={{ width: 62, padding: '5px 7px', textAlign: 'right' }}
                      value={v.gewichten?.[id] ?? 1}
                      onChange={(e) => zetGewicht(id, Number(e.target.value))}
                    />
                  )}
                  {v.soort === 'procent' && (
                    <div className="row" style={{ gap: 3 }}>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        style={{ width: 62, padding: '5px 7px', textAlign: 'right' }}
                        value={v.gewichten?.[id] ?? 0}
                        onChange={(e) => zetGewicht(id, Number(e.target.value))}
                      />
                      <span className="tiny faint">%</span>
                    </div>
                  )}
                  {v.soort === 'bedrag' && (
                    <div style={{ width: 130 }}>
                      <BedragVeld centen={v.gewichten?.[id] ?? 0} onChange={(c) => zetGewicht(id, c)} />
                    </div>
                  )}
                  <div className="vul" />
                  <Geld centen={delen[id] || 0} />
                </div>
              );
            })}
          </div>

          <Balk delen={delen} personen={personen} />

          {v.soort === 'procent' && somProcent !== 100 && (
            <div className="hint" style={{ color: 'var(--oker)' }}>
              De percentages tellen op tot {somProcent}%. Het bedrag wordt naar verhouding
              verdeeld, dus het klopt wel — maar waarschijnlijk bedoelde je 100.
            </div>
          )}
          {restant !== 0 && (
            <div className="hint" style={{ color: 'var(--oker)' }}>
              Er blijft <Geld centen={restant} /> over. Dat deel komt bij de betaler te liggen.
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Het staafje eronder: één blokje per persoon, naar rato van het bedrag. */
function Balk({ delen, personen }) {
  const totaal = Object.values(delen).reduce((s, c) => s + Math.abs(c), 0);
  if (!totaal) return null;
  return (
    <div className="balk" style={{ marginTop: 8 }}>
      {Object.entries(delen).map(([id, centen], i) => (
        <span
          key={id}
          style={{
            width: `${(Math.abs(centen) / totaal) * 100}%`,
            background: personen.find((p) => p.id === id)?.kleur || `var(--groen)`,
            opacity: 1 - i * 0.14,
          }}
        />
      ))}
    </div>
  );
}
