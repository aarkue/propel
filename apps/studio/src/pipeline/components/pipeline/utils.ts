import type { ExtendedJSONSchema } from "../../BackendContext";

export const TYPE_COLORS: Record<string, string> = {
  string: "#3b82f6", // blue-500
  integer: "#10b981", // emerald-500
  number: "#10b981", // emerald-500
  boolean: "#f59e0b", // amber-500
  object: "#8b5cf6", // violet-500
  array: "#ec4899", // pink-500
  null: "#9ca3af", // gray-400
  any: "#6366f1", // indigo-500
};

export const REGISTRY_COLORS: Record<string, string> = {
  EventLog: "#ef4444", // red-500
  OCEL: "#f97316", // orange-500
  PetriNet: "#06b6d4", // cyan-500
};

/** Accepts a JSON-Schema fragment, widened so the pipeline's synthetic `"any"` type (and a plain
 *  `string` type from the primitives palette) are valid; both go through the same `TYPE_COLORS` lookup. */
export function getTypeColor(schema: { type?: string | string[]; "x-registry-ref"?: string }): string {
  if (schema["x-registry-ref"]) {
    const ref = schema["x-registry-ref"];
    // Simple hash to color if not in registry
    if (REGISTRY_COLORS[ref]) {
      return REGISTRY_COLORS[ref];
    }
    return stringToColor(ref);
  }

  if (Array.isArray(schema.type)) {
    // Union type: color by its first member.
    const firstType = schema.type[0];
    return TYPE_COLORS[String(firstType)] || TYPE_COLORS.any;
  }

  return TYPE_COLORS[String(schema.type)] || TYPE_COLORS.any;
}

function stringToColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase();
  return `#${"00000".substring(0, 6 - c.length)}${c}`;
}

export function isCompatible(
  source: ExtendedJSONSchema,
  target: ExtendedJSONSchema,
  convertible?: (from: string, to: string) => boolean,
): boolean {
  // 1. Registry references (most specific): a handle plugs into the same registry kind, or into a
  //    different kind the engine can transparently convert it to (convert-on-dispatch).
  const sRef = source["x-registry-ref"];
  const tRef = target["x-registry-ref"];
  if (sRef || tRef) {
    if (sRef === tRef) return true;
    if (sRef && tRef && convertible) return convertible(sRef, tRef);
    return false;
  }

  // 2. A "any" side (e.g. a JSON view input) accepts anything.
  const sourceTypes = Array.isArray(source.type) ? source.type : [source.type];
  const targetTypes = Array.isArray(target.type) ? target.type : [target.type];
  if (
    (sourceTypes as readonly (string | undefined)[]).includes("any") ||
    (targetTypes as readonly (string | undefined)[]).includes("any")
  )
    return true;

  // 3. Basic type must overlap.
  const typeMatch = sourceTypes.some((s) => targetTypes.includes(s));
  if (!typeMatch) return false;

  // 4. For structured types (objects/arrays/tuples), a plain "both are objects" match is far too
  //    loose: e.g. a count-map would appear connectable to a Petri-net input. When both sides name
  //    a concrete type, require the names to match; fall back to the type match for unnamed shapes.
  const structured = sourceTypes.includes("object") || sourceTypes.includes("array");
  if (structured && source.title && target.title) {
    return source.title === target.title;
  }

  return true;
}

export function getDefaultValue(schema: ExtendedJSONSchema): any {
  let type = schema.type;
  if (Array.isArray(type)) {
    type = type.find((t) => t !== "null") || "null";
  }

  if (type === "array") return [];
  if (type === "string") return "";
  if (type === "boolean") return false;
  if (type === "integer" || type === "number") return 0;
  if (type === "object") return {};
  return null;
}
