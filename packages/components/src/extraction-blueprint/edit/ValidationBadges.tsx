// Groups `extraction_validate`'s `ValidationError[]` by the node or mapping it names, so
// `BlueprintGraph` can render a count badge on the right node (`nodes/*`'s `errorCount` prop) and
// `MappingPanel` can render one on the right mapping row. Every variant carries either a node id,
// a mapping reference, or both -- confirmed reading `validate.rs` -- except three that carry
// neither (`UnsupportedVersion`, `InvalidRegex`, `InvalidTemplate`): those go in `globalErrors`,
// rendered as a top-level banner instead of a per-node badge.
import type { EditorNode } from "../model";
import type { ValidationError } from "../types";

export interface GroupedErrors {
  byNode: Map<string, ValidationError[]>;
  byMapping: Map<string, ValidationError[]>;
  global: ValidationError[];
}

/** `nodes` is needed only to resolve `UnknownSource`/`UnknownTable` (which name a `source_id`/
 *  `table`, not a node id directly) back to the `Source` node(s) that reference them. */
export function groupValidationErrors(errors: ValidationError[], nodes: EditorNode[]): GroupedErrors {
  const byNode = new Map<string, ValidationError[]>();
  const byMapping = new Map<string, ValidationError[]>();
  const global: ValidationError[] = [];

  const addNode = (id: string, e: ValidationError) => {
    const list = byNode.get(id);
    if (list) list.push(e);
    else byNode.set(id, [e]);
  };
  const addMapping = (ref: string, e: ValidationError) => {
    const list = byMapping.get(ref);
    if (list) list.push(e);
    else byMapping.set(ref, [e]);
  };

  for (const e of errors) {
    switch (e.type) {
      case "duplicate-node-id":
        addNode(e.id, e);
        break;
      case "unknown-node-ref":
        addNode(e.from, e);
        break;
      case "node-cycle":
        addNode(e.id, e);
        break;
      case "unknown-column":
        addNode(e.node, e);
        break;
      case "empty-union":
        addNode(e.node, e);
        break;
      case "unknown-source":
        for (const n of nodes) if (n.op.type === "source" && n.op.source_id === e.source_id) addNode(n.id, e);
        break;
      case "unknown-table":
        for (const n of nodes)
          if (n.op.type === "source" && n.op.source_id === e.source_id && n.op.table === e.table)
            addNode(n.id, e);
        break;
      case "missing-type-for-prefixing":
        addMapping(e.mapping, e);
        break;
      case "missing-type-for-create":
        addMapping(e.mapping, e);
        break;
      case "unsupported-version":
      case "invalid-regex":
      case "invalid-template":
        global.push(e);
        break;
    }
  }
  return { byNode, byMapping, global };
}

/** Human-readable one-liner for a `ValidationError`, for tooltips/lists. */
export function describeValidationError(e: ValidationError): string {
  switch (e.type) {
    case "unsupported-version":
      return `Blueprint version ${e.found} is newer than the supported version ${e.supported}.`;
    case "duplicate-node-id":
      return `Duplicate node id "${e.id}".`;
    case "unknown-node-ref":
      return `"${e.from}" refers to unknown node "${e.id}".`;
    case "node-cycle":
      return `Node "${e.id}" participates in a cycle.`;
    case "unknown-source":
      return `Unknown source "${e.source_id}".`;
    case "unknown-table":
      return `Unknown table "${e.table}" in source "${e.source_id}".`;
    case "unknown-column":
      return `Unknown column "${e.column}" on node "${e.node}".`;
    case "missing-type-for-prefixing":
      return `"${e.mapping}" / ${e.endpoint}: type required under type-prefixed id rendering.`;
    case "missing-type-for-create":
      return `"${e.mapping}" / ${e.endpoint}: type required to create a missing endpoint.`;
    case "empty-union":
      return `Node "${e.node}" is a Union with no inputs.`;
    case "invalid-regex":
      return `Invalid regex "${e.pattern}": ${e.message}`;
    case "invalid-template":
      return `Invalid template "${e.template}": ${e.reason}`;
  }
}
