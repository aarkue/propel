# @r4pm/components

React components for process mining.

Components include Petri net, object-centric Petri net, directly-follows graph (DFG and OC-DFG), dotted
chart, alignments (list and net), case-duration and events-per-time charts, log and OCEL summaries,
plus inputs (frequency picker, choosers).

## Install

```sh
pnpm add @r4pm/components
# peer dependencies:
pnpm add react react-dom
```

## Use

```tsx
import "@r4pm/components/styles.css";
import { Theme, PetriNetViewer } from "@r4pm/components";

<Theme>
  <PetriNetViewer data={net} />
</Theme>;
```

Import `@r4pm/components/styles.css` once (it bundles Tailwind + the Radix theme). A viewer's root
sizes inline so it fills its container immediately; inner layout uses that stylesheet. Shared
coloring, formatting, and interactivity are configured once via `ViewerConfigProvider` (see the
Storybook "Concepts > Viewer Configuration" page).

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

Heavier viewers live behind subpaths so the core entry stays light (importing `@r4pm/components`
never pulls Plotly or the Petri-net editor):

| Import | Contents |
| --- | --- |
| `@r4pm/components` | viewers (DFG, Petri net viewer, OCEL summaries, alignments, ...), inputs, feedback states, and the presentation contract: `ViewerProps`, `ViewerConfig`, `ViewerConfigProvider`, `useViewerConfig`, `colorForKey`, `colorForSeed` |
| `@r4pm/components/ui` | the Radix Themes seam (`Theme`, `Button`, `Card`, ...). Import UI primitives from here, never `@radix-ui/themes` directly |
| `@r4pm/components/petri` | the React Flow + ELK Petri-net **editor** (layout, export controls) |
| `@r4pm/components/charts` | Plotly-backed viewers: `DottedChart`, `CaseDurationChart`, `EventsPerTimeChart`, `ObjectAttributeChangesChart`, `ActivityChart`, `ThemedPlot` |
| `@r4pm/components/styles.css` | precompiled stylesheet (Tailwind + Radix theme + everything in `rules.css`) |
| `@r4pm/components/rules.css` | the same minus Tailwind, for apps that run their own Tailwind build |

## Docs

Storybook is the component gallery and API reference (props tables are generated from the TypeScript
types). Most components ship a `*.stories.tsx` with sample data.

```sh
pnpm --filter @r4pm/components dev        # local gallery (storybook dev)
pnpm --filter @r4pm/components showcase   # static build -> storybook-static/
```
