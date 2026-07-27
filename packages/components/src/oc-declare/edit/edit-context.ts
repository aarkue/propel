import { createContext, useContext } from "react";
import type { OCDeclareArc } from "../index";
import type { DeclareFlowModel, DeclareNode, ObjectTypeAssociation } from "../model";

export interface EditCallbacks {
  onDiscover?: (options: DiscoveryOptions) => Promise<OCDeclareArc[]>;
  onEvaluate?: (arcs: OCDeclareArc[]) => Promise<number[]>;
  onActivityStatistics?: (activity: string) => Promise<ActivityStatistics>;
  onEdgeStatistics?: (arc: OCDeclareArc) => Promise<BinnedEdgeDurationStats>;
  onTemplateString?: (arcs: OCDeclareArc[]) => Promise<string>;
}

/** Options passed to `onDiscover` (mirrors OCPQ `OCDeclareDiscoveryOptions`; host-owned shape). */
export interface DiscoveryOptions {
  o2o_mode: "None" | "Direct" | "Reversed" | "Bidirectional";
  noise_threshold: number;
  counts_for_generation: [number, number | null];
  counts_for_filter: [number, number | null];
  reduction: "None" | "Lossless" | "Lossy";
  refinement: boolean;
  considered_arrow_types: string[];
  acts_to_use?: string[];
}

/** Activity statistics payload (host-owned; mirrors backend `ActivityStatistics`). */
export interface ActivityStatistics {
  num_evs_per_ot_type: Record<string, number[]>;
  num_obs_of_ot_per_ev: Record<string, number[]>;
}

/** Edge duration statistics payload (host-owned; mirrors backend `BinnedEdgeDurationStats`). */
export interface BinnedEdgeDurationStats {
  bin_centers_ms: number[];
  percentages: number[];
  bin_labels: string[];
  min_ms: number;
  max_ms: number;
}

export interface SupportCtx {
  source: DeclareNode;
  target: DeclareNode;
}

/** Which statistics sheet to open (see `StatsSheet`); `null`/absent = closed. */
export type StatsRequest = { kind: "activity"; activity: string } | { kind: "edge"; arc: OCDeclareArc };

export interface EditContextValue {
  model: DeclareFlowModel;
  mutate: (fn: (m: DeclareFlowModel) => DeclareFlowModel) => void;
  palette: { eventTypes: string[]; objectTypes: string[] };
  relatedTypes?: (activity: string) => Record<string, number>;
  getSupport?: (assoc: ObjectTypeAssociation, ctx: SupportCtx) => number | undefined;
  callbacks: EditCallbacks;
  /** Open a statistics sheet (wired by `OCDeclareViz`). */
  openStats: (req: StatsRequest) => void;
  /** Re-run the full layout engine over the current model + fit. */
  runLayout: () => void;
}

export const EditContext = createContext<EditContextValue | null>(null);

/** The active edit context, or null when the graph is read-only. */
export const useEditContext = () => useContext(EditContext);
