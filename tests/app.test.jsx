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

    // Frans is there with the netted amount, not with two separate debts.
    const row = await screen.findByRole('button', { name: /Frans/ });
    expect(within(row).getByText(/3,50/)).toBeTruthy();
    expect(within(row).getByText(/krijgt terug van BUNQ/)).toBeTruthy();
    // Not green: money leaving the account is not money coming your way — you
    // fill that account, so you are the one paying it.
    expect(row.querySelector('.credit')).toBe(null);
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

    const charges = (await screen.findByText(/^Incasso/)).nextElementSibling;
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

    const categories = (await screen.findByText(/^Categorie/)).nextElementSibling;
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
  it('separates what it is from which debit it rides on', async () => {
    const set = exampleHousehold();
    await withData(set);
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Lasten/ }));

    const row = (await screen.findByText('Inboedel')).closest('.item');
    // The charge is a badge next to the name; the category is in the line below.
    expect(within(row).getByText('Verzekeraar', { selector: '.chip' })).toBeTruthy();
    expect(row.querySelector('.sub').textContent).toContain('Verzekeringen ·');
    expect(row.querySelector('.sub').textContent).toContain('van Vaste lasten');
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

    const categories = (await screen.findByText(/^Categorie/)).nextElementSibling;
    await user.click(within(categories).getByText('Streaming & media').closest('.line'));

    const sheet = screen.getByRole('heading', { name: 'Categorie hernoemen' }).closest('.sheet');
    // The other categories are offered, because merging is the way out.
    await user.click(within(sheet).getByRole('button', { name: 'Overig' }));
    expect(within(sheet).getByText(/bestaat al/)).toBeTruthy();
    await user.click(within(sheet).getByRole('button', { name: 'Samenvoegen' }));

    expect(await screen.findByText(/2 posten aangepast/)).toBeTruthy();
    const after = (await screen.findByText(/^Categorie/)).nextElementSibling;
    expect(within(after).queryByText('Streaming & media')).toBe(null);
  }, 30000);

  it('takes a charge off every expense at once', async () => {
    await withData(exampleHousehold());
    const user = await start();
    await user.click(await screen.findByRole('button', { name: /Meer/ }));

    const charges = (await screen.findByText(/^Incasso/)).nextElementSibling;
    await user.click(within(charges).getByText('Verzekeraar').closest('.line'));
    await user.click(screen.getByRole('button', { name: 'Overal weghalen' }));

    expect(await screen.findByText(/weggehaald bij 2 posten/)).toBeTruthy();
    expect(screen.getByText(/Nog geen incasso/)).toBeTruthy();
  }, 30000);
});
