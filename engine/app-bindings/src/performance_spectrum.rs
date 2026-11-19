//! Performance spectrum (Denisov et al.): every passage of a case through a segment `a -> b`
//! as a line from the time of `a` to the time of `b`.

use std::collections::HashMap;

use process_mining::bindings::register_binding;
use process_mining::core::event_data::case_centric::utils::activity_projection::EventLogActivityProjection;
use process_mining::EventLog;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::xes_event::{event_activity, event_time_ms};

/// Enough to pick from in a searchable list, small enough to send each time.
const TOP_VARIANTS: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SpectrumSegment {
    pub from: String,
    pub to: String,
    /// Passages through the segment (a directly followed by b, both with a time)
    pub count: usize,
    /// `[time of a, time of b]` in epoch milliseconds, sorted by the time of a; sampled evenly
    /// down to `max_lines` when there are more
    pub lines: Vec<[i64; 2]>,
    /// Quartiles of the segment's durations in milliseconds, for coloring
    pub quartiles: [f64; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SpectrumVariant {
    pub activities: Vec<String>,
    pub cases: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct PerformanceSpectrum {
    /// The path the segments follow
    pub path: Vec<String>,
    pub segments: Vec<SpectrumSegment>,
    pub min_ms: i64,
    pub max_ms: i64,
    /// The most frequent variants, as paths to pick from
    pub top_variants: Vec<SpectrumVariant>,
    /// Cases in the log, for the share of each variant
    pub num_cases: usize,
}

/// The performance spectrum along `path` (default: the most frequent variant). Each segment holds
/// at most `max_lines` (default 20,000) lines.
#[register_binding]
pub fn get_performance_spectrum(
    event_log: &EventLog,
    #[bind(default)] path: Option<Vec<String>>,
    #[bind(default)] max_lines: Option<usize>,
) -> PerformanceSpectrum {
    let max_lines = max_lines.unwrap_or(20_000).max(1);
    let mut projection = EventLogActivityProjection::from(event_log);
    projection.traces.sort_by_key(|t| std::cmp::Reverse(t.1));
    let top_variants: Vec<SpectrumVariant> = projection
        .traces
        .iter()
        .take(TOP_VARIANTS)
        .map(|(acts, n)| SpectrumVariant {
            activities: acts
                .iter()
                .map(|&a| projection.activities[a].clone())
                .collect(),
            cases: *n as usize,
        })
        .collect();
    let path = path
        .filter(|p| p.len() >= 2)
        .or_else(|| top_variants.first().map(|v| v.activities.clone()))
        .unwrap_or_default();

    // Distinct segments in path order; a loop in the path does not repeat a segment.
    let mut segments: Vec<(String, String)> = Vec::new();
    for w in path.windows(2) {
        let s = (w[0].clone(), w[1].clone());
        if !segments.contains(&s) {
            segments.push(s);
        }
    }
    let index: HashMap<(&str, &str), usize> = segments
        .iter()
        .enumerate()
        .map(|(i, (a, b))| ((a.as_str(), b.as_str()), i))
        .collect();
    let mut lines: Vec<Vec<[i64; 2]>> = vec![Vec::new(); segments.len()];
    for trace in &event_log.traces {
        let evs: Vec<(&str, Option<i64>)> = trace
            .events
            .iter()
            .map(|e| (event_activity(e).unwrap_or("UNKNOWN"), event_time_ms(e)))
            .collect();
        for w in evs.windows(2) {
            if let (Some(&i), (_, Some(ta)), (_, Some(tb))) =
                (index.get(&(w[0].0, w[1].0)), w[0], w[1])
            {
                lines[i].push([ta, tb]);
            }
        }
    }

    let (mut min_ms, mut max_ms) = (i64::MAX, i64::MIN);
    let segments = segments
        .into_iter()
        .zip(lines)
        .map(|((from, to), mut l)| {
            l.sort_unstable();
            for [a, b] in &l {
                min_ms = min_ms.min(*a);
                max_ms = max_ms.max(*b);
            }
            let mut d: Vec<f64> = l.iter().map(|[a, b]| (b - a) as f64).collect();
            d.sort_by(|x, y| x.total_cmp(y));
            let q = |p: f64| {
                d.get(((d.len() as f64 - 1.0) * p).round() as usize)
                    .copied()
                    .unwrap_or(0.0)
            };
            let quartiles = [q(0.25), q(0.5), q(0.75)];
            let count = l.len();
            if count > max_lines {
                let step = count as f64 / max_lines as f64;
                l = (0..max_lines)
                    .map(|i| l[(i as f64 * step) as usize])
                    .collect();
            }
            SpectrumSegment {
                from,
                to,
                count,
                lines: l,
                quartiles,
            }
        })
        .collect();
    if min_ms > max_ms {
        (min_ms, max_ms) = (0, 0);
    }
    PerformanceSpectrum {
        path,
        segments,
        min_ms,
        max_ms,
        top_variants,
        num_cases: event_log.traces.len(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use process_mining::Importable;

    #[test]
    fn collects_passages_along_the_most_frequent_variant() {
        let ev = |a: &str, d: &str| {
            format!(
                r#"<event><string key="concept:name" value="{a}"/><date key="time:timestamp" value="2024-01-{d}T00:00:00Z"/></event>"#
            )
        };
        let xes = format!(
            "<log><trace>{}{}{}</trace><trace>{}{}{}</trace><trace>{}{}</trace></log>",
            ev("a", "01"),
            ev("b", "02"),
            ev("c", "04"),
            ev("a", "03"),
            ev("b", "05"),
            ev("c", "06"),
            ev("a", "01"),
            ev("c", "09"),
        );
        let log = EventLog::import_from_bytes(xes.as_bytes(), "xes").unwrap();
        let s = get_performance_spectrum(&log, None, None);
        assert_eq!(s.path, vec!["a", "b", "c"]);
        assert_eq!(s.segments.len(), 2);
        assert_eq!(s.segments[0].count, 2);
        let day = 86_400_000;
        assert_eq!(s.segments[0].lines[0][1] - s.segments[0].lines[0][0], day);
        let sampled = get_performance_spectrum(&log, Some(vec!["a".into(), "c".into()]), Some(1));
        assert_eq!(
            (sampled.segments[0].count, sampled.segments[0].lines.len()),
            (1, 1)
        );
    }
}
