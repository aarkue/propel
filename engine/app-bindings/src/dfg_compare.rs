//! Directly-follows counts of two logs (or two periods of one log) side by side, for drawing their
//! difference on one shared DFG.

use std::collections::HashMap;

use process_mining::bindings::register_binding;
use process_mining::core::event_data::case_centric::Trace;
use process_mining::EventLog;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::xes_event::{event_activity, event_time_ms, NO_ACTIVITY};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ArcKind {
    Follows,
    Start,
    End,
}

/// One arc with its count in each side. `from` is empty for a start arc, `to` for an end arc.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ComparedArc {
    pub kind: ArcKind,
    pub from: String,
    pub to: String,
    pub a: u64,
    pub b: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ComparedActivity {
    pub activity: String,
    pub a: u64,
    pub b: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DfgComparison {
    pub a_label: String,
    pub b_label: String,
    pub a_cases: u64,
    pub b_cases: u64,
    /// The case start that separates the periods, when comparing periods
    pub split_ms: Option<i64>,
    pub activities: Vec<ComparedActivity>,
    pub arcs: Vec<ComparedArc>,
}

#[derive(Default)]
struct Side {
    cases: u64,
    activities: HashMap<String, u64>,
    arcs: HashMap<(ArcKind, String, String), u64>,
}

impl Side {
    fn add(&mut self, trace: &Trace) {
        let acts: Vec<&str> = trace
            .events
            .iter()
            .map(|e| event_activity(e).unwrap_or(NO_ACTIVITY))
            .collect();
        self.cases += 1;
        let (Some(first), Some(last)) = (acts.first(), acts.last()) else {
            return;
        };
        let mut arc = |kind, from: &str, to: &str| {
            *self
                .arcs
                .entry((kind, from.to_string(), to.to_string()))
                .or_default() += 1;
        };
        arc(ArcKind::Start, "", first);
        arc(ArcKind::End, last, "");
        for w in acts.windows(2) {
            arc(ArcKind::Follows, w[0], w[1]);
        }
        for a in acts {
            *self.activities.entry(a.to_string()).or_default() += 1;
        }
    }
}

fn compare(
    a: Side,
    b: Side,
    a_label: String,
    b_label: String,
    split_ms: Option<i64>,
) -> DfgComparison {
    let mut activities: HashMap<String, (u64, u64)> = HashMap::new();
    for (k, n) in a.activities {
        activities.entry(k).or_default().0 = n;
    }
    for (k, n) in b.activities {
        activities.entry(k).or_default().1 = n;
    }
    let mut arcs: HashMap<(ArcKind, String, String), (u64, u64)> = HashMap::new();
    for (k, n) in a.arcs {
        arcs.entry(k).or_default().0 = n;
    }
    for (k, n) in b.arcs {
        arcs.entry(k).or_default().1 = n;
    }
    let mut activities: Vec<ComparedActivity> = activities
        .into_iter()
        .map(|(activity, (a, b))| ComparedActivity { activity, a, b })
        .collect();
    activities.sort_by(|x, y| x.activity.cmp(&y.activity));
    let mut arcs: Vec<ComparedArc> = arcs
        .into_iter()
        .map(|((kind, from, to), (a, b))| ComparedArc {
            kind,
            from,
            to,
            a,
            b,
        })
        .collect();
    arcs.sort_by(|x, y| (x.kind as u8, &x.from, &x.to).cmp(&(y.kind as u8, &y.from, &y.to)));
    DfgComparison {
        a_label,
        b_label,
        a_cases: a.cases,
        b_cases: b.cases,
        split_ms,
        activities,
        arcs,
    }
}

/// The directly-follows counts of two event logs.
#[register_binding]
pub fn compare_dfgs(log_a: &EventLog, log_b: &EventLog) -> DfgComparison {
    let (mut a, mut b) = (Side::default(), Side::default());
    log_a.traces.iter().for_each(|t| a.add(t));
    log_b.traces.iter().for_each(|t| b.add(t));
    compare(a, b, "A".into(), "B".into(), None)
}

/// The directly-follows counts of the cases of one log that start before `split_ms` (A) and
/// those that start at or after it (B). Without `split_ms`, the log splits at the median case start.
#[register_binding]
pub fn compare_dfg_periods(
    event_log: &EventLog,
    #[bind(default)] split_ms: Option<i64>,
) -> DfgComparison {
    let starts: Vec<Option<i64>> = event_log
        .traces
        .iter()
        .map(|t| t.events.iter().filter_map(event_time_ms).min())
        .collect();
    let split = split_ms.unwrap_or_else(|| {
        let mut s: Vec<i64> = starts.iter().flatten().copied().collect();
        s.sort_unstable();
        let median = s.get(s.len() / 2).copied().unwrap_or(0);
        // When over half the cases share the first start (date-only logs), the median would
        // leave A empty: split after that start instead.
        if s.first() == Some(&median) {
            s.iter().copied().find(|&x| x > median).unwrap_or(median)
        } else {
            median
        }
    });
    let (mut a, mut b) = (Side::default(), Side::default());
    for (t, start) in event_log.traces.iter().zip(&starts) {
        match start {
            Some(s) if *s < split => a.add(t),
            Some(_) => b.add(t),
            None => {}
        }
    }
    compare(
        a,
        b,
        "before the split".into(),
        "from the split".into(),
        Some(split),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use process_mining::Importable;

    fn log(traces: &[&[(&str, &str)]]) -> EventLog {
        let body: String = traces
            .iter()
            .map(|t| {
                let evs: String = t
                    .iter()
                    .map(|(a, d)| format!(r#"<event><string key="concept:name" value="{a}"/><date key="time:timestamp" value="2024-01-{d}T00:00:00Z"/></event>"#))
                    .collect();
                format!("<trace>{evs}</trace>")
            })
            .collect();
        EventLog::import_from_bytes(format!("<log>{body}</log>").as_bytes(), "xes").unwrap()
    }

    fn arc<'a>(c: &'a DfgComparison, kind: ArcKind, from: &str, to: &str) -> &'a ComparedArc {
        c.arcs
            .iter()
            .find(|a| a.kind == kind && a.from == from && a.to == to)
            .unwrap()
    }

    #[test]
    fn counts_each_side() {
        let a = log(&[&[("x", "01"), ("y", "02")]]);
        let b = log(&[&[("x", "01"), ("z", "02")], &[("x", "01"), ("y", "02")]]);
        let c = compare_dfgs(&a, &b);
        assert_eq!((c.a_cases, c.b_cases), (1, 2));
        let xy = arc(&c, ArcKind::Follows, "x", "y");
        assert_eq!((xy.a, xy.b), (1, 1));
        let xz = arc(&c, ArcKind::Follows, "x", "z");
        assert_eq!((xz.a, xz.b), (0, 1));
        assert_eq!(arc(&c, ArcKind::Start, "", "x").b, 2);
    }

    #[test]
    fn splits_periods_at_the_median_start() {
        let l = log(&[
            &[("x", "01"), ("y", "02")],
            &[("x", "10"), ("z", "11")],
            &[("x", "20"), ("z", "21")],
        ]);
        let c = compare_dfg_periods(&l, None);
        assert_eq!((c.a_cases, c.b_cases), (1, 2));
        assert_eq!(
            c.split_ms,
            Some(
                process_mining::core::chrono::DateTime::parse_from_rfc3339("2024-01-10T00:00:00Z")
                    .unwrap()
                    .timestamp_millis()
            )
        );
    }
}
