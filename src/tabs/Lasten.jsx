// Alle posten, met filters. Hier zoek je op "wat loopt er eigenlijk allemaal".

import { useMemo, useState } from 'react';
import { Geld, Empty, Penning } from '../components/ui.jsx';
import { perMaand, perJaar, ritmeVan, loopt } from '../lib/ritme.js';
import { verdeel, omschrijfVerdeling } from '../lib/verdeel.js';
import { betalerPartij } from '../lib/saldo.js';
import { categorieVan } from '../data/categorieen.js';
import { toonGeld } from '../lib/geld.js';

const SORTERING = [
  { id: 'bedrag', label: 'Duurste eerst' },
  { id: 'naam', label: 'Op naam' },
  { id: 'categorie', label: 'Op categorie' },
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
        if (filter === 'lopend') return loopt(p, maand);
        if (filter === 'eenmalig') return p.ritme === 'eenmalig';
        if (filter === 'gedeeld') return (p.verdeling?.deelnemers?.length || Object.keys(p.verdeling?.gewichten || {}).length) > 1;
        if (filter === 'zakelijk') return Boolean(p.zakelijk);
        if (filter === 'gestopt') return !loopt(p, maand) && p.ritme !== 'eenmalig';
        return true;
      })
      .map((post) => {
        const maandbedrag = perMaand(post.bedrag, post.ritme);
        const partij = betalerPartij(post, rekeningen);
        const { delen } = verdeel(post.ritme === 'eenmalig' ? post.bedrag : maandbedrag, post.verdeling);
        return { post, maandbedrag, partij, delen, mijnDeel: mij ? delen[mij.id] || 0 : 0 };
      })
      .sort((a, b) => {
        if (sortering === 'naam') return a.post.naam.localeCompare(b.post.naam, 'nl');
        if (sortering === 'categorie') {
          return (a.post.categorie || '').localeCompare(b.post.categorie || '', 'nl')
            || b.maandbedrag - a.maandbedrag;
        }
        return b.maandbedrag - a.maandbedrag || a.post.naam.localeCompare(b.post.naam, 'nl');
      });
  }, [posten, rekeningen, personen, zoek, filter, sortering, maand, mij]);

  const totaal = rijen.reduce((s, r) => s + r.maandbedrag, 0);

  return (
    <>
      <div className="field" style={{ marginBottom: 10 }}>
        <input
          className="input"
          placeholder="Zoeken…"
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
        />
      </div>

      <div className="filterbar">
        {[
          ['alles', 'Alles'],
          ['lopend', 'Loopt nu'],
          ['gedeeld', 'Gedeeld'],
          ['eenmalig', 'Eenmalig'],
          ['zakelijk', 'Zakelijk'],
          ['gestopt', 'Loopt niet'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`chip${filter === id ? ' on' : ''}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="row small faint" style={{ marginBottom: 10 }}>
        <span className="grow">
          {rijen.length} {rijen.length === 1 ? 'post' : 'posten'} · {toonGeld(totaal)} per maand
        </span>
        <select
          className="select"
          style={{ width: 'auto', padding: '5px 26px 5px 9px', fontSize: 12 }}
          value={sortering}
          onChange={(e) => setSortering(e.target.value)}
        >
          {SORTERING.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {!rijen.length && (
        <Empty art="🔍" title="Niets gevonden">
          Pas het filter aan, of voeg een post toe met de knop rechtsonder.
        </Empty>
      )}

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

      <button className="fab" onClick={onNieuw} aria-label="Nieuwe post">+</button>
    </>
  );
}

function PostRegel({ rij, maand, personen, rekeningen, onOpen, onBewaar }) {
  const { post, maandbedrag, delen } = rij;
  const cat = categorieVan(post.categorie);
  const ritme = ritmeVan(post.ritme);
  const actief = loopt(post, maand);
  // Hier hoort de rekening te staan waar het vanaf gaat, niet de partij uit de
  // boekhouding: bij een zakelijke rekening is dat "Zaak", en niet jouw naam.
  const rekening = rekeningen.find((r) => r.id === post.betaler?.id);
  const betaler =
    post.betaler?.soort === 'rekening'
      ? rekening?.naam
      : personen.find((p) => p.id === post.betaler?.id)?.naam;
  const meedoeners = Object.keys(delen);
  const naamVan = (id) => personen.find((p) => p.id === id)?.naam || '?';

  return (
    <button
      className="card pressable tight"
      onClick={() => onOpen(post)}
      style={actief || post.ritme === 'eenmalig' ? undefined : { opacity: 0.55 }}
    >
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span className="penning groot">{cat.emoji}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="strong truncate">{post.naam}</span>
            {post.zakelijk && <span className="chip readonly tiny tone-info">zakelijk</span>}
            {post.gepauzeerd && <span className="chip readonly tiny tone-warn">gepauzeerd</span>}
            {post.ritme === 'eenmalig' && post.afgerekend && (
              <span className="chip readonly tiny">afgerekend</span>
            )}
          </div>
          <div className="tiny faint truncate" style={{ marginTop: 2 }}>
            {betaler ? `van ${betaler}` : 'geen betaler'} ·{' '}
            {omschrijfVerdeling(post.verdeling, naamVan)}
          </div>
          <div className="stapel" style={{ marginTop: 6 }}>
            {meedoeners.slice(0, 5).map((id) => (
              <Penning key={id} persoon={personen.find((p) => p.id === id)} maat="klein" />
            ))}
            {meedoeners.length > 5 && <span className="tiny faint" style={{ marginLeft: 6 }}>+{meedoeners.length - 5}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <Geld centen={post.ritme === 'eenmalig' ? post.bedrag : maandbedrag} maat="mid" />
          <div className="tiny faint">
            {post.ritme === 'maand' || post.ritme === 'eenmalig'
              ? ritme.kort
              : `${toonGeld(post.bedrag)} ${ritme.kort}`}
          </div>
          {post.ritme !== 'eenmalig' && (
            <div className="tiny faint">{toonGeld(perJaar(post.bedrag, post.ritme))} /jr</div>
          )}
        </div>
      </div>

      {post.ritme === 'eenmalig' && (
        <div className="row" style={{ marginTop: 9, justifyContent: 'flex-end' }}>
          <span
            className="btn sm"
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onBewaar({ ...post, afgerekend: !post.afgerekend }); }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.stopPropagation();
              e.preventDefault();
              onBewaar({ ...post, afgerekend: !post.afgerekend });
            }}
          >
            {post.afgerekend ? 'Weer openzetten' : 'Afgerekend'}
          </span>
        </div>
      )}
    </button>
  );
}
