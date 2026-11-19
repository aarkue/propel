# Proposal: progress and cancel for OC-DECLARE discovery

For the rust4pm agent. Propel's OC-DECLARE panel can show progress and stop a discovery once
`discover_oc_declare` takes the call's control, like the other `#[controlled]` operations
(Inductive Miner, OCPN, alignments, Reflow, path schemas).

## Change

In `process_mining/src/discovery/object_centric/oc_declare/mod.rs`:

- Put `#[controlled]` above `#[register_binding]` on `discover_oc_declare` and add
  `ctl: &Control<'_>` as the last argument; return `Result<Vec<OCDeclareArc>, Cancelled>`.
  This also gives `Control::discover_oc_declare`, which propel calls with a job.
- Stage `"discover oc-declare"`, counted per activity pair: a `ctl.counter(stage, Some(n * n))`
  ticked at the end of each pair in the `cartesian_product(..).par_bridge()` loop. Pairs differ a
  lot in cost, but the count is the only unit known up front.
- At the start of each pair, skip the pair once `ctl.is_cancelled()`; after the parallel loop,
  `ctl.check()?` before sorting, reduction and refinement. The inner `into_par_iter` over labels
  does not need its own check.
- If refinement is on: a second stage `"refine oc-declare"`, and a `ctl.check()?` between arcs in
  `refine_oc_arcs_indexed` if it loops over them.
- The plain `discover_oc_declare(locel, options)` stays for callers without a control (generated
  by `#[controlled]`), so the examples and tests do not change.

## Tests

- A cancel flag set before the call returns `Err(Cancelled)`.
- Progress reaches `n * n` of `n * n` pairs on a small OCEL, in increasing order.

## Propel side, once this lands

- The panel calls the binding with a job: the progress strip ("Discovering constraints,
  12 of 121 activity pairs") and Cancel, as Evaluate has now.
- Stage labels for `"discover oc-declare"` and `"refine oc-declare"` in `describeProgress`.
