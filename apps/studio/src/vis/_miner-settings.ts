// The Inductive Miner settings the miner picker offers to fine-tune. `_`-prefixed so the vis
// registry glob skips it.

export type MinerSetting = { key: string; label: string; help: string };

/** The settings of the log-based miner, in rust4pm's field order, worded after its doc comments. */
export const LOG_SETTINGS: readonly MinerSetting[] = [
  {
    key: "use_fallthroughs",
    label: "Fall throughs",
    help: "Try fall throughs before falling back to a flower model.",
  },
  {
    key: "strict_sequence",
    label: "Strict sequence cut",
    help: "Merge sequence parts that only occur together with a skippable neighbor.",
  },
  {
    key: "use_interleaved",
    label: "Interleaved cut",
    help: "Look for interleaved cuts before concurrency. They read the unfiltered traces, so noise can prevent them.",
  },
  {
    key: "use_inclusive_choice",
    label: "Inclusive choice",
    help: "Regroup concurrent cuts into nested concurrency, optionality and inclusive choice.",
  },
  {
    key: "guard_empty_cut_parts",
    label: "Guard empty cut parts",
    help: "Fall through instead of taking a cut that leaves a part without events.",
  },
  {
    key: "use_minimum_self_distance",
    label: "Minimum self-distance",
    help: "Keep an activity in one concurrent part with those it loops around, where a cut allows it.",
  },
  {
    key: "use_degenerate_tau_loops",
    label: "Degenerate tau loops",
    help: "Take a tau loop that cuts every trace into single events.",
  },
  {
    key: "filter_single_activity",
    label: "Filter single activity",
    help: "Keep a single activity when single executions dominate, instead of making any repetition a loop.",
  },
  {
    key: "filter_activity_concurrent_probe",
    label: "Filtered concurrency probe",
    help: "Let the activity-concurrent fall through accept a candidate that only cuts after filtering.",
  },
  {
    key: "keep_at_threshold",
    label: "Keep at threshold",
    help: "Keep behavior whose frequency is exactly at the noise threshold.",
  },
  {
    key: "filter_start_end",
    label: "Filter start and end",
    help: "Also remove infrequent start and end activities.",
  },
  {
    key: "activity_concurrent_by_name",
    label: "Concurrency candidates by name",
    help: "Try activities for the activity-concurrent fall through by name, not the most frequent first.",
  },
  {
    key: "fold",
    label: "Fold nested operators",
    help: "Collapse nested occurrences of the same operator and drop tau where it changes nothing.",
  },
];

/** The settings of the DFG-based miner (IMd, IMfd). */
export const DFG_SETTINGS: readonly MinerSetting[] = [
  {
    key: "strict_sequence",
    label: "Strict sequence cut",
    help: "Merge sequence parts that only occur together with a skippable neighbor.",
  },
  { key: "fold", label: "Fold nested operators", help: "Collapse nested occurrences of the same operator." },
  { key: "use_tau_loops", label: "Tau loops", help: "Try tau loops before falling back to a flower model." },
  {
    key: "flower_accepts_empty",
    label: "Flower allows empty trace",
    help: "Let the flower model accept the empty trace. This only costs precision.",
  },
  {
    key: "repeated_activity_to_flower",
    label: "Repeated activity as flower",
    help: "Turn a lone activity with a self edge into a flower instead of a loop.",
  },
  {
    key: "filter_single_activity",
    label: "Filter single activity",
    help: "Keep a single activity despite a self edge when single executions dominate.",
  },
];
