//! The first look at an event log: its size, variants, throughput over time, activities, and what
//! looks wrong in the data.

use std::collections::{BTreeSet, HashMap, HashSet};

use process_mining::analysis::durations::{quantile_sorted, summarize};
use process_mining::bindings::register_binding;
use process_mining::core::chrono::Timelike;
use process_mining::core::event_data::case_centric::utils::activity_projection::EventLogActivityProjection;
use process_mining::core::event_data::case_centric::{AttributeValue, Trace, XESEditableAttribute};
use process_mining::EventLog;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::ocel_overview::{finding, HealthFinding, HealthFix, Severity, Tally};
use crate::repairs::{EventDefect, Repair};
use crate::xes_event::{event_activity, event_lifecycle, event_time, NO_ACTIVITY};

const TOP_VARIANTS: usize = 8;
const THROUGHPUT_BINS: usize = 40;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct VariantShare {
    pub activities: Vec<String>,
    pub cases: usize,
}

/// Cases started and finished per time bin, and how long the cases started in a bin took.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Throughput {
    pub bin_starts_ms: Vec<i64>,
    pub bin_width_ms: i64,
    pub started: Vec<usize>,
    pub finished: Vec<usize>,
    /// Median duration of the cases started in each bin; `None` where none started
    pub median_duration_ms: Vec<Option<f64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct LogHealth {
    pub num_cases: usize,
    pub num_events: usize,
    /// Every check, failed ones (most severe first) before passed ones
    pub findings: Vec<HealthFinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct LogOverview {
    pub num_cases: usize,
    pub num_events: usize,
    pub num_activities: usize,
    pub num_variants: usize,
    /// First and last event time in epoch milliseconds
    pub start_ms: Option<i64>,
    pub end_ms: Option<i64>,
    pub median_case_duration_ms: Option<f64>,
    pub p90_case_duration_ms: Option<f64>,
    /// Most frequent first
    pub top_variants: Vec<VariantShare>,
    /// `(activity, events)`, most frequent first
    pub activities: Vec<(String, usize)>,
    pub throughput: Throughput,
    pub health: LogHealth,
}

fn case_id(trace: &Trace, index: usize) -> String {
    trace
        .attributes
        .get_by_key("concept:name")
        .map(|a| a.value.to_string())
        .unwrap_or_else(|| format!("#{}", index + 1))
}

fn type_name(v: &AttributeValue) -> &'static str {
    match v {
        AttributeValue::String(_) => "string",
        AttributeValue::Date(_) => "date",
        AttributeValue::Int(_) => "int",
        AttributeValue::Float(_) => "float",
        AttributeValue::Boolean(_) => "boolean",
        AttributeValue::ID(_) => "id",
        AttributeValue::List(_) => "list",
        AttributeValue::Container(_) => "container",
        AttributeValue::None() => "none",
    }
}

/// Times of a case's events in file order (`None` where missing), plus its first and last time.
fn case_times(trace: &Trace) -> (Vec<Option<i64>>, Option<(i64, i64)>) {
    let times: Vec<Option<i64>> = trace
        .events
        .iter()
        .map(|e| event_time(e).map(|t| t.timestamp_millis()))
        .collect();
    let span = times
        .iter()
        .flatten()
        .fold(None, |acc: Option<(i64, i64)>, &t| {
            Some(acc.map_or((t, t), |(lo, hi)| (lo.min(t), hi.max(t))))
        });
    (times, span)
}

/// Of `(duration, case index)`, the cases more than ten times longer than the 99th percentile,
/// judged only with at least 100 cases.
fn long_cases_of(durations: &[(f64, usize)]) -> Vec<usize> {
    if durations.len() < 100 {
        return Vec::new();
    }
    let mut sorted: Vec<f64> = durations.iter().map(|d| d.0).collect();
    sorted.sort_by(|a, b| a.total_cmp(b));
    let limit = 10.0 * quantile_sorted(&sorted, 0.99);
    durations
        .iter()
        .filter(|&&(d, _)| limit > 0.0 && d > limit)
        .map(|&(_, i)| i)
        .collect()
}

/// Indices of the cases [`get_log_health`] reports as extremely long.
pub(crate) fn long_case_indices(log: &EventLog) -> Vec<usize> {
    let durations: Vec<(f64, usize)> = log
        .traces
        .iter()
        .enumerate()
        .filter_map(|(i, t)| case_times(t).1.map(|(lo, hi)| ((hi - lo) as f64, i)))
        .collect();
    long_cases_of(&durations)
}

/// Data-quality checks over an event log: missing or misordered timestamps, date-only times,
/// duplicate events, empty cases, missing activities, attributes with mixed types, and extreme
/// case durations.
#[register_binding]
pub fn get_log_health(event_log: &EventLog) -> LogHealth {
    let mut no_time = Tally::default();
    let mut unordered = Tally::default();
    let mut midnight = Tally::default();
    let mut epoch = Tally::default();
    let mut duplicates = Tally::default();
    let mut empty = Tally::default();
    let mut no_activity = Tally::default();
    let mut tied = Tally::default();
    let mut long_cases = Tally::default();
    let mut attr_types: HashMap<&str, BTreeSet<&'static str>> = HashMap::new();
    let mut timed = 0;
    let mut durations: Vec<(f64, usize)> = Vec::new();
    let num_events: usize = event_log.traces.iter().map(|t| t.events.len()).sum();

    for (i, trace) in event_log.traces.iter().enumerate() {
        let id = || case_id(trace, i);
        if trace.events.is_empty() {
            empty.add(id);
            continue;
        }
        let mut seen: HashSet<(&str, Option<&str>, i64)> = HashSet::new();
        let mut last: Option<i64> = None;
        let mut has_tie = false;
        for event in &trace.events {
            for a in &event.attributes {
                attr_types
                    .entry(a.key.as_str())
                    .or_default()
                    .insert(type_name(&a.value));
            }
            let activity = event_activity(event);
            if activity.is_none() {
                no_activity.add(id);
            }
            let Some(t) = event_time(event) else {
                no_time.add(id);
                continue;
            };
            timed += 1;
            let ms = t.timestamp_millis();
            if ms == 0 {
                epoch.add(id);
            }
            if t.hour() == 0 && t.minute() == 0 && t.second() == 0 && t.nanosecond() == 0 {
                midnight.add(id);
            }
            if last.is_some_and(|l| ms < l) {
                unordered.add(id);
            }
            has_tie |= last == Some(ms);
            last = Some(ms);
            if !seen.insert((activity.unwrap_or(""), event_lifecycle(event), ms)) {
                duplicates.add(id);
            }
        }
        if has_tie {
            tied.add(id);
        }
        if let (_, Some((lo, hi))) = case_times(trace) {
            durations.push(((hi - lo) as f64, i));
        }
    }

    for i in long_cases_of(&durations) {
        long_cases.add(|| case_id(&event_log.traces[i], i));
    }
    // A few events at midnight are normal; only a log where most are has date-only timestamps.
    if midnight.count * 2 <= timed {
        midnight = Tally::default();
    }
    let mut mixed = Tally::default();
    let mut keys: Vec<(&&str, &BTreeSet<&str>)> =
        attr_types.iter().filter(|(_, t)| t.len() > 1).collect();
    keys.sort();
    for (k, types) in keys {
        mixed.add(|| {
            format!(
                "{k}: {}",
                types.iter().copied().collect::<Vec<_>>().join(", ")
            )
        });
    }

    let remove = |defect, what: &str| {
        vec![
            HealthFix::new(
                "remove_events",
                "Remove these events",
                &format!("Removes the events {what}."),
                true,
                vec![Repair::RemoveEvents { defect }],
            ),
            HealthFix::new(
                "remove_cases",
                "Remove their cases",
                &format!("Removes every case with an event {what}."),
                false,
                vec![Repair::RemoveCasesWith { defect }],
            ),
        ]
    };
    let mut findings = vec![
        finding(
            "events_without_activity",
            "Events without an activity",
            "Missing event type",
            "Events with no concept:name. Discovery and conformance checking cannot place them.",
            Severity::Warning,
            no_activity,
            remove(EventDefect::NoActivity, "without an activity"),
        ),
        finding(
            "epoch_timestamps",
            "Events at 1970-01-01",
            "Incorrect time",
            "Events with the time 1970-01-01T00:00:00Z, usually a missing timestamp. Durations that include them are wrong.",
            Severity::Warning,
            epoch,
            remove(EventDefect::EpochTime, "at 1970-01-01"),
        ),
        finding(
            "events_without_time",
            "Events without a timestamp",
            "Missing time",
            "Events with no readable time:timestamp. Time-based views leave them out.",
            Severity::Warning,
            no_time,
            remove(EventDefect::NoTime, "without a timestamp"),
        ),
        finding(
            "unordered_events",
            "Events out of time order",
            "Incorrect time",
            "Events earlier than the event before them in their case. Directly-follows relations use the file order, so they may contradict the times.",
            Severity::Warning,
            unordered,
            vec![HealthFix::new(
                "sort",
                "Sort cases by time",
                "Sorts the events of each case by time. Events with equal times keep their file order.",
                true,
                vec![Repair::SortCasesByTime],
            )],
        ),
        finding(
            "duplicate_events",
            "Duplicate events",
            "Incorrect event",
            "Events with the same activity, lifecycle transition and time as an earlier event of the same case. Often a double export, sometimes a real batch.",
            Severity::Warning,
            duplicates,
            vec![
                HealthFix::new(
                    "remove_exact",
                    "Remove exact copies",
                    "Removes events whose attributes all equal those of an earlier event of their case.",
                    true,
                    vec![Repair::RemoveDuplicateEvents { exact: true }],
                ),
                HealthFix::new(
                    "remove_all",
                    "Remove all repeats",
                    "Removes every event with the activity, lifecycle transition and time of an earlier event of its case, even if other attributes differ.",
                    false,
                    vec![Repair::RemoveDuplicateEvents { exact: false }],
                ),
            ],
        ),
        finding(
            "empty_cases",
            "Cases without events",
            "Irrelevant case",
            "Traces with no events. They count as cases but appear in no view.",
            Severity::Warning,
            empty,
            vec![HealthFix::new(
                "remove",
                "Remove these cases",
                "Removes the cases without events.",
                true,
                vec![Repair::RemoveEmptyCases],
            )],
        ),
        finding(
            "mixed_type_attributes",
            "Attributes with mixed types",
            "Incorrect attribute value",
            "Event attributes whose values have different types in different events. Filters and statistics may misread them.",
            Severity::Warning,
            mixed,
            Vec::new(),
        ),
        finding(
            "extreme_durations",
            "Very long cases",
            "Incorrect time",
            "Cases more than ten times longer than the 99th percentile. Often a wrong timestamp, sometimes a real outlier.",
            Severity::Info,
            long_cases,
            vec![HealthFix::new(
                "remove",
                "Remove these cases",
                "Removes the cases more than ten times longer than the 99th percentile.",
                false,
                vec![Repair::RemoveLongCases],
            )],
        ),
        finding(
            "date_only",
            "Timestamps without a time of day",
            "Imprecise time",
            "Most events are at midnight: the timestamps carry dates only, so durations under a day are unknown.",
            Severity::Info,
            midnight,
            Vec::new(),
        ),
        finding(
            "tied_events",
            "Events at the same time",
            "Imprecise time",
            "Cases with consecutive events at the same time. Their order comes from the file, not from the times.",
            Severity::Info,
            tied,
            vec![HealthFix::new(
                "order",
                "Spread equal times by 1 ms",
                "Adds 1 ms steps between events of a case that share a timestamp, ordered by where their activity typically occurs in a case and then by file order.",
                true,
                vec![Repair::OrderTies],
            )],
        ),
    ];
    findings.sort_by_key(|f| (f.count == 0, f.severity));
    LogHealth {
        num_cases: event_log.traces.len(),
        num_events,
        findings,
    }
}

fn throughput(spans: &[(i64, i64)]) -> Throughput {
    let Some(min) = spans.iter().map(|s| s.0).min() else {
        return Throughput {
            bin_starts_ms: Vec::new(),
            bin_width_ms: 1,
            started: Vec::new(),
            finished: Vec::new(),
            median_duration_ms: Vec::new(),
        };
    };
    let max = spans.iter().map(|s| s.1).max().unwrap_or(min);
    let width = ((max - min) / THROUGHPUT_BINS as i64 + 1).max(1);
    let bin = |t: i64| (((t - min) / width) as usize).min(THROUGHPUT_BINS - 1);
    let mut started = vec![0; THROUGHPUT_BINS];
    let mut finished = vec![0; THROUGHPUT_BINS];
    let mut durations: Vec<Vec<f64>> = vec![Vec::new(); THROUGHPUT_BINS];
    for &(lo, hi) in spans {
        started[bin(lo)] += 1;
        finished[bin(hi)] += 1;
        durations[bin(lo)].push((hi - lo) as f64);
    }
    Throughput {
        bin_starts_ms: (0..THROUGHPUT_BINS as i64)
            .map(|i| min + i * width)
            .collect(),
        bin_width_ms: width,
        started,
        finished,
        median_duration_ms: durations
            .iter_mut()
            .map(|d| summarize(d).map(|s| s.median))
            .collect(),
    }
}

/// Everything the log overview shows, in one call.
#[register_binding]
pub fn get_log_overview(event_log: &EventLog) -> LogOverview {
    let mut projection = EventLogActivityProjection::from(event_log);
    projection.traces.sort_by_key(|t| std::cmp::Reverse(t.1));
    let top_variants = projection
        .traces
        .iter()
        .take(TOP_VARIANTS)
        .map(|(acts, n)| VariantShare {
            activities: acts
                .iter()
                .map(|&a| projection.activities[a].clone())
                .collect(),
            cases: *n as usize,
        })
        .collect();

    let mut counts: HashMap<String, usize> = HashMap::new();
    for e in event_log.traces.iter().flat_map(|t| t.events.iter()) {
        *counts
            .entry(event_activity(e).unwrap_or(NO_ACTIVITY).to_string())
            .or_default() += 1;
    }
    let mut activities: Vec<(String, usize)> = counts.into_iter().collect();
    activities.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

    let spans: Vec<(i64, i64)> = event_log
        .traces
        .iter()
        .filter_map(|t| case_times(t).1)
        .collect();
    let mut durations: Vec<f64> = spans.iter().map(|(lo, hi)| (hi - lo) as f64).collect();
    let summary = summarize(&mut durations);
    let health = get_log_health(event_log);
    LogOverview {
        num_cases: event_log.traces.len(),
        num_events: health.num_events,
        num_activities: activities.len(),
        num_variants: projection.traces.len(),
        start_ms: spans.iter().map(|s| s.0).min(),
        end_ms: spans.iter().map(|s| s.1).max(),
        median_case_duration_ms: summary.as_ref().map(|s| s.median),
        p90_case_duration_ms: summary.as_ref().map(|s| s.p90),
        top_variants,
        activities,
        throughput: throughput(&spans),
        health,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use process_mining::Importable;

    fn ev(attrs: &str) -> String {
        format!("<event>{attrs}</event>")
    }
    fn act(a: &str, t: &str) -> String {
        ev(&format!(
            r#"<string key="concept:name" value="{a}"/><date key="time:timestamp" value="{t}"/>"#
        ))
    }
    fn log(traces: &[String]) -> EventLog {
        let body: String = traces
            .iter()
            .map(|t| format!("<trace>{t}</trace>"))
            .collect();
        EventLog::import_from_bytes(format!("<log>{body}</log>").as_bytes(), "xes").unwrap()
    }
    fn count(h: &LogHealth, check: &str) -> usize {
        h.findings.iter().find(|f| f.check == check).unwrap().count
    }

    #[test]
    fn each_check_finds_its_problem() {
        let l = log(&[
            act("a", "2024-01-01T10:00:00Z") + &act("b", "2024-01-01T09:00:00Z"),
            act("a", "2024-01-02T10:00:00Z") + &act("a", "2024-01-02T10:00:00Z"),
            String::new(),
            ev(r#"<string key="concept:name" value="c"/>"#),
            ev(r#"<date key="time:timestamp" value="2024-01-03T10:00:00Z"/>"#),
            ev(
                r#"<string key="concept:name" value="d"/><date key="time:timestamp" value="1970-01-01T00:00:00Z"/><int key="x" value="1"/>"#,
            ) + &ev(
                r#"<string key="concept:name" value="d"/><date key="time:timestamp" value="1970-01-01T00:00:00Z"/><string key="x" value="y"/>"#,
            ),
        ]);
        let h = get_log_health(&l);
        assert_eq!(count(&h, "unordered_events"), 1);
        assert_eq!(
            count(&h, "duplicate_events"),
            2,
            "case 2 and the epoch pair"
        );
        assert_eq!(count(&h, "empty_cases"), 1);
        assert_eq!(count(&h, "events_without_time"), 1);
        assert_eq!(count(&h, "events_without_activity"), 1);
        assert_eq!(count(&h, "epoch_timestamps"), 2);
        assert_eq!(count(&h, "mixed_type_attributes"), 1);
        assert_eq!(count(&h, "tied_events"), 2);
        assert_eq!(count(&h, "date_only"), 0, "2 of 7 timed events at midnight");
        assert_eq!(h.findings[0].severity, Severity::Warning);
        assert!(h
            .findings
            .iter()
            .all(|f| (f.count > 0) || f.fixes.is_empty()));

        let repairs: Vec<_> = h
            .findings
            .iter()
            .flat_map(|f| f.fixes.iter().filter(|x| x.recommended))
            .flat_map(|x| x.repairs.clone())
            .collect();
        let fixed = get_log_health(&crate::repairs::repair_event_log(&l, repairs));
        for check in [
            "unordered_events",
            "duplicate_events",
            "empty_cases",
            "events_without_time",
            "events_without_activity",
            "epoch_timestamps",
        ] {
            assert_eq!(count(&fixed, check), 0, "{check} after its fix");
        }
    }

    #[test]
    fn date_only_logs_and_extreme_cases() {
        let mut traces: Vec<String> = (1..=150)
            .map(|d| {
                act("a", "2024-01-01T00:00:00Z")
                    + &act("b", &format!("2024-01-0{}T00:00:00Z", 1 + d % 2))
            })
            .collect();
        traces.push(act("a", "2024-01-01T00:00:00Z") + &act("b", "2030-01-01T00:00:00Z"));
        let h = get_log_health(&log(&traces));
        assert_eq!(count(&h, "date_only"), 302);
        let date_only = h.findings.iter().find(|f| f.check == "date_only").unwrap();
        let distinct: HashSet<&String> = date_only.examples.iter().collect();
        assert_eq!(
            distinct.len(),
            date_only.examples.len(),
            "examples name distinct cases"
        );
        assert_eq!(count(&h, "extreme_durations"), 1);
    }

    #[test]
    fn overview_summarizes_the_log() {
        let l = log(&[
            act("a", "2024-01-01T00:00:00Z") + &act("b", "2024-01-03T00:00:00Z"),
            act("a", "2024-01-02T00:00:00Z") + &act("b", "2024-01-03T00:00:00Z"),
            act("a", "2024-01-05T00:00:00Z"),
        ]);
        let o = get_log_overview(&l);
        assert_eq!(
            (o.num_cases, o.num_events, o.num_activities, o.num_variants),
            (3, 5, 2, 2)
        );
        assert_eq!(o.top_variants[0].activities, vec!["a", "b"]);
        assert_eq!(o.top_variants[0].cases, 2);
        assert_eq!(o.activities[0], ("a".to_string(), 3));
        assert_eq!(o.median_case_duration_ms, Some(86_400_000.0));
        assert_eq!(o.throughput.started.iter().sum::<usize>(), 3);
        assert_eq!(o.throughput.finished.iter().sum::<usize>(), 3);
    }
}
