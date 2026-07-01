import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { StatCards } from "@r4pm/components";

const meta = {
  title: "Inputs & Primitives/Stat Cards",
  component: StatCards,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof StatCards>;
export default meta;

export const Ring: StoryObj = {
  name: "Ring",
  render: () => (
    <div style={{ width: 560, padding: 24 }}>
      <StatCards
        indicator="ring"
        items={[
          { label: "Average trace fitness", value: "92.4%", progress: 0.924 },
          { label: "Log fitness", value: "88.1%", progress: 0.881 },
          { label: "Perfectly fitting traces", value: "61.0%", hint: "of all variants", progress: 0.61 },
          { label: "Total alignment cost", value: 1284 },
        ]}
      />
    </div>
  ),
};

export const Bar: StoryObj = {
  name: "Bar",
  render: () => (
    <div style={{ width: 560, padding: 24 }}>
      <StatCards
        indicator="bar"
        items={[
          { label: "Average trace fitness", value: "92.4%", progress: 0.924 },
          { label: "Log fitness", value: "88.1%", progress: 0.881 },
          { label: "Perfectly fitting traces", value: "61.0%", hint: "of all variants", progress: 0.61 },
          { label: "Total alignment cost", value: 1284 },
        ]}
      />
    </div>
  ),
};

export const Centered: StoryObj = {
  name: "Centered",
  render: () => (
    <div style={{ width: 420, padding: 24 }}>
      <StatCards
        align="center"
        items={[
          { label: "Cases", value: 1023 },
          { label: "Events", value: 14501 },
        ]}
      />
    </div>
  ),
};
