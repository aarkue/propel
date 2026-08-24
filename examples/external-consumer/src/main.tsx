import { createRoot } from "react-dom/client";
// A third-party React app just imports the viewer it wants and the styles, then renders it
// with typed data from its own backend.
//
// Styles come from `@r4pm/components/styles.css`. Installed from npm that export is a precompiled
// stylesheet and needs no Tailwind setup; in this workspace it resolves to the raw Tailwind source,
// which this example compiles via the @tailwindcss/vite plugin (see vite.config.ts).
import "@r4pm/components/styles.css";
import "./index.css";
import { Theme } from "@r4pm/components/ui";
import {
  DFGViewer,
  ViewerConfigProvider,
  ViewerExportFrame,
  type DirectlyFollowsGraph,
} from "@r4pm/components";
// Graph viewers need a layout engine; the core includes none. The wasm engine is the default
// choice: orthogonal routing, stable drag-relayout, and an SVG export that matches its own
// geometry. It loads lazily on first layout, so a consumer that never renders a graph doesn't
// pay for it. `@r4pm/components/elk-layout` is the pure-JS alternative (no wasm).
import { wasmLayout } from "@r4pm/components/rust-layout/wasm";

// `DirectlyFollowsGraph` is the viewer's own local interface (exported from @r4pm/components,
// structurally identical to the engine's binding result).
const dfg: DirectlyFollowsGraph = {
  activities: { "register request": 6, examine: 4, decide: 6, pay: 5 },
  directly_follows_relations: [
    [["register request", "examine"], 4],
    [["register request", "decide"], 2],
    [["examine", "decide"], 4],
    [["decide", "pay"], 5],
    [["pay", "pay"], 1],
  ],
  start_activities: { "register request": 6 },
  end_activities: { pay: 5 },
};

function App() {
  return (
    <Theme accentColor="indigo" grayColor="slate" radius="small">
      <ViewerConfigProvider value={{ layout: wasmLayout }}>
        <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
          <header style={{ padding: "12px 20px", borderBottom: "1px solid var(--gray-5)" }}>
            <strong>External consumer</strong> (third-party React app importing <code>{"<DFGViewer/>"}</code>{" "}
            from <code>@r4pm/components</code> directly).
          </header>
          {/* The frame is the sizing box and the export control in one: `flex: 1` + `minHeight: 0`
              give the viewer a definite height, and wrapping it adds the SVG/PNG download menu. */}
          <ViewerExportFrame filename="dfg" style={{ flex: 1, minHeight: 0 }}>
            <DFGViewer data={dfg} />
          </ViewerExportFrame>
        </div>
      </ViewerConfigProvider>
    </Theme>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
