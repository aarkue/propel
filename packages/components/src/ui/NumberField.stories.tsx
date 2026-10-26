import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import "@r4pm/components/styles.css";
import { Flex, NumberField, Text } from "@r4pm/components/ui";

const meta = {
  title: "Inputs & Primitives/Number Field",
  component: NumberField,
} satisfies Meta<typeof NumberField>;
export default meta;

export const Threshold: StoryObj = {
  name: "Threshold from 0 to 1",
  render: function Demo() {
    const [noise, setNoise] = useState(0.2);
    return (
      <Flex direction="column" gap="2" align="start">
        <NumberField label="Noise threshold" value={noise} onCommit={setNoise} />
        <Text size="1" color="gray">
          Committed: {noise}
        </Text>
      </Flex>
    );
  },
};
