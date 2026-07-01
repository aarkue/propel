// json-schema-to-typescript resolves draft-07 `definitions`/`#/definitions/...` but not
// JSON-Schema-2020-12 `$defs`/`#/$defs/...`. Normalize so 2020-12 schemas (e.g. OCDeclareArc)
// compile to real types instead of degrading to `unknown`. We also down-convert 2020-12
// `prefixItems` (Rust tuples, e.g. `(String, usize)`) to draft-07 array-form `items`, which
// jsts renders as proper tuples (`[string, number]`) instead of `[unknown, unknown]`.
export function normalizeDefs(node) {
  if (Array.isArray(node)) return node.map(normalizeDefs);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "$defs") out.definitions = normalizeDefs(v);
      else if (k === "$ref" && typeof v === "string") out.$ref = v.replace("#/$defs/", "#/definitions/");
      else if (k === "prefixItems" && !("items" in node)) out.items = normalizeDefs(v);
      else out[k] = normalizeDefs(v);
    }
    return out;
  }
  return node;
}
