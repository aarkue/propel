import { describe, expect, it } from "vitest";
import { involvementCard, typeBadgesWidth } from "./type-badges";

describe("typeBadgesWidth", () => {
  it("draws one source dot and arrow per source, and widens stacks", () => {
    const one = typeBadgesWidth([{ object_type: "items", from: "orders" }]);
    const two = typeBadgesWidth([
      { object_type: "items", from: "orders" },
      { object_type: "customers", from: "orders" },
    ]);
    const apart = typeBadgesWidth([
      { object_type: "items", from: "orders" },
      { object_type: "products", from: "items" },
    ]);
    expect(two - one).toBeLessThan(apart - one);
    expect(typeBadgesWidth([{ object_type: "items", from: "orders", card: "1..*" }])).toBeGreaterThan(one);
    expect(typeBadgesWidth([])).toBe(0);
  });

  it("matches rust4pm's badge_row widths", () => {
    const row = typeBadgesWidth([
      { object_type: "customers", card: "1..1" },
      { object_type: "items", from: "orders", card: "1..*", from_card: "1..*" },
      { object_type: "employees", from: "packages", card: "0..1", from_card: "1..*" },
      { object_type: "products", from: "orders", card: "0..*", from_card: "1..*" },
    ]);
    const single = 2 * 4.33 + 2;
    const many = single + 2 * 3.1;
    const arrow = 2 + 9 + 2;
    const widths = [many + arrow + many + 2 + many, many + arrow + single, single];
    expect(row).toBeCloseTo(widths.reduce((a, b) => a + b) + 2 * 10, 9);
  });

  it("classes involvement like OC-DECLARE", () => {
    expect(involvementCard(0, 1)).toBe("0..1");
    expect(involvementCard(1, 3)).toBe("1..*");
  });
});
