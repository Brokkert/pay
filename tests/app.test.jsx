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

    // Names and descriptions, which cannot turn up in a base64 blob by chance.
    for (const word of ['Energie', 'Internet', 'Partner', 'Vaste lasten']) {
      expect(stored).not.toContain(word);
    }

    // Amounts are not searched for as text: an id is hex and a ciphertext is
    // base64, so a run of four digits turns up in one now and again by pure
    // chance — about once in a hundred runs, which is a red build for nothing
    // and no proof of anything when it passes. What can be checked is the
    // shape: a record carries an id and a sealed blob, and no field besides.
    const parsed = JSON.parse(stored);
    for (const kind of ['people', 'accounts', 'expenses']) {
      expect(parsed[kind].length).toBeGreaterThan(0);
      for (const record of parsed[kind]) {
        expect(Object.keys(record).sort()).toEqual(['id', 'secret']);
        expect(Object.keys(record.secret).sort()).toEqual(['ct', 'iv', 'v']);
      }
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

describe('a recovery key', () => {
  it('hands out the key as text and opens a locked vault with it', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Meer/ }));

    await user.click(screen.getByRole('button', { name: /Herstelsleutel tonen/ }));
    const sheet = screen.getByRole('heading', { name: 'Herstelsleutel' }).closest('.sheet');
    // Not shown until you ask for it.
    expect(sheet.querySelector('.box')).toBe(null);
    await user.click(within(sheet).getByRole('button', { name: /Laat zien/ }));

    const shown = (await within(sheet).findByText(/^[A-Za-z0-9+/=]{40,}$/)).textContent;
    // It is the household key: 32 bytes in base64.
    expect(atob(shown).length).toBe(32);
    expect(shown).toBe(JSON.parse(localStorage.getItem('pay:key:open')));

    // Lock the vault, then get back in with nothing but that string.
    cleanup();
    localStorage.removeItem('pay:key:open');
    localStorage.setItem('pay:key', JSON.stringify({ salt: 'x', iv: 'y', ct: 'z' }));
    const again = userEvent.setup();
    render(<App />);
    // Still in local mode, so it goes straight to the door of the vault.
    await again.click(await screen.findByRole('button', { name: /Wachtwoordzin kwijt/ }));
    await again.type(screen.getByLabelText('Herstelsleutel'), shown);
    await again.click(screen.getByRole('button', { name: 'Ontgrendelen' }));

    // Open, with the household intact.
    expect(await screen.findByText('Jouw deel')).toBeTruthy();
    expect(screen.getAllByText('€ 278,00').length).toBeGreaterThan(0);
  }, 30000);

  it('refuses something that is not a key', async () => {
    await withData(exampleHousehold());
    cleanup();
    localStorage.removeItem('pay:key:open');
    localStorage.setItem('pay:key', JSON.stringify({ salt: 'x', iv: 'y', ct: 'z' }));

    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /zonder account/i }));
    await user.click(await screen.findByRole('button', { name: /Wachtwoordzin kwijt/ }));
    await user.type(screen.getByLabelText('Herstelsleutel'), 'dit is geen sleutel');
    await user.click(screen.getByRole('button', { name: 'Ontgrendelen' }));

    expect(await screen.findByText(/geen herstelsleutel/)).toBeTruthy();
  }, 30000);
});

describe('a passphrase you have forgotten while still unlocked', () => {
  it('lets you put a new lock on the key that is already open', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Meer/ }));

    await user.click(screen.getByRole('button', { name: /Nieuwe wachtwoordzin instellen/ }));
    const sheet = screen.getByRole('heading', { name: 'Nieuwe wachtwoordzin' }).closest('.sheet');
    const set = within(sheet).getByRole('button', { name: 'Instellen' });
    expect(set.disabled).toBe(true);

    await user.type(within(sheet).getByLabelText('Nieuwe wachtwoordzin'), 'acht wilde ganzen boven de dijk');
    await user.type(within(sheet).getByLabelText('Nog een keer'), 'acht wilde ganzen boven de dijk');
    expect(set.disabled).toBe(false);
    await user.click(set);

    expect(await within(sheet).findByText(/de oude werkt niet meer/)).toBeTruthy();
    // The new package is stored, and it is not the phrase itself.
    const wrapped = localStorage.getItem('pay:key');
    expect(wrapped).toBeTruthy();
    expect(wrapped).not.toContain('ganzen');
  }, 30000);

  it('refuses two phrases that do not match', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Meer/ }));
    await user.click(screen.getByRole('button', { name: /Nieuwe wachtwoordzin instellen/ }));

    const sheet = screen.getByRole('heading', { name: 'Nieuwe wachtwoordzin' }).closest('.sheet');
    await user.type(within(sheet).getByLabelText('Nieuwe wachtwoordzin'), 'acht wilde ganzen boven de dijk');
    await user.type(within(sheet).getByLabelText('Nog een keer'), 'iets heel anders maar lang');
    expect(within(sheet).getByRole('button', { name: 'Instellen' }).disabled).toBe(true);
    expect(within(sheet).getByText(/niet gelijk/)).toBeTruthy();
  }, 30000);
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
    const base = { cadence: 'month', category: 'media', charge: '', note: '', paused: false };
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

    // Frans is there with the netted amount, not with two separate debts. The
    // row holds two controls now — the name opens it, the amount copies — so
    // reach for the row itself rather than for a button.
    const row = (await screen.findAllByText('Frans'))
      .map((n) => n.closest('.line'))
      .find(Boolean);
    expect(row).toBeTruthy();
    expect(within(row).getByText(/3,50/)).toBeTruthy();
    expect(within(row).getByText(/krijgt terug van BUNQ/)).toBeTruthy();
    // Not green: money leaving the account is not money coming your way — you
    // fill that account, so you are the one paying it.
    expect(row.querySelector('.credit')).toBe(null);
    expect(screen.queryByText(/8,49/)).toBe(null);

    // And tapping him shows where that 3,50 comes from, at full value.
    await user.click(row.querySelector('.line-open'));
    const sheet = screen.getByRole('heading', { name: /Jij en Frans/ }).closest('.sheet');
    expect(within(sheet).getByText('YouTube Family')).toBeTruthy();
    expect(within(sheet).getByText(/4,99/)).toBeTruthy();
    expect(within(sheet).getByText('Tidal')).toBeTruthy();
    expect(within(sheet).getByText(/8,49/)).toBeTruthy();
    // Named as running through the account, because that is where it comes from.
    expect(within(sheet).getByText(/via BUNQ/)).toBeTruthy();
  }, 30000);

  it('hands you the bare amount, ready to paste into a direct debit', async () => {
    await withData(household());
    const user = await start();

    // After user-event's own setup, which installs a clipboard of its own.
    const copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text) => void copied.push(text) },
    });

    await user.click(await screen.findByRole('button', { name: /Verrekenen/ }));

    const row = (await screen.findAllByText('Frans'))
      .map((n) => n.closest('.line'))
      .find(Boolean);
    await user.click(within(row).getByRole('button', { name: /kopiëren/ }));

    // No euro sign, no minus, no thousands dot: what a bank field accepts.
    expect(copied).toEqual(['3,50']);
    // And it says so, so you know the tap landed.
    expect(row.querySelector('.copy-money.done')).toBeTruthy();

    delete navigator.clipboard;
  }, 30000);
});

describe('the list of posts', () => {
  it('switches between the full amount and your share, all rows at once', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));

    const row = () => screen.getByText('Streamingdienst').closest('.item');
    // 20,00 a month over four, and the list starts at what leaves the account.
    expect(within(row()).getByText(/20,00/)).toBeTruthy();
    expect(within(row()).queryByText(/van € /)).toBe(null);

    await user.click(screen.getByRole('button', { name: 'Mijn deel' }));

    // Your share in the column, and the amount it is a share of under it — a
    // row that no longer matches your bank statement has to say why.
    expect(within(row()).getByText('€ 5,00')).toBeTruthy();
    expect(within(row()).getByText('van € 20,00')).toBeTruthy();
    // And the count line is about the same thing as the column.
    expect(screen.getByText(/posten · .* voor jou per maand/)).toBeTruthy();

    // Back again, and the switch is remembered for next time.
    await user.click(screen.getByRole('button', { name: 'Volledig' }));
    expect(within(row()).getByText(/20,00/)).toBeTruthy();
    expect(localStorage.getItem('pay:view:expenses')).toBe('full');
  }, 30000);
});

describe('whether it all adds up', () => {
  it('says so in one line, and says what does not', async () => {
    await withData(exampleHousehold());
    const user = await start();

    // What Pay already knew but only said on the account's own panel: a yearly
    // post here has no charge month, so what should be on that account is wrong.
    expect(await screen.findByText(/niet ingevuld in welke maand/)).toBeTruthy();
    // And the rest, folded away until you want it.
    expect(screen.getByText(/om een keer naar te kijken/)).toBeTruthy();

    // Now give a post fixed amounts that fall short: ten euro nobody carries.
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(await screen.findByText('Streamingdienst'));
    await user.click(await screen.findByRole('button', { name: 'Wijzigen' }));
    const sheet = screen.getByRole('heading', { name: 'Post wijzigen' }).closest('.sheet');
    await user.click(within(sheet).getByRole('button', { name: 'Vaste bedragen' }));
    const fields = within(sheet).getAllByPlaceholderText('0,00');
    await user.clear(fields[fields.length - 1]);
    await user.click(within(sheet).getByRole('button', { name: 'Bewaren' }));

    await user.click(screen.getByRole('button', { name: /Overzicht/ }));
    // Named on the account it goes wrong on, at the top of the first screen,
    // rather than as a hint three screens away.
    expect(document.body.textContent).toMatch(/tellen de vaste bedragen niet op/);
  }, 30000);
});

describe('money you put away rather than spend', () => {
  it('stays among the costs, and says it is still yours', async () => {
    await withData(exampleHousehold());
    const user = await start();

    // An income, so there is a bottom line to say it about.
    await user.click(await screen.findByRole('button', { name: /Mensen/ }));
    await user.click(await screen.findByText('Ik'));
    let sheet = screen.getByRole('heading', { name: 'Persoon wijzigen' }).closest('.sheet');
    let field = within(sheet).getByText('Inkomen per maand').closest('.field');
    await user.type(within(field).getByRole('textbox'), '3000,00');
    await user.click(within(sheet).getByRole('button', { name: 'Bewaren' }));

    // Sportclub is 25,00 a month, borne by me alone. Mark it as saving.
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(await screen.findByText('Sportclub'));
    await user.click(await screen.findByRole('button', { name: 'Wijzigen' }));
    sheet = screen.getByRole('heading', { name: 'Post wijzigen' }).closest('.sheet');
    await user.click(within(sheet).getByText(/Looptijd, sparen/));
    await user.click(within(sheet).getByText(/Dit is sparen of beleggen/));
    await user.click(within(sheet).getByRole('button', { name: 'Bewaren' }));

    // Still in the list at its full amount, marked for what it is. Waiting on
    // the mark rather than on the row: the row is already there with the old
    // flag on it, so finding it proves nothing about the save.
    const mark = await screen.findByText('sparen');
    const row = mark.closest('.item');
    expect(within(row).getByText('Sportclub')).toBeTruthy();
    expect(within(row).getByText(/25,00/)).toBeTruthy();

    // On the overview, beside what the load is made of.
    await user.click(screen.getByRole('button', { name: /Overzicht/ }));
    const strip = screen.getByText('Waarvan opzij gezet').closest('button');
    expect(strip.textContent).toContain('25,00');

    // And the bottom line says what part of it you still have.
    await user.click(screen.getByRole('button', { name: /Overhouden/ }));
    expect(document.body.textContent).toMatch(/Hiervan is € 25,00 sparen of beleggen/);
  }, 30000);
});

describe('a cost your own company account pays', () => {
  it('stays yours, and says it did not come off your salary', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    // Sportclub: 25,00, borne by me alone, off my personal account.
    await user.click(await screen.findByText('Sportclub'));
    await user.click(await screen.findByRole('button', { name: 'Wijzigen' }));

    const sheet = screen.getByRole('heading', { name: 'Post wijzigen' }).closest('.sheet');
    const bearers = within(sheet).getByText('Wie draagt het').closest('.field');
    // The two questions read as one until the second says what it decides.
    expect(bearers.textContent).toContain('Wiens geld het uiteindelijk is');

    // Let the business pay it. Which pocket it comes out of is the question
    // above; this is still your sport, so it stays on you.
    const payer = within(sheet).getByText('Waar gaat het vanaf').closest('.field');
    await user.click(within(payer).getByRole('button', { name: 'Zaak' }));
    const chip = (name) => within(bearers).getByText(name).closest('button');
    expect(chip('Ik').className).toContain('on');
    expect(chip('Zaak').className).not.toContain('on');
    await user.click(within(sheet).getByRole('button', { name: 'Bewaren' }));

    // So it is still in your list, at your share, where you can find it.
    await user.click(screen.getByRole('button', { name: 'Mijn deel' }));
    expect(within(screen.getByText('Sportclub').closest('.item')).getByText('€ 25,00'))
      .toBeTruthy();
  }, 30000);

  it('leaves a cost of the company itself out of everyone', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(await screen.findByText('Sportclub'));
    await user.click(await screen.findByRole('button', { name: 'Wijzigen' }));

    const sheet = screen.getByRole('heading', { name: 'Post wijzigen' }).closest('.sheet');
    const bearers = within(sheet).getByText('Wie draagt het').closest('.field');
    const payer = within(sheet).getByText('Waar gaat het vanaf').closest('.field');
    await user.click(within(payer).getByRole('button', { name: 'Zaak' }));

    // Ticking the account on purpose is what takes it out of a personal total,
    // and it says so rather than leaving you to notice.
    await user.click(within(bearers).getByText('Zaak').closest('button'));
    await user.click(within(bearers).getByText('Ik').closest('button'));
    expect(bearers.textContent).toContain('in niemands vaste lasten mee');
    await user.click(within(sheet).getByRole('button', { name: 'Bewaren' }));

    await user.click(screen.getByRole('button', { name: 'Mijn deel' }));
    expect(screen.queryByText('Sportclub')).toBe(null);
    expect(screen.getByText(/1 draag je niet/)).toBeTruthy();
  }, 30000);
});

describe('changing one person\'s amount', () => {
  it('starts from tapping that amount, not from a division method', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(await screen.findByText('Streamingdienst'));
    await user.click(await screen.findByRole('button', { name: 'Wijzigen' }));

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

describe('clearing an amount to retype it', () => {
  it('keeps the row, and the field you are typing in', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(await screen.findByText('Streamingdienst'));
    await user.click(await screen.findByRole('button', { name: 'Wijzigen' }));
    await user.click(await screen.findByRole('button', { name: /Bedrag voor Ik zelf invullen/i }));

    const sheet = screen.getByRole('heading', { name: 'Post wijzigen' }).closest('.sheet');
    // The first 0,00 field is the expense's own amount; the split rows follow.
    const splitFields = () => within(sheet).getAllByPlaceholderText('0,00').slice(1);
    const mine = splitFields()[0];
    expect(mine.value).toBe('5,00');

    // Backspace all the way to empty: the row used to vanish here, because a
    // weight of zero dropped the bearer out of the split.
    await user.clear(mine);
    expect(splitFields().length).toBe(4);
    expect(document.body.contains(mine)).toBe(true);

    // And typing carries on in the same field.
    await user.type(mine, '7,50');
    expect(splitFields()[0].value).toBe('7,50');
    expect(within(sheet).getAllByText('€ 7,50').length).toBeGreaterThan(0);
  }, 30000);
});

describe('grouping expenses', () => {
  it('offers the groups already in use, and keeps them one group', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(await screen.findByText('Inboedel'));
    await user.click(await screen.findByRole('button', { name: 'Wijzigen' }));

    const sheet = screen.getByRole('heading', { name: 'Post wijzigen' }).closest('.sheet');
    // Category and charge look the same on purpose, so scope to the right one.
    const field = within(sheet).getByText('Incasso').closest('.field');
    // Two expenses share the charge "Verzekeraar", so it is on offer here.
    const chip = within(field).getByRole('button', { name: /Verzekeraar/ });
    expect(chip.className).toContain('on');
    // No free-text field until you ask for one: that is what makes typos into
    // second groups.
    expect(within(field).queryByPlaceholderText(/Naam van de afschrijving/)).toBe(null);

    // Tapping it again takes this expense out of the group.
    await user.click(chip);
    expect(within(field).getByRole('button', { name: /Verzekeraar/ }).className).not.toContain('on');

    // And a new one is a deliberate step.
    await user.click(within(field).getByRole('button', { name: /Nieuwe/ }));
    await user.type(within(field).getByPlaceholderText(/Naam van de afschrijving/), 'Zorgverzekeraar');
    await user.click(within(sheet).getByRole('button', { name: 'Bewaren' }));

    // Which then shows up as a group of its own on the overview.
    await user.click(screen.getByRole('button', { name: /Overzicht/ }));
    expect(await screen.findByText('Zorgverzekeraar')).toBeTruthy();
  }, 30000);
});

describe('opening an expense', () => {
  it('shows it, without a keyboard and without a form', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(await screen.findByText('Streamingdienst'));

    // A sheet named after the expense, not "Post wijzigen".
    const sheet = (await screen.findByRole('heading', { name: 'Streamingdienst' })).closest('.sheet');
    expect(screen.queryByRole('heading', { name: 'Post wijzigen' })).toBe(null);

    // Nothing to type into, so nothing can pull the keyboard up or be changed
    // by a stray tap.
    expect(within(sheet).queryAllByRole('textbox').length).toBe(0);
    // Nothing with a keyboard behind it has the focus.
    expect(['INPUT', 'TEXTAREA', 'SELECT']).not.toContain(document.activeElement.tagName);

    // What you came to see: the amount, the year figure, who it comes off, and
    // what it costs each of you.
    expect(sheet.querySelector('.headline .figure').textContent).toBe('€ 20,00');
    expect(within(sheet).getByText(/240,00 per jaar/)).toBeTruthy();
    expect(within(sheet).getByText('Privé')).toBeTruthy();

    // Four bearers at 5,00, under the heading that says so.
    const bearers = within(sheet).getByText('Wie draagt het').nextElementSibling;
    expect(within(bearers).getAllByText('€ 5,00').length).toBe(4);

    // And what it ends up inside: my 5,00 of this against the 6,00 the friend
    // pays for his, which is the 1,00 on the overview.
    expect(within(sheet).getByText('Verrekend met')).toBeTruthy();
    // Exactly one panel, and it is the one that answers the question: this post
    // against the friend's, which is the 1,00 you see on the overview.
    const panels = [...sheet.querySelectorAll('.panel')].filter((el) =>
      el.textContent.includes('deze post')
    );
    expect(panels).toHaveLength(1);
    expect(panels[0].textContent).toBe(
      'Streamingdienstdeze post−€ 5,00Muziekdienst€ 6,00Vaste lasten → Vriend€ 1,00'
    );

    // So: nothing where every expense pulls the same way — those are added up,
    // not settled against each other — and nothing for your own deposit into
    // the account, which is everything you owe it gathered into one amount
    // rather than a settlement with anybody.

    // Changing it is a step you take on purpose.
    await user.click(within(sheet).getByRole('button', { name: 'Wijzigen' }));
    expect(await screen.findByRole('heading', { name: 'Post wijzigen' })).toBeTruthy();
  }, 30000);

  it('still opens a new expense straight into the form', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(screen.getByRole('button', { name: 'Nieuwe post' }));

    // An empty field is the whole point here, so it may take the focus.
    expect(await screen.findByRole('heading', { name: 'Nieuwe post' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByPlaceholderText(/Energie, internet/));
  }, 30000);
});

describe('the expense list', () => {
  it('says what kind of expense each one is, in the row itself', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));

    const row = (await screen.findByText('Streamingdienst')).closest('.item');
    // The coloured dot alone does not tell you which category it stands for.
    expect(row.textContent).toContain('Streaming & media');
    expect(row.textContent).toContain('van Privé');
  }, 30000);
});

describe('renaming a label', () => {
  it('carries every expense that uses it along', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Meer/ }));

    const charges = (await screen.findByText(/Incasso.s — posten/)).nextElementSibling;
    const row = within(charges).getByText('Verzekeraar').closest('.line');
    expect(row.textContent).toContain('2 posten');
    await user.click(row);

    const sheet = screen.getByRole('heading', { name: 'Incasso hernoemen' }).closest('.sheet');
    const field = within(sheet).getByRole('textbox');
    await user.clear(field);
    await user.type(field, 'Verzekeringspakket');
    await user.click(within(sheet).getByRole('button', { name: 'Bewaren' }));

    expect(await screen.findByText(/2 posten aangepast/)).toBeTruthy();
    expect(within(charges).queryByText('Verzekeraar')).toBe(null);
    expect(within(charges).getByText('Verzekeringspakket').closest('.line').textContent)
      .toContain('2 posten');

    // And it is one group on the overview, not two.
    await user.click(screen.getByRole('button', { name: /Overzicht/ }));
    expect((await screen.findAllByText('Verzekeringspakket')).length).toBe(1);
  }, 30000);

  it('renames a category across expenses saved under the old ids too', async () => {
    // Expenses saved before categories were names carry an id like "telecom".
    const set = exampleHousehold();
    set.expenses = set.expenses.map((e) =>
      e.name === 'Internet' ? { ...e, category: 'telecom' } : e
    );
    await withData(set);
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Meer/ }));

    const categories = (await screen.findByText(/Categorieën — wát/)).nextElementSibling;
    const row = within(categories).getByText('Internet & telefoon').closest('.line');
    expect(row.textContent).toContain('1 post');
    await user.click(row);

    const sheet = screen.getByRole('heading', { name: 'Categorie hernoemen' }).closest('.sheet');
    const field = within(sheet).getByRole('textbox');
    await user.clear(field);
    await user.type(field, 'Internet');
    await user.click(within(sheet).getByRole('button', { name: 'Bewaren' }));

    expect(await screen.findByText(/1 post aangepast/)).toBeTruthy();
  }, 30000);
});

describe('reading an expense row', () => {
  it('says what it is, where it goes off and which debit it rides on', async () => {
    const set = exampleHousehold();
    await withData(set);
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));

    const row = (await screen.findByText('Inboedel')).closest('.item');
    // All three under the name, in that order, so the name keeps its own line.
    const sub = row.querySelector('.sub').textContent;
    expect(sub).toContain('Verzekeringen ·');
    expect(sub).toContain('van Vaste lasten');
    expect(sub).toContain('Verzekeraar');
    expect(row.querySelector('.title').textContent).toBe('Inboedel');
  }, 30000);
});

describe('getting rid of a label', () => {
  it('clears a category field instead of refilling it while you type', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(await screen.findByText('Sportclub'));
    await user.click(await screen.findByRole('button', { name: 'Wijzigen' }));

    const sheet = screen.getByRole('heading', { name: 'Post wijzigen' }).closest('.sheet');
    const field = within(sheet).getByText('Categorie').closest('.field');
    await user.click(within(field).getByRole('button', { name: /Nieuwe/ }));

    const input = within(field).getByPlaceholderText(/Naam van de categorie/);
    await user.type(input, 'Sport');
    await user.clear(input);
    // It used to come back as "Overig" the moment the field went empty.
    expect(input.value).toBe('');

    await user.type(input, 'Sport');
    expect(input.value).toBe('Sport');
  }, 30000);

  it('merges a category into another, which is how one goes away', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Meer/ }));

    const categories = (await screen.findByText(/Categorieën — wát/)).nextElementSibling;
    await user.click(within(categories).getByText('Streaming & media').closest('.line'));

    const sheet = screen.getByRole('heading', { name: 'Categorie hernoemen' }).closest('.sheet');
    // The other categories are offered, because merging is the way out.
    await user.click(within(sheet).getByRole('button', { name: 'Overig' }));
    expect(within(sheet).getByText(/bestaat al/)).toBeTruthy();
    await user.click(within(sheet).getByRole('button', { name: 'Samenvoegen' }));

    expect(await screen.findByText(/2 posten aangepast/)).toBeTruthy();
    const after = (await screen.findByText(/Categorieën — wát/)).nextElementSibling;
    expect(within(after).queryByText('Streaming & media')).toBe(null);
  }, 30000);

  it('takes a charge off every expense at once', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Meer/ }));

    const charges = (await screen.findByText(/Incasso.s — posten/)).nextElementSibling;
    await user.click(within(charges).getByText('Verzekeraar').closest('.line'));
    await user.click(screen.getByRole('button', { name: 'Overal weghalen' }));

    expect(await screen.findByText(/weggehaald bij 2 posten/)).toBeTruthy();
    expect(screen.getByText(/Nog geen incasso/)).toBeTruthy();
  }, 30000);
});

describe('saving up for a yearly expense', () => {
  const household = () => {
    const set = exampleHousehold();
    // The quarterly one starts in January, so it is charged in January, April,
    // July and October — not in September.
    set.expenses = set.expenses.map((e) =>
      e.name === 'Gemeentelijke heffingen' ? { ...e, from: '2024-01-01' } : e
    );
    return set;
  };

  it('shows what really leaves the account, next to the monthly load', async () => {
    await withData(household());
    const user = await start();

    // The pot: 171,00 a month in the books, of which the 30,00 quarterly share
    // is being saved up — so in September only 141,00 actually goes out.
    await screen.findByText(/Elke maand overmaken/);
    const pot = [...document.querySelectorAll('.section')]
      .find((s) => s.textContent === 'Vaste lasten').nextElementSibling;
    expect(within(pot).getByText('Maandlast').closest('.line').textContent).toContain('171,00');
    expect(within(pot).getByText(/echt af/).closest('.line').textContent).toContain('141,00');
    // Two instalments in since July: 60,00.
    expect(within(pot).getByText(/Hoort er nu op te staan/).closest('.line').textContent)
      .toContain('60,00');

    // And the expense itself says when it goes out and what is put by.
    await user.click(screen.getByRole('button', { name: /Lasten/ }));
    await user.click(await screen.findByText('Gemeentelijke heffingen'));
    const sheet = (await screen.findByRole('heading', { name: 'Gemeentelijke heffingen' }))
      .closest('.sheet');
    expect(within(sheet).getByText('Wordt afgeschreven in').closest('.line').textContent)
      .toContain('oktober 2026');
    expect(within(sheet).getByText('Staat er nu opzij').closest('.line').textContent)
      .toContain('60,00');
  }, 30000);

  it('asks which month it is charged rather than guessing', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(await screen.findByText('Gemeentelijke heffingen'));

    const sheet = (await screen.findByRole('heading', { name: 'Gemeentelijke heffingen' }))
      .closest('.sheet');
    expect(within(sheet).getByText(/Wordt afgeschreven in/)).toBeTruthy();
    expect(within(sheet).queryByText('Staat er nu opzij')).toBe(null);
  }, 30000);

  it('takes the charge month from the form and saves up from there', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(await screen.findByText('Gemeentelijke heffingen'));
    await user.click(await screen.findByRole('button', { name: 'Wijzigen' }));

    const form = screen.getByRole('heading', { name: 'Post wijzigen' }).closest('.sheet');
    const field = within(form).getByText('Wordt afgeschreven in').closest('.field');
    // Quarterly, charged in July: in September two instalments are in.
    await user.selectOptions(within(field).getByRole('combobox'), '7');
    await user.click(within(form).getByRole('button', { name: 'Bewaren' }));

    await user.click(await screen.findByText('Gemeentelijke heffingen'));
    const sheet = (await screen.findByRole('heading', { name: 'Gemeentelijke heffingen' }))
      .closest('.sheet');
    expect(within(sheet).getByText('Staat er nu opzij').closest('.line').textContent)
      .toContain('60,00');
    expect(within(sheet).getByText('Wordt afgeschreven in').closest('.line').textContent)
      .toContain('oktober');
  }, 30000);
});

describe('counting things', () => {
  it('writes one of something in the singular', async () => {
    const set = exampleHousehold();
    // Leave one expense alone on a charge of its own.
    set.expenses = set.expenses.map((e) =>
      e.name === 'Aansprakelijkheid' ? { ...e, charge: 'Rechtsbijstand' } : e
    );
    await withData(set);
    await start();

    const charges = (await screen.findByText('Per incasso')).nextElementSibling;
    expect(within(charges).getAllByText(/^1 post( ·|$)/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('1 posten');
  }, 30000);
});

describe('why this app exists', () => {
  it('says so at the bottom of the settings, out of your own ledger', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Meer/ }));

    expect(await screen.findByText('Waarom deze app')).toBeTruthy();
    // Written from what is in there: the settlement account by name, the
    // business account by name, and the standing orders on the bills account.
    expect(screen.getByText(/Alles loopt langs Vaste lasten/)).toBeTruthy();
    expect(screen.getByText(/Zaak schiet voor/)).toBeTruthy();
    expect(screen.getByText(/Klopt de vaste inleg nog/)).toBeTruthy();
    expect(screen.getByText(/Niemand kan meelezen/)).toBeTruthy();
    expect(screen.getByText(/uit wat er nu in je eigen overzicht staat/)).toBeTruthy();
  }, 30000);

  it('leaves out what does not happen in this household', async () => {
    const set = exampleHousehold();
    // No business account, so nothing fronts anything.
    set.accounts = set.accounts.filter((a) => a.kind !== 'business');
    set.expenses = set.expenses.filter((e) => e.payer?.kind !== 'account' || set.accounts.some((a) => a.id === e.payer.id));
    set.expenses = set.expenses.map((e) => ({
      ...e,
      split: {
        ...e.split,
        weights: Object.fromEntries(
          Object.entries(e.split.weights || {}).filter(([k]) => !k.startsWith('account:'))
        ),
      },
    }));
    await withData(set);
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Meer/ }));

    await screen.findByText('Waarom deze app');
    expect(screen.queryByText(/schiet voor/)).toBe(null);
    expect(screen.getByText(/Niemand kan meelezen/)).toBeTruthy();
  }, 30000);
});

describe('taking the overview apart', () => {
  it('opens every kind of figure and shows the posts behind it', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await screen.findByText('Jouw deel');

    // The two figures in the hero.
    await user.click(screen.getByText('Jouw deel'));
    let sheet = screen.getByRole('heading', { name: 'Jouw deel' }).closest('.sheet');
    expect(within(sheet).getByText('Streamingdienst')).toBeTruthy();
    await user.click(within(sheet).getByRole('button', { name: 'Sluiten' }));

    await user.click(screen.getByText('Loopt in totaal'));
    sheet = screen.getByRole('heading', { name: 'Loopt in totaal' }).closest('.sheet');
    expect(within(sheet).getByText('Streamingdienst')).toBeTruthy();
    await user.click(within(sheet).getByRole('button', { name: 'Sluiten' }));

    // A category.
    await user.click(screen.getByText('Verzekeringen'));
    sheet = screen.getByRole('heading', { name: 'Verzekeringen' }).closest('.sheet');
    expect(within(sheet).getByText('Inboedel')).toBeTruthy();
    await user.click(within(sheet).getByRole('button', { name: 'Sluiten' }));
  }, 30000);

  it('adds a breakdown up to exactly the figure it came from', async () => {
    await withData(exampleHousehold());
    const user = await start();

    await user.click(await screen.findByText('Loopt in totaal'));
    const sheet = screen.getByRole('heading', { name: 'Loopt in totaal' }).closest('.sheet');
    const amounts = [...sheet.querySelectorAll('.line .amount')].map((el) =>
      Math.round(Number(el.textContent.replace(/[^\d,-]/g, '').replace(',', '.')) * 100)
    );
    const total = sheet.querySelector('.total .amount').textContent;
    const sum = amounts.reduce((a, b) => a + b, 0);
    expect((sum / 100).toFixed(2).replace('.', ',')).toBe(total.replace(/[^\d,]/g, ''));
  }, 30000);

  it('says what has to be on an account for a bill that comes once a year', async () => {
    const set = exampleHousehold();
    // Give the yearly one a start, so Pay knows which month it goes out.
    set.expenses = set.expenses.map((e) =>
      e.name === 'Aansprakelijkheid' ? { ...e, cadence: 'year', amount: 12000, from: '2025-03-01' } : e
    );
    await withData(set);
    const user = await start();

    await screen.findByText(/Elke maand overmaken/);
    const pot = [...document.querySelectorAll('.section')]
      .find((el) => el.textContent === 'Vaste lasten').nextElementSibling;
    await user.click(within(pot).getByText('Hoort er nu op te staan'));
    const sheet = screen
      .getByRole('heading', { name: 'Hoort er nu op te staan' })
      .closest('.sheet');
    // The yearly one, with the month it goes out next.
    expect(within(sheet).getByText('Aansprakelijkheid')).toBeTruthy();
    expect(within(sheet).getByText(/volgende keer/)).toBeTruthy();
  }, 30000);
});

describe('a long list of expenses', () => {
  it('falls into named groups with a subtotal when sorted by category', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));

    // One list to begin with.
    expect(document.querySelectorAll('.panel').length).toBe(1);

    await user.selectOptions(screen.getByLabelText('Sortering'), 'category');
    expect(document.querySelectorAll('.panel').length).toBeGreaterThan(3);

    // Each group is headed by its category and what it comes to.
    const heading = [...document.querySelectorAll('.section')]
      .find((el) => el.textContent === 'Verzekeringen');
    expect(heading).toBeTruthy();
    expect(heading.parentElement.textContent).toContain('20,00');
  }, 30000);
});

describe('what is left, on its own tab', () => {
  const go = async (user) => user.click(await screen.findByRole('button', { name: /Overhouden/ }));

  it('runs a holding from turnover down to what stays', async () => {
    await withData(exampleHousehold());
    const user = await start();

    // Turnover on the business account, and a salary paid out of it.
    await user.click(await screen.findByRole('button', { name: /Mensen/ }));
    await user.click(await screen.findByText('Zaak'));
    let sheet = screen.getByRole('heading', { name: 'Rekening wijzigen' }).closest('.sheet');
    let field = within(sheet).getByText('Komt er maandelijks op').closest('.field');
    await user.type(within(field).getByRole('textbox'), '8000,00');
    await user.click(within(sheet).getByRole('button', { name: 'Bewaren' }));

    await user.click(await screen.findByText('Ik'));
    sheet = screen.getByRole('heading', { name: 'Persoon wijzigen' }).closest('.sheet');
    field = within(sheet).getByText('Inkomen per maand').closest('.field');
    await user.type(within(field).getByRole('textbox'), '5000,00');
    await user.click(within(field).getByRole('button', { name: 'Zaak' }));
    await user.click(within(sheet).getByRole('button', { name: 'Bewaren' }));

    await go(user);
    const panel = [...document.querySelectorAll('.section')]
      .find((el) => el.textContent === 'Zaak').nextElementSibling;
    expect(within(panel).getByText('Komt binnen').closest('.line').textContent)
      .toContain('8.000,00');
    expect(within(panel).getByText('Salaris naar Ik').closest('.line').textContent)
      .toContain('5.000,00');
    // 8.000 in, 5.000 salary, 50,00 of internet and 4,00 of bank charges.
    expect(within(panel).getByText('Blijft staan').closest('.total').textContent)
      .toContain('2.946,00');

    // And the person below it: income against what they carry.
    const mine = [...document.querySelectorAll('.section')]
      .find((el) => el.textContent === 'Ik').nextElementSibling;
    // 5.000 income, 146,50 of fixed costs — but 25,00 of that is your half of
    // the internet, which the business pays. Your salary never saw it, so it
    // goes back on: 5.000 − 146,50 + 25,00.
    expect(within(mine).getByText('Betaalt je zaak voor je').closest('.line').textContent)
      .toContain('25,00');
    expect(within(mine).getByText('Houd je over').closest('.total').textContent)
      .toContain('4.878,50');

    // And the pots you pay into are the last link of that same chain: your
    // share in, the bills off, nothing of its own left over.
    const pot = [...document.querySelectorAll('.section')]
      .find((el) => el.textContent === 'Vaste lasten').nextElementSibling;
    // Everyone who pays into it, by name and in their own colour.
    expect(within(pot).getAllByText('stort erop').length).toBeGreaterThan(1);
    expect(within(pot).getByText('Ik')).toBeTruthy();
    expect(within(pot).getByText('Komt uit op').closest('.total').textContent).toContain('0,00');

    // Top to bottom, one chain: the account the money comes in on, then the
    // person it pays a salary to, with the link between them named.
    const headings = [...document.querySelectorAll('.section')].map((el) => el.textContent);
    expect(headings.indexOf('Zaak')).toBeLessThan(headings.indexOf('Ik'));
    // And the salary comes directly under the account that pays it, before the
    // accounts that same account fills.
    expect(headings.indexOf('Ik')).toBe(headings.indexOf('Zaak') + 1);
    const link = [...document.querySelectorAll('.flows')].map((el) => el.textContent);
    expect(link.some((t) => /5\.000,00 salaris vanaf Zaak/.test(t))).toBe(true);

    // And that is not a lump either: it opens into your share of every post,
    // said as a share of the whole and off whose account it goes.
    await user.click(within(mine).getByText('Vaste lasten').closest('.line'));
    const opened = screen.getByRole('heading', { name: 'Vaste lasten van Ik' }).closest('.sheet');
    const row = within(opened).getByText('Streamingdienst').closest('.line');
    // 20,00 over four, off the personal account.
    expect(row.textContent).toContain('5,00');
    expect(row.textContent).toContain('jouw deel van € 20,00');
    expect(row.textContent).toContain('van Privé');
    expect(within(opened).getByText('Samen').closest('.total').textContent).toContain('146,50');
  }, 30000);

  it('names what one account puts into another, even with no amount set', async () => {
    await withData(exampleHousehold());
    const user = await start();

    // Privé is filled from Zaak. No standing order typed — that is the point:
    // the question used to be hidden until you had already answered it.
    await user.click(await screen.findByRole('button', { name: /Mensen/ }));
    await user.click(await screen.findByText('Privé'));
    const sheet = screen.getByRole('heading', { name: 'Rekening wijzigen' }).closest('.sheet');
    const field = within(sheet).getByText('Wordt gevuld vanaf').closest('.field');
    await user.click(within(field).getByRole('button', { name: 'Zaak' }));
    await user.click(within(sheet).getByRole('button', { name: 'Bewaren' }));

    await go(user);

    // Zaak now says where that money goes, at what Privé actually costs:
    // 20,00 of streaming and 25,00 of sport.
    const zaak = [...document.querySelectorAll('.section')]
      .find((el) => el.textContent === 'Zaak').nextElementSibling;
    const feed = within(zaak).getByText('Naar Privé').closest('.line');
    expect(feed.textContent).toContain('45,00');
    expect(feed.textContent).toContain('nog geen vast bedrag');

    // The account that feeds comes first, and the link says what runs down it.
    const order = [...document.querySelectorAll('.section')].map((el) => el.textContent);
    expect(order.indexOf('Zaak')).toBeLessThan(order.indexOf('Privé'));
    expect([...document.querySelectorAll('.flows')].some((el) => /45,00 vanaf Zaak/.test(el.textContent)))
      .toBe(true);

    // And Privé is not reported as short of money that arrives every month.
    const prive = [...document.querySelectorAll('.section')]
      .find((el) => el.textContent === 'Privé').nextElementSibling;
    expect(within(prive).getByText('Komt van Zaak').closest('.line').textContent)
      .toContain('45,00');
    // Nought here means it balances, not that nothing stays — the words for
    // those two are not the same.
    expect(within(prive).getByText('Komt uit op').closest('.total').textContent)
      .toContain('0,00');

    // The posts on that account open too, at their full amount.
    await user.click(within(prive).getByText('Vaste lasten eraf').closest('.line'));
    const costs = screen.getByRole('heading', { name: 'Vaste lasten van Privé' }).closest('.sheet');
    const full = within(costs).getByText('Streamingdienst').closest('.line');
    // The whole amount big, your share of it small — the person's sheet puts
    // the same two numbers the other way round.
    expect(full.textContent).toContain('20,00');
    expect(full.textContent).toContain('waarvan jij € 5,00');
    await user.click(within(costs).getByRole('button', { name: 'Sluiten' }));

    // Tapping the row opens the bill behind it, post by post.
    await user.click(feed.querySelector('.line-open') || feed);
    const opened = screen.getByRole('heading', { name: 'Naar Privé' }).closest('.sheet');
    expect(within(opened).getByText('Streamingdienst')).toBeTruthy();
    expect(within(opened).getByText('Sportclub')).toBeTruthy();
    expect(opened.textContent).toContain('Er staat nog geen vaste inleg bij Privé');
  }, 30000);

  it('says it is a plan, not a sum out of the ledger', async () => {
    const set = exampleHousehold();
    set.people = set.people.map((p) => (p.isMe ? { ...p, income: 300000 } : p));
    await withData(set);
    const user = await start();
    await go(user);
    expect(screen.getByText(/Inkomen en omzet vul je zelf in/)).toBeTruthy();
  }, 30000);

  it('stays empty until something is filled in', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await go(user);
    expect(screen.getByText(/Nog niets ingevuld/)).toBeTruthy();
  }, 30000);

  it('leaves the overview to sharing and settling', async () => {
    const set = exampleHousehold();
    set.people = set.people.map((p) => (p.isMe ? { ...p, income: 300000 } : p));
    await withData(set);
    await start();
    await screen.findByText('Jouw deel');
    const headings = [...document.querySelectorAll('.section')].map((el) => el.textContent);
    expect(headings).not.toContain('Wat er overblijft');
    expect(headings).not.toContain('Je eigen rekeningen');
    // A shared pot still has its panel there.
    expect(headings).toContain('Vaste lasten');
  }, 30000);
});

describe('a bill charged every four weeks', () => {
  it('names the cushion for the month that carries two of them', async () => {
    const set = exampleHousehold();
    const me = set.people.find((p) => p.isMe).id;
    set.accounts = [
      ...set.accounts,
      { id: 'a-cycle', name: 'Doorlopend', kind: 'shared', members: [me] },
    ];
    set.expenses = [
      ...set.expenses,
      { id: 'e-cycle', name: 'Mobiel', amount: 2500, cadence: 'fourweek', category: 'Overig',
        payer: { kind: 'account', id: 'a-cycle' },
        split: { kind: 'equal', participants: [me], weights: {} } },
    ];
    await withData(set);
    await start();

    await screen.findByText('Jouw deel');
    const pot = [...document.querySelectorAll('.section')]
      .find((el) => el.textContent === 'Doorlopend').nextElementSibling;
    // 25,00 every four weeks is 27,08 a month...
    expect(within(pot).getByText('Maandlast').closest('.line').textContent).toContain('27,08');
    // ...and one charge is what has to be able to sit on the account.
    expect(pot.nextElementSibling.textContent).toContain('€ 25,00');
  }, 30000);
});

describe('twelve instalments against a year', () => {
  it('says the rounding difference out loud where it is not nought', async () => {
    const set = exampleHousehold();
    const me = set.people.find((p) => p.isMe).id;
    set.accounts = [
      ...set.accounts,
      { id: 'a-odd', name: 'Losse pot', kind: 'shared', members: [me] },
    ];
    // 100,00 a year is 8,33 a month, and twelve of those is 99,96.
    set.expenses = [
      ...set.expenses,
      { id: 'e-odd', name: 'Domeinnaam', amount: 10000, cadence: 'year', chargeMonth: 5,
        category: 'Overig', payer: { kind: 'account', id: 'a-odd' },
        split: { kind: 'equal', participants: [me], weights: {} } },
    ];
    await withData(set);
    const user = await start();

    await screen.findByText('Jouw deel');
    const pot = [...document.querySelectorAll('.section')]
      .find((el) => el.textContent === 'Losse pot').nextElementSibling;
    await user.click(within(pot).getByText('Maandlast'));

    const sheet = screen.getByRole('heading', { name: 'Losse pot' }).closest('.sheet');
    expect(sheet.textContent).toContain('€ 99,96');
    expect(sheet.textContent).toContain('€ 100,00');
    expect(sheet.textContent).toContain('€ 0,04 per jaar tekort');
    await user.click(within(sheet).getByRole('button', { name: 'Sluiten' }));

    // And it is an amount you can act on: one transfer a year.
    const row = within(pot).getByText('Eén keer per jaar bijstorten').closest('.line');
    expect(row.textContent).toContain('0,04');
    await user.click(row);
    const why = screen.getByRole('heading', { name: 'Rondingsverschil per jaar' }).closest('.sheet');
    expect(within(why).getByText('Domeinnaam')).toBeTruthy();
  }, 30000);
});

describe('an account with nothing to save up for', () => {
  it('says nothing about a balance it cannot know', async () => {
    const set = exampleHousehold();
    const me = set.people.find((p) => p.isMe).id;
    const partner = set.people.find((p) => !p.isMe && p.name === 'Partner').id;
    set.accounts = [
      ...set.accounts,
      { id: 'a-save', name: 'Samen sparen', kind: 'shared', members: [me, partner] },
    ];
    set.expenses = [
      ...set.expenses,
      { id: 'e-save', name: 'Sparen', amount: 20000, cadence: 'month', category: 'Sparen',
        payer: { kind: 'account', id: 'a-save' },
        split: { kind: 'equal', participants: [me, partner], weights: {} } },
    ];
    await withData(set);
    await start();

    await screen.findByText('Jouw deel');
    const pot = [...document.querySelectorAll('.section')]
      .find((el) => el.textContent === 'Samen sparen').nextElementSibling;
    // Everything on it is monthly, so there is nothing being put by — and a
    // nought here would read as a claim about what is on the account.
    expect(within(pot).queryByText('Hoort er nu op te staan')).toBe(null);
    expect(within(pot).getByText('Maandlast').closest('.line').textContent).toContain('200,00');
  }, 30000);
});

describe('an account people pay into but nothing runs off', () => {
  it('shows the standing orders without calling them a surplus', async () => {
    const set = exampleHousehold();
    const me = set.people.find((p) => p.isMe).id;
    const partner = set.people.find((p) => !p.isMe && p.name === 'Partner').id;
    set.accounts = [
      ...set.accounts,
      { id: 'a-food', name: 'Boodschappen', kind: 'shared',
        members: [me, partner], contributions: { [me]: 25000, [partner]: 25000 } },
    ];
    await withData(set);
    await start();

    await screen.findByText('Jouw deel');
    const pot = [...document.querySelectorAll('.section')]
      .find((el) => el.textContent === 'Boodschappen').nextElementSibling;
    // The deposit is there...
    expect(within(pot).getByText('Staat als vaste inleg ingesteld').closest('.line').textContent)
      .toContain('500,00');
    // ...but nothing claims that 500,00 is left over every month.
    expect(within(pot).queryByText('Blijft over')).toBe(null);
    expect(pot.nextElementSibling.textContent).toContain('Geen posten op deze rekening');
  }, 30000);
});

describe('what one charge is made of', () => {
  it('opens on a tap and names the expenses behind the amount', async () => {
    await withData(exampleHousehold());
    const user = await start();

    const charges = (await screen.findByText('Per incasso')).nextElementSibling;
    await user.click(within(charges).getByRole('button', { name: /Verzekeraar/ }));

    const sheet = screen.getByRole('heading', { name: 'Verzekeraar' }).closest('.sheet');
    // 12,00 and 8,00 on one debit: both by name, and the total they add up to.
    expect(within(sheet).getByText('Inboedel')).toBeTruthy();
    expect(within(sheet).getByText('Aansprakelijkheid')).toBeTruthy();
    expect(within(sheet).getAllByText('€ 20,00').length).toBeGreaterThan(0);
  }, 30000);
});

describe('taking a charge off one expense', () => {
  it('offers "Geen" rather than making you guess that tapping again lets go', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(await screen.findByText('Inboedel'));
    await user.click(await screen.findByRole('button', { name: 'Wijzigen' }));

    const sheet = screen.getByRole('heading', { name: 'Post wijzigen' }).closest('.sheet');
    const field = within(sheet).getByText('Incasso').closest('.field');
    expect(within(field).getByRole('button', { name: /Verzekeraar/ }).className).toContain('on');

    await user.click(within(field).getByRole('button', { name: 'Geen' }));
    expect(within(field).getByRole('button', { name: 'Geen' }).className).toContain('on');
    expect(within(field).getByRole('button', { name: /Verzekeraar/ }).className).not.toContain('on');

    await user.click(within(sheet).getByRole('button', { name: 'Bewaren' }));

    // Only this expense loses it; the other one on that charge keeps it.
    await user.click(screen.getByRole('button', { name: /Overzicht/ }));
    const charges = (await screen.findByText('Per incasso')).nextElementSibling;
    expect(within(charges).getByText(/^1 post( ·|$)/)).toBeTruthy();
  }, 30000);

  it('has no "Geen" for a category, because an expense always has one', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(await screen.findByText('Inboedel'));
    await user.click(await screen.findByRole('button', { name: 'Wijzigen' }));

    const sheet = screen.getByRole('heading', { name: 'Post wijzigen' }).closest('.sheet');
    const field = within(sheet).getByText('Categorie').closest('.field');
    expect(within(field).queryByRole('button', { name: 'Geen' })).toBe(null);
  }, 30000);
});

describe('money that comes back', () => {
  it('lets an expense be negative, and takes it off what you carry', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(screen.getByRole('button', { name: 'Nieuwe post' }));

    await user.type(screen.getByPlaceholderText(/Energie, internet/), 'Btw terug');
    await user.type(screen.getByPlaceholderText('0,00'), '-2,59');

    const sheet = screen.getByRole('heading', { name: 'Nieuwe post' }).closest('.sheet');
    // "Zaak" is both an account to pay from and something that can bear a
    // share, so aim at the field that asks where it comes off.
    const from = within(sheet).getByText(/Waar gaat het vanaf/).closest('.field');
    await user.click(within(from).getByRole('button', { name: /Zaak/ }));
    const save = within(sheet).getByRole('button', { name: 'Bewaren' });
    expect(save.disabled).toBe(false);
    await user.click(save);

    // 278,00 a month, minus the 2,59 that comes back.
    await user.click(screen.getByRole('button', { name: /Overzicht/ }));
    expect((await screen.findAllByText('€ 275,41')).length).toBeGreaterThan(0);
  }, 30000);

  it('still refuses an expense of nothing', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(screen.getByRole('button', { name: 'Nieuwe post' }));
    await user.type(screen.getByPlaceholderText(/Energie, internet/), 'Niets');

    const sheet = screen.getByRole('heading', { name: 'Nieuwe post' }).closest('.sheet');
    expect(within(sheet).getByRole('button', { name: 'Bewaren' }).disabled).toBe(true);
  }, 30000);
});

describe('entering a negative amount on a phone', () => {
  it('turns the euro sign into a minus, since a number pad has none', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(screen.getByRole('button', { name: 'Nieuwe post' }));

    const sheet = screen.getByRole('heading', { name: 'Nieuwe post' }).closest('.sheet');
    await user.type(within(sheet).getByPlaceholderText(/Energie, internet/), 'Btw terug');
    await user.type(within(sheet).getByPlaceholderText('0,00'), '2,59');

    // Typed as a plain number, then made negative by tapping the sign.
    await user.click(within(sheet).getByRole('button', { name: /negatief maken/i }));
    const flipped = within(sheet).getByRole('button', { name: /positief maken/i });
    expect(flipped.textContent).toBe('−€');
    // The field keeps the amount; the sign sits in front of it.
    expect(within(sheet).getByPlaceholderText('0,00').value).toBe('2,59');

    const from = within(sheet).getByText(/Waar gaat het vanaf/).closest('.field');
    await user.click(within(from).getByRole('button', { name: /Zaak/ }));
    await user.click(within(sheet).getByRole('button', { name: 'Bewaren' }));

    // 278,00 a month, minus the 2,59 that comes back.
    await user.click(screen.getByRole('button', { name: /Overzicht/ }));
    expect((await screen.findAllByText('€ 275,41')).length).toBeGreaterThan(0);
  }, 30000);

  it('takes a typed minus too, where the keyboard has one', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));
    await user.click(screen.getByRole('button', { name: 'Nieuwe post' }));

    const sheet = screen.getByRole('heading', { name: 'Nieuwe post' }).closest('.sheet');
    await user.type(within(sheet).getByPlaceholderText('0,00'), '-2,59');
    expect(within(sheet).getByRole('button', { name: /positief maken/i })).toBeTruthy();
  }, 30000);
});
