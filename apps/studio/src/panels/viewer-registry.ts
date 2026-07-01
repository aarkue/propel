import { ViewerRegistry, type ViewerDef } from "../viewers";

/**
 * The propel viewer registry. It auto-collects the escape-hatch adapters in `apps/studio/src/viewers/`
 * (json fallback, fitness, oc-petri-net - pipeline-only renderers with no panel). The per-viz viewers
 * defined via `defineVis(...)` are registered from `vis/registry.ts` (NOT imported here) to avoid an
 * import cycle: `vis/viewer.tsx` + `vis/pipeline.tsx` import this registry, and the vis glob would
 * otherwise pull them back in during this module's evaluation.
 *
 * Resolution is by `priority` (see `ViewerRegistry.resolve`), not collection order, so the
 * `json-viewer` fallback (priority -1000) always loses to a specific viewer.
 */
const adapterModules = import.meta.glob<Record<string, unknown>>(
  [
    "../viewers/*.ts",
    "../viewers/*.tsx",
    "!../viewers/registry.ts",
    "!../viewers/resolve.ts",
    "!../viewers/index.ts",
    "!../viewers/registry.test.ts",
  ],
  { eager: true },
);

const isViewerDef = (v: unknown): v is ViewerDef =>
  typeof v === "object" && v !== null && "id" in v && "accepts" in v && "component" in v;

const viewerDefs = Object.values(adapterModules).flatMap((m) => Object.values(m).filter(isViewerDef));

export const viewerRegistry = new ViewerRegistry().register(...viewerDefs);
