# rust4pm: what landed for A1 and Reflow

Answer to `rust4pm-jobs-and-host-shims.md` (A1 and Reflow 1-4). Library: `~/code/fork-rust4pm`,
branch `fix/ocel-sql-null-roundtrip`, uncommitted on top of `df09ab6`. All entries are in
`CHANGELOG.md` under `## 0.7.0`.

## A1: Control

`process_mining::Control` (also `process_mining::bindings::Control` and
`utils::control::Control`):

```rust
let cancel = AtomicBool::new(false);
let ctl = Control::new()
    .on_progress(|p: Progress| ...)        // Progress { stage: Cow<'static, str>, done: u64, total: Option<u64> }
    .on_partial(|v: serde_json::Value| ...)
    .cancel_flag(&cancel);
```

- All three callbacks are `Fn + Send + Sync`. Parallel operations call them from several threads.
- How often progress is reported depends on the operation (per variant, every 4096 rows, every
  1 MiB, ...), so hosts should throttle what they forward.
- `Cancelled` is the library-level error (`Display`: `"cancelled"`).

### Calling bindings

```rust
bindings::call_with_context(binding, &args, &state, &ctl) -> Result<Vec<u8>, CallError>
bindings::call_resolved_with_context(binding, &args, &state, &ctl) -> Result<Vec<u8>, CallError>
bindings::call_with_outcome(binding, &args, &state, &ctl) -> Result<CallOutcome, CallError>          // BREAKING: new ctl arg
bindings::call_resolved_with_outcome(binding, &args, &state, &ctl) -> Result<CallOutcome, CallError> // BREAKING: new ctl arg
pub enum CallError { Cancelled, Failed(String) }   // Display: "cancelled" / the message; From<CallError> for String
```

- `call` and `call_resolved` are unchanged: they run with an inert control and return `String` errors.
- A cancelled call returns `CallError::Cancelled` and stores nothing. This holds when the flag is
  set before the call, while it runs, or after the body has finished but before the result was
  stored.
- An error raised while the flag is set is reported as `Cancelled`.
- `call_resolved_with_context` reports progress and honors cancel while it imports OCEL,
  SlimLinkedOCEL and IndexLinkedOCEL arguments given as `{path}`, `{bytes}` or a bare file path.
  The stage is `"import <arg name>"` (see Importers below).
- In a binding, a `#[bind(ctx)] ctl: &Control<'_>` argument is hidden from the args schema and
  from the required args.

### Bindings with progress and cancel

The JSON args and success output are unchanged. These bindings now fail with `cancelled`.

| Binding | Stages (`done` / `total`) | One partial value |
|---|---|---|
| `align_variants` | `"align variants"`: variants / #variants | `{ "variant": <index into projection.traces>, "result": VariantAlignmentResult }` |
| `align_variants_with_retry` | as above, then `"retry variants"`: retried / #retried (only if something is retried) | same; a later partial with the same `variant` replaces the earlier one |
| `align_trace` | cancel only | none |
| `escaping_edges_precision` | `"align variants"` (+ `"retry variants"`), then `"escaping edges"`: variants / #variants | none |
| `discover_inductive_net`, `_tree`, `_net_with`, `_tree_with` | `"inductive miner"`: steps found so far / None | none |
| `discover_ocpn` | `"discover ocpn"`: object types / #types (the per-type IM runs get cancel only) | none |
| `path_schema_enumerate` | `"enumerate path schemas"`: explored partial paths (every 4096) / None | one `ResolvedPathSchema`, as an element of `schemas` |
| `path_schema_discover` | `"enumerate path schemas"`, then `"summarize path schemas"`: sources scanned over all schemas / #schemas x #sources | one `DiscoveredSchema`, in `index` order (see note) |
| `path_schema_connections` | `"find connections"`: sources / #sources | none |
| `reflow_discover` | `"reflow grid"`: activities / #activities; `"reflow expansion"`: candidate cells / #candidates; `"reflow search"`: work used / `max_work` (None if unlimited), reported about every 1 ms of work | none |

- **Note on `path_schema_discover` partials:** a partial equals the final `schemas[i]` except
  for `equivalence_class`. The final classes are sorted by representative, so they are only
  known at the end. In a partial, this field holds the `index` of the first schema so far with
  the same connection set (or its own index). Replace it from the final result.
- **Importers** (direct library use and the argument resolution above):
  - JSON, XML and CSV (also `.gz`): `done` = bytes read, `total` = the file or slice length
    (compressed bytes for `.gz`), reported every 1 MiB.
  - SQLite and DuckDB: one stage per table kind, every 4096 rows:
    - `"<S>: objects"` (total `COUNT(object)`)
    - `"<S>: object changes"` (total None)
    - `"<S>: events"`
    - `"<S>: event-object relations"`
    - `"<S>: object-object relations"`
  - Bundle: no progress, cancel checked before and after.

### Library methods (for hosts calling Rust directly)

These are inherent methods on `Control`. The plain functions are unchanged.

- `align_variants`, `align_variants_with_retry`, `align_log`: `-> Result<_, Cancelled>`
- `align_trace`: `-> Result<_, AlignmentError>`
- `escaping_edges_precision`: `-> Result<_, PrecisionError>`
- `discover_inductive_{net,tree,net_with,tree_with}` and `discover_inductive_tree_from_log`:
  `-> Result<_, Cancelled>`
- `discover_ocpn_from`
- `discover_path_schemas`, `enumerate_schemas_limited`, `find_connections`,
  `find_connections_with_sources`, `summarize_connections`
- `reflow`, `reflow_with`
- `import_ocel_path(path)`, `import_ocel_slice(bytes, format)`, `import_ocel_reader(reader, format)`:
  `-> Result<OCEL, OCELIOError>`

## Reflow

1. `reflow_flow_log(ocel: <SlimLinkedOCEL id>, result: <ReflowResult handle>) -> <SlimLinkedOCEL id>`
   - It equals `reflow_flow_projection(reflow_tag(..))`, without the tagged copy.
   - Library: `ReflowResult::flow_log(&SlimLinkedOCEL)`.
2. `reflow_cells` cells gain `minObjects` / `maxObjects`.
   - These count distinct objects of the type per event of the activity, over the source log, so
     the minimum is 0 if some event has none.
   - Added (expansion) cells count the added participations.
   - Unlike OC-DECLARE's involvement, which counts relationship entries, duplicates do not count
     twice. So `get_activity_object_involvements` is no longer needed for the mapping.
   - Library: `ReflowResult::involvements() -> BTreeMap<activity, BTreeMap<type, ObjectInvolvementCounts { min, max }>>`.
3. Badges (`visualization::badges`):
   - `TypeBadge { object_type: String, from?: String, card?: InvolvementCard, from_card?: InvolvementCard }`
     - The JSON keys are snake_case like the other build options, so propel's `fromCard` becomes
       `from_card`.
     - `InvolvementCard` takes the values `"0..1" | "0..*" | "1..1" | "1..*"`. A missing `card`
       is drawn like `"1..1"`.
     - `OcpnBadge` is now a type alias of `TypeBadge`, and the schema/TS type name changed to
       `TypeBadge`.
   - `badges: { [activity]: TypeBadge[] }` is accepted by `OcpnBuildOptions`, `DfgBuildOptions`
     and `OcdfgBuildOptions`, so also by the layout and drawing bindings. On an OC-DFG, an
     activity shared by several types gets its badges once.
   - Order:
     - Groups by `from`, in first-seen order: the source disc (with the `from_card` of the
       group's first badge), the arrow (graphlay's maps-to symbol, 9x8), then the targets.
     - After the groups, the badges without `from` come last, as plain discs without an arrow.
   - Geometry (public constants and functions; propel should draw from these):
     - Constants:
       - `BADGE_RADIUS 4.33`, `BADGE_STEP 3.1` (three discs for many)
       - `BADGE_OUTLINE_WIDTH 1.0`, `BADGE_DASHED_OUTLINE_WIDTH 1.3`, `BADGE_DASH "2.2 1.6"` (min 0)
       - `BADGE_OUTLINE_MIX 0.35` (the border is mixed toward the text color)
       - `BADGE_GAP 2`, `BADGE_GROUP_GAP 10`, `BADGE_ARROW_WIDTH 9`, `BADGE_ARROW_HEIGHT 8`
       - `BADGE_ROW_HEIGHT 16`, `BADGE_ROW_BOTTOM 10`, `BADGE_PADDING 8`
     - Disc width: `2R + 2*outline`, plus `2*STEP` when many.
     - Group width:
       - with a source: `disc(from) + GAP + ARROW + GAP + sum(discs) + GAP*(n-1)`
       - without one: `sum(discs) + GAP*(n-1)`
     - Row: the groups plus `GROUP_GAP` between them, centered in the node.
     - A node with badges is 16 higher (activities 52 -> 68) and at least the row width +
       `2*PADDING` wide. The other content moves up 8, and the disc centers sit 10 above the
       bottom edge.
     - Functions: `badge_disc_width`, `badge_row(&[TypeBadge]) -> BadgeRow { groups, width }`,
       `badge_row_width`, `badge_node_size`.
     - graphlay draws the three discs right to left (the leftmost on top); MultiDot draws them
       left to right.
   - `AnnotatedOcpn` gains `involvements`, and its drawing sets `card`/`from_card` from them.
4. `reflow_discover` reports progress and honors cancel (see the table).

Also: `get_activity_object_involvements` (and the two O2O variants) now count an event or object
with none of a type as 0, so `min` can be 0. OC-DECLARE discovery only reads `max` and is
unaffected; the OC-DECLARE drawing now shows dashed rings for optional types.

## Breaking changes

1. `call_with_outcome` and `call_resolved_with_outcome` take `&Control` and return `CallError`.
   `Binding::handler` is `fn(&Value, &AppState, &Control) -> Result<Vec<u8>, CallError>`.
2. Binding ids, with their names unchanged:
   - The ids of `align_variants`, `align_variants_with_retry`, `escaping_edges_precision`,
     `discover_inductive_{net,tree,net_with,tree_with}` and `discover_ocpn` now end in
     `_binding` (e.g. `...::alignments::align_variants_binding`).
   - Regenerate `bindings.generated.ts`.
3. These bindings return an error when cancelled (previously infallible or not cancellable):
   - `align_variants`, `align_variants_with_retry`
   - `discover_inductive_*`, `discover_ocpn`
   - `path_schema_enumerate`, `path_schema_discover`, `path_schema_connections`
   - `reflow_discover`
4. New variants: `SearchError::Cancelled`, `PrecisionError::Cancelled`,
   `OCELIOError::Cancelled`.
5. `SearchLimits<'a>` gains a lifetime and `cancel: Option<&'a AtomicBool>`.
6. Badges:
   - `OcpnBadge` becomes `TypeBadge` (an alias) with the new fields `card` and `from_card`.
   - `DfgBuildOptions` and `OcdfgBuildOptions` gain `badges`.
   - OCPN badges look different: bigger discs, a 16 instead of 14 row, grouped by `from`.
7. Reflow:
   - `ReflowCell` gains `min_objects` / `max_objects`, and `AnnotatedOcpn` gains `involvements`
     (serde default).
   - A `ReflowResult` serialized before this change does not deserialize.
8. Behavior:
   - The involvement functions can return `min` 0.
   - `RegistryItem::load_from_path` for an IndexLinkedOCEL now goes through the OCEL importer:
     DuckDB files and bundle directories load, and SQLite is opened as a file.

## Follow-ups (round 2)

1. Registry loaders with a Control (in `process_mining::bindings`):
   ```rust
   ctl.load_registry_item_path(kind: &RegistryItemKind, path: &str) -> Result<RegistryItem, CallError>
   ctl.load_registry_item_bytes(kind: &RegistryItemKind, data: &[u8], format: &str) -> Result<RegistryItem, CallError>
   ```
   - They match `RegistryItem::load_from_{path,bytes}`.
   - Progress is reported with stage `"import"` for OCEL, SlimLinkedOCEL and IndexLinkedOCEL, as
     `import_ocel_path` does. Other kinds load without progress.
   - Once the flag is set, they return `CallError::Cancelled`.
   - Direct SlimLinkedOCEL import:
     `ctl.import_slim_ocel_path(path: impl AsRef<Path>) -> Result<SlimLinkedOCEL, OCELIOError>`.
2. `ctl.escaping_edges_precision_from_alignments(net: &AcceptingPetriNet, alignments: &[VariantAlignmentResult], options: &EscapingEdgesOptions) -> Result<EscapingEdgesPrecision, PrecisionError>`
   - Stage `"escaping edges"`, one unit per variant. Cancelling returns `PrecisionError::Cancelled`.
   - The binding of the same name takes ctx. Its id changed to
     `...::precision::escaping_edges_precision_from_alignments_binding` (breaking); the name is
     unchanged.
3. `ReflowCell::min_objects` / `max_objects` are `#[serde(default)]`: older `ReflowSummary` JSON
   loads with `0` for both.

## Follow-ups (round 3): XES

1. `ctl.load_registry_item_{path,bytes}` now also report and cancel for `EventLog`,
   `EventLogActivityProjection` and the `xes`/`xes.gz` to OCEL/SlimLinkedOCEL conversion.
   - Stage `"import"`, `done` = bytes read, `total` = file size or `data.len()`. For `.xes.gz` the
     bytes are the compressed ones.
   - The read fails on the next chunk once the flag is set; the loader returns
     `CallError::Cancelled`.
   - The conversion after parsing reports nothing.
   - `call_resolved_with_context` uses the same loaders, so XES arguments report under
     `"import <arg>"`.
2. Direct use (in `process_mining::core::event_data::case_centric::xes::import_xes`, methods on
   `Control`):
   ```rust
   ctl.import_xes_path(path: impl AsRef<Path>, options: XESImportOptions) -> Result<EventLog, XESParseError>
   ctl.import_xes_slice(xes_data: &[u8], is_compressed_gz: bool, options: XESImportOptions) -> Result<EventLog, XESParseError>
   ```
   They match `import_xes_path` / `import_xes_slice`.
3. Breaking: `XESParseError` gains a `Cancelled` variant.

## Round 4: release review fixes (relevant to propel)

1. Badges:
   - `visualization::ocpn::OcpnBadge` is removed; use `visualization::badges::TypeBadge`.
   - `badge_node_size(size, badges)` is now `badge_node_size(size, badges, note: bool)`, plus the new
     const `BADGE_NOTE_HEIGHT`.
   - A node with both badges and a note is 14px taller, so the note no longer overlaps the discs.
2. Reflow:
   - `AnnotatedOcpn::svg(style)` is now `svg(style, palette: Option<&Palette>)`.
   - New `ctl.reflow_from_tagged(tagged, options)`. The `reflow_from_tagged` binding now takes ctx,
     reports progress and can be cancelled.
   - Results can differ:
     - same-type O2O edges no longer become schema functions;
     - a skipped expansion no longer forces the keep-all fallback;
     - the exact search counts the self-loop arc of a single activity that repeats in a variant.
3. Calls:
   - A binding that panics after a cancel returns `CallError::Failed("... panicked ...")` (with
     the ids of removed `&mut` items), not `Cancelled`.
   - Progress from parallel `Counter`s only goes up: stale reports are skipped.
4. `locel_append_batch`:
   - It rejects a new object id given twice with different types.
   - `objects_updated` counts only pre-existing objects that actually changed.
5. Imports:
   - XES dates use the lenient OCEL timestamp parser (date only, `+02`, space separator).
   - SQLite/DuckDB "import: objects" progress now reaches its total.
   - SQL export replaces an existing file only on success.
   - `DatabaseError` gains an `Io` variant.

## Round 5: binding ids are `<crate>::<name>` (breaking)

Every binding id is now the crate name plus the binding name, e.g.
`process_mining::reflow`, `process_mining::ocel_type_stats`,
`process_mining::discover_oc_declare` (fn `discover_behavior_constraints`),
`process_mining::locel_new`. A downstream crate's bindings get its own crate name, e.g.
`app_bindings::foo`. Ids no longer change when a function moves.

To migrate, replace each hard-coded id with `process_mining::` plus the binding's `name` (the
`name` field of `list_functions_meta`), e.g. with a helper `pm("reflow")`. Then regenerate
`bindings.generated.ts`. About 20 files under `apps/studio/src` hard-code ids (`grep -rn
'"process_mining::' apps packages`), plus `const B = "process_mining::bindings::reflow_bindings"`
prefixes in `reflow.tsx`, `_discovery.ts` and similar.

Binding names, arguments, defaults, results and progress are unchanged. Thirteen former
`*_binding` wrappers (Inductive Miner, OCPN, alignments, precision, `reflow_discover`,
`reflow_from_tagged`, `path_schema_discover`) are now registered on the library function with
`#[register_binding(controlled)]`.

Rust: `ReflowResult::from_tagged(tagged, options)` is now the free fn
`reflow::reflow_from_tagged(tagged, options)`. New `Control::discover_ocpn`.

Two binding names changed to match their functions: `reflow_discover` is now `reflow`, and
`path_schema_discover` is now `discover_path_schemas`. Arguments and results are unchanged.

Propel's cache check `function_id.starts_with("process_mining::bindings")`
(engine/backend-shared/src/lib.rs ~618) never matches the new ids, so `#[bind(state)]` bindings
such as `extraction_*_items` could return stale cached results. Key it on something other than
the id prefix.

## Round 6: API cleanup before 0.7 (breaking)

Rust code in propel that needs a change:

- `engine/app-bindings/src/alignments.rs:255`: `ctl.discover_inductive_net_with(log, miner)` is
  now `ctl.discover_inductive_net(log, miner)`. The positional
  `discover_inductive_{net,tree}(log, variant, threshold, preset)` are gone; pass
  `variant.options(preset, threshold)`.

Binding names propel calls that changed:

| old | new |
|---|---|
| `discover_inductive_tree_with`, `discover_inductive_net_with` | `discover_inductive_tree`, `discover_inductive_net` (arg `miner`; without it IMf 0.2) |
| `discover_dfg_from_ocel` | `discover_ocdfg` |
| `get_event_timestamps` | `event_timestamp_histogram` |

Other binding changes (not hard-coded in propel):

- Removed: `index_link_ocel`, `slim_link_ocel`, `locel_construct_ocel`,
  `log_to_activity_projection` (the registry converts kinds), `get_object_type_of_id`,
  `get_event_type_of_id`, `get_event_timestamp_of_id`, `get_e2o_ids`, `get_o2o_ids`,
  `path_schema_type_graph` (use `oc_type_graph_from_ocel`), `align_empty_trace`,
  `align_variants_with_retry` (set `AlignmentOptions::retry_out_of_memory`),
  `export_ocel_duckdb_to_path`, `read_consolidated_{,slim_}ocel_from_duckdb` (loading a
  `.duckdb` reads either layout), `*_items_dbcon` (folded into `extraction_*_items`).
- Renamed: `get_obj_activity_trace` -> `locel_get_ob_activity_trace`, `get_object_ids_of_type` ->
  `locel_get_ob_ids_of_type`, `get_event_ids_of_type` -> `locel_get_ev_ids_of_type`,
  `get_e2o_rev_ids` -> `locel_get_e2o_rev_ids`, `get_num_cases`/`get_num_variants` ->
  `num_cases`/`num_variants`, `locel_oc_perf_*` -> `oc_perf_*`, `locel_event_object_type_counts`
  -> `event_object_type_counts`, `locel_conversion_rate` -> `conversion_rate`,
  `write_{,slim_}ocel_to_consolidated_duckdb` -> `write_ocel_to_duckdb`, `stream_ocel_to_duckdb` ->
  `stream_ocel_file_to_duckdb` (both take `options: DuckDbWriteOptions`, `overwrite` inside).
- `EscapingEdgesOptions.log_paths.Aligned` no longer has `retry_out_of_memory`; it moved into its
  `options` (`AlignmentOptions`).

OCPQ (separate checkout, breaks when it moves to this version): `discover_behavior_constraints` is
`discover_oc_declare`, and `find_connections_with_sources` is gone (`find_connections` collects the
sources).
