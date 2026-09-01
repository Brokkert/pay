// Het overzicht: wat loopt er, en wie moet wie wat.

import { useMemo } from 'react';
import { Post, Som, Geld, Wie, Drager, Melding, Leeg, Icoon } from '../components/ui.jsx';
import { rekenMaand, losseSaldi, isPot, partijId, partijNaam } from '../lib/saldo.js';
import { toonMaand, verschuifMaand, dezeMaand } from '../lib/ritme.js';
import { categorieVan, soortVan } from '../data/categorieen.js';
import { mogelijkeDragers } from '../lib/verdeel.js';
import { toonGeld } from '../lib/geld.js';

export default function Overzicht({ kasboek, maand, onMaand }) {
  const { personen, rekeningen, posten } = kasboek;
  const uit = useMemo(
    () => rekenMaand({ personen, rekeningen, posten }, maand),
    [personen, rekeningen, posten, maand]
  );
  const los = useMemo(() => losseSaldi(posten, rekeningen), [posten, rekeningen]);
  const mij = personen.find((p) => p.is_mij);
  const context = { personen, rekeningen };

  if (!posten.length) {
    return (
      <Leeg icoon="bon" titel="Nog niets geboekt">
        Voeg je eerste vaste last toe met de knop rechtsonder. Heb je al een overzicht in Excel of
        Numbers? Plak het dan in één keer via <strong>Meer → Plakken</strong>.
      </Leeg>
    );
  }

  const zakelijk = uit.regels.filter((r) => r.post.zakelijk).reduce((s, r) => s + r.bedrag, 0);
  const bundels = Object.entries(uit.perBundel).sort((a, b) => b[1] - a[1]);

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
              <Stroom key={`${s.van}-${s.naar}`} stroom={s} context={context} mij={mij} />
            ))}
          </div>
          <div className="tip" style={{ marginTop: -4 }}>
            {uit.hub ? (
              <>
                Alles is weggestreept en langs <strong>{uit.hub.naam}</strong> geleid: ook wat er van
                een andere rekening af ging, wordt daar verrekend. Ieder maakt dus één bedrag over.
              </>
            ) : (
              <>
                Dit zijn de bedragen ná wegstrepen. Zet ze als vaste overboeking klaar en je hoeft
                er geen maand meer naar om te kijken.
              </>
            )}
          </div>
        </>
      )}

      {uit.potten.map((pot) => (
        <Pot key={pot.rekening.id} pot={pot} personen={personen} hub={uit.hub} />
      ))}

      {bundels.length > 0 && (
        <>
          <div className="kop">Per incasso</div>
          <div className="paneel">
            {bundels.map(([naam, centen]) => (
              <Post
                key={naam}
                wat={naam}
                onder={`${uit.regels.filter((r) => r.post.bundel === naam).length} posten op één afschrijving`}
                centen={centen}
              />
            ))}
          </div>
          <div className="tip" style={{ marginTop: -4 }}>
            Posten die samen op één afschrijving staan. Handig om tegen je bankafschrift te houden.
          </div>
        </>
      )}

      {los.stromen.length > 0 && (
        <>
          <div className="kop">Nog los af te rekenen</div>
          <div className="paneel">
            {los.stromen.map((s) => (
              <Stroom key={`los-${s.van}-${s.naar}`} stroom={s} context={context} mij={mij} />
            ))}
          </div>
          <div className="tip" style={{ marginTop: -4 }}>
            Eenmalige uitgaven, rechtstreeks af te rekenen. Vink ze bij <strong>Lasten</strong> af
            zodra dat gebeurd is.
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
        {mogelijkeDragers(personen, rekeningen)
          .filter((d) => d.rekening === null || uit.draagt[d.sleutel])
          .map((d) => (
            <Post
              key={d.sleutel}
              links={<Drager drager={d} maat="klein" />}
              wat={d.naam}
              onder={
                d.rekening ? 'zakelijk deel' : personen.find((p) => p.id === d.sleutel)?.is_mij ? 'jij' : undefined
              }
              centen={uit.draagt[d.sleutel] || 0}
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

/** Eén partij in een verrekening: een persoon met initialen, of een rekening. */
function Partij({ partij, context }) {
  const naam = partijNaam(partij, context);
  if (isPot(partij)) {
    return (
      <span className="naam">
        <span className="wie klein" style={{ background: 'var(--accent)' }}>
          <Icoon naam="overzicht" maat={12} />
        </span>
        <span className="klein kort">{naam}</span>
      </span>
    );
  }
  return (
    <span className="naam">
      <Wie persoon={context.personen.find((p) => p.id === partijId(partij))} maat="klein" />
      <span className="klein kort">{naam}</span>
    </span>
  );
}

function Stroom({ stroom, context, mij }) {
  // Rood en groen betekenen "in het krijt" en "tegoed". Geld naar je eigen
  // gezamenlijke rekening is geen van beide — dat is je eigen geld verplaatsen —
  // dus dat blijft neutraal.
  const mijnPartij = mij ? `persoon:${mij.id}` : null;
  const tussenMensen = !isPot(stroom.van) && !isPot(stroom.naar);
  const toon = !tussenMensen
    ? ''
    : stroom.van === mijnPartij ? 'krijt' : stroom.naar === mijnPartij ? 'tegoed' : '';

  return (
    <div className="stroom">
      <Partij partij={stroom.van} context={context} />
      <span className="pijl"><Icoon naam="pijl" maat={15} /></span>
      <span className="groei" style={{ minWidth: 0 }}>
        <Partij partij={stroom.naar} context={context} />
      </span>
      <Geld centen={stroom.centen} maat="mid" toon={toon} />
    </div>
  );
}

function Pot({ pot, personen, hub }) {
  const heeftInleg = Object.values(pot.stortingen || {}).some((c) => Number(c) > 0);
  const isHub = hub?.id === pot.rekening.id;
  const naam = (id) => personen.find((x) => x.id === id)?.naam || '?';

  return (
    <>
      <div className="kop">{pot.rekening.naam}</div>
      <div className="paneel">
        <Post wat="Gaat er deze maand af" centen={pot.uit} />
        {Object.entries(pot.erin).map(([id, centen]) => (
          <Post
            key={`in-${id}`}
            links={<Wie persoon={personen.find((x) => x.id === id)} maat="klein" />}
            wat={`${naam(id)} stort`}
            centen={centen}
          />
        ))}
        {Object.entries(pot.eruit).map(([id, centen]) => (
          <Post
            key={`uit-${id}`}
            links={<Wie persoon={personen.find((x) => x.id === id)} maat="klein" />}
            wat={`Terug naar ${naam(id)}`}
            onder="voorgeschoten van een andere rekening"
            centen={-centen}
          />
        ))}
        {heeftInleg && (
          <>
            <Post wat="Staat als vaste inleg ingesteld" centen={pot.inleg} />
            <Som
              label={pot.verschil >= 0 ? 'Blijft over' : 'Komt tekort'}
              centen={Math.abs(pot.verschil)}
              toon={pot.verschil >= 0 ? 'tegoed' : 'krijt'}
            />
          </>
        )}
      </div>
      {isHub && (
        <div className="tip" style={{ marginTop: -4 }}>
          Alle onderlinge verrekeningen lopen hierlangs. Wat iemand voorschoot van een eigen of
          zakelijke rekening, komt hier binnen en gaat er weer uit — dat is de reden dat je zelf
          minder hoeft te storten.
        </div>
      )}
      {!heeftInleg && !isHub && (
        <div className="tip" style={{ marginTop: -4 }}>
          Vul bij <strong>Mensen</strong> in wat ieder maandelijks stort, dan zie je hier meteen of
          de rekening uitkomt.
        </div>
      )}
    </>
  );
}
