// Eén doorlopende test door de app heen, in de lokale-kluis-stand.
//
// De rekenkern heeft zijn eigen tests; deze controleert dat de uitkomsten ook
// echt op het scherm belanden — en dat de app het zonder Supabase doet.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.jsx';
import { voorbeeldKasboek } from '../src/data/voorbeeld.js';

beforeEach(() => {
  localStorage.clear();
  // Zonder crypto.randomUUID vallen we terug op een eigen id; in jsdom is die
  // er soms niet, dus zetten we hem hier vast neer.
  if (!crypto.randomUUID) {
    let n = 0;
    crypto.randomUUID = () => `id-${(n += 1)}`;
  }
});
afterEach(cleanup);

// De kluis wordt bij het opstarten één keer gelezen, dus zetten we hem klaar
// vóór het renderen — net als wanneer je de app een tweede keer opent.
const start = async (kluis = null) => {
  if (kluis) localStorage.setItem('pay:kluis:v1', JSON.stringify(kluis));
  const gebruiker = userEvent.setup();
  render(<App />);
  await gebruiker.click(await screen.findByRole('button', { name: /zonder account/i }));
  return gebruiker;
};

describe('Pay in de lokale kluis', () => {
  it('begint zonder account en zonder gegevens', async () => {
    await start();
    expect(screen.getByText(/lokale kluis/i)).toBeTruthy();
    expect(screen.getByText(/nog niets geboekt/i)).toBeTruthy();
  });

  it('rekent het voorbeeldhuishouden door tot op de cent', async () => {
    await start(voorbeeldKasboek());

    // 90 + 15 + 12 + 8 + 90/3 + 50 + 20 + 12 + 16 + 25
    expect(screen.getAllByText('€ 278,00').length).toBeGreaterThan(0);
    // Een kwart van de bankkosten draagt de zaak, en die maakt dat zelf over.
    expect(screen.getAllByText('€ 4,00').length).toBeGreaterThan(0);
    // De streamingdienst (20 door vier, ik betaal) tegen de muziekdienst
    // (12 door twee, de vriend betaalt): netto € 1,00 van mij naar hem.
    expect(screen.getAllByText('€ 1,00').length).toBeGreaterThan(0);
    // De twee verzekeringsposten staan samen op één incasso.
    expect(screen.getAllByText('Verzekeringen').length).toBeGreaterThan(0);
  });

  it('bewaart een nieuwe post en telt hem meteen mee', async () => {
    const gebruiker = await start(voorbeeldKasboek());
    await gebruiker.click(screen.getByRole('button', { name: /Lasten/ }));

    await gebruiker.click(screen.getByRole('button', { name: 'Nieuwe post' }));
    await gebruiker.type(screen.getByPlaceholderText(/Energie, internet/), 'Krant');
    await gebruiker.type(screen.getByPlaceholderText('0,00'), '12,50');
    const paneel = screen.getByRole('heading', { name: 'Nieuwe post' }).closest('.blad');
    await gebruiker.click(within(paneel).getByRole('button', { name: /Vaste lasten/ }));
    await gebruiker.click(within(paneel).getByRole('button', { name: 'Bewaren' }));

    expect(await screen.findByText('Krant')).toBeTruthy();
    // Bewaard in de kluis, niet alleen op het scherm.
    const kluis = JSON.parse(localStorage.getItem('pay:kluis:v1'));
    expect(kluis.posten.find((p) => p.naam === 'Krant').bedrag).toBe(1250);
  });

  it('waarschuwt als er niemand als "ik" is aangewezen', async () => {
    const zonderMij = voorbeeldKasboek();
    zonderMij.personen = zonderMij.personen.map((p) => ({ ...p, is_mij: false }));
    const gebruiker = await start(zonderMij);

    await gebruiker.click(screen.getByRole('button', { name: /Verrekenen/ }));
    expect(screen.getByText(/wie van de personen jij bent/i)).toBeTruthy();
  });
});

describe('afsluiten', () => {
  it('laat geen bedragen achter in de browser na het uitloggen', async () => {
    localStorage.setItem('pay:cache:iemand', JSON.stringify(voorbeeldKasboek()));
    localStorage.setItem('pay:thema', 'dark');
    const { wisLokaleKopie } = await import('../src/lib/auth.js');
    wisLokaleKopie();
    expect(localStorage.getItem('pay:cache:iemand')).toBe(null);
    // Voorkeuren zijn geen gegevens en mogen blijven staan.
    expect(localStorage.getItem('pay:thema')).toBe('dark');
  });
});
