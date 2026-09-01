// De kluis: personen, rekeningen en posten.
//
// Pay draait in twee standen, net als Camp. Met een Supabase-project erachter
// staat alles in de database, afgeschermd per huishouden met Row Level
// Security. Zonder — of als je niet ingelogd bent — is er de lokale kluis:
// alles in deze browser, niets naar buiten. Dezelfde vorm, dezelfde schermen,
// zodat je het eerst een maand kunt proberen voor je iets aanmaakt.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getClient } from './supabase.js';

const LOKAAL = 'pay:kluis:v1';
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

// --- welke velden de database kent -------------------------------------------
const VELDEN = {
  personen: ['naam', 'kleur', 'is_mij', 'gekoppeld_aan'],
  rekeningen: ['naam', 'soort', 'eigenaar_id', 'deelnemers', 'stortingen', 'iban', 'afrekenpot'],
  posten: ['naam', 'bedrag', 'ritme', 'betaler', 'verdeling', 'categorie', 'bundel', 'vanaf',
    'tot', 'gepauzeerd', 'zakelijk', 'notitie', 'afgerekend'],
};
const TABEL = { personen: 'pay_personen', rekeningen: 'pay_rekeningen', posten: 'pay_posten' };

// is_mij bestaat alleen in de lokale kluis. In de cloud is "ik" per kijker
// anders en volgt het uit gekoppeld_aan; de kolom terugschrijven zou de vlag
// van je huisgenoot overschrijven met wat er bij jou op het scherm stond.
const ALLEEN_LOKAAL = { personen: ['is_mij'] };

function voorDb(soort, rij, cloud = false) {
  const uit = {};
  for (const veld of VELDEN[soort]) {
    if (cloud && ALLEEN_LOKAAL[soort]?.includes(veld)) continue;
    if (rij[veld] !== undefined) uit[veld] = rij[veld];
  }
  if (soort === 'posten') {
    uit.bedrag = Math.round(Number(uit.bedrag) || 0);
    // Lege datumvelden komen uit <input type="date"> als '' binnen, en daar
    // maakt PostgREST een fout van.
    for (const datum of ['vanaf', 'tot']) if (uit[datum] === '') uit[datum] = null;
  }
  return uit;
}

/** Het huishouden waar je bij hoort, of null in lokale stand. */
async function mijnHuishouden() {
  const supabase = getClient();
  const { data, error } = await supabase.rpc('pay_mijn_huishouden');
  if (error) throw error;
  return data ?? null;
}

export function useKasboek(user) {
  const cloud = Boolean(getClient() && user);
  const [staat, setStaat] = useState(leeg);
  const [huishouden, setHuishouden] = useState(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState(null);
  const [offline, setOffline] = useState(false);

  const ophalen = useCallback(async () => {
    setFout(null);
    if (!cloud) {
      setStaat({ ...leeg(), ...leesJson(LOKAAL, leeg()) });
      setHuishouden(null);
      setLaden(false);
      return;
    }

    const supabase = getClient();
    try {
      const hh = await mijnHuishouden();
      setHuishouden(hh);
      const [personen, rekeningen, posten] = await Promise.all([
        supabase.from('pay_personen').select('*').order('created_at'),
        supabase.from('pay_rekeningen').select('*').order('created_at'),
        supabase.from('pay_posten').select('*').order('naam'),
      ]);
      const eerste = personen.error || rekeningen.error || posten.error;
      if (eerste) throw eerste;
      const verse = {
        // Wie "ik" ben verschilt per kijker: voor jou is dat jouw persoon, voor
        // je vriendin de hare. In de cloud bepaalt de koppeling aan het account
        // dat dus, en niet de vlag in de tabel — die is per huishouden hetzelfde
        // en zou anders bij haar het verkeerde poppetje aanwijzen.
        personen: (personen.data || []).map((p) => ({
          ...p,
          is_mij: p.gekoppeld_aan === user.id,
        })),
        rekeningen: rekeningen.data || [],
        posten: posten.data || [],
      };
      setStaat(verse);
      setOffline(false);
      schrijfJson(cacheSleutel(user.id), verse);
    } catch (err) {
      // Geen bereik? Val terug op de kopie van de laatste keer, zodat je in de
      // supermarkt nog steeds kunt opzoeken wat er loopt.
      const kopie = leesJson(cacheSleutel(user.id), null);
      if (kopie) {
        setStaat(kopie);
        setOffline(true);
      } else {
        setFout(err.message || String(err));
      }
    }
    setLaden(false);
  }, [cloud, user?.id]);

  useEffect(() => {
    setLaden(true);
    ophalen();
  }, [ophalen]);

  const bewaarLokaal = useCallback((volgende) => {
    setStaat(volgende);
    schrijfJson(LOKAAL, volgende);
  }, []);

  const bewaar = useCallback(
    async (soort, rij) => {
      const schoon = voorDb(soort, rij, cloud);

      if (!cloud) {
        const volgende = { ...staat };
        const nu = new Date().toISOString();
        if (rij.id) {
          volgende[soort] = staat[soort].map((r) => (r.id === rij.id ? { ...r, ...schoon } : r));
        } else {
          volgende[soort] = [...staat[soort], { ...schoon, id: nieuwId(), created_at: nu }];
        }
        bewaarLokaal(volgende);
        return volgende[soort].find((r) => r.id === rij.id) || volgende[soort].at(-1);
      }

      const supabase = getClient();
      if (rij.id) {
        const { data, error } = await supabase
          .from(TABEL[soort]).update(schoon).eq('id', rij.id).select().single();
        if (error) throw error;
        setStaat((s) => ({ ...s, [soort]: s[soort].map((r) => (r.id === data.id ? data : r)) }));
        return data;
      }
      const { data, error } = await supabase
        .from(TABEL[soort]).insert(schoon).select().single();
      if (error) throw error;
      setStaat((s) => ({ ...s, [soort]: [...s[soort], data] }));
      return data;
    },
    [cloud, staat, bewaarLokaal]
  );

  const verwijder = useCallback(
    async (soort, id) => {
      if (!cloud) {
        bewaarLokaal({ ...staat, [soort]: staat[soort].filter((r) => r.id !== id) });
        return;
      }
      const { error } = await getClient().from(TABEL[soort]).delete().eq('id', id);
      if (error) throw error;
      setStaat((s) => ({ ...s, [soort]: s[soort].filter((r) => r.id !== id) }));
    },
    [cloud, staat, bewaarLokaal]
  );

  /**
   * Een hele set in één keer invoeren.
   *
   * De volgorde is niet vrijblijvend: rekeningen wijzen naar personen en posten
   * naar allebei, dus de oude id's moeten al vertaald zijn voor we ze
   * meesturen. Lokaal kan dat in één klap, in de cloud rij voor rij omdat de
   * database de id's uitdeelt.
   */
  const voerIn = useCallback(
    async (set) => {
      const aantal =
        set.personen.length + set.rekeningen.length + set.posten.length;
      if (!aantal) return 0;

      if (!cloud) {
        bewaarLokaal({
          personen: [...staat.personen, ...set.personen],
          rekeningen: [...staat.rekeningen, ...set.rekeningen],
          posten: [...staat.posten, ...set.posten],
        });
        return aantal;
      }

      const supabase = getClient();
      const kaart = new Map();
      for (const soort of ['personen', 'rekeningen', 'posten']) {
        for (const rij of set[soort]) {
          const schoon = hertaal(voorDb(soort, rij, true), kaart);
          const { data, error } = await supabase
            .from(TABEL[soort]).insert(schoon).select().single();
          if (error) throw error;
          kaart.set(rij.id, data.id);
        }
      }
      await ophalen();
      return aantal;
    },
    [cloud, ophalen, staat, bewaarLokaal]
  );

  /** Alles uit de lokale kluis naar je huishouden tillen, na het inloggen. */
  const tilOver = useCallback(async () => {
    const aantal = await voerIn({ ...leeg(), ...leesJson(LOKAAL, leeg()) });
    if (aantal) schrijfJson(LOKAAL, leeg());
    return aantal;
  }, [voerIn]);

  /**
   * "Dit ben ik" aanvinken bij een persoon.
   *
   * In de cloud is dat een koppeling aan je account: eerst de oude losmaken,
   * dan de nieuwe leggen — er kan er maar één zijn, en de database bewaakt dat
   * met een unieke index. Lokaal is het gewoon de vlag.
   */
  const claim = useCallback(
    async (persoonId) => {
      if (!cloud) {
        bewaarLokaal({
          ...staat,
          personen: staat.personen.map((p) => ({ ...p, is_mij: p.id === persoonId })),
        });
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
    [cloud, staat, user?.id, bewaarLokaal, ophalen]
  );

  const lokaalAantal = useMemo(() => {
    const l = leesJson(LOKAAL, leeg());
    return l.personen.length + l.rekeningen.length + l.posten.length;
  }, [staat]);

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
    vervang: bewaarLokaal,
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
