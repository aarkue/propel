import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import "@r4pm/components/styles.css";
import { JSONViewer, OcelEditor } from "@r4pm/components";
import { applyOcelQuickAdd, EMPTY_OCEL, toOcelJson, type OcelModel } from "./ocel-model";

const seeded = [
  "place_order Order:o1 Item:i1 Item:i2",
  "confirm Order:o1",
  "pick Item:i1",
  "ship Order:o1 Item:i1 Item:i2",
].reduce<OcelModel>((m, line) => applyOcelQuickAdd(m, line), EMPTY_OCEL);

const meta = {
  title: "Editors/OCEL Creator",
  component: OcelEditor,
  parameters: { frame: { mode: "canvas", height: 560 }, docs: { story: { iframeHeight: 600 } } },
} satisfies Meta<typeof OcelEditor>;
export default meta;

export const Default: StoryObj = {
  name: "Seeded",
  render: function Story() {
    const [model, setModel] = useState<OcelModel>(seeded);
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
          <OcelEditor model={model} onChange={setModel} />
        </div>
        <div
          style={{
            height: 150,
            flexShrink: 0,
            border: "1px solid var(--gray-a5)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <JSONViewer data={toOcelJson(model)} />
        </div>
      </div>
    );
  },
};

export const Empty: StoryObj = {
  name: "Blank",
  render: function Story() {
    const [model, setModel] = useState<OcelModel>(EMPTY_OCEL);
    return <OcelEditor model={model} onChange={setModel} />;
  },
};
