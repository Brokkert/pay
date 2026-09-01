// Alle posten, met filters. Hier zoek je op "wat loopt er eigenlijk allemaal".

import { useMemo, useState } from 'react';
import { Geld, Leeg, Wie, Icoon } from '../components/ui.jsx';
import { perMaand, perJaar, ritmeVan, loopt } from '../lib/ritme.js';
import { verdeel, omschrijfVerdeling } from '../lib/verdeel.js';
import { categorieVan } from '../data/categorieen.js';
import { toonGeld } from '../lib/geld.js';

const SORTERING = [
  { id: 'bedrag', label: 'Duurste eerst' },
  { id: 'naam', label: 'Op naam' },
  { id: 'categorie', label: 'Op categorie' },
];

const FILTERS = [
  ['alles', 'Alles'],
  ['lopend', 'Loopt nu'],
  ['gedeeld', 'Gedeeld'],
  ['alleen-ik', 'Alleen ik'],
  ['eenmalig', 'Eenmalig'],
  ['zakelijk', 'Zakelijk'],
  ['gestopt', 'Loopt niet'],
];

export default function Lasten({ kasboek, maand, onOpen, onNieuw, onBewaar }) {
  const { personen, rekeningen, posten } = kasboek;
  const [zoek, setZoek] = useState('');
  const [filter, setFilter] = useState('alles');
  const [sortering, setSortering] = useState('bedrag');
  const mij = personen.find((p) => p.is_mij);

  const rijen = useMemo(() => {
    const term = zoek.trim().toLowerCase();
    return posten
      .filter((p) => {
        if (term && !`${p.naam} ${p.notitie || ''}`.toLowerCase().includes(term)) return false;
        const aantalDeelnemers =
          (p.verdeling?.deelnemers?.length || 0) + Object.keys(p.verdeling?.gewichten || {}).length;
        if (filter === 'lopend') return loopt(p, maand);
        if (filter === 'eenmalig') return p.ritme === 'eenmalig';
        if (filter === 'gedeeld') return aantalDeelnemers > 1;
        if (filter === 'alleen-ik') return aantalDeelnemers === 1 && mij && p.verdeling?.deelnemers?.[0] === mij.id;
        if (filter === 'zakelijk') return Boolean(p.zakelijk);
        if (filter === 'gestopt') return !loopt(p, maand) && p.ritme !== 'eenmalig';
        return true;
      })
      .map((post) => {
        const maandbedrag = perMaand(post.bedrag, post.ritme);
        const { delen } = verdeel(post.ritme === 'eenmalig' ? post.bedrag : maandbedrag, post.verdeling);
        return { post, maandbedrag, delen };
      })
      .sort((a, b) => {
        if (sortering === 'naam') return a.post.naam.localeCompare(b.post.naam, 'nl');
        if (sortering === 'categorie') {
          return (a.post.categorie || '').localeCompare(b.post.categorie || '', 'nl')
            || b.maandbedrag - a.maandbedrag;
        }
        return b.maandbedrag - a.maandbedrag || a.post.naam.localeCompare(b.post.naam, 'nl');
      });
  }, [posten, zoek, filter, sortering, maand, mij]);

  const totaal = rijen.reduce((s, r) => s + r.maandbedrag, 0);

  return (
    <>
      <div style={{ margin: '4px 0 12px', position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-3)' }}>
          <Icoon naam="zoek" maat={18} />
        </span>
        <input
          className="invoer"
          style={{ paddingLeft: 40 }}
          placeholder="Zoeken"
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
        />
      </div>

      <div className="balkje">
        {FILTERS.map(([id, label]) => (
          <button key={id} className={`blokje${filter === id ? ' aan' : ''}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="rij klein vaag" style={{ marginBottom: 10 }}>
        <span className="groei">
          {rijen.length} {rijen.length === 1 ? 'post' : 'posten'} · {toonGeld(totaal)} per maand
        </span>
        <select
          className="keuze"
          style={{ width: 'auto', padding: '5px 30px 5px 10px', fontSize: 12.5 }}
          value={sortering}
          onChange={(e) => setSortering(e.target.value)}
          aria-label="Sortering"
        >
          {SORTERING.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {!rijen.length ? (
        <Leeg icoon="zoek" titel="Niets gevonden">
          Pas het filter aan, of voeg een post toe met de knop rechtsonder.
        </Leeg>
      ) : (
        <div className="paneel">
          {rijen.map((rij) => (
            <PostRegel
              key={rij.post.id}
              rij={rij}
              maand={maand}
              personen={personen}
              rekeningen={rekeningen}
              onOpen={onOpen}
              onBewaar={onBewaar}
            />
          ))}
        </div>
      )}

      <button className="zwever" onClick={onNieuw} aria-label="Nieuwe post">
        <Icoon naam="plus" maat={22} />
      </button>
    </>
  );
}

function PostRegel({ rij, maand, personen, rekeningen, onOpen, onBewaar }) {
  const { post, maandbedrag, delen } = rij;
  const cat = categorieVan(post.categorie);
  const ritme = ritmeVan(post.ritme);
  const actief = loopt(post, maand) || post.ritme === 'eenmalig';
  // Hier hoort de rekening te staan waar het vanaf gaat, niet de partij uit de
  // boekhouding: bij een zakelijke rekening is dat "Zaak", en niet jouw naam.
  const betaler =
    post.betaler?.soort === 'rekening'
      ? rekeningen.find((r) => r.id === post.betaler.id)?.naam
      : personen.find((p) => p.id === post.betaler?.id)?.naam;
  const meedoeners = Object.keys(delen);
  const naamVan = (id) => personen.find((p) => p.id === id)?.naam || '?';

  return (
    <button className="regel" onClick={() => onOpen(post)} style={actief ? undefined : { opacity: 0.5 }}>
      <span className="stip-cat" style={{ background: cat.kleur, alignSelf: 'flex-start', marginTop: 7 }} />

      <span className="mid">
        <span className="rij" style={{ gap: 7 }}>
          <span className="titel kort">{post.naam}</span>
          {post.zakelijk && <span className="blokje stil mini">zakelijk</span>}
          {post.gepauzeerd && <span className="blokje stil mini">gepauzeerd</span>}
          {post.ritme === 'eenmalig' && post.afgerekend && (
            <span className="blokje stil mini">afgerekend</span>
          )}
        </span>
        <span className="onder kort" style={{ display: 'block' }}>
          {betaler ? `van ${betaler}` : 'geen rekening'} · {omschrijfVerdeling(post.verdeling, naamVan)}
        </span>
        <span className="stapel" style={{ marginTop: 6 }}>
          {meedoeners.slice(0, 5).map((id) => (
            <Wie key={id} persoon={personen.find((p) => p.id === id)} maat="klein" />
          ))}
          {meedoeners.length > 5 && (
            <span className="mini vaag" style={{ marginLeft: 8, alignSelf: 'center' }}>
              +{meedoeners.length - 5}
            </span>
          )}
        </span>
      </span>

      <span className="rechts">
        <Geld centen={post.ritme === 'eenmalig' ? post.bedrag : maandbedrag} maat="mid" />
        <span className="onder" style={{ display: 'block' }}>
          {post.ritme === 'maand' || post.ritme === 'eenmalig'
            ? ritme.kort
            : `${toonGeld(post.bedrag)} ${ritme.kort}`}
        </span>
        {post.ritme !== 'eenmalig' && (
          <span className="onder" style={{ display: 'block' }}>
            {toonGeld(perJaar(post.bedrag, post.ritme))} /jr
          </span>
        )}
        {post.ritme === 'eenmalig' && (
          <span
            className="knop sm"
            role="button"
            tabIndex={0}
            style={{ marginTop: 6 }}
            onClick={(e) => { e.stopPropagation(); onBewaar({ ...post, afgerekend: !post.afgerekend }); }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.stopPropagation();
              e.preventDefault();
              onBewaar({ ...post, afgerekend: !post.afgerekend });
            }}
          >
            {post.afgerekend ? 'Heropenen' : 'Afgerekend'}
          </span>
        )}
      </span>
    </button>
  );
}
