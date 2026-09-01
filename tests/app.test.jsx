// Eén doorlopende test door de app heen, in de lokale stand.
//
// De rekenkern en de versleuteling hebben hun eigen tests; deze controleert dat
// de uitkomsten ook echt op het scherm belanden, dat de kluis dicht zit tot je
// hem opent, en dat er niets leesbaars in de browser achterblijft.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.jsx';
import { voorbeeldKasboek } from '../src/data/voorbeeld.js';
import { nieuweHuissleutel, sleutelNaarRuw, versleutel, naarB64 } from '../src/lib/kluis.js';

const ZIN = 'zes wilde ganzen boven de dijk';

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

/**
 * Zet een ontgrendelde kluis klaar met gegevens erin.
 *
 * Het instellen van een wachtwoordzin heeft hieronder een eigen test; overal
 * elders zou PBKDF2 met 310.000 rondes de tests alleen maar traag maken zonder
 * iets extra's te bewijzen.
 */
async function metGegevens(set) {
  const sleutel = await nieuweHuissleutel();
  localStorage.setItem('pay:sleutel:open', JSON.stringify(naarB64(await sleutelNaarRuw(sleutel))));

  const versleuteld = { personen: [], rekeningen: [], posten: [] };
  for (const soort of ['personen', 'rekeningen', 'posten']) {
    for (const rij of set[soort]) {
      const { id, ...inhoud } = rij;
      versleuteld[soort].push({ id, geheim: await versleutel(sleutel, inhoud) });
    }
  }
  localStorage.setItem('pay:kluis:v2', JSON.stringify(versleuteld));
  return sleutel;
}

const start = async () => {
  const gebruiker = userEvent.setup();
  render(<App />);
  await gebruiker.click(await screen.findByRole('button', { name: /zonder account/i }));
  return gebruiker;
};

describe('de kluis', () => {
  it('vraagt eerst om een wachtwoordzin', async () => {
    await start();
    expect(await screen.findByRole('heading', { name: /kies een wachtwoordzin/i })).toBeTruthy();
    // En zegt er duidelijk bij dat je hem niet kunt herstellen.
    expect(screen.getByText(/kan niet hersteld worden/i)).toBeTruthy();
  });

  it('opent pas als de twee zinnen gelijk en lang genoeg zijn', async () => {
    const gebruiker = await start();
    const zinVeld = await screen.findByLabelText('Wachtwoordzin');
    const herhaalVeld = screen.getByLabelText('Nog een keer');
    const knop = screen.getByRole('button', { name: 'Instellen' });

    expect(knop.disabled).toBe(true);

    await gebruiker.type(zinVeld, 'kort');
    expect(knop.disabled).toBe(true);

    await gebruiker.clear(zinVeld);
    await gebruiker.type(zinVeld, ZIN);
    await gebruiker.type(herhaalVeld, 'iets anders wat lang genoeg is');
    expect(knop.disabled).toBe(true);

    await gebruiker.clear(herhaalVeld);
    await gebruiker.type(herhaalVeld, ZIN);
    expect(knop.disabled).toBe(false);
  }, 30000);

  it('laat niets leesbaars achter in de browser', async () => {
    await metGegevens(voorbeeldKasboek());
    const opgeslagen = localStorage.getItem('pay:kluis:v2');
    for (const woord of ['Energie', 'Internet', 'Partner', 'Vaste lasten', '9000', '5000']) {
      expect(opgeslagen).not.toContain(woord);
    }
  });
});

describe('Pay in de lokale stand', () => {
  it('begint zonder gegevens', async () => {
    await metGegevens({ personen: [], rekeningen: [], posten: [] });
    await start();
    expect(await screen.findByText(/lokale kluis/i)).toBeTruthy();
    expect(screen.getByText(/nog niets geboekt/i)).toBeTruthy();
  });

  it('rekent het voorbeeldhuishouden door tot op de cent', async () => {
    await metGegevens(voorbeeldKasboek());
    await start();

    // 90 + 15 + 12 + 8 + 90/3 + 50 + 20 + 12 + 16 + 25
    expect((await screen.findAllByText('€ 278,00')).length).toBeGreaterThan(0);
    // Een kwart van de bankkosten draagt de zaak, en die maakt dat zelf over.
    expect(screen.getAllByText('€ 4,00').length).toBeGreaterThan(0);
    // De streamingdienst (20 door vier, ik betaal) tegen de muziekdienst
    // (12 door twee, de vriend betaalt): netto € 1,00 van mij naar hem.
    expect(screen.getAllByText('€ 1,00').length).toBeGreaterThan(0);
    // De twee verzekeringsposten staan samen op één incasso.
    expect(screen.getAllByText('Verzekeringen').length).toBeGreaterThan(0);
  });

  it('bewaart een nieuwe post versleuteld en telt hem meteen mee', async () => {
    await metGegevens(voorbeeldKasboek());
    const gebruiker = await start();
    await gebruiker.click(await screen.findByRole('button', { name: /Lasten/ }));

    await gebruiker.click(screen.getByRole('button', { name: 'Nieuwe post' }));
    await gebruiker.type(screen.getByPlaceholderText(/Energie, internet/), 'Krant');
    await gebruiker.type(screen.getByPlaceholderText('0,00'), '12,50');

    const paneel = screen.getByRole('heading', { name: 'Nieuwe post' }).closest('.blad');
    await gebruiker.click(within(paneel).getByRole('button', { name: /Vaste lasten/ }));
    await gebruiker.click(within(paneel).getByRole('button', { name: 'Bewaren' }));

    expect(await screen.findByText('Krant')).toBeTruthy();
    // Op het scherm wel, in de opslag niet.
    expect(localStorage.getItem('pay:kluis:v2')).not.toContain('Krant');
  }, 30000);

  it('waarschuwt als er niemand als "ik" is aangewezen', async () => {
    const zonderMij = voorbeeldKasboek();
    zonderMij.personen = zonderMij.personen.map((p) => ({ ...p, is_mij: false }));
    await metGegevens(zonderMij);
    const gebruiker = await start();

    await gebruiker.click(await screen.findByRole('button', { name: /Verrekenen/ }));
    expect(screen.getByText(/wie van de personen jij bent/i)).toBeTruthy();
  });
});

describe('afsluiten', () => {
  it('laat geen sleutel en geen kopie achter na het uitloggen', async () => {
    localStorage.setItem('pay:cache:iemand', '{"posten":[]}');
    localStorage.setItem('pay:sleutel:open', '"ruw"');
    localStorage.setItem('pay:sleutel', '{"ct":"..."}');
    localStorage.setItem('pay:thema', 'dark');

    const { wisLokaleKopie } = await import('../src/lib/auth.js');
    wisLokaleKopie();

    expect(localStorage.getItem('pay:cache:iemand')).toBe(null);
    expect(localStorage.getItem('pay:sleutel:open')).toBe(null);
    expect(localStorage.getItem('pay:sleutel')).toBe(null);
    // Voorkeuren zijn geen gegevens en mogen blijven staan.
    expect(localStorage.getItem('pay:thema')).toBe('dark');
  });
});
