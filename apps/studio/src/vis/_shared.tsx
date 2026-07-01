import { EmptyState, ErrorState, LoadingState } from "@r4pm/components";
import type React from "react";

// Helpers for panel-only vizzes (`definePanel`) that render their own selector/frame. `_`-prefixed so
// the vis registry glob skips it.

export const errorBox = (e: unknown) => (
  <div data-testid="error" className="w-full h-full">
    <ErrorState error={e} />
  </div>
);

export const loadingBox = (label: string) => (
  <div data-testid="loading" className="w-full h-full">
    <LoadingState label={label} slowAfterMs={8000} />
  </div>
);

export const datasetEmptyBox = (kind: string) => (
  <div data-testid="empty" className="w-full h-full">
    <EmptyState title={`No ${kind} dataset loaded`} description="Load one to view this panel." />
  </div>
);

/** Wrap a panel body with its per-panel selector bar above an export-rooted body. */
export function withSelector(selector: React.ReactNode, body: React.ReactNode, testid?: string) {
  return (
    <div
      data-testid={testid}
      style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column" }}
    >
      {selector}
      <div data-export-root style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {body}
      </div>
    </div>
  );
}
