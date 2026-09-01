// Encryption with a key the server never sees.
//
// ----------------------------------------------------------------------------
// The model
// ----------------------------------------------------------------------------
// One household has one symmetric key (AES-GCM 256). Everything that is an
// amount, a name or a note goes through it before it leaves the browser. What
// ends up in the database is a blob; Supabase, and anyone who ever gets in
// there, sees noise.
//
// The key itself is stored nowhere in the clear. It is wrapped with a key
// derived from your passphrase (PBKDF2-SHA256), and only that package is kept.
// Without the passphrase the package is useless — to us as well.
//
// ----------------------------------------------------------------------------
// How a second person gets in
// ----------------------------------------------------------------------------
// The obvious solution is to put the key in the invite link. We deliberately do
// not: then the link *is* the key, and you send it over WhatsApp. Instead it
// takes two steps.
//
//   1. The invitee logs in and picks her own passphrase. Her browser generates a
//      key pair (RSA-OAEP). The public half goes to the database; the private
//      half is wrapped with her passphrase and goes there too — encrypted, so
//      unreadable to the server.
//   2. You see in the app that someone is waiting. One click: your browser wraps
//      the household key with her public key. Only she can open it.
//
// After that she rewraps the household key with her own passphrase, and the
// detour through the key pair is no longer needed.
//
// It costs you one click, but nobody ever has to send a key.

const ITERATIONS = 310000; // OWASP guidance for PBKDF2-SHA256
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const subtle = () => {
  const c = globalThis.crypto?.subtle;
  if (!c) throw new Error('Deze browser kan niet versleutelen (WebCrypto ontbreekt).');
  return c;
};

// --- conversion -------------------------------------------------------------

export const toB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

export const fromB64 = (text) => {
  const s = atob(text);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i);
  return bytes;
};

const random = (n) => crypto.getRandomValues(new Uint8Array(n));

// --- the household key ------------------------------------------------------

export async function newHouseholdKey() {
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function keyToRaw(key) {
  return new Uint8Array(await subtle().exportKey('raw', key));
}

export async function keyFromRaw(raw) {
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

// --- wrapping with a passphrase ---------------------------------------------

async function passphraseKey(passphrase, salt, iterations) {
  const base = await subtle().importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Wraps arbitrary bytes with a passphrase. */
export async function wrapWithPassphrase(raw, passphrase) {
  const salt = random(16);
  const iv = random(12);
  const key = await passphraseKey(passphrase, salt, ITERATIONS);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, raw);
  return { v: 1, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct), iterations: ITERATIONS };
}

export async function unwrapWithPassphrase(pkg, passphrase) {
  const key = await passphraseKey(passphrase, fromB64(pkg.salt), pkg.iterations || ITERATIONS);
  try {
    const raw = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromB64(pkg.iv) },
      key,
      fromB64(pkg.ct)
    );
    return new Uint8Array(raw);
  } catch {
    // AES-GCM fails the same way whether the passphrase is wrong or the blob is
    // damaged; here it is almost always the first, and that is what you want to
    // read on screen.
    throw new Error('Die wachtwoordzin klopt niet.');
  }
}

// --- encrypting records -----------------------------------------------------

/** Encrypts one record. What comes out is what the database gets to see. */
export async function encrypt(key, value) {
  const iv = random(12);
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(value))
  );
  return { v: 1, iv: toB64(iv), ct: toB64(ct) };
}

export async function decrypt(key, blob) {
  if (!blob?.ct) return null;
  const raw = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.ct));
  return JSON.parse(decoder.decode(raw));
}

// --- the key pair for a new member ------------------------------------------

export async function newKeyPair() {
  return subtle().generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );
}

export const publicToJwk = (key) => subtle().exportKey('jwk', key);

export const publicFromJwk = (jwk) =>
  subtle().importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);

export async function privateToRaw(key) {
  return new Uint8Array(await subtle().exportKey('pkcs8', key));
}

export const privateFromRaw = (raw) =>
  subtle().importKey('pkcs8', raw, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt']);

/** Wraps the household key for someone else, using their public key. */
export async function wrapFor(publicJwk, householdKey) {
  const pub = await publicFromJwk(publicJwk);
  const raw = await keyToRaw(householdKey);
  const ct = await subtle().encrypt({ name: 'RSA-OAEP' }, pub, raw);
  return { v: 1, ct: toB64(ct) };
}

/** And unwrapping it again, with your own private key. */
export async function unwrapForMe(pkg, privateKey) {
  const raw = await subtle().decrypt({ name: 'RSA-OAEP' }, privateKey, fromB64(pkg.ct));
  return keyFromRaw(new Uint8Array(raw));
}
