# Contributing to Propel

This guide covers the development setup, where new code goes, the project conventions, and step-by-step recipes for the most common extensions.

- [Prerequisites](#prerequisites)
- [Dev workflow](#dev-workflow)
- [Where things go](#where-things-go)
- [Conventions (the non-obvious ones)](#conventions-the-non-obvious-ones)
- [Verifying a change](#verifying-a-change)
- [Commits and releases](#commits-and-releases)
- [Extending Propel](#extending-propel)
  - [Add a new visualization](#add-a-new-visualization)
  - [Add a new Rust binding (analysis function)](#add-a-new-rust-binding-analysis-function)
  - [Add a new transport](#add-a-new-transport)
  - [Add a new panel kind](#add-a-new-panel-kind)
  - [Consume `@r4pm/*` in an external React app](#consume-r4pm-in-an-external-react-app)
- [License](#license)

## Prerequisites

- Node (current LTS) and [pnpm](https://pnpm.io)
- Rust via [rustup](https://rustup.rs). The desktop app, the webserver, and `meta-gen` build on stable.
  The WASM engine pins `nightly-2025-06-01` in `engine/wasm/rust-toolchain.toml`, which rustup installs on the first build.
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/) for the browser target and the visualization wasm of `@r4pm/components`
- For the desktop app, the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) of your platform (e.g., WebKitGTK on Linux)

## Dev workflow

```bash
pnpm install         # also builds the visualization wasm of @r4pm/components (needs Rust + wasm-pack)

pnpm app:dev         # desktop app (Tauri): native engine, starts Vite itself
pnpm wasm:build      # browser: build the WASM engine once and after Rust changes ...
pnpm wasm:dev        # ... then start Vite with the in-process WASM engine
pnpm web:server      # browser with the engine as an HTTP server (axum) ...
pnpm web:ui          # ... and Vite in a second terminal

pnpm codegen         # after changing a Rust binding: regenerate typed bindings + file associations
pnpm --filter @r4pm/components dev   # Storybook of the components on port 6006

pnpm typecheck       # tsc across the workspace
pnpm test            # Vitest
pnpm check           # Biome lint + format check
pnpm build           # turbo build (packages -> dist, studio -> dist)
```

For faster WASM builds during development, run `wasm-pack build --target web --dev` in `engine/wasm` instead of `pnpm wasm:build`.
The three targets share one engine and one UI.
See the [Architecture section of the README](README.md#architecture) for how the `Backend` trait and the `BackendContext` interface connect them, and the [repository layout](README.md#repository-layout) for an overview of all folders.

## Where things go

| I want to add ... | Where | Then |
| --- | --- | --- |
| An analysis function (discovery, statistics, conformance, ...) | A `#[register_binding]` function in `engine/app-bindings/src/` | `pnpm codegen`. It is then a pipeline node and a typed `callBinding` call. See [Add a new Rust binding](#add-a-new-rust-binding-analysis-function). |
| A new algorithm that is useful outside of Propel | [Rust4PM](https://github.com/aarkue/Rust4PM), with a binding there | Bump the `rev` of the `process_mining` dependency in `engine/Cargo.toml`, then `pnpm codegen`. |
| A panel that shows the result of a binding | The React component in `packages/components/src/` (e.g., `charts/` for charts), exported from the folder's `index.ts`, with a `*.stories.tsx` next to it. The panel is a `defineVis(...)` in `apps/studio/src/vis/<id>.tsx`. | List it under an analysis in `apps/studio/src/shell/analyses.tsx`, or it appears under "More" in the panel picker. Run `pnpm --filter @r4pm/components docs:types`. See [Add a new visualization](#add-a-new-visualization). |
| A panel whose data needs several bindings | `defineResolvedVis(...)` in `apps/studio/src/vis/<id>.tsx` | Same as above. |
| A panel without a data source (an editor, a tool) | `definePanel(...)` in `apps/studio/src/vis/<id>.tsx` | See [Add a new panel kind](#add-a-new-panel-kind). |
| A viewer for a pipeline output, without a panel | `defineViewer(...)` in `apps/studio/src/viewers/<id>.ts` | Collected automatically. This is the exception. |
| A reusable building block for views (toolbar, tooltip, legend, number format) | `packages/components/src/kit/` | Use it from the views instead of a local copy. |
| A UI primitive (button, dialog, menu) | `packages/components/src/ui/` (the only place that imports `@radix-ui/themes`) | |
| A log filter or transform | A `Transform` variant in `engine/app-bindings/src/transforms.rs`. The palette entry goes into `TRANSFORM_META` in `apps/studio/src/transforms/catalog.tsx`, the editor into `transforms/TransformEditors.tsx` (and `transforms/editors/`). | `pnpm codegen` for the new `Transform` type. |
| A dataset kind (a new kind of log) | A registry type in the engine (Rust4PM or `engine/backend-shared`) with its import and export formats | `pnpm codegen` (also updates the desktop file associations in `engine/app/tauri.conf.json`). |
| A model or file kind that is not a log (e.g., OC-DECLARE, Reflow mappings) | The engine side in `engine/backend-shared/src/artifact.rs`, and an entry in `IO_KINDS` in `apps/studio/src/io-kinds.ts` | |
| A bundled example dataset | The file in `apps/studio/public/examples/`, an entry in `SAMPLE_DATASETS` in `apps/studio/src/samples.ts` | |
| A command in the command palette | `apps/studio/src/shell/CommandPalette.tsx` | |
| A platform operation (files, dialogs, OS integration) | A method of `BackendContext` in `packages/client/src/index.ts`, implemented in each transport in `apps/studio/src/backends/`. On desktop, it is usually a `#[tauri::command]` in `engine/app/src/lib.rs` (also add it to the `invoke_handler`). | Optional methods (`method?:`) are fine for operations that only some targets have. |
| A new target (transport) | `apps/studio/src/backends/<name>.ts` and, if it needs its own engine wrapper, `engine/<target>/` | See [Add a new transport](#add-a-new-transport). |

## Conventions (the non-obvious ones)

- **New bindings go in `app-bindings`.** `pnpm codegen` runs `cargo run -p meta-gen`, which dumps the registry, and then `gen.mjs`, which generates the TypeScript types.
- **Storybook type docs are snapshotted.** The prop/data-type definitions shown in the docs, and the
  component/export-key tables in `packages/components/llms.txt`, come from generated files, which `dev`
  does not rebuild. Run `pnpm --filter @r4pm/components docs:types` after changing a documented
  viewer prop or data-type shape, adding a component, or changing an export key.
- **`verbatimModuleSyntax: true`**: use `import type` for type-only imports.
- **Tailwind v4 is the standard** for UI, shipped to consumers via `@r4pm/components/styles.css`
  (Tailwind + Radix + the package's own rules). A host that runs its own Tailwind build imports
  `@r4pm/components/rules.css` instead (the same minus Tailwind) and `@source`s this package's
  source, so that the utility classes are generated. Storybook and `examples/external-consumer` take the
  first route, `apps/studio` the second. Never import `ui/styles.css` alone: It contains only Radix, and the
  `.bp-*` / `.r4pm-*` / editor rules go missing without any error. A viewer's **root** sizes
  inline (`width/height: 100%`), and inner layout may use Tailwind.
- **Reusable packages depend only on `@r4pm/client`'s `BackendContext` interface**, never on a
  specific transport (wasm/tauri/fetch). Transport code lives in `apps/*`.
- **UI primitives come from `@r4pm/components/ui`, never from `@radix-ui/themes` directly** (Biome
  enforces this, with `packages/components/src/ui/**` as the only exception).
  Consumers re-theme via Radix's CSS-variable tokens, and structural sizing stays inline.
- **Data stays in Rust/WASM.** TypeScript holds handles, metadata, and small results that a view plots.

## Verifying a change

- `pnpm typecheck` (or `pnpm --filter <pkg> exec tsc --noEmit`) must be clean.
- `pnpm test` (Vitest) must pass. Add unit tests for pure logic (e.g., registry resolution, codegen shape,
  pipeline graph execution), next to the code as `*.test.ts`.
- `pnpm check` (Biome) must be clean for the changed files.
- For UI changes, run the studio (or the Storybook story: `pnpm --filter @r4pm/components dev`) and
  check that it renders with the real engine.
- New viewers ship a Storybook `*.stories.tsx` (CSF3) with sample data.

## Commits and releases

- Imperative commit subjects.
- Releases are driven by tags, and both version scripts edit the version files and print the git commands.
  With `--tag`, they also commit, tag, and push:
  - `pnpm components:version <x.y.z> [--tag]` publishes `@r4pm/components` through the `components-v*` tag.
  - `pnpm app:version <x.y.z> [--tag]` releases the desktop app through the `v*` tag. `engine/app/tauri.conf.json` holds the app version, and `engine/app/Cargo.toml` mirrors it.

## Extending Propel

Recipes for the extensions from the [table above](#where-things-go) that take more than one step. The examples match the code in this repository.

---

### Add a new visualization

A **visualization** is a self-describing component that renders in three contexts: a dockview panel,
a pipeline output node, and a standalone npm import. One `defineVis(...)` call (in a single
`apps/studio/src/vis/<id>.tsx` file) emits both the panel and the viewer.

The component itself lives in `@r4pm/components` (generic over a local data interface, engine-free).
The `defineVis(...)` call in the app binds it to a specific binding, wiring up the data source,
dataset selection, and viewer registry match.

**Minimal example** (one binding, no controls):

```tsx
// apps/studio/src/vis/my-stat.tsx
import type { EventLogHandle } from "@r4pm/client";
import { MyStatViewer } from "@r4pm/components";
import { PiChartBar } from "react-icons/pi";
import { defineVis } from "./define-vis";

export const vis = defineVis({
  type: "myStat",
  name: "My Stat",
  description: "What it shows.",
  category: "overview",
  icon: PiChartBar,
  supports: ["EventLog"],
  order: 50,
  source: {
    binding: "app_bindings::my_stat",
    needs: "EventLog",
    args: (ctx) => ({ event_log: ctx.datasetId as EventLogHandle }),
  },
  component: MyStatViewer,
});
```

No registration is needed beyond the file: `vis/registry.ts` collects every `vis/*.tsx` exporting
`const vis` via `import.meta.glob` and fans it into the panel registry (gallery / palette) and the
viewer registry (pipeline output nodes). `order` controls gallery sort.
The panel picker groups panels by analysis. To list the panel there, add `{ type, about }` to an analysis in
[`shell/analyses.tsx`](apps/studio/src/shell/analyses.tsx). Panels that no analysis lists appear under "More".

Live examples: [`vis/log-summary.tsx`](apps/studio/src/vis/log-summary.tsx),
[`vis/dfg.tsx`](apps/studio/src/vis/dfg.tsx), [`vis/petri-net.tsx`](apps/studio/src/vis/petri-net.tsx).

**Variants:**

- **`defineVis` with controls**: add `controls: { initial: ... }` and a `panelControlsBar` to
  render control UI; controls that drive a re-fetch go read-only in the pipeline viewer.
  Example: [`vis/log-variants.tsx`](apps/studio/src/vis/log-variants.tsx).
- **`defineResolvedVis`**: data comes from a custom `resolve` (e.g. chained bindings like
  discover + align). Example: [`vis/conformance.tsx`](apps/studio/src/vis/conformance.tsx).
- **`definePanel`**: a plain panel with no data source (e.g. about, pipeline editor). Panel only,
  no viewer. Example: [`vis/about.tsx`](apps/studio/src/vis/about.tsx).

**Publishing the component**: the `@r4pm/components` viewer is generic over a local data interface
and never imports `@r4pm/client`. The `defineVis(...)` in the app binds it to the engine type.

**Escape-hatch viewers**: for pipeline-only renderers that have no panel (json fallback, fitness
view, oc-petri-net), a standalone `defineViewer(...)` adapter in `apps/studio/src/viewers/<id>.ts`
is collected into the viewer registry the same way. These are the exception.

**`ViewerProps<T>`:** `{ data: T; handle?: string }` plus the shared `ViewerConfig` fields
(`colorOf`, `format`, `actions`, `onSelect`). See the Storybook "Concepts > Viewer Configuration"
page.

---

### Add a new Rust binding (analysis function)

Functions are exposed by annotating a plain Rust function. The registry entry, the metadata, and the pipeline node all follow from it.

1. Add the function to the open `app-bindings` crate.

   ```rust
   // engine/app-bindings/src/lib.rs
   use process_mining::bindings::register_binding;

   /// Doc comments become the binding's `docs` metadata (shown in the pipeline sidebar).
   #[register_binding]
   pub fn my_thing(log: process_mining::EventLogHandle, threshold: f64) -> MyData {
       // ... big inputs arrive by handle and are retrieved inside the engine ...
   }
   ```

   - Arg and return types must be `schemars::JsonSchema` (+ serde).
   - Big inputs/outputs should be **handles**, not inlined data.
   - The id auto-namespaces by `module_path!()`, e.g. `app_bindings::my_thing`.
   - **Returning a registry type is chainable.** If a function returns a registry object
     (`EventLog`, `OCEL`, `SlimLinkedOCEL`, `EventLogActivityProjection`, ...) the engine stores the
     result and returns a new **handle** (e.g. `EventLogHandle`).

   > **Gotcha:** a downstream binding crate must declare its own `bindings` feature
   > (`default = ["bindings"]`, `bindings = ["process_mining/bindings"]`) - the generated
   > registration block is `#[cfg(feature = "bindings")]` checked against the *caller* crate.
   > `app-bindings/Cargo.toml` already does this; copy the pattern for new crates.

2. Force-link the crate. `meta-gen` and the WASM crate already `extern crate app_bindings;`. A new crate needs the same.

3. Regenerate the typed bindings:

   ```bash
   pnpm codegen   # = cargo run -p meta-gen (dumps the live registry) + gen.mjs
   ```

4. (Only to run the browser target) rebuild the WASM engine:

   ```bash
   pnpm wasm:build
   ```

`backend.callBinding("app_bindings::my_thing", { log, threshold })` is now fully typed end-to-end.

---

### Add a new transport

A transport is an implementation of the `BackendContext` interface from `@r4pm/client` (binding
dispatch + IO + platform ops; the full shape is in `packages/client/src/index.ts`). Three
ship in `apps/studio/src/backends/`:

- **`wasm.ts`** - engine in-process; `execute_binding(id, args)` etc. directly.
- **`http.ts`** - `fetch` against the `engine/webserver` axum API under `/api`.
- **`tauri.ts`** - `invoke(...)` against the `engine/app` `#[tauri::command]`s.

`detectBackend()` (`backends/index.ts`) selects one at startup (`__TAURI_INTERNALS__` -> tauri;
`VITE_BACKEND=http` -> http; else wasm) and exports a `backend` singleton.

To add a transport, implement every `BackendContext` method against your transport and add a branch
to `detectBackend()`. Reusable packages need no change - they depend only on the interface and
receive `backend` as a prop. If your transport has a matching engine wrapper, mirror these calls in
a new `engine/<target>` crate that implements the Rust `Backend` trait (see `engine/webserver` or
`engine/app` as templates).

---

### Add a new panel kind

Panels are defined via `defineVis()` / `definePanel()` / `defineResolvedVis()` in
`apps/studio/src/vis/<id>.tsx`. See
["Add a new visualization"](#add-a-new-visualization) above.

For a **data-free panel** (e.g. About, Pipeline Editor), use `definePanel()`:

```tsx
// apps/studio/src/vis/my-panel.tsx
import type { IDockviewPanelProps } from "dockview";
import { PiChartBar } from "react-icons/pi";
import { definePanel } from "./define-vis";

function MyPanel(props: IDockviewPanelProps) {
  const { someParam } = (props.params ?? {}) as { someParam?: string };
  return <div>{/* any content */}</div>;
}

export const vis = definePanel({
  type: "myPanel",        // unique string key; also the dockview component id
  name: "My Panel",       // shown in the gallery / command palette
  description: "What this panel shows.",
  category: "overview",   // a PanelCategory; drives gallery grouping
  icon: PiChartBar,       // any react-icons icon
  order: 50,              // numeric sort key in the gallery / palette
  component: MyPanel,
});
```

(`PanelDefinition` / `PanelCategory` are typed in `apps/studio/src/panels/types.ts`.)

---

### Consume `@r4pm/*` in an external React app

`@r4pm/components` is a framework-agnostic React component library. An external process-mining tool
can mount a single viewer directly. The viewer is generic over a structural data shape, so you call
it with your own data:

```tsx
import { DFGViewer } from "@r4pm/components";

// You render the viewer with data matching its structural interface.
<DFGViewer data={myData} />;
```

The registry half (`ViewerRegistry`/`defineViewer`/`resolveViewerForReturnType`) and the dockview
shell are studio-internal (`apps/studio/src/viewers/` and `apps/studio/src/shell/`), not published.
To build a registry-driven host, copy that pattern: define a local `defineViewer` registry, register
your viewer defs against it, and resolve by return-type title. `BindingViewerPanel` (the turnkey "run
a binding, show its viewer" wrapper) is likewise studio-internal at
`apps/studio/src/shell/BindingViewerPanel`.

**Tailwind:** the components use Tailwind v4 utility classes. An app with no Tailwind setup of its
own just imports `@r4pm/components/styles.css` and is done. An app that runs its own Tailwind build
bundles the components' classes into its own `index.css` and imports `rules.css` for the rest:

```css
/* index.css */
@import "tailwindcss";
@source "../node_modules/@r4pm/components/src";
```

```tsx
import "./index.css";
import "@r4pm/components/rules.css"; // after your Tailwind entry, never before
```

`rules.css` carries the Radix theme, the shared `--r4pm-*` tokens, the Petri-net editor's stylesheet,
and the components' hand-written rules: everything `styles.css` has except Tailwind itself. It
replaces reaching for `@radix-ui/themes/styles.css` (or `@r4pm/components/ui/styles.css`) directly:
those give you Radix and nothing else, and the missing rules fail silently.

You also need a React Query provider (`@tanstack/react-query`) and a `<Theme>` wrapper around the
Radix-backed UI from `@r4pm/components/ui`.

A complete, runnable example lives in [`examples/external-consumer/`](examples/external-consumer/)
- a standalone Vite + React app that imports `@r4pm/components`, resolves a viewer by return-type via
its own local registry, and renders it with its own data (no `@r4pm` engine required). Run it with
`pnpm --filter @r4pm/example-external-consumer dev`.

> Note: packages publish a compiled `dist` (tsup) with type declarations via `publishConfig`; in the
> workspace they resolve to `src` for HMR. The Tailwind `@source` directives above are still needed
> because the components ship/use utility classes.

## License

By contributing, you agree that your contributions are dual-licensed under MIT OR Apache-2.0.
