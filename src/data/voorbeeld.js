// Een huishouden om mee te beginnen.
//
// Een leeg scherm laat niet zien waar Pay voor is. Dit voorbeeld wel, en het
// laat precies de vier gevallen zien die in een spreadsheet een rommel worden:
//
//   1. gewone gedeelde lasten van de vaste-lastenrekening;
//   2. iets wat de zaak betaalt maar wat je samen gebruikt;
//   3. een abonnement dat je met vrienden deelt en waar je geld voor terugkrijgt;
//   4. een deel dat zakelijk is en dus door de zaak gedragen wordt.
//
// Alle namen en bedragen hieronder zijn verzonnen: ronde getallen die nergens
// op slaan, met opzet. Dit bestand staat in een openbare repo, dus er hoort
// niets in wat op iemands werkelijke lasten lijkt.

import { nieuwId } from '../lib/kasboek.js';

export function voorbeeldKasboek() {
  const ik = nieuwId();
  const partner = nieuwId();
  const vriend = nieuwId();
  const buur = nieuwId();

  const vast = nieuwId();
  const prive = nieuwId();
  const zaak = nieuwId();

  const personen = [
    { id: ik, naam: 'Ik', kleur: '#0d6e5c', is_mij: true },
    { id: partner, naam: 'Partner', kleur: '#9a4f2c' },
    { id: vriend, naam: 'Vriend', kleur: '#2f5fa8' },
    { id: buur, naam: 'Buur', kleur: '#7a4a8f' },
  ];

  const rekeningen = [
    {
      id: vast,
      naam: 'Vaste lasten',
      soort: 'gezamenlijk',
      deelnemers: [ik, partner],
      stortingen: { [ik]: 15000, [partner]: 15000 },
      // Alles wordt hier verrekend: ook wat de zaak of een privérekening
      // voorschiet. Zo maakt ieder één bedrag over.
      afrekenpot: true,
    },
    { id: prive, naam: 'Privé', soort: 'prive', eigenaar_id: ik },
    { id: zaak, naam: 'Zaak', soort: 'zakelijk', eigenaar_id: ik },
  ];

  const samen = { soort: 'gelijk', deelnemers: [ik, partner], gewichten: {} };

  const posten = [
    { naam: 'Energie', bedrag: 9000, categorie: 'nuts',
      betaler: { soort: 'rekening', id: vast }, verdeling: samen },
    { naam: 'Water', bedrag: 1500, categorie: 'nuts',
      betaler: { soort: 'rekening', id: vast }, verdeling: samen },

    // Twee posten op één afschrijving van dezelfde verzekeraar.
    { naam: 'Inboedel', bedrag: 1200, categorie: 'verzekering', bundel: 'Verzekeringen',
      betaler: { soort: 'rekening', id: vast }, verdeling: samen },
    { naam: 'Aansprakelijkheid', bedrag: 800, categorie: 'verzekering', bundel: 'Verzekeringen',
      betaler: { soort: 'rekening', id: vast }, verdeling: samen },

    { naam: 'Gemeentelijke heffingen', bedrag: 9000, ritme: 'kwartaal', categorie: 'belasting',
      betaler: { soort: 'rekening', id: vast }, verdeling: samen },

    // Loopt op de zaak, maar we gebruiken het samen. De partner stort haar helft
    // gewoon op de vaste-lastenrekening, en die betaalt het aan mij terug —
    // waardoor ik er zelf minder in hoef te doen.
    { naam: 'Internet', bedrag: 5000, categorie: 'telecom', zakelijk: true,
      notitie: 'Loopt op de zaak; thuis gebruiken we het allebei.',
      betaler: { soort: 'rekening', id: zaak }, verdeling: samen },

    // Een gedeeld abonnement met vrienden erbij. Voeg zoveel mensen toe als er
    // meedoen; wat zij je schuldig zijn rolt er vanzelf uit.
    { naam: 'Streamingdienst', bedrag: 2000, categorie: 'streaming',
      betaler: { soort: 'rekening', id: prive },
      verdeling: { soort: 'gelijk', deelnemers: [ik, partner, vriend, buur], gewichten: {} } },

    // Andersom: de vriend betaalt, ik doe mee. Pay streept dat weg tegen het
    // abonnement hierboven.
    { naam: 'Muziekdienst', bedrag: 1200, categorie: 'streaming',
      notitie: 'Van de vriend; ik betaal mijn helft.',
      betaler: { soort: 'persoon', id: vriend },
      verdeling: { soort: 'gelijk', deelnemers: [ik, vriend], gewichten: {} } },

    // Vier delen bankkosten, waarvan er één zakelijk is. Dat kwart draagt de
    // zaak, niet jij privé — en de zaak maakt het gewoon over.
    { naam: 'Bankkosten', bedrag: 1600, categorie: 'overig',
      betaler: { soort: 'rekening', id: vast },
      verdeling: { soort: 'delen', deelnemers: [], gewichten: { [ik]: 2, [partner]: 1, [`rekening:${zaak}`]: 1 } } },

    { naam: 'Sportclub', bedrag: 2500, categorie: 'gezondheid',
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
