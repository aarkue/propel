import type { ReturnTypeTitle } from "@r4pm/client";
import type { ComponentType } from "react";
import type { ViewerProps } from "@r4pm/components";

export { resolveViewerForReturnType, resolveAllViewersForReturnType } from "./resolve";

/** Context the registry matches a viewer against. */
export interface ViewerMatch {
  /** The binding's return-type title. Compare against `RETURN_TYPES` from `@r4pm/client` so a
   *  Rust rename is a compile error rather than a silent match failure. */
  returnType: ReturnTypeTitle | (string & {});
  /** The binding that produced the value, when known. Lets a viewer match on provenance (e.g. a
   *  generic `string[]` renderer that only claims activity lists), not just the structural type. */
  sourceBindingId?: string;
}

/** A self-describing visualization. One def, mounted anywhere (panel, pipeline node, standalone). */
export interface ViewerDef<T = unknown> {
  id: string;
  title: string;
  /** Whether this viewer can render a given binding result. */
  accepts: (m: ViewerMatch) => boolean;
  /** Tie-break when several viewers accept the same match: higher wins (default 0). The JSON
   *  fallback uses a large negative value so any specific viewer beats it. */
  priority?: number;
  component: ComponentType<ViewerProps<T>>;
}

/** Identity helper that preserves the generic param for typed authoring. */
export const defineViewer = <T>(v: ViewerDef<T>): ViewerDef<T> => v;

/** Registry of viewers; shared by the app shell and the pipeline editor. */
export class ViewerRegistry {
  private viewers: ViewerDef<any>[] = [];

  register(...defs: ViewerDef<any>[]): this {
    for (const d of defs) {
      if (this.viewers.some((v) => v.id === d.id)) {
        console.warn(`ViewerRegistry: duplicate viewer id "${d.id}"; id-based selection may be ambiguous`);
      }
    }
    this.viewers.push(...defs);
    return this;
  }

  /** Highest-priority viewer that accepts the match (ties keep registration order). */
  resolve(m: ViewerMatch): ViewerDef<any> | undefined {
    let best: ViewerDef<any> | undefined;
    let bestPriority = -Infinity;
    for (const v of this.viewers) {
      if (!v.accepts(m)) continue;
      const p = v.priority ?? 0;
      if (p > bestPriority) {
        best = v;
        bestPriority = p;
      }
    }
    return best;
  }

  all(): readonly ViewerDef<any>[] {
    return this.viewers;
  }
}
