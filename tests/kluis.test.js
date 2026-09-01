// @vitest-environment node
//
// WebCrypto draait hier in Node, niet in jsdom: jsdom levert crypto.subtle niet
// betrouwbaar mee, en het gaat hier juist om de echte implementatie.

import { describe, it, expect } from 'vitest';
import {
  nieuweHuissleutel,
  sleutelNaarRuw,
  sleutelUitRuw,
  pakInMetZin,
  pakUitMetZin,
  versleutel,
  ontsleutel,
  nieuwSleutelpaar,
  publiekNaarJwk,
  priveNaarRuw,
  priveUitRuw,
  pakInVoor,
  pakUitVoorMij,
  naarB64,
  uitB64,
} from '../src/lib/kluis.js';

describe('omzetten', () => {
  it('leest terug wat het schrijft', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 42]);
    expect([...uitB64(naarB64(bytes))]).toEqual([...bytes]);
  });
});

describe('versleutelen van een rij', () => {
  it('geeft iets terug waar niets uit af te lezen valt', async () => {
    const sleutel = await nieuweHuissleutel();
    const post = { naam: 'Energie', bedrag: 9000, notitie: 'maandelijks' };
    const blob = await versleutel(sleutel, post);

    const alsTekst = JSON.stringify(blob);
    expect(alsTekst).not.toContain('Energie');
    expect(alsTekst).not.toContain('9000');
    expect(alsTekst).not.toContain('maandelijks');
    expect(await ontsleutel(sleutel, blob)).toEqual(post);
  });

  it('geeft twee keer een andere blob voor dezelfde inhoud', async () => {
    const sleutel = await nieuweHuissleutel();
    const een = await versleutel(sleutel, { naam: 'Energie' });
    const twee = await versleutel(sleutel, { naam: 'Energie' });
    // Anders zie je aan de database welke rijen hetzelfde zijn, zonder ze te
    // kunnen lezen. Dat lekt meer dan je denkt.
    expect(een.ct).not.toBe(twee.ct);
  });

  it('laat zich niet met een andere sleutel openen', async () => {
    const mijne = await nieuweHuissleutel();
    const andermans = await nieuweHuissleutel();
    const blob = await versleutel(mijne, { naam: 'Energie' });
    await expect(ontsleutel(andermans, blob)).rejects.toThrow();
  });

  it('merkt het als er aan de blob gerommeld is', async () => {
    const sleutel = await nieuweHuissleutel();
    const blob = await versleutel(sleutel, { bedrag: 9000 });
    const bytes = uitB64(blob.ct);
    bytes[0] ^= 1;
    await expect(ontsleutel(sleutel, { ...blob, ct: naarB64(bytes) })).rejects.toThrow();
  });
});

describe('inpakken met een wachtwoordzin', () => {
  it('geeft de sleutel terug bij de juiste zin', async () => {
    const sleutel = await nieuweHuissleutel();
    const ruw = await sleutelNaarRuw(sleutel);
    const pakket = await pakInMetZin(ruw, 'zes wilde ganzen boven de dijk');

    const terug = await pakUitMetZin(pakket, 'zes wilde ganzen boven de dijk');
    expect([...terug]).toEqual([...ruw]);

    // En het pakket zelf verraadt niets.
    expect(JSON.stringify(pakket)).not.toContain(naarB64(ruw));
  }, 30000);

  it('zegt netjes dat de zin niet klopt', async () => {
    const ruw = await sleutelNaarRuw(await nieuweHuissleutel());
    const pakket = await pakInMetZin(ruw, 'de juiste zin');
    await expect(pakUitMetZin(pakket, 'de verkeerde zin')).rejects.toThrow(/wachtwoordzin klopt niet/i);
  }, 30000);

  it('gebruikt elke keer een ander zout', async () => {
    const ruw = await sleutelNaarRuw(await nieuweHuissleutel());
    const een = await pakInMetZin(ruw, 'zelfde zin');
    const twee = await pakInMetZin(ruw, 'zelfde zin');
    expect(een.salt).not.toBe(twee.salt);
    expect(een.ct).not.toBe(twee.ct);
  }, 30000);
});

describe('iemand anders toegang geven', () => {
  it('laat alleen de bedoelde persoon de sleutel openen', async () => {
    // Zij: maakt een sleutelpaar en zet de publieke helft klaar.
    const haar = await nieuwSleutelpaar();
    const haarPubliek = await publiekNaarJwk(haar.publicKey);

    // Ik: pak de huishoudsleutel in voor haar.
    const huissleutel = await nieuweHuissleutel();
    const pakket = await pakInVoor(haarPubliek, huissleutel);

    // Zij: pakt hem uit met haar private helft.
    const terug = await pakUitVoorMij(pakket, haar.privateKey);
    expect([...(await sleutelNaarRuw(terug))]).toEqual([...(await sleutelNaarRuw(huissleutel))]);

    // Iemand anders met een eigen sleutelpaar komt er niet in.
    const vreemde = await nieuwSleutelpaar();
    await expect(pakUitVoorMij(pakket, vreemde.privateKey)).rejects.toThrow();
  }, 30000);

  it('kan haar private sleutel bewaren zonder hem prijs te geven', async () => {
    const haar = await nieuwSleutelpaar();
    const ruw = await priveNaarRuw(haar.privateKey);
    const pakket = await pakInMetZin(ruw, 'haar eigen zin');

    const terug = await priveUitRuw(await pakUitMetZin(pakket, 'haar eigen zin'));
    // Wat eruit komt werkt echt: het opent wat voor haar is ingepakt.
    const huissleutel = await nieuweHuissleutel();
    const voorHaar = await pakInVoor(await publiekNaarJwk(haar.publicKey), huissleutel);
    const geopend = await pakUitVoorMij(voorHaar, terug);
    expect([...(await sleutelNaarRuw(geopend))]).toEqual([...(await sleutelNaarRuw(huissleutel))]);
  }, 30000);
});

describe('de sleutel zelf', () => {
  it('overleeft een rondje exporteren en importeren', async () => {
    const sleutel = await nieuweHuissleutel();
    const ruw = await sleutelNaarRuw(sleutel);
    const terug = await sleutelUitRuw(ruw);
    const blob = await versleutel(sleutel, { bedrag: 1234 });
    expect(await ontsleutel(terug, blob)).toEqual({ bedrag: 1234 });
  });
});
