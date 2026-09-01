// Een huishouden om mee te beginnen.
//
// Een leeg scherm laat niet zien waar Pay voor is. Dit voorbeeld wel: een pot
// met twee mensen, een abonnement dat van een eigen rekening af gaat maar door
// vier mensen gedeeld wordt, en een abonnement van iemand anders waar jij aan
// meebetaalt. Precies de drie gevallen die in een spreadsheet zo'n rommel
// worden. Alles is te wijzigen of in één klik weg te gooien.

import { nieuwId } from '../lib/kasboek.js';

export function voorbeeldKasboek() {
  const ik = nieuwId();
  const partner = nieuwId();
  const pieter = nieuwId();
  const sanne = nieuwId();

  const samen = nieuwId();
  const prive = nieuwId();
  const zaak = nieuwId();

  const personen = [
    { id: ik, naam: 'Ik', emoji: '🙂', kleur: '#1f6f5c', is_mij: true },
    { id: partner, naam: 'Partner', emoji: '🌻', kleur: '#8a5b2b' },
    { id: pieter, naam: 'Pieter', emoji: '🦊', kleur: '#3a5f8c' },
    { id: sanne, naam: 'Sanne', emoji: '🐙', kleur: '#7a3f6d' },
  ];

  const rekeningen = [
    { id: samen, naam: 'Gezamenlijk', soort: 'gezamenlijk', emoji: '🤝',
      deelnemers: [ik, partner], stortingen: { [ik]: 90000, [partner]: 90000 } },
    { id: prive, naam: 'Privé', soort: 'prive', emoji: '👤', eigenaar_id: ik },
    { id: zaak, naam: 'Zaak', soort: 'zakelijk', emoji: '🧑‍💼', eigenaar_id: ik },
  ];

  const samenGelijk = { soort: 'gelijk', deelnemers: [ik, partner], gewichten: {} };

  const posten = [
    { naam: 'Huur', bedrag: 132500, ritme: 'maand', categorie: 'wonen',
      betaler: { soort: 'rekening', id: samen }, verdeling: samenGelijk },
    { naam: 'Energie', bedrag: 18500, ritme: 'maand', categorie: 'nuts',
      betaler: { soort: 'rekening', id: samen }, verdeling: samenGelijk },
    { naam: 'Internet', bedrag: 4900, ritme: 'maand', categorie: 'telecom',
      betaler: { soort: 'rekening', id: samen }, verdeling: samenGelijk },
    { naam: 'Inboedelverzekering', bedrag: 18600, ritme: 'jaar', categorie: 'verzekering',
      betaler: { soort: 'rekening', id: samen }, verdeling: samenGelijk },
    { naam: 'Waterschap', bedrag: 8700, ritme: 'kwartaal', categorie: 'nuts',
      betaler: { soort: 'rekening', id: samen }, verdeling: samenGelijk },

    // Van de zaak betaald, maar met z'n vieren gebruikt: de andere drie staan
    // hiervoor bij jou in het krijt.
    { naam: 'YouTube Family', bedrag: 2599, ritme: 'maand', categorie: 'streaming',
      zakelijk: true, betaler: { soort: 'rekening', id: zaak },
      notitie: 'Loopt op de zaak, maar we delen hem met z’n vieren.',
      verdeling: { soort: 'gelijk', deelnemers: [ik, partner, pieter, sanne], gewichten: {} } },

    // Andersom: Pieter betaalt, jij doet mee. Pay streept dit tegen het
    // YouTube-abonnement weg.
    { naam: 'Spotify Duo', bedrag: 1499, ritme: 'maand', categorie: 'streaming',
      betaler: { soort: 'persoon', id: pieter },
      notitie: 'Van Pieter; ik betaal mijn helft.',
      verdeling: { soort: 'gelijk', deelnemers: [ik, pieter], gewichten: {} } },

    { naam: 'Sportschool', bedrag: 3250, ritme: 'maand', categorie: 'gezondheid',
      betaler: { soort: 'rekening', id: prive },
      verdeling: { soort: 'gelijk', deelnemers: [ik], gewichten: {} } },
  ];

  return {
    personen,
    rekeningen,
    posten: posten.map((p) => ({ id: nieuwId(), gepauzeerd: false, notitie: '', ...p })),
  };
}
