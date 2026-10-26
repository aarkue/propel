import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BackendContext, FunctionMeta } from "@r4pm/client";
import { describe, expect, it } from "vitest";
import type { OCDeclareArc } from "../../../../packages/components/src/oc-declare/index";
import { artifactOpening, artifactViewerData, ioKindByName } from "../io-kinds";
import {
  violationFractions,
  OC_DECLARE_CONFORMANCE,
  OCEL_TYPE_STATS,
  ocDeclarePanelExtras,
} from "./_oc-declare-discovery";

const here = dirname(fileURLToPath(import.meta.url));
const metas: FunctionMeta[] = JSON.parse(
  readFileSync(join(here, "../../../../packages/client/gen/bindings-meta.json"), "utf8"),
);
function expectArgsFit(id: string, args: Record<string, unknown>) {
  const m = metas.find((f) => f.id === id);
  if (!m) throw new Error(`no binding ${id}`);
  for (const key of Object.keys(args)) expect(m.args.map(([name]) => name)).toContain(key);
  for (const required of m.required_args) expect(args).toHaveProperty(required);
}

function recordingBackend(answer: (id: string, call: number) => unknown) {
  const calls: [string, Record<string, unknown>][] = [];
  const backend = {
    callBinding: async (id: string, args: Record<string, unknown>) => {
      calls.push([id, args]);
      return answer(id, calls.length);
    },
  } as unknown as Pick<BackendContext, "callBinding">;
  return { backend, calls };
}

const arc = (from: string, to: string): OCDeclareArc => ({
  from,
  to,
  arc_type: "EF",
  counts: [1, null],
  label: { each: [{ type: "Simple", object_type: "orders" }], any: [], all: [] },
});

describe("evaluation", () => {
  it("gives each arc's fraction of violating events", async () => {
    const { backend, calls } = recordingBackend((_, n) => n / 10);
    const fractions = await violationFractions(backend, "ocel-1", [arc("a", "b"), arc("b", "c")]);
    expect(calls.map(([id]) => id)).toEqual([OC_DECLARE_CONFORMANCE, OC_DECLARE_CONFORMANCE]);
    expect(calls[1][1]).toEqual({ ocel: "ocel-1", arc: arc("b", "c") });
    for (const [id, args] of calls) expectArgsFit(id, args);
    // The binding answers conformance (1 = every source event satisfies the arc).
    expect(fractions.map((f) => Math.round(f * 10) / 10)).toEqual([0.9, 0.8]);
  });
});

describe("OC-DECLARE artifacts", () => {
  it("open their arcs in the viewer and the model in the OC-DECLARE panel", () => {
    const kind = ioKindByName("OCDeclare");
    expect(kind?.editorPanel).toBe("ocDeclare");
    const file = { version: 1, arcs: [arc("a", "b")], nodes: [] };
    expect(kind?.toViewerData?.(file)).toEqual(file.arcs);
    expect(kind?.import_formats.map((f) => f.extension)).toEqual(["ocdeclare"]);
  });
});

describe("opening artifacts", () => {
  it("hands viewers the data they render, whatever path opens the artifact", () => {
    const file = { version: 1, arcs: [arc("a", "b")], nodes: [] };
    expect(artifactViewerData("OCDeclare", file)).toEqual(file.arcs);
    const net = { places: [], transitions: [] };
    expect(artifactViewerData("PetriNet", net)).toBe(net);
    expect(artifactViewerData("Unknown", net)).toBe(net);
  });
});

describe("the OC-DECLARE panel", () => {
  it("reads the OCEL's type counts", async () => {
    const stats = { event_type_counts: { a: 3 }, object_type_counts: { orders: 2 } };
    const { backend } = recordingBackend((id) => (id === OCEL_TYPE_STATS ? stats : {}));
    const extras = await ocDeclarePanelExtras(backend, "ocel-1");
    expect(extras.eventTypeCounts).toEqual({ a: 3 });
    expect(extras.objectTypeCounts).toEqual({ orders: 2 });
  });
});

describe("opening saved models", () => {
  it("opens OC-DECLARE models in the OC-DECLARE panel and others in the viewer", () => {
    const file = { version: 1, arcs: [arc("a", "b")], nodes: [] };
    expect(artifactOpening("OCDeclare", file)).toEqual({ panel: "ocDeclare", params: { doc: file } });
    const net = { places: [], transitions: [] };
    expect(artifactOpening("PetriNet", net)).toEqual({ returnType: "AcceptingPetriNet", data: net });
  });
});
