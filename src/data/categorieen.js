// Categorieën voor posten. Bewust kort: een lijst van dertig vakjes vult
// niemand consequent in, en dan zegt de verdeling per categorie niets meer.

export const CATEGORIEEN = [
  { id: 'wonen', label: 'Wonen', emoji: '🏠' },
  { id: 'nuts', label: 'Energie & water', emoji: '⚡️' },
  { id: 'verzekering', label: 'Verzekeringen', emoji: '🛡️' },
  { id: 'telecom', label: 'Internet & telefoon', emoji: '📶' },
  { id: 'streaming', label: 'Streaming & media', emoji: '📺' },
  { id: 'software', label: 'Software & diensten', emoji: '💻' },
  { id: 'vervoer', label: 'Vervoer', emoji: '🚗' },
  { id: 'boodschappen', label: 'Boodschappen', emoji: '🛒' },
  { id: 'gezondheid', label: 'Gezondheid & sport', emoji: '🩺' },
  { id: 'goede-doelen', label: 'Goede doelen', emoji: '🤲' },
  { id: 'overig', label: 'Overig', emoji: '📄' },
];

export const categorieVan = (id) =>
  CATEGORIEEN.find((c) => c.id === id) || CATEGORIEEN.at(-1);

export const SOORTEN_REKENING = [
  { id: 'gezamenlijk', label: 'Gezamenlijk', emoji: '🤝',
    blurb: 'Een pot waar meerdere mensen op storten en waar de gedeelde lasten van af gaan.' },
  { id: 'prive', label: 'Privé', emoji: '👤',
    blurb: 'Van één persoon. Wat anderen daarvan meegebruiken, staat bij die persoon in het krijt.' },
  { id: 'zakelijk', label: 'Zakelijk', emoji: '🧑‍💼',
    blurb: 'Ook van één persoon, maar apart geteld — handig voor je boekhouding.' },
];

export const soortVan = (id) =>
  SOORTEN_REKENING.find((s) => s.id === id) || SOORTEN_REKENING[1];

export const KLEUREN = ['#1f6f5c', '#8a5b2b', '#3a5f8c', '#7a3f6d', '#4f6f2c', '#a4342a', '#5c5f6b'];

export const EMOJI_KEUZE = ['🙂', '😎', '🐈', '🦊', '🐙', '🌻', '⚓️', '🎧', '🧗', '🍀', '🚲', '☕️'];
