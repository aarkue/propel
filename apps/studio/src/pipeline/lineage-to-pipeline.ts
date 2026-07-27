import type { FunctionMeta, Provenance, ProvenanceOp } from "@r4pm/client";
import type { Edge } from "@xyflow/react";
import type { AppNode } from "./components/pipeline/editor/types";

export interface LineageObject {
  id: string;
  kind: string;
  label: string;
  storeKind: "dataset" | "artifact";
  provenance?: Provenance | null;
}
export interface LineageInput {
  rootId: string;
  objectsById: Map<string, LineageObject>;
  functionsById: Map<string, FunctionMeta>;
  artifactValue?: (id: string) => unknown;
  /** Maps an object's raw `kind` to the pipeline artifact-node `returnType`. Defaults to identity. */
  artifactReturnType?: (kind: string) => string;
}
export interface LineageResult {
  nodes: AppNode[];
  edges: Edge[];
  warnings: string[];
}

/** Normalize a provenance op to `{fn, args}`, or null if not a replayable binding call (e.g. a `"convert:<Kind>"` string). */
export function parseOp(op: ProvenanceOp): { fn: string; args: Record<string, unknown> } | null {
  const value: unknown = typeof op === "string" ? tryParseJson(op) : op;
  if (!value || typeof value !== "object") return null;
  const { fn, args } = value as { fn?: unknown; args?: unknown };
  if (typeof fn !== "string" || typeof args !== "object" || args == null) return null;
  return { fn, args: args as Record<string, unknown> };
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function sourceArgNames(fn: FunctionMeta): string[] {
  return fn.args.filter(([, schema]) => typeof schema["x-registry-ref"] === "string").map(([name]) => name);
}

/** A config arg not worth a node: nothing (`null`/`undefined`) or an empty collection - a no-op. */
function isEmptyPresetValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

const srcNodeId = (objId: string) => `lin-src-${objId}`;
const fnNodeId = (objId: string) => `lin-fn-${objId}`;
const presetNodeId = (objId: string, arg: string) => `lin-preset-${objId}-${arg}`;

/** Ids of provenance-free root artifacts reachable from `rootId` through replayable ops --
 *  exactly the objects whose value {@link buildPipelineFromLineage} embeds in artifact nodes. */
export function reachableRootArtifactIds(rootId: string, objectsById: Map<string, LineageObject>): string[] {
  const seen = new Set<string>();
  const roots: string[] = [];
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const obj = objectsById.get(id);
    if (!obj) return;
    if (!obj.provenance) {
      if (obj.storeKind === "artifact") roots.push(id);
      return;
    }
    const parsed = parseOp(obj.provenance.op);
    if (parsed) for (const s of obj.provenance.sources) visit(s);
  };
  visit(rootId);
  return roots;
}

export function buildPipelineFromLineage(input: LineageInput): LineageResult {
  const { rootId, objectsById, functionsById, artifactValue, artifactReturnType = (k) => k } = input;
  const warnings: string[] = [];
  const nodes: AppNode[] = [];
  const edges: Edge[] = [];

  // Collect the reachable subgraph (guard cycles); assign depth for a simple layered layout.
  const depth = new Map<string, number>();
  const order: string[] = [];
  const visit = (id: string, d: number) => {
    const obj = objectsById.get(id);
    if (!obj) {
      warnings.push(`Unknown source object "${id}" - skipped.`);
      return;
    }
    depth.set(id, Math.max(depth.get(id) ?? 0, d));
    if (order.includes(id)) return;
    order.push(id);
    if (obj.provenance) {
      const parsed = parseOp(obj.provenance.op);
      if (parsed) for (const s of obj.provenance.sources) visit(s, d + 1);
    }
  };
  visit(rootId, 0);

  const maxDepth = Math.max(0, ...Array.from(depth.values()));
  const rowByDepth = new Map<number, number>();
  const position = (id: string) => {
    const d = maxDepth - (depth.get(id) ?? 0); // roots on the left, target on the right
    const row = rowByDepth.get(d) ?? 0;
    rowByDepth.set(d, row + 1);
    return { x: d * 320, y: row * 140 };
  };

  // Pass A: create every object's node, recording the id actually created for it so pass B's
  // edge wiring never points at a nonexistent node.
  const nodeIdByObj = new Map<string, string>();
  const fnCalls: { id: string; fn: FunctionMeta; parsed: { fn: string; args: Record<string, unknown> } }[] =
    [];

  const pushSourceObjectNode = (id: string, obj: LineageObject) => {
    nodes.push({
      id: srcNodeId(id),
      type: "object",
      position: position(id),
      data: { type: obj.kind, selectedObject: id },
    } as AppNode);
    nodeIdByObj.set(id, srcNodeId(id));
  };

  for (const id of order) {
    const obj = objectsById.get(id);
    if (!obj) continue;

    if (!obj.provenance) {
      if (obj.storeKind === "artifact") {
        nodes.push({
          id: srcNodeId(id),
          type: "artifact",
          position: position(id),
          data: {
            value: artifactValue ? artifactValue(id) : undefined,
            returnType: artifactReturnType(obj.kind),
            label: obj.label,
          },
        } as AppNode);
        nodeIdByObj.set(id, srcNodeId(id));
      } else {
        pushSourceObjectNode(id, obj);
      }
      continue;
    }

    const parsed = parseOp(obj.provenance.op);
    if (!parsed) {
      warnings.push(`"${obj.label}" has a non-replayable op - represented as a source node.`);
      pushSourceObjectNode(id, obj);
      continue;
    }
    const fn = functionsById.get(parsed.fn);
    if (!fn) {
      warnings.push(`Binding "${parsed.fn}" not found - "${obj.label}" left as a source node.`);
      pushSourceObjectNode(id, obj);
      continue;
    }

    const srcArgs = new Set(sourceArgNames(fn));
    const fnPos = position(id);
    nodes.push({
      id: fnNodeId(id),
      type: "function",
      position: fnPos,
      data: { functionMeta: fn },
    } as AppNode);
    nodeIdByObj.set(id, fnNodeId(id));
    fnCalls.push({ id, fn, parsed });

    // Each non-source arg becomes its own `preset` input node wired into the function's arg handle,
    // so the value is visible on the canvas rather than hidden in node data.
    const schemaByArg = new Map(fn.args.map(([name, schema]) => [name, schema]));
    let presetIdx = 0;
    for (const [name, value] of Object.entries(parsed.args)) {
      if (srcArgs.has(name)) continue;
      if (isEmptyPresetValue(value)) continue; // don't clutter the canvas with no-op config
      const pid = presetNodeId(id, name);
      const schema = schemaByArg.get(name);
      const argType =
        (schema?.["x-registry-ref"] as string | undefined) ??
        (typeof schema?.type === "string" ? schema.type : undefined);
      nodes.push({
        id: pid,
        type: "preset",
        position: { x: fnPos.x - 260, y: fnPos.y + presetIdx * 90 - 40 },
        data: { value, argType, label: name },
      } as AppNode);
      edges.push({
        id: `lin-e-${pid}-${fnNodeId(id)}-${name}`,
        source: pid,
        target: fnNodeId(id),
        sourceHandle: "output",
        targetHandle: name,
      });
      presetIdx++;
    }
  }

  // Pass B: wire source-arg edges using the node ids created in pass A; a source with no node
  // (unresolved id or unreachable) is skipped rather than pointing at a nonexistent node.
  for (const { id, fn, parsed } of fnCalls) {
    for (const name of sourceArgNames(fn)) {
      const srcId = parsed.args[name];
      if (typeof srcId !== "string") continue;
      const sourceNode = nodeIdByObj.get(srcId);
      if (!sourceNode) continue;
      edges.push({
        id: `lin-e-${sourceNode}-${fnNodeId(id)}-${name}`,
        source: sourceNode,
        target: fnNodeId(id),
        sourceHandle: "output",
        targetHandle: name,
      });
    }
  }

  return { nodes, edges, warnings };
}
