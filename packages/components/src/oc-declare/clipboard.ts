import type { OCDeclareArc } from "./index";
import type { DeclareEdge, DeclareNode } from "./model";

export const CLIPBOARD_MIME = "application/json+oc-declare-flow";

export type Selection = { nodes: DeclareNode[]; edges: DeclareEdge[] };

export function serializeSelection(sel: Selection): string {
  return JSON.stringify(sel);
}

/** Parse clipboard text: a `{nodes,edges}` selection, or a plain `OCDeclareArc[]` array. Invalid JSON/shape -> null. */
export function parseClipboard(text: string): Selection | { arcs: OCDeclareArc[] } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) return { arcs: parsed as OCDeclareArc[] };
  if (parsed && typeof parsed === "object" && "nodes" in parsed && "edges" in parsed) {
    return parsed as Selection;
  }
  return null;
}
