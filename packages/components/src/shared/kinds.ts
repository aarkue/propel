import type { Badge } from "@r4pm/components/ui";
import type { ComponentProps } from "react";

export type KindColor = NonNullable<ComponentProps<typeof Badge>["color"]>;

const KIND_LABEL: Record<string, string> = {
  EventLog: "Event log",
  OCEL: "OCEL",
  SlimLinkedOCEL: "OCEL",
  IndexLinkedOCEL: "OCEL",
  EventLogActivityProjection: "Activity projection",
  AcceptingPetriNet: "Petri net",
  ProcessTree: "Process tree",
  ObjectCentricPetriNet: "OCPN",
  OCDeclare: "OC-DECLARE",
  ReflowMapping: "Reflow mapping",
};

// Off the indigo app accent, so a badge stays legible on an accent-highlighted (blue) row too.
const KIND_COLOR: Record<string, KindColor> = {
  EventLog: "amber",
  OCEL: "jade",
  SlimLinkedOCEL: "jade",
  IndexLinkedOCEL: "jade",
  AcceptingPetriNet: "sky",
  ProcessTree: "grass",
  ObjectCentricPetriNet: "teal",
  OCDeclare: "plum",
  ReflowMapping: "violet",
};

const FALLBACK_COLORS: KindColor[] = ["tomato", "cyan", "plum", "orange", "grass", "pink", "ruby", "teal"];

/** Display name of an engine kind (registry kind or propel artifact kind). */
export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

/** Stable badge color of an engine kind; unknown kinds hash into a fixed palette. */
export function kindColor(kind: string): KindColor {
  const known = KIND_COLOR[kind];
  if (known) return known;
  let h = 0;
  for (let i = 0; i < kind.length; i++) h = (h * 31 + kind.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}
