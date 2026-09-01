// Wie draagt welk deel.
//
// Het belangrijkste onderdeel van het formulier, en daarom staat er meteen
// onder wat de gekozen verdeling in euro's betekent. Een percentage zegt niets;
// "Partner € 152,64 per maand" wel.

import { VERDELINGEN, verdeel, deelnemersVan, mogelijkeDragers } from '../lib/verdeel.js';
import { perMaand } from '../lib/ritme.js';
import { Veld, Geld, Drager, Bedrag } from './ui.jsx';

export default function VerdeelKiezer({ bedrag, ritme, verdeling, personen, rekeningen = [], onChange }) {
  const dragers = mogelijkeDragers(personen, rekeningen);
  const dragerVan = (sleutel) => dragers.find((d) => d.sleutel === sleutel);
  const v = verdeling || { soort: 'gelijk', deelnemers: [], gewichten: {} };
  const meedoen = deelnemersVan(v);
  const inSet = new Set(meedoen);
  const toonbedrag = ritme === 'eenmalig' ? bedrag : perMaand(bedrag, ritme);
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
    const aan = inSet.has(id);
    if (v.soort === 'gelijk') {
      const ids = aan ? (v.deelnemers || []).filter((x) => x !== id) : [...(v.deelnemers || []), id];
      return onChange({ ...v, deelnemers: ids });
    }
    const gewichten = { ...(v.gewichten || {}) };
    if (aan) delete gewichten[id];
    else gewichten[id] = v.soort === 'delen' ? 1 : 0;
    return onChange({ ...v, gewichten });
  };

  const zetGewicht = (id, waarde) =>
    onChange({ ...v, gewichten: { ...(v.gewichten || {}), [id]: waarde } });

  const somProcent = Object.values(v.gewichten || {}).reduce((s, g) => s + (Number(g) || 0), 0);

  return (
    <>
      <Veld
        label="Wie draagt het"
        tip={!meedoen.length ? 'Kies minstens één persoon, anders telt deze post nergens mee.' : null}
        let={!meedoen.length}
      >
        <div className="blokjes">
          {dragers.map((d) => (
            <button
              key={d.sleutel}
              type="button"
              className={`blokje${inSet.has(d.sleutel) ? ' aan' : ''}`}
              onClick={() => wissel(d.sleutel)}
            >
              <Drager drager={d} maat="klein" /> {d.naam}
            </button>
          ))}
        </div>
        {rekeningen.some((r) => r.soort === 'zakelijk') && (
          <div className="tip">
            Een zakelijke rekening kan zelf een deel dragen. Is een kwart van je bankkosten
            zakelijk, dan draagt de zaak dat kwart en staat het niet bij jou privé — en zie je
            meteen wat je bij de zaak kunt terughalen.
          </div>
        )}
      </Veld>

      {meedoen.length > 1 && (
        <Veld label="Hoe" tip={VERDELINGEN.find((s) => s.id === v.soort)?.blurb}>
          <div className="blokjes">
            {VERDELINGEN.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`blokje${v.soort === s.id ? ' aan' : ''}`}
                onClick={() => zetSoort(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Veld>
      )}

      {meedoen.length > 0 && (
        <div className="veld">
          <label>Komt neer op {ritme === 'eenmalig' ? '(eenmalig)' : '(per maand)'}</label>
          <div className="paneel">
            {meedoen.map((id) => {
              const drager = dragerVan(id);
              return (
                <div key={id} className="post">
                  <Drager drager={drager} maat="klein" />
                  <div className="wat"><div className="n kort">{drager?.naam || 'onbekend'}</div></div>

                  {v.soort === 'delen' && (
                    <input
                      className="invoer"
                      type="number"
                      min="0"
                      step="1"
                      aria-label={`Aantal delen voor ${drager?.naam}`}
                      style={{ width: 58, padding: '5px 8px', textAlign: 'right', fontSize: 14 }}
                      value={v.gewichten?.[id] ?? 1}
                      onChange={(e) => zetGewicht(id, Number(e.target.value))}
                    />
                  )}
                  {v.soort === 'procent' && (
                    <span className="rij" style={{ gap: 4 }}>
                      <input
                        className="invoer"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        aria-label={`Percentage voor ${drager?.naam}`}
                        style={{ width: 58, padding: '5px 8px', textAlign: 'right', fontSize: 14 }}
                        value={v.gewichten?.[id] ?? 0}
                        onChange={(e) => zetGewicht(id, Number(e.target.value))}
                      />
                      <span className="mini vaag">%</span>
                    </span>
                  )}
                  {v.soort === 'bedrag' && (
                    <span style={{ width: 128 }}>
                      <Bedrag centen={v.gewichten?.[id] ?? 0} onChange={(c) => zetGewicht(id, c)} />
                    </span>
                  )}

                  <Geld centen={delen[id] || 0} />
                </div>
              );
            })}

            <div className="vak krap">
              <Verhouding delen={delen} dragerVan={dragerVan} />
            </div>
          </div>

          {v.soort === 'procent' && meedoen.length > 1 && somProcent !== 100 && (
            <div className="tip let">
              De percentages tellen op tot {somProcent}%. Het bedrag wordt naar verhouding verdeeld,
              dus het klopt wel — maar waarschijnlijk bedoelde je 100.
            </div>
          )}
          {restant !== 0 && (
            <div className="tip let">
              Er blijft <Geld centen={restant} /> over. Dat deel komt bij de betaler te liggen.
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Het balkje eronder: één blokje per drager, naar rato van het bedrag. */
function Verhouding({ delen, dragerVan }) {
  const totaal = Object.values(delen).reduce((s, c) => s + Math.abs(c), 0);
  if (!totaal) return null;
  return (
    <div className="verhouding">
      {Object.entries(delen).map(([id, centen]) => (
        <span
          key={id}
          style={{
            width: `${(Math.abs(centen) / totaal) * 100}%`,
            background: dragerVan(id)?.kleur || 'var(--text-3)',
          }}
        />
      ))}
    </div>
  );
}
