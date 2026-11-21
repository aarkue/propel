//! All traces of an event log as a tree of shared prefixes, with how long cases take from each
//! node to their end.

use std::collections::HashMap;

use process_mining::analysis::durations::summarize;
use process_mining::bindings::register_binding;
use process_mining::EventLog;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::xes_event::{event_activity, event_time_ms, NO_ACTIVITY};

/// One prefix: the path from the root to this node.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PrefixNode {
    /// Index of the parent in `nodes`; `None` for the root
    pub parent: Option<usize>,
    /// The last activity of the prefix; empty for the root
    pub activity: String,
    pub depth: usize,
    /// Cases that start with this prefix
    pub cases: usize,
    /// Cases that end right after this prefix
    pub ending: usize,
    /// Median time from the prefix's last event to the case's last event, in milliseconds
    pub median_remaining_ms: Option<f64>,
    /// Median time from the case's first event to the prefix's last event, in milliseconds
    pub median_elapsed_ms: Option<f64>,
    /// Children too small to list (below `min_cases`), summed up
    pub pruned_cases: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PrefixTree {
    /// Parents before their children; `nodes[0]` is the root
    pub nodes: Vec<PrefixNode>,
    /// The tree stops at this depth; deeper events are left out
    pub max_depth: usize,
    pub min_cases: usize,
}

#[derive(Default)]
struct Building {
    activity: String,
    children: HashMap<String, usize>,
    cases: usize,
    ending: usize,
    remaining: Vec<f64>,
    elapsed: Vec<f64>,
}

/// The prefix tree of all traces up to `max_depth` (default 20) events, listing prefixes shared by
/// at least a `min_share` of all cases (default 0.5%).
#[register_binding]
pub fn get_prefix_tree(
    event_log: &EventLog,
    #[bind(default)] max_depth: Option<usize>,
    #[bind(default)] min_share: Option<f64>,
) -> PrefixTree {
    let max_depth = max_depth.unwrap_or(20).max(1);
    let share = min_share.unwrap_or(0.005).clamp(0.0, 1.0);
    let min_cases = ((event_log.traces.len() as f64 * share).ceil() as usize).max(1);
    let mut nodes = vec![Building::default()];
    for trace in &event_log.traces {
        let times: Vec<Option<i64>> = trace.events.iter().map(event_time_ms).collect();
        let first = times.iter().flatten().min().copied();
        let last = times.iter().flatten().max().copied();
        let mut at = 0;
        nodes[0].cases += 1;
        for (i, event) in trace.events.iter().take(max_depth).enumerate() {
            let activity = event_activity(event).unwrap_or(NO_ACTIVITY);
            at = match nodes[at].children.get(activity) {
                Some(&c) => c,
                None => {
                    nodes.push(Building {
                        activity: activity.to_string(),
                        ..Default::default()
                    });
                    let c = nodes.len() - 1;
                    nodes[at].children.insert(activity.to_string(), c);
                    c
                }
            };
            let node = &mut nodes[at];
            node.cases += 1;
            if let (Some(t), Some(first), Some(last)) = (times[i], first, last) {
                node.remaining.push((last - t) as f64);
                node.elapsed.push((t - first) as f64);
            }
        }
        if trace.events.len() <= max_depth {
            nodes[at].ending += 1;
        }
    }

    // Keep nodes with enough cases, in depth-first order so parents precede children.
    let mut out: Vec<PrefixNode> = Vec::new();
    let mut stack: Vec<(usize, Option<usize>, usize)> = vec![(0, None, 0)];
    while let Some((i, parent, depth)) = stack.pop() {
        let mut children: Vec<usize> = nodes[i].children.values().copied().collect();
        children.sort_by(|&a, &b| {
            nodes[b]
                .cases
                .cmp(&nodes[a].cases)
                .then_with(|| nodes[a].activity.cmp(&nodes[b].activity))
        });
        let (kept, pruned): (Vec<usize>, Vec<usize>) = children
            .into_iter()
            .partition(|&c| nodes[c].cases >= min_cases);
        let n = &mut nodes[i];
        let median = |v: &mut Vec<f64>| summarize(v).map(|s| s.median);
        out.push(PrefixNode {
            parent,
            activity: std::mem::take(&mut n.activity),
            depth,
            cases: n.cases,
            ending: n.ending,
            median_remaining_ms: median(&mut n.remaining),
            median_elapsed_ms: median(&mut n.elapsed),
            pruned_cases: 0,
        });
        let me = out.len() - 1;
        out[me].pruned_cases = pruned.iter().map(|&c| nodes[c].cases).sum();
        // Reversed, so the most frequent child is visited (and listed) first.
        for c in kept.into_iter().rev() {
            stack.push((c, Some(me), depth + 1));
        }
    }
    PrefixTree {
        nodes: out,
        max_depth,
        min_cases,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use process_mining::Importable;

    fn trace(acts: &[(&str, &str)]) -> String {
        let evs: String = acts
            .iter()
            .map(|(a, t)| {
                format!(
                    r#"<event><string key="concept:name" value="{a}"/><date key="time:timestamp" value="2024-01-{t}T00:00:00Z"/></event>"#
                )
            })
            .collect();
        format!("<trace>{evs}</trace>")
    }

    #[test]
    fn counts_shared_prefixes_and_remaining_time() {
        let xes = format!(
            "<log>{}{}{}</log>",
            trace(&[("a", "01"), ("b", "03")]),
            trace(&[("a", "01"), ("b", "02"), ("c", "05")]),
            trace(&[("a", "01"), ("d", "02")]),
        );
        let log = EventLog::import_from_bytes(xes.as_bytes(), "xes").unwrap();
        let t = get_prefix_tree(&log, None, Some(0.0));
        assert_eq!(t.nodes[0].cases, 3);
        let a = &t.nodes[1];
        assert_eq!((a.activity.as_str(), a.cases, a.parent), ("a", 3, Some(0)));
        let b = t.nodes.iter().find(|n| n.activity == "b").unwrap();
        assert_eq!((b.cases, b.ending), (2, 1));
        assert_eq!(
            b.median_remaining_ms,
            Some(1.5 * 86_400_000.0),
            "0 and 3 days left"
        );
        let parents_first = t
            .nodes
            .iter()
            .enumerate()
            .all(|(i, n)| n.parent.is_none_or(|p| p < i));
        assert!(parents_first);
    }

    #[test]
    fn prunes_rare_prefixes() {
        let xes = format!(
            "<log>{}{}{}</log>",
            trace(&[("a", "01")]),
            trace(&[("a", "01")]),
            trace(&[("x", "01")]),
        );
        let log = EventLog::import_from_bytes(xes.as_bytes(), "xes").unwrap();
        let t = get_prefix_tree(&log, None, Some(0.5));
        assert_eq!(t.nodes.len(), 2);
        assert_eq!(t.nodes[0].pruned_cases, 1);
    }
}
