// @vitest-environment node
//
// WebCrypto runs in Node here, not in jsdom: jsdom does not reliably provide
// crypto.subtle, and this is precisely about the real implementation.

import { describe, it, expect } from 'vitest';
import {
  newHouseholdKey,
  keyToRaw,
  keyFromRaw,
  wrapWithPassphrase,
  unwrapWithPassphrase,
  encrypt,
  decrypt,
  newKeyPair,
  publicToJwk,
  privateToRaw,
  privateFromRaw,
  wrapFor,
  unwrapForMe,
  toB64,
  fromB64,
} from '../src/lib/crypto.js';

describe('conversion', () => {
  it('reads back what it writes', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 42]);
    expect([...fromB64(toB64(bytes))]).toEqual([...bytes]);
  });
});

describe('encrypting a record', () => {
  it('gives back something nothing can be read from', async () => {
    const key = await newHouseholdKey();
    const record = { name: 'Energie', amount: 9000, note: 'maandelijks' };
    const blob = await encrypt(key, record);

    const asText = JSON.stringify(blob);
    expect(asText).not.toContain('Energie');
    expect(asText).not.toContain('9000');
    expect(asText).not.toContain('maandelijks');
    expect(await decrypt(key, blob)).toEqual(record);
  });

  it('gives a different blob twice for the same content', async () => {
    const key = await newHouseholdKey();
    const one = await encrypt(key, { name: 'Energie' });
    const two = await encrypt(key, { name: 'Energie' });
    // Otherwise the database shows which rows are identical without being able
    // to read them. That leaks more than you would think.
    expect(one.ct).not.toBe(two.ct);
  });

  it('will not open with another key', async () => {
    const mine = await newHouseholdKey();
    const theirs = await newHouseholdKey();
    const blob = await encrypt(mine, { name: 'Energie' });
    await expect(decrypt(theirs, blob)).rejects.toThrow();
  });

  it('notices when the blob has been tampered with', async () => {
    const key = await newHouseholdKey();
    const blob = await encrypt(key, { amount: 9000 });
    const bytes = fromB64(blob.ct);
    bytes[0] ^= 1;
    await expect(decrypt(key, { ...blob, ct: toB64(bytes) })).rejects.toThrow();
  });
});

describe('wrapping with a passphrase', () => {
  it('gives the key back for the right passphrase', async () => {
    const key = await newHouseholdKey();
    const raw = await keyToRaw(key);
    const pkg = await wrapWithPassphrase(raw, 'zes wilde ganzen boven de dijk');

    const back = await unwrapWithPassphrase(pkg, 'zes wilde ganzen boven de dijk');
    expect([...back]).toEqual([...raw]);

    // And the package itself gives nothing away.
    expect(JSON.stringify(pkg)).not.toContain(toB64(raw));
  }, 30000);

  it('says plainly that the passphrase is wrong', async () => {
    const raw = await keyToRaw(await newHouseholdKey());
    const pkg = await wrapWithPassphrase(raw, 'de juiste zin');
    await expect(unwrapWithPassphrase(pkg, 'de verkeerde zin'))
      .rejects.toThrow(/wachtwoordzin klopt niet/i);
  }, 30000);

  it('uses a different salt every time', async () => {
    const raw = await keyToRaw(await newHouseholdKey());
    const one = await wrapWithPassphrase(raw, 'zelfde zin');
    const two = await wrapWithPassphrase(raw, 'zelfde zin');
    expect(one.salt).not.toBe(two.salt);
    expect(one.ct).not.toBe(two.ct);
  }, 30000);
});

describe('giving someone else access', () => {
  it('lets only the intended person open the key', async () => {
    // Her: makes a key pair and puts the public half out there.
    const hers = await newKeyPair();
    const herPublic = await publicToJwk(hers.publicKey);

    // Me: wrap the household key for her.
    const householdKey = await newHouseholdKey();
    const pkg = await wrapFor(herPublic, householdKey);

    // Her: opens it with her private half.
    const back = await unwrapForMe(pkg, hers.privateKey);
    expect([...(await keyToRaw(back))]).toEqual([...(await keyToRaw(householdKey))]);

    // Someone else with their own key pair does not get in.
    const stranger = await newKeyPair();
    await expect(unwrapForMe(pkg, stranger.privateKey)).rejects.toThrow();
  }, 30000);

  it('can store her private key without giving it away', async () => {
    const hers = await newKeyPair();
    const raw = await privateToRaw(hers.privateKey);
    const pkg = await wrapWithPassphrase(raw, 'haar eigen zin');

    const back = await privateFromRaw(await unwrapWithPassphrase(pkg, 'haar eigen zin'));
    // What comes out really works: it opens what was wrapped for her.
    const householdKey = await newHouseholdKey();
    const forHer = await wrapFor(await publicToJwk(hers.publicKey), householdKey);
    const opened = await unwrapForMe(forHer, back);
    expect([...(await keyToRaw(opened))]).toEqual([...(await keyToRaw(householdKey))]);
  }, 30000);
});

describe('the key itself', () => {
  it('survives a round of export and import', async () => {
    const key = await newHouseholdKey();
    const raw = await keyToRaw(key);
    const back = await keyFromRaw(raw);
    const blob = await encrypt(key, { amount: 1234 });
    expect(await decrypt(back, blob)).toEqual({ amount: 1234 });
  });
});
