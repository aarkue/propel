import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  AttributeKind,
  AttributeLevel,
  AttributeScope,
  AttributeValues,
  BackendContext,
  EventLogHandle,
  OcelAttributeLevel,
  SlimLinkedOCELHandle,
} from "@r4pm/client";
import { scopeToKey } from "../condition";

export const EVENT_SUBSCOPE: AttributeScope = { type: "Event", activity: null };
export const OBJECT_SUBSCOPE: AttributeScope = { type: "Object", object_type: null };

// Nesting deeper than this stops offering sub-groups / related-entity matches so a
// narrow panel never becomes an unreadable staircase.
export const MAX_DEPTH = 6;

// Threaded via context so the recursive tree does not prop-drill; without a provider, leaves fall back to plain atomic rows.

export interface CondEnv {
  objectType: "EventLog" | "OCEL";
  activities: string[];
  objectTypes: string[];
  activityCounts?: Record<string, number>;
  objectTypeCounts?: Record<string, number>;
  /** Attribute names visible at a given scope, from the dataset's catalog. */
  attrNamesForScope: (scope: AttributeScope) => string[];
  backend: BackendContext;
  datasetName: string;
}

export const CondEnvContext = createContext<CondEnv | null>(null);

export function ConditionEnvProvider({ value, children }: { value: CondEnv; children: ReactNode }) {
  return <CondEnvContext.Provider value={value}>{children}</CondEnvContext.Provider>;
}

export const useCondEnv = () => useContext(CondEnvContext);

export type AttrSummaryData = {
  name?: string;
  kind: AttributeKind;
  total: number;
  missing: number;
  top_values: [string, number][];
  hist_bin_edges: number[];
  hist_counts: number[];
  numeric_stats: { min: number; max: number; mean: number; median: number; stddev: number } | null;
};

export const objectLevelUnavailable = (env: CondEnv | null, scope: AttributeScope | undefined) =>
  scope?.type === "Object" && env?.objectType === "OCEL" && !scope.object_type;

export function levelForScope(env: CondEnv, scope: AttributeScope): AttributeLevel | OcelAttributeLevel {
  if (env.objectType === "EventLog") return scope.type === "Event" ? "Event" : "Case";
  return scope.type === "Event"
    ? "Event"
    : { Object: { object_type: scope.type === "Object" ? (scope.object_type ?? "") : "" } };
}

export function useAttrSummary(env: CondEnv | null, scope: AttributeScope | undefined, key: string) {
  const enabled =
    !!env &&
    !!scope &&
    !!key &&
    !!env.datasetName &&
    scope.type !== "LogGlobal" &&
    !objectLevelUnavailable(env, scope);
  return useQuery<AttrSummaryData>({
    queryKey: [env?.objectType, env?.datasetName, "cond-attr-summary", scope ? scopeToKey(scope) : "?", key],
    enabled,
    queryFn: () => {
      const e = env as CondEnv;
      const s = scope as AttributeScope;
      const level = levelForScope(e, s);
      if (e.objectType === "EventLog") {
        return e.backend.callBinding("app_bindings::get_attribute_summary", {
          event_log: e.datasetName as EventLogHandle,
          attr_name: key,
          level: level as AttributeLevel,
        }) as Promise<AttrSummaryData>;
      }
      return e.backend.callBinding("app_bindings::get_ocel_attribute_summary", {
        ocel: e.datasetName as SlimLinkedOCELHandle,
        attr_name: key,
        level: level as OcelAttributeLevel,
      }) as Promise<AttrSummaryData>;
    },
  });
}

export function useAttrValues(
  env: CondEnv | null,
  scope: AttributeScope | undefined,
  key: string,
  want: boolean,
) {
  const enabled =
    want &&
    !!env &&
    !!scope &&
    !!key &&
    !!env.datasetName &&
    scope.type !== "LogGlobal" &&
    !objectLevelUnavailable(env, scope);
  return useQuery<AttributeValues>({
    queryKey: [env?.objectType, env?.datasetName, "cond-attr-values", scope ? scopeToKey(scope) : "?", key],
    enabled,
    queryFn: () => {
      const e = env as CondEnv;
      const s = scope as AttributeScope;
      const level = levelForScope(e, s);
      if (e.objectType === "EventLog") {
        return e.backend.callBinding("app_bindings::get_attribute_values", {
          event_log: e.datasetName as EventLogHandle,
          attr_name: key,
          level: level as AttributeLevel,
        }) as Promise<AttributeValues>;
      }
      return e.backend.callBinding("app_bindings::get_ocel_attribute_values", {
        ocel: e.datasetName as SlimLinkedOCELHandle,
        attr_name: key,
        level: level as OcelAttributeLevel,
      }) as Promise<AttributeValues>;
    },
  });
}
