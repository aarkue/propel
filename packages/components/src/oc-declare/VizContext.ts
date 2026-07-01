import { createContext, useContext } from "react";

/** Resolve a name (activity or object type) to a hex color. */
export type ColorResolver = (name: string, mode?: "normal" | "foreground" | "light") => string;

interface VizContextValue {
  /** Resolver for activity colors, provided by the host app (e.g. a persisted store). */
  activityColor: ColorResolver;
  /** Resolver for object-type colors, usually backed by the same store as activities. */
  objectTypeColor: ColorResolver;
  /** Set of currently hidden object types (constraints touching only these are hidden). */
  hiddenObjectTypes: Set<string>;
  /** Set of currently hidden arc types. */
  hiddenArcTypes: Set<string>;
  /** Currently focused node id (click-to-focus), or null. */
  focusedNodeId: string | null;
  /** Currently hovered node id, or null. */
  hoveredNodeId: string | null;
  /** Event-type occurrence counts from the OCEL (activity -> count). */
  eventTypeCounts: Record<string, number>;
}

const neutralResolver: ColorResolver = () => "#6b7280";

const VizContext = createContext<VizContextValue>({
  activityColor: neutralResolver,
  objectTypeColor: neutralResolver,
  hiddenObjectTypes: new Set(),
  hiddenArcTypes: new Set(),
  focusedNodeId: null,
  hoveredNodeId: null,
  eventTypeCounts: {},
});

export const VizProvider = VizContext.Provider;

export function useVizContext() {
  return useContext(VizContext);
}
