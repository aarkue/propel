import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
// Minimal example: what an external consumer imports.
import "@r4pm/components/styles.css";
import { EditableGrid, type GridColumn, type GridRowModel } from "@r4pm/components";

interface EventRow extends GridRowModel {
  caseId: string;
}

const COLUMNS: GridColumn[] = [
  { key: "caseId", header: "Case", width: "110px" },
  { key: "activity", header: "Activity" },
  { key: "resource", header: "Resource", width: "150px" },
  { key: "cost", header: "Cost", width: "90px", inputMode: "numeric", align: "right" },
  { key: "urgent", header: "Urgent", width: "80px", kind: "boolean" },
];

const INITIAL_ROWS: EventRow[] = [
  { rowId: "e1", caseId: "c1" },
  { rowId: "e2", caseId: "c1" },
  { rowId: "e3", caseId: "c1" },
  { rowId: "e4", caseId: "c2" },
  { rowId: "e5", caseId: "c2" },
];

const INITIAL_CELLS: Record<string, Record<string, string>> = {
  e1: { caseId: "c1", activity: "register request", resource: "Pete", cost: "50", urgent: "false" },
  e2: { caseId: "c1", activity: "examine", resource: "Sue", cost: "120", urgent: "true" },
  e3: { caseId: "c1", activity: "decide", resource: "Sara", cost: "80", urgent: "false" },
  e4: { caseId: "c2", activity: "register request", resource: "Mike", cost: "50", urgent: "false" },
  e5: { caseId: "c2", activity: "reject", resource: "Sara", cost: "30", urgent: "true" },
};

const meta = {
  title: "Editors/Editable Grid",
  component: EditableGrid,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true, iframeHeight: 340 } } },
} satisfies Meta<typeof EditableGrid>;
export default meta;

export const Default: StoryObj = {
  name: "Event grid",
  render: function Demo() {
    const [rows, setRows] = useState<EventRow[]>(INITIAL_ROWS);
    const [cells, setCells] = useState(INITIAL_CELLS);
    return (
      <div style={{ width: 620, maxWidth: "100%" }}>
        <EditableGrid<EventRow>
          columns={COLUMNS}
          rows={rows}
          cell={(row, key) => cells[row.rowId]?.[key] ?? ""}
          onCell={(rowId, key, value) => setCells((c) => ({ ...c, [rowId]: { ...c[rowId], [key]: value } }))}
          onDeleteRow={(rowId) => setRows((rs) => rs.filter((r) => r.rowId !== rowId))}
          isGroupStart={(row, prev) => !prev || prev.caseId !== row.caseId}
          emptyHint="No events yet."
        />
      </div>
    );
  },
};
