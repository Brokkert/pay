// A household to start from.
//
// An empty screen does not show what Pay is for. This example does, and it
// covers exactly the four cases that turn into a mess in a spreadsheet:
//
//   1. ordinary shared expenses out of the household bills account;
//   2. something the business pays for but you both use;
//   3. a subscription you share with friends and get money back for;
//   4. a share that is a business cost and is borne by the business.
//
// Every name and amount below is made up: round numbers that mean nothing, on
// purpose. This file lives in a public repo, so nothing in it should resemble
// anyone's actual bills.

import { newId } from '../lib/store.js';

export function exampleHousehold() {
  const me = newId();
  const partner = newId();
  const friend = newId();
  const neighbour = newId();

  const bills = newId();
  const personal = newId();
  const business = newId();

  const people = [
    { id: me, name: 'Ik', colour: '#0d6e5c', isMe: true },
    { id: partner, name: 'Partner', colour: '#9a4f2c' },
    { id: friend, name: 'Vriend', colour: '#2f5fa8' },
    { id: neighbour, name: 'Buur', colour: '#7a4a8f' },
  ];

  const accounts = [
    {
      id: bills,
      name: 'Vaste lasten',
      kind: 'shared',
      members: [me, partner],
      contributions: { [me]: 15000, [partner]: 15000 },
      // Everything is settled here: including what the business or a personal
      // account fronted. That way each person transfers a single amount.
      settlement: true,
    },
    { id: personal, name: 'Privé', kind: 'personal', ownerId: me },
    { id: business, name: 'Zaak', kind: 'business', ownerId: me },
  ];

  const together = { kind: 'equal', participants: [me, partner], weights: {} };

  const expenses = [
    { name: 'Energie', amount: 9000, category: 'Energie & water',
      payer: { kind: 'account', id: bills }, split: together },
    { name: 'Water', amount: 1500, category: 'Energie & water',
      payer: { kind: 'account', id: bills }, split: together },

    // Two expenses on a single charge from the same insurer.
    { name: 'Inboedel', amount: 1200, category: 'Verzekeringen', charge: 'Verzekeringen',
      payer: { kind: 'account', id: bills }, split: together },
    { name: 'Aansprakelijkheid', amount: 800, category: 'Verzekeringen', charge: 'Verzekeringen',
      payer: { kind: 'account', id: bills }, split: together },

    { name: 'Gemeentelijke heffingen', amount: 9000, cadence: 'quarter', category: 'Belastingen & heffingen',
      payer: { kind: 'account', id: bills }, split: together },

    // Runs on the business, but we both use it at home. The partner pays her
    // half into the bills account as usual, and that account pays it back to me
    // — which is why I have to put in less myself.
    { name: 'Internet', amount: 5000, category: 'Internet & telefoon',
      note: 'Loopt op de zaak; thuis gebruiken we het allebei.',
      payer: { kind: 'account', id: business }, split: together },

    // A shared subscription with friends on it. Add as many people as take part;
    // what they owe you falls out by itself.
    { name: 'Streamingdienst', amount: 2000, category: 'Streaming & media',
      payer: { kind: 'account', id: personal },
      split: { kind: 'equal', participants: [me, partner, friend, neighbour], weights: {} } },

    // The other way round: the friend pays, I take part. Pay cancels this
    // against the subscription above.
    { name: 'Muziekdienst', amount: 1200, category: 'Streaming & media',
      note: 'Van de vriend; ik betaal mijn helft.',
      payer: { kind: 'person', id: friend },
      split: { kind: 'equal', participants: [me, friend], weights: {} } },

    // Four shares of bank charges, one of which is a business cost. The business
    // bears that quarter, not you personally — and simply transfers it.
    { name: 'Bankkosten', amount: 1600, category: 'Overig',
      payer: { kind: 'account', id: bills },
      split: { kind: 'shares', participants: [], weights: { [me]: 2, [partner]: 1, [`account:${business}`]: 1 } } },

    { name: 'Sportclub', amount: 2500, category: 'Gezondheid & sport',
      payer: { kind: 'account', id: personal },
      split: { kind: 'equal', participants: [me], weights: {} } },
  ];

  return {
    people,
    accounts,
    expenses: expenses.map((e) => ({
      id: newId(),
      cadence: 'month',
      charge: '',
      paused: false,
      note: '',
      ...e,
    })),
  };
}
