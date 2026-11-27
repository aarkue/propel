<p align="center">
  <img src="engine/app/icons/icon.png" width="120" alt="Propel logo: a fan/propeller"/>
</p>

# Propel

**Process Mining Studio powered by [Rust4PM](https://github.com/aarkue/Rust4PM).**

Propel is a process mining app built on the algorithms of [Rust4PM](https://github.com/aarkue/Rust4PM).
The same Rust engine runs either in your browser (compiled to WebAssembly) or natively in the desktop app, and its results are shown in dockable panels made from reusable React components.

- **In the browser (WASM):** [__propel.aarkue.eu__](https://propel.aarkue.eu)
- **Desktop installers:** [__github.com/aarkue/propel/releases/latest__](https://github.com/aarkue/propel/releases/latest)
- **React component library (Storybook):** [__propel.aarkue.eu/storybook__](https://propel.aarkue.eu/storybook)

## Features

- Import of XES event logs (also `.xes.gz`) and OCEL 2.0 logs (`.json`, `.xml`, `.sqlite`).
  Files can be dropped anywhere on the window, opened through the menu, or, on desktop, opened from the file manager.
  The Rust engine parses them.
- Discovery of directly-follows graphs (DFG and OC-DFG), Petri nets and process trees (Inductive Miner, Alpha+++), object-centric Petri nets, and OC-DECLARE constraints.
- Alignment-based conformance checking of an event log against a Petri net, and OC-DECLARE constraint violations.
- Views on cases and objects, e.g., dotted chart, trace variants, performance spectrum, variant timing, case durations, object lifelines, and workload calendars.
- Extraction of OCEL 2.0 logs from relational sources (e.g., SQLite databases or CSV and Parquet files) through extraction blueprints.
- Filters and transforms for event logs and OCELs, and editors for event logs, OCELs, Petri nets, and object-centric Petri nets.
- A pipeline editor, in which every [Rust4PM](https://github.com/aarkue/Rust4PM) binding is a node and typed handles connect the output of one node to the input of the next.

## Download and Installation

**In the browser**, Propel runs without any installation at [__propel.aarkue.eu__](https://propel.aarkue.eu).
The engine runs locally in WebAssembly, so your data does not leave your machine.

**Desktop installers** are built by CI for every release and are available at [__github.com/aarkue/propel/releases/latest__](https://github.com/aarkue/propel/releases/latest).
The desktop app is not limited by the 4 GB memory of WebAssembly and registers itself for `.xes`, `.pnml`, `.ocdeclare`, and other file types.
We recommend the first installer listed for each platform:

- Linux: `[...].AppImage`, or `[...].deb` (Debian/Ubuntu) and `[...].rpm` (Fedora/RHEL/openSUSE)
- Windows: `[...]-setup.exe`, or `[...].msi`
- macOS: `[...].dmg`, or `[...].app.tar.gz`

Windows Defender sometimes shows a (false-positive) threat warning for Tauri-packaged installers (see also [tauri-apps/tauri#2486](https://github.com/tauri-apps/tauri/issues/2486)).
If this happens, try the other installer variant (e.g., `.msi` instead of `-setup.exe`).

## Architecture

1. **One registry for all functions.**
   Every analysis function is a Rust function annotated with `#[register_binding]`.
   The Rust4PM `bindings` registry (built on [`inventory`](https://docs.rs/inventory)) collects them at link time and provides:
   - runtime JSON dispatch (`execute_binding(id, args) -> Vec<u8>`),
   - metadata for each function (`list_functions_meta()` returns its id, docs, and [schemars](https://docs.rs/schemars) JSON Schemas for the arguments and the return type),
   - a pipeline node for each function.

   After `pnpm codegen`, a new annotated function is available as a pipeline node and as a typed call from TypeScript.

2. **Data stays in Rust/WASM.** Bindings return UTF-8 JSON as `Vec<u8>`.
   Large objects (event logs, OCELs) live in the engine, and TypeScript refers to them by handles (e.g., `Handle<"OCEL">`).
   TypeScript only holds handles, metadata, and small results.

3. **Compile-time types.** `pnpm codegen` turns the JSON Schemas of the binding metadata into a typed `Bindings` map
   and `callBinding<K>(id, args): Promise<ret>`.

4. **One definition per visualization.** A single `defineVis(...)` call defines both the dockview
   panel and the pipeline viewer. The component itself is a reusable `@r4pm/components` export.

5. **Published components.** The components are published as the `@r4pm/components` package, which other React apps (e.g., another process mining tool) can use.

## React Components (@r4pm/components)

Many of the visualizations and React components of Propel are also available on their own.
After `npm i @r4pm/components`, components like DFGs, Petri net editors, and trace and alignment views can be used in any React project.

See [the components README](./packages/components/README.md) for more details.

## Repository Layout

```
propel/
├── packages/                  # @r4pm/* libraries (only components publishes; client is internal)
│   ├── client/                # @r4pm/client          the engine contract: callBinding + BackendContext + Handle types + codegen (INTERNAL, not published)
│   └── components/            # @r4pm/components      reusable viewers + inputs + presentation contract + export frame
│       │                      #   subpaths: . /ui /petri /process-tree /charts /extraction-blueprint (+ css); see packages/components/README.md
├── apps/
│   └── studio/                # @r4pm/studio          the app: composes packages, selects a transport (wasm/http/tauri). Also contains
│       │                      #   viewer registry (src/viewers/), vis definitions (src/vis), panels (src/panels),
│       │                      #   transport backends (src/backends), stores + shell (src/stores, src/shell),
│       │                      #   pipeline (src/pipeline), and transforms (src/transforms)
├── examples/
│   └── external-consumer/     # a minimal React app that uses @r4pm/components
├── engine/                    # Rust (Cargo workspace)
│   ├── backend-shared/        #   shared engine logic: binding dispatch, object lifecycle, metadata
│   ├── app-bindings/          #   new bindings: #[register_binding] functions
│   ├── wasm/                  #   backend-wasm cdylib (execute_binding / list_functions / load_item_bytes / ...)
│   ├── viz-wasm/              #   rust4pm's visualization bindings as wasm, embedded in @r4pm/components
│   ├── webserver/             #   propel-webserver: axum HTTP transport backend (web:server)
│   ├── app/                   #   propel-tauri: Tauri desktop app (app:dev / app:build)
│   └── meta-gen/              #   dumps the live registry to bindings-meta.json for TS codegen
```

Tooling: **pnpm workspaces + Turborepo**, **React 18 + TypeScript** (`verbatimModuleSyntax: true`),
**Tailwind v4** (standard for all UI), **Vite** for the app, **wasm-pack** for the engine.

### Package Map

Only **`@r4pm/components`** is published. `@r4pm/client` is an internal package (the engine
contract) used by `apps/studio`:

| Package | Published? | Depends on | Provides |
| --- | --- | --- | --- |
| `@r4pm/components` | **yes** | (none of `@r4pm/client`) | reusable component library + presentation contract + export frame, via subpaths (see the [components README](./packages/components/README.md)) |
| `@r4pm/client` | no (internal) | (none) | `callBinding`, `BackendContext` interface, `FunctionMeta`/`ExtendedJSONSchema`, branded `Handle<K>`, generated `Bindings`. The engine contract, used by the app and the three transports. |

The subpaths (`.`, `/ui`, `/petri`, `/process-tree`, `/charts`, `/extraction-blueprint`, `/styles.css`, plus `/rules.css` for apps that run
their own Tailwind build, and the companion `/ui/styles.css`, `/petri/editor.css`, and `/process-tree/editor.css`) are documented in
the [components README](./packages/components/README.md).

Studio-internal code (viewer registry, pipeline editor, transforms, stores) lives in `apps/studio/src`
and is not published.

`@r4pm/components` imports **nothing** from `@r4pm/client` and never references `RETURN_TYPES`.
Each viewer is generic over a local structural interface, and the app binds it to the engine in
`apps/studio/src/vis/<id>.tsx` via `defineVis(...)`, so engine type drift fails to compile there.
Transport-specific code (Tauri/fetch/WASM) lives only in `apps/studio`.

## Development

Prerequisites:

- Node (current LTS) and [pnpm](https://pnpm.io)
- Rust via [rustup](https://rustup.rs). The desktop app and the webserver build on stable.
  The WASM engine pins `nightly-2025-06-01` in `engine/wasm/rust-toolchain.toml`, which rustup installs on the first build.
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/) for the browser target and the components' visualization wasm
- For the desktop app, the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) of your platform (e.g., WebKitGTK on Linux)

```bash
pnpm install         # also builds the visualization wasm of @r4pm/components, if Rust and wasm-pack are available
```

Propel can then be run in one of three ways, which share the UI and the engine:

```bash
# Desktop app (Tauri): native engine, starts the Vite dev server itself
pnpm app:dev

# Browser, engine in WebAssembly: build the engine once (and after Rust changes), then start Vite
pnpm wasm:build      # or, faster and unoptimized: cd engine/wasm && wasm-pack build --target web --dev
pnpm wasm:dev

# Browser, engine as a local HTTP server: run both in separate terminals
pnpm web:server
pnpm web:ui
```

After adding or changing a Rust binding (its arguments or return type), regenerate the typed bindings and the file associations:

```bash
pnpm codegen
```

Before committing, run:

```bash
pnpm typecheck       # tsc across the workspace
pnpm test            # Vitest
pnpm check           # Biome lint and format check
```

## Contributing and Extending Propel

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the project conventions and how to verify a change.
It also contains step-by-step guides (see [Extending Propel](CONTRIBUTING.md#extending-propel)):

- Add a new **visualization** (viewer + panel in one file).
- Add a new **Rust binding** (analysis function).
- Add a new **transport** (Tauri / webserver / custom).
- Use `@r4pm/*` packages in an **external React app** (incl. Tailwind setup).

## Publishing

The only published package is `@r4pm/components`, released publicly to the `@r4pm` npm org.
Publishing runs on GitHub CI and is driven by tags:

```bash
pnpm components:version 0.1.0         # bump packages/components/package.json and print the git commands
pnpm components:version 0.1.0 --tag   # bump, commit, tag components-v0.1.0, and push
```

Pushing a `components-v*` tag triggers `.github/workflows/publish-components.yml`, which builds the package and
publishes it to npm.
The desktop app is versioned separately with `pnpm app:version <x.y.z>`, which works the same way with `v*` tags and starts the release build.

## License

This project is dual-licensed under either the [Apache License Version 2.0](LICENSE-APACHE) or the [MIT License](LICENSE-MIT), at your option.
