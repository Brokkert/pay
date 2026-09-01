// Per persoon: wat loopt er tussen jullie, en waar komt dat vandaan.
//
// Het overzicht geeft het eindbedrag; hier staat de onderbouwing. Dat is niet
// overbodig — een verrekening die je niet kunt navertellen, ga je niet
// vertrouwen.

import { useMemo, useState } from 'react';
import { Post, Som, Geld, Wie, Leeg, Blad, Melding } from '../components/ui.jsx';
import { rekenMaand, losseSaldi, betalerPartij, isPot, partijId, partijNaam } from '../lib/saldo.js';
import { toonMaand } from '../lib/ritme.js';
import { categorieVan } from '../data/categorieen.js';
import { toonGeld } from '../lib/geld.js';

export default function Verrekenen({ kasboek, maand }) {
  const { personen, rekeningen, posten } = kasboek;
  const [open, setOpen] = useState(null);

  const uit = useMemo(
    () => rekenMaand({ personen, rekeningen, posten }, maand),
    [personen, rekeningen, posten, maand]
  );
  const los = useMemo(() => losseSaldi(posten, rekeningen), [posten, rekeningen]);
  const mij = personen.find((p) => p.is_mij);

  // Per persoon één regel: wat er maandelijks tussen jou en hen loopt, en wat er
  // nog los openstaat. Positief betekent: naar jou toe.
  const regels = useMemo(() => {
    if (!mij) return [];
    const optellen = (stromen) => {
      const per = {};
      const mijnPartij = `persoon:${mij.id}`;
      for (const s of stromen) {
        // Alleen wat tussen twee mensen loopt; het verkeer met een gezamenlijke
        // rekening staat hierboven apart.
        if (isPot(s.van) || isPot(s.naar)) continue;
        if (s.van === mijnPartij) per[partijId(s.naar)] = (per[partijId(s.naar)] || 0) - s.centen;
        else if (s.naar === mijnPartij) per[partijId(s.van)] = (per[partijId(s.van)] || 0) + s.centen;
      }
      return per;
    };
    const maandelijks = optellen(uit.stromen);
    const losse = optellen(los.stromen);
    const ids = new Set([...Object.keys(maandelijks), ...Object.keys(losse)]);
    return [...ids]
      .map((id) => ({
        persoon: personen.find((p) => p.id === id),
        maandelijks: maandelijks[id] || 0,
        los: losse[id] || 0,
      }))
      .filter((r) => r.persoon && (r.maandelijks || r.los))
      .sort(
        (a, b) =>
          Math.abs(b.maandelijks) + Math.abs(b.los) - Math.abs(a.maandelijks) - Math.abs(a.los)
      );
  }, [uit.stromen, los.stromen, personen, mij]);

  const metPotten = uit.stromen.filter((s) => isPot(s.van) !== isPot(s.naar));

  if (!mij) {
    return (
      <Melding toon="let">
        Geef bij <strong>Mensen</strong> eerst aan wie van de personen jij bent. Zonder dat weet Pay
        niet vanuit wie het moet rekenen.
      </Melding>
    );
  }

  if (!regels.length && !metPotten.length) {
    return (
      <Leeg icoon="verrekenen" titel="Niets te verrekenen">
        Zodra iemand meedoet aan een post die jij betaalt — of jij aan een van hen — staat het hier.
      </Leeg>
    );
  }

  return (
    <>
      {metPotten.length > 0 && (
        <>
          <div className="kop">Met de gezamenlijke rekeningen</div>
          <div className="paneel">
            {metPotten.map((s) => {
              const heen = !isPot(s.van);
              const persoon = personen.find((x) => x.id === partijId(heen ? s.van : s.naar));
              const rekeningNaam = partijNaam(heen ? s.naar : s.van, { personen, rekeningen });
              return (
                <Post
                  key={`${s.van}-${s.naar}`}
                  links={<Wie persoon={persoon} maat="klein" />}
                  wat={persoon?.naam || '?'}
                  onder={heen ? `stort op ${rekeningNaam}` : `krijgt terug van ${rekeningNaam}`}
                  centen={heen ? s.centen : -s.centen}
                  toon={heen ? '' : 'tegoed'}
                />
              );
            })}
            <Som
              label={`Per maand · ${toonMaand(maand)}`}
              centen={metPotten.reduce((s, x) => s + (isPot(x.van) ? -x.centen : x.centen), 0)}
            />
          </div>
          <div className="tip">
            Storten is geen kostenpost — je zet er geld klaar waar de gedeelde lasten van afgaan.
            Wat ieder werkelijk draagt staat op het overzicht.
          </div>
        </>
      )}

      {regels.length > 0 && <div className="kop">Onderling</div>}
      {regels.length > 0 && (
        <div className="paneel">
          {regels.map((r) => (
            <button key={r.persoon.id} className="regel" onClick={() => setOpen(r.persoon)}>
              <Wie persoon={r.persoon} maat="groot" />
              <span className="mid">
                <span className="titel kort" style={{ display: 'block' }}>{r.persoon.naam}</span>
                <span className="onder" style={{ display: 'block' }}>
                  {r.maandelijks === 0
                    ? 'alleen iets losstaands'
                    : r.maandelijks > 0
                      ? 'staat bij jou in het krijt'
                      : 'daar sta jij in het krijt'}
                </span>
              </span>
              <span className="rechts">
                <Geld
                  centen={Math.abs(r.maandelijks)}
                  maat="mid"
                  toon={r.maandelijks === 0 ? '' : r.maandelijks > 0 ? 'tegoed' : 'krijt'}
                />
                <span className="onder" style={{ display: 'block' }}>
                  {r.maandelijks >= 0 ? 'krijg je' : 'betaal je'} /mnd
                </span>
                {r.los !== 0 && (
                  <span
                    className="onder"
                    style={{ display: 'block', color: r.los > 0 ? 'var(--plus)' : 'var(--min)' }}
                  >
                    {toonGeld(Math.abs(r.los))} los
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <Onderbouwing
          persoon={open}
          mij={mij}
          uit={uit}
          los={los}
          rekeningen={rekeningen}
          onSluit={() => setOpen(null)}
        />
      )}
    </>
  );
}

/** Waar het bedrag vandaan komt: elke post die tussen jullie tweeën meespeelt. */
function Onderbouwing({ persoon, mij, uit, los, rekeningen, onSluit }) {
  const regels = [...uit.regels, ...los.regels]
    .map((regel) => {
      const partij = regel.partij ?? betalerPartij(regel.post, rekeningen);
      const betaler = isPot(partij) ? null : partijId(partij);
      // Alleen posten waarbij precies een van jullie tweeën betaalt en de ander
      // meedraagt: alleen die verschuiven geld tussen jullie.
      if (betaler === mij.id && regel.delen[persoon.id]) {
        return { post: regel.post, centen: regel.delen[persoon.id] };
      }
      if (betaler === persoon.id && regel.delen[mij.id]) {
        return { post: regel.post, centen: -regel.delen[mij.id] };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.centen) - Math.abs(a.centen));

  const totaal = regels.reduce((s, r) => s + r.centen, 0);

  return (
    <Blad titel={`Jij en ${persoon.naam}`} onSluit={onSluit}>
      <div className="paneel">
        {regels.map(({ post, centen }) => (
          <Post
            key={post.id}
            links={
              <span className="stip-cat" style={{ background: categorieVan(post.categorie).kleur }} />
            }
            wat={post.naam}
            onder={
              centen > 0
                ? `jij betaalt, ${persoon.naam} draagt mee`
                : `${persoon.naam} betaalt, jij draagt mee`
            }
            centen={centen}
            toon={centen > 0 ? 'tegoed' : 'krijt'}
          />
        ))}
        <Som
          label={totaal >= 0 ? `${persoon.naam} → jij` : `jij → ${persoon.naam}`}
          centen={Math.abs(totaal)}
          toon={totaal >= 0 ? 'tegoed' : 'krijt'}
        />
      </div>
      <div className="tip">
        Alles wat maar één kant op wijst is al weggestreept: dit is het bedrag dat er netto
        overblijft. Eenmalige posten staan er tegen hun volle bedrag bij, de rest per maand.
      </div>
    </Blad>
  );
}
