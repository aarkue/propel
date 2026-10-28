//! Variant timing for Schwanen-Küsters plots: paged variant summaries and the per-step elapsed time
//! since case start.
use std::cmp::Ordering;
use std::sync::{Arc, Mutex, OnceLock};

use process_mining::bindings::register_binding;
use process_mining::core::event_data::case_centric::{Trace, XESEditableAttribute};
use process_mining::EventLog;
use rustc_hash::FxHashMap;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::event_log::{get_event_activity, get_event_time_ms};

/// Distribution of the elapsed time since case start at one step of a variant, in ms.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct StepTimeStats {
    pub min_ms: f64,
    pub p10_ms: f64,
    pub p25_ms: f64,
    pub median_ms: f64,
    pub p75_ms: f64,
    pub p90_ms: f64,
    pub max_ms: f64,
    pub mean_ms: f64,
}

/// One case with its elapsed time since case start per step, in ms.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CaseTimeCurve {
    pub case_id: String,
    pub elapsed_ms: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct VariantSummary {
    /// 0-based frequency rank.
    pub rank: usize,
    pub activities: Vec<String>,
    pub num_cases: usize,
    /// Median time from case start to the last step.
    pub median_total_ms: f64,
    /// Activity indices the query matched.
    pub matched: Vec<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct VariantTimingPage {
    /// Variants matching the query.
    pub total: usize,
    /// Variants among the timed cases.
    pub num_variants: usize,
    pub num_timed_cases: usize,
    /// Cases with an untimed event, left out of all results.
    pub num_untimed_cases: usize,
    pub rows: Vec<VariantSummary>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum VariantSort {
    Frequency,
    SlowestFirst,
    FastestFirst,
    LongestFirst,
    ShortestFirst,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum CaseSort {
    LogOrder,
    FastestFirst,
    SlowestFirst,
}

/// Timing of one variant over all its cases, plus one page of those cases.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct VariantTimeProfile {
    pub rank: usize,
    /// Position in `variant_sort` order.
    pub sort_position: usize,
    pub activities: Vec<String>,
    pub num_cases: usize,
    /// One entry per step, aligned with `activities`.
    pub steps: Vec<StepTimeStats>,
    /// Cases matching the case query.
    pub cases_total: usize,
    pub cases: Vec<CaseTimeCurve>,
    /// Position of `focus_case` in `case_sort` order.
    pub focus_index: Option<usize>,
}

/// Per-variant data the profile binding reuses across case pages.
struct VariantDetail {
    steps: Vec<StepTimeStats>,
    /// (case id, elapsed ms per step) in log order.
    curves: Vec<(String, Vec<f64>)>,
    /// Curve indices, fastest first.
    fastest: Vec<u32>,
}

const CACHED_DETAILS: usize = 8;

struct Variant {
    seq: Vec<u32>,
    /// Trace indices in log order.
    cases: Vec<usize>,
    /// Median time from case start to the last event.
    median_total_ms: f64,
}

/// The log's timed cases grouped by activity sequence, most frequent first.
struct Grouped {
    names: Vec<String>,
    names_lower: Vec<String>,
    variants: Vec<Variant>,
    num_timed_cases: usize,
    num_untimed_cases: usize,
    /// Per non-frequency sort: ranks in that order and each rank's position.
    orders: [OnceLock<(Vec<u32>, Vec<u32>)>; 4],
    details: Mutex<Vec<(usize, Arc<VariantDetail>)>>,
}

impl Grouped {
    /// None for [`VariantSort::Frequency`], which is rank order.
    fn order(&self, sort: VariantSort) -> Option<&(Vec<u32>, Vec<u32>)> {
        let slot = match sort {
            VariantSort::Frequency => return None,
            VariantSort::SlowestFirst => 0,
            VariantSort::FastestFirst => 1,
            VariantSort::LongestFirst => 2,
            VariantSort::ShortestFirst => 3,
        };
        Some(self.orders[slot].get_or_init(|| {
            let v = &self.variants;
            let mut order: Vec<u32> = (0..v.len() as u32).collect();
            let by_median = |a: &u32, b: &u32| {
                v[*a as usize]
                    .median_total_ms
                    .partial_cmp(&v[*b as usize].median_total_ms)
                    .unwrap_or(Ordering::Equal)
            };
            let by_len = |a: &u32, b: &u32| v[*a as usize].seq.len().cmp(&v[*b as usize].seq.len());
            // Stable sorts keep rank order among ties.
            match sort {
                VariantSort::SlowestFirst => order.sort_by(|a, b| by_median(b, a)),
                VariantSort::FastestFirst => order.sort_by(by_median),
                VariantSort::LongestFirst => order.sort_by(|a, b| by_len(b, a)),
                _ => order.sort_by(by_len),
            }
            let mut pos = vec![0u32; order.len()];
            for (p, &r) in order.iter().enumerate() {
                pos[r as usize] = p as u32;
            }
            (order, pos)
        }))
    }
}

fn elapsed_of(trace: &Trace) -> Option<Vec<i64>> {
    let times: Option<Vec<i64>> = trace.events.iter().map(get_event_time_ms).collect();
    let times = times.filter(|t| !t.is_empty())?;
    let start = times[0];
    Some(times.into_iter().map(|t| t - start).collect())
}

fn group(log: &EventLog) -> Grouped {
    let mut ids: FxHashMap<&str, u32> = FxHashMap::default();
    let mut names: Vec<&str> = Vec::new();
    let mut by_seq: FxHashMap<Vec<u32>, usize> = FxHashMap::default();
    // (sequence, trace indices, case totals)
    let mut acc: Vec<(Vec<u32>, Vec<usize>, Vec<f64>)> = Vec::new();
    let mut num_untimed_cases = 0;
    for (case_index, trace) in log.traces.iter().enumerate() {
        let Some(elapsed) = elapsed_of(trace) else {
            num_untimed_cases += 1;
            continue;
        };
        let seq: Vec<u32> = trace
            .events
            .iter()
            .map(|e| {
                let name = get_event_activity(e).unwrap_or("UNKNOWN");
                *ids.entry(name).or_insert_with(|| {
                    names.push(name);
                    (names.len() - 1) as u32
                })
            })
            .collect();
        let total = *elapsed.last().unwrap_or(&0) as f64;
        let idx = *by_seq.entry(seq).or_insert_with_key(|seq| {
            acc.push((seq.clone(), Vec::new(), Vec::new()));
            acc.len() - 1
        });
        acc[idx].1.push(case_index);
        acc[idx].2.push(total);
    }
    let mut variants: Vec<Variant> = acc
        .into_iter()
        .map(|(seq, cases, totals)| Variant {
            seq,
            cases,
            median_total_ms: median(&totals),
        })
        .collect();
    let num_timed_cases = variants.iter().map(|v| v.cases.len()).sum();
    // Ties break on interned ids. Comparing names is slow when most variants occur once.
    variants.sort_unstable_by(|a, b| {
        b.cases
            .len()
            .cmp(&a.cases.len())
            .then_with(|| a.seq.cmp(&b.seq))
    });
    Grouped {
        names_lower: names.iter().map(|n| n.to_lowercase()).collect(),
        names: names.into_iter().map(str::to_string).collect(),
        variants,
        num_timed_cases,
        num_untimed_cases,
        orders: Default::default(),
        details: Mutex::new(Vec::new()),
    }
}

/// Address plus a cheap fingerprint, so a later log at a reused address is not taken for this one.
/// Registry logs are never mutated in place (transforms produce new logs).
#[derive(Clone, PartialEq, Eq)]
struct LogKey {
    addr: usize,
    num_traces: usize,
    num_events: usize,
    ends: Option<(usize, usize, Option<i64>, Option<i64>)>,
}

impl LogKey {
    fn of(log: &EventLog) -> Self {
        let ends = log.traces.first().zip(log.traces.last()).map(|(f, l)| {
            (
                f.events.len(),
                l.events.len(),
                f.events.first().and_then(get_event_time_ms),
                l.events.last().and_then(get_event_time_ms),
            )
        });
        LogKey {
            addr: log as *const EventLog as usize,
            num_traces: log.traces.len(),
            num_events: log.traces.iter().map(|t| t.events.len()).sum(),
            ends,
        }
    }
}

/// Each cached grouping costs about one `usize` per case.
const CACHED_LOGS: usize = 4;
#[allow(clippy::type_complexity)]
static CACHE: Mutex<Vec<(LogKey, Arc<Grouped>)>> = Mutex::new(Vec::new());

/// [`group`], memoized per log.
fn grouped(log: &EventLog) -> Arc<Grouped> {
    let key = LogKey::of(log);
    {
        let mut cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(i) = cache.iter().position(|(k, _)| *k == key) {
            let hit = cache.remove(i);
            let g = hit.1.clone();
            cache.push(hit);
            return g;
        }
    }
    // Scan unlocked so calls for other logs do not wait.
    let g = Arc::new(group(log));
    let mut cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    if !cache.iter().any(|(k, _)| *k == key) {
        if cache.len() >= CACHED_LOGS {
            cache.remove(0);
        }
        cache.push((key, g.clone()));
    }
    g
}

impl Grouped {
    /// Step statistics and case curves of the variant at `rank`, memoized.
    fn detail(&self, log: &EventLog, rank: usize) -> Arc<VariantDetail> {
        let mut cache = self.details.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(i) = cache.iter().position(|(r, _)| *r == rank) {
            let hit = cache.remove(i);
            let d = hit.1.clone();
            cache.push(hit);
            return d;
        }
        let v = &self.variants[rank];
        let curves: Vec<(String, Vec<f64>)> = v
            .cases
            .iter()
            .filter_map(|&ci| {
                let trace = &log.traces[ci];
                let e = elapsed_of(trace)?;
                let id = trace
                    .attributes
                    .get_by_key("concept:name")
                    .and_then(|a| a.value.try_as_string())
                    .cloned()
                    .unwrap_or_else(|| format!("case {}", ci + 1));
                Some((id, e.into_iter().map(|x| x as f64).collect()))
            })
            .collect();
        let steps = (0..v.seq.len())
            .map(|s| {
                let mut values: Vec<f64> = curves.iter().map(|(_, e)| e[s]).collect();
                step_time_stats(&mut values)
            })
            .collect();
        let total = |i: u32| curves[i as usize].1.last().copied().unwrap_or(0.0);
        let mut fastest: Vec<u32> = (0..curves.len() as u32).collect();
        fastest.sort_by(|a, b| total(*a).partial_cmp(&total(*b)).unwrap_or(Ordering::Equal));
        let d = Arc::new(VariantDetail {
            steps,
            curves,
            fastest,
        });
        if cache.len() >= CACHED_DETAILS {
            cache.remove(0);
        }
        cache.push((rank, d.clone()));
        d
    }
}

fn tokens(query: &str) -> Vec<String> {
    query.split_whitespace().map(str::to_lowercase).collect()
}

/// `#<n>`: the 1-based rank the query asks for, if it is one.
fn rank_query(query: &str) -> Option<usize> {
    query.trim().strip_prefix('#')?.parse().ok()
}

/// Ordered fuzzy match, with the algorithm and scores of `matchVariant` in the components'
/// `variant-time-profile-data.ts` (documented there).
pub fn match_variant<S: AsRef<str>>(
    activities_lower: &[S],
    tokens: &[String],
) -> Option<(f64, Vec<usize>)> {
    match_by(
        activities_lower.len(),
        |i| activities_lower[i].as_ref(),
        tokens,
    )
}

fn match_by<'a>(
    len: usize,
    name: impl Fn(usize) -> &'a str,
    tokens: &[String],
) -> Option<(f64, Vec<usize>)> {
    if tokens.is_empty() {
        return Some((0.0, Vec::new()));
    }
    let mut matched: Vec<usize> = Vec::new();
    let (mut ai, mut offset, mut word_starts) = (0usize, 0usize, 0usize);
    for token in tokens {
        let mut found = false;
        while ai < len {
            let n = name(ai);
            if let Some(rel) = n[offset..].find(token.as_str()) {
                let at = offset + rel;
                if matched.last() != Some(&ai) {
                    matched.push(ai);
                }
                if !n[..at]
                    .chars()
                    .next_back()
                    .is_some_and(char::is_alphanumeric)
                {
                    word_starts += 1;
                }
                offset = at + token.len();
                found = true;
                break;
            }
            ai += 1;
            offset = 0;
        }
        if !found {
            return None;
        }
    }
    let span = matched[matched.len() - 1] - matched[0] + 1;
    let skipped = span - matched.len();
    let coverage = matched.len() as f64 / len as f64;
    let score =
        2.0 * coverage + 0.5 * (word_starts as f64 / tokens.len() as f64) - 0.05 * skipped as f64;
    Some((score, matched))
}

/// A token's occurrences in one activity name: (byte offset, end, at a word start).
type Occurrences = Vec<(usize, usize, bool)>;

/// Token occurrences per distinct activity name, found once per query. Matches like [`match_by`].
struct TokenIndex {
    /// `[token][name id]`
    occurrences: Vec<Vec<Occurrences>>,
}

impl TokenIndex {
    fn new(names_lower: &[String], tokens: &[String]) -> Self {
        let occurrences = tokens
            .iter()
            .map(|tok| {
                names_lower
                    .iter()
                    .map(|n| {
                        overlapping_matches(n, tok)
                            .into_iter()
                            .map(|at| {
                                let word_start = !n[..at]
                                    .chars()
                                    .next_back()
                                    .is_some_and(char::is_alphanumeric);
                                (at, at + tok.len(), word_start)
                            })
                            .collect()
                    })
                    .collect()
            })
            .collect();
        TokenIndex { occurrences }
    }

    fn match_seq(&self, seq: &[u32]) -> Option<(f64, Vec<usize>)> {
        let num_tokens = self.occurrences.len();
        let mut matched: Vec<usize> = Vec::new();
        let (mut ai, mut offset, mut word_starts) = (0usize, 0usize, 0usize);
        for occ in &self.occurrences {
            let mut found = false;
            while ai < seq.len() {
                if let Some(&(_, end, word_start)) = occ[seq[ai] as usize]
                    .iter()
                    .find(|(at, _, _)| *at >= offset)
                {
                    if matched.last() != Some(&ai) {
                        matched.push(ai);
                    }
                    word_starts += usize::from(word_start);
                    offset = end;
                    found = true;
                    break;
                }
                ai += 1;
                offset = 0;
            }
            if !found {
                return None;
            }
        }
        if num_tokens == 0 {
            return Some((0.0, Vec::new()));
        }
        let span = matched[matched.len() - 1] - matched[0] + 1;
        let skipped = span - matched.len();
        let coverage = matched.len() as f64 / seq.len() as f64;
        let score =
            2.0 * coverage + 0.5 * (word_starts as f64 / num_tokens as f64) - 0.05 * skipped as f64;
        Some((score, matched))
    }
}

/// Byte offsets of all occurrences, overlapping ones included (`match_indices` skips those).
fn overlapping_matches(s: &str, tok: &str) -> Vec<usize> {
    let mut out = Vec::new();
    let mut start = 0;
    while let Some(rel) = s[start..].find(tok) {
        let at = start + rel;
        out.push(at);
        start = at + s[at..].chars().next().map_or(1, char::len_utf8);
        if start > s.len() {
            break;
        }
    }
    out
}

fn median(values: &[f64]) -> f64 {
    let mut v = values.to_vec();
    let n = v.len();
    if n == 0 {
        return 0.0;
    }
    let cmp = |a: &f64, b: &f64| a.partial_cmp(b).unwrap_or(Ordering::Equal);
    let (_, hi, _) = v.select_nth_unstable_by(n / 2, cmp);
    let hi = *hi;
    if n % 2 == 1 {
        return hi;
    }
    let lo = v[..n / 2].iter().copied().fold(f64::NEG_INFINITY, f64::max);
    (lo + hi) / 2.0
}

/// Nearest-rank quantile of an ascending, non-empty slice.
fn quantile_sorted(sorted: &[f64], q: f64) -> f64 {
    let idx = ((q * sorted.len() as f64).ceil() as usize)
        .saturating_sub(1)
        .min(sorted.len() - 1);
    sorted[idx]
}

fn step_time_stats(values: &mut [f64]) -> StepTimeStats {
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
    let n = values.len();
    let median_ms = if n.is_multiple_of(2) {
        (values[n / 2 - 1] + values[n / 2]) / 2.0
    } else {
        values[n / 2]
    };
    StepTimeStats {
        min_ms: values[0],
        p10_ms: quantile_sorted(values, 0.1),
        p25_ms: quantile_sorted(values, 0.25),
        median_ms,
        p75_ms: quantile_sorted(values, 0.75),
        p90_ms: quantile_sorted(values, 0.9),
        max_ms: values[n - 1],
        mean_ms: values.iter().sum::<f64>() / n as f64,
    }
}

/// One page of variants. A `query` keeps the variants whose activities match it in order (best
/// first), or the variant `#<n>`.
#[register_binding]
pub fn get_variant_timing_page(
    event_log: &EventLog,
    query: String,
    sort: VariantSort,
    offset: usize,
    limit: usize,
) -> VariantTimingPage {
    let g = grouped(event_log);
    let order = g.order(sort);
    // (rank, matched activity indices) for the page, and how many variants qualify.
    let (total, page): (usize, Vec<(usize, Vec<usize>)>) = if let Some(r) = rank_query(&query) {
        let hit = (r >= 1 && r <= g.variants.len()).then(|| (r - 1, Vec::new()));
        (
            hit.iter().len(),
            hit.into_iter().skip(offset).take(limit).collect(),
        )
    } else if query.trim().is_empty() {
        let ranks = (offset..g.variants.len().min(offset.saturating_add(limit)))
            .map(|p| order.map_or(p, |(o, _)| o[p] as usize));
        (g.variants.len(), ranks.map(|r| (r, Vec::new())).collect())
    } else {
        let index = TokenIndex::new(&g.names_lower, &tokens(&query));
        // Matched positions are only computed for the returned page.
        let mut hits: Vec<(usize, f64)> = g
            .variants
            .iter()
            .enumerate()
            .filter_map(|(rank, v)| index.match_seq(&v.seq).map(|(score, _)| (rank, score)))
            .collect();
        let pos = |rank: usize| order.map_or(rank, |(_, p)| p[rank] as usize);
        hits.sort_unstable_by(|a, b| {
            b.1.partial_cmp(&a.1)
                .unwrap_or(Ordering::Equal)
                .then_with(|| pos(a.0).cmp(&pos(b.0)))
        });
        let page = hits
            .iter()
            .skip(offset)
            .take(limit)
            .map(|&(r, _)| {
                (
                    r,
                    index
                        .match_seq(&g.variants[r].seq)
                        .map(|(_, m)| m)
                        .unwrap_or_default(),
                )
            })
            .collect();
        (hits.len(), page)
    };

    let rows = page
        .into_iter()
        .map(|(rank, matched)| {
            let v = &g.variants[rank];
            VariantSummary {
                rank,
                activities: v.seq.iter().map(|&i| g.names[i as usize].clone()).collect(),
                num_cases: v.cases.len(),
                median_total_ms: v.median_total_ms,
                matched,
            }
        })
        .collect();
    VariantTimingPage {
        total,
        num_variants: g.variants.len(),
        num_timed_cases: g.num_timed_cases,
        num_untimed_cases: g.num_untimed_cases,
        rows,
    }
}

/// Per-step timing of the variant with these `activities`, and one page of its cases in
/// `case_sort` order, filtered by `case_query`. With `focus_case` the page is just that case and
/// `focus_index` gives its position. None if no case has that variant.
#[allow(clippy::too_many_arguments)]
#[register_binding]
pub fn get_variant_time_profile(
    event_log: &EventLog,
    activities: Vec<String>,
    variant_sort: VariantSort,
    case_query: String,
    case_sort: CaseSort,
    case_offset: usize,
    case_limit: usize,
    focus_case: Option<String>,
) -> Option<VariantTimeProfile> {
    let g = grouped(event_log);
    let ids: FxHashMap<&str, u32> = g
        .names
        .iter()
        .enumerate()
        .map(|(i, n)| (n.as_str(), i as u32))
        .collect();
    let seq: Vec<u32> = activities
        .iter()
        .map(|a| ids.get(a.as_str()).copied())
        .collect::<Option<_>>()?;
    let rank = g.variants.iter().position(|v| v.seq == seq)?;
    let sort_position = g
        .order(variant_sort)
        .map_or(rank, |(_, pos)| pos[rank] as usize);
    let d = g.detail(event_log, rank);

    let ordered: Box<dyn Iterator<Item = usize> + '_> = match case_sort {
        CaseSort::LogOrder => Box::new(0..d.curves.len()),
        CaseSort::FastestFirst => Box::new(d.fastest.iter().map(|&i| i as usize)),
        CaseSort::SlowestFirst => Box::new(d.fastest.iter().rev().map(|&i| i as usize)),
    };
    let curve = |i: usize| CaseTimeCurve {
        case_id: d.curves[i].0.clone(),
        elapsed_ms: d.curves[i].1.clone(),
    };
    let (cases_total, cases, focus_index) = if let Some(focus) = focus_case {
        match ordered.enumerate().find(|(_, i)| d.curves[*i].0 == focus) {
            Some((pos, i)) => (1, vec![curve(i)], Some(pos)),
            None => (0, Vec::new(), None),
        }
    } else {
        let toks = tokens(&case_query);
        let listed: Vec<usize> = ordered
            .filter(|&i| {
                let id = d.curves[i].0.to_lowercase();
                toks.iter().all(|t| id.contains(t.as_str()))
            })
            .collect();
        let page = listed
            .iter()
            .skip(case_offset)
            .take(case_limit)
            .map(|&i| curve(i))
            .collect();
        (listed.len(), page, None)
    };

    Some(VariantTimeProfile {
        rank,
        sort_position,
        activities,
        num_cases: g.variants[rank].cases.len(),
        steps: d.steps.clone(),
        cases_total,
        cases,
        focus_index,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use process_mining::core::chrono::DateTime;
    use process_mining::core::event_data::case_centric::{Attribute, AttributeValue, Event, Trace};

    /// One trace per `(case id, [(activity, minutes after 0)])`. A `None` time leaves the event untimed.
    #[allow(clippy::type_complexity)]
    fn log(cases: &[(&str, &[(&str, Option<i64>)])]) -> EventLog {
        let mut log = EventLog::new();
        for (case_id, events) in cases {
            let mut trace = Trace::new();
            trace.attributes.add_attribute(Attribute::new(
                "concept:name".to_string(),
                AttributeValue::String(case_id.to_string()),
            ));
            for (activity, minutes) in events.iter() {
                let mut event = Event::new(activity.to_string());
                if let Some(m) = minutes {
                    let ts = DateTime::from_timestamp_millis(m * 60_000).unwrap();
                    event.attributes.add_attribute(Attribute::new(
                        "time:timestamp".to_string(),
                        AttributeValue::Date(ts.fixed_offset()),
                    ));
                }
                trace.events.push(event);
            }
            log.traces.push(trace);
        }
        log
    }

    const MIN: f64 = 60_000.0;

    fn sample() -> EventLog {
        log(&[
            (
                "c1",
                &[("a", Some(100)), ("b", Some(110)), ("c", Some(130))],
            ),
            ("c2", &[("a", Some(0)), ("b", Some(30)), ("c", Some(40))]),
            ("c3", &[("a", Some(5)), ("c", Some(6))]),
            ("c4", &[("a", Some(0)), ("b", None)]),
        ])
    }

    fn strs(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn page_lists_variants_by_frequency() {
        let p = get_variant_timing_page(&sample(), String::new(), VariantSort::Frequency, 0, 10);
        assert_eq!(
            (
                p.total,
                p.num_variants,
                p.num_timed_cases,
                p.num_untimed_cases
            ),
            (2, 2, 3, 1)
        );
        assert_eq!(p.rows[0].activities, strs(&["a", "b", "c"]));
        assert_eq!(p.rows[0].median_total_ms, 35.0 * MIN);
        assert_eq!(p.rows[1].rank, 1);
    }

    #[test]
    fn page_sorts_pages_and_searches() {
        let s = sample();
        let fastest = get_variant_timing_page(&s, String::new(), VariantSort::FastestFirst, 0, 1);
        assert_eq!((fastest.total, fastest.rows.len()), (2, 1));
        assert_eq!(fastest.rows[0].activities, strs(&["a", "c"]));
        let second = get_variant_timing_page(&s, String::new(), VariantSort::FastestFirst, 1, 1);
        assert_eq!(second.rows[0].activities, strs(&["a", "b", "c"]));

        let hit = get_variant_timing_page(&s, "a b".into(), VariantSort::Frequency, 0, 10);
        assert_eq!(hit.total, 1);
        assert_eq!(hit.rows[0].matched, vec![0, 1]);
        assert_eq!(
            get_variant_timing_page(&s, "c a".into(), VariantSort::Frequency, 0, 10).total,
            0
        );
        let by_rank = get_variant_timing_page(&s, "#2".into(), VariantSort::Frequency, 0, 10);
        assert_eq!(by_rank.rows[0].rank, 1);
    }

    #[test]
    fn profile_aggregates_and_pages_cases() {
        let s = sample();
        let p = get_variant_time_profile(
            &s,
            strs(&["a", "b", "c"]),
            VariantSort::Frequency,
            String::new(),
            CaseSort::SlowestFirst,
            0,
            1,
            None,
        )
        .unwrap();
        assert_eq!((p.rank, p.num_cases, p.cases_total), (0, 2, 2));
        assert_eq!(p.steps[1].mean_ms, 20.0 * MIN);
        assert_eq!(p.steps[2].median_ms, 35.0 * MIN);
        assert_eq!(p.cases[0].case_id, "c2");
        assert_eq!(p.cases[0].elapsed_ms, vec![0.0, 30.0 * MIN, 40.0 * MIN]);

        let filtered = get_variant_time_profile(
            &s,
            strs(&["a", "b", "c"]),
            VariantSort::Frequency,
            "C1".into(),
            CaseSort::LogOrder,
            0,
            10,
            None,
        )
        .unwrap();
        assert_eq!(filtered.cases_total, 1);
        assert!(get_variant_time_profile(
            &s,
            strs(&["x"]),
            VariantSort::Frequency,
            String::new(),
            CaseSort::LogOrder,
            0,
            10,
            None
        )
        .is_none());
    }

    // Same cases as `matchVariant` in the components' variant-time-profile.test.ts.
    #[test]
    fn match_variant_is_ordered_and_scored() {
        let lower = |v: &[&str]| v.iter().map(|s| s.to_lowercase()).collect::<Vec<_>>();
        let v6 = lower(&[
            "Create Fine",
            "Send Fine",
            "Insert Fine Notification",
            "Payment",
            "Add penalty",
            "Payment",
        ]);
        let v4 = lower(&[
            "Create Fine",
            "Send Fine",
            "Insert Fine Notification",
            "Add penalty",
            "Payment",
        ]);
        let q = tokens("create send paym add penalty pay");
        assert_eq!(match_variant(&v6, &q).unwrap().1, vec![0, 1, 3, 4, 5]);
        assert!(match_variant(&v4, &q).is_none());
        assert!(
            match_variant(&lower(&["Payment", "Create Fine"]), &tokens("create pay")).is_none()
        );
        let short = match_variant(&lower(&["Create Fine", "Payment"]), &tokens("create pay"))
            .unwrap()
            .0;
        let long = match_variant(&v6, &tokens("create pay")).unwrap().0;
        assert!(short > long);
        let start = match_variant(&lower(&["Send Fine"]), &tokens("fine"))
            .unwrap()
            .0;
        let mid = match_variant(&lower(&["Refined"]), &tokens("fine"))
            .unwrap()
            .0;
        assert!(start > mid);
    }

    #[test]
    fn cache_keeps_logs_apart() {
        let a = sample();
        let b = log(&[("x", &[("z", Some(0)), ("y", Some(1))])]);
        for _ in 0..2 {
            let pa = get_variant_timing_page(&a, String::new(), VariantSort::Frequency, 0, 10);
            let pb = get_variant_timing_page(&b, String::new(), VariantSort::Frequency, 0, 10);
            assert_eq!(pa.num_variants, 2);
            assert_eq!(pb.rows[0].activities, strs(&["z", "y"]));
        }
    }

    #[test]
    fn token_index_agrees_with_match_variant() {
        let names: Vec<String> = [
            "create fine",
            "send fine",
            "payment",
            "add penalty",
            "refined",
            "aaa",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        let seqs: [&[u32]; 5] = [&[0, 1, 2, 3, 2], &[0, 1, 3, 2], &[4, 1], &[2, 0], &[5]];
        for q in [
            "a aa",
            "create send paym add penalty pay",
            "fine",
            "fine fine",
            "pay create",
            "nope",
            "e e e",
        ] {
            let toks = tokens(q);
            let index = TokenIndex::new(&names, &toks);
            for seq in seqs {
                let lower: Vec<&str> = seq.iter().map(|&i| names[i as usize].as_str()).collect();
                assert_eq!(
                    index.match_seq(seq),
                    match_variant(&lower, &toks),
                    "{q} on {seq:?}"
                );
            }
        }
    }

    #[test]
    fn profile_focuses_a_case_and_reports_positions() {
        let s = sample();
        let abc = strs(&["a", "b", "c"]);
        let p = get_variant_time_profile(
            &s,
            abc.clone(),
            VariantSort::FastestFirst,
            String::new(),
            CaseSort::SlowestFirst,
            0,
            10,
            Some("c1".into()),
        )
        .unwrap();
        // Slowest first lists c2 (40 min) before c1 (30 min).
        assert_eq!((p.cases_total, p.focus_index), (1, Some(1)));
        assert_eq!(p.cases[0].case_id, "c1");
        // a>c (1 min) is faster than a>b>c (35 min), so a>b>c is second fastest.
        assert_eq!(p.sort_position, 1);
        let missing = get_variant_time_profile(
            &s,
            abc,
            VariantSort::Frequency,
            String::new(),
            CaseSort::LogOrder,
            0,
            10,
            Some("c3".into()),
        )
        .unwrap();
        assert_eq!((missing.cases_total, missing.focus_index), (0, None));
    }

    #[test]
    fn overlapping_matches_are_found() {
        assert_eq!(overlapping_matches("aaa", "aa"), vec![0, 1]);
        assert_eq!(overlapping_matches("äää", "ää"), vec![0, 2]);
        assert!(overlapping_matches("abc", "x").is_empty());
    }

    #[test]
    fn median_handles_even_and_odd() {
        assert_eq!(median(&[3.0, 1.0, 2.0]), 2.0);
        assert_eq!(median(&[4.0, 1.0, 3.0, 2.0]), 2.5);
    }

    /// `cargo test --release -p app-bindings bench_many_variants -- --ignored --nocapture`
    /// `BENCH_CASES` sets the number of cases (default 300k). Nearly every case is its own variant.
    #[test]
    #[ignore]
    fn bench_many_variants() {
        let n: usize = std::env::var("BENCH_CASES")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(300_000);
        let names: Vec<String> = (0..25).map(|i| format!("Activity {i}")).collect();
        let mut state: u64 = 42;
        let mut next = |m: u64| {
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            (state >> 33) % m
        };
        let mut log = EventLog::new();
        for c in 0..n {
            let mut trace = Trace::new();
            trace.attributes.add_attribute(Attribute::new(
                "concept:name".to_string(),
                AttributeValue::String(format!("case-{c}")),
            ));
            let len = 3 + next(12) as i64;
            let mut t = 0i64;
            for _ in 0..len {
                let mut event = Event::new(names[next(25) as usize].clone());
                t += 1 + next(1_000) as i64;
                let ts = DateTime::from_timestamp_millis(t * 60_000).unwrap();
                event.attributes.add_attribute(Attribute::new(
                    "time:timestamp".to_string(),
                    AttributeValue::Date(ts.fixed_offset()),
                ));
                trace.events.push(event);
            }
            log.traces.push(trace);
        }
        let events: usize = log.traces.iter().map(|t| t.events.len()).sum();
        let time = |label: &str, f: &dyn Fn()| {
            let start = std::time::Instant::now();
            f();
            println!("{label}: {:?}", start.elapsed());
        };
        time("cold: first page (scans the log)", &|| {
            get_variant_timing_page(&log, String::new(), VariantSort::Frequency, 0, 100);
        });
        let page = get_variant_timing_page(&log, String::new(), VariantSort::Frequency, 0, 100);
        println!("{n} cases, {events} events, {} variants", page.num_variants);
        time("page, frequency", &|| {
            get_variant_timing_page(&log, String::new(), VariantSort::Frequency, 0, 100);
        });
        time("page, slowest first", &|| {
            get_variant_timing_page(&log, String::new(), VariantSort::SlowestFirst, 0, 100);
        });
        time("page, search 'activity 1 activity 2'", &|| {
            get_variant_timing_page(
                &log,
                "activity 1 activity 2".into(),
                VariantSort::Frequency,
                0,
                100,
            );
        });
        let top = page.rows[0].activities.clone();
        time("profile of top variant", &|| {
            get_variant_time_profile(
                &log,
                top.clone(),
                VariantSort::Frequency,
                String::new(),
                CaseSort::SlowestFirst,
                0,
                100,
                None,
            );
        });
    }
}
