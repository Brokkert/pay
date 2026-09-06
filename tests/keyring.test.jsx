// The keyring, on the one thing that has no second chance: letting a housemate
// in. Everything here runs against a stubbed Supabase, because what is being
// tested is which questions get asked and when — not the database.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { newHouseholdKey, keyToRaw, toB64 } from '../src/lib/crypto.js';

const rows = { secrets: null, members: [], keys: [] };

vi.mock('../src/lib/supabase.js', () => ({
  getClient: () => ({
    from: (table) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: rows.secrets, error: null }) }),
        then: (resolve) =>
          resolve({ data: table === 'pay_members' ? rows.members : rows.keys, error: null }),
      }),
    }),
  }),
  resetClient: () => {},
}));

const { useKeyring } = await import('../src/lib/keyring.js');

beforeEach(() => {
  localStorage.clear();
  rows.secrets = null;
  rows.members = [];
  rows.keys = [];
});
afterEach(cleanup);

const me = { id: 'me' };

describe('someone waiting at the door', () => {
  it('is seen by the one person who can open it: whoever is already in', async () => {
    // My vault is open on this device.
    localStorage.setItem('pay:key:open', JSON.stringify(toB64(await keyToRaw(await newHouseholdKey()))));
    rows.members = [{ user_id: 'me' }, { user_id: 'her' }];
    rows.keys = [{ user_id: 'her', public_key: { kty: 'RSA' }, for_me: null }];

    const { result } = renderHook(() => useKeyring(me));

    await waitFor(() => expect(result.current.state).toBe('open'));
    // The list used to stay empty here, because an open vault stopped looking.
    await waitFor(() => expect(result.current.waiting).toHaveLength(1));
    expect(result.current.waiting[0].user_id).toBe('her');
  });

  it('leaves out someone whose key is already put out for them', async () => {
    localStorage.setItem('pay:key:open', JSON.stringify(toB64(await keyToRaw(await newHouseholdKey()))));
    rows.keys = [{ user_id: 'her', public_key: { kty: 'RSA' }, for_me: { ct: '…' } }];

    const { result } = renderHook(() => useKeyring(me));
    await waitFor(() => expect(result.current.state).toBe('open'));
    expect(result.current.waiting).toHaveLength(0);
  });
});
