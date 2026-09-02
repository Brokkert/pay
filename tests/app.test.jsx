// One continuous test through the app, in local mode.
//
// The ledger and the encryption have their own tests; this one checks that the
// results actually reach the screen, that the vault stays shut until you open
// it, and that nothing readable is left behind in the browser.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.jsx';
import { exampleHousehold } from '../src/data/example.js';
import { newHouseholdKey, keyToRaw, encrypt, toB64 } from '../src/lib/crypto.js';

const PHRASE = 'zes wilde ganzen boven de dijk';

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

/**
 * Puts an unlocked vault in place with data in it.
 *
 * Setting a passphrase has its own test below; everywhere else PBKDF2 with
 * 310,000 rounds would only make the tests slow without proving anything extra.
 */
async function withData(set) {
  const key = await newHouseholdKey();
  localStorage.setItem('pay:key:open', JSON.stringify(toB64(await keyToRaw(key))));

  const encrypted = { people: [], accounts: [], expenses: [] };
  for (const kind of ['people', 'accounts', 'expenses']) {
    for (const record of set[kind]) {
      const { id, ...content } = record;
      encrypted[kind].push({ id, secret: await encrypt(key, content) });
    }
  }
  localStorage.setItem('pay:store', JSON.stringify(encrypted));
  return key;
}

const start = async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('button', { name: /zonder account/i }));
  return user;
};

describe('the vault', () => {
  it('asks for a passphrase first', async () => {
    await start();
    expect(await screen.findByRole('heading', { name: /kies een wachtwoordzin/i })).toBeTruthy();
    // And says plainly that you cannot recover it.
    expect(screen.getByText(/kan niet hersteld worden/i)).toBeTruthy();
  });

  it('only opens once the two phrases match and are long enough', async () => {
    const user = await start();
    const phrase = await screen.findByLabelText('Wachtwoordzin');
    const repeat = screen.getByLabelText('Nog een keer');
    const button = screen.getByRole('button', { name: 'Instellen' });

    expect(button.disabled).toBe(true);

    await user.type(phrase, 'kort');
    expect(button.disabled).toBe(true);

    await user.clear(phrase);
    await user.type(phrase, PHRASE);
    await user.type(repeat, 'iets anders wat lang genoeg is');
    expect(button.disabled).toBe(true);

    await user.clear(repeat);
    await user.type(repeat, PHRASE);
    expect(button.disabled).toBe(false);
  }, 30000);

  it('leaves nothing readable behind in the browser', async () => {
    await withData(exampleHousehold());
    const stored = localStorage.getItem('pay:store');
    for (const word of ['Energie', 'Internet', 'Partner', 'Vaste lasten', '9000', '5000']) {
      expect(stored).not.toContain(word);
    }
  });
});

describe('Pay in local mode', () => {
  it('starts without data', async () => {
    await withData({ people: [], accounts: [], expenses: [] });
    await start();
    expect(await screen.findByText(/lokale kluis/i)).toBeTruthy();
    expect(screen.getByText(/nog niets geboekt/i)).toBeTruthy();
  });

  it('works the example household out to the cent', async () => {
    await withData(exampleHousehold());
    await start();

    // 90 + 15 + 12 + 8 + 90/3 + 50 + 20 + 12 + 16 + 25
    expect((await screen.findAllByText('€ 278,00')).length).toBeGreaterThan(0);
    // A quarter of the bank charges is borne by the business, which transfers it.
    expect(screen.getAllByText('€ 4,00').length).toBeGreaterThan(0);
    // The streaming service (20 over four, I pay) against the music service
    // (12 over two, the friend pays): net € 1,00 from me to him.
    expect(screen.getAllByText('€ 1,00').length).toBeGreaterThan(0);
    // The two insurance expenses sit on one charge.
    expect(screen.getAllByText('Verzekeringen').length).toBeGreaterThan(0);
  });

  it('saves a new expense encrypted and counts it right away', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));

    await user.click(screen.getByRole('button', { name: 'Nieuwe post' }));
    await user.type(screen.getByPlaceholderText(/Energie, internet/), 'Krant');
    await user.type(screen.getByPlaceholderText('0,00'), '12,50');

    const sheet = screen.getByRole('heading', { name: 'Nieuwe post' }).closest('.sheet');
    await user.click(within(sheet).getByRole('button', { name: /Vaste lasten/ }));
    await user.click(within(sheet).getByRole('button', { name: 'Bewaren' }));

    expect(await screen.findByText('Krant')).toBeTruthy();
    // On screen yes, in storage no.
    expect(localStorage.getItem('pay:store')).not.toContain('Krant');
  }, 30000);

  it('warns when nobody is marked as "me"', async () => {
    const withoutMe = exampleHousehold();
    withoutMe.people = withoutMe.people.map((p) => ({ ...p, isMe: false }));
    await withData(withoutMe);
    const user = await start();

    await user.click(await screen.findByRole('button', { name: /Verrekenen/ }));
    expect(screen.getByText(/wie van de personen jij bent/i)).toBeTruthy();
  });
});

describe('signing out', () => {
  it('leaves no key and no copy behind', async () => {
    localStorage.setItem('pay:cache:someone', '{"expenses":[]}');
    localStorage.setItem('pay:key:open', '"raw"');
    localStorage.setItem('pay:key', '{"ct":"..."}');
    localStorage.setItem('pay:theme', 'dark');

    const { clearLocalCopy } = await import('../src/lib/auth.js');
    clearLocalCopy();

    expect(localStorage.getItem('pay:cache:someone')).toBe(null);
    expect(localStorage.getItem('pay:key:open')).toBe(null);
    expect(localStorage.getItem('pay:key')).toBe(null);
    // Preferences are not data and may stay.
    expect(localStorage.getItem('pay:theme')).toBe('dark');
  });
});

describe('getting out of local mode', () => {
  it('offers a way back to signing in once a project is connected', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Meer/ }));

    // The badge says local, and there is a button that leads back to the login
    // screen — without one you are stuck here for good.
    expect(screen.getByText(/lokale kluis/i)).toBeTruthy();
    const back = screen.getByRole('button', { name: /Inloggen met e-mail/i });
    await user.click(back);

    expect(await screen.findByRole('button', { name: /zonder account/i })).toBeTruthy();
    expect(localStorage.getItem('pay:local')).toBe(null);
  }, 30000);
});

describe('a friend who settles through the bills account', () => {
  // The case in full: Frans is on YouTube (4,99 of it) and pays Tidal (8,49)
  // that I use on my own. One payment of 3,50 leaves the bills account, and
  // both original amounts stay visible behind it.
  const household = () => {
    const me = 'me', mau = 'mau', frans = 'frans', bills = 'bills';
    const equal = (...ids) => ({ kind: 'equal', participants: ids, weights: {} });
    const base = { cadence: 'month', category: 'media', charge: '', note: '', business: false, paused: false };
    return {
      people: [
        { id: me, name: 'Ik', colour: '#0d6e5c', isMe: true },
        { id: mau, name: 'Mau', colour: '#9a4f2c' },
        { id: frans, name: 'Frans', colour: '#2f5fa8' },
      ],
      accounts: [
        { id: bills, name: 'BUNQ', kind: 'shared', members: [me, mau], settlement: true },
      ],
      expenses: [
        { ...base, id: 'yt', name: 'YouTube Family', amount: 1497,
          payer: { kind: 'account', id: bills }, split: equal(me, mau, frans) },
        { ...base, id: 'td', name: 'Tidal', amount: 849,
          payer: { kind: 'person', id: frans }, split: equal(me) },
      ],
    };
  };

  it('spells out on the overview itself where the 3,50 comes from', async () => {
    await withData(household());
    await start();

    // No tapping, no other tab: the netted line carries its own reasoning.
    const row = (await screen.findAllByText('Frans'))
      .map((n) => n.closest('.transfer-row'))
      .find(Boolean);
    expect(row).toBeTruthy();
    const origin = row.querySelector('.origin').textContent;
    // Both at their full amount, and the minus that makes it 3,50.
    expect(origin).toMatch(/Tidal\s*€\s*8,49/);
    expect(origin).toMatch(/−\s*YouTube Family\s*€\s*4,99/);

    // My own line adds the two up instead: I owe both.
    const mine = (await screen.findAllByText('Ik'))
      .map((n) => n.closest('.transfer-row'))
      .find(Boolean);
    expect(mine.querySelector('.origin').textContent).toMatch(/\+\s*YouTube Family/);
  }, 30000);

  it('shows the net payment, and both full amounts behind it', async () => {
    await withData(household());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Verrekenen/ }));

    // Frans is there with the netted amount, not with two separate debts.
    const row = await screen.findByRole('button', { name: /Frans/ });
    expect(within(row).getByText(/3,50/)).toBeTruthy();
    expect(within(row).getByText(/krijgt terug van BUNQ/)).toBeTruthy();
    expect(screen.queryByText(/8,49/)).toBe(null);

    // And tapping him shows where that 3,50 comes from, at full value.
    await user.click(row);
    const sheet = screen.getByRole('heading', { name: /Jij en Frans/ }).closest('.sheet');
    expect(within(sheet).getByText('YouTube Family')).toBeTruthy();
    expect(within(sheet).getByText(/4,99/)).toBeTruthy();
    expect(within(sheet).getByText('Tidal')).toBeTruthy();
    expect(within(sheet).getByText(/8,49/)).toBeTruthy();
    // Named as running through the account, because that is where it comes from.
    expect(within(sheet).getByText(/via BUNQ/)).toBeTruthy();
  }, 30000);
});

describe('changing one person\'s amount', () => {
  it('starts from tapping that amount, not from a division method', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(await screen.findByText('Streamingdienst'));

    // 20,00 over four: everyone at 5,00, and each of those is a way in.
    const way = await screen.findByRole('button', { name: /Bedrag voor Ik zelf invullen/i });
    await user.click(way);

    // Now every bearer has a field of their own, seeded with what they had.
    const sheet = screen.getByRole('heading', { name: 'Post wijzigen' }).closest('.sheet');
    const fields = within(sheet).getAllByPlaceholderText('0,00');
    expect(fields.length).toBeGreaterThanOrEqual(4);
    expect(fields.map((f) => f.value)).toContain('5,00');
  }, 30000);
});
