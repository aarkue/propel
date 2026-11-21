//! Reading the standard XES attributes of an event, shared by every event-log binding.

use process_mining::core::chrono::{DateTime, FixedOffset};
use process_mining::core::event_data::case_centric::{AttributeValue, Event, XESEditableAttribute};
use process_mining::core::event_data::timestamp_utils::parse_timestamp;

/// The name of an event without an activity, as in rust4pm's activity projection.
pub(crate) const NO_ACTIVITY: &str = "No Activity";

/// The activity (`concept:name`).
pub(crate) fn event_activity(event: &Event) -> Option<&str> {
    event
        .attributes
        .get_by_key("concept:name")
        .and_then(|a| a.value.try_as_string())
        .map(|s| s.as_str())
}

/// The lifecycle transition (`lifecycle:transition`), e.g., `start` or `complete`.
pub(crate) fn event_lifecycle(event: &Event) -> Option<&str> {
    event
        .attributes
        .get_by_key("lifecycle:transition")
        .and_then(|a| a.value.try_as_string())
        .map(|s| s.as_str())
}

/// The timestamp (`time:timestamp`), also when it was imported as a string.
pub(crate) fn event_time(event: &Event) -> Option<DateTime<FixedOffset>> {
    match event
        .attributes
        .get_by_key("time:timestamp")
        .map(|a| a.value.clone())
    {
        Some(AttributeValue::Date(d)) => Some(d),
        Some(AttributeValue::String(s)) => parse_timestamp(&s, None).ok(),
        _ => None,
    }
}

/// [`event_time`] in epoch milliseconds.
pub(crate) fn event_time_ms(event: &Event) -> Option<i64> {
    event_time(event).map(|d| d.timestamp_millis())
}
