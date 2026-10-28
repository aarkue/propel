import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { SearchSelect, Text } from "@r4pm/components/ui";
import { useState } from "react";

interface City {
  name: string;
  country: string;
  population: number;
}

const CITIES: City[] = Array.from({ length: 500 }, (_, i) => ({
  name: `${["Aachen", "Berlin", "Cologne", "Dresden", "Essen", "Frankfurt"][i % 6]} ${Math.floor(i / 6) + 1}`,
  country: ["DE", "NL", "BE"][i % 3],
  population: Math.round(50_000 + ((i * 7919) % 900_000)),
}));
const MAX_POP = Math.max(...CITIES.map((c) => c.population));

function CityRow({ city }: { city: City }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Text size="2" style={{ flex: 1 }} truncate>
        {city.name}
      </Text>
      <Text size="1" color="gray">
        {city.country}
      </Text>
      <div style={{ width: 80, height: 4, borderRadius: 2, background: "var(--gray-a4)" }}>
        <div
          style={{
            width: `${(city.population / MAX_POP) * 100}%`,
            height: "100%",
            borderRadius: 2,
            background: "var(--accent-9)",
          }}
        />
      </div>
    </div>
  );
}

const meta = {
  title: "Inputs & Primitives/Search Select",
  component: SearchSelect,
  parameters: { frame: { mode: "canvas", height: 460 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof SearchSelect>;
export default meta;

export const Default: StoryObj = {
  name: "Search Select",
  render: function Demo() {
    const [value, setValue] = useState<string | null>(null);
    return (
      <div style={{ width: 360, padding: 16 }}>
        <SearchSelect<City>
          aria-label="City"
          items={CITIES}
          getKey={(c) => c.name}
          value={value}
          onChange={setValue}
          searchText={(c) => `${c.name} ${c.country}`}
          searchPlaceholder="Filter cities, e.g. 'berlin de'"
          noneOption="No city"
          renderItem={(c) => <CityRow city={c} />}
          stepper
          footer={
            <Text size="1" color="gray">
              {CITIES.length} cities, virtualized
            </Text>
          }
          style={{ flex: 1 }}
        />
      </div>
    );
  },
};
