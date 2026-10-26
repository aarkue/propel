import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { Card, Theme } from "@r4pm/components/ui";
import { useState } from "react";
import { DISCOVERY_DEFAULTS, discoverySummary } from "./discovery-summary";
import { DiscoveryForm } from "./DiscoveryForm";

const EVENTS: Record<string, number> = {
  "pick item": 7659,
  "confirm order": 2000,
  "pay order": 2000,
  "place order": 2000,
  "item out of stock": 1544,
  "reorder item": 1544,
  "create package": 1128,
  "package delivered": 1128,
  "send package": 1128,
  "payment reminder": 566,
  "failed delivery": 311,
};
const OBJECTS: Record<string, number> = {
  items: 7659,
  orders: 2000,
  packages: 1128,
  products: 20,
  employees: 18,
  customers: 15,
};
const MANY_OBJECTS: Record<string, number> = Object.fromEntries(
  Array.from({ length: 240 }, (_, i) => [
    `${["material", "vendor", "plant", "batch", "doc", "invoice", "po", "lot"][i % 8]}_${String(i).padStart(3, "0")}`,
    Math.round(20000 / (1 + i * 0.35)),
  ]),
);

function Demo({ objects }: { objects: Record<string, number> }) {
  const [value, setValue] = useState(DISCOVERY_DEFAULTS);
  return (
    <Theme>
      <Card style={{ width: 340 }}>
        <div className="mb-2 text-[12px]" style={{ color: "var(--gray-11)" }}>
          {discoverySummary(value, {
            objectTypes: Object.keys(objects).length,
            activities: Object.keys(EVENTS).length,
          })}
        </div>
        <DiscoveryForm
          value={value}
          onChange={setValue}
          eventTypeCounts={EVENTS}
          objectTypeCounts={objects}
        />
      </Card>
    </Theme>
  );
}

const meta: Meta<typeof DiscoveryForm> = {
  title: "Viewers/OC-DECLARE/Discovery Form",
  component: DiscoveryForm,
  parameters: { layout: "centered" },
};
export default meta;

/** The settings a host shows in a popover, with `discoverySummary` above them. */
export const Default: StoryObj = { render: () => <Demo objects={OBJECTS} /> };

/** A log with hundreds of object types: the picker stays one button and a searchable list. */
export const ManyObjectTypes: StoryObj = { render: () => <Demo objects={MANY_OBJECTS} /> };
