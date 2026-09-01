// Categories for expenses. Deliberately short: nobody fills in a list of thirty
// boxes consistently, and then the breakdown by category stops meaning anything.
//
// Every category has a colour instead of an icon. One coloured dot next to the
// name is enough to scan a list by, and it stays calm.

export const CATEGORIES = [
  { id: 'housing', label: 'Wonen', colour: '#6b5bd2' },
  { id: 'utilities', label: 'Energie & water', colour: '#2f80c4' },
  { id: 'insurance', label: 'Verzekeringen', colour: '#1f7a68' },
  { id: 'telecom', label: 'Internet & telefoon', colour: '#2aa3a3' },
  { id: 'media', label: 'Streaming & media', colour: '#c2554d' },
  { id: 'software', label: 'Software & diensten', colour: '#8a5cc4' },
  { id: 'transport', label: 'Vervoer', colour: '#b07a1e' },
  { id: 'groceries', label: 'Boodschappen', colour: '#5d8a2b' },
  { id: 'health', label: 'Gezondheid & sport', colour: '#c26a9a' },
  { id: 'charity', label: 'Goede doelen', colour: '#c98a2e' },
  { id: 'tax', label: 'Belastingen & heffingen', colour: '#7a6a5a' },
  { id: 'other', label: 'Overig', colour: '#8a9099' },
];

export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES.at(-1);

export const ACCOUNT_KINDS = [
  {
    id: 'shared',
    label: 'Gezamenlijk',
    blurb: 'Een pot waar meerdere mensen op storten en waar de gedeelde lasten van af gaan.',
  },
  {
    id: 'personal',
    label: 'Privé',
    blurb: 'Van één persoon. Wat anderen daarvan meegebruiken, staat bij die persoon in het krijt.',
  },
  {
    id: 'business',
    label: 'Zakelijk',
    blurb: 'Ook van één persoon, maar apart geteld — handig voor je boekhouding.',
  },
];

export const accountKindOf = (id) => ACCOUNT_KINDS.find((k) => k.id === id) || ACCOUNT_KINDS[1];

// Colours for people: dark enough for white initials on top, and easy to tell
// apart from each other.
export const COLOURS = [
  '#0d6e5c', '#2f5fa8', '#9a4f2c', '#7a4a8f', '#4a6b1f', '#a53a4a', '#3f5c66', '#8a6b1a',
];
