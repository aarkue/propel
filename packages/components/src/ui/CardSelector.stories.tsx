import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { useState } from "react";
import {
  PiArrowsLeftRight,
  PiCalendarDots,
  PiCube,
  PiFunnel,
  PiStack,
  PiTreeStructure,
} from "react-icons/pi";
import { CardSelector, CardSelectorContent, type CardSelectorOption } from "./CardSelector";
import { Text, Theme } from "@radix-ui/themes";

const meta: Meta<typeof CardSelector> = {
  title: "ui/CardSelector",
  component: CardSelector,
  parameters: { layout: "centered" },
};
export default meta;

type Kind = "event" | "object" | "relation" | "filter" | "join" | "union";

const OPTIONS: CardSelectorOption<Kind>[] = [
  {
    value: "event",
    title: "Event",
    description: "Each row produces one event",
    icon: <PiCalendarDots size={15} />,
    accent: "pink",
    group: "mappings",
  },
  {
    value: "object",
    title: "Object",
    description: "Each row produces one object",
    icon: <PiCube size={15} />,
    accent: "indigo",
    group: "mappings",
  },
  {
    value: "relation",
    title: "Relation",
    description: "Link two entities together",
    icon: <PiArrowsLeftRight size={15} />,
    accent: "purple",
    group: "mappings",
  },
  {
    value: "filter",
    title: "Filter",
    description: "Keep rows matching a condition",
    icon: <PiFunnel size={15} />,
    accent: "teal",
    group: "transforms",
  },
  {
    value: "join",
    title: "Join",
    description: "Merge rows with another node",
    icon: <PiTreeStructure size={15} />,
    accent: "orange",
    group: "transforms",
  },
  {
    value: "union",
    title: "Union",
    description: "Concatenate rows from several nodes",
    icon: <PiStack size={15} />,
    accent: "green",
    group: "transforms",
  },
];

const GROUP_LABELS = { mappings: "OCEL Usages", transforms: "Transforms" };

function Demo({ grouped }: { grouped: boolean }) {
  const [value, setValue] = useState<Kind>("event");
  const options = grouped ? OPTIONS : OPTIONS.map(({ group: _g, ...o }) => o);
  return (
    <Theme>
      <div style={{ width: 620 }}>
        <CardSelector
          options={options}
          value={value}
          onValueChange={setValue}
          groupLabels={grouped ? GROUP_LABELS : undefined}
          columns={3}
          aria-label="Node kind"
        >
          <CardSelectorContent>
            <Text size="2">
              The <strong>{value}</strong> panel goes here. Only the selected option's form is rendered, so a
              card grid plus one panel replaces a dropdown plus a wall of conditionals.
            </Text>
          </CardSelectorContent>
        </CardSelector>
      </div>
    </Theme>
  );
}

type Story = StoryObj<typeof CardSelector>;

/** Grouped, with a per-option accent and a panel that follows the selection. */
export const Grouped: Story = { render: () => <Demo grouped /> };

/** Ungrouped: one flat grid, for a choice that needs no headings. */
export const Flat: Story = { render: () => <Demo grouped={false} /> };
