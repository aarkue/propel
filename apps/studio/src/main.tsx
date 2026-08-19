import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "dockview/dist/styles/dockview.css";
// `rules.css`, not `ui/styles.css`: this app runs its own Tailwind build (index.css), so it wants
// everything the components need *except* Tailwind. The `ui` seam is Radix only, so importing just
// that left every hand-written rule undefined here -- `.bp-*`, `.r4pm-indet-*` and the Petri-net
// editor's stylesheet -- with nothing failing to say so.
import "@r4pm/components/rules.css";
import { SharedRootApp } from "./shell/SharedRootApp";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SharedRootApp />
  </React.StrictMode>,
);
