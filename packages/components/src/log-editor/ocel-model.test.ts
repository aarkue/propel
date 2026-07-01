import { describe, expect, it } from "vitest";
import {
  applyOcelQuickAdd,
  EMPTY_OCEL,
  fromOcelJson,
  parseOcelQuickAdd,
  reorderEvents,
  reorderObjects,
  toOcelJson,
  type OcelModel,
} from "./ocel-model";

describe("fromOcelJson type coercion", () => {
  it("accepts canonical OCEL 2.0 type strings (integer/time/number)", () => {
    const m = fromOcelJson({
      eventTypes: [{ name: "e", attributes: [{ name: "amount", type: "integer" }] }],
      objectTypes: [
        {
          name: "o",
          attributes: [
            { name: "when", type: "time" },
            { name: "rate", type: "number" },
          ],
        },
      ],
      events: [],
      objects: [],
    });
    expect(m.eventTypes[0].attributes).toEqual([{ name: "amount", type: "int" }]);
    expect(m.objectTypes[0].attributes).toEqual([
      { name: "when", type: "date" },
      { name: "rate", type: "float" },
    ]);
  });
});

describe("parseOcelQuickAdd", () => {
  it("parses event type and typed object refs", () => {
    expect(parseOcelQuickAdd("place_order Order:o1 Item:i1 i2")).toEqual({
      kind: "event",
      eventType: "place_order",
      refs: [
        { type: "Order", id: "o1", qualifier: undefined },
        { type: "Item", id: "i1", qualifier: undefined },
        { id: "i2", qualifier: undefined },
      ],
    });
  });

  it("parses a relationship qualifier", () => {
    expect(parseOcelQuickAdd("ship Item:i1#contains")).toEqual({
      kind: "event",
      eventType: "ship",
      refs: [{ type: "Item", id: "i1", qualifier: "contains" }],
    });
  });

  it("noop on empty", () => {
    expect(parseOcelQuickAdd("  ")).toEqual({ kind: "noop" });
  });
});

describe("applyOcelQuickAdd", () => {
  it("declares types, auto-creates objects, links E2O", () => {
    const m = applyOcelQuickAdd(EMPTY_OCEL, "place_order Order:o1 Item:i1 i2");
    expect(m.eventTypes.map((t) => t.name)).toEqual(["place_order"]);
    expect(m.objectTypes.map((t) => t.name).sort()).toEqual(["Item", "Order", "object"]);
    expect(m.objects.map((o) => `${o.type}:${o.id}`).sort()).toEqual(["Item:i1", "Order:o1", "object:i2"]);
    expect(m.events).toHaveLength(1);
    expect(m.events[0].e2o).toEqual([
      { objectId: "o1", qualifier: "Order" },
      { objectId: "i1", qualifier: "Item" },
      { objectId: "i2", qualifier: "object" },
    ]);
  });

  it("reuses a known object's type for a bare id and does not duplicate it", () => {
    let m = applyOcelQuickAdd(EMPTY_OCEL, "place_order Order:o1");
    m = applyOcelQuickAdd(m, "pay o1");
    expect(m.objects).toHaveLength(1);
    expect(m.events[1].e2o).toEqual([{ objectId: "o1", qualifier: "Order" }]);
  });

  it("stamps events in order from the configured start", () => {
    let m = applyOcelQuickAdd(EMPTY_OCEL, "a O:o1");
    m = applyOcelQuickAdd(m, "b O:o1");
    const t0 = Date.parse(m.events[0].time);
    const t1 = Date.parse(m.events[1].time);
    expect(t1 - t0).toBe(m.time.stepSeconds * 1000);
  });
});

describe("reorderEvents / reorderObjects", () => {
  it("reorders events and re-stamps their times", () => {
    let m = applyOcelQuickAdd(EMPTY_OCEL, "a O:o1");
    m = applyOcelQuickAdd(m, "b O:o1");
    m = applyOcelQuickAdd(m, "c O:o1");
    const before = m.events.map((e) => e.id);
    m = reorderEvents(m, 2, 0);
    expect(m.events.map((e) => e.id)).toEqual([before[2], before[0], before[1]]);
    // times stay ascending by new position
    const t = m.events.map((e) => Date.parse(e.time));
    expect(t[0]).toBeLessThan(t[1]);
    expect(t[1]).toBeLessThan(t[2]);
  });

  it("reorders objects (display order)", () => {
    let m = applyOcelQuickAdd(EMPTY_OCEL, "e A:o1 B:o2");
    const ids = m.objects.map((o) => o.id);
    m = reorderObjects(m, 1, 0);
    expect(m.objects.map((o) => o.id)).toEqual([ids[1], ids[0]]);
  });
});

describe("toOcelJson / fromOcelJson round-trip", () => {
  it("preserves types, events, objects and relationships", () => {
    let m: OcelModel = applyOcelQuickAdd(EMPTY_OCEL, "place_order Order:o1 Item:i1");
    // declare an event attribute and set it
    m = {
      ...m,
      eventTypes: m.eventTypes.map((t) =>
        t.name === "place_order" ? { ...t, attributes: [{ name: "price", type: "float" }] } : t,
      ),
      events: m.events.map((e) => ({ ...e, attrs: { price: "9.99" } })),
    };
    const json = toOcelJson(m);
    expect(json.events[0].attributes).toEqual([{ name: "price", type: "float", value: "9.99" }]);
    expect(json.events[0].relationships).toEqual([
      { objectId: "o1", qualifier: "Order" },
      { objectId: "i1", qualifier: "Item" },
    ]);
    expect(json.objects.every((o) => o.attributes.every((a) => a.time === m.time.start))).toBe(true);

    const back = fromOcelJson(json);
    expect(back.eventTypes).toEqual([
      { name: "place_order", attributes: [{ name: "price", type: "float" }] },
    ]);
    expect(back.events[0].e2o).toEqual(json.events[0].relationships);
    expect(back.objects.map((o) => o.id).sort()).toEqual(["i1", "o1"]);
  });
});
