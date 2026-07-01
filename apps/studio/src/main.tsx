import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "dockview/dist/styles/dockview.css";
import "@r4pm/components/ui/styles.css";
import { SharedRootApp } from "./shell/SharedRootApp";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SharedRootApp />
  </React.StrictMode>,
);
