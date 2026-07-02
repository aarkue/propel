import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "@r4pm/components/ui";
import { useState } from "react";
import { FrequencyPicker } from "@r4pm/components";

const COUNTS = {
  "Create Purchase Order": 1842,
  "Receive Goods": 1531,
  "Approve Invoice": 1290,
  "Send Invoice": 1104,
  "Register Payment": 980,
  "Cancel Order": 612,
  "Escalate to Manager": 430,
  "Request Change": 318,
  "Reject Invoice": 201,
  "Archive Case": 96,
} as Record<string, number>;

const meta = {
  title: "Inputs & Primitives/Frequency Picker",
  component: FrequencyPicker,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof FrequencyPicker>;
export default meta;

export const Default: StoryObj = {
  name: "Frequency Picker",
  render: () => {
    const [value, setValue] = useState<Set<string>>(new Set(["Create Purchase Order", "Receive Goods"]));
    return (
      <div style={{ width: 380, padding: 24 }}>
        <Card>
          <FrequencyPicker items={COUNTS} value={value} onChange={setValue} autoFocus />
        </Card>
      </div>
    );
  },
};
