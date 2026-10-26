// The involvement strip under an activity's name holds at most two rows. The rest of its object
// types go into a "+k" chip. Widths and packing match rust4pm's export (`involvement_strip` in its
// visualization/oc_declare.rs), so the screen and the export show the same types.

/** Room for the strip inside a 150px node. */
const USABLE = 134;
const GAP = 6;
const ROWS = 2;
/** A disc's diameter and the offset of each further disc in a cluster of three. */
const DISC = 2 * 4.33;
const DISC_STEP = 3.1;
/** At 9px. */
const CHAR = 5.4;
const NAME_MAX = 52;
const CARD = 18;

export type StripLabels = "dots" | "names";

function itemWidth(t: { name: string; many: boolean }, labels: StripLabels): number {
  if (labels === "dots") return DISC + (t.many ? 2 * DISC_STEP : 0);
  return Math.min(t.name.length * CHAR, NAME_MAX) + 2 + CARD;
}

const plusWidth = (hidden: number) => `+${hidden}`.length * CHAR + 2;

/** The widths packed greedily into rows of at most `USABLE`, as indices per row. */
function packRows(widths: number[]): number[][] {
  const rows: number[][] = [];
  let row = 0;
  widths.forEach((w, i) => {
    const last = rows[rows.length - 1];
    if (last && row + GAP + w <= USABLE) {
      last.push(i);
      row += GAP + w;
    } else {
      rows.push([i]);
      row = w;
    }
  });
  return rows;
}

/** The rows of `types` the strip shows, as indices, and how many the "+k" chip stands for. */
export function stripFit(
  types: { name: string; many: boolean }[],
  labels: StripLabels,
): { rows: number[][]; hidden: number } {
  const widths = types.map((t) => itemWidth(t, labels));
  const all = packRows(widths);
  if (all.length <= ROWS) return { rows: all, hidden: 0 };
  for (let shown = types.length - 1; shown > 0; shown--) {
    const hidden = types.length - shown;
    if (packRows([...widths.slice(0, shown), plusWidth(hidden)]).length <= ROWS) {
      return { rows: packRows(widths.slice(0, shown)), hidden };
    }
  }
  return { rows: [], hidden: types.length };
}
