//! Binding calls the frontend follows and cancels by a job id it picks. Progress and partial
//! results reach it as `job-update` events.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use process_mining::utils::control::{Control, Progress};
use serde::Serialize;
use serde_json::Value;

use crate::Backend;

/// The error text of a cancelled call, so every transport can tell it from a failure.
pub const CANCELLED: &str = "cancelled";

/// Cancel flags of running jobs.
#[derive(Default)]
pub struct Jobs(Mutex<JobFlags>);

#[derive(Default)]
struct JobFlags {
    running: HashMap<String, Arc<AtomicBool>>,
    /// Recently finished ids: a cancel for one of them came too late and must not stop the next
    /// job of that id (an import of the same file reuses its id).
    finished: VecDeque<String>,
}

/// How many finished ids to remember.
const FINISHED: usize = 256;

impl Jobs {
    fn flag(&self, id: &str) -> Arc<AtomicBool> {
        let mut jobs = self.0.lock().unwrap_or_else(|e| e.into_inner());
        jobs.finished.retain(|f| f != id);
        jobs.running.entry(id.to_string()).or_default().clone()
    }

    fn finish(&self, id: &str) {
        let mut jobs = self.0.lock().unwrap_or_else(|e| e.into_inner());
        jobs.running.remove(id);
        if jobs.finished.len() >= FINISHED {
            jobs.finished.pop_front();
        }
        jobs.finished.push_back(id.to_string());
    }

    /// Ask job `id` to stop. A cancel that arrives before its call starts still counts; one that
    /// arrives after it finished does not.
    pub fn cancel(&self, id: &str) {
        let mut jobs = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if jobs.finished.iter().any(|f| f == id) {
            return;
        }
        jobs.running
            .entry(id.to_string())
            .or_default()
            .store(true, std::sync::atomic::Ordering::Relaxed);
    }
}

#[derive(Serialize, Clone)]
struct JobUpdate<'a> {
    job: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    progress: Option<Progress>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    partials: Vec<Value>,
}

/// Partials are sent in batches of at most this many, so a sweep over thousands of variants does
/// not become thousands of events.
const PARTIAL_BATCH: usize = 64;

#[derive(Default)]
struct Pending {
    last: Option<Progress>,
    partials: Vec<Value>,
}

/// Whether `next` differs enough from the last sent report to send it. No clock (wasm has none):
/// a new stage, the end, every half percent of a known total, or 2% growth of an unknown one.
fn worth_sending(last: Option<&Progress>, next: &Progress) -> bool {
    let Some(last) = last else { return true };
    if last.stage != next.stage || last.total != next.total {
        return true;
    }
    match next.total {
        Some(total) if total > 0 => {
            next.done >= total || next.done * 200 / total != last.done * 200 / total
        }
        _ => next.done >= last.done + 1 + last.done / 50,
    }
}

/// Runs `f` with a [`Control`] reporting to job `id` (or a plain one without an id), and forgets
/// the job afterwards.
pub fn with_job<B: Backend + Sync, T>(
    backend: &B,
    id: Option<&str>,
    f: impl FnOnce(&Control<'_>) -> T,
) -> T {
    let Some(id) = id else {
        return f(&Control::new());
    };
    let jobs = &backend.get_state().jobs;
    let flag = jobs.flag(id);
    let pending = Mutex::new(Pending::default());
    let send = |progress: Option<Progress>, partials: Vec<Value>| {
        let _ = backend.emit(
            "job-update",
            JobUpdate {
                job: id,
                progress,
                partials,
            },
        );
    };
    let ctl = Control::new()
        .cancel_flag(&flag)
        .on_progress(|p| {
            let mut pending = pending.lock().unwrap_or_else(|e| e.into_inner());
            if worth_sending(pending.last.as_ref(), &p) {
                pending.last = Some(p.clone());
                send(Some(p), std::mem::take(&mut pending.partials));
            }
        })
        .on_partial(|v| {
            let mut pending = pending.lock().unwrap_or_else(|e| e.into_inner());
            pending.partials.push(v);
            if pending.partials.len() >= PARTIAL_BATCH {
                send(None, std::mem::take(&mut pending.partials));
            }
        });
    let out = f(&ctl);
    drop(ctl);
    let rest = std::mem::take(&mut pending.lock().unwrap_or_else(|e| e.into_inner()).partials);
    if !rest.is_empty() {
        send(None, rest);
    }
    jobs.finish(id);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(stage: &'static str, done: u64, total: Option<u64>) -> Progress {
        Progress {
            stage: stage.into(),
            done,
            total,
        }
    }

    #[test]
    fn sends_few_reports() {
        let mut last = None;
        let mut sent = 0;
        for done in 0..=10_000 {
            let next = p("align", done, Some(10_000));
            if worth_sending(last.as_ref(), &next) {
                last = Some(next);
                sent += 1;
            }
        }
        assert_eq!(sent, 201);
        assert_eq!(last.unwrap().done, 10_000);

        let mut last = None;
        let mut sent = 0;
        for done in 0..1_000_000 {
            let next = p("import", done, None);
            if worth_sending(last.as_ref(), &next) {
                last = Some(next);
                sent += 1;
            }
        }
        assert!(sent < 800, "{sent}");
        assert!(worth_sending(Some(&p("a", 5, None)), &p("b", 0, None)));
    }
}
