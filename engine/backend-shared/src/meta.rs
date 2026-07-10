//! Per-object metadata side-table: role (visibility), generation (cache validity),
//! and provenance. Kept separate from `process_mining`'s `AppState` so the registry
//! stays a plain id -> item map; lifecycle policy lives here.

use std::collections::HashMap;
use std::sync::RwLock;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ItemRole {
    Primary,
    Derived,
    Result,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provenance {
    pub sources: Vec<String>,
    pub op: String,
    pub source_gen: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemMeta {
    pub role: ItemRole,
    pub generation: u64,
    pub provenance: Option<Provenance>,
}

#[derive(Debug, Default)]
pub struct ObjMeta {
    inner: RwLock<HashMap<String, ItemMeta>>,
    /// User-facing display labels, kept as a side-map so renaming a dataset never touches the
    /// lifecycle policy above. Lives in the engine (not just the frontend), so a relabel survives
    /// a frontend reload on backends that keep the engine process alive (webserver / tauri).
    labels: RwLock<HashMap<String, String>>,
}

impl ObjMeta {
    /// Role of `id`; absent entries are treated as `Primary` (plain imported objects
    /// carry no meta).
    pub fn role_of(&self, id: &str) -> ItemRole {
        self.inner
            .read()
            .unwrap()
            .get(id)
            .map(|m| m.role)
            .unwrap_or(ItemRole::Primary)
    }
    pub fn generation_of(&self, id: &str) -> u64 {
        self.inner
            .read()
            .unwrap()
            .get(id)
            .map(|m| m.generation)
            .unwrap_or(0)
    }
    pub fn set(&self, id: &str, m: ItemMeta) {
        self.inner.write().unwrap().insert(id.to_string(), m);
    }
    /// The user-facing label for `id`, if one was set; absent means the UI falls back to the id.
    pub fn label_of(&self, id: &str) -> Option<String> {
        self.labels.read().unwrap().get(id).cloned()
    }
    /// Set (`Some`) or clear (`None`) the display label for `id`.
    pub fn set_label(&self, id: &str, label: Option<String>) {
        let mut g = self.labels.write().unwrap();
        match label {
            Some(l) => {
                g.insert(id.to_string(), l);
            }
            None => {
                g.remove(id);
            }
        }
    }
    pub fn remove(&self, id: &str) {
        self.inner.write().unwrap().remove(id);
        self.labels.write().unwrap().remove(id);
    }
    pub fn bump_generation(&self, id: &str) {
        let mut g = self.inner.write().unwrap();
        g.entry(id.to_string())
            .and_modify(|m| m.generation += 1)
            .or_insert(ItemMeta {
                role: ItemRole::Primary,
                generation: 1,
                provenance: None,
            });
    }
    /// Whether `id` should be hidden from object listings (everything that is not a plain
    /// user-facing `Primary` dataset: cached conversions and pipeline intermediates).
    pub fn is_hidden(&self, id: &str) -> bool {
        matches!(self.role_of(id), ItemRole::Derived | ItemRole::Result)
    }
    /// The `source_gen` recorded in `id`'s provenance, if any. Used to validate a cached
    /// conversion against the current generation of its source.
    pub fn provenance_source_gen(&self, id: &str) -> Option<u64> {
        self.inner
            .read()
            .unwrap()
            .get(id)
            .and_then(|m| m.provenance.as_ref().map(|p| p.source_gen))
    }
    /// Remove every entry whose id starts with `prefix`; returns the removed ids.
    pub fn remove_with_prefix(&self, prefix: &str) -> Vec<String> {
        let mut g = self.inner.write().unwrap();
        let hit: Vec<String> = g
            .keys()
            .filter(|k| k.starts_with(prefix))
            .cloned()
            .collect();
        for k in &hit {
            g.remove(k);
        }
        let mut labels = self.labels.write().unwrap();
        let label_hit: Vec<String> = labels
            .keys()
            .filter(|k| k.starts_with(prefix))
            .cloned()
            .collect();
        for k in &label_hit {
            labels.remove(k);
        }
        hit
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn role_and_generation_default_when_absent() {
        let m = ObjMeta::default();
        assert!(matches!(m.role_of("x"), ItemRole::Primary));
        assert_eq!(m.generation_of("x"), 0);
    }

    #[test]
    fn set_then_read_back() {
        let m = ObjMeta::default();
        m.set(
            "d",
            ItemMeta {
                role: ItemRole::Derived,
                generation: 0,
                provenance: None,
            },
        );
        assert!(matches!(m.role_of("d"), ItemRole::Derived));
    }

    #[test]
    fn bump_generation_increments() {
        let m = ObjMeta::default();
        m.bump_generation("s");
        assert_eq!(m.generation_of("s"), 1);
        m.bump_generation("s");
        assert_eq!(m.generation_of("s"), 2);
    }

    #[test]
    fn provenance_source_gen_reads_back() {
        let m = ObjMeta::default();
        assert_eq!(m.provenance_source_gen("absent"), None);
        m.set(
            "log__as__EventLogActivityProjection",
            ItemMeta {
                role: ItemRole::Derived,
                generation: 0,
                provenance: Some(Provenance {
                    sources: vec!["log".into()],
                    op: "convert:EventLogActivityProjection".into(),
                    source_gen: 3,
                }),
            },
        );
        assert_eq!(
            m.provenance_source_gen("log__as__EventLogActivityProjection"),
            Some(3)
        );
    }

    #[test]
    fn is_hidden_for_derived_and_result_only() {
        let m = ObjMeta::default();
        m.set(
            "d",
            ItemMeta {
                role: ItemRole::Derived,
                generation: 0,
                provenance: None,
            },
        );
        m.set(
            "r",
            ItemMeta {
                role: ItemRole::Result,
                generation: 0,
                provenance: None,
            },
        );
        assert!(m.is_hidden("d"));
        assert!(m.is_hidden("r"));
        assert!(!m.is_hidden("primary-or-absent"));
    }

    #[test]
    fn remove_with_prefix_evicts_matches_only() {
        let m = ObjMeta::default();
        m.set(
            "log__as__EventLogActivityProjection",
            ItemMeta {
                role: ItemRole::Derived,
                generation: 0,
                provenance: None,
            },
        );
        m.set(
            "other",
            ItemMeta {
                role: ItemRole::Primary,
                generation: 0,
                provenance: None,
            },
        );
        let removed = m.remove_with_prefix("log__as__");
        assert_eq!(
            removed,
            vec!["log__as__EventLogActivityProjection".to_string()]
        );
        assert!(matches!(m.role_of("other"), ItemRole::Primary));
    }
}
