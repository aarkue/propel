import { type KindColor, kindColor, kindLabel } from "@r4pm/components";

/** The accent-color union accepted by Radix `Badge`/`Text` etc. */
export type AccentColor = KindColor;

/** Friendly display label for a registry or artifact kind (the slim OCEL shows as "OCEL"). */
export const labelForKind = kindLabel;

/** Stable accent color for a kind, shared by chips, gallery badges and dataset pickers. */
export const colorForKind = kindColor;
