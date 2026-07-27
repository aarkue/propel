// Self-contained types for the OC-DECLARE viz component; do not import from outside this folder.

export type ArcType = "AS" | "EF" | "EP" | "DF" | "DP";

/** Rendered arc type: the backend's five arc types plus synthetic "EFEP"/"DFDP" from pair-collapsing. */
export type RenderArcType = ArcType | "EFEP" | "DFDP";

export interface ObjectTypeRef {
  /** Name of the object type (used as the key for color lookup). */
  object_type: string;
  /** Kind of association ("Simple" | "O2O"). Only `object_type` is rendered. */
  type?: string;
}

export interface ConstraintLabel {
  each: ObjectTypeRef[];
  any: ObjectTypeRef[];
  all: ObjectTypeRef[];
}

/** Structural shape of a constraint arc. Matches the backend's `OCDeclareArc`. */
export interface RawConstraint {
  from: string;
  to: string;
  arc_type: ArcType;
  counts: [number, number | null];
  label: ConstraintLabel;
}

export interface ActivityNodeData {
  label: string;
  /** Object types this activity is involved with in the OCEL, with per-event min/max counts (from `get_ocel_activity_object_involvements`). */
  objectTypes: { name: string; min: number; max: number }[];
  [key: string]: unknown;
}

export interface ConstraintEdgeData {
  arcType: RenderArcType;
  counts: [number, number | null];
  label: ConstraintLabel;
  bundleIndex: number;
  bundleTotal: number;
  constraintIndex: number;
  /** Evaluation result for this arc (fraction of violating situations), when evaluated. */
  violation?: number;
  /** For a render-layer collapsed EFEP/DFDP arc: the two underlying model-edge ids it stands for
   *  (`forward` = EF/DF, `backward` = EP/DP). Absent on plain single arcs. */
  pair?: { forward: string; backward: string };
  /** Per-direction evaluation results for a collapsed arc (mirrors {@link pair}). */
  pairViolation?: { forward?: number; backward?: number };
  /** Routed polyline vertices (Rust engine), drawn as a rounded polyline. */
  routedPoints?: { x: number; y: number }[];
  routedPath?: string;
  /** Node positions captured at layout time, used to detect drag and deform. */
  layoutSourcePos?: { x: number; y: number };
  layoutTargetPos?: { x: number; y: number };
  [key: string]: unknown;
}

// Palette, cycled for object types without a hardcoded color.
const COLOR_PALETTE = [
  "#2563EB", // blue
  "#16A34A", // green
  "#9333EA", // purple
  "#EA580C", // orange
  "#DC2626", // red
  "#0891B2", // cyan
  "#D97706", // amber
  "#7C3AED", // violet
  "#059669", // emerald
  "#E11D48", // rose
  "#4F46E5", // indigo
  "#CA8A04", // yellow
];

const HARDCODED_COLORS: Record<string, string> = {
  customers: "#379908",
  orders: "#1370bd",
  items: "#ff5f37",
  employees: "#fb3699",
};

export function generateObjectTypeColors(names: string[]): Record<string, string> {
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  const colors: Record<string, string> = {};
  let paletteIdx = 0;
  for (const name of sorted) {
    if (HARDCODED_COLORS[name]) {
      colors[name] = HARDCODED_COLORS[name];
    } else {
      colors[name] = COLOR_PALETTE[paletteIdx % COLOR_PALETTE.length];
      paletteIdx++;
    }
  }
  return colors;
}

/** Canonical string for a constraint label, used to decide whether two constraints share the same object involvement (sorted, so order-insensitive). */
export function labelKey(label: ConstraintLabel): string {
  const part = (refs: ObjectTypeRef[]) =>
    refs
      .map((r) => r.object_type)
      .filter(Boolean)
      .sort()
      .join(",");
  return `${part(label.each)}|${part(label.any)}|${part(label.all)}`;
}

/** Merge complementary pairs: an EF A->B and EP B->A with the same label collapse into one "EFEP" arc (same for DF/DP -> "DFDP"), keeping the EF/DF direction. */
export function collapseEfEpPairs(constraints: RawConstraint[]): RawConstraint[] {
  const index = new Map<string, number>(); // key -> constraints idx
  const consumed = new Set<number>();
  const out: RawConstraint[] = [];

  const keyOf = (from: string, to: string, at: ArcType, lk: string) => `${at}|${from}|${to}|${lk}`;

  constraints.forEach((c, i) => {
    index.set(keyOf(c.from, c.to, c.arc_type, labelKey(c.label)), i);
  });

  for (let i = 0; i < constraints.length; i++) {
    if (consumed.has(i)) continue;
    const c = constraints[i];
    const lk = labelKey(c.label);
    if (c.arc_type === "EF" || c.arc_type === "DF") {
      const backType: ArcType = c.arc_type === "EF" ? "EP" : "DP";
      const back = index.get(keyOf(c.to, c.from, backType, lk));
      if (back !== undefined && !consumed.has(back)) {
        consumed.add(i);
        consumed.add(back);
        out.push({
          ...c,
          arc_type: (c.arc_type === "EF" ? "EFEP" : "DFDP") as ArcType,
        });
        continue;
      }
    }
    if (c.arc_type === "EP" || c.arc_type === "DP") {
      const fwdType: ArcType = c.arc_type === "EP" ? "EF" : "DF";
      if (index.has(keyOf(c.to, c.from, fwdType, lk))) {
        // Its counterpart (already visited or about to be) will pick it up.
        continue;
      }
    }
    out.push(c);
  }
  return out;
}

export function collectObjectTypes(constraints: RawConstraint[]): string[] {
  const seen = new Set<string>();
  for (const c of constraints) {
    for (const refs of [c.label.each, c.label.any, c.label.all]) {
      for (const ref of refs) {
        if (ref.object_type) seen.add(ref.object_type);
      }
    }
  }
  return Array.from(seen).sort();
}
