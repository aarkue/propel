# rust4pm changes propel needs (A1, A3)

For the agent working on `~/code/fork-rust4pm`. Propel is on the 0.7.0 release candidate (branch
`fix/ocel-sql-null-roundtrip`) via a path dependency. Nothing below is implemented in the library
yet. Propel has stop-gap shims for A3 that go away once the library has them.

## Decisions (2026-11-10)

- This round: A1 and the Reflow additions. A3 waits; propel keeps its shims for now.
- A1 is a context parameter (`#[bind(ctx)]`); hosts own job ids, threads, events and cancel.
- Cancel returns a `Cancelled` error; nothing is stored.
- Streaming partial results are in scope now, for path schema discovery and alignments.
- A1 covers alignments and precision, discovery (IM, OCPN, path schemas), `reflow_discover` and
  the OCEL importers (counts of events/objects parsed when the total size is unknown, like the
  streaming XES import).
- The library draws the Reflow badges (OC-DECLARE style); propel mirrors them on screen.
  Involved types are plain discs without an arrow, after the grouped implied ones.
- Breaking changes in the 0.7.0 RC are fine if listed.

## A1: progress and cancellation for long binding calls

Long calls (alignments, `escaping_edges_precision`, Inductive Miner on large logs, path schema
discovery, OCEL imports) cannot report progress or be stopped. Propel's webserver and Tauri hosts
run calls on blocking threads now, but the user still waits without feedback and cannot cancel.

Proposal:

1. A `CallContext` the library passes to bindings that ask for it:
   ```rust
   pub struct CallContext<'a> {
       pub progress: &'a (dyn Fn(Progress) + Sync),
       pub cancelled: &'a AtomicBool,
   }
   pub struct Progress { pub done: u64, pub total: Option<u64>, pub stage: Cow<'static, str> }
   ```
   reachable in a binding as `#[bind(ctx)] ctx: &CallContext` (same mechanism as `#[bind(state)]`,
   macros_process_mining/src/lib.rs:164-169). The argument does not appear in the schema.
2. `call_with_context(binding, args, state, ctx)` and `call_resolved_with_context`; today's `call`
   uses a no-op context, so nothing breaks.
3. A `Cancelled` error that bindings return when `cancelled` is set (a typed variant once
   `BindingError` from proposal 2.3 exists, a fixed string until then).
4. Use it where it matters most:
   - `align_variants` / `align_log` / `align_variants_with_retry`: progress per aligned variant,
     check `cancelled` between variants. `SearchLimits` could also take the flag so one huge trace
     stops early (utils/dijkstra_search.rs).
   - `escaping_edges_precision`: progress per variant.
   - Inductive Miner: progress per recursion step is hard to bound; a stage name plus cancel checks
     at each cut is enough.
   - `path_schema_discover` / `path_schema_enumerate`: progress over sources, cancel between them.
   - OCEL importers (XML/JSON/SQLite/DuckDB): bytes read of total.
5. Optional: let a binding stream partial results through the context
   (`ctx.partial(serde_json::Value)`), so a sweep or path discovery can show results while running.

Propel side (no library change needed once 1-3 exist): a job id per call, a `job-progress` event
over SSE/Tauri, a `cancel_job` endpoint, and progress bars with Cancel in the views.

## A3: move propel's host shims into the library

Each item replaces propel code (engine/backend-shared/src/lib.rs and models.rs).

1. **Inline JSON for handle arguments in `call`.** `#[bind(handle)] &T` and big-type `&T`
   arguments accept an id; `call_resolved` also accepts inline JSON, but `call` does not. Propel
   stores inline values as temporary items itself (`store_inline_handles`). Proposal: `call`
   accepts inline JSON for handle arguments too (store temporarily, drop after the call), without
   the path loading `call_resolved` does (a webserver must not read arbitrary paths).
2. **Stored ids for by-value model arguments.** Bindings that take a model by value
   (e.g., `petri_net_layout_request(net: AcceptingPetriNet)`, the visualization bindings) should
   accept the id of a stored model of that kind. Propel does this in `inline_stored_models`.
   Alternative: give those bindings `#[bind(handle)]` arguments, which with item 1 accept both.
3. **Lenient PNML import.** `AcceptingPetriNet::import_pnml` requires both markings; many files
   have none. `ImportOptions { missing_initial: Empty | Error, missing_final: Empty | SinkPlaces | Error }`
   on the existing `Importable` trait. Propel's lenient loader is in `models.rs`.
4. **`.apnml`** (ProM's accepting Petri net files) in `AcceptingPetriNet::known_import_formats`.
5. **OC-DECLARE model file with layout.** Propel stores OC-DECLARE models as its own artifact
   (`{version, arcs, nodes: [{name, position}]}`, backend-shared/src/oc_declare_file.rs) because
   the library's `OCDeclareModel` kind keeps only the arcs and only accepts `.json`. Proposal: an
   `OCDeclareModel { arcs, layout: Option<Vec<NodePosition>>, version }` that reads both the bare
   arc list and the file with layout, and accepts the `.ocdeclare` extension. Then propel's
   artifact store can go entirely.
6. **Pure binding marker** (for propel's result cache, A2). Propel caches a call's result when the
   binding is outside `process_mining::bindings`, has no `&mut` argument and mints nothing; that
   prefix rule is a guess. A flag in `BindingMeta` (`pure: bool`, false for anything taking
   `#[bind(state)]`, doing I/O or randomness) would make it exact.

## Reflow: small additions for propel's integration

Propel uses Reflow as: `reflow_discover` (named, hidden result) -> `reflow_cells` for the panel,
then `reflow_tag` -> `reflow_flow_projection` to make the flow log, plus a propel `ReflowMapping`
artifact (`.reflow`: `{version, source, flowLog, involvement, summary: ReflowSummary}`) that the
OCPN and OC-DFG views draw as badges on the flow log's models. `involvement` is the min/max
objects per event per activity and type (`get_activity_object_involvements`), so badges look like
OC-DECLARE's involvement dots (three discs for several, dashed border when possibly none), grouped
by source type (`orders -> customers, items`). Nice to have, none blocking:

1. **`reflow_flow_log(ocel, result)`**: the flow projection straight from a result. Propel now
   tags, projects and drops the tagged copy, which holds a second full log in memory meanwhile.
2. **Progress and cancel for `reflow_discover`** through the A1 context, for large logs.
3. **Badges in the drawings, in OC-DECLARE's style.** `OcpnBuildOptions.badges` draws plain
   r=3.5 dots, one source dot and arrow per badge, with no multiplicity. Propel draws bigger
   OC-DECLARE-style dots grouped by source and pads the badge lists it sends to the layout so
   transitions get room, but OCPN SVG exports still show the library's plain dots. The (OC-)DFG
   build options have no badges at all: propel reserves width with hidden label filler, and the
   fixed 52px activity height limits the name to one line when badges are present. Proposal:
   `OcpnBadge { object_type, from, card: Option<"0..1"|"0..*"|"1..1"|"1..*"> , from_card }`, drawn
   grouped by `from` with OC-DECLARE's disc shapes (radius 4.33, three discs 3.1 apart for `*`,
   dashed border for min 0), and the same `badges` option on `DfgBuildOptions`/`OcdfgBuildOptions`
   that adds a row to the node's height. Then propel's padding and filler go away and exports
   match the screen.
4. **Involvement in the mapping** (optional): `ReflowSummary` could carry min/max objects per
   event for each cell, so a saved mapping is self-contained without propel's extra
   `involvement` call.

## Status (2026-11-10)

A1 and the Reflow additions landed in rust4pm (8b5c40c) and propel uses them: a `Control` per job
id, `job-update` events, a cancel endpoint, progress cards and strips with Cancel, streamed
alignments and path schemas, import progress in the toast, `reflow_flow_log`, cell object counts,
and the library's badge geometry (no more padding or label filler).

The follow-ups (registry loaders with a `Control`, precision from alignments with a `Control`)
are in as well; see `rust4pm-a1-reflow-landed.md`, "Follow-ups (round 2)".
