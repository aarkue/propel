import type { ComponentType } from "react";
import type { IDockviewPanelProps } from "dockview";
import type { IconType } from "react-icons";

// The panel contract. Extension panels injected via `virtual:propel-extensions`
// are typed against `PanelDefinition` (see vite-env.d.ts).

export type PanelCategory =
  | "create"
  | "overview"
  | "time"
  | "variants"
  | "activities"
  | "models"
  | "conformance"
  | "ocel"
  | "transforms";

export interface PanelDefinition {
  type: string;
  name: string;
  description: string;
  /** Sort key for gallery/palette ordering. Lower comes first; unset sorts last. */
  order?: number;
  /** Primary category; drives gallery sidebar grouping. */
  category: PanelCategory;
  /** Extra categories this panel also appears under. */
  tags?: PanelCategory[];
  icon: IconType;
  /** Engine kinds this panel needs; empty/undefined = always available. */
  supports?: string[];
  keywords?: string[];
  component: ComponentType<IDockviewPanelProps>;
  /** Internal panel kept out of the gallery/palette (e.g. the output viewer). */
  hidden?: boolean;
  /**
   * Whether the shell wraps this panel in the generic `ViewerExportFrame` (DOM-capture PNG).
   * Default true. Set false for interactive/non-viewer panels (pipeline, about) and viewers that
   * ship their own export (DFG/OC-DFG export SVG via their own control); those are still
   * exportable, just not via the generic frame.
   */
  genericExport?: boolean;
}

export interface PanelCategoryMeta {
  id: PanelCategory;
  label: string;
  icon: IconType;
}

/** True if the panel has no hard data requirement and should always show. */
export function panelHasNoRequirement(panel: PanelDefinition): boolean {
  return !panel.supports || panel.supports.length === 0;
}

/** True if the panel's category or any of its tags matches the filter. */
export function panelMatchesCategory(panel: PanelDefinition, cat: PanelCategory): boolean {
  return panel.category === cat || panel.tags?.includes(cat) === true;
}

/** True if the panel is usable given the set of currently-loaded object kinds. */
export function panelIsCompatible(panel: PanelDefinition, loadedKinds: Set<string>): boolean {
  if (!panel.supports || panel.supports.length === 0) return true;
  return panel.supports.some((kind) => loadedKinds.has(kind));
}
