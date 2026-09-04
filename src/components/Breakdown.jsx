// Any number on the overview, taken apart.
//
// Every figure there is a sum of expenses, and a sum you cannot open is a
// number you have to trust. This is the same shape for all of them: what it
// adds up to, the rows it is made of, and a sentence on what the number means.

import { Sheet, Line, Total } from './ui.jsx';
import { formatMoney } from '../lib/money.js';

export default function Breakdown({ title, label, cents, rows, note = null, empty = null, onClose }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="headline">
        <div className="label">{label}</div>
        <div className="figure">{formatMoney(cents)}</div>
      </div>

      {rows.length > 0 ? (
        <div className="panel">
          {rows.map((row) => (
            <Line
              key={row.key}
              left={row.left}
              what={row.what}
              sub={row.sub}
              cents={row.cents}
              tone={row.tone}
            />
          ))}
          {/* The headline says what the figure is; the row under the list only
              has to say that this is all of it. */}
          <Total label="Samen" cents={cents} />
        </div>
      ) : (
        <div className="panel">
          <div className="box">
            <div className="small muted">{empty || 'Hier zit niets in.'}</div>
          </div>
        </div>
      )}

      {note && <div className="hint" style={{ marginTop: 14 }}>{note}</div>}
    </Sheet>
  );
}
