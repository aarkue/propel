import { ToolbarHostContext } from "@r4pm/components";
import { type ReactNode, useState } from "react";
import { usePanelTabs } from "./tabbed";

const headerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  // The right inset keeps clear of the export frame's floating download button.
  padding: "6px 60px 6px 12px",
  minHeight: 44,
  borderBottom: "1px solid var(--gray-a4)",
  background: "var(--color-panel-solid)",
  flex: "0 0 auto",
} as const;

/**
 * A panel: one header row (dataset picker, the view's own toolbar, run and export actions) above an
 * export-rooted body. A kit `Toolbar` anywhere in the body renders into the header row, so a view
 * never stacks a second bar under the picker.
 */
export function PanelFrame({
  picker,
  header,
  body,
  testid,
}: {
  picker?: ReactNode;
  /** Header content before the view's toolbar, e.g., a model picker or a run button. */
  header?: ReactNode;
  body: ReactNode;
  testid?: string;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const tabs = usePanelTabs();
  return (
    <div
      data-testid={testid}
      style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column" }}
    >
      {/* Always a header row: views put their toolbar there, and it keeps the export button clear of the body. */}
      <div style={headerStyle}>
        {tabs}
        {picker}
        {header}
        <span ref={setHost} style={{ display: "contents" }} />
      </div>
      <div data-export-root style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <ToolbarHostContext.Provider value={host}>{body}</ToolbarHostContext.Provider>
      </div>
    </div>
  );
}
