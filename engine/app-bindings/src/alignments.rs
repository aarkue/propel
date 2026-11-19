//! Alignment-based conformance binding: aligns every variant of an event log against a
//! caller-supplied process model, returning fitness plus per-variant moves+cost in one structure.

use std::collections::HashMap;

use process_mining::bindings::register_binding;
use process_mining::conformance::case_centric::alignments::{
    compute_fitness, AlignmentMove, AlignmentOptions, FitnessResult, VariantAlignmentResult,
};
use process_mining::conformance::case_centric::precision::{
    EscapingEdge, EscapingEdgesOptions, PathStep, PrecisionError,
};
use process_mining::core::event_data::case_centric::utils::activity_projection::EventLogActivityProjection;
use process_mining::discovery::case_centric::inductive_miner::InductiveMiner;
use process_mining::{AcceptingPetriNet, Cancelled, Control, EventLog};
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
    /// Per transition index (position in `net.transitions`): sync vs model-only firings.
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
    pub net: AcceptingPetriNet,
    /// Per-variant alignment (activity sequence, frequency, the move sequence + cost).
    pub variant_alignments: Vec<VariantAlignmentResult>,
    /// Aggregate alignment fitness (`None` if fitness could not be computed).
    pub fitness: Option<FitnessResult>,
    /// Pre-aggregated per-transition / per-activity deviation counts (for a net heatmap).
    pub aggregated: AlignmentAggregate,
    /// Escaping-edges precision from the same alignments (`None` if it could not be computed).
    pub precision: Option<PrecisionSummary>,
}

/// Escaping-edges precision with the escaping edges summarized for display.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PrecisionSummary {
    /// Weighted share of the behavior the model allows that the log takes
    pub precision: f64,
    pub weighted_available: u64,
    pub weighted_escaping: u64,
    pub num_states: usize,
    /// A search limit was hit, so `precision` may be off
    pub search_limit_reached: bool,
    /// Per escaping activity (`None` = stopping where traces never stop), its total weight, highest first
    pub by_activity: Vec<EscapingActivity>,
    /// The heaviest escaping edges, highest weight first
    pub top_edges: Vec<EscapingEdgeSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct EscapingActivity {
    pub activity: Option<String>,
    pub weight: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct EscapingEdgeSummary {
    /// The last steps of the path to the state, oldest first
    pub prefix_tail: Vec<Option<String>>,
    /// Length of the full path to the state
    pub prefix_len: usize,
    pub escaping: Option<String>,
    pub weight: u64,
}

const TOP_EDGES: usize = 50;
const PREFIX_TAIL: usize = 3;

/// A step as an activity name; `None` for the trace end. A transition step shows its label, or
/// `tau` for a silent one.
fn step_name(step: &PathStep, net: &AcceptingPetriNet) -> Option<String> {
    match step {
        PathStep::Activity(a) => Some(a.clone()),
        PathStep::Transition(t) => Some(
            net.net
                .transition(*t)
                .label
                .clone()
                .unwrap_or_else(|| "tau".to_string()),
        ),
        PathStep::End => None,
    }
}

/// `None` when no variant could be aligned or the measure failed otherwise.
fn summarize_precision(
    net: &AcceptingPetriNet,
    variant_alignments: &[VariantAlignmentResult],
    ctl: &Control<'_>,
) -> Result<Option<PrecisionSummary>, Cancelled> {
    let options = EscapingEdgesOptions {
        report_escaping_edges: true,
        ..Default::default()
    };
    let p = match ctl.escaping_edges_precision_from_alignments(net, variant_alignments, &options) {
        Ok(p) => p,
        Err(PrecisionError::Cancelled) => return Err(Cancelled),
        Err(_) => return Ok(None),
    };
    let edges = p.escaping_edges.unwrap_or_default();
    let mut by_activity: HashMap<Option<String>, u64> = HashMap::new();
    for e in &edges {
        *by_activity.entry(step_name(&e.escaping, net)).or_default() += e.weight;
    }
    let mut by_activity: Vec<EscapingActivity> = by_activity
        .into_iter()
        .map(|(activity, weight)| EscapingActivity { activity, weight })
        .collect();
    by_activity.sort_by(|a, b| {
        b.weight
            .cmp(&a.weight)
            .then_with(|| a.activity.cmp(&b.activity))
    });
    let mut top: Vec<&EscapingEdge> = edges.iter().collect();
    top.sort_by(|a, b| b.weight.cmp(&a.weight).then_with(|| a.cmp(b)));
    let top_edges = top
        .into_iter()
        .take(TOP_EDGES)
        .map(|e| EscapingEdgeSummary {
            prefix_tail: e.prefix[e.prefix.len().saturating_sub(PREFIX_TAIL)..]
                .iter()
                .map(|s| step_name(s, net))
                .collect(),
            prefix_len: e.prefix.len(),
            escaping: step_name(&e.escaping, net),
            weight: e.weight,
        })
        .collect();
    Ok(Some(PrecisionSummary {
        precision: p.precision,
        weighted_available: p.weighted_available,
        weighted_escaping: p.weighted_escaping,
        num_states: p.num_states,
        search_limit_reached: p.search_limit_reached,
        by_activity,
        top_edges,
    }))
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
                            .entry(transition.index().to_string())
                            .or_default()
                            .sync_fires += va.frequency;
                    }
                    AlignmentMove::ModelMove { transition, .. } => {
                        transition_stats
                            .entry(transition.index().to_string())
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

/// Align an event log against a process model (a stored net's id, or the net inline) and return
/// the per-variant alignments, aggregate fitness, and the net itself (echoed for the visualizations).
///
/// Streams each aligned variant as `{"variant": i, "result": r}` (see `align_variants`).
#[register_binding(stringify_error)]
pub fn align_event_log(
    event_log: &EventLog,
    #[bind(handle)] net: &AcceptingPetriNet,
    #[bind(ctx)] ctl: &Control<'_>,
) -> Result<LogAlignments, Cancelled> {
    let projection = EventLogActivityProjection::from(event_log);
    let options = AlignmentOptions::default();
    let variant_alignments = ctl.align_variants(net, &projection, &options)?;
    let fitness = compute_fitness(net, &variant_alignments, &options).ok();
    let aggregated = aggregate(&variant_alignments);
    let precision = summarize_precision(net, &variant_alignments, ctl)?;
    Ok(LogAlignments {
        precision,
        net: net.clone(),
        variant_alignments,
        fitness,
        aggregated,
    })
}

/// How well a discovered net fits and how much more it allows than the log, for comparing models.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ModelQuality {
    pub net: AcceptingPetriNet,
    /// Average trace fitness from alignments
    pub fitness: Option<f64>,
    pub perfectly_fitting: Option<f64>,
    /// Escaping-edges precision from the same alignments
    pub precision: Option<f64>,
    /// Harmonic mean of `fitness` and `precision`
    pub f_score: Option<f64>,
    pub places: usize,
    pub transitions: usize,
    pub silent_transitions: usize,
    pub arcs: usize,
    /// Variants whose alignment failed (e.g., a search limit), left out of the numbers
    pub unaligned_variants: usize,
}

/// Discovers a net with an Inductive Miner and measures its fitness, precision and size, as one
/// point of a sweep over noise thresholds.
#[register_binding(stringify_error)]
pub fn evaluate_inductive_net(
    log: &EventLogActivityProjection,
    miner: InductiveMiner,
    #[bind(ctx)] ctl: &Control<'_>,
) -> Result<ModelQuality, Cancelled> {
    let ctl = crate::control::progress_only(ctl, None);
    let net = ctl.discover_inductive_net(log, miner)?;
    let options = AlignmentOptions::default();
    let alignments = ctl.align_variants(&net, log, &options)?;
    let fitness = compute_fitness(&net, &alignments, &options).ok();
    let precision = match ctl.escaping_edges_precision_from_alignments(
        &net,
        &alignments,
        &Default::default(),
    ) {
        Ok(p) => Some(p.precision),
        Err(PrecisionError::Cancelled) => return Err(Cancelled),
        Err(_) => None,
    };
    let f = fitness.as_ref().map(|f| f.average_fitness);
    let f_score = match (f, precision) {
        (Some(f), Some(p)) if f + p > 0.0 => Some(2.0 * f * p / (f + p)),
        _ => None,
    };
    let silent_transitions = net
        .net
        .transitions()
        .filter(|(_, t)| t.label.is_none())
        .count();
    let places = net.net.places().len();
    let transitions = net.net.transitions().len();
    let arcs = net.net.arcs().count();
    Ok(ModelQuality {
        fitness: f,
        perfectly_fitting: fitness.map(|f| f.perfectly_fitting_frac),
        precision,
        f_score,
        places,
        transitions,
        silent_transitions,
        arcs,
        unaligned_variants: alignments.iter().filter(|a| a.result.is_err()).count(),
        net,
    })
}

#[cfg(test)]
mod tests {
    use process_mining::bindings::{call_resolved, get_fn_binding, AppState, RegistryItem};
    use process_mining::core::event_data::case_centric::utils::activity_projection::EventLogActivityProjection;
    use process_mining::core::process_models::case_centric::petri_net::ArcType;
    use process_mining::{AcceptingPetriNet, EventLog, Importable, PetriNet};
    use serde_json::{json, Value};

    const XES: &str = r#"<log><trace><event><string key="concept:name" value="a"/></event><event><string key="concept:name" value="b"/></event></trace></log>"#;

    fn align(state: &AppState, net: Value) -> Value {
        let binding = get_fn_binding("app_bindings::align_event_log").unwrap();
        let out =
            call_resolved(binding, &json!({ "event_log": "log", "net": net }), state).unwrap();
        serde_json::from_slice(&out).unwrap()
    }

    /// `a` then `b`, nothing else.
    fn sequence_net() -> AcceptingPetriNet {
        let mut net = PetriNet::new();
        let [p0, p1, p2] = [(); 3].map(|_| net.add_place(None));
        let a = net.add_transition(Some("a".into()), None);
        let b = net.add_transition(Some("b".into()), None);
        net.add_arc(ArcType::place_to_transition(p0, a), None);
        net.add_arc(ArcType::transition_to_place(a, p1), None);
        net.add_arc(ArcType::place_to_transition(p1, b), None);
        net.add_arc(ArcType::transition_to_place(b, p2), None);
        AcceptingPetriNet::new(net, [(p0, 1)].into(), [(p2, 1)].into())
    }

    #[test]
    fn aligns_against_a_stored_or_an_inline_net() {
        let log = EventLog::import_from_bytes(XES.as_bytes(), "xes").unwrap();
        let net = sequence_net();
        let state = AppState::default();
        state.add("log", log);
        state.add("net", RegistryItem::custom(net.clone()));
        let stored = align(&state, json!("net"));
        assert_eq!(stored["fitness"]["average_fitness"].as_f64(), Some(1.0));
        assert_eq!(stored["precision"]["precision"].as_f64(), Some(1.0));
        let inline = align(&state, serde_json::to_value(&net).unwrap());
        assert_eq!(inline["fitness"]["average_fitness"].as_f64(), Some(1.0));
    }

    #[test]
    fn reports_where_the_model_allows_more_than_the_log() {
        let log = EventLog::import_from_bytes(XES.as_bytes(), "xes").unwrap();
        let mut net = sequence_net();
        // A skip of `b`, which the log never takes.
        let skip = net.net.add_transition(Some("c".into()), None);
        let (p1, p2) = (
            net.net.places().nth(1).unwrap().0,
            net.net.places().nth(2).unwrap().0,
        );
        net.net
            .add_arc(ArcType::place_to_transition(p1, skip), None);
        net.net
            .add_arc(ArcType::transition_to_place(skip, p2), None);
        let state = AppState::default();
        state.add("log", log);
        state.add("net", RegistryItem::custom(net));
        let v = align(&state, json!("net"));
        assert!(v["precision"]["precision"].as_f64().unwrap() < 1.0);
        assert_eq!(v["precision"]["by_activity"][0]["activity"], "c");
        assert_eq!(v["precision"]["top_edges"][0]["prefix_tail"], json!(["a"]));
    }

    #[test]
    fn evaluates_a_discovered_net() {
        let log = EventLog::import_from_bytes(XES.as_bytes(), "xes").unwrap();
        let proj = EventLogActivityProjection::from(&log);
        let q = super::evaluate_inductive_net(
            &proj,
            process_mining::discovery::case_centric::inductive_miner::InductiveMinerVariant::Imf
                .options(Default::default(), 0.2),
            &process_mining::Control::new(),
        )
        .unwrap();
        assert_eq!(q.fitness, Some(1.0));
        assert_eq!(q.precision, Some(1.0));
        assert_eq!(q.f_score, Some(1.0));
        assert_eq!(q.transitions - q.silent_transitions, 2);
    }
}
