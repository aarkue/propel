# Contributing to Propel

Thanks for contributing!
This guide covers the dev setup, the monorepo layout, and conventions.
Moreover, it covers step-by-step "add a viewer / Rust binding /
transport / panel" recipes.

## Prerequisites

- Node 18+ and [pnpm](https://pnpm.io)
- Rust (the engine pins `nightly-2025-06-01` via `engine/wasm/rust-toolchain.toml`)
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/)

## Layout

```
packages/   the @r4pm/* libraries. Only `components` is published; `client` is internal (the engine
            contract: generated bindings + BackendContext, consumed by apps/studio).
            components = viewers/inputs/feedback + the presentation contract + export frame; subpaths
            /ui, /petri, /charts, /styles.css)
apps/studio the application (composes the packages + selects a transport: wasm/http/tauri); also hosts
            the studio-internal viewer registry, panels, pipeline, transforms, and stores
examples/   runnable external-consumer example
engine/     Rust (Cargo workspace): backend-shared, app-bindings, meta-gen, and the three
            target wrappers: wasm, webserver (axum), app (tauri)
```

## Dev workflow

```bash
pnpm install
pnpm codegen                                                  # regenerate typed bindings

pnpm wasm:dev        # browser, in-process wasm engine
pnpm web:server      # + pnpm web:ui (2nd terminal): axum engine + vite (http transport)
pnpm app:dev         # tauri desktop window

pnpm typecheck       # tsc across the workspace
pnpm build           # turbo build (packages -> dist, studio -> dist)
```

The three targets share one engine and one UI; see the Architecture section of the [README](README.md#architecture)
for how the `Backend` trait and the `BackendContext` interface make that work.

## Conventions (the non-obvious ones)

- **Codegen runs `meta-gen`.** `pnpm codegen` runs `cargo run -p meta-gen` then `gen.mjs`. **New bindings go in `app-bindings`.**
- **Storybook type docs are snapshotted.** The prop/data-type definitions shown in the docs come from generated files; `dev` does not rebuild them. Run `pnpm --filter @r4pm/components docs:types` after changing a documented viewer prop or data-type shape.
- **`verbatimModuleSyntax: true`**: use `import type` for type-only imports.
- **Tailwind v4 is the standard** for UI, shipped to consumers via `@r4pm/components/styles.css`
  (which every host -- Storybook, studio, external apps -- imports). A viewer's **root** sizes
  inline (`width/height: 100%`); inner layout may use
  Tailwind.
- **Reusable packages depend only on `@r4pm/client`'s `BackendContext` interface**, never on a
  specific transport (wasm/tauri/fetch). Transport code lives in `apps/*`.
- **UI primitives come from `@r4pm/components/ui`, never `@radix-ui/themes` directly** (biome
  enforces this; the only override is `packages/components/src/ui/**`).
  Consumers re-theme via Radix's CSS-variable tokens; structural sizing stays inline.
- **Data stays in Rust/WASM.** TS holds handles + metadata + small/plot-bound results.

## Verifying a change

- `pnpm typecheck` (or `pnpm --filter <pkg> exec tsc --noEmit`) must be clean.
- `pnpm test` (Vitest) must pass. Add unit tests for pure logic (registry resolution, codegen shape,
  pipeline graph execution); colocate them as `*.test.ts` next to the code.
- For UI, run the studio (or the relevant Storybook story: `pnpm --filter @r4pm/components dev`) and
  confirm it renders against the real wasm; don't claim it works without seeing it render.
- New viewers should ship a Storybook `*.stories.tsx` (CSF3) with sample data.

## Commits & releases

- Conventional, imperative commit subjects. Don't add `Co-Authored-By`/"Generated with" trailers.
- Releases are tag-driven: `pnpm components:version <x.y.z> --tag` then push the `components-v*` tag to
  publish `@r4pm/components`; `pnpm app:version <x.y.z> --tag` then push the `v*` tag to release the desktop app.

## License

By contributing you agree your contributions are dual-licensed under MIT OR Apache-2.0.


## Extending Propel

How to add the things you'll most often add. Every example matches the real code in this repo.

- [Contributing to Propel](#contributing-to-propel)
  - [Prerequisites](#prerequisites)
  - [Layout](#layout)
  - [Dev workflow](#dev-workflow)
  - [Conventions (the non-obvious ones)](#conventions-the-non-obvious-ones)
  - [Verifying a change](#verifying-a-change)
  - [Commits \& releases](#commits--releases)
  - [License](#license)
  - [Extending Propel](#extending-propel)
    - [Add a new visualization](#add-a-new-visualization)
    - [Add a new Rust binding (analysis function)](#add-a-new-rust-binding-analysis-function)
    - [Add a new transport](#add-a-new-transport)
    - [Add a new panel kind](#add-a-new-panel-kind)
    - [Consume `@r4pm/*` in an external React app](#consume-r4pm-in-an-external-react-app)

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

Drop the file; that's it. The `vis/registry.ts` auto-collects every `vis/*.tsx` exporting
`const vis` via `import.meta.glob` and fans it into the panel registry (gallery / palette) and the
viewer registry (pipeline output nodes). `order` controls gallery sort.

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
is auto-collected into the viewer registry the same way. These are the exception, not the norm.

**`ViewerProps<T>`:** `{ data: T; handle?: string }` plus the shared `ViewerConfig` fields
(`colorOf`, `format`, `actions`, `onSelect`). See the Storybook "Concepts > Viewer Configuration"
page.

---

### Add a new Rust binding (analysis function)

Functions are exposed by annotating a plain Rust function. The registry, metadata, Python
wrappers, and pipeline node all follow from it.

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
   cd engine/wasm && wasm-pack build --target web && cd ../..
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

**Tailwind:** the components use Tailwind v4 utility classes. The package ships source
`.tsx` (via `tsup`); importing apps bundle these classes into their own `index.css`:

```css
@import "tailwindcss";
@source "../node_modules/@r4pm/components/src";
```

You also need a React Query provider (`@tanstack/react-query`) and, for the Radix-backed UI from
`@r4pm/components/ui`, a `<Theme>` wrapper + `@radix-ui/themes/styles.css`.

A complete, runnable example lives in [`examples/external-consumer/`](../examples/external-consumer/)
- a standalone Vite + React app that imports `@r4pm/components`, resolves a viewer by return-type via
its own local registry, and renders it with its own data (no `@r4pm` engine required). Run it with
`pnpm --filter @r4pm/example-external-consumer dev`.

> Note: packages publish a compiled `dist` (tsup) with type declarations via `publishConfig`; in the
> workspace they resolve to `src` for HMR. The Tailwind `@source` directives above are still needed
> because the components ship/use utility classes.
