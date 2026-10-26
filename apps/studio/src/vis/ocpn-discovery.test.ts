import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BINDING_RETURN_TYPE, type FunctionMeta } from "@r4pm/client";
import { describe, expect, it } from "vitest";
import { keptNames, namesToUse, OCPN_DISCOVERY, ocpnDiscovery } from "./_ocpn-discovery";

const here = dirname(fileURLToPath(import.meta.url));
const metas: FunctionMeta[] = JSON.parse(
  readFileSync(join(here, "../../../../packages/client/gen/bindings-meta.json"), "utf8"),
);

describe("the OCPN discovery binding", () => {
  it("is discover_ocpn on an OCEL, returning the flat OCPN", () => {
    const meta = metas.find((f) => f.id === OCPN_DISCOVERY);
    expect(meta?.name).toBe("discover_ocpn");
    expect(meta?.required_args).toEqual(["locel"]);
    expect(meta?.args.map(([name]) => name)).toEqual(["locel", "options"]);
    expect(meta?.args[0][1]["x-registry-ref"]).toBe("SlimLinkedOCEL");
    expect(BINDING_RETURN_TYPE[OCPN_DISCOVERY]).toBe("ObjectCentricPetriNetJson");
  });
});

describe("object types and activities to use", () => {
  const all = ["orders", "items", "packages"];
  const counts = { orders: 10, items: 50, packages: 20 };

  it("keep every name, or only the listed ones the OCEL has", () => {
    expect([...keptNames(null, counts, 3)]).toEqual(all);
    expect([...keptNames(["items", "gone"], counts, 3)]).toEqual(["items"]);
  });

  it("start with the most frequent ones", () => {
    const many = { ...counts, customers: 5, employees: 20 };
    expect([...keptNames(undefined, many, 3)]).toEqual(["items", "employees", "packages"]);
    expect(ocpnDiscovery({}).object_types_to_use).toBeUndefined();
    expect(ocpnDiscovery({ activities_to_use: null }).activities_to_use).toBeNull();
  });

  it("are null for every name, else the kept ones in the OCEL's order", () => {
    expect(namesToUse(new Set(all), all)).toBeNull();
    expect(namesToUse(new Set(["packages", "orders"]), all)).toEqual(["orders", "packages"]);
    expect(namesToUse(new Set(), all)).toEqual([]);
  });
});
