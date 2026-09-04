import { describe, it, expect } from 'vitest';
import { forMonth, openSettlements, net, payerParty, explainTransfer, isBusiness } from '../src/lib/ledger.js';

// A household with everything in it that makes this hard: two people with a
// household bills account, a business account that also pays for shared things,
// a second shared account, and two people who only take part in a subscription.
//
// The names and amounts are made up, but chosen so the edge cases are in there:
// divisions that do not come out even, and a split where two bearers have to get
// the leftover cent.
const ME = 'p-me';
const PARTNER = 'p-partner';
const FRIEND = 'p-friend';
const NEIGHBOUR = 'p-neighbour';

const people = [
  { id: ME, name: 'Ik', isMe: true },
  { id: PARTNER, name: 'Partner' },
  { id: FRIEND, name: 'Vriend' },
  { id: NEIGHBOUR, name: 'Buur' },
];

const accounts = [
  { id: 'a-bills', name: 'Vaste lasten', kind: 'shared',
    members: [ME, PARTNER], contributions: { [ME]: 90000, [PARTNER]: 70000 } },
  { id: 'a-business', name: 'Zaak', kind: 'business', ownerId: ME },
  { id: 'a-personal', name: 'Privé', kind: 'personal', ownerId: ME },
  { id: 'a-second', name: 'Tweede pot', kind: 'shared', members: [ME, PARTNER] },
];

// The same accounts, but with the bills account as the settlement point.
const withHub = [{ ...accounts[0], settlement: true }, ...accounts.slice(1)];

const expense = (o) => ({
  cadence: 'month', category: 'other', split: { kind: 'equal', participants: [ME] }, ...o,
});

const flow = (result, from, to) =>
  result.transfers.find((t) => t.from === from && t.to === to)?.cents ?? 0;

describe('forMonth', () => {
  it('puts the share of a shared expense with the account', () => {
    const result = forMonth({
      people, accounts,
      expenses: [expense({
        id: '1', name: 'Energie', amount: 9000, payer: { kind: 'account', id: 'a-bills' },
        split: { kind: 'equal', participants: [ME, PARTNER] },
      })],
    }, '2026-09');

    expect(result.monthlyTotal).toBe(9000);
    expect(flow(result, `person:${ME}`, 'account:a-bills')).toBe(4500);
    expect(flow(result, `person:${PARTNER}`, 'account:a-bills')).toBe(4500);
  });

  it('charges a business-paid subscription back to the owner', () => {
    const result = forMonth({
      people, accounts,
      expenses: [expense({
        id: '2', name: 'Streamingdienst', amount: 4999,
        payer: { kind: 'account', id: 'a-business' },
        split: { kind: 'equal', participants: [ME, PARTNER, FRIEND, NEIGHBOUR] },
      })],
    }, '2026-09');

    // 4999 over four: 1250/1250/1250/1249 — exactly 4999 together.
    expect(Object.values(result.lines[0].shares).reduce((s, c) => s + c, 0)).toBe(4999);
    // My own share is not a debt: I paid it myself.
    expect(flow(result, `person:${ME}`, `person:${ME}`)).toBe(0);
    expect(flow(result, `person:${PARTNER}`, `person:${ME}`)).toBe(1250);
    expect(flow(result, `person:${NEIGHBOUR}`, `person:${ME}`)).toBe(1249);
  });

  it('cancels crossing subscriptions against each other', () => {
    const result = forMonth({
      people, accounts,
      expenses: [
        expense({
          id: '3', name: 'Streamingdienst', amount: 2400,
          payer: { kind: 'account', id: 'a-personal' },
          split: { kind: 'equal', participants: [ME, FRIEND] },
        }),
        // The friend pays for his own subscription; I take part.
        expense({
          id: '4', name: 'Muziekdienst', amount: 1400, payer: { kind: 'person', id: FRIEND },
          split: { kind: 'equal', participants: [ME, FRIEND] },
        }),
      ],
    }, '2026-09');

    const between = result.transfers.filter((t) => [t.from, t.to].join().includes(FRIEND));
    expect(between).toHaveLength(1);
    expect(between[0]).toMatchObject({ from: `person:${FRIEND}`, to: `person:${ME}`, cents: 500 });
  });

  it('converts yearly and quarterly expenses to the month', () => {
    const result = forMonth({
      people, accounts,
      expenses: [
        expense({ id: '5', name: 'Verzekering', amount: 18000, cadence: 'year',
          payer: { kind: 'account', id: 'a-bills' },
          split: { kind: 'equal', participants: [ME, PARTNER] } }),
        expense({ id: '6', name: 'Heffingen', amount: 9000, cadence: 'quarter',
          payer: { kind: 'account', id: 'a-bills' },
          split: { kind: 'equal', participants: [ME, PARTNER] } }),
      ],
    }, '2026-09');

    expect(result.monthlyTotal).toBe(1500 + 3000);
    expect(result.yearlyTotal).toBe(18000 + 36000);
  });

  it('keeps one-off expenses out of the monthly total', () => {
    const result = forMonth({
      people, accounts,
      expenses: [expense({ id: '7', name: 'Bank', amount: 80000, cadence: 'once',
        payer: { kind: 'account', id: 'a-personal' },
        split: { kind: 'equal', participants: [ME, PARTNER] } })],
    }, '2026-09');
    expect(result.monthlyTotal).toBe(0);
    expect(result.transfers).toHaveLength(0);
  });

  it('skips expenses that have not started or are already cancelled', () => {
    const expenses = [
      expense({ id: '8', name: 'Sportclub', amount: 2500, from: '2026-11-01',
        payer: { kind: 'account', id: 'a-personal' } }),
      expense({ id: '9', name: 'Krant', amount: 1200, until: '2026-06-30',
        payer: { kind: 'account', id: 'a-personal' } }),
      expense({ id: '10', name: 'Muziek', amount: 500, paused: true,
        payer: { kind: 'account', id: 'a-personal' } }),
    ];
    expect(forMonth({ people, accounts, expenses }, '2026-09').monthlyTotal).toBe(0);
    expect(forMonth({ people, accounts, expenses }, '2026-11').monthlyTotal).toBe(2500);
  });

  it('puts what is paid into the account next to what it costs', () => {
    const result = forMonth({
      people, accounts,
      expenses: [expense({ id: '11', name: 'Woonlasten', amount: 100000,
        payer: { kind: 'account', id: 'a-bills' },
        split: { kind: 'percent', weights: { [ME]: 60, [PARTNER]: 40 } } })],
    }, '2026-09');

    const pot = result.pots.find((p) => p.account.id === 'a-bills');
    expect(pot.out).toBe(100000);
    expect(pot.incoming[PARTNER]).toBe(40000);
    expect(pot.paidIn).toBe(160000);
    expect(pot.difference).toBe(60000);
  });

  it('adds up per charge, so you can hold it against your statement', () => {
    const result = forMonth({
      people, accounts,
      expenses: [
        expense({ id: '12', name: 'Inboedel', amount: 1200, charge: 'Verzekeringen',
          payer: { kind: 'account', id: 'a-bills' } }),
        expense({ id: '13', name: 'Opstal', amount: 3000, charge: 'Verzekeringen',
          payer: { kind: 'account', id: 'a-bills' } }),
        expense({ id: '14', name: 'Zorg', amount: 5000, charge: 'Zorgverzekeraar',
          payer: { kind: 'account', id: 'a-bills' } }),
        expense({ id: '15', name: 'Muziek', amount: 500, payer: { kind: 'account', id: 'a-bills' } }),
      ],
    }, '2026-09');

    expect(result.perCharge).toEqual({ Verzekeringen: 4200, Zorgverzekeraar: 5000 });
  });

  it('warns when fixed amounts do not add up, and leaves the rest with the payer', () => {
    const result = forMonth({
      people, accounts,
      expenses: [expense({ id: '16', name: 'Vakantiehuis', amount: 100000,
        payer: { kind: 'account', id: 'a-personal' },
        split: { kind: 'amount', weights: { [PARTNER]: 30000, [FRIEND]: 30000 } } })],
    }, '2026-09');

    expect(result.warnings).toHaveLength(1);
    expect(result.borne[ME]).toBe(40000);
    expect(flow(result, `person:${PARTNER}`, `person:${ME}`)).toBe(30000);
  });

  it('leaves out an expense without a valid account, but says so', () => {
    const result = forMonth({
      people, accounts,
      expenses: [expense({ id: '17', name: 'Zwevend', amount: 500, payer: { kind: 'account', id: 'gone' } })],
    }, '2026-09');
    expect(result.monthlyTotal).toBe(0);
    expect(result.warnings[0]).toContain('Zwevend');
  });
});

describe('settling through the bills account', () => {
  // The tricky case: the internet runs on the business, but the partner pays her
  // half into the bills account as usual. So she transfers one amount, and I put
  // in less myself.
  const expenses = [
    expense({ id: 'a', name: 'Energie', amount: 9000, payer: { kind: 'account', id: 'a-bills' },
      split: { kind: 'equal', participants: [ME, PARTNER] } }),
    expense({ id: 'b', name: 'Internet', amount: 5001, payer: { kind: 'account', id: 'a-business' },
      split: { kind: 'equal', participants: [ME, PARTNER] } }),
  ];

  it('has the partner transfer one amount instead of two', () => {
    const result = forMonth({ people, accounts: withHub, expenses }, '2026-09');
    const fromPartner = result.transfers.filter((t) => t.from === `person:${PARTNER}`);
    expect(fromPartner).toHaveLength(1);
    // 4500 (her half of the energy) + 2500 (her half of the internet, which the
    // business paid; 5001 does not divide evenly, so she gets the smaller half)
    // = 7000.
    expect(fromPartner[0]).toMatchObject({ to: 'account:a-bills', cents: 7000 });
  });

  it('deducts what I already fronted myself', () => {
    const result = forMonth({ people, accounts: withHub, expenses }, '2026-09');
    const withMe = result.transfers.filter((t) => t.from === `person:${ME}` || t.to === `person:${ME}`);
    expect(withMe).toHaveLength(1);
    // My share of the energy is 4500. The account owes me 2500, because that is
    // what the partner pays into it for something the business already covered.
    // 2000 left.
    expect(withMe[0]).toMatchObject({ from: `person:${ME}`, to: 'account:a-bills', cents: 2000 });
  });

  it('has all transfers cover exactly what the account pays', () => {
    const result = forMonth({ people, accounts: withHub, expenses }, '2026-09');
    const intoAccount = result.transfers
      .filter((t) => t.to === 'account:a-bills')
      .reduce((sum, t) => sum + t.cents, 0);
    // 7000 + 2000 = 9000, exactly what the account pays itself. What the business
    // fronted comes in and goes back out, and that cancels.
    expect(intoAccount).toBe(9000);
  });

  it('pays a friend out of the account too, because that is where you pay from', () => {
    // Marking an account as the settlement point means settlements run through
    // it — all of them, not only between the people who fill it. You pay this
    // friend from that account, so that is where the 7,00 leaves from, and it
    // comes off what you have to put in yourself.
    const result = forMonth({
      people, accounts: withHub,
      expenses: [expense({ id: 'c', name: 'Muziekdienst', amount: 1400,
        payer: { kind: 'person', id: FRIEND },
        split: { kind: 'equal', participants: [ME, FRIEND] } })],
    }, '2026-09');
    expect(result.transfers).toEqual([
      { from: `person:${ME}`, to: 'account:a-bills', cents: 700 },
      { from: 'account:a-bills', to: `person:${FRIEND}`, cents: 700 },
    ]);
  });

  it('does not touch what is already owed to the account itself', () => {
    // The friend is on something the account pays for. His 7,00 is going to the
    // right place already, so there is nothing to route.
    const result = forMonth({
      people, accounts: withHub,
      expenses: [expense({ id: 'c', name: 'Muziekdienst', amount: 1400,
        payer: { kind: 'account', id: 'a-bills' },
        split: { kind: 'equal', participants: [ME, FRIEND] } })],
    }, '2026-09');
    expect(result.transfers).toEqual([
      { from: `person:${ME}`, to: 'account:a-bills', cents: 700 },
      { from: `person:${FRIEND}`, to: 'account:a-bills', cents: 700 },
    ]);
  });

  it('lets a second shared account go its own way', () => {
    const result = forMonth({
      people, accounts: withHub,
      expenses: [expense({ id: 'd', name: 'Woonlasten', amount: 120000,
        payer: { kind: 'account', id: 'a-second' },
        split: { kind: 'equal', participants: [ME, PARTNER] } })],
    }, '2026-09');
    // Into the second account, not via the bills account.
    expect(result.transfers.every((t) => t.to === 'account:a-second')).toBe(true);
    expect(result.transfers).toHaveLength(2);
  });
});

describe('an account bearing a share of its own', () => {
  // Bank charges: four shares, one of which is a business cost. That share is not
  // a personal expense — it sits with the business, and the business pays it back.
  const bankCharges = expense({
    id: 'bank', name: 'Bankkosten', amount: 1799,
    payer: { kind: 'account', id: 'a-bills' },
    split: { kind: 'shares', weights: { [ME]: 2, [PARTNER]: 1, 'account:a-business': 1 } },
  });

  it('puts the business share with the business and not with me personally', () => {
    const result = forMonth({ people, accounts: withHub, expenses: [bankCharges] }, '2026-09');
    // 1799 over 2:1:1 becomes 899 / 450 / 450 — exactly 1799 together.
    expect(result.borne[ME]).toBe(899);
    expect(result.borne[PARTNER]).toBe(450);
    expect(result.borne['account:a-business']).toBe(450);
    expect(result.borne[ME] + result.borne[PARTNER] + result.borne['account:a-business'])
      .toBe(result.monthlyTotal);
  });

  it('has the business transfer it itself, outside the settlement between us', () => {
    const result = forMonth({ people, accounts: withHub, expenses: [bankCharges] }, '2026-09');
    expect(flow(result, 'account:a-business', 'account:a-bills')).toBe(450);
    // And it does not quietly run via me: the business is not a member of the
    // bills account, so nothing is routed along there.
    expect(flow(result, `person:${ME}`, 'account:a-bills')).toBe(899);
  });

  it('cancels out when the business paid for it itself', () => {
    const result = forMonth({
      people, accounts: withHub,
      expenses: [{ ...bankCharges, payer: { kind: 'account', id: 'a-business' } }],
    }, '2026-09');
    // The business pays and bears a quarter; those two cancel — there is nothing
    // to pay back to yourself.
    expect(result.transfers.some((t) => t.from === 'account:a-business')).toBe(false);
    // It is still a business cost, so it counts in what the business bears.
    expect(result.borne['account:a-business']).toBe(450);
    // The partner pays her share into the bills account; I fronted the rest
    // through the business, so that account pays me back.
    expect(flow(result, `person:${PARTNER}`, 'account:a-bills')).toBe(450);
    expect(flow(result, 'account:a-bills', `person:${ME}`)).toBe(450);
  });
});

describe('openSettlements', () => {
  it('keeps one-off expenses apart until they are settled', () => {
    const expenses = [
      expense({ id: '18', name: 'Bank', amount: 80000, cadence: 'once',
        payer: { kind: 'account', id: 'a-personal' },
        split: { kind: 'equal', participants: [ME, PARTNER] } }),
      expense({ id: '19', name: 'Concert', amount: 12000, cadence: 'once', settled: true,
        payer: { kind: 'account', id: 'a-personal' },
        split: { kind: 'equal', participants: [ME, PARTNER] } }),
    ];
    const result = openSettlements(expenses, withHub);
    expect(result.lines).toHaveLength(1);
    // Directly, not through the account: you do not settle a payment request
    // with your monthly transfer.
    expect(result.transfers).toEqual([
      { from: `person:${PARTNER}`, to: `person:${ME}`, cents: 40000 },
    ]);
  });
});

describe('net', () => {
  it('leaves an account alone when there is only one direction', () => {
    expect(net({ 'person:a': { 'account:x': 500 }, 'person:b': { 'account:x': 700 } })).toEqual([
      { from: 'person:b', to: 'account:x', cents: 700 },
      { from: 'person:a', to: 'account:x', cents: 500 },
    ]);
  });

  it('leaves nothing when two parties are square', () => {
    expect(net({ 'person:a': { 'person:b': 500 }, 'person:b': { 'person:a': 500 } })).toEqual([]);
  });

  it('flips the direction when the other owes more', () => {
    expect(net({ 'person:a': { 'person:b': 200 }, 'person:b': { 'person:a': 900 } })).toEqual([
      { from: 'person:b', to: 'person:a', cents: 700 },
    ]);
  });

  it('also cancels between a person and an account', () => {
    expect(net({ 'person:a': { 'account:x': 900 }, 'account:x': { 'person:a': 400 } })).toEqual([
      { from: 'person:a', to: 'account:x', cents: 500 },
    ]);
  });
});

describe('payerParty', () => {
  it('picks the account for a shared one and the owner for a personal one', () => {
    expect(payerParty({ payer: { kind: 'account', id: 'a-bills' } }, accounts)).toBe('account:a-bills');
    expect(payerParty({ payer: { kind: 'account', id: 'a-business' } }, accounts)).toBe(`person:${ME}`);
    expect(payerParty({ payer: { kind: 'person', id: FRIEND } }, accounts)).toBe(`person:${FRIEND}`);
    expect(payerParty({ payer: { kind: 'account', id: 'gone' } }, accounts)).toBe(null);
  });
});

describe('someone outside the household with something either way', () => {
  // Frans does not fill the bills account and has no fixed deposit. He is on
  // the shared YouTube and pays for a service you use in full: one out, one in.
  // Nothing is configured anywhere — having both is what makes them cancel.
  const me = 'me', mau = 'mau', frans = 'frans';
  const bills = 'bills';
  const people = [
    { id: me, name: 'Ik', isMe: true }, { id: mau, name: 'Mau' }, { id: frans, name: 'Frans' },
  ];
  const equal = (...ids) => ({ kind: 'equal', participants: ids, weights: {} });
  const base = { cadence: 'month', category: 'media', charge: '', note: '', paused: false };
  const expenses = [
    { ...base, id: 'yt', name: 'YouTube', amount: 2400,
      payer: { kind: 'account', id: bills }, split: equal(me, mau, frans) },
    { ...base, id: 'td', name: 'Tidal', amount: 1200,
      payer: { kind: 'person', id: frans }, split: equal(me) },
  ];
  const account = (extra) => [
    { id: bills, name: 'Vaste lasten', kind: 'shared', members: [me, mau], settlement: true, ...extra },
  ];
  const find = (r, from, to) =>
    r.transfers.find((t) => t.from === from && t.to === to)?.cents ?? 0;

  it('leaves alone anyone who only owes', () => {
    // Rou is on the same subscription and nothing more. His 6,00 goes straight
    // to the account that pays it; there is nothing to net it against.
    const rou = 'rou';
    const r = forMonth(
      {
        people: [...people, { id: rou, name: 'Rou' }],
        accounts: account({}),
        expenses: [
          { ...expenses[0], split: equal(me, mau, frans, rou) },
          expenses[1],
        ],
      },
      '2026-09'
    );
    expect(find(r, `person:${rou}`, `account:${bills}`)).toBe(600);
    expect(r.transfers.filter((t) => t.from === `person:${rou}`).length).toBe(1);
  });

  it('nets one against the other, without being told to', () => {
    const r = forMonth({ people, accounts: account({}), expenses }, '2026-09');
    // 12,00 owed to him minus his 8,00 share: 4,00 out of the account.
    expect(find(r, `account:${bills}`, `person:${frans}`)).toBe(400);
    expect(find(r, `person:${frans}`, `account:${bills}`)).toBe(0);
    expect(find(r, `person:${me}`, `person:${frans}`)).toBe(0);
    // And it is paid for: my own share plus what I owe him goes in.
    expect(find(r, `person:${me}`, `account:${bills}`)).toBe(800 + 1200);
  });

  it('keeps the account balanced to the cent', () => {
    const r = forMonth({ people, accounts: account({}), expenses }, '2026-09');
    const into = r.transfers
      .filter((t) => t.to === `account:${bills}`).reduce((s, t) => s + t.cents, 0);
    const outOf = r.transfers
      .filter((t) => t.from === `account:${bills}`).reduce((s, t) => s + t.cents, 0);
    // In equals what the account pays out plus what it passes on.
    expect(into).toBe(2400 + outOf);
  });

  it('does not turn him into someone who fills the account', () => {
    const r = forMonth({ people, accounts: account({}), expenses }, '2026-09');
    const pot = r.pots.find((p) => p.account.id === bills);
    expect(pot.contributions[frans]).toBeUndefined();
    // He still bears his share of YouTube, like anyone else on it.
    expect(r.borne[frans]).toBe(800);
  });
});

describe('explaining a transfer', () => {
  const me = 'me', mau = 'mau', frans = 'frans', bills = 'bills';
  const people = [
    { id: me, name: 'Ik', isMe: true }, { id: mau, name: 'Mau' }, { id: frans, name: 'Frans' },
  ];
  const accounts = [
    { id: bills, name: 'BUNQ', kind: 'shared', members: [me, mau], settlement: true },
  ];
  const equal = (...ids) => ({ kind: 'equal', participants: ids, weights: {} });
  const base = { cadence: 'month', category: 'media', charge: '', note: '', paused: false };
  const expenses = [
    { ...base, id: 'yt', name: 'YouTube', amount: 1497,
      payer: { kind: 'account', id: bills }, split: equal(me, mau, frans) },
    { ...base, id: 'td', name: 'Tidal', amount: 849,
      payer: { kind: 'person', id: frans }, split: equal(me) },
  ];
  const result = forMonth({ people, accounts, expenses }, '2026-09');
  const context = { lines: result.lines, accounts };

  it('adds up to the amount being transferred, every time', () => {
    for (const transfer of result.transfers) {
      const rows = explainTransfer(transfer, context);
      const sum = rows.reduce((s, r) => s + r.cents, 0);
      expect(sum).toBe(transfer.cents);
    }
  });

  it('names both sides of what was netted away', () => {
    const out = result.transfers.find((t) => t.from === `account:${bills}`);
    const rows = explainTransfer(out, context);
    const by = Object.fromEntries(rows.map((r) => [r.expense.name, r.cents]));

    // He bears 4,99 of YouTube and fronted 8,49 of Tidal: 3,50 his way.
    expect(by.YouTube).toBe(-499);
    expect(by.Tidal).toBe(849);
    expect(out.cents).toBe(350);
  });

  it('leaves nothing out of my own position either', () => {
    const mine = result.transfers.find((t) => t.from === `person:${me}`);
    const rows = explainTransfer(mine, context);
    // My YouTube share plus the Tidal I use: 13,48 into the account.
    expect(rows.reduce((s, r) => s + r.cents, 0)).toBe(499 + 849);
  });
});

describe('fixed amounts that do not add up to the expense', () => {
  // Five bearers at a round 4,99 for something that costs 29,99: 24,95
  // covered, 5,04 left over. That has to land on someone, or the shares add up
  // to less than the bill and the overview quietly lies.
  const me = 'me', mau = 'mau';
  const friends = ['a', 'b', 'c'];
  const bills = 'bills';
  const people = [
    { id: me, name: 'Ik', isMe: true },
    { id: mau, name: 'Mau' },
    ...friends.map((id, i) => ({ id, name: `V${i + 1}` })),
  ];
  const weights = Object.fromEntries([...friends, me, mau].map((id) => [id, 499]));
  const expense = (payer) => ({
    id: 'yt', name: 'YouTube', amount: 2999, cadence: 'month', category: 'media',
    charge: '', note: '', paused: false,
    payer, split: { kind: 'amount', participants: [], weights },
  });
  const borneTotal = (r) => Object.values(r.borne).reduce((sum, c) => sum + c, 0);

  it('puts the difference on the payer when a person pays', () => {
    const r = forMonth(
      { people, accounts: [], expenses: [expense({ kind: 'person', id: me })] },
      '2026-09'
    );
    expect(r.borne[me]).toBe(499 + 504);
    expect(borneTotal(r)).toBe(r.monthlyTotal);
  });

  it('leaves it undivided when an account pays, instead of charging its members', () => {
    // An account holds money, it does not bear costs — expenses divide, and
    // accounts follow from that. So nobody is charged for filling the account:
    // the part the expense does not divide stays visibly undivided.
    const accounts = [
      { id: bills, name: 'BUNQ', kind: 'shared', members: [me, mau], settlement: true },
    ];
    const withoutMau = Object.fromEntries(friends.map((id) => [id, 499]));
    const r = forMonth(
      {
        people,
        accounts,
        expenses: [
          {
            ...expense({ kind: 'account', id: bills }),
            split: { kind: 'amount', participants: [], weights: withoutMau },
          },
        ],
      },
      '2026-09'
    );

    // Mau is not on this expense, so she carries none of it.
    expect(r.borne[mau] || 0).toBe(0);
    expect(r.borne[me] || 0).toBe(0);
    for (const id of friends) expect(r.borne[id]).toBe(499);

    // And not a cent goes missing: what is borne plus what is undivided is the
    // whole expense.
    expect(r.unassigned).toBe(2999 - 3 * 499);
    expect(borneTotal(r) + r.unassigned).toBe(r.monthlyTotal);
  });

  it('still lets a person who pays carry the difference', () => {
    const r = forMonth(
      { people, accounts: [], expenses: [expense({ kind: 'person', id: mau })] },
      '2026-09'
    );
    // The payer is part of the expense, so this still follows from it.
    expect(r.borne[mau]).toBe(499 + 504);
    expect(r.unassigned).toBe(0);
    expect(borneTotal(r)).toBe(r.monthlyTotal);
  });

  it('says how much is left and that it lies with nobody', () => {
    const accounts = [{ id: bills, name: 'BUNQ', kind: 'shared', members: [me], settlement: true }];
    const r = forMonth(
      { people, accounts, expenses: [expense({ kind: 'account', id: bills })] },
      '2026-09'
    );
    expect(r.warnings.join(' ')).toMatch(/5,04/);
    expect(r.warnings.join(' ')).toMatch(/nog bij niemand/);
  });
});

describe('what counts as business', () => {
  const me = 'me';
  const people = [{ id: me, name: 'Ik', isMe: true }];
  const accounts = [
    { id: 'a-bills', name: 'BUNQ', kind: 'shared', members: [me], settlement: true },
    { id: 'a-biz', name: 'Brokkr', kind: 'business', ownerId: me },
  ];
  const one = (payer) => ({
    id: 'x', name: 'Internet', amount: 6739, cadence: 'month', category: 'telecom',
    charge: '', note: '', paused: false,
    payer, split: { kind: 'equal', participants: [me], weights: {} },
  });

  it('follows the account it comes off, and nothing else', () => {
    expect(isBusiness(one({ kind: 'account', id: 'a-biz' }), accounts)).toBe(true);
    expect(isBusiness(one({ kind: 'account', id: 'a-bills' }), accounts)).toBe(false);
    expect(isBusiness(one({ kind: 'person', id: me }), accounts)).toBe(false);
  });

  it('cannot be claimed by a stored flag that says otherwise', () => {
    // Old data may still carry one. It decides nothing.
    const lying = { ...one({ kind: 'account', id: 'a-bills' }), business: true };
    expect(isBusiness(lying, accounts)).toBe(false);
  });

  it('adds up to what the business account paid', () => {
    const result = forMonth({
      people, accounts,
      expenses: [one({ kind: 'account', id: 'a-biz' }), {
        ...one({ kind: 'account', id: 'a-bills' }), id: 'y', name: 'Gas', amount: 11700,
      }],
    }, '2026-09');
    expect(result.perAccount['a-biz']).toBe(6739);
  });
});

describe('explaining a transfer when there are two shared accounts', () => {
  // The moment a second pot exists, a person pays into both. An explanation
  // that hands back their whole position then claims all of it twice.
  const me = 'me', partner = 'partner';
  const people = [{ id: me, name: 'Ik', isMe: true }, { id: partner, name: 'Mau' }];
  const accounts = [
    { id: 'bills', name: 'BUNQ', kind: 'shared', members: [me, partner], settlement: true },
    { id: 'mortgage', name: 'Rabo', kind: 'shared', members: [me, partner] },
    { id: 'biz', name: 'Brokkr', kind: 'business', ownerId: me },
  ];
  const both = { kind: 'equal', participants: [me, partner], weights: {} };
  const base = { cadence: 'month', category: 'Overig', charge: '', note: '', paused: false };
  const result = forMonth({
    people, accounts,
    expenses: [
      { ...base, id: 'gas', name: 'Gas', amount: 11700, payer: { kind: 'account', id: 'bills' }, split: both },
      { ...base, id: 'hyp', name: 'Hypotheek', amount: 120000, payer: { kind: 'account', id: 'mortgage' }, split: both },
      { ...base, id: 'tv', name: 'TV', amount: 6739, payer: { kind: 'account', id: 'biz' }, split: both },
    ],
  }, '2026-09');
  const context = { lines: result.lines, accounts };

  it('still adds up to the amount, for every transfer', () => {
    for (const transfer of result.transfers) {
      const sum = explainTransfer(transfer, context).reduce((s, r) => s + r.cents, 0);
      expect(sum).toBe(transfer.cents);
    }
  });

  it('gives each account only what it is owed', () => {
    const named = (from, to) => {
      const t = result.transfers.find((x) => x.from === from && x.to === to);
      return explainTransfer(t, context).map((r) => r.expense.name).sort();
    };
    // The mortgage account knows about the mortgage and nothing else.
    expect(named(`person:${me}`, 'account:mortgage')).toEqual(['Hypotheek']);
    // The bills account carries what it pays, plus what the business fronted:
    // that debt is between two people, and those route through it.
    expect(named(`person:${me}`, 'account:bills')).toEqual(['Gas', 'TV']);
  });
});
