// Categorieën voor posten. Bewust kort: een lijst van dertig vakjes vult
// niemand consequent in, en dan zegt de verdeling per categorie niets meer.
//
// Elke categorie heeft een kleur in plaats van een plaatje. Eén gekleurde stip
// naast de naam is genoeg om een lijst te kunnen scannen, en het blijft rustig.

export const CATEGORIEEN = [
  { id: 'wonen', label: 'Wonen', kleur: '#6b5bd2' },
  { id: 'nuts', label: 'Energie & water', kleur: '#2f80c4' },
  { id: 'verzekering', label: 'Verzekeringen', kleur: '#1f7a68' },
  { id: 'telecom', label: 'Internet & telefoon', kleur: '#2aa3a3' },
  { id: 'streaming', label: 'Streaming & media', kleur: '#c2554d' },
  { id: 'software', label: 'Software & diensten', kleur: '#8a5cc4' },
  { id: 'vervoer', label: 'Vervoer', kleur: '#b07a1e' },
  { id: 'boodschappen', label: 'Boodschappen', kleur: '#5d8a2b' },
  { id: 'gezondheid', label: 'Gezondheid & sport', kleur: '#c26a9a' },
  { id: 'goede-doelen', label: 'Goede doelen', kleur: '#c98a2e' },
  { id: 'belasting', label: 'Belastingen & heffingen', kleur: '#7a6a5a' },
  { id: 'overig', label: 'Overig', kleur: '#8a9099' },
];

export const categorieVan = (id) => CATEGORIEEN.find((c) => c.id === id) || CATEGORIEEN.at(-1);

export const SOORTEN_REKENING = [
  {
    id: 'gezamenlijk',
    label: 'Gezamenlijk',
    blurb: 'Een pot waar meerdere mensen op storten en waar de gedeelde lasten van af gaan.',
  },
  {
    id: 'prive',
    label: 'Privé',
    blurb: 'Van één persoon. Wat anderen daarvan meegebruiken, staat bij die persoon in het krijt.',
  },
  {
    id: 'zakelijk',
    label: 'Zakelijk',
    blurb: 'Ook van één persoon, maar apart geteld — handig voor je boekhouding.',
  },
];

export const soortVan = (id) => SOORTEN_REKENING.find((s) => s.id === id) || SOORTEN_REKENING[1];

// Kleuren voor personen: donker genoeg voor witte initialen erop, en onderling
// goed uit elkaar te houden.
export const KLEUREN = [
  '#0d6e5c', '#2f5fa8', '#9a4f2c', '#7a4a8f', '#4a6b1f', '#a53a4a', '#3f5c66', '#8a6b1a',
];
