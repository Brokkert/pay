// Een huishouden om mee te beginnen.
//
// Een leeg scherm laat niet zien waar Pay voor is. Dit voorbeeld wel, en het
// laat precies de vier gevallen zien die in een spreadsheet een rommel worden:
//
//   1. gewone gedeelde lasten van de vaste-lastenrekening;
//   2. iets wat de zaak betaalt maar wat je samen gebruikt;
//   3. een abonnement dat je met vrienden deelt en waar je geld voor terugkrijgt;
//   4. een abonnement van iemand anders waar jij aan meebetaalt.
//
// De bedragen zijn verzonnen. Alles is te wijzigen of in één klik weg te gooien.

import { nieuwId } from '../lib/kasboek.js';

export function voorbeeldKasboek() {
  const ik = nieuwId();
  const partner = nieuwId();
  const pieter = nieuwId();
  const sanne = nieuwId();

  const vast = nieuwId();
  const prive = nieuwId();
  const zaak = nieuwId();

  const personen = [
    { id: ik, naam: 'Ik', kleur: '#0d6e5c', is_mij: true },
    { id: partner, naam: 'Partner', kleur: '#9a4f2c' },
    { id: pieter, naam: 'Pieter', kleur: '#2f5fa8' },
    { id: sanne, naam: 'Sanne', kleur: '#7a4a8f' },
  ];

  const rekeningen = [
    {
      id: vast,
      naam: 'Vaste lasten',
      soort: 'gezamenlijk',
      deelnemers: [ik, partner],
      stortingen: { [ik]: 12000, [partner]: 15500 },
      // Alles wordt hier verrekend: ook wat de zaak of een privérekening
      // voorschiet. Zo maakt ieder één bedrag over.
      afrekenpot: true,
    },
    { id: prive, naam: 'Privé', soort: 'prive', eigenaar_id: ik },
    { id: zaak, naam: 'Zaak', soort: 'zakelijk', eigenaar_id: ik },
  ];

  const samen = { soort: 'gelijk', deelnemers: [ik, partner], gewichten: {} };

  const posten = [
    { naam: 'Gas/Stroom', bedrag: 11700, categorie: 'nuts',
      betaler: { soort: 'rekening', id: vast }, verdeling: samen },
    { naam: 'Water', bedrag: 1900, categorie: 'nuts',
      betaler: { soort: 'rekening', id: vast }, verdeling: samen },
    { naam: 'Gemeentebelasting', bedrag: 3812, categorie: 'belasting',
      betaler: { soort: 'rekening', id: vast }, verdeling: samen },

    // Twee posten op één afschrijving van de verzekeraar.
    { naam: 'Inboedelverzekering', bedrag: 1469, categorie: 'verzekering',
      bundel: 'Verzekeringspakket',
      betaler: { soort: 'rekening', id: vast }, verdeling: samen },
    { naam: 'Aansprakelijkheid', bedrag: 711, categorie: 'verzekering',
      bundel: 'Verzekeringspakket',
      betaler: { soort: 'rekening', id: vast }, verdeling: samen },

    { naam: 'Waterschap', bedrag: 8700, ritme: 'kwartaal', categorie: 'belasting',
      betaler: { soort: 'rekening', id: vast }, verdeling: samen },

    // Loopt op de zaak, maar we gebruiken het samen. Partner stort haar helft
    // gewoon op de vaste-lastenrekening, en die betaalt het aan mij terug —
    // waardoor ik er zelf minder in hoef te doen.
    { naam: 'TV + internet', bedrag: 6739, categorie: 'telecom', zakelijk: true,
      notitie: 'Loopt op de zaak; thuis gebruiken we het allebei.',
      betaler: { soort: 'rekening', id: zaak }, verdeling: samen },

    // Zes plekken, vier vrienden betalen mee. Voeg ze toe bij Mensen en zet ze
    // hier in de verdeling; wat zij je schuldig zijn rolt er vanzelf uit.
    { naam: 'YouTube Family', bedrag: 2599, categorie: 'streaming',
      betaler: { soort: 'rekening', id: zaak },
      verdeling: { soort: 'gelijk', deelnemers: [ik, partner, pieter, sanne], gewichten: {} } },

    // Andersom: Pieter betaalt, ik doe mee. Pay streept dit weg tegen YouTube.
    { naam: 'Spotify Duo', bedrag: 1499, categorie: 'streaming',
      notitie: 'Van Pieter; ik betaal mijn helft.',
      betaler: { soort: 'persoon', id: pieter },
      verdeling: { soort: 'gelijk', deelnemers: [ik, pieter], gewichten: {} } },

    // Vier delen bankkosten, waarvan er één zakelijk is. Dat kwart draagt de
    // zaak, niet jij privé — en de zaak maakt het gewoon over.
    { naam: 'Bankkosten', bedrag: 2899, categorie: 'overig',
      betaler: { soort: 'rekening', id: vast },
      verdeling: { soort: 'delen', deelnemers: [], gewichten: { [ik]: 2, [partner]: 1, [`rekening:${zaak}`]: 1 } } },

    { naam: 'Sportschool', bedrag: 4000, categorie: 'gezondheid',
      betaler: { soort: 'rekening', id: prive },
      verdeling: { soort: 'gelijk', deelnemers: [ik], gewichten: {} } },
  ];

  return {
    personen,
    rekeningen,
    posten: posten.map((p) => ({
      id: nieuwId(),
      ritme: 'maand',
      bundel: '',
      gepauzeerd: false,
      zakelijk: false,
      notitie: '',
      ...p,
    })),
  };
}
