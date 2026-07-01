//! Alignment-based conformance binding: aligns every variant of an event log against a
//! caller-supplied process model (`net`) and computes fitness, returning ONE structure that
//! resolves everything the alignment viewers need (the net echoed back for a Petri-net-style
//! view, and per-variant moves + cost for a list view). The model is the caller's choice.

use std::collections::HashMap;

use process_mining::bindings::register_binding;
use process_mining::conformance::case_centric::alignments::{
    align_variants, compute_fitness, AlignmentMove, AlignmentOptions, FitnessResult,
    VariantAlignmentResult,
};
use process_mining::core::event_data::case_centric::utils::activity_projection::EventLogActivityProjection;
use process_mining::{EventLog, PetriNet};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Firing counts for a single transition across all aligned traces (weighted by variant frequency).
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct TransitionFireStats {
    /// Times the transition fired in sync with a log event (conforming).
    pub sync_fires: u64,
    /// Times the transition fired as a model-only move (a deviation / skipped step).
    pub model_fires: u64,
}

/// Aggregated alignment statistics over the whole log; lets a net view show a deviation heatmap
/// without re-deriving it per render.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AlignmentAggregate {
    /// Per transition id (matches `PetriNet.transitions` keys): sync vs model-only firings.
    pub transition_stats: HashMap<String, TransitionFireStats>,
    /// Per activity: total log-moves (logged events with no matching model step) across all traces.
    pub log_move_counts: HashMap<String, u64>,
    /// Total number of aligned traces.
    pub total_traces: u64,
}

/// Everything the alignment visualizations need, computed in one call.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct LogAlignments {
    /// The process model the log was aligned against (the caller-supplied net, echoed back).
    pub net: PetriNet,
    /// Per-variant alignment (activity sequence, frequency, the move sequence + cost).
    pub variant_alignments: Vec<VariantAlignmentResult>,
    /// Aggregate alignment fitness (`None` if fitness could not be computed).
    pub fitness: Option<FitnessResult>,
    /// Pre-aggregated per-transition / per-activity deviation counts (for a net heatmap).
    pub aggregated: AlignmentAggregate,
}

fn aggregate(variant_alignments: &[VariantAlignmentResult]) -> AlignmentAggregate {
    let mut transition_stats: HashMap<String, TransitionFireStats> = HashMap::new();
    let mut log_move_counts: HashMap<String, u64> = HashMap::new();
    let mut total_traces = 0u64;
    for va in variant_alignments {
        total_traces += va.frequency;
        if let Ok(align) = &va.result {
            for mv in &align.moves {
                match mv {
                    AlignmentMove::SyncMove { transition, .. } => {
                        transition_stats
                            .entry(transition.0.to_string())
                            .or_default()
                            .sync_fires += va.frequency;
                    }
                    AlignmentMove::ModelMove { transition } => {
                        transition_stats
                            .entry(transition.0.to_string())
                            .or_default()
                            .model_fires += va.frequency;
                    }
                    AlignmentMove::LogMove { trace_event_index } => {
                        if let Some(act) = va.activities.get(*trace_event_index) {
                            *log_move_counts.entry(act.clone()).or_default() += va.frequency;
                        }
                    }
                }
            }
        }
    }
    AlignmentAggregate {
        transition_stats,
        log_move_counts,
        total_traces,
    }
}

/// Align an event log against a GIVEN process model (`net`) and return the per-variant alignments,
/// aggregate fitness, and the net itself (echoed for the visualizations). The model is the caller's
/// choice (a discovered net, an imported PNML, an edited net), NOT something this binding invents.
#[register_binding]
pub fn align_event_log(event_log: &EventLog, net: PetriNet) -> LogAlignments {
    let projection = EventLogActivityProjection::from(event_log);
    let options = AlignmentOptions::default();
    let variant_alignments = align_variants(&net, &projection, &options);
    let fitness = compute_fitness(&variant_alignments, &net, &options).ok();
    let aggregated = aggregate(&variant_alignments);
    LogAlignments {
        net,
        variant_alignments,
        fitness,
        aggregated,
    }
}
