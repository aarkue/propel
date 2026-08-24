# @r4pm/components

React components for process mining.

Components include Petri net, object-centric Petri net, directly-follows graph (DFG and OC-DFG), dotted
chart, alignments (list and net), case-duration and events-per-time charts, log and OCEL summaries,
process trees, log and OCEL editors, plus inputs (frequency picker, choosers) and the pieces the
viewers are built from.

## Install

```sh
pnpm add @r4pm/components
# peer dependencies:
pnpm add react react-dom
```

## Use

A viewer needs four things around it: the stylesheet, a Radix `Theme`, a layout engine for graph
viewers, and a parent with a definite height.

```tsx
import "@r4pm/components/styles.css";                            // 1. the stylesheet, once
import { Theme, PetriNetViewer, ViewerConfigProvider } from "@r4pm/components";
import { wasmLayout } from "@r4pm/components/rust-layout/wasm";  // 2. a layout engine

<Theme>                                                          {/* 3. the Radix theme */}
  <ViewerConfigProvider value={{ layout: wasmLayout }}>
    <div style={{ height: 400 }}>                                {/* 4. a definite height */}
      <PetriNetViewer data={net} />
    </div>
  </ViewerConfigProvider>
</Theme>;
```

The core includes no layout engine, and a graph viewer without one stacks its nodes in a line. The
height is required because a viewer's root is `height: 100%`, which resolves to nothing inside an
auto-height parent.

Coloring, formatting, interactivity and the layout engine are configured once through
`ViewerConfigProvider`. Any viewer can override any field with a prop of the same name.

## Image export

`ViewerExportFrame` is the only export control in the package. Viewers never render one themselves,
so a viewer with no frame around it cannot be exported. Wrap it and a download menu appears in the
corner:

```tsx
import { ViewerExportFrame, DFGViewer } from "@r4pm/components";

<ViewerExportFrame filename="dfg" style={{ height: 480 }}>
  <DFGViewer data={dfg} />
</ViewerExportFrame>;
```

The frame is `position: relative` and takes a `style`, which also makes it the sizing box. Its menu
offers two routes. The viewer's own group (SVG, PNG, JPEG) redraws the viewer's model as SVG, crisp
at any size; every graph viewer, the log-variants list and the alignment strips register one. The
screenshot group (PNG, JPEG) snapshots the frame content through html-to-image and catches the
on-screen chrome the SVG route omits. `data-export-root` marks the subtree to capture,
`data-export-ignore` drops an element from it.

`onSave` takes the bytes instead of downloading them. `onError` and the `propel:export-error` window
event report failures. `menuPlacement` moves the button off a viewer's own corner controls, and
`exportKey` keeps two viewers in one frame from colliding. Any component can advertise its own SVG
through `useRegisterExport`.

## Stylesheets

Import `@r4pm/components/styles.css` once. It bundles Tailwind and the Radix theme.

### If your app already runs Tailwind

Import `@r4pm/components/rules.css` instead, and point Tailwind at this package's source so it
generates the utility classes the components use:

```css
/* your index.css */
@import "tailwindcss";
@source "../node_modules/@r4pm/components/src";
```

```tsx
import "./index.css";
import "@r4pm/components/rules.css"; // after your Tailwind entry, never before
```

`rules.css` is everything `styles.css` has minus Tailwind itself: the Radix theme, the shared
`--r4pm-*` tokens, the Petri-net editor's stylesheet and the components' own hand-written rules.
Importing only `@r4pm/components/ui/styles.css` gets you Radix but none of the latter, which shows up
as components that render with their layout intact and their styling missing.

Order matters: Tailwind's Preflight resets `button`, `input` and friends, so it has to load before
Radix or it strips Radix's control styling.

## Subpaths

Heavier viewers live behind subpaths so the core entry stays light. Importing `@r4pm/components`
never pulls in Plotly or the editors.

| Import | Contents |
| --- | --- |
| `@r4pm/components` | viewers (DFG, Petri net, OCEL summaries, alignments, ...), primitives, feedback states, `ViewerExportFrame`, and the presentation contract: `ViewerProps`, `ViewerConfig`, `ViewerConfigProvider`, `useViewerConfig`, `colorForKey`, `colorForSeed` |
| `@r4pm/components/ui` | the Radix Themes seam (`Theme`, `Button`, `Card`, ...). Import UI primitives from here, never `@radix-ui/themes` directly |
| `@r4pm/components/charts` | Plotly-backed viewers: `DottedChart`, `CaseDurationChart`, `EventsPerTimeChart`, `ObjectAttributeChangesChart`, `ActivityChart`, `ThemedPlot` |
| `@r4pm/components/petri` | the React Flow + ELK Petri-net **editor** |
| `@r4pm/components/process-tree` | the process-tree **editor** |
| `@r4pm/components/extraction-blueprint` | the extraction blueprint **editor** |
| `@r4pm/components/elk-layout` | `elkLayout`: pure-JS layout engine (elkjs) |
| `@r4pm/components/rust-layout/wasm` | `wasmLayout`: Rust/wasm layout engine, including `renderSvg` |
| `@r4pm/components/styles.css` | precompiled stylesheet (Tailwind + Radix theme + everything in `rules.css`) |
| `@r4pm/components/rules.css` | the same minus Tailwind, for apps that run their own Tailwind build |

## Docs

Storybook is the component gallery and API reference, with props tables generated from the TypeScript
types. Most components come with a `*.stories.tsx` with sample data, and every component page ends with a
copy-paste-runnable "Full example".

```sh
pnpm --filter @r4pm/components dev        # local gallery (storybook dev)
pnpm --filter @r4pm/components showcase   # static build -> storybook-static/
```

Start with **Getting Started > Sizing & Layout**, **Viewer Configuration**, **Coloring**,
**Layout Engines** and **Image Export**.

### For coding agents

`llms.txt` is published with the package, at `node_modules/@r4pm/components/llms.txt`. It covers the library in
one file: setup, the rules that are easy to get wrong, every entry point, every component with its
import path and sizing behaviour, the config and export APIs, and a symptom-to-fix table. Its tables
come out of the source. Hand an agent that file instead of a Storybook URL.

Starting a new integration, paste this into your agent:

```
Add the @r4pm/components React library to this project.

@r4pm/components is a set of process-mining viewers (Petri nets, object-centric Petri nets,
directly-follows graphs, dotted charts, alignments, OCEL/event-log summaries, process trees, ...) and
the primitives they're built from. npm: https://www.npmjs.com/package/@r4pm/components. Source +
Storybook stories (*.stories.tsx next to each component): https://github.com/aarkue/propel/tree/main/packages/components/src.

1. Install it: `npm add @r4pm/components react react-dom` (react/react-dom are peer deps, >=18).
2. Read `node_modules/@r4pm/components/llms.txt` in full before writing any code. It's the
   authoritative reference: setup, every component with its import path, the shared config API,
   image export, and a symptom-to-fix table for the mistakes that produce a blank screen.
3. Four things it's easy to get wrong, covered in depth in llms.txt but worth restating up front:
   - Import `@r4pm/components/styles.css` once and wrap the app in `<Theme>` from
     `@r4pm/components/ui` (use `rules.css` instead of `styles.css` only if this project already
     runs its own Tailwind build -- llms.txt has the exact setup for that case).
   - Graph viewers (DFG, OC-DFG, OC-DECLARE, Petri net, process tree) need a layout engine: pass one
     via `<ViewerConfigProvider value={{ layout: wasmLayout }}>`, importing `wasmLayout` from
     `@r4pm/components/rust-layout/wasm` (or `elkLayout` from `@r4pm/components/elk-layout` for a
     pure-JS alternative with no wasm). Without one, graphs render with nodes stacked in a line.
   - A viewer that "fills its parent" (most graph and chart viewers) needs an ancestor with a
     definite height -- `height: 100%` resolves to nothing inside an auto-height parent.
   - Wrap a viewer in `<ViewerExportFrame>` to get an SVG/PNG/JPEG export button; no viewer renders
     one on its own.

Confirm which component(s) fit the use case or project of the user before implementing, and ask if
the data shape is unclear.
```

Regenerate the generated docs after changing components or bindings:

```sh
pnpm --filter @r4pm/components docs:types
```
