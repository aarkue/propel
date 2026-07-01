import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import "@r4pm/components/styles.css";
import { EventLogEditor, JSONViewer } from "@r4pm/components";
import { applyQuickAdd, EMPTY_LOG, toLogJson, type EventLogModel } from "./model";

const seeded = [
  "c1 > Register Check Approve Pay",
  "c2 > Register Reject",
  "c3 > Register Check Approve",
].reduce<EventLogModel>((m, line) => applyQuickAdd(m, line), {
  ...EMPTY_LOG,
  attrColumns: [{ name: "Cost", type: "int" }],
});

const meta = {
  title: "Editors/Event Log Creator",
  component: EventLogEditor,
  parameters: { frame: { mode: "canvas", height: 520 }, docs: { story: { iframeHeight: 560 } } },
} satisfies Meta<typeof EventLogEditor>;
export default meta;

export const Default: StoryObj = {
  name: "Seeded",
  render: function Story() {
    const [model, setModel] = useState<EventLogModel>(seeded);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            border: "1px solid var(--gray-a5)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <EventLogEditor model={model} onChange={setModel} />
        </div>
        <div
          style={{
            height: 160,
            flexShrink: 0,
            border: "1px solid var(--gray-a5)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <JSONViewer data={toLogJson(model)} />
        </div>
      </div>
    );
  },
};

export const Empty: StoryObj = {
  name: "Blank",
  render: function Story() {
    const [model, setModel] = useState<EventLogModel>(EMPTY_LOG);
    return <EventLogEditor model={model} onChange={setModel} />;
  },
};
