import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { type TypeBadge, TypeBadges } from "@r4pm/components";
import { Text } from "@r4pm/components/ui";

const meta = {
  title: "Inputs & Primitives/Type Badges",
  component: TypeBadges,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof TypeBadges>;
export default meta;

const COLORS: Record<string, string> = {
  orders: "#3b82f6",
  items: "#f59e0b",
  packages: "#10b981",
  customers: "#8b5cf6",
  products: "#ec4899",
  employees: "#64748b",
};
const color = (t: string) => COLORS[t] ?? "#9ca3af";

// The object types each activity of an order management log touches.
const ACTIVITIES: { activity: string; badges: TypeBadge[] }[] = [
  {
    activity: "place order",
    badges: [
      { object_type: "orders", card: "1..1" },
      { object_type: "customers", card: "1..1" },
      { object_type: "items", card: "1..*" },
      { object_type: "products", card: "1..*" },
    ],
  },
  {
    activity: "pick item",
    badges: [
      { object_type: "items", from: "orders", card: "1..1", from_card: "1..1" },
      { object_type: "employees", card: "1..1" },
    ],
  },
  {
    activity: "create package",
    badges: [
      { object_type: "packages", from: "items", card: "1..1", from_card: "1..*" },
      { object_type: "employees", card: "0..1" },
    ],
  },
  {
    activity: "payment reminder",
    badges: [
      { object_type: "orders", card: "1..1" },
      { object_type: "customers", card: "0..*" },
    ],
  },
];

/** Badges per activity: plain discs for involved types, an arrow from the type a type follows from. */
export const Default: StoryObj = {
  name: "Type Badges",
  render: () => (
    <div
      style={{ display: "grid", gridTemplateColumns: "140px auto", gap: "12px 16px", alignItems: "center" }}
    >
      {ACTIVITIES.map((a) => (
        <div key={a.activity} style={{ display: "contents" }}>
          <Text size="2">{a.activity}</Text>
          <TypeBadges badges={a.badges} color={color} />
        </div>
      ))}
    </div>
  ),
};

/** The four involvement classes: one disc for at most one object, three for several, dashed when optional. */
export const Cardinalities: StoryObj = {
  name: "Cardinalities",
  render: () => (
    <div style={{ display: "flex", gap: 24 }}>
      {(["1..1", "0..1", "1..*", "0..*"] as const).map((card) => (
        <div key={card} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <TypeBadges badges={[{ object_type: "items", card }]} color={color} />
          <Text size="1" color="gray">
            {card}
          </Text>
        </div>
      ))}
    </div>
  ),
};

/** A row wider than `maxWidth` scales down to fit, e.g., inside a narrow graph node. */
export const ScaledDown: StoryObj = {
  name: "Scaled to fit",
  render: () => {
    const badges: TypeBadge[] = [
      { object_type: "items", from: "orders", card: "1..*", from_card: "1..1" },
      { object_type: "packages", from: "orders", card: "0..*", from_card: "1..1" },
      { object_type: "customers", card: "1..1" },
      { object_type: "products", card: "1..*" },
      { object_type: "employees", card: "0..1" },
    ];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <TypeBadges badges={badges} color={color} />
        <div style={{ width: 60, padding: 4, border: "1px dashed var(--gray-a6)", borderRadius: 4 }}>
          <TypeBadges badges={badges} color={color} maxWidth={60} />
        </div>
      </div>
    );
  },
};
