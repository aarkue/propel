import type { PetriNet } from "../petri-net";
import type { FitnessResult } from "../fitness";

// Local view-models matching the generated `@r4pm/client` alignment types.
// The studio adapter imports both, so type mismatches are compile errors.

export type AlignmentMove =
  | { SyncMove: { transition: string; trace_event_index: number } }
  | { ModelMove: { transition: string } }
  | { LogMove: { trace_event_index: number } };

export type SearchError =
  | "LimitReached"
  | "MemoryLimitReached"
  | "Unreachable"
  | "MaxEdgeCostTooLarge"
  | "Cancelled";

export type PlaceID = number;

export type SyncProdNetConstructionError =
  | { InvalidPlaceInMarking: PlaceID }
  | { ArcWeightTooLarge: number }
  | { MarkingTooLarge: [PlaceID, number] }
  | { TraceTooLong: number };

export type AlignmentError =
  | { SearchError: SearchError }
  | { SyncProdNetConstructionFailed: SyncProdNetConstructionError };

export interface AlignmentResult {
  moves: AlignmentMove[];
  cost: number;
  states_visited: number;
}

export interface VariantAlignmentResult {
  activities: string[];
  frequency: number;
  result: { Ok: AlignmentResult } | { Err: AlignmentError };
}

export interface TransitionFireStats {
  sync_fires: number;
  model_fires: number;
}

export interface AlignmentAggregate {
  transition_stats: Record<string, TransitionFireStats>;
  log_move_counts: Record<string, number>;
  total_traces: number;
}

export interface EscapingActivity {
  /** `null`: stopping where traces never stop. */
  activity?: string | null;
  weight: number;
}

export interface EscapingEdgeSummary {
  prefix_tail: (string | null)[];
  prefix_len: number;
  escaping?: string | null;
  weight: number;
}

/** Escaping-edges precision: where the model allows behavior the log never shows. */
export interface PrecisionSummary {
  precision: number;
  weighted_available: number;
  weighted_escaping: number;
  num_states: number;
  search_limit_reached: boolean;
  by_activity: EscapingActivity[];
  top_edges: EscapingEdgeSummary[];
}

export interface LogAlignments {
  net: PetriNet;
  variant_alignments: VariantAlignmentResult[];
  fitness?: FitnessResult | null;
  aggregated: AlignmentAggregate;
  precision?: PrecisionSummary | null;
}
