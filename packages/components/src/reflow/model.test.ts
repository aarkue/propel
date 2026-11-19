import { describe, expect, it } from "vitest";
import { gridOrder, type ReflowCell, type ReflowSummary, reflowBadges, viaText } from "./model";

const cell = (
  activity: string,
  objectType: string,
  state: ReflowCell["state"],
  from?: string,
  [minObjects, maxObjects] = [1, 1],
): ReflowCell => ({
  activity,
  objectType,
  state,
  recorded: true,
  participations: 1,
  minObjects,
  maxObjects,
  determinedBy: from
    ? {
        from,
        reconstruction: {
          via: { kind: "recorded", relations: [{ qualifier: "comprises", reversed: false }] },
          share: 1,
        },
      }
    : null,
});

const summary: ReflowSummary = {
  activities: ["confirm order", "pick item", "place order"],
  objectTypes: ["employees", "items", "orders"],
  cells: [
    cell("confirm order", "orders", "flow"),
    cell("confirm order", "items", "implied", "orders", [1, 4]),
    cell("pick item", "items", "flow"),
    cell("pick item", "employees", "involved", undefined, [0, 1]),
    cell("place order", "items", "flow"),
    cell("place order", "orders", "flow"),
  ],
  stats: {
    facts: 3,
    flow: 4,
    implied: 1,
    involved: 1,
    added: 0,
    arcsRecorded: 9,
    arcsFlow: 3,
    seed: "handoff",
    repaired: 0,
    work: 1,
    limitReached: false,
    expansionCandidates: 0,
  },
};

describe("reflow model", () => {
  it("turns non-flow cells into badges with the involvement class of their counts", () => {
    expect(reflowBadges(summary)).toEqual({
      "confirm order": [{ object_type: "items", from: "orders", card: "1..*", from_card: "1..1" }],
      "pick item": [{ object_type: "employees", card: "0..1" }],
    });
  });

  it("orders flowing types first and groups activities by them", () => {
    const { activities, types } = gridOrder(summary);
    expect(types).toEqual(["items", "orders", "employees"]);
    expect(activities).toEqual(["pick item", "place order", "confirm order"]);
  });

  it("describes how a cell follows", () => {
    expect(viaText(summary.cells[1])).toBe("object relation comprises");
    expect(viaText(summary.cells[0])).toBeNull();
  });
});
