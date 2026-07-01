import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { CoverageBar } from "@r4pm/components";

const meta = {
  title: "Inputs & Primitives/Coverage Bar",
  component: CoverageBar,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof CoverageBar>;
export default meta;

export const Default: StoryObj = {
  name: "Coverage Bar",
  render: () => (
    <div style={{ display: "flex", gap: 32 }}>
      <CoverageBar value={62} />
      <CoverageBar value={28} />
      <CoverageBar value={9} />
    </div>
  ),
};
