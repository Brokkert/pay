// De sleutelring: hoe de huishoudsleutel op dit apparaat terechtkomt.
//
// Zie kluis.js voor het waarom en de wiskunde. Dit bestand doet de logistiek:
// waar staat het pakketje, wanneer moet je je wachtwoordzin intikken, en hoe
// komt een tweede persoon erbij.
//
// De ontgrendelde sleutel staat standaard in localStorage van dit apparaat, want
// anders tik je bij elke keer openen een zin in en gebruikt niemand het. Dat is
// een bewuste afweging en geen vergissing: het punt van deze hele constructie is
// dat de sléútel de server nooit bereikt. Wie fysiek bij je ontgrendelde
// telefoon kan, kan sowieso bij je bank. Met "Vergrendelen" gooi je hem eraf.

import { useCallback, useEffect, useState } from 'react';
import { getClient } from './supabase.js';
import {
  nieuweHuissleutel,
  sleutelNaarRuw,
  sleutelUitRuw,
  pakInMetZin,
  pakUitMetZin,
  nieuwSleutelpaar,
  publiekNaarJwk,
  priveNaarRuw,
  priveUitRuw,
  pakInVoor,
  pakUitVoorMij,
  naarB64,
  uitB64,
} from './kluis.js';

const PAKKET = 'pay:sleutel';        // met je wachtwoordzin ingepakt
const OPEN = 'pay:sleutel:open';     // ontgrendeld, alleen op dit apparaat
const PRIVE = 'pay:sleutelpaar';     // je private sleutel, terwijl je wacht

const lees = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
};
const schrijf = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* geblokkeerde localStorage: dan tik je je zin elke keer in */
  }
};

export function wisSleutels() {
  for (const k of [PAKKET, OPEN, PRIVE]) schrijf(k, null);
}

/**
 * De toestand van de sleutelring.
 *
 *   laden       — nog aan het kijken wat er is
 *   nieuw       — er is nog geen sleutel; kies een wachtwoordzin
 *   vergrendeld — er is een pakketje; tik je zin in
 *   wachten     — je hebt toegang gevraagd, een huisgenoot moet nog klikken
 *   open        — de sleutel zit in het geheugen, je kunt aan de slag
 */
export function useSleutelring(user) {
  const cloud = Boolean(getClient() && user);
  const [sleutel, setSleutel] = useState(null);
  const [staat, setStaat] = useState('laden');
  const [fout, setFout] = useState(null);
  const [wachtenden, setWachtenden] = useState([]);

  const openen = useCallback(async (ruw) => {
    const s = await sleutelUitRuw(ruw);
    schrijf(OPEN, naarB64(ruw));
    setSleutel(s);
    setStaat('open');
    return s;
  }, []);

  const kijken = useCallback(async () => {
    setFout(null);
    const open = lees(OPEN);
    if (open) {
      try {
        setSleutel(await sleutelUitRuw(uitB64(open)));
        setStaat('open');
        return;
      } catch {
        schrijf(OPEN, null);
      }
    }

    if (!cloud) {
      setStaat(lees(PAKKET) ? 'vergrendeld' : 'nieuw');
      return;
    }

    const supabase = getClient();
    try {
      const [geheim, leden, sleutels] = await Promise.all([
        supabase.from('pay_geheimen').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('pay_leden').select('user_id'),
        supabase.from('pay_sleutels').select('*'),
      ]);
      const eerste = leden.error || sleutels.error;
      if (eerste) throw eerste;

      setWachtenden(
        (sleutels.data || []).filter((r) => r.user_id !== user.id && r.publiek && !r.voor_mij)
      );

      if (geheim.data?.huis_gewrapt) {
        setStaat('vergrendeld');
        return;
      }

      // Heeft een huisgenoot de sleutel al voor mij klaargezet? Dan is er nog
      // één ding nodig: mijn wachtwoordzin, om hem op mijn manier in te pakken.
      const mijn = (sleutels.data || []).find((r) => r.user_id === user.id);
      if (mijn?.voor_mij && lees(PRIVE)) {
        setStaat('vergrendeld');
        return;
      }
      if (mijn?.publiek) {
        setStaat('wachten');
        return;
      }

      // Ben ik de enige hier, dan begint het bij mij en maak ik de sleutel.
      setStaat((leden.data || []).length <= 1 ? 'nieuw' : 'toegang');
    } catch (err) {
      setFout(err.message || String(err));
      setStaat('nieuw');
    }
  }, [cloud, user?.id]);

  useEffect(() => {
    setStaat('laden');
    setSleutel(null);
    kijken();
  }, [kijken]);

  /** De allereerste keer: een sleutel maken en met je zin inpakken. */
  const maakAan = useCallback(
    async (zin) => {
      const nieuw = await nieuweHuissleutel();
      const ruw = await sleutelNaarRuw(nieuw);
      const pakket = await pakInMetZin(ruw, zin);
      if (cloud) {
        const { error } = await getClient()
          .from('pay_geheimen')
          .upsert({ user_id: user.id, huis_gewrapt: pakket });
        if (error) throw error;
      } else {
        schrijf(PAKKET, pakket);
      }
      await openen(ruw);
    },
    [cloud, user?.id, openen]
  );

  /** Elke keer daarna: je zin intikken. */
  const ontgrendel = useCallback(
    async (zin) => {
      let pakket = lees(PAKKET);
      let voorMij = null;
      if (cloud) {
        const supabase = getClient();
        const [geheim, sleutels] = await Promise.all([
          supabase.from('pay_geheimen').select('*').eq('user_id', user.id).maybeSingle(),
          supabase.from('pay_sleutels').select('*').eq('user_id', user.id).maybeSingle(),
        ]);
        pakket = geheim.data?.huis_gewrapt || null;
        voorMij = sleutels.data?.voor_mij || null;
      }

      if (pakket) {
        await openen(await pakUitMetZin(pakket, zin));
        return;
      }

      // Nog geen eigen pakketje, maar wel een dat een huisgenoot voor mij heeft
      // ingepakt: private sleutel openen met mijn zin, daarmee de
      // huishoudsleutel, en die daarna op mijn eigen manier bewaren.
      const priveePakket = lees(PRIVE);
      if (!voorMij || !priveePakket) throw new Error('Er staat nog geen sleutel voor je klaar.');

      const prive = await priveUitRuw(await pakUitMetZin(priveePakket, zin));
      const huis = await pakUitVoorMij(voorMij, prive);
      const ruw = await sleutelNaarRuw(huis);
      const { error } = await getClient()
        .from('pay_geheimen')
        .upsert({ user_id: user.id, huis_gewrapt: await pakInMetZin(ruw, zin) });
      if (error) throw error;
      schrijf(PRIVE, null);
      await openen(ruw);
    },
    [cloud, user?.id, openen]
  );

  /** Toegang vragen: sleutelpaar maken en de publieke helft klaarzetten. */
  const vraagToegang = useCallback(
    async (zin) => {
      const paar = await nieuwSleutelpaar();
      schrijf(PRIVE, await pakInMetZin(await priveNaarRuw(paar.privateKey), zin));
      const { error } = await getClient()
        .from('pay_sleutels')
        .upsert({ user_id: user.id, publiek: await publiekNaarJwk(paar.publicKey), voor_mij: null });
      if (error) throw error;
      setStaat('wachten');
    },
    [user?.id]
  );

  /** Iemand binnenlaten: de huishoudsleutel inpakken met diens publieke sleutel. */
  const geefToegang = useCallback(
    async (rij) => {
      if (!sleutel) throw new Error('Ontgrendel eerst je eigen kluis.');
      const pakket = await pakInVoor(rij.publiek, sleutel);
      const { error } = await getClient().rpc('pay_deel_sleutel', {
        p_user: rij.user_id,
        p_pakket: pakket,
      });
      if (error) throw error;
      await kijken();
    },
    [sleutel, kijken]
  );

  const vergrendel = useCallback(() => {
    schrijf(OPEN, null);
    setSleutel(null);
    setStaat('vergrendeld');
  }, []);

  return {
    sleutel,
    staat,
    fout,
    cloud,
    wachtenden,
    maakAan,
    ontgrendel,
    vraagToegang,
    geefToegang,
    vergrendel,
    opnieuwKijken: kijken,
  };
}
