import { colorToHex, type ThemeColor } from "../dfg/util/colors";
import type { MoveKind } from "./TraceAlignmentStrip";

/** One vocabulary for alignment moves across the conformance views: a plain name, the technical
 *  term, its color, and what it means for `subject` (a case or an object). */
export const MOVE_TERMS: Record<
  MoveKind,
  { name: string; term: string; color: ThemeColor; explain: (subject: string) => string }
> = {
  sync: {
    name: "fits",
    term: "sync move",
    color: "green",
    explain: (s) => `The ${s}'s event matches a step of the model.`,
  },
  model: {
    name: "missing event",
    term: "model move",
    color: "orange",
    explain: (s) => `The model requires this step here, but the ${s} has no event for it.`,
  },
  log: {
    name: "extra event",
    term: "log move",
    color: "amber",
    explain: (s) => `The ${s} has an event that the model does not allow at this point.`,
  },
};

/** A move kind's color as `#rrggbb`, which SVG exports and canvases take. */
export const moveColor = (kind: MoveKind) => colorToHex(MOVE_TERMS[kind].color);

/** "missing event (model move)" */
export const moveLabel = (kind: MoveKind) => `${MOVE_TERMS[kind].name} (${MOVE_TERMS[kind].term})`;
