<p align="center">
  <img src="engine/app/icons/icon.png" width="120" alt="Propel logo: a fan/propeller"/>
</p>

# Propel

**Process Mining Studio powered by [Rust4PM](https://github.com/aarkue/Rust4PM).**

Propel exposes the process mining algorithms of [Rust4PM](https://github.com/aarkue/Rust4PM) through a graphical studio built on composable, reusable process mining components. The same Rust engine runs locally in your browser (via WebAssembly) or as a native desktop app.

- **In-browser (WASM demo):** [__propel.aarkue.eu__](https://propel.aarkue.eu)
- **Desktop installers:** [__github.com/aarkue/propel/releases/latest__](https://github.com/aarkue/propel/releases/latest)
- **React component library (Storybook):** [__propel.aarkue.eu/storybook__](https://propel.aarkue.eu/storybook)

## Features

- **Fast XES / OCEL 2.0 import:** drop an `.xes` (event log) or `.json`/`.xml`/`.sqlite` (OCEL 2.0)
  file anywhere on the window; parsing runs in the Rust engine.
- **Directly-follows graphs:** case-centric DFG and object-centric DFG (OC-DFG), with a performance
  overlay.
- **Dotted chart** and **variant explorer** for inspecting cases and their behavior.
- **Conformance:** alignment-based fitness of an event log against a Petri net.
- **Log filters and transforms**, for both event logs and OCELs.
- **(Object-centric) Petri net editor:** build and edit Petri nets and OC-Petri nets by hand.
- **Interactive pipeline:** every [Rust4PM](https://github.com/aarkue/Rust4PM) binding exposed as a
  node; typed handles flow from one node's output into the next.

Everything runs locally, in your browser (via WebAssembly) or on the desktop (see below).

## Download & Installation

**Run it in your browser** with no install at [__propel.aarkue.eu__](https://propel.aarkue.eu). The engine runs locally via WebAssembly, so your data never leaves your machine.

**Desktop installers** for the latest release are cross-compiled automatically and available at [__github.com/aarkue/propel/releases/latest__](https://github.com/aarkue/propel/releases/latest). The following formats are built:

- `[...].AppImage` for Linux (**Recommended for Linux**)
- `[...]-setup.exe` for Windows (**Recommended for Windows**)
- `[...].dmg` for macOS (**Recommended for macOS**)
- `[...].deb` for Linux (Debian/Ubuntu)
- `[...].rpm` for Linux (Fedora/RHEL/openSUSE)
- `[...].msi` for Windows
- `[...].app.tar.gz` for macOS

Note that Windows Defender sometimes produces a (false-positive) threat warning for Tauri-packaged installers (see also [tauri-apps/tauri#2486](https://github.com/tauri-apps/tauri/issues/2486)). If this happens, try a different installer variant (e.g., `.exe` instead of `.msi`).

## Architecture

1. **One function-exposure mechanism: the Rust4PM `bindings` registry.**
   Every analysis function is a Rust function annotated `#[register_binding]`. The registry
   (built on [`inventory`](https://docs.rs/inventory)) collects them at link time and exposes:
   - runtime JSON dispatch (`execute_binding(id, args) -> Vec<u8>`),
   - self-describing metadata (`list_functions_meta()` returns id, docs, [schemars](https://docs.rs/schemars) JSON Schemas for args + return type),
   - automatic exposure as pipeline nodes.

   Add a Rust function and it appears everywhere.

2. **Data stays in Rust/WASM.** Bindings return `Vec<u8>` UTF-8 JSON.
   Large objects (event logs, OCEL) live in the engine and are referenced from TypeScript by ids / handles (e.g., `Handle<"OCEL">`).
   TS only ever holds handles, metadata, and small(ish) results.

3. **Compile-time types.** The binding metadata's JSON Schemas are automatically generated into a typed `Bindings` map
   and `callBinding<K>(id, args): Promise<ret>`.

4. **One visualization, mounted anywhere.** A single `defineVis(...)` call emits both the dockview
   panel and the pipeline viewer. The component itself is a reusable `@r4pm/components` export.

5. **Reusable + exposed.** Individual components are published as an `@r4pm/components` package consumable by external React apps (e.g. another process-mining tool).


## React Components (@r4pm/components)
Many of the visualizations and React components used throughout propel are also available standalone for outside use.

Simply `npm i @r4pm/components` and use components like DFG graphs, Petri net editors, Trace and Alignment Visualizations in your own React project!

See [the components README](./packages/components/README.md) for more details.

## Repository layout

```
propel/
├── packages/                  # @r4pm/* libraries (only components publishes; client is internal)
│   ├── client/                # @r4pm/client          the engine contract: callBinding + BackendContext + Handle types + codegen (INTERNAL, not published)
│   └── components/            # @r4pm/components      reusable viewers + inputs + presentation contract + export frame
│       │                      #   subpaths: . /ui /petri /charts (+ css); see packages/components/README.md
├── apps/
│   └── studio/                # @r4pm/studio          the app: composes packages, selects a transport (wasm/http/tauri). Also contains
│       │                      #   viewer registry (src/viewers/), vis definitions (src/vis), panels (src/panels),
│       │                      #   transport backends (src/backends), stores + shell (src/stores, src/shell),
│       │                      #   pipeline (src/pipeline), and transforms (src/transforms)
├── engine/                    # Rust (Cargo workspace)
│   ├── backend-shared/        #   shared engine logic: binding dispatch, object lifecycle, metadata
│   ├── app-bindings/          #   new bindings: #[register_binding] functions
│   ├── wasm/                  #   backend-wasm cdylib (execute_binding / list_functions / load_item_bytes / ...)
│   ├── webserver/             #   propel-webserver: axum HTTP transport backend (web:server)
│   ├── app/                   #   propel-tauri: Tauri desktop app (app:dev / app:build)
│   └── meta-gen/              #   dumps the live registry to bindings-meta.json for TS codegen
```

Tooling: **pnpm workspaces + Turborepo**, **React 18 + TypeScript** (`verbatimModuleSyntax: true`),
**Tailwind v4** (standard for all UI), **Vite** for the app, **wasm-pack** for the engine.

### Package map

Only **`@r4pm/components`** is published. `@r4pm/client` is an internal package (the engine
contract) consumed by `apps/studio`, not published:

| Package | Published? | Depends on | Provides |
| --- | --- | --- | --- |
| `@r4pm/components` | **yes** | (none of `@r4pm/client`) | reusable component library + presentation contract + export frame, via subpaths (see the [components README](./packages/components/README.md)) |
| `@r4pm/client` | no (internal) | (none) | `callBinding`, `BackendContext` interface, `FunctionMeta`/`ExtendedJSONSchema`, branded `Handle<K>`, generated `Bindings`. The engine contract; consumed by the app + the three transports. |

The subpaths (`.`, `/ui`, `/petri`, `/charts`, `/styles.css`, plus companion `/ui/styles.css` and
`/petri/editor.css`) are documented in the [components README](./packages/components/README.md).

Studio-internal code (viewer registry, pipeline editor, transforms, stores) lives in `apps/studio/src`
and is not published.

`@r4pm/components` imports **nothing** from `@r4pm/client` and never references `RETURN_TYPES`. Each
viewer is generic over a local structural interface; the app binds it to the engine in
`apps/studio/src/vis/<id>.tsx` via `defineVis(...)`, so engine type drift fails to compile there.
Transport-specific code (Tauri/fetch/WASM) lives only in `apps/studio` (and future `apps/*`).

## Development

Prerequisites: Node 18+, pnpm, Rust (the engine pins `nightly-2025-06-01` via
`engine/wasm/rust-toolchain.toml`), and [`wasm-pack`](https://rustwasm.github.io/wasm-pack/).

```bash
# 1. install JS deps
pnpm install

# 2. (re)generate typed bindings + file associations. Only required when Rust functions or inputs/outputs change.
pnpm codegen

# 3. build the WASM engine -- only needed to RUN the browser target
cd engine/wasm
wasm-pack build --target web        # add --dev for fast, unoptimized builds
cd ../..

# 4. run the app
pnpm --filter @r4pm/studio dev       # Vite dev server

# typecheck everything
pnpm typecheck
```

## Contributing & Extending Propel

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for dev setup, the monorepo layout, and the project conventions.
Extension recipes (add a viewer / binding / panel / transport) are in [`CONTRIBUTING.md`](CONTRIBUTING.md#extending-propel).

[`CONTRIBUTING.md`](CONTRIBUTING.md) also contains step-by-step guides:

- Add a new **visualization** (viewer + panel in one file).
- Add a new **Rust binding** (analysis function).
- Add a new **transport** (Tauri / webserver / custom).
- Consume `@r4pm/*` packages in an **external React app** (incl. Tailwind setup).

## Publishing

The only published package is `@r4pm/components`, released public to the `@r4pm` npm org.
Publishing is done using GitHub CI and is driven by tags:

```bash
pnpm components:version 0.1.0 --tag   # bump packages/components/package.json + create the components-v0.1.0 tag
git push && git push origin components-v0.1.0
```

Pushing a `components-v*` tag triggers `.github/workflows/publish-components.yml`, which builds and
publishes to npm. (The desktop app is versioned separately; see `pnpm app:version` and `v*` tags.)

## License

This project is dual-licensed under either the [Apache License Version 2.0](LICENSE-APACHE) or the [MIT License](LICENSE-MIT), at your option.
