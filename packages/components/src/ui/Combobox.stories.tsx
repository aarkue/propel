import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import "@r4pm/components/styles.css";
import { Combobox, Flex, Text } from "@r4pm/components/ui";

const meta = {
  title: "Inputs & Primitives/Combobox",
  component: Combobox,
  parameters: { docs: { story: { iframeHeight: 360 } } },
} satisfies Meta<typeof Combobox>;
export default meta;

const BASE = ["order", "item", "customer", "invoice"];

export const SelectOrCreate: StoryObj = {
  name: "Select or create",
  render: function Demo() {
    const [options, setOptions] = useState<string[]>(BASE);
    const [value, setValue] = useState<string>();
    return (
      <Flex direction="column" gap="3" style={{ maxWidth: 280 }}>
        <Combobox
          value={value}
          options={options}
          onValueChange={(v) => {
            setValue(v);
            setOptions((o) => (o.includes(v) ? o : [...o, v]));
          }}
          allowCreate
          placeholder="Object type..."
          searchPlaceholder="Find or add type..."
          aria-label="Object type"
        />
        <Text size="2" color="gray">
          Selected: {value ?? "(none)"}
        </Text>
      </Flex>
    );
  },
};

export const SelectOnly: StoryObj = {
  name: "Select only (no create)",
  render: function Demo() {
    const [value, setValue] = useState<string>();
    return (
      <Flex direction="column" gap="3" style={{ maxWidth: 280 }}>
        <Combobox
          value={value}
          options={BASE}
          onValueChange={setValue}
          placeholder="Pick one..."
          aria-label="Type"
        />
        <Text size="2" color="gray">
          Selected: {value ?? "(none)"}
        </Text>
      </Flex>
    );
  },
};
