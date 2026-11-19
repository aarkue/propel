import { EmptyState } from "@r4pm/components";
import type React from "react";
import { PanelFrame } from "../panels/panel-header";

// Helpers for panel-only vizzes (`definePanel`) that render their own selector/frame. `_`-prefixed so
// the vis registry glob skips it.

export const datasetEmptyBox = (kind: string) => (
  <div data-testid="empty" className="w-full h-full">
    <EmptyState title={`No ${kind} dataset loaded`} description="Load one to view this panel." />
  </div>
);

/** A panel body under its header row holding the dataset picker (and any view toolbar). */
export function withSelector(selector: React.ReactNode, body: React.ReactNode, testid?: string) {
  return <PanelFrame picker={selector} body={body} testid={testid} />;
}
