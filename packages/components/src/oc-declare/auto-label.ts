import type { OCDeclareArcLabel } from "./index";
import type { DeclareNode, EdgeTemplate } from "./model";

const isObj = (k: DeclareNode["kind"]) => k !== "activity";

/** Default template for a fresh drag-connected edge: `as` if either endpoint is an object, else `ef`. */
export function defaultTemplate(s: DeclareNode["kind"], t: DeclareNode["kind"]): EdgeTemplate {
  return isObj(s) || isObj(t) ? "as" : "ef";
}

/** Auto-derived object-type label for a fresh edge (mirrors OCPQ onConnect); see branches below. */
export function defaultConnectLabel(
  source: DeclareNode,
  target: DeclareNode,
  related: (activity: string) => Record<string, number>,
): OCDeclareArcLabel {
  const empty: OCDeclareArcLabel = { each: [], any: [], all: [] };
  if (!isObj(source.kind) && !isObj(target.kind)) {
    const s = related(source.type);
    const t = related(target.type);
    const common = Object.keys(s).filter((k) => s[k] > 0 && (t[k] ?? 0) > 0);
    return { ...empty, all: common.map((object_type) => ({ object_type, type: "Simple" })) };
  }
  if (isObj(source.kind) && isObj(target.kind)) {
    return {
      ...empty,
      any: [{ first: source.type, second: target.type, reversed: false, type: "O2O" }],
    };
  }
  const objType = isObj(source.kind) ? source.type : target.type;
  return { ...empty, any: [{ object_type: objType, type: "Simple" }] };
}
