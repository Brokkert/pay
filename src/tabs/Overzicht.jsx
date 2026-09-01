// Het overzicht: wat loopt er, en wie moet wie wat.

import { useMemo } from 'react';
import { Boekregel, Totaal, Geld, Penning, Note, Empty } from '../components/ui.jsx';
import { rekenMaand, losseSaldi, isPot, partijId, partijNaam } from '../lib/saldo.js';
import { toonMaand, verschuifMaand, dezeMaand } from '../lib/ritme.js';
import { categorieVan, soortVan } from '../data/categorieen.js';
import { toonGeld } from '../lib/geld.js';

export default function Overzicht({ kasboek, maand, onMaand, onOpen }) {
  const { personen, rekeningen, posten } = kasboek;
  const uitkomst = useMemo(
    () => rekenMaand({ personen, rekeningen, posten }, maand),
    [personen, rekeningen, posten, maand]
  );
  const los = useMemo(() => losseSaldi(posten, rekeningen), [posten, rekeningen]);
  const mij = personen.find((p) => p.is_mij);
  const noem = (partij) => partijNaam(partij, { personen, rekeningen });

  if (!posten.length) {
    return (
      <Empty art="🧾" title="Nog niets geboekt">
        Voeg je eerste vaste last toe met de knop rechtsonder. Begin gerust met de huur — de rest
        volgt vanzelf zodra je ziet hoe het eruitziet.
      </Empty>
    );
  }

  const zakelijk = uitkomst.regels
    .filter((r) => r.post.zakelijk)
    .reduce((s, r) => s + r.bedrag, 0);

  return (
    <>
      <Maandkiezer maand={maand} onMaand={onMaand} />

      {uitkomst.waarschuwingen.map((w) => (
        <Note key={w} tone="warn">{w}</Note>
      ))}

      {/* De twee getallen waar het om draait: wat er in totaal loopt, en wat
          daarvan uiteindelijk van jou is. */}
      <div className="card lijnen">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>
              Loopt deze maand
            </div>
            <Geld centen={uitkomst.maandlast} maat="groot" />
            <div className="tiny faint" style={{ marginTop: 2 }}>
              {toonGeld(uitkomst.jaarlast)} per jaar · {uitkomst.regels.length} posten
            </div>
          </div>
          {mij && (
            <div style={{ textAlign: 'right' }}>
              <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>
                Jouw deel
              </div>
              <Geld centen={uitkomst.draagt[mij.id] || 0} maat="mid" />
            </div>
          )}
        </div>
        {zakelijk > 0 && (
          <div className="tiny faint" style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--rule-soft)' }}>
            Waarvan zakelijk geboekt: {toonGeld(zakelijk)} per maand.
          </div>
        )}
      </div>

      {/* Het antwoord op "wat moet zij overmaken". */}
      {uitkomst.stromen.length > 0 && (
        <>
          <div className="section-title">Elke maand overmaken</div>
          {uitkomst.stromen.map((s) => (
            <Stroom key={`${s.van}-${s.naar}`} stroom={s} personen={personen} noem={noem} mij={mij} />
          ))}
          <div className="hint" style={{ marginTop: -2 }}>
            Dit zijn de bedragen ná wegstrepen. Zet ze als vaste overboeking klaar en je hoeft er
            geen maand meer naar om te kijken.
          </div>
        </>
      )}

      {/* Per gezamenlijke pot: wat gaat eraf, wat komt erin. */}
      {uitkomst.potten.map((pot) => (
        <Pot key={pot.rekening.id} pot={pot} personen={personen} />
      ))}

      {los.stromen.length > 0 && (
        <>
          <div className="section-title">Nog los af te rekenen</div>
          {los.stromen.map((s) => (
            <Stroom key={`los-${s.van}-${s.naar}`} stroom={s} personen={personen} noem={noem} mij={mij} />
          ))}
          <div className="hint" style={{ marginTop: -2 }}>
            Eenmalige uitgaven. Vink ze in <strong>Lasten</strong> af zodra ze betaald zijn.
          </div>
        </>
      )}

      <div className="section-title">Waar het heen gaat</div>
      <div className="card">
        {Object.entries(uitkomst.perCategorie)
          .sort((a, b) => b[1] - a[1])
          .map(([id, centen]) => {
            const cat = categorieVan(id);
            return (
              <Boekregel
                key={id}
                wat={`${cat.emoji}  ${cat.label}`}
                onder={`${Math.round((centen / uitkomst.maandlast) * 100)}% van het totaal`}
                centen={centen}
              />
            );
          })}
        <Totaal label="Per maand" centen={uitkomst.maandlast} />
      </div>

      <div className="section-title">Wat er van welke rekening af gaat</div>
      <div className="card">
        {rekeningen.map((r) => (
          <Boekregel
            key={r.id}
            wat={`${r.emoji || soortVan(r.soort).emoji}  ${r.naam}`}
            onder={soortVan(r.soort).label}
            centen={uitkomst.perRekening[r.id] || 0}
          />
        ))}
      </div>

      <div className="section-title">Wat ieder uiteindelijk draagt</div>
      <div className="card">
        {personen.map((p) => (
          <Boekregel
            key={p.id}
            wat={p.naam}
            onder={p.is_mij ? 'jij' : undefined}
            centen={uitkomst.draagt[p.id] || 0}
          />
        ))}
        <Totaal label="Samen" centen={uitkomst.maandlast} />
      </div>
      <div className="hint">
        Dit is de last ná verdeling, ongeacht van wiens rekening het afgeschreven wordt. De som is
        precies de maandlast: er raakt geen cent zoek en er komt er geen bij.
      </div>
    </>
  );
}

function Maandkiezer({ maand, onMaand }) {
  return (
    <div className="maandkiezer">
      <button onClick={() => onMaand(verschuifMaand(maand, -1))} aria-label="Vorige maand">‹</button>
      <span className="naam">{toonMaand(maand)}</span>
      <button onClick={() => onMaand(verschuifMaand(maand, 1))} aria-label="Volgende maand">›</button>
      {maand !== dezeMaand() && (
        <button className="btn ghost sm" onClick={() => onMaand(dezeMaand())}>nu</button>
      )}
    </div>
  );
}

function Stroom({ stroom, personen, noem, mij }) {
  const van = personen.find((p) => p.id === stroom.van);
  const naarPersoon = isPot(stroom.naar) ? null : personen.find((p) => p.id === partijId(stroom.naar));
  const richting = mij && stroom.van === mij.id ? 'mij-af' : mij && naarPersoon?.id === mij.id ? 'mij-toe' : '';

  return (
    <div className={`stroom ${richting}`}>
      <div className="wie">
        <Penning persoon={van} maat="klein" />
        <span className="small truncate">{van?.naam || 'onbekend'}</span>
      </div>
      <span className="pijl">→</span>
      <div className="wie grow">
        {naarPersoon ? <Penning persoon={naarPersoon} maat="klein" /> : <span className="penning klein">🤝</span>}
        <span className="small truncate">{noem(stroom.naar)}</span>
      </div>
      <Geld centen={stroom.centen} maat="mid" toon={richting === 'mij-af' ? 'krijt' : richting === 'mij-toe' ? 'tegoed' : ''} />
    </div>
  );
}

function Pot({ pot, personen }) {
  const heeft = Object.keys(pot.stortingen || {}).length > 0;
  return (
    <>
      <div className="section-title">{pot.rekening.naam}</div>
      <div className="card">
        <Boekregel wat="Gaat er deze maand af" centen={pot.uit} />
        {Object.entries(pot.aandeel).map(([id, centen]) => {
          const p = personen.find((x) => x.id === id);
          return <Boekregel key={id} wat={`Aandeel ${p?.naam || '?'}`} centen={centen} />;
        })}
        {heeft && (
          <>
            <Boekregel wat="Wordt er maandelijks gestort" centen={pot.inleg} />
            <Totaal
              label={pot.verschil >= 0 ? 'Blijft over' : 'Komt tekort'}
              centen={Math.abs(pot.verschil)}
              toon={pot.verschil >= 0 ? 'tegoed' : 'krijt'}
            />
          </>
        )}
      </div>
      {!heeft && (
        <div className="hint" style={{ marginTop: -2 }}>
          Vul bij <strong>Mensen</strong> in wat ieder maandelijks stort, dan zie je hier meteen of
          de pot uitkomt.
        </div>
      )}
    </>
  );
}
