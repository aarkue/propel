# Changelog

Changes to `@r4pm/components` by release. Breaking changes come first in each release.

## 0.5.0

### Breaking changes

- `DottedChart` no longer takes `title`.
- `TypeScopeSelector` no longer takes `triggerVariant`. The prop had no visible effect.
- `RustPetriNet`: a transition's `label` is now always present, `null` for a silent transition.
- `SearchError` adds `"Cancelled"`, since alignments can now be cancelled.
- The extraction blueprint types follow rust4pm 0.7:
  - `CompileError` and `RejectReason` drop `UnportableRegex` and `UnsupportedEmissionShape`.
  - `DropReason` adds `DuplicateObjectRejected`.
  - `ValidationError` adds `ambiguous-join-column`.
  - `ExtractionReport` adds `errors_suppressed` and `pushdown_declined`.

Code that switches exhaustively over one of these unions needs the new cases.

### New views

- Event logs:
  - `LogOverviewBoard`: size, throughput, top variants and activities.
  - `PerformanceSpectrumView` (`/charts`): every passage through the steps of a path, over time.
  - `PrefixTreeView` (`/charts`): variants merged on their shared prefixes.
  - `ModelSweepChart` (`/charts`): fitness, precision and size of discovered nets over noise thresholds.
  - `DfgDiffViewer`: two logs or two periods on one DFG.
- Object-centric event logs:
  - `OcelOverviewBoard`, `ObjectPopulationView`, `LifecycleMapView`, `ObjectLifelinesView`.
  - `EventSignaturesView`: the object types each event type involves, and how many of each.
  - `PathSchemasView`: relation paths between types, ranked by coverage and selectivity.
  - `ExecutionGraphView`: the events around one object as a partial order.
  - `ReflowView`: which object relations carry the flow, for a smaller log.
  - `ViolationExplorer`: the violations of one OC-DECLARE constraint, with the objects involved.
- Both:
  - `OcelHealthView`: data-quality checks. With `onRepair`, each finding offers fixes, the
    recommended ones preselected, and the picked repairs are handed to the host.
  - `WorkloadCalendar`: events by weekday and hour, in the recorded offsets or any time zone.
- Animations, all needing `viz`:
  - `ProcessMapAnimation`: cases or objects moving over a DFG or OC-DFG in real time.
  - `PetriNetAnimation`: cases replayed on a Petri net through their alignments.
  - `OcpnAnimation`: objects replayed on an object-centric Petri net, with fitness and waits.

### New building blocks

- View kit, for host views that look like the built-in ones: `Toolbar` (with `ToolbarHostContext`),
  `OptionMenu`, `Segmented`, `Metric`/`MetricRow`, `Section`, `Bar`, `LegendItem`, `RampLegend`,
  `TypeChip`, `TypeBadges`, `useChartTooltip`, and the formatters `fmtInt`, `fmtPct` and
  `formatDuration`.
- Tables: `SearchField` (optionally debounced), `SortableHeader`, `SortIcon`, `ExpandableRow` and
  `TablePager`.
- `VariantSelect` and `VariantRow`: pick a variant from a searchable list of activity chips.
- `TimeZonePicker` with `timeZoneArg`, which turns a zone into the offset changes the workload bindings take.
- `JobProgressCard`, `JobProgressStrip`, `PartialResultStrip` and `describeProgress`, for long engine
  calls. An optional `units` table names what each stage counts.
- `CardPickerButton` (`/ui`): one button for an action that can be done in several ways.

### Conventions of the new views

- The main input is `data`. Settings the host persists are `controls` with `onControlsChange`;
  without the callback the settings are read-only. Each view exports `XxxProps` and, where it has
  settings, `XxxControls` and `DEFAULT_XXX_CONTROLS`.
- A view's toolbar renders into the element of `ToolbarHostContext` when a host provides one, e.g.,
  a panel header, and inline above the view otherwise.

### Additions to existing components

- `OCDFGViewer`, `ObjectCentricPetriNetViewer` and `ObjectCentricPetriNetWorkbench` take `badges`,
  per-node type badges. `OCDFGViewer` also takes `topLeftExtra`.
- `OCDeclareViz` takes `onExploreViolations`.
- `LogAlignments` carries an optional `precision`, which `AlignmentNetViewer` shows on a tab.
- `ActivitySequence` takes `singleLine`, and `CardSelector` takes `columns={1}`.
- `layoutOcpnElements` and `ocpnElementsSvg` take layout `options`.
- A `PetriNetOverlay` transition can return `exportDecoration`, SVG markup the exported image draws
  over it. `AlignmentNetViewer` uses it, so the exported net shows the moves bars, and its
  "By variant" tab exports the selected alignment.
- `AlignmentNetViewer` shows extra events (log moves) on a transition only when no other
  transition has the same label. They belong to an activity, not to one of its transitions.

### Changed look

- `StatCards` render as `Metric` tiles.
- `AlignmentNetViewer`, `DottedChart` and the DFG settings use the kit's segmented control.
- Synchronous, model and log moves have one color each (green, orange, amber) in the alignment
  strips, the alignment net and the animations. Deviations are shown only in these colors: the
  transition tints of `AlignmentNetViewer` and `OcpnAnimation` and the lists of extra events no
  longer use the green-amber-red scale, which is kept for fitness and precision.
- DFG and OC-DECLARE node borders accept any CSS color from `colorOf`, not only hex.
- `PetriNetViewer` with `editable`: an arc shows its delete button while hovered or selected and
  is easier to hit. Delete removes the selection, like Backspace.

## Earlier releases

See the [GitHub releases](https://github.com/aarkue/propel/releases) for 0.4.1 and before.
