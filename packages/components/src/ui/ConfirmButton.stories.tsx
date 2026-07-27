import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import "@r4pm/components/styles.css";
import { ConfirmButton, Flex, Text } from "@r4pm/components/ui";

const meta = {
  title: "Inputs & Primitives/Confirm Button",
  component: ConfirmButton,
  parameters: { docs: { story: { iframeHeight: 300 } } },
} satisfies Meta<typeof ConfirmButton>;
export default meta;

export const Destructive: StoryObj = {
  name: "Destructive action",
  render: function Demo() {
    const [events, setEvents] = useState(1842);
    return (
      <Flex direction="column" gap="3" align="start">
        <ConfirmButton
          message="Clear all 1,842 events? This cannot be undone."
          confirmLabel="Clear log"
          onConfirm={() => setEvents(0)}
        >
          Clear log
        </ConfirmButton>
        <Text size="2" color="gray">
          Events in log: {events.toLocaleString("en")}
        </Text>
      </Flex>
    );
  },
};

export const CustomPrompt: StoryObj = {
  name: "Custom color and labels",
  render: function Demo() {
    const [status, setStatus] = useState("draft");
    return (
      <Flex direction="column" gap="3" align="start">
        <ConfirmButton
          color="amber"
          variant="solid"
          size="2"
          message="Publish this model to the shared workspace?"
          confirmLabel="Publish"
          cancelLabel="Keep as draft"
          onConfirm={() => setStatus("published")}
        >
          Publish model
        </ConfirmButton>
        <Text size="2" color="gray">
          Status: {status}
        </Text>
      </Flex>
    );
  },
};
