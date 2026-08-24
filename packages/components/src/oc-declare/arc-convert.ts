import type { OCDeclareArc, OCDeclareArcLabel, ObjectTypeAssociation } from "./index";
import type { ArcType, ConstraintLabel, ObjectTypeRef, RawConstraint } from "./types";

/**
 * Backend association -> viz ref. `object_type` stays the single type everything downstream keys
 * colour and visibility off, which for an O2O association is its `first`. The relation itself is
 * carried alongside, which lets an O2O be drawn as what it is instead of passing for a plain
 * involvement in `first`.
 */
export function normalizeAssoc(assocs: ObjectTypeAssociation[]): ObjectTypeRef[] {
  return assocs.map((a) =>
    a.type === "Simple"
      ? { object_type: a.object_type, type: "Simple" }
      : { object_type: a.first, type: "O2O", first: a.first, second: a.second, reversed: a.reversed },
  );
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
