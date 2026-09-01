// Geld is altijd een geheel aantal centen. Nooit een kommagetal: 0.1 + 0.2 is
// in JavaScript niet 0.3, en een boekhouding die een halve cent kan verliezen is
// geen boekhouding.

/**
 * Leest een bedrag zoals iemand het intikt en geeft centen terug.
 *
 * Nederlands en Engels door elkaar is de regel, niet de uitzondering: je plakt
 * "1.234,56" uit je bankafschrift en "12.50" uit een Engelse factuur. Daarom
 * kijken we naar het láátste scheidingsteken en tellen we de cijfers erachter:
 * één of twee cijfers is een komma, precies drie is een duizendtalpunt.
 */
export function parseGeld(invoer) {
  if (typeof invoer === 'number') return Math.round(invoer * 100);
  const ruw = String(invoer ?? '').trim();
  if (!ruw) return null;

  const negatief = /^-|^\(.*\)$/.test(ruw);
  const schoon = ruw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(schoon)) return null;

  const kommas = (schoon.match(/,/g) || []).length;
  const punten = (schoon.match(/\./g) || []).length;
  const laatste = Math.max(schoon.lastIndexOf(','), schoon.lastIndexOf('.'));

  let heel = schoon;
  let deel = '';

  if (laatste !== -1) {
    const teken = schoon[laatste];
    const voor = schoon.slice(0, laatste);
    const achter = schoon.slice(laatste + 1);
    const alleenDitTeken = teken === ',' ? punten === 0 : kommas === 0;
    const aantalHier = teken === ',' ? kommas : punten;

    // Staan er allebei de tekens in, dan is de laatste de komma en de andere de
    // duizendtalscheiding — zo lezen "1.234,56" en "1,234.56" allebei goed.
    // Staat er maar één soort en meer dan één keer, dan is het groepering.
    // Blijft over: één enkel teken. Een komma is dan de decimale komma, want zo
    // schrijven we het hier; een punt alleen met drie cijfers erachter (en een
    // geldige groep ervoor) is een duizendtal, anders ook een komma.
    const heleReeks = new RegExp(`^[1-9]\\d{0,2}(\\${teken}\\d{3})+$`);
    const groepering =
      alleenDitTeken &&
      ((aantalHier > 1 && heleReeks.test(schoon)) ||
        (aantalHier === 1 && teken === '.' && achter.length === 3 && /^[1-9]\d{0,2}$/.test(voor)));

    if (!groepering) {
      heel = voor;
      deel = achter;
    }
  }

  heel = heel.replace(/[.,]/g, '') || '0';
  const centen = Math.round(Number(`${heel}.${deel || '0'}`) * 100);
  if (!Number.isFinite(centen)) return null;
  return negatief ? -centen : centen;
}

const NL = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Centen als bedrag. Zelf opgemaakt en niet via Intl, zodat de uitvoer overal
 * hetzelfde is — ook in een testrunner zonder volledige taalgegevens.
 */
export function toonGeld(centen, { teken = true, cijfers = 2 } = {}) {
  if (centen == null || !Number.isFinite(centen)) return teken ? '€ –' : '–';
  const negatief = centen < 0;
  const abs = Math.abs(Math.round(centen));
  const heel = NL(Math.floor(abs / 100));
  const rest = String(abs % 100).padStart(2, '0');
  const getal = cijfers === 0 ? heel : `${heel},${rest}`;
  return `${negatief ? '−' : ''}${teken ? '€ ' : ''}${getal}`;
}

/** Kort, voor in een tabel: € 1.234 zonder centen als het rond is. */
export function toonKort(centen) {
  if (centen == null) return '€ –';
  return centen % 100 === 0 ? toonGeld(centen, { cijfers: 0 }) : toonGeld(centen);
}

/** Bedrag zoals het in een invoerveld hoort te staan (zonder euroteken). */
export function alsInvoer(centen) {
  if (centen == null) return '';
  return toonGeld(centen, { teken: false }).replace('−', '-');
}
