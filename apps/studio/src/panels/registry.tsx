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
import { useExplore } from "../stores/explore";
import { extraPanels } from "virtual:propel-extensions";
import { visPanels } from "../vis/registry";
import { withPanelErrorBoundary } from "./PanelErrorBoundary";
import { REPLACED, tabbedPanels, tabOf } from "./tabbed";
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
const BASE_PANELS: PanelDefinition[] = [...CORE_PANELS, ...extraPanels];

export const PANEL_REGISTRY: PanelDefinition[] = [
  ...BASE_PANELS,
  ...tabbedPanels((type) => BASE_PANELS.find((p) => p.type === type)),
].sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));

export function getPanelByType(type: string): PanelDefinition | undefined {
  return PANEL_REGISTRY.find((p) => p.type === type);
}

/** Panels offered in the gallery / command palette: no internal ones, and a view that is a tab of
 *  another panel only through that panel. */
export const VISIBLE_PANELS = PANEL_REGISTRY.filter(
  (p) => !p.hidden && !tabOf(p.type) && !REPLACED.has(p.type),
);

/**
 * Add a panel to the active dockview. Shared by every surface that adds panels
 * (TopBar "Add panel", gallery, command palette, empty-state) so new entry
 * points need no extra wiring.
 */
export function addPanelToDockview(
  type: string,
  title?: string,
  /** Initial dockview params, read back by `usePanelState`/`usePanelDraft` -- how a panel can be
   *  opened already pointed at something, e.g. a blueprint with a connection filled in. */
  params?: Record<string, unknown>,
) {
  const api = getDockviewApi();
  if (!api) {
    console.warn(`addPanelToDockview("${type}"): dockview api not ready; panel not added`);
    return;
  }
  // A view that lives in a tabbed panel opens that panel on its tab.
  const member = tabOf(type);
  const component = member?.group ?? type;
  const def = getPanelByType(component);
  useExplore.getState().setOpen(false);
  // A tab's own settings live under `tab.<id>`; only the dataset is the group's.
  const { datasetId, ...own } = params ?? {};
  api.addPanel({
    id: `${component}-${Date.now()}`,
    title: title ?? def?.name ?? component,
    component,
    params: member
      ? { ...(datasetId !== undefined ? { datasetId } : {}), tab: member.tab, [`tab.${member.tab}`]: own }
      : params,
  });
}

/** Dockview `components` map: every registry panel keyed by its type. */
export function panelComponents(): Record<string, PanelDefinition["component"]> {
  const out: Record<string, PanelDefinition["component"]> = {};
  for (const p of PANEL_REGISTRY) out[p.type] = withPanelErrorBoundary(p.component);
  return out;
}

export type { PanelCategory };
