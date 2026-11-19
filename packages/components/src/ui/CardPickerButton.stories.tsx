import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { Text, Theme } from "@radix-ui/themes";
import { useState } from "react";
import { PiChartLineUp, PiPencilSimple, PiTreeStructure } from "react-icons/pi";
import { CardPickerButton } from "./CardPickerButton";

const meta: Meta<typeof CardPickerButton> = {
  title: "Inputs & Primitives/Card Picker Button",
  component: CardPickerButton,
  parameters: { layout: "centered" },
};
export default meta;

const SOURCES = [
  {
    value: "discover",
    title: "Petri Net",
    description: "Inductive Miner or Alpha+++",
    icon: <PiTreeStructure />,
  },
  {
    value: "sweep",
    title: "Model Sweep",
    description: "Nets over a range of noise thresholds",
    icon: <PiChartLineUp />,
  },
  {
    value: "draw",
    title: "Petri Net Editor",
    description: "Draw a net or import a PNML file",
    icon: <PiPencilSimple />,
  },
];

function Demo({ options }: { options: typeof SOURCES }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <Theme>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
        <CardPickerButton
          label="Make a net"
          icon={<PiTreeStructure />}
          heading="Opens the panel. Save the model there to use it here."
          options={options}
          onPick={setPicked}
        />
        <Text size="1" color="gray">
          Picked: {picked ?? "nothing yet"}
        </Text>
      </div>
    </Theme>
  );
}

/** Several ways to do it: the button opens the options as cards. */
export const SeveralOptions: StoryObj = { render: () => <Demo options={SOURCES} /> };

/** One way: a plain button that runs it. */
export const OneOption: StoryObj = { render: () => <Demo options={SOURCES.slice(0, 1)} /> };
