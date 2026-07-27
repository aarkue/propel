//! Generic slim-OCEL projection core: `build_slim` materializes a keep-mask `Overlay` over any `LinkedOCELAccess` reader into a fresh `SlimLinkedOCEL`.
//! `Overlay` exposes inherent read helpers rather than implementing `LinkedOCELAccess` itself, since that trait's `&'a self` receiver would tie reads to the source's borrow lifetime.

use std::collections::{HashMap, HashSet};
use std::hash::Hash;

use process_mining::core::chrono::{DateTime, FixedOffset};
use process_mining::core::event_data::object_centric::linked_ocel::{
    LinkedOCELAccess, SlimLinkedOCEL,
};
use process_mining::core::event_data::object_centric::{
    OCELAttributeValue, OCELEventAttribute, OCELObjectAttribute, OCELRelationship, OCELType,
};
use process_mining::AppendableOCEL;

/// A flat projection over a borrowed `LinkedOCELAccess` source: keep masks, per-item type
/// remaps, time overrides, scoped attribute strips, and effective (post-remap) type sets.
pub struct Overlay<'a, A>
where
    A: LinkedOCELAccess<'a>,
    A::EventRepr: Copy + Eq + Hash,
    A::ObjectRepr: Copy + Eq + Hash,
{
    src: &'a A,
    keep_ev: HashSet<A::EventRepr>,
    keep_ob: HashSet<A::ObjectRepr>,
    ev_type_remap: HashMap<A::EventRepr, String>,
    ob_type_remap: HashMap<A::ObjectRepr, String>,
    ev_time_override: HashMap<A::EventRepr, DateTime<FixedOffset>>,
    /// Keyed by (object, flat index over that object's attribute-value entries in
    /// `src.get_ob_attrs` order); see `ob_attr_global_offset`.
    ob_attr_time_override: HashMap<(A::ObjectRepr, usize), DateTime<FixedOffset>>,
    /// Per-item value-level attribute strip, baked in immediately at strip time: a lazy, type-name-keyed check would re-evaluate after a later relabel and silently resurrect the stripped value.
    ev_attr_strip_items: HashMap<A::EventRepr, HashSet<String>>,
    ob_attr_strip_items: HashMap<A::ObjectRepr, HashSet<String>>,
    /// Scoped attribute-removal registry (`None` = every type, `Some(t)` = only that type), used by `build_slim`'s type-schema declaration filter; per-instance presence is governed by the item-level maps above instead.
    ev_attr_strip: HashMap<Option<String>, HashSet<String>>,
    ob_attr_strip: HashMap<Option<String>, HashSet<String>>,
    /// Effective (post-remap) type sets over currently kept items, recomputed eagerly by the relabel mutators; a plain filter/retain leaves it a harmless superset since `build_slim` re-derives the declared types from the keep mask anyway.
    eff_ev_types: Vec<String>,
    eff_ob_types: Vec<String>,
}

impl<'a, A> Overlay<'a, A>
where
    A: LinkedOCELAccess<'a>,
    A::EventRepr: Copy + Eq + Hash,
    A::ObjectRepr: Copy + Eq + Hash,
{
    /// Identity projection: every event and object of `src` is kept, no remaps/overrides/strips.
    pub fn identity(src: &'a A) -> Self {
        let mut ov = Self {
            src,
            keep_ev: src.get_all_evs().collect(),
            keep_ob: src.get_all_obs().collect(),
            ev_type_remap: HashMap::new(),
            ob_type_remap: HashMap::new(),
            ev_time_override: HashMap::new(),
            ob_attr_time_override: HashMap::new(),
            ev_attr_strip_items: HashMap::new(),
            ob_attr_strip_items: HashMap::new(),
            ev_attr_strip: HashMap::new(),
            ob_attr_strip: HashMap::new(),
            eff_ev_types: Vec::new(),
            eff_ob_types: Vec::new(),
        };
        ov.recompute_eff_types();
        ov
    }

    /// The borrowed source reader.
    pub fn source(&self) -> &'a A {
        self.src
    }

    /// Whether the given event is still present in the projection.
    pub fn ev_kept(&self, e: A::EventRepr) -> bool {
        self.keep_ev.contains(&e)
    }

    /// Whether the given object is still present in the projection.
    pub fn ob_kept(&self, o: A::ObjectRepr) -> bool {
        self.keep_ob.contains(&o)
    }

    /// Effective event type: the relabel target if one was set, else the source type. Bound to
    /// `&self` (not `'a`): a relabeled name is owned by the overlay, so it cannot outlive it.
    pub fn ev_type(&self, e: A::EventRepr) -> &str {
        self.ev_type_remap
            .get(&e)
            .map(String::as_str)
            .unwrap_or_else(|| self.src.get_ev_type_of(e))
    }

    /// Effective object type: the relabel target if one was set, else the source type.
    pub fn ob_type(&self, o: A::ObjectRepr) -> &str {
        self.ob_type_remap
            .get(&o)
            .map(String::as_str)
            .unwrap_or_else(|| self.src.get_ob_type_of(o))
    }

    /// Effective event timestamp: the override if one was set, else the source time. Returned
    /// by value (`DateTime` is `Copy`) since an overridden time is owned by the overlay.
    pub fn ev_time(&self, e: A::EventRepr) -> DateTime<FixedOffset> {
        self.ev_time_override
            .get(&e)
            .copied()
            .unwrap_or_else(|| *self.src.get_ev_time(e))
    }

    /// Events related to `o` via a reverse E2O edge, filtered to currently kept events. Yields
    /// one entry per qualifier (dedup, where needed, is the caller's job).
    pub fn e2o_rev(&self, o: A::ObjectRepr) -> impl Iterator<Item = (&'a str, A::EventRepr)> + '_ {
        self.src
            .get_e2o_rev(o)
            .filter(move |(_, e)| self.ev_kept(**e))
            .map(|(q, e)| (q, *e))
    }

    /// Events related to `o`, deduped and sorted by effective event time; shared by folds that
    /// need "first/last/ordered related event" semantics.
    pub fn related_events_sorted(&self, o: A::ObjectRepr) -> Vec<A::EventRepr> {
        let mut seen: HashSet<A::EventRepr> = HashSet::new();
        let mut evs: Vec<A::EventRepr> = Vec::new();
        for (_, e) in self.e2o_rev(o) {
            if seen.insert(e) {
                evs.push(e);
            }
        }
        evs.sort_by_key(|&e| self.ev_time(e));
        evs
    }

    /// Objects related to `e` via a forward E2O edge, filtered to currently kept objects. One
    /// entry per qualifier, no dedup.
    pub fn e2o(&self, e: A::EventRepr) -> impl Iterator<Item = (&'a str, A::ObjectRepr)> + '_ {
        self.src
            .get_e2o(e)
            .filter(move |(_, o)| self.ob_kept(**o))
            .map(|(q, o)| (q, *o))
    }

    /// Effective (post-relabel) event type names present across currently kept events.
    /// The object-type counterpart is `eff_ob_types` below.
    pub fn eff_ev_types(&self) -> impl Iterator<Item = &str> + '_ {
        self.eff_ev_types.iter().map(String::as_str)
    }

    /// Effective object type names of every currently kept object.
    pub fn eff_ob_types(&self) -> impl Iterator<Item = &str> + '_ {
        self.eff_ob_types.iter().map(String::as_str)
    }

    /// Names of the attributes an event carries, minus any scope-stripped keys (scope = the
    /// event's effective type).
    pub fn ev_attrs(&self, e: A::EventRepr) -> impl Iterator<Item = &'a str> + '_ {
        self.src
            .get_ev_attrs(e)
            .filter(move |name| !self.ev_attr_stripped(e, name))
    }

    /// The value of a single event attribute, or `None` if absent or scope-stripped.
    pub fn ev_attr_val(&self, e: A::EventRepr, name: &str) -> Option<&'a OCELAttributeValue> {
        if self.ev_attr_stripped(e, name) {
            return None;
        }
        self.src.get_ev_attr_val(e, name)
    }

    /// Names of the attributes an object carries, minus any scope-stripped keys (scope = the
    /// object's effective type).
    pub fn ob_attrs(&self, o: A::ObjectRepr) -> impl Iterator<Item = &'a str> + '_ {
        self.src
            .get_ob_attrs(o)
            .filter(move |name| !self.ob_attr_stripped(o, name))
    }

    /// The (time, value) series for one object attribute: empty if scope-stripped, else the source series with any `ob_attr_time_override` entries applied.
    /// Collects into an owned `Vec` first since the source iterator borrows `name`, which outlives this method's return.
    pub fn ob_attr_vals(
        &self,
        o: A::ObjectRepr,
        name: &str,
    ) -> impl Iterator<Item = (DateTime<FixedOffset>, &'a OCELAttributeValue)> + '_ {
        let offset = self.ob_attr_global_offset(o, name);
        let raw: Vec<(DateTime<FixedOffset>, &'a OCELAttributeValue)> =
            if self.ob_attr_stripped(o, name) {
                Vec::new()
            } else {
                self.src
                    .get_ob_attr_vals(o, name)
                    .map(|(t, v)| (*t, v))
                    .collect()
            };
        raw.into_iter().enumerate().map(move |(idx, (t, v))| {
            let time = self
                .ob_attr_time_override
                .get(&(o, offset + idx))
                .copied()
                .unwrap_or(t);
            (time, v)
        })
    }

    /// Whether `name` is in the strip set for `scope` (`None` = global) or `Some(ty)`.
    fn scope_stripped(
        strip: &HashMap<Option<String>, HashSet<String>>,
        ty: &str,
        name: &str,
    ) -> bool {
        strip.get(&None).is_some_and(|s| s.contains(name))
            || strip
                .get(&Some(ty.to_string()))
                .is_some_and(|s| s.contains(name))
    }

    /// Whether `name` is stripped for event `e`: the item-level bake, NOT a live scope-vs-current-
    /// type check (see `ev_attr_strip_items`'s field doc for why).
    fn ev_attr_stripped(&self, e: A::EventRepr, name: &str) -> bool {
        self.ev_attr_strip_items
            .get(&e)
            .is_some_and(|s| s.contains(name))
    }

    /// Whether `name` is stripped for object `o`: the item-level bake (see `ev_attr_stripped`).
    fn ob_attr_stripped(&self, o: A::ObjectRepr, name: &str) -> bool {
        self.ob_attr_strip_items
            .get(&o)
            .is_some_and(|s| s.contains(name))
    }

    /// Whether `name` is stripped for the (already effective) event type `ty` - used when
    /// declaring a type's schema, where there is no single event instance to read a type from.
    fn ev_attr_stripped_for_type(&self, ty: &str, name: &str) -> bool {
        Self::scope_stripped(&self.ev_attr_strip, ty, name)
    }

    /// Whether `name` is stripped for the (already effective) object type `ty`.
    fn ob_attr_stripped_for_type(&self, ty: &str, name: &str) -> bool {
        Self::scope_stripped(&self.ob_attr_strip, ty, name)
    }

    /// The flat entry index (see `ob_attr_time_override`) at which `name`'s series starts, counted over the raw source order so a strip never shifts unrelated indices.
    /// `pub` so folds like `RescaleTimeframe` can compute the same global index via `override_ob_attr_time`.
    pub fn ob_attr_global_offset(&self, o: A::ObjectRepr, name: &str) -> usize {
        let mut offset = 0usize;
        for n in self.src.get_ob_attrs(o) {
            if n == name {
                break;
            }
            offset += self.src.get_ob_attr_vals(o, n).count();
        }
        offset
    }

    /// Relabel a single event to `new_type`, then eagerly recompute the effective type sets.
    pub fn relabel_event(&mut self, e: A::EventRepr, new_type: impl Into<String>) {
        self.ev_type_remap.insert(e, new_type.into());
        self.recompute_eff_types();
    }

    /// Relabel a single object to `new_type`, then eagerly recompute the effective type sets.
    pub fn relabel_object(&mut self, o: A::ObjectRepr, new_type: impl Into<String>) {
        self.ob_type_remap.insert(o, new_type.into());
        self.recompute_eff_types();
    }

    /// Relabel every `(event, new_type)` pair, then recompute the effective type sets once.
    /// Folds over N events must use this instead of looping `relabel_event`, which would recompute per event (O(N*M)).
    pub fn relabel_events_batch(
        &mut self,
        entries: impl IntoIterator<Item = (A::EventRepr, String)>,
    ) {
        for (e, new_type) in entries {
            self.ev_type_remap.insert(e, new_type);
        }
        self.recompute_eff_types();
    }

    /// Object counterpart of `relabel_events_batch`.
    pub fn relabel_objects_batch(
        &mut self,
        entries: impl IntoIterator<Item = (A::ObjectRepr, String)>,
    ) {
        for (o, new_type) in entries {
            self.ob_type_remap.insert(o, new_type);
        }
        self.recompute_eff_types();
    }

    /// Override an event's effective timestamp (e.g. `RescaleTimeframe`).
    pub fn override_ev_time(&mut self, e: A::EventRepr, t: DateTime<FixedOffset>) {
        self.ev_time_override.insert(e, t);
    }

    /// Override the effective timestamp of one object-attribute entry, addressed by the flat
    /// index described on `ob_attr_time_override`.
    pub fn override_ob_attr_time(
        &mut self,
        o: A::ObjectRepr,
        idx: usize,
        t: DateTime<FixedOffset>,
    ) {
        self.ob_attr_time_override.insert((o, idx), t);
    }

    /// Strip `keys` from every currently-kept event whose current effective type matches `scope` (`None` = every activity), baking the removal in immediately.
    pub fn strip_ev_attr(&mut self, scope: Option<String>, keys: impl IntoIterator<Item = String>) {
        let keys: Vec<String> = keys.into_iter().collect();
        let targets: Vec<A::EventRepr> = self
            .keep_ev
            .iter()
            .copied()
            .filter(|&e| scope.as_deref().is_none_or(|s| self.ev_type(e) == s))
            .collect();
        for e in targets {
            self.ev_attr_strip_items
                .entry(e)
                .or_default()
                .extend(keys.iter().cloned());
        }
        self.ev_attr_strip.entry(scope).or_default().extend(keys);
    }

    /// Object counterpart of `strip_ev_attr`.
    pub fn strip_ob_attr(&mut self, scope: Option<String>, keys: impl IntoIterator<Item = String>) {
        let keys: Vec<String> = keys.into_iter().collect();
        let targets: Vec<A::ObjectRepr> = self
            .keep_ob
            .iter()
            .copied()
            .filter(|&o| scope.as_deref().is_none_or(|s| self.ob_type(o) == s))
            .collect();
        for o in targets {
            self.ob_attr_strip_items
                .entry(o)
                .or_default()
                .extend(keys.iter().cloned());
        }
        self.ob_attr_strip.entry(scope).or_default().extend(keys);
    }

    /// Recompute `eff_ev_types`/`eff_ob_types` as the effective type of every currently kept
    /// event/object. Called eagerly by the relabel mutators; a plain retain does not call this.
    pub fn recompute_eff_types(&mut self) {
        let mut evs: HashSet<String> = HashSet::new();
        for e in self.keep_ev.iter().copied() {
            evs.insert(self.ev_type(e).to_string());
        }
        let mut evs: Vec<String> = evs.into_iter().collect();
        evs.sort();
        self.eff_ev_types = evs;

        let mut obs: HashSet<String> = HashSet::new();
        for o in self.keep_ob.iter().copied() {
            obs.insert(self.ob_type(o).to_string());
        }
        let mut obs: Vec<String> = obs.into_iter().collect();
        obs.sort();
        self.eff_ob_types = obs;
    }

    /// Drop every kept event for which `pred(self, event)` is false. `pred` reads the current
    /// projection (via the inherent helpers), so a chain of `retain_*` calls composes.
    pub fn retain_events<F: FnMut(&Self, A::EventRepr) -> bool>(&mut self, mut pred: F) {
        let snapshot: Vec<A::EventRepr> = self.keep_ev.iter().copied().collect();
        let mut to_drop: Vec<A::EventRepr> = Vec::new();
        for e in snapshot {
            if !pred(self, e) {
                to_drop.push(e);
            }
        }
        for e in to_drop {
            self.keep_ev.remove(&e);
        }
    }

    /// Drop every kept object for which `pred(self, object)` is false.
    pub fn retain_objects<F: FnMut(&Self, A::ObjectRepr) -> bool>(&mut self, mut pred: F) {
        let snapshot: Vec<A::ObjectRepr> = self.keep_ob.iter().copied().collect();
        let mut to_drop: Vec<A::ObjectRepr> = Vec::new();
        for o in snapshot {
            if !pred(self, o) {
                to_drop.push(o);
            }
        }
        for o in to_drop {
            self.keep_ob.remove(&o);
        }
    }
}

/// Emit the `OCELRelationship`s of `rels` whose target object is present in `kept`, resolving
/// each target's id through `src`; this is how `build_slim` avoids dangling edges.
fn rels_to_kept<'a, A, I>(
    rels: I,
    src: &'a A,
    kept: &HashSet<A::ObjectRepr>,
) -> Vec<OCELRelationship>
where
    A: LinkedOCELAccess<'a>,
    A::ObjectRepr: Copy + Eq + Hash,
    I: Iterator<Item = (&'a str, &'a A::ObjectRepr)>,
{
    rels.filter(|(_q, o)| kept.contains(*o))
        .map(|(q, o)| OCELRelationship {
            object_id: src.get_ob_id(*o).to_string(),
            qualifier: q.to_string(),
        })
        .collect()
}

/// Materialize an `Overlay` into a fresh `SlimLinkedOCEL`, using the name-based `AppendableOCEL` builder (never the positional `add_event`/`add_object`, which truncate attributes to the pre-declared schema length) so an identity projection round-trips with parity.
pub fn build_slim<'a, A>(ov: &Overlay<'a, A>) -> SlimLinkedOCEL
where
    A: LinkedOCELAccess<'a>,
    A::EventRepr: Copy + Eq + Hash,
    A::ObjectRepr: Copy + Eq + Hash,
{
    let src = ov.source();
    let mut out = SlimLinkedOCEL::new();

    let kept_obs: Vec<A::ObjectRepr> = src.get_all_obs().filter(|o| ov.ob_kept(*o)).collect();
    let kept_ob_set: HashSet<A::ObjectRepr> = kept_obs.iter().copied().collect();
    let mut kept_evs: Vec<A::EventRepr> = src.get_all_evs().filter(|e| ov.ev_kept(*e)).collect();
    kept_evs.sort_by_key(|e| ov.ev_time(*e));

    // Declare only types with a surviving member, minus scope-stripped attribute keys; candidates come from the overlay's effective type sets, not `src.get_ev_types()`, so a relabel-created type name is still declared.
    let used_ev_types: HashSet<&str> = kept_evs.iter().map(|e| ov.ev_type(*e)).collect();
    for name in ov.eff_ev_types() {
        if used_ev_types.contains(name) {
            let mut ty = src.get_ev_type(name).cloned().unwrap_or_else(|| OCELType {
                name: name.to_string(),
                attributes: Vec::new(),
            });
            ty.attributes
                .retain(|a| !ov.ev_attr_stripped_for_type(name, &a.name));
            let _ = out.declare_event_type(ty);
        }
    }
    let used_ob_types: HashSet<&str> = kept_obs.iter().map(|o| ov.ob_type(*o)).collect();
    for name in ov.eff_ob_types() {
        if used_ob_types.contains(name) {
            let mut ty = src.get_ob_type(name).cloned().unwrap_or_else(|| OCELType {
                name: name.to_string(),
                attributes: Vec::new(),
            });
            ty.attributes
                .retain(|a| !ov.ob_attr_stripped_for_type(name, &a.name));
            let _ = out.declare_object_type(ty);
        }
    }

    // Objects before events: E2O targets then resolve immediately; O2O forward refs to a
    // not-yet-appended object are deferred and resolved by finalize().
    for &o in &kept_obs {
        let id = src.get_ob_id(o).to_string();
        let otype = ov.ob_type(o).to_string();
        let mut attributes: Vec<OCELObjectAttribute> = Vec::new();
        for name in ov.ob_attrs(o) {
            for (t, v) in ov.ob_attr_vals(o, name) {
                attributes.push(OCELObjectAttribute {
                    name: name.to_string(),
                    value: v.clone(),
                    time: t,
                });
            }
        }
        let relationships = rels_to_kept(src.get_o2o(o), src, &kept_ob_set);
        if let Err(e) = out.append_object(id, &otype, attributes, relationships) {
            eprintln!("[slim_project] warning: skipping object: {e}");
        }
    }

    for &e in &kept_evs {
        let id = src.get_ev_id(e).to_string();
        let etype = ov.ev_type(e).to_string();
        let time = ov.ev_time(e);
        let mut attributes: Vec<OCELEventAttribute> = Vec::new();
        for name in ov.ev_attrs(e) {
            if let Some(v) = ov.ev_attr_val(e, name) {
                attributes.push(OCELEventAttribute {
                    name: name.to_string(),
                    value: v.clone(),
                });
            }
        }
        let relationships = rels_to_kept(src.get_e2o(e), src, &kept_ob_set);
        if let Err(err) = out.append_event(id, &etype, time, attributes, relationships) {
            eprintln!("[slim_project] warning: skipping event: {err}");
        }
    }

    let _ = out.finalize();
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use process_mining::core::chrono::DateTime as ChronoDateTime;
    use process_mining::core::event_data::object_centric::{
        OCELAttributeValue, OCELEvent, OCELObject, OCELRelationship, OCELType, OCELTypeAttribute,
        OCEL,
    };
    use process_mining::ReadableOCEL;

    fn dt(s: &str) -> DateTime<FixedOffset> {
        ChronoDateTime::parse_from_rfc3339(s).unwrap()
    }

    fn tattr(name: &str, ty: &str) -> OCELTypeAttribute {
        OCELTypeAttribute {
            name: name.to_string(),
            value_type: ty.to_string(),
        }
    }

    /// Attribute-heavy fixture: 2 event types, 2 object types, O2O relations, a multi-qualifier
    /// E2O edge, an object attribute time-series, and events out of time order.
    fn fixture() -> SlimLinkedOCEL {
        let t0 = "2020-01-01T00:00:00+00:00";
        let t1 = "2020-01-02T00:00:00+00:00";
        let t2 = "2020-01-03T00:00:00+00:00";

        let event_types = vec![
            OCELType {
                name: "order".to_string(),
                attributes: vec![tattr("priority", "integer"), tattr("note", "string")],
            },
            OCELType {
                name: "ship".to_string(),
                attributes: vec![tattr("carrier", "string")],
            },
        ];
        let object_types = vec![
            OCELType {
                name: "item".to_string(),
                attributes: vec![tattr("price", "float")],
            },
            OCELType {
                name: "customer".to_string(),
                attributes: vec![tattr("name", "string")],
            },
        ];

        let objects = vec![
            OCELObject {
                id: "i1".to_string(),
                object_type: "item".to_string(),
                attributes: vec![
                    OCELObjectAttribute::new("price", 9.99_f64, dt(t0)),
                    OCELObjectAttribute::new("price", 8.5_f64, dt(t1)),
                ],
                relationships: vec![OCELRelationship::new("c1", "owned_by")],
            },
            OCELObject {
                id: "i2".to_string(),
                object_type: "item".to_string(),
                attributes: vec![OCELObjectAttribute::new("price", 3.0_f64, dt(t0))],
                relationships: vec![OCELRelationship::new("c1", "owned_by")],
            },
            OCELObject {
                id: "c1".to_string(),
                object_type: "customer".to_string(),
                attributes: vec![OCELObjectAttribute::new("name", "Alice", dt(t0))],
                relationships: vec![],
            },
        ];

        let events = vec![
            OCELEvent {
                id: "e1".to_string(),
                event_type: "order".to_string(),
                time: dt(t1),
                attributes: vec![
                    OCELEventAttribute {
                        name: "priority".to_string(),
                        value: OCELAttributeValue::Integer(5),
                    },
                    OCELEventAttribute {
                        name: "note".to_string(),
                        value: OCELAttributeValue::String("rush".to_string()),
                    },
                ],
                relationships: vec![
                    OCELRelationship::new("i1", "primary"),
                    OCELRelationship::new("i1", "secondary"),
                    OCELRelationship::new("c1", "buyer"),
                ],
            },
            OCELEvent {
                id: "e2".to_string(),
                event_type: "ship".to_string(),
                time: dt(t2),
                attributes: vec![OCELEventAttribute {
                    name: "carrier".to_string(),
                    value: OCELAttributeValue::String("DHL".to_string()),
                }],
                relationships: vec![
                    OCELRelationship::new("i1", "handled"),
                    OCELRelationship::new("i2", "handled"),
                ],
            },
            OCELEvent {
                id: "e3".to_string(),
                event_type: "order".to_string(),
                time: dt(t0),
                attributes: vec![OCELEventAttribute {
                    name: "priority".to_string(),
                    value: OCELAttributeValue::Integer(1),
                }],
                relationships: vec![OCELRelationship::new("i2", "primary")],
            },
        ];

        SlimLinkedOCEL::from_ocel(OCEL {
            event_types,
            object_types,
            events,
            objects,
        })
    }

    fn val_str(v: &OCELAttributeValue) -> String {
        use OCELAttributeValue::*;
        match v {
            Integer(i) => format!("int:{i}"),
            Float(f) => format!("float:{f}"),
            Boolean(b) => format!("bool:{b}"),
            Time(t) => format!("time:{}", t.to_rfc3339()),
            String(s) => format!("str:{s}"),
            Null => "null".to_string(),
        }
    }

    /// Structural fingerprint of a `SlimLinkedOCEL`, order-independent where order is not
    /// semantic; comparing two of these is an exact equivalence check.
    #[derive(Debug, Clone, PartialEq, Eq)]
    struct Canonical {
        events: Vec<(String, String, String, Vec<(String, String)>)>,
        objects: Vec<(String, String, Vec<(String, Vec<(String, String)>)>)>,
        e2o: Vec<(String, String, String)>,
        o2o: Vec<(String, String, String)>,
        ev_type_schemas: Vec<(String, Vec<(String, String)>)>,
        ob_type_schemas: Vec<(String, Vec<(String, String)>)>,
    }

    impl Canonical {
        fn event_types_present(&self) -> Vec<String> {
            let mut v: Vec<String> = self.events.iter().map(|e| e.1.clone()).collect();
            v.sort();
            v.dedup();
            v
        }
        fn e2o_triples(&self) -> &[(String, String, String)] {
            &self.e2o
        }
    }

    fn canon(o: &SlimLinkedOCEL) -> Canonical {
        let mut events = Vec::new();
        for e in o.get_all_evs() {
            let id = o.get_ev_id(e).to_string();
            let ty = o.get_ev_type_of(e).to_string();
            let time = o.get_ev_time(e).to_rfc3339();
            let mut attrs: Vec<(String, String)> = o
                .get_ev_attrs(e)
                .map(|n| {
                    (
                        n.to_string(),
                        o.get_ev_attr_val(e, n)
                            .map(val_str)
                            .unwrap_or_else(|| "null".to_string()),
                    )
                })
                .collect();
            attrs.sort();
            events.push((id, ty, time, attrs));
        }
        events.sort();

        let mut objects = Vec::new();
        for ob in o.get_all_obs() {
            let id = o.get_ob_id(ob).to_string();
            let ty = o.get_ob_type_of(ob).to_string();
            let mut attrs: Vec<(String, Vec<(String, String)>)> = o
                .get_ob_attrs(ob)
                .map(|n| {
                    let series: Vec<(String, String)> = o
                        .get_ob_attr_vals(ob, n)
                        .map(|(t, v)| (t.to_rfc3339(), val_str(v)))
                        .collect();
                    (n.to_string(), series)
                })
                .collect();
            attrs.sort();
            objects.push((id, ty, attrs));
        }
        objects.sort();

        let mut e2o = Vec::new();
        for e in o.get_all_evs() {
            let eid = o.get_ev_id(e).to_string();
            for (q, ob) in o.get_e2o(e) {
                e2o.push((eid.clone(), q.to_string(), o.get_ob_id(ob).to_string()));
            }
        }
        e2o.sort();

        let mut o2o = Vec::new();
        for ob in o.get_all_obs() {
            let fid = o.get_ob_id(ob).to_string();
            for (q, to) in o.get_o2o(ob) {
                o2o.push((fid.clone(), q.to_string(), o.get_ob_id(to).to_string()));
            }
        }
        o2o.sort();

        let mut ev_type_schemas: Vec<(String, Vec<(String, String)>)> = o
            .event_types()
            .iter()
            .map(|t| {
                (
                    t.name.clone(),
                    t.attributes
                        .iter()
                        .map(|a| (a.name.clone(), a.value_type.clone()))
                        .collect(),
                )
            })
            .collect();
        ev_type_schemas.sort();
        let mut ob_type_schemas: Vec<(String, Vec<(String, String)>)> = o
            .object_types()
            .iter()
            .map(|t| {
                (
                    t.name.clone(),
                    t.attributes
                        .iter()
                        .map(|a| (a.name.clone(), a.value_type.clone()))
                        .collect(),
                )
            })
            .collect();
        ob_type_schemas.sort();

        Canonical {
            events,
            objects,
            e2o,
            o2o,
            ev_type_schemas,
            ob_type_schemas,
        }
    }

    /// Reads the overlay's effective event type; same call site under either R1 outcome.
    fn ov_ev_type<'a, A>(ov: &Overlay<'a, A>, e: A::EventRepr) -> String
    where
        A: LinkedOCELAccess<'a>,
        A::EventRepr: Copy + Eq + Hash,
        A::ObjectRepr: Copy + Eq + Hash,
    {
        ov.ev_type(e).to_string()
    }

    #[test]
    fn build_slim_identity_roundtrips() {
        let f = fixture();
        let rebuilt = build_slim(&Overlay::identity(&f));
        assert_eq!(canon(&rebuilt), canon(&f));
    }

    #[test]
    fn keep_mask_drops_events_and_their_dangling_edges() {
        let f = fixture();
        let mut ov = Overlay::identity(&f);
        ov.retain_events(|ov, e| ov_ev_type(ov, e) == "order");
        let out = build_slim(&ov);
        let c = canon(&out);

        // only the kept event type remains present
        assert!(c.event_types_present().iter().all(|t| t == "order"));
        assert_eq!(c.event_types_present(), vec!["order".to_string()]);

        // the dropped `ship` event `e2` is gone and no relationship references it
        let event_ids: HashSet<&str> = c.events.iter().map(|e| e.0.as_str()).collect();
        assert!(!event_ids.contains("e2"));
        for (ev_id, _q, _ob) in c.e2o_triples() {
            assert!(
                event_ids.contains(ev_id.as_str()),
                "dangling e2o edge from dropped event {ev_id}"
            );
        }

        // `order` events e1, e3 survive; all objects remain (event-only filter keeps objects)
        assert_eq!(event_ids.len(), 2);
        assert_eq!(c.objects.len(), 3);

        // `ship` type fully pruned from the rebuilt schema (no emptied-type declaration)
        assert!(!c.ev_type_schemas.iter().any(|(n, _)| n == "ship"));
    }

    #[test]
    fn retain_objects_drops_dangling_edges_to_removed_object() {
        let f = fixture();
        let mut ov = Overlay::identity(&f);
        // c1 is the target of O2O `owned_by` (from i1 and i2) and of E2O `buyer` (from e1);
        // dropping it must also drop those edges, not just the object itself.
        ov.retain_objects(|ov, o| ov.source().get_ob_id(o) != "c1");
        let out = build_slim(&ov);
        let c = canon(&out);

        // (a) c1 is absent from objects
        let object_ids: HashSet<&str> = c.objects.iter().map(|o| o.0.as_str()).collect();
        assert!(!object_ids.contains("c1"));
        assert_eq!(object_ids.len(), 2);

        // (b) no E2O triple has c1 as its object
        for (ev, q, ob) in &c.e2o {
            assert_ne!(
                ob.as_str(),
                "c1",
                "dangling e2o edge {ev}--{q}-->c1 survived object removal"
            );
        }

        // (c) no O2O triple has c1 as source or target
        for (from, q, to) in &c.o2o {
            assert_ne!(
                from.as_str(),
                "c1",
                "dangling o2o edge from removed object c1 (qualifier {q} to {to}) survived"
            );
            assert_ne!(
                to.as_str(),
                "c1",
                "dangling o2o edge {from}--{q}-->c1 survived object removal"
            );
        }
        // both owned_by edges targeted c1, so o2o is now empty
        assert!(c.o2o.is_empty());

        // (d) the rest of the structure, which does not reference c1, survives untouched
        assert!(object_ids.contains("i1"));
        let event_ids: HashSet<&str> = c.events.iter().map(|e| e.0.as_str()).collect();
        assert!(event_ids.contains("e2"));
        assert!(c
            .e2o
            .contains(&("e2".to_string(), "handled".to_string(), "i1".to_string())));
        assert!(c
            .e2o
            .contains(&("e1".to_string(), "primary".to_string(), "i1".to_string())));
        // only the one c1-targeting e2o edge (e1 buyer) was dropped, out of 6 originally
        assert_eq!(c.e2o.len(), 5);
    }

    /// Streams events directly via `AppendableOCEL`, bypassing `SlimLinkedOCEL::from_ocel`'s
    /// pre-sort, so the reader genuinely surfaces events out of time order.
    fn unsorted_fixture() -> SlimLinkedOCEL {
        let mut o = SlimLinkedOCEL::new();
        let _ = o.declare_event_type(OCELType {
            name: "order".to_string(),
            attributes: Vec::new(),
        });
        let _ = o.append_event(
            "e2".to_string(),
            "order",
            dt("2020-01-03T00:00:00+00:00"),
            Vec::new(),
            Vec::new(),
        );
        let _ = o.append_event(
            "e3".to_string(),
            "order",
            dt("2020-01-01T00:00:00+00:00"),
            Vec::new(),
            Vec::new(),
        );
        let _ = o.append_event(
            "e1".to_string(),
            "order",
            dt("2020-01-02T00:00:00+00:00"),
            Vec::new(),
            Vec::new(),
        );
        let _ = o.finalize();
        o
    }

    #[test]
    fn build_slim_orders_events_by_time() {
        let f = unsorted_fixture();

        // sanity: the source reader is genuinely out of order, so this exercises build_slim's
        // own sort rather than an already-sorted input.
        let src_times: Vec<DateTime<FixedOffset>> =
            f.get_all_evs().map(|e| *f.get_ev_time(e)).collect();
        let mut src_sorted = src_times.clone();
        src_sorted.sort();
        assert_ne!(
            src_times, src_sorted,
            "fixture setup bug: source reader is already time-sorted"
        );

        let rebuilt = build_slim(&Overlay::identity(&f));
        let times: Vec<DateTime<FixedOffset>> = rebuilt
            .get_all_evs()
            .map(|e| *rebuilt.get_ev_time(e))
            .collect();
        let mut sorted = times.clone();
        sorted.sort();
        assert_eq!(
            times, sorted,
            "build_slim did not emit events in non-decreasing time order"
        );
    }

    #[test]
    fn relabel_event_changes_type_and_eff_types() {
        let f = fixture();
        let mut ov = Overlay::identity(&f);
        let e1 = f.get_ev_by_id("e1").unwrap(); // order
        let e3 = f.get_ev_by_id("e3").unwrap(); // order

        ov.relabel_event(e1, "priority_order");
        assert_eq!(ov.ev_type(e1), "priority_order");

        let types: HashSet<&str> = ov.eff_ev_types().collect();
        assert!(types.contains("priority_order"));
        assert!(types.contains("order"), "e3 is still order");
        assert!(types.contains("ship"), "e2 untouched");

        // relabel the other `order` event too: `order` must now be fully unused
        ov.relabel_event(e3, "priority_order");
        let types: HashSet<&str> = ov.eff_ev_types().collect();
        assert!(
            !types.contains("order"),
            "order has no remaining member after both events relabeled"
        );
        assert!(types.contains("priority_order"));
    }

    #[test]
    fn relabel_object_changes_type_and_eff_types() {
        let f = fixture();
        let mut ov = Overlay::identity(&f);
        let i1 = f.get_ob_by_id("i1").unwrap(); // item

        ov.relabel_object(i1, "special_item");
        assert_eq!(ov.ob_type(i1), "special_item");

        let types: HashSet<&str> = ov.eff_ob_types().collect();
        assert!(types.contains("special_item"));
        assert!(types.contains("item"), "i2 is still item");
        assert!(types.contains("customer"));
    }

    #[test]
    fn override_ev_time_changes_only_that_event() {
        let f = fixture();
        let mut ov = Overlay::identity(&f);
        let e1 = f.get_ev_by_id("e1").unwrap();
        let e2 = f.get_ev_by_id("e2").unwrap();
        let new_t = dt("2099-01-01T00:00:00+00:00");

        ov.override_ev_time(e1, new_t);
        assert_eq!(ov.ev_time(e1), new_t);
        assert_eq!(
            ov.ev_time(e2),
            *f.get_ev_time(e2),
            "unaffected event unchanged"
        );
    }

    #[test]
    fn override_ob_attr_time_changes_one_entry_and_survives_build_slim() {
        let f = fixture();
        let mut ov = Overlay::identity(&f);
        let i1 = f.get_ob_by_id("i1").unwrap(); // price series: [(t0,9.99), (t1,8.5)]
        let new_t = dt("2099-01-01T00:00:00+00:00");

        // index 1 = the second ("price", t1, 8.5) entry
        ov.override_ob_attr_time(i1, 1, new_t);

        let vals: Vec<(DateTime<FixedOffset>, String)> = ov
            .ob_attr_vals(i1, "price")
            .map(|(t, v)| (t, val_str(v)))
            .collect();
        assert_eq!(vals.len(), 2);
        assert_eq!(vals[0].0, dt("2020-01-01T00:00:00+00:00"));
        assert_eq!(vals[0].1, "float:9.99");
        assert_eq!(vals[1].0, new_t, "overridden entry carries the new time");
        assert_eq!(vals[1].1, "float:8.5", "value itself is untouched");

        // and it must land in the materialized log, not just the read helper
        let out = build_slim(&ov);
        let c = canon(&out);
        let (_, _, i1_attrs) = c.objects.iter().find(|o| o.0 == "i1").unwrap();
        let price_series = &i1_attrs.iter().find(|(n, _)| n == "price").unwrap().1;
        let old_t1 = dt("2020-01-02T00:00:00+00:00").to_rfc3339();
        assert!(
            !price_series.iter().any(|(t, _)| *t == old_t1),
            "the pre-override time must be gone"
        );
        assert!(
            price_series.contains(&(new_t.to_rfc3339(), "float:8.5".to_string())),
            "the overridden time must carry the original value"
        );
    }

    #[test]
    fn strip_ev_attr_scoped_to_activity_hides_key_only_for_that_activity() {
        let f = fixture();
        let mut ov = Overlay::identity(&f);
        ov.strip_ev_attr(Some("order".to_string()), vec!["note".to_string()]);

        let e1 = f.get_ev_by_id("e1").unwrap(); // order, note="rush"
        let e2 = f.get_ev_by_id("e2").unwrap(); // ship, carrier="DHL"

        let e1_attrs: HashSet<&str> = ov.ev_attrs(e1).collect();
        assert!(!e1_attrs.contains("note"), "note stripped for order events");
        assert!(e1_attrs.contains("priority"), "priority untouched");
        assert_eq!(ov.ev_attr_val(e1, "note"), None);

        let e2_attrs: HashSet<&str> = ov.ev_attrs(e2).collect();
        assert!(
            e2_attrs.contains("carrier"),
            "ship events unaffected by an order-scoped strip"
        );

        // round-trip: "note" must be fully gone, including from the type schema
        let out = build_slim(&ov);
        let c = canon(&out);
        let (_, order_schema) = c
            .ev_type_schemas
            .iter()
            .find(|(n, _)| n == "order")
            .unwrap();
        assert!(!order_schema.iter().any(|(n, _)| n == "note"));
        let e1_out = c.events.iter().find(|e| e.0 == "e1").unwrap();
        assert!(!e1_out.3.iter().any(|(n, _)| n == "note"));
    }

    /// Regression: a scoped strip must be baked into the matched events immediately, not
    /// re-evaluated later against their (possibly since-relabeled) effective type.
    #[test]
    fn strip_ev_attr_survives_a_later_relabel_of_the_scoped_type() {
        let f = fixture();
        let mut ov = Overlay::identity(&f);
        let e1 = f.get_ev_by_id("e1").unwrap(); // order, note="rush"

        ov.strip_ev_attr(Some("order".to_string()), vec!["note".to_string()]);
        ov.relabel_event(e1, "priority_order");

        assert!(
            ov.ev_attr_val(e1, "note").is_none(),
            "the strip must stick to e1 even though it no longer reads as type 'order'"
        );
        let out = build_slim(&ov);
        let c = canon(&out);
        let e1_out = c.events.iter().find(|e| e.0 == "e1").unwrap();
        assert!(
            !e1_out.3.iter().any(|(n, _)| n == "note"),
            "materialized output must not resurrect the stripped attribute after the relabel"
        );
    }

    #[test]
    fn strip_ev_attr_none_scope_strips_across_all_activities() {
        let f = fixture();
        let mut ov = Overlay::identity(&f);
        ov.strip_ev_attr(None, vec!["priority".to_string()]);

        let e1 = f.get_ev_by_id("e1").unwrap(); // order
        let e2 = f.get_ev_by_id("e2").unwrap(); // ship (never had "priority")
        let e3 = f.get_ev_by_id("e3").unwrap(); // order

        assert!(!ov.ev_attrs(e1).any(|n| n == "priority"));
        assert!(!ov.ev_attrs(e3).any(|n| n == "priority"));
        assert!(
            ov.ev_attrs(e2).any(|n| n == "carrier"),
            "unrelated key untouched"
        );

        let out = build_slim(&ov);
        let c = canon(&out);
        let (_, order_schema) = c
            .ev_type_schemas
            .iter()
            .find(|(n, _)| n == "order")
            .unwrap();
        assert!(!order_schema.iter().any(|(n, _)| n == "priority"));
    }

    #[test]
    fn strip_ob_attr_scoped_to_object_type() {
        let f = fixture();
        let mut ov = Overlay::identity(&f);
        ov.strip_ob_attr(Some("item".to_string()), vec!["price".to_string()]);

        let i1 = f.get_ob_by_id("i1").unwrap(); // item
        let c1 = f.get_ob_by_id("c1").unwrap(); // customer

        assert!(!ov.ob_attrs(i1).any(|n| n == "price"));
        assert_eq!(ov.ob_attr_vals(i1, "price").count(), 0);
        assert!(
            ov.ob_attrs(c1).any(|n| n == "name"),
            "customer attrs unaffected by an item-scoped strip"
        );

        let out = build_slim(&ov);
        let c = canon(&out);
        let (_, item_schema) = c.ob_type_schemas.iter().find(|(n, _)| n == "item").unwrap();
        assert!(!item_schema.iter().any(|(n, _)| n == "price"));
        let (_, _, i1_attrs) = c.objects.iter().find(|o| o.0 == "i1").unwrap();
        assert!(!i1_attrs.iter().any(|(n, _)| n == "price"));
    }
}
