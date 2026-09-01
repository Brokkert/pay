// Per persoon: wat loopt er tussen jullie, en waar komt dat vandaan.
//
// Het overzicht geeft het eindbedrag; hier staat de onderbouwing. Dat is niet
// overbodig — een verrekening die je niet kunt navertellen, ga je niet vertrouwen.

import { useMemo, useState } from 'react';
import { Boekregel, Totaal, Geld, Penning, Empty, Sheet, Note } from '../components/ui.jsx';
import { rekenMaand, losseSaldi, betalerPartij, isPot, partijId, partijNaam } from '../lib/saldo.js';
import { toonMaand } from '../lib/ritme.js';
import { categorieVan } from '../data/categorieen.js';
import { toonGeld } from '../lib/geld.js';

export default function Verrekenen({ kasboek, maand }) {
  const { personen, rekeningen, posten } = kasboek;
  const [open, setOpen] = useState(null);

  const uitkomst = useMemo(
    () => rekenMaand({ personen, rekeningen, posten }, maand),
    [personen, rekeningen, posten, maand]
  );
  const los = useMemo(() => losseSaldi(posten, rekeningen), [posten, rekeningen]);
  const mij = personen.find((p) => p.is_mij);

  // Per persoon één regel: wat er maandelijks tussen jou en hen loopt, en wat
  // er nog los openstaat. Positief betekent: die kant op naar jou toe.
  const regels = useMemo(() => {
    if (!mij) return [];
    const optellen = (stromen) => {
      const per = {};
      for (const s of stromen) {
        if (s.van === mij.id && !isPot(s.naar)) {
          per[partijId(s.naar)] = (per[partijId(s.naar)] || 0) - s.centen;
        } else if (!isPot(s.naar) && partijId(s.naar) === mij.id) {
          per[s.van] = (per[s.van] || 0) + s.centen;
        }
      }
      return per;
    };
    const perMaand = optellen(uitkomst.stromen);
    const perLos = optellen(los.stromen);
    const ids = new Set([...Object.keys(perMaand), ...Object.keys(perLos)]);
    return [...ids]
      .map((id) => ({
        persoon: personen.find((p) => p.id === id),
        maandelijks: perMaand[id] || 0,
        los: perLos[id] || 0,
      }))
      .filter((r) => r.persoon && (r.maandelijks || r.los))
      .sort((a, b) => Math.abs(b.maandelijks) + Math.abs(b.los) - Math.abs(a.maandelijks) - Math.abs(a.los));
  }, [uitkomst.stromen, los.stromen, personen, mij]);

  const naarPotten = uitkomst.stromen.filter((s) => isPot(s.naar));

  if (!mij) {
    return (
      <Note tone="warn">
        Geef bij <strong>Mensen</strong> eerst aan wie van de personen jij bent. Zonder dat weet Pay
        niet vanuit wie het moet rekenen.
      </Note>
    );
  }

  if (!regels.length && !naarPotten.length) {
    return (
      <Empty art="🤝" title="Niets te verrekenen">
        Zodra iemand meedoet aan een post die jij betaalt — of jij aan een van hen — staat het hier.
      </Empty>
    );
  }

  return (
    <>
      {naarPotten.length > 0 && (
        <>
          <div className="section-title">Naar de gezamenlijke pot</div>
          <div className="card">
            {naarPotten.map((s) => {
              const p = personen.find((x) => x.id === s.van);
              return (
                <Boekregel
                  key={`${s.van}-${s.naar}`}
                  wat={p?.naam || '?'}
                  onder={`naar ${partijNaam(s.naar, { personen, rekeningen })}`}
                  centen={s.centen}
                />
              );
            })}
            <Totaal label={`Per maand · ${toonMaand(maand)}`} centen={naarPotten.reduce((s, x) => s + x.centen, 0)} />
          </div>
          <div className="hint">
            Storten in de pot is geen kostenpost — je zet er geld klaar waar de gedeelde lasten van
            afgaan. Wat ieder werkelijk draagt staat op het overzicht.
          </div>
        </>
      )}

      {regels.length > 0 && <div className="section-title">Onderling</div>}
      {regels.map((r) => (
        <button key={r.persoon.id} className="card pressable" onClick={() => setOpen(r.persoon)}>
          <div className="row">
            <Penning persoon={r.persoon} maat="groot" />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="strong truncate">{r.persoon.naam}</div>
              <div className="tiny faint">
                {r.maandelijks === 0
                  ? 'alleen iets losstaands'
                  : r.maandelijks > 0
                    ? `staat bij jou in het krijt`
                    : `daar sta jij in het krijt`}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Geld
                centen={Math.abs(r.maandelijks)}
                maat="mid"
                toon={r.maandelijks === 0 ? '' : r.maandelijks > 0 ? 'tegoed' : 'krijt'}
              />
              <div className="tiny faint">{r.maandelijks >= 0 ? 'krijg je' : 'betaal je'} /mnd</div>
              {r.los !== 0 && (
                <div className="tiny" style={{ color: r.los > 0 ? 'var(--groen)' : 'var(--rood)' }}>
                  {toonGeld(Math.abs(r.los))} los
                </div>
              )}
            </div>
          </div>
        </button>
      ))}

      {open && (
        <Onderbouwing
          persoon={open}
          mij={mij}
          uitkomst={uitkomst}
          los={los}
          personen={personen}
          rekeningen={rekeningen}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/** Waar het bedrag vandaan komt: elke post die tussen jullie tweeën meespeelt. */
function Onderbouwing({ persoon, mij, uitkomst, los, personen, rekeningen, onClose }) {
  const regels = [...uitkomst.regels, ...los.regels.map((r) => ({ ...r, bedrag: null }))]
    .map((regel) => {
      const partij = regel.partij ?? betalerPartij(regel.post, rekeningen);
      const betalerPersoon = isPot(partij) ? null : partijId(partij);
      // Alleen posten waarbij precies een van jullie tweeën betaalt en de ander
      // meedraagt: alleen die verschuiven geld tussen jullie.
      if (betalerPersoon === mij.id && regel.delen[persoon.id]) {
        return { post: regel.post, centen: regel.delen[persoon.id] };
      }
      if (betalerPersoon === persoon.id && regel.delen[mij.id]) {
        return { post: regel.post, centen: -regel.delen[mij.id] };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.centen) - Math.abs(a.centen));

  const totaal = regels.reduce((s, r) => s + r.centen, 0);

  return (
    <Sheet title={`Jij en ${persoon.naam}`} onClose={onClose}>
      <div className="card tight">
        {regels.map(({ post, centen }) => (
          <Boekregel
            key={post.id}
            wat={`${categorieVan(post.categorie).emoji}  ${post.naam}`}
            onder={centen > 0 ? `jij betaalt, ${persoon.naam} draagt mee` : `${persoon.naam} betaalt, jij draagt mee`}
            centen={centen}
            toon={centen > 0 ? 'tegoed' : 'krijt'}
          />
        ))}
        <Totaal
          label={totaal >= 0 ? `${persoon.naam} → jij` : `jij → ${persoon.naam}`}
          centen={Math.abs(totaal)}
          toon={totaal >= 0 ? 'tegoed' : 'krijt'}
        />
      </div>
      <div className="hint">
        Alles wat maar één kant op wijst is al weggestreept: dit is het bedrag dat er netto
        overblijft. Eenmalige posten staan er tegen hun volle bedrag bij, de rest per maand.
      </div>
    </Sheet>
  );
}
