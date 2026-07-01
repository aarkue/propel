import {
  PiChartBar,
  PiCheckCircle,
  PiClockCountdown,
  PiGraph,
  PiInfo,
  PiPlusCircle,
  PiPuzzlePiece,
  PiShuffle,
  PiStack,
} from "react-icons/pi";
import { getDockviewApi } from "../shell/dockviewApi";
import { extraPanels } from "virtual:propel-extensions";
import { visPanels } from "../vis/registry";
import type { PanelCategory, PanelCategoryMeta, PanelDefinition } from "./types";

export * from "./types";

export const PANEL_CATEGORIES: PanelCategoryMeta[] = [
  { id: "create", label: "Create", icon: PiPlusCircle },
  { id: "overview", label: "Log Overview", icon: PiInfo },
  { id: "time", label: "Time & Performance", icon: PiClockCountdown },
  { id: "variants", label: "Variants", icon: PiShuffle },
  { id: "activities", label: "Activities", icon: PiChartBar },
  { id: "models", label: "Models", icon: PiGraph },
  { id: "conformance", label: "Conformance", icon: PiCheckCircle },
  { id: "ocel", label: "Object-Centric", icon: PiStack },
  { id: "transforms", label: "Transforms", icon: PiPuzzlePiece },
];

// Every visualization is one `vis/<id>.tsx` exporting `const vis = defineVis(...)`. The vis registry
// fans each into its panel side (here) and viewer side (viewer-registry). `order` gives a stable
// gallery/palette sort independent of glob iteration.
const CORE_PANELS: PanelDefinition[] = [...visPanels].sort(
  (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER),
);

/**
 * Core panels plus any injected via `virtual:propel-extensions`.
 */
export const PANEL_REGISTRY: PanelDefinition[] = [...CORE_PANELS, ...extraPanels];

export function getPanelByType(type: string): PanelDefinition | undefined {
  return PANEL_REGISTRY.find((p) => p.type === type);
}

/** Panels offered in the gallery / command palette (excludes internal ones). */
export const VISIBLE_PANELS = PANEL_REGISTRY.filter((p) => !p.hidden);

/**
 * Add a panel to the active dockview. Shared by every surface that adds panels
 * (TopBar "Add panel", gallery, command palette, empty-state) so new entry
 * points need no extra wiring.
 */
export function addPanelToDockview(type: string, title?: string) {
  const api = getDockviewApi();
  if (!api) {
    console.warn(`addPanelToDockview("${type}"): dockview api not ready; panel not added`);
    return;
  }
  const def = getPanelByType(type);
  api.addPanel({ id: `${type}-${Date.now()}`, title: title ?? def?.name ?? type, component: type });
}

/** Dockview `components` map: every registry panel keyed by its type. */
export function panelComponents(): Record<string, PanelDefinition["component"]> {
  const out: Record<string, PanelDefinition["component"]> = {};
  for (const p of PANEL_REGISTRY) out[p.type] = p.component;
  return out;
}

export type { PanelCategory };
