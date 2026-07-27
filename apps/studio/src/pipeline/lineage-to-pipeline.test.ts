import { describe, expect, it } from "vitest";
import type { FunctionMeta, Provenance } from "@r4pm/client";
import {
  buildPipelineFromLineage,
  parseOp,
  sourceArgNames,
  type LineageObject,
  type LineageResult,
} from "./lineage-to-pipeline";

const applyTransforms: FunctionMeta = {
  id: "app_bindings::transforms::apply_event_log_transforms",
  name: "apply_event_log_transforms",
  return_type: {},
  required_args: ["event_log", "transforms"],
  args: [
    ["event_log", { "x-registry-ref": "EventLog" }],
    ["transforms", { type: "array" }],
  ],
};

function prov(fn: string, args: Record<string, unknown>, sources: string[]): Provenance {
  return { sources, op: JSON.stringify({ fn, args }), source_gen: 0 };
}

// Every edge endpoint must reference a node that was actually created.
function assertGraphIntegrity(res: LineageResult) {
  const ids = new Set(res.nodes.map((n) => n.id));
  for (const edge of res.edges) {
    expect(ids.has(edge.source)).toBe(true);
    expect(ids.has(edge.target)).toBe(true);
  }
}

describe("sourceArgNames", () => {
  it("returns only x-registry-ref args", () => {
    expect(sourceArgNames(applyTransforms)).toEqual(["event_log"]);
  });
});

describe("parseOp", () => {
  it("parses JSON op", () => {
    expect(parseOp('{"fn":"f","args":{"a":1}}')).toEqual({ fn: "f", args: { a: 1 } });
  });
  it("returns null on convert:* op", () => {
    expect(parseOp("convert:EventLogActivityProjection")).toBeNull();
  });
});

describe("buildPipelineFromLineage", () => {
  it("builds a source object node + a function node, with non-source args as wired preset nodes", () => {
    const root: LineageObject = {
      id: "log1",
      kind: "EventLog",
      label: "log1",
      storeKind: "dataset",
      provenance: null,
    };
    const derived: LineageObject = {
      id: "log1-filtered",
      kind: "EventLog",
      label: "Filtered",
      storeKind: "dataset",
      provenance: prov(
        "app_bindings::transforms::apply_event_log_transforms",
        { event_log: "log1", transforms: [{ FilterActivities: {} }] },
        ["log1"],
      ),
    };
    const res = buildPipelineFromLineage({
      rootId: "log1-filtered",
      objectsById: new Map([
        [root.id, root],
        [derived.id, derived],
      ]),
      functionsById: new Map([[applyTransforms.id, applyTransforms]]),
    });

    expect(res.warnings).toEqual([]);
    const obj = res.nodes.find((n) => n.type === "object");
    expect(obj?.data).toMatchObject({ type: "EventLog", selectedObject: "log1" });
    const fn = res.nodes.find((n) => n.type === "function");
    expect((fn?.data as { functionMeta: FunctionMeta }).functionMeta.id).toBe(applyTransforms.id);

    const preset = res.nodes.find((n) => n.type === "preset");
    expect(preset?.data).toMatchObject({
      value: [{ FilterActivities: {} }],
      argType: "array",
      label: "transforms",
    });

    expect(res.edges).toHaveLength(2);
    expect(res.edges).toContainEqual(
      expect.objectContaining({ source: obj?.id, target: fn?.id, targetHandle: "event_log" }),
    );
    expect(res.edges).toContainEqual(
      expect.objectContaining({ source: preset?.id, target: fn?.id, targetHandle: "transforms" }),
    );
    assertGraphIntegrity(res);
  });

  it("warns and continues on a non-JSON op", () => {
    const derived: LineageObject = {
      id: "x",
      kind: "EventLogActivityProjection",
      label: "x",
      storeKind: "dataset",
      provenance: { sources: [], op: "convert:EventLogActivityProjection", source_gen: 0 },
    };
    const res = buildPipelineFromLineage({
      rootId: "x",
      objectsById: new Map([["x", derived]]),
      functionsById: new Map(),
    });
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.nodes).toHaveLength(1);
    expect(res.nodes[0]).toMatchObject({ type: "object", data: { type: "EventLogActivityProjection" } });
    assertGraphIntegrity(res);
  });

  it("mid-chain non-JSON convert op: falls back to a source node without a dangling edge", () => {
    const m: LineageObject = {
      id: "m1",
      kind: "EventLogActivityProjection",
      label: "M",
      storeKind: "dataset",
      provenance: { sources: ["a1"], op: "convert:EventLogActivityProjection", source_gen: 0 },
    };
    const g: LineageObject = {
      id: "g1",
      kind: "EventLog",
      label: "G",
      storeKind: "dataset",
      provenance: prov(applyTransforms.id, { event_log: "m1", transforms: [] }, ["m1"]),
    };
    const res = buildPipelineFromLineage({
      rootId: "g1",
      objectsById: new Map([
        ["m1", m],
        ["g1", g],
      ]),
      functionsById: new Map([[applyTransforms.id, applyTransforms]]),
    });

    expect(res.warnings.length).toBeGreaterThan(0);
    const mNode = res.nodes.find(
      (n) => n.type === "object" && (n.data as { selectedObject: string }).selectedObject === "m1",
    );
    expect(mNode).toBeDefined();
    const gNode = res.nodes.find((n) => n.type === "function");
    expect(gNode).toBeDefined();
    expect(res.edges).toHaveLength(1);
    expect(res.edges[0]).toMatchObject({ source: mNode?.id, target: gNode?.id });
    assertGraphIntegrity(res);
  });

  it("mid-chain missing binding: falls back to a source node without a dangling edge", () => {
    const m: LineageObject = {
      id: "m1",
      kind: "EventLog",
      label: "M",
      storeKind: "dataset",
      provenance: prov("unbound::fn", {}, []),
    };
    const g: LineageObject = {
      id: "g1",
      kind: "EventLog",
      label: "G",
      storeKind: "dataset",
      provenance: prov(applyTransforms.id, { event_log: "m1", transforms: [] }, ["m1"]),
    };
    const res = buildPipelineFromLineage({
      rootId: "g1",
      objectsById: new Map([
        ["m1", m],
        ["g1", g],
      ]),
      functionsById: new Map([[applyTransforms.id, applyTransforms]]),
    });

    expect(res.warnings.length).toBeGreaterThan(0);
    const mNode = res.nodes.find(
      (n) => n.type === "object" && (n.data as { selectedObject: string }).selectedObject === "m1",
    );
    expect(mNode).toBeDefined();
    const gNode = res.nodes.find((n) => n.type === "function");
    expect(gNode).toBeDefined();
    expect(res.edges).toHaveLength(1);
    expect(res.edges[0]).toMatchObject({ source: mNode?.id, target: gNode?.id });
    assertGraphIntegrity(res);
  });

  it("unresolved source id: warns and emits no edge for the missing source", () => {
    const root: LineageObject = {
      id: "r1",
      kind: "EventLog",
      label: "R",
      storeKind: "dataset",
      provenance: prov(applyTransforms.id, { event_log: "missing", transforms: [] }, ["missing"]),
    };
    const res = buildPipelineFromLineage({
      rootId: "r1",
      objectsById: new Map([["r1", root]]),
      functionsById: new Map([[applyTransforms.id, applyTransforms]]),
    });

    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.edges).toHaveLength(0);
    assertGraphIntegrity(res);
  });

  it("cycle: two objects sourcing each other terminates with a consistent graph", () => {
    const a: LineageObject = {
      id: "a1",
      kind: "EventLog",
      label: "A",
      storeKind: "dataset",
      provenance: prov(applyTransforms.id, { event_log: "b1", transforms: [] }, ["b1"]),
    };
    const b: LineageObject = {
      id: "b1",
      kind: "EventLog",
      label: "B",
      storeKind: "dataset",
      provenance: prov(applyTransforms.id, { event_log: "a1", transforms: [] }, ["a1"]),
    };
    const res = buildPipelineFromLineage({
      rootId: "a1",
      objectsById: new Map([
        ["a1", a],
        ["b1", b],
      ]),
      functionsById: new Map([[applyTransforms.id, applyTransforms]]),
    });

    expect(res.nodes).toHaveLength(2);
    expect(res.edges).toHaveLength(2);
    assertGraphIntegrity(res);
  });

  it("root artifact: emits an artifact node carrying the provided value", () => {
    const artifact: LineageObject = {
      id: "art1",
      kind: "SomeArtifactKind",
      label: "Art",
      storeKind: "artifact",
      provenance: null,
    };
    const res = buildPipelineFromLineage({
      rootId: "art1",
      objectsById: new Map([["art1", artifact]]),
      functionsById: new Map(),
      artifactValue: (id) => (id === "art1" ? 42 : undefined),
    });

    expect(res.warnings).toEqual([]);
    expect(res.nodes).toHaveLength(1);
    expect(res.nodes[0]).toMatchObject({
      type: "artifact",
      data: { value: 42, returnType: "SomeArtifactKind", label: "Art" },
    });
    expect(res.edges).toHaveLength(0);
    assertGraphIntegrity(res);
  });
});
