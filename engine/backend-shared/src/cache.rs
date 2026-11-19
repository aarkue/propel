//! Results of pure binding calls, so reopening a view or switching panels does not recompute.
//!
//! An entry is dropped when any registry item it read is loaded, unloaded, replaced or mutated,
//! and the oldest entries go first once the cache holds more than [`CAPACITY`] bytes.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;

const CAPACITY: usize = 256 << 20;
/// Larger results are not worth keeping: they would evict everything else.
const MAX_ENTRY: usize = 32 << 20;
/// Calls with huge arguments (e.g., an inline log) are not cached.
const MAX_KEY: usize = 256 << 10;

#[derive(Default)]
pub struct ResultCache {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    entries: HashMap<String, Entry>,
    /// Keys oldest first, each with the `seq` of the entry it was pushed for.
    order: VecDeque<(String, u64)>,
    by_item: HashMap<String, HashSet<String>>,
    bytes: usize,
    seq: u64,
    /// Moves on with every invalidation, so a call that overlapped one does not store its result.
    epoch: u64,
}

struct Entry {
    result: Vec<u8>,
    items: Vec<String>,
    seq: u64,
}

/// What an entry costs: its result and the copies of its key in the indexes.
fn size_of(key: &str, e: &Entry) -> usize {
    e.result.len() + key.len() * (2 + e.items.len())
}

impl Inner {
    fn drop_entry(&mut self, key: &str) {
        if let Some(e) = self.entries.remove(key) {
            self.bytes -= size_of(key, &e);
            for item in e.items {
                if let Some(keys) = self.by_item.get_mut(&item) {
                    keys.remove(key);
                    if keys.is_empty() {
                        self.by_item.remove(&item);
                    }
                }
            }
        }
    }
}

impl ResultCache {
    pub fn key(function_id: &str, args: &serde_json::Value) -> Option<String> {
        let key = format!("{function_id}\n{args}");
        (key.len() <= MAX_KEY).then_some(key)
    }

    pub fn get(&self, key: &str) -> Option<Vec<u8>> {
        let inner = self.inner.lock().ok()?;
        inner.entries.get(key).map(|e| e.result.clone())
    }

    /// The current invalidation epoch, to pass to [`Self::put`] for a call starting now.
    pub fn epoch(&self) -> u64 {
        self.inner.lock().map(|i| i.epoch).unwrap_or(0)
    }

    /// Keep `result`, read from the registry items `items`, unless an invalidation happened since
    /// `epoch`: the result may then describe an item that has been replaced.
    pub fn put(&self, key: String, items: Vec<String>, result: Vec<u8>, epoch: u64) {
        if result.len() > MAX_ENTRY {
            return;
        }
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        if inner.epoch != epoch {
            return;
        }
        inner.drop_entry(&key);
        inner.seq += 1;
        let seq = inner.seq;
        let entry = Entry { result, items, seq };
        inner.bytes += size_of(&key, &entry);
        for item in &entry.items {
            inner
                .by_item
                .entry(item.clone())
                .or_default()
                .insert(key.clone());
        }
        inner.order.push_back((key.clone(), seq));
        inner.entries.insert(key, entry);
        while inner.bytes > CAPACITY {
            let Some((oldest, seq)) = inner.order.pop_front() else {
                break;
            };
            // A key put again since is younger than this place in the queue.
            if inner.entries.get(&oldest).is_some_and(|e| e.seq == seq) {
                inner.drop_entry(&oldest);
            }
        }
        // Keys of dropped entries linger in `order`; compact once they dominate it.
        if inner.order.len() > 2 * inner.entries.len() + 64 {
            let Inner { order, entries, .. } = &mut *inner;
            order.retain(|(k, seq)| entries.get(k).is_some_and(|e| e.seq == *seq));
        }
    }

    /// Forget every result that read the item `id`.
    pub fn invalidate(&self, id: &str) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        inner.epoch += 1;
        let keys: Vec<String> = inner
            .by_item
            .get(id)
            .map(|k| k.iter().cloned().collect())
            .unwrap_or_default();
        for k in keys {
            inner.drop_entry(&k);
        }
    }

    pub fn len(&self) -> usize {
        self.inner.lock().map(|i| i.entries.len()).unwrap_or(0)
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalidates_by_item_and_evicts_oldest() {
        let c = ResultCache::default();
        c.put("a".into(), vec!["log1".into()], vec![1], c.epoch());
        c.put("b".into(), vec!["log2".into()], vec![2], c.epoch());
        assert_eq!(c.get("a"), Some(vec![1]));
        c.invalidate("log1");
        assert_eq!(c.get("a"), None);
        assert_eq!(c.get("b"), Some(vec![2]));
        c.put("big".into(), vec![], vec![0; MAX_ENTRY + 1], c.epoch());
        assert_eq!(c.get("big"), None, "too large to keep");
        assert_eq!(c.len(), 1);
    }

    #[test]
    fn skips_results_of_calls_that_overlapped_an_invalidation() {
        let c = ResultCache::default();
        let before = c.epoch();
        c.invalidate("log1");
        c.put("a".into(), vec!["log1".into()], vec![1], before);
        assert_eq!(c.get("a"), None);
    }

    #[test]
    fn a_refreshed_entry_is_not_evicted_as_old() {
        let c = ResultCache::default();
        let block = vec![0; MAX_ENTRY];
        let fit = CAPACITY / MAX_ENTRY;
        for i in 0..fit {
            c.put(format!("k{i}"), vec![], block.clone(), c.epoch());
        }
        c.put("k0".into(), vec![], block.clone(), c.epoch());
        c.put("new".into(), vec![], block.clone(), c.epoch());
        assert!(
            c.get("k0").is_some(),
            "put again after k1, so k1 goes first"
        );
        assert!(c.get("k1").is_none());
    }
}
