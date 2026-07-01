import type { Badge } from "@r4pm/components/ui";
import type { ComponentProps } from "react";

/** The accent-color union accepted by Radix `Badge`/`Text` etc. */
export type AccentColor = NonNullable<ComponentProps<typeof Badge>["color"]>;

/**
 * Stable accent color for a registry kind, used by dataset chips and gallery
 * badges. Known kinds get curated colors; any other kind hashes into a palette
 * so new registry kinds get a consistent color without a code change.
 */
const KIND_COLORS: Record<string, AccentColor> = {
  EventLog: "green",
  OCEL: "plum",
  SlimLinkedOCEL: "plum",
  IndexLinkedOCEL: "plum",
  PetriNet: "blue",
};

const PALETTE: AccentColor[] = ["indigo", "cyan", "teal", "amber", "tomato", "crimson", "grass", "orange"];

/** Friendly display label for a registry kind (the canonical slim OCEL shows as "OCEL"). */
const KIND_LABELS: Record<string, string> = {
  SlimLinkedOCEL: "OCEL",
  IndexLinkedOCEL: "OCEL",
};
export function labelForKind(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

export function colorForKind(kind: string): AccentColor {
  const known = KIND_COLORS[kind];
  if (known) return known;
  let h = 0;
  for (let i = 0; i < kind.length; i++) h = (h * 31 + kind.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
