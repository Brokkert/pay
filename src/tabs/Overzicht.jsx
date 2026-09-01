// Het overzicht: wat loopt er, en wie moet wie wat.

import { useMemo } from 'react';
import { Post, Som, Geld, Wie, Melding, Leeg, Icoon } from '../components/ui.jsx';
import { rekenMaand, losseSaldi, isPot, partijId, partijNaam } from '../lib/saldo.js';
import { toonMaand, verschuifMaand, dezeMaand } from '../lib/ritme.js';
import { categorieVan, soortVan } from '../data/categorieen.js';
import { toonGeld } from '../lib/geld.js';

export default function Overzicht({ kasboek, maand, onMaand }) {
  const { personen, rekeningen, posten } = kasboek;
  const uit = useMemo(
    () => rekenMaand({ personen, rekeningen, posten }, maand),
    [personen, rekeningen, posten, maand]
  );
  const los = useMemo(() => losseSaldi(posten, rekeningen), [posten, rekeningen]);
  const mij = personen.find((p) => p.is_mij);
  const noem = (partij) => partijNaam(partij, { personen, rekeningen });

  if (!posten.length) {
    return (
      <Leeg icoon="bon" titel="Nog niets geboekt">
        Voeg je eerste vaste last toe met de knop rechtsonder. Heb je al een overzicht in Excel?
        Plak het dan in één keer via <strong>Meer → Plakken uit Excel</strong>.
      </Leeg>
    );
  }

  const zakelijk = uit.regels.filter((r) => r.post.zakelijk).reduce((s, r) => s + r.bedrag, 0);

  return (
    <>
      <Maandkiezer maand={maand} onMaand={onMaand} />

      {uit.waarschuwingen.map((w) => <Melding key={w} toon="let">{w}</Melding>)}

      {/* De twee getallen waar het om draait: wat er in totaal loopt, en wat
          daarvan uiteindelijk van jou is. */}
      <div className="paneel">
        <div className="vak ruim">
          <div className="rij" style={{ alignItems: 'flex-start' }}>
            <div className="groei">
              <div className="kop" style={{ margin: '0 0 6px' }}>Loopt deze maand</div>
              <Geld centen={uit.maandlast} maat="groot" />
              <div className="mini vaag" style={{ marginTop: 6 }}>
                {toonGeld(uit.jaarlast)} per jaar · {uit.regels.length} posten
              </div>
            </div>
            {mij && (
              <div style={{ textAlign: 'right' }}>
                <div className="kop" style={{ margin: '0 0 6px' }}>Jouw deel</div>
                <Geld centen={uit.draagt[mij.id] || 0} maat="mid" />
              </div>
            )}
          </div>
        </div>
        {zakelijk > 0 && (
          <Post wat="Waarvan zakelijk geboekt" onder="telt apart voor je boekhouding" centen={zakelijk} />
        )}
      </div>

      {/* Het antwoord op "wat moet zij overmaken". */}
      {uit.stromen.length > 0 && (
        <>
          <div className="kop">Elke maand overmaken</div>
          <div className="paneel">
            {uit.stromen.map((s) => (
              <Stroom key={`${s.van}-${s.naar}`} stroom={s} personen={personen} noem={noem} mij={mij} />
            ))}
          </div>
          <div className="tip" style={{ marginTop: -4 }}>
            Dit zijn de bedragen ná wegstrepen. Zet ze als vaste overboeking klaar en je hoeft er
            geen maand meer naar om te kijken.
          </div>
        </>
      )}

      {uit.potten.map((pot) => <Pot key={pot.rekening.id} pot={pot} personen={personen} />)}

      {los.stromen.length > 0 && (
        <>
          <div className="kop">Nog los af te rekenen</div>
          <div className="paneel">
            {los.stromen.map((s) => (
              <Stroom key={`los-${s.van}-${s.naar}`} stroom={s} personen={personen} noem={noem} mij={mij} />
            ))}
          </div>
          <div className="tip" style={{ marginTop: -4 }}>
            Eenmalige uitgaven. Vink ze bij <strong>Lasten</strong> af zodra ze betaald zijn.
          </div>
        </>
      )}

      <div className="kop">Waar het heen gaat</div>
      <div className="paneel">
        {Object.entries(uit.perCategorie).sort((a, b) => b[1] - a[1]).map(([id, centen]) => {
          const cat = categorieVan(id);
          return (
            <Post
              key={id}
              links={<span className="stip-cat" style={{ background: cat.kleur }} />}
              wat={cat.label}
              onder={`${Math.round((centen / uit.maandlast) * 100)}% van het totaal`}
              centen={centen}
            />
          );
        })}
        <Som label="Per maand" centen={uit.maandlast} />
      </div>

      <div className="kop">Wat er van welke rekening af gaat</div>
      <div className="paneel">
        {rekeningen.map((r) => (
          <Post key={r.id} wat={r.naam} onder={soortVan(r.soort).label} centen={uit.perRekening[r.id] || 0} />
        ))}
      </div>

      <div className="kop">Wat ieder uiteindelijk draagt</div>
      <div className="paneel">
        {personen.map((p) => (
          <Post
            key={p.id}
            links={<Wie persoon={p} maat="klein" />}
            wat={p.naam}
            onder={p.is_mij ? 'jij' : undefined}
            centen={uit.draagt[p.id] || 0}
          />
        ))}
        <Som label="Samen" centen={uit.maandlast} />
      </div>
      <div className="tip">
        Dit is de last ná verdeling, ongeacht van wiens rekening het afgeschreven wordt. De som is
        precies de maandlast: er raakt geen cent zoek en er komt er geen bij.
      </div>
    </>
  );
}

function Maandkiezer({ maand, onMaand }) {
  return (
    <div className="maand">
      <button onClick={() => onMaand(verschuifMaand(maand, -1))} aria-label="Vorige maand">
        <Icoon naam="links" maat={17} />
      </button>
      <span className="naam">{toonMaand(maand)}</span>
      <button onClick={() => onMaand(verschuifMaand(maand, 1))} aria-label="Volgende maand">
        <Icoon naam="rechts" maat={17} />
      </button>
      {maand !== dezeMaand() && (
        <button className="knop stil sm" onClick={() => onMaand(dezeMaand())}>nu</button>
      )}
    </div>
  );
}

function Stroom({ stroom, personen, noem, mij }) {
  const van = personen.find((p) => p.id === stroom.van);
  const naarPersoon = isPot(stroom.naar) ? null : personen.find((p) => p.id === partijId(stroom.naar));
  // Rood en groen betekenen "in het krijt" en "tegoed". Storten in je eigen
  // gezamenlijke pot is geen van beide — dat is je eigen geld verplaatsen — dus
  // dat blijft neutraal.
  const afOfToe = !mij || !naarPersoon
    ? ''
    : stroom.van === mij.id ? 'krijt' : naarPersoon.id === mij.id ? 'tegoed' : '';

  return (
    <div className="stroom">
      <span className="naam">
        <Wie persoon={van} maat="klein" />
        <span className="klein kort">{van?.naam || 'onbekend'}</span>
      </span>
      <span className="pijl"><Icoon naam="pijl" maat={15} /></span>
      <span className="naam groei">
        {naarPersoon
          ? <Wie persoon={naarPersoon} maat="klein" />
          : <span className="wie klein" style={{ background: 'var(--accent)' }}>◆</span>}
        <span className="klein kort">{noem(stroom.naar)}</span>
      </span>
      <Geld centen={stroom.centen} maat="mid" toon={afOfToe} />
    </div>
  );
}

function Pot({ pot, personen }) {
  const heeftInleg = Object.values(pot.stortingen || {}).some((c) => Number(c) > 0);
  return (
    <>
      <div className="kop">{pot.rekening.naam}</div>
      <div className="paneel">
        <Post wat="Gaat er deze maand af" centen={pot.uit} />
        {Object.entries(pot.aandeel).map(([id, centen]) => {
          const p = personen.find((x) => x.id === id);
          return (
            <Post
              key={id}
              links={<Wie persoon={p} maat="klein" />}
              wat={`Aandeel ${p?.naam || '?'}`}
              centen={centen}
            />
          );
        })}
        {heeftInleg && (
          <>
            <Post wat="Wordt er maandelijks gestort" centen={pot.inleg} />
            <Som
              label={pot.verschil >= 0 ? 'Blijft over' : 'Komt tekort'}
              centen={Math.abs(pot.verschil)}
              toon={pot.verschil >= 0 ? 'tegoed' : 'krijt'}
            />
          </>
        )}
      </div>
      {!heeftInleg && (
        <div className="tip" style={{ marginTop: -4 }}>
          Vul bij <strong>Mensen</strong> in wat ieder maandelijks stort, dan zie je hier meteen of
          de pot uitkomt.
        </div>
      )}
    </>
  );
}
