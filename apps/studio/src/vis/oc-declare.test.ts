import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FunctionMeta } from "@r4pm/client";
import { DISCOVERY_DEFAULTS } from "../../../../packages/components/src/oc-declare/edit/discovery-summary";
import type { OCDeclareArc } from "@r4pm/client";
import { describe, expect, it } from "vitest";
import {
  hiddenActivitiesOf,
  OC_DECLARE_DEFAULTS,
  OC_DECLARE_DISCOVER,
  ocDeclareDiscovery,
  showActivityCounts,
  showLabel,
  toBindingOptions,
  toFormOptions,
} from "./_oc-declare-discovery";

const here = dirname(fileURLToPath(import.meta.url));
const metas: FunctionMeta[] = JSON.parse(
  readFileSync(join(here, "../../../../packages/client/gen/bindings-meta.json"), "utf8"),
);
const set = () => {};

describe("OC-DECLARE discovery controls", () => {
  it("fall back to the defaults for old or missing controls", () => {
    expect(ocDeclareDiscovery(undefined)).toEqual(OC_DECLARE_DEFAULTS);
    expect(ocDeclareDiscovery({ foo: 1 })).toEqual(OC_DECLARE_DEFAULTS);
    expect(ocDeclareDiscovery({ noise_threshold: 7 })).toEqual(OC_DECLARE_DEFAULTS);
    const changed = { ...OC_DECLARE_DEFAULTS, reduction: "Lossy" as const, object_types_to_use: ["orders"] };
    expect(ocDeclareDiscovery(changed)).toEqual(changed);
  });

  it("default to settings the discovery binding accepts", () => {
    const options = metas.find((f) => f.id === OC_DECLARE_DISCOVER)?.args.find(([n]) => n === "options")?.[1];
    const properties = Object.keys((options?.properties ?? {}) as object);
    for (const key of Object.keys(OC_DECLARE_DEFAULTS)) expect(properties).toContain(key);
    expect(OC_DECLARE_DEFAULTS.considered_arrow_types).toEqual(["AS", "EF", "EP"]);
  });

  it("are the components' defaults in the binding's shape", () => {
    expect(toBindingOptions(DISCOVERY_DEFAULTS)).toEqual(OC_DECLARE_DEFAULTS);
    expect(toFormOptions(OC_DECLARE_DEFAULTS)).toEqual(DISCOVERY_DEFAULTS);
  });
});

describe("projection in the view", () => {
  it("reads the hidden activities from the view state", () => {
    expect(hiddenActivitiesOf({ state: { hiddenActivities: ["a"] }, set })).toEqual(["a"]);
    expect(hiddenActivitiesOf({ state: { hiddenActivities: "a" }, set })).toEqual([]);
  });

  it("offers the discovered model's activities once discovery ran", () => {
    const counts = { a: 5, b: 3, c: 1 };
    const arcs = [
      { from: "a", to: "b", arc_type: "EF", counts: [1, null], label: { each: [], any: [], all: [] } },
      {
        from: "<init> orders",
        to: "a",
        arc_type: "AS",
        counts: [1, null],
        label: { each: [], any: [], all: [] },
      },
    ] as OCDeclareArc[];
    expect(showActivityCounts(undefined, counts)).toEqual(counts);
    expect(showActivityCounts(arcs, counts)).toEqual({ a: 5, b: 3 });
  });

  it("labels the Show button by the known activities only", () => {
    expect(showLabel(["a", "b", "c"], [])).toBe("All 3 activities");
    expect(showLabel(["a", "b", "c"], ["zzz"])).toBe("All 3 activities");
    expect(showLabel(["a", "b", "c"], ["b", "zzz"])).toBe("2 of 3 activities");
  });
});
