import type { ExtendedJSONSchema } from "../../../BackendContext";
import { resolveSchema } from "./schema-catalog";
import type { AppNode } from "./types";

const PRIMITIVES = ["string", "integer", "number", "boolean"] as const;
type Primitive = (typeof PRIMITIVES)[number];

/** The single non-null primitive type of `schema`, e.g., `integer` for `["integer", "null"]`. */
function primitiveOf(schema: ExtendedJSONSchema): Primitive | undefined {
  const types = (Array.isArray(schema.type) ? schema.type : [schema.type]).filter((t) => t && t !== "null");
  const t = types.length === 1 ? types[0] : undefined;
  return PRIMITIVES.find((p) => p === t);
}

/** A short text for an argument's default, e.g., `0.2`, `"middle"`, `none`, `{kind: log, ...}`. */
export function summarizeDefault(v: unknown, max = 28): string {
  let s: string;
  if (v === null || v === undefined) s = "none";
  else if (typeof v === "string") s = `"${v}"`;
  else if (Array.isArray(v)) s = v.length === 0 ? "[]" : `[${v.length} items]`;
  else if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    // A variant tag names the choice best, then any set scalar.
    const shown =
      entries.find(([k, x]) => (k === "kind" || k === "type") && typeof x === "string") ??
      entries.find(([, x]) => x !== null && typeof x !== "object");
    if (entries.length === 0) s = "{}";
    else if (!shown) s = `{${entries.length} fields}`;
    else s = `{${shown[0]}: ${String(shown[1])}${entries.length > 1 ? ", ..." : ""}}`;
  } else s = String(v);
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

/** The node that feeds argument `argName` of type `schema`, holding the schema's default where
 *  there is one: an object picker for a registry item, a primitive or enum input, and otherwise
 *  a JSON config node. */
export function inputNodeForArg(
  rawSchema: ExtendedJSONSchema,
  argName: string,
  position: { x: number; y: number },
  id: string,
): AppNode {
  const schema = resolveSchema(rawSchema, rawSchema.$defs ?? {});
  // Resolving a `$ref` replaces the schema, so the default at the reference itself comes first.
  const fallback = rawSchema.default ?? schema.default;
  const ref = schema["x-registry-ref"];
  if (ref) {
    return { id, type: "object", position, data: { type: ref, selectedObject: undefined } };
  }
  if (schema.oneOf?.length && schema.oneOf.every((o) => typeof o === "object" && "const" in o)) {
    return {
      id,
      type: "struct",
      position,
      data: { name: schema.title ?? argName, schema, value: fallback ?? undefined },
    };
  }
  const primitive = primitiveOf(schema);
  if (primitive && !schema.enum) {
    const value = fallback ?? (primitive === "boolean" ? false : undefined);
    return { id, type: "primitive", position, data: { type: primitive, value } };
  }
  if (fallback === undefined && schema.properties) {
    return { id, type: "struct", position, data: { name: schema.title ?? argName, schema } };
  }
  return {
    id,
    type: "preset",
    position,
    data: { value: fallback ?? null, argType: schema.title, label: argName },
  };
}
