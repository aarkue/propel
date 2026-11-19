//! When work happens: event counts by weekday and hour of day.

use std::collections::HashMap;

use process_mining::bindings::register_binding;
use process_mining::core::chrono::{DateTime, Datelike, FixedOffset, Timelike};
use process_mining::core::event_data::case_centric::XESEditableAttribute;
use process_mining::core::event_data::object_centric::linked_ocel::{
    LinkedOCELAccess, SlimLinkedOCEL,
};
use process_mining::EventLog;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::xes_event::event_time;

const SLOTS: usize = 7 * 24;

/// Event counts by weekday and hour, per value of a grouping attribute (e.g., activity).
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Workload {
    /// The groups, most events first
    pub groups: Vec<WorkloadGroup>,
    /// Events without a readable timestamp, left out of every group
    pub events_without_time: usize,
    /// Every timed event is at midnight in its own offset: the log records dates only, so the
    /// counts use the recorded dates and ignore any time zone
    pub date_only: bool,
    /// First and last event time in epoch milliseconds
    pub span_ms: Option<(i64, i64)>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WorkloadGroup {
    pub key: String,
    pub total: usize,
    /// 168 counts, `counts[day * 24 + hour]` with Monday as day 0
    pub counts: Vec<u32>,
}

/// From `from_ms` on (until the next change), a time zone is `offset_minutes` ahead of UTC.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema)]
pub struct OffsetChange {
    pub from_ms: i64,
    pub offset_minutes: i32,
}

fn slot(t: &DateTime<FixedOffset>) -> usize {
    t.weekday().num_days_from_monday() as usize * 24 + t.hour() as usize
}

struct WorkloadBuilder {
    /// Per group: counts in each event's own offset, then in `zone`.
    groups: HashMap<String, (Vec<u32>, Vec<u32>)>,
    events_without_time: usize,
    zone: Vec<OffsetChange>,
    all_midnight: bool,
    span: Option<(i64, i64)>,
}

impl WorkloadBuilder {
    fn new(mut zone: Vec<OffsetChange>) -> Self {
        zone.sort_by_key(|c| c.from_ms);
        WorkloadBuilder {
            groups: HashMap::new(),
            events_without_time: 0,
            zone,
            all_midnight: true,
            span: None,
        }
    }

    fn in_zone(&self, t: DateTime<FixedOffset>) -> DateTime<FixedOffset> {
        let ms = t.timestamp_millis();
        let i = self.zone.partition_point(|c| c.from_ms <= ms);
        let Some(change) = self.zone.get(i.saturating_sub(1)) else {
            return t;
        };
        FixedOffset::east_opt(change.offset_minutes * 60).map_or(t, |o| t.with_timezone(&o))
    }

    fn add(&mut self, key: &str, time: Option<DateTime<FixedOffset>>) {
        let Some(t) = time else {
            self.events_without_time += 1;
            return;
        };
        let ms = t.timestamp_millis();
        self.span = Some(
            self.span
                .map_or((ms, ms), |(lo, hi)| (lo.min(ms), hi.max(ms))),
        );
        self.all_midnight &=
            t.hour() == 0 && t.minute() == 0 && t.second() == 0 && t.nanosecond() == 0;
        let (recorded, zoned) = (slot(&t), slot(&self.in_zone(t)));
        let counts = match self.groups.get_mut(key) {
            Some(c) => c,
            None => self
                .groups
                .entry(key.to_string())
                .or_insert((vec![0; SLOTS], vec![0; SLOTS])),
        };
        counts.0[recorded] += 1;
        counts.1[zoned] += 1;
    }

    fn finish(self) -> Workload {
        let date_only = self.span.is_some() && self.all_midnight;
        let mut groups: Vec<WorkloadGroup> = self
            .groups
            .into_iter()
            .map(|(key, (recorded, zoned))| {
                let counts = if date_only { recorded } else { zoned };
                WorkloadGroup {
                    key,
                    total: counts.iter().map(|&c| c as usize).sum(),
                    counts,
                }
            })
            .collect();
        groups.sort_by(|a, b| b.total.cmp(&a.total).then_with(|| a.key.cmp(&b.key)));
        Workload {
            groups,
            events_without_time: self.events_without_time,
            date_only,
            span_ms: self.span,
        }
    }
}

/// Events of an event log by weekday and hour, grouped by an event attribute (default: the
/// activity, `concept:name`). Events without the attribute form the group `""`. Times are read in
/// `time_zone`, or in each event's own offset without one.
#[register_binding]
pub fn get_event_log_workload(
    event_log: &EventLog,
    #[bind(default)] group_by: Option<String>,
    #[bind(default)] time_zone: Option<Vec<OffsetChange>>,
) -> Workload {
    let key = group_by.unwrap_or_else(|| "concept:name".to_string());
    let mut b = WorkloadBuilder::new(time_zone.unwrap_or_default());
    for event in event_log.traces.iter().flat_map(|t| t.events.iter()) {
        let group = event
            .attributes
            .get_by_key(&key)
            .map(|a| a.value.to_string())
            .unwrap_or_default();
        b.add(&group, event_time(event));
    }
    b.finish()
}

/// Events of an OCEL by weekday and hour, grouped by event type. Times are read in `time_zone`,
/// or in each event's own offset without one.
#[register_binding]
pub fn get_ocel_workload(
    ocel: &SlimLinkedOCEL,
    #[bind(default)] time_zone: Option<Vec<OffsetChange>>,
) -> Workload {
    let mut b = WorkloadBuilder::new(time_zone.unwrap_or_default());
    for ev in ocel.get_all_evs() {
        b.add(ocel.get_ev_type_of(ev), Some(*ocel.get_ev_time(ev)));
    }
    b.finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use process_mining::Importable;

    // 2024-01-01 is a Monday.
    const XES: &str = r#"<log>
<trace>
<event><string key="concept:name" value="a"/><date key="time:timestamp" value="2024-01-01T09:15:00+01:00"/></event>
<event><string key="concept:name" value="a"/><date key="time:timestamp" value="2024-01-03T23:59:00+01:00"/></event>
<event><string key="concept:name" value="b"/><string key="org:resource" value="r1"/><date key="time:timestamp" value="2024-01-07T00:00:00Z"/></event>
<event><string key="concept:name" value="b"/></event>
</trace>
</log>"#;

    fn log() -> EventLog {
        EventLog::import_from_bytes(XES.as_bytes(), "xes").unwrap()
    }

    #[test]
    fn counts_by_local_weekday_and_hour() {
        let w = get_event_log_workload(&log(), None, None);
        assert_eq!(w.events_without_time, 1);
        let a = w.groups.iter().find(|g| g.key == "a").unwrap();
        assert_eq!(a.total, 2);
        assert_eq!(a.counts[9], 1, "Monday 09:00 in the event's own offset");
        assert_eq!(a.counts[2 * 24 + 23], 1, "Wednesday 23:00");
        let b = w.groups.iter().find(|g| g.key == "b").unwrap();
        assert_eq!(b.counts[6 * 24], 1, "Sunday 00:00");
    }

    #[test]
    fn groups_by_another_attribute() {
        let w = get_event_log_workload(&log(), Some("org:resource".into()), None);
        let keys: Vec<&str> = w.groups.iter().map(|g| g.key.as_str()).collect();
        assert_eq!(
            keys,
            vec!["", "r1"],
            "two unassigned timed events, one by r1"
        );
    }

    #[test]
    fn reads_times_in_a_time_zone() {
        // UTC until the 2024-01-02 change, then UTC+05:30.
        let zone = vec![
            OffsetChange {
                from_ms: 0,
                offset_minutes: 0,
            },
            OffsetChange {
                from_ms: 1_704_153_600_000,
                offset_minutes: 330,
            },
        ];
        let w = get_event_log_workload(&log(), None, Some(zone));
        let a = w.groups.iter().find(|g| g.key == "a").unwrap();
        assert_eq!(a.counts[8], 1, "Monday 08:15 UTC");
        assert_eq!(a.counts[3 * 24 + 4], 1, "Thursday 04:29 in UTC+05:30");
        assert!(!w.date_only);
        assert!(w.span_ms.is_some());
    }

    #[test]
    fn date_only_logs_keep_their_dates() {
        let xes = r#"<log><trace>
<event><string key="concept:name" value="a"/><date key="time:timestamp" value="2024-01-01T00:00:00+01:00"/></event>
</trace></log>"#;
        let l = EventLog::import_from_bytes(xes.as_bytes(), "xes").unwrap();
        let zone = vec![OffsetChange {
            from_ms: 0,
            offset_minutes: 0,
        }];
        let w = get_event_log_workload(&l, None, Some(zone));
        assert!(w.date_only);
        assert_eq!(w.groups[0].counts[0], 1, "Monday, not Sunday 23:00 UTC");
    }
}
