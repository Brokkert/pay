// De kluis: personen, rekeningen en posten.
//
// Alles wat inhoud is — een naam, een bedrag, een notitie — gaat door de
// versleuteling voordat het hier weggeschreven wordt, en pas weer terug als het
// binnenkomt. Wat er in de database of in localStorage belandt, is een blob.
//
// Wat er buiten de blob blijft is het minimum dat nodig is om te weten wie
// erbij mag: het huishouden, het id van de rij, en bij een persoon de koppeling
// aan een account. Geen namen, geen bedragen.
//
// Pay draait in twee standen. Met een Supabase-project erachter staat alles in
// de database, afgeschermd per huishouden. Zonder — of als je niet ingelogd
// bent — is er de lokale stand: alles in deze browser, en ook daar versleuteld.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getClient } from './supabase.js';
import { versleutel, ontsleutel } from './kluis.js';

const LOKAAL = 'pay:kluis:v2';
const cacheSleutel = (userId) => `pay:cache:${userId}`;

const leeg = () => ({ personen: [], rekeningen: [], posten: [] });

const leesJson = (sleutel, terugval) => {
  try {
    return JSON.parse(localStorage.getItem(sleutel)) ?? terugval;
  } catch {
    return terugval;
  }
};
const schrijfJson = (sleutel, waarde) => {
  try {
    localStorage.setItem(sleutel, JSON.stringify(waarde));
  } catch {
    /* vol of geblokkeerd; niet fataal */
  }
};

export const nieuwId = () =>
  crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const TABEL = { personen: 'pay_personen', rekeningen: 'pay_rekeningen', posten: 'pay_posten' };

// Wat er buiten de versleuteling blijft, per soort. Alleen dit ziet de server.
const OPEN_VELDEN = { personen: ['gekoppeld_aan'], rekeningen: [], posten: [] };

/** Van een gewone rij naar wat er weggeschreven wordt. */
async function naarOpslag(soort, rij, sleutel) {
  const open = {};
  const inhoud = { ...rij };
  delete inhoud.id;
  delete inhoud.created_at;
  delete inhoud.geheim;
  for (const veld of OPEN_VELDEN[soort]) {
    if (rij[veld] !== undefined) open[veld] = rij[veld];
    delete inhoud[veld];
  }
  if (soort === 'posten') {
    inhoud.bedrag = Math.round(Number(inhoud.bedrag) || 0);
    // Lege datumvelden komen uit <input type="date"> als '' binnen.
    for (const datum of ['vanaf', 'tot']) if (inhoud[datum] === '') inhoud[datum] = null;
  }
  return { ...open, geheim: await versleutel(sleutel, inhoud) };
}

/** En terug. Een rij die niet te openen valt slaan we over in plaats van te crashen. */
async function uitOpslag(soort, rij, sleutel) {
  try {
    const inhoud = await ontsleutel(sleutel, rij.geheim);
    if (!inhoud) return null;
    const uit = { ...inhoud, id: rij.id, created_at: rij.created_at };
    for (const veld of OPEN_VELDEN[soort]) uit[veld] = rij[veld] ?? null;
    return uit;
  } catch {
    return null;
  }
}

const allesUit = async (soort, rijen, sleutel) =>
  (await Promise.all((rijen || []).map((r) => uitOpslag(soort, r, sleutel)))).filter(Boolean);

/** Het huishouden waar je bij hoort, of null in de lokale stand. */
async function mijnHuishouden() {
  const { data, error } = await getClient().rpc('pay_mijn_huishouden');
  if (error) throw error;
  return data ?? null;
}

export function useKasboek(user, sleutel) {
  const cloud = Boolean(getClient() && user);
  const [staat, setStaat] = useState(leeg);
  const [huishouden, setHuishouden] = useState(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState(null);
  const [offline, setOffline] = useState(false);

  const ophalen = useCallback(async () => {
    setFout(null);
    if (!sleutel) {
      setStaat(leeg());
      setLaden(false);
      return;
    }

    if (!cloud) {
      const rauw = { ...leeg(), ...leesJson(LOKAAL, leeg()) };
      setStaat({
        personen: await allesUit('personen', rauw.personen, sleutel),
        rekeningen: await allesUit('rekeningen', rauw.rekeningen, sleutel),
        posten: await allesUit('posten', rauw.posten, sleutel),
      });
      setHuishouden(null);
      setLaden(false);
      return;
    }

    const supabase = getClient();
    try {
      setHuishouden(await mijnHuishouden());
      const [personen, rekeningen, posten] = await Promise.all([
        supabase.from('pay_personen').select('*').order('created_at'),
        supabase.from('pay_rekeningen').select('*').order('created_at'),
        supabase.from('pay_posten').select('*').order('created_at'),
      ]);
      const eerste = personen.error || rekeningen.error || posten.error;
      if (eerste) throw eerste;

      const verse = {
        // Wie "ik" ben verschilt per kijker: voor jou is dat jouw persoon, voor
        // je huisgenoot de hare. In de cloud bepaalt de koppeling aan het
        // account dat, en niet een vlag in de gegevens — die is voor iedereen
        // hetzelfde en zou bij haar het verkeerde poppetje aanwijzen.
        personen: (await allesUit('personen', personen.data, sleutel)).map((p) => ({
          ...p,
          is_mij: p.gekoppeld_aan === user.id,
        })),
        rekeningen: await allesUit('rekeningen', rekeningen.data, sleutel),
        posten: await allesUit('posten', posten.data, sleutel),
      };
      setStaat(verse);
      setOffline(false);
      // De kopie voor onderweg is óók versleuteld: hij bevat de rijen precies
      // zoals ze uit de database kwamen.
      schrijfJson(cacheSleutel(user.id), {
        personen: personen.data,
        rekeningen: rekeningen.data,
        posten: posten.data,
      });
    } catch (err) {
      // Geen bereik? Val terug op de kopie van de laatste keer.
      const kopie = leesJson(cacheSleutel(user.id), null);
      if (kopie) {
        setStaat({
          personen: (await allesUit('personen', kopie.personen, sleutel)).map((p) => ({
            ...p,
            is_mij: p.gekoppeld_aan === user.id,
          })),
          rekeningen: await allesUit('rekeningen', kopie.rekeningen, sleutel),
          posten: await allesUit('posten', kopie.posten, sleutel),
        });
        setOffline(true);
      } else {
        setFout(err.message || String(err));
      }
    }
    setLaden(false);
  }, [cloud, user?.id, sleutel]);

  useEffect(() => {
    setLaden(true);
    ophalen();
  }, [ophalen]);

  const bewaarLokaal = useCallback(async (volgende) => {
    schrijfJson(LOKAAL, volgende);
    setStaat({
      personen: await allesUit('personen', volgende.personen, sleutel),
      rekeningen: await allesUit('rekeningen', volgende.rekeningen, sleutel),
      posten: await allesUit('posten', volgende.posten, sleutel),
    });
  }, [sleutel]);

  const bewaar = useCallback(
    async (soort, rij) => {
      if (!sleutel) throw new Error('De kluis is vergrendeld.');
      const opslag = await naarOpslag(soort, rij, sleutel);

      if (!cloud) {
        const rauw = { ...leeg(), ...leesJson(LOKAAL, leeg()) };
        const nu = new Date().toISOString();
        rauw[soort] = rij.id
          ? rauw[soort].map((r) => (r.id === rij.id ? { ...r, ...opslag } : r))
          : [...rauw[soort], { ...opslag, id: nieuwId(), created_at: nu }];
        await bewaarLokaal(rauw);
        return rij;
      }

      const supabase = getClient();
      if (rij.id) {
        const { error } = await supabase.from(TABEL[soort]).update(opslag).eq('id', rij.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(TABEL[soort]).insert(opslag);
        if (error) throw error;
      }
      await ophalen();
      return rij;
    },
    [cloud, sleutel, bewaarLokaal, ophalen]
  );

  const verwijder = useCallback(
    async (soort, id) => {
      if (!cloud) {
        const rauw = { ...leeg(), ...leesJson(LOKAAL, leeg()) };
        rauw[soort] = rauw[soort].filter((r) => r.id !== id);
        await bewaarLokaal(rauw);
        return;
      }
      const { error } = await getClient().from(TABEL[soort]).delete().eq('id', id);
      if (error) throw error;
      setStaat((s) => ({ ...s, [soort]: s[soort].filter((r) => r.id !== id) }));
    },
    [cloud, bewaarLokaal]
  );

  /**
   * Een hele set in één keer invoeren.
   *
   * De volgorde is niet vrijblijvend: rekeningen wijzen naar personen en posten
   * naar allebei, dus de oude id's moeten al vertaald zijn voor we ze
   * wegschrijven. In de cloud deelt de database de id's uit, dus daar gaat het
   * rij voor rij.
   */
  const voerIn = useCallback(
    async (set) => {
      if (!sleutel) throw new Error('De kluis is vergrendeld.');
      const aantal = set.personen.length + set.rekeningen.length + set.posten.length;
      if (!aantal) return 0;

      if (!cloud) {
        const rauw = { ...leeg(), ...leesJson(LOKAAL, leeg()) };
        const nu = new Date().toISOString();
        for (const soort of ['personen', 'rekeningen', 'posten']) {
          for (const rij of set[soort]) {
            rauw[soort].push({
              ...(await naarOpslag(soort, rij, sleutel)),
              id: rij.id,
              created_at: nu,
            });
          }
        }
        await bewaarLokaal(rauw);
        return aantal;
      }

      const supabase = getClient();
      const kaart = new Map();
      for (const soort of ['personen', 'rekeningen', 'posten']) {
        for (const rij of set[soort]) {
          const opslag = await naarOpslag(soort, hertaal(rij, kaart), sleutel);
          const { data, error } = await supabase.from(TABEL[soort]).insert(opslag).select('id').single();
          if (error) throw error;
          kaart.set(rij.id, data.id);
        }
      }
      await ophalen();
      return aantal;
    },
    [cloud, sleutel, bewaarLokaal, ophalen]
  );

  /** Alles uit de lokale stand naar je huishouden tillen, na het inloggen. */
  const tilOver = useCallback(async () => {
    const rauw = { ...leeg(), ...leesJson(LOKAAL, leeg()) };
    const uitgepakt = {
      personen: await allesUit('personen', rauw.personen, sleutel),
      rekeningen: await allesUit('rekeningen', rauw.rekeningen, sleutel),
      posten: await allesUit('posten', rauw.posten, sleutel),
    };
    const aantal = await voerIn(uitgepakt);
    if (aantal) schrijfJson(LOKAAL, leeg());
    return aantal;
  }, [voerIn, sleutel]);

  const lokaalAantal = useMemo(() => {
    const l = leesJson(LOKAAL, leeg());
    return (l.personen?.length || 0) + (l.rekeningen?.length || 0) + (l.posten?.length || 0);
  }, [staat]);

  /** "Dit ben ik" aanvinken bij een persoon. */
  const claim = useCallback(
    async (persoonId) => {
      if (!cloud) {
        for (const p of staat.personen) {
          if (Boolean(p.is_mij) !== (p.id === persoonId)) {
            await bewaar('personen', { ...p, is_mij: p.id === persoonId });
          }
        }
        return;
      }
      const supabase = getClient();
      const huidig = staat.personen.find((p) => p.gekoppeld_aan === user.id);
      if (huidig && huidig.id !== persoonId) {
        const { error } = await supabase
          .from('pay_personen').update({ gekoppeld_aan: null }).eq('id', huidig.id);
        if (error) throw error;
      }
      const { error } = await supabase
        .from('pay_personen').update({ gekoppeld_aan: user.id }).eq('id', persoonId);
      if (error) throw error;
      await ophalen();
    },
    [cloud, staat, user?.id, bewaar, ophalen]
  );

  return {
    ...staat,
    huishouden,
    laden,
    fout,
    offline,
    cloud,
    lokaalAantal,
    ophalen,
    bewaar,
    verwijder,
    tilOver,
    voerIn,
    claim,
  };
}

/** Oude (lokale) id's vervangen door de nieuwe uit de database. */
function hertaal(rij, kaart) {
  const om = (id) => kaart.get(id) ?? id;
  const uit = { ...rij };
  if (uit.eigenaar_id) uit.eigenaar_id = om(uit.eigenaar_id);
  if (Array.isArray(uit.deelnemers)) uit.deelnemers = uit.deelnemers.map(om);
  if (uit.stortingen) {
    uit.stortingen = Object.fromEntries(
      Object.entries(uit.stortingen).map(([id, c]) => [om(id), c])
    );
  }
  if (uit.betaler?.id) uit.betaler = { ...uit.betaler, id: om(uit.betaler.id) };
  if (uit.verdeling) {
    const v = { ...uit.verdeling };
    if (Array.isArray(v.deelnemers)) v.deelnemers = v.deelnemers.map(om);
    if (v.gewichten) {
      v.gewichten = Object.fromEntries(Object.entries(v.gewichten).map(([id, g]) => [om(id), g]));
    }
    uit.verdeling = v;
  }
  return uit;
}
