// Categories for expenses.
//
// A category is a name, the same as a charge is a name — that is the whole
// point. Both are labels you put on an expense; they differ only in what they
// answer. What is this for, and which posts leave your account as one line.
// Making one a fixed list and the other free text made two mechanics out of one
// idea, and then nobody could say what the difference was.
//
// So these twelve are a starting set, not a closed one: they show up as
// suggestions on a fresh household and you can add or rename anything.
//
// A colour instead of an icon. One coloured dot next to the name is enough to
// scan a list by, and it stays calm.

export const SUGGESTED = [
  { name: 'Wonen', colour: '#6b5bd2' },
  { name: 'Energie & water', colour: '#2f80c4' },
  { name: 'Verzekeringen', colour: '#1f7a68' },
  { name: 'Internet & telefoon', colour: '#2aa3a3' },
  { name: 'Streaming & media', colour: '#c2554d' },
  { name: 'Software & diensten', colour: '#8a5cc4' },
  { name: 'Vervoer', colour: '#b07a1e' },
  { name: 'Boodschappen', colour: '#5d8a2b' },
  { name: 'Gezondheid & sport', colour: '#c26a9a' },
  { name: 'Goede doelen', colour: '#c98a2e' },
  { name: 'Belastingen & heffingen', colour: '#7a6a5a' },
  { name: 'Overig', colour: '#8a9099' },
];

// What earlier versions stored: an id per category. Kept so saved expenses keep
// their category, and written back as a name the first time one is saved.
const LEGACY = {
  housing: 'Wonen',
  utilities: 'Energie & water',
  insurance: 'Verzekeringen',
  telecom: 'Internet & telefoon',
  media: 'Streaming & media',
  software: 'Software & diensten',
  transport: 'Vervoer',
  groceries: 'Boodschappen',
  health: 'Gezondheid & sport',
  charity: 'Goede doelen',
  tax: 'Belastingen & heffingen',
  other: 'Overig',
};

const PALETTE = SUGGESTED.map((c) => c.colour);

/** A colour for a name you made up: the same one every time, for everyone. */
function colourFor(name) {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum = (sum * 31 + name.charCodeAt(i)) % 100000;
  return PALETTE[sum % PALETTE.length];
}

/** The name a stored value stands for. */
export const categoryName = (value) => {
  const raw = String(value ?? '').trim();
  return LEGACY[raw] || raw || 'Overig';
};

export function categoryOf(value) {
  const label = categoryName(value);
  return { label, colour: SUGGESTED.find((c) => c.name === label)?.colour || colourFor(label) };
}

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
