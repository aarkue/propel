import type { PanelDefinition } from "../panels/types";
import type { ViewerDef } from "../viewers";
import { viewerRegistry } from "../panels/viewer-registry";
import type { VisDefinition } from "./define-vis";

// Auto-collected: every `vis/<id>.tsx` exports `const vis = defineVis(...)`. Each yields a panel
// side and/or a viewer side; the panel/viewer registries fan these out. Adding a visualization is
// one new file here.
const modules = import.meta.glob<{ vis: VisDefinition }>(["./*.tsx", "!./define-vis.tsx", "!./_*.tsx"], {
  eager: true,
});

const defs: VisDefinition[] = Object.values(modules)
  .map((m) => m.vis)
  .filter((v): v is VisDefinition => !!v);

export const visPanels: PanelDefinition[] = defs.map((d) => d.panel).filter((p): p is PanelDefinition => !!p);
export const visViewers: ViewerDef[] = defs.map((d) => d.viewer).filter((v): v is ViewerDef => !!v);

// Register the per-viz viewers into the shared registry HERE (not in viewer-registry.ts) so that
// module has no edge back to this glob,
// breaking the initialization cycle.
viewerRegistry.register(...visViewers);
