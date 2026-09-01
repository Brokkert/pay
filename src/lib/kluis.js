// De kluis: versleuteling met een sleutel die de server nooit ziet.
//
// ----------------------------------------------------------------------------
// Het model
// ----------------------------------------------------------------------------
// Eén huishouden heeft één symmetrische sleutel (AES-GCM 256). Alles wat een
// bedrag, een naam of een notitie is, gaat daarmee door de wasstraat voordat het
// de browser verlaat. Wat er in de database staat is een blob; Supabase, en
// iedereen die daar ooit bij komt, ziet ruis.
//
// Die sleutel zelf staat nergens leesbaar. Hij wordt "ingepakt" met een sleutel
// die uit je wachtwoordzin komt (PBKDF2-SHA256), en alleen dat pakketje wordt
// bewaard. Zonder de zin is het pakketje onbruikbaar — ook voor ons.
//
// ----------------------------------------------------------------------------
// Hoe een tweede persoon erbij komt
// ----------------------------------------------------------------------------
// De voor de hand liggende oplossing is de sleutel in de uitnodigingslink
// zetten. Dat doen we bewust niet: dan is die link de sleutel, en die stuur je
// door WhatsApp. In plaats daarvan gaat het in twee stappen.
//
//   1. De uitgenodigde logt in en kiest haar eigen wachtwoordzin. Haar browser
//      maakt een sleutelpaar (RSA-OAEP). De publieke helft gaat naar de
//      database; de private helft wordt met haar zin ingepakt en gaat er ook
//      heen — versleuteld, dus onleesbaar voor de server.
//   2. Jij ziet in de app dat er iemand wacht. Eén klik: jouw browser pakt de
//      huishoudsleutel met haar publieke sleutel in en zet dat pakketje klaar.
//      Alleen zij kan het openen.
//
// Daarna pakt zij de huishoudsleutel opnieuw in, met haar eigen wachtwoordzin,
// en is de omweg via het sleutelpaar niet meer nodig.
//
// Het kost één klik van jou, maar niemand hoeft ooit een sleutel door te sturen.

const ITERATIES = 310000; // OWASP-richtlijn voor PBKDF2-SHA256
const enc = new TextEncoder();
const dec = new TextDecoder();

const subtle = () => {
  const c = globalThis.crypto?.subtle;
  if (!c) throw new Error('Deze browser kan niet versleutelen (WebCrypto ontbreekt).');
  return c;
};

// --- omzetten ---------------------------------------------------------------

export const naarB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

export const uitB64 = (tekst) => {
  const s = atob(tekst);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i);
  return bytes;
};

const willekeurig = (n) => crypto.getRandomValues(new Uint8Array(n));

// --- de huishoudsleutel -----------------------------------------------------

export async function nieuweHuissleutel() {
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function sleutelNaarRuw(sleutel) {
  return new Uint8Array(await subtle().exportKey('raw', sleutel));
}

export async function sleutelUitRuw(ruw) {
  return subtle().importKey('raw', ruw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

// --- inpakken met een wachtwoordzin -----------------------------------------

async function zinSleutel(zin, salt, iteraties) {
  const basis = await subtle().importKey('raw', enc.encode(zin), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations: iteraties, hash: 'SHA-256' },
    basis,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Pakt willekeurige bytes in met een wachtwoordzin. */
export async function pakInMetZin(ruw, zin) {
  const salt = willekeurig(16);
  const iv = willekeurig(12);
  const sleutel = await zinSleutel(zin, salt, ITERATIES);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, sleutel, ruw);
  return {
    v: 1,
    salt: naarB64(salt),
    iv: naarB64(iv),
    ct: naarB64(ct),
    iteraties: ITERATIES,
  };
}

export async function pakUitMetZin(pakket, zin) {
  const sleutel = await zinSleutel(zin, uitB64(pakket.salt), pakket.iteraties || ITERATIES);
  try {
    const ruw = await subtle().decrypt(
      { name: 'AES-GCM', iv: uitB64(pakket.iv) },
      sleutel,
      uitB64(pakket.ct)
    );
    return new Uint8Array(ruw);
  } catch {
    // AES-GCM faalt met dezelfde fout of de zin nou fout is of de blob stuk;
    // hier is die eerste vrijwel altijd het geval, en dat is wat je wilt lezen.
    throw new Error('Die wachtwoordzin klopt niet.');
  }
}

// --- versleutelen van gegevens ----------------------------------------------

/** Eén rij versleutelen. Wat eruit komt is wat de database te zien krijgt. */
export async function versleutel(sleutel, waarde) {
  const iv = willekeurig(12);
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv },
    sleutel,
    enc.encode(JSON.stringify(waarde))
  );
  return { v: 1, iv: naarB64(iv), ct: naarB64(ct) };
}

export async function ontsleutel(sleutel, blob) {
  if (!blob?.ct) return null;
  const ruw = await subtle().decrypt(
    { name: 'AES-GCM', iv: uitB64(blob.iv) },
    sleutel,
    uitB64(blob.ct)
  );
  return JSON.parse(dec.decode(ruw));
}

// --- het sleutelpaar voor een nieuw lid -------------------------------------

export async function nieuwSleutelpaar() {
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

export const publiekNaarJwk = (sleutel) => subtle().exportKey('jwk', sleutel);

export const publiekUitJwk = (jwk) =>
  subtle().importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);

export async function priveNaarRuw(sleutel) {
  return new Uint8Array(await subtle().exportKey('pkcs8', sleutel));
}

export const priveUitRuw = (ruw) =>
  subtle().importKey('pkcs8', ruw, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt']);

/** De huishoudsleutel inpakken voor iemand anders, met diens publieke sleutel. */
export async function pakInVoor(publiekJwk, huissleutel) {
  const publiek = await publiekUitJwk(publiekJwk);
  const ruw = await sleutelNaarRuw(huissleutel);
  const ct = await subtle().encrypt({ name: 'RSA-OAEP' }, publiek, ruw);
  return { v: 1, ct: naarB64(ct) };
}

/** En weer uitpakken, met je eigen private sleutel. */
export async function pakUitVoorMij(pakket, priveSleutel) {
  const ruw = await subtle().decrypt({ name: 'RSA-OAEP' }, priveSleutel, uitB64(pakket.ct));
  return sleutelUitRuw(new Uint8Array(ruw));
}
