import type { OCDeclareArc, OCDeclareArcLabel, ObjectTypeAssociation } from "./index";
import type { ArcType, ConstraintLabel, RawConstraint } from "./types";

/** O2O associations collapse to their `first` object type for visualization (display-only). */
export function normalizeAssoc(assocs: ObjectTypeAssociation[]) {
  return assocs.map((a) => (a.type === "Simple" ? { object_type: a.object_type } : { object_type: a.first }));
}

/** Backend (tagged, O2O-lossless) label -> viz `ConstraintLabel` (object_type only). Display-only. */
export function normalizeLabel(label: OCDeclareArcLabel): ConstraintLabel {
  return {
    each: normalizeAssoc(label.each),
    any: normalizeAssoc(label.any),
    all: normalizeAssoc(label.all),
  };
}

/** Convert a backend `OCDeclareArc` into a viz-ready `RawConstraint`. */
export function toRawConstraint(arc: OCDeclareArc): RawConstraint {
  return {
    from: (arc.from as unknown as string) ?? "",
    to: (arc.to as unknown as string) ?? "",
    arc_type: arc.arc_type as ArcType,
    counts: arc.counts as [number, number | null],
    label: normalizeLabel(arc.label),
  };
}
