// Generate TS types for the extraction-blueprint model from a schemars JSON Schema dump.
//
// Input:  ./extraction-blueprint.schema.json (produced by gen-extraction-blueprint-schema-rs,
//         see that folder's README -- dump { defs: {...}, roots: {...} } from `schemars` against
//         Blueprint/ExtractionCatalog/ValidationError and everything reachable from them)
// Output: ../src/extraction-blueprint/model.generated.ts
//
// This is the same json-schema-to-typescript pipeline packages/client/gen/gen.mjs already uses
// for propel's engine bindings (schemars -> JSON Schema -> TS), scoped down for a package that
// must not depend on @r4pm/client: this script's only external input is a JSON file checked into
// this repo, not a running engine. See ../src/extraction-blueprint/model.generated.ts's own
// header and the package README for why this exists instead of hand-mirrored types.
import { compile } from "json-schema-to-typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const { defs: rawDefs, roots } = JSON.parse(
  readFileSync(join(here, "extraction-blueprint.schema.json"), "utf8"),
);

// `MappingEntry::Single(Mapping)` is an internally-tagged *newtype* variant: serde flattens it, so
// its JSON is Mapping's own fields plus an injected `"type":"single"`, and schemars represents
// that faithfully as `{"$ref": "#/$defs/Mapping", "properties": {"type": {"const": "single"}},
// "required": ["type"]}` -- a $ref with sibling keywords, which JSON Schema 2020-12 says apply
// *simultaneously* with the referenced schema. json-schema-to-typescript follows the older
// draft-07 rule instead (siblings next to $ref are ignored), so left as-is it silently drops the
// "single" tag, producing a `MappingEntry` union whose first arm has no discriminant at all --
// exactly the kind of dropped-field bug this codegen exists to prevent by construction. Resolve
// these by hand: replace `{$ref, properties, required}` with the referenced def's own shape,
// merged with the sibling `properties`/`required`. Only triggers on a *structural* sibling
// (properties/required), not the plain `{$ref, description}` decoration that appears throughout
// this schema and which jsts already handles correctly.
function resolveRefSiblings(node) {
  if (Array.isArray(node)) return node.map(resolveRefSiblings);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = resolveRefSiblings(v);
    const structural = ["properties", "required"].some((k) => k in out);
    if (typeof out.$ref === "string" && structural) {
      const m = out.$ref.match(/^#\/\$defs\/(.+)$/);
      const target = m && rawDefs[m[1]];
      if (target) {
        const merged = { ...target, ...out };
        delete merged.$ref;
        merged.properties = { ...(target.properties ?? {}), ...(out.properties ?? {}) };
        merged.required = [...new Set([...(target.required ?? []), ...(out.required ?? [])])];
        return merged;
      }
    }
    return out;
  }
  return node;
}
const defs = Object.fromEntries(Object.entries(rawDefs).map(([k, v]) => [k, resolveRefSiblings(v)]));

// json-schema-to-typescript resolves draft-07 `definitions`/`#/definitions/...` but not
// JSON-Schema-2020-12 `$defs`/`#/$defs/...`. Normalize so the schemars-emitted 2020-12 schema
// compiles to real types instead of degrading to `unknown`. Also down-convert 2020-12
// `prefixItems` (Rust tuples, e.g. `(String, String)`) to draft-07 array-form `items`, which jsts
// renders as a proper tuple (`[string, string]`) instead of `[unknown, unknown]`.
// Adapted from packages/client/gen/normalize.mjs (same transform, duplicated rather than
// depended-on so this package's codegen has no runtime or dev dependency on @r4pm/client's
// package boundary).
function normalizeDefs(node) {
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

const JSTS_OPTS = {
  bannerComment: "",
  declareExternallyReferenced: true,
  additionalProperties: false,
  format: false,
};

// json-schema-to-typescript (15.0.4) stack-overflows compiling a schema that references itself
// through a tagged union (e.g. Predicate::And { conditions: Vec<Predicate> }), regardless of how
// the root is framed (inline spread, $ref pointer, or a synthetic wrapper referencing every type
// at once) -- verified empirically, not assumed: isolated single-self-reference recursion
// (ValueExpression::Coalesce { parts: Vec<ValueExpression> }) compiles fine, but Predicate's three
// self-referencing variants (And/Or/Not) never terminate. This also breaks every type that
// reaches Predicate transitively (NodeOp, Node, Mapping, MappingEntry, Blueprint), since jsts
// re-walks the whole reachable graph per root compile.
//
// Workaround: before compiling, replace every $ref to a self-recursive type (wherever it occurs
// -- inside the type itself, and at every external call site like NodeOp::Filter's condition)
// with a trivial non-recursive placeholder def, so the schema jsts sees is finite. After
// compiling, delete the placeholder's own declaration and rewrite every occurrence of its
// name/literal value back to the real type name -- a text-level patch, not a semantic one: the
// compiled field shapes are all still exactly what jsts derived from the real schema, only the
// recursive edge itself is stitched back in after the fact.
const SELF_RECURSIVE_TYPES = ["Predicate"];
const RECURSION_TOKEN = "SelfRecursivePlaceholderXYZ123";

function breakSelfRef(node, targetRef, placeholderRef) {
  if (Array.isArray(node)) return node.map((n) => breakSelfRef(n, targetRef, placeholderRef));
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && v === targetRef) out.$ref = placeholderRef;
      else out[k] = breakSelfRef(v, targetRef, placeholderRef);
    }
    return out;
  }
  return node;
}

const patchedDefs = JSON.parse(JSON.stringify(defs));
for (const name of SELF_RECURSIVE_TYPES) {
  const placeholderName = `${name}SelfRefPlaceholder`;
  patchedDefs[placeholderName] = { type: "string", enum: [RECURSION_TOKEN] };
  for (const k of Object.keys(patchedDefs)) {
    if (k === placeholderName) continue;
    patchedDefs[k] = breakSelfRef(patchedDefs[k], `#/$defs/${name}`, `#/$defs/${placeholderName}`);
  }
}

// Extract each top-level `export interface NAME { ... }` / `export type NAME = ...` declaration
// from a compiled chunk of output by bracket-balance (not line splitting): `format: false` means
// every closing brace sits at column 0 regardless of nesting depth, so a naive "next line that is
// just `}`" split is ambiguous. Balance-scanning from the first `{`/`(`/`[` after the header to
// its matching close is depth-correct regardless of formatting, and -- as a side effect -- drops
// the dangling next-declaration's doc comment that a naive `\n(?=export )` split leaves attached
// to the end of the previous block.
const declHeaderRe = /export\s+(?:interface|type)\s+([A-Za-z0-9_]+)/g;
function extractDeclarations(text) {
  const matches = [...text.matchAll(declHeaderRe)];
  const out = [];
  for (let idx = 0; idx < matches.length; idx++) {
    const m = matches[idx];
    const name = m[1];
    // Bound the search for an opening bracket at the next declaration's own header: a bare
    // literal-union alias with no braces/parens of its own (e.g. a single-variant enum,
    // `export type SqlDialect = "DuckDb"`) would otherwise have this loop walk straight into
    // the *next* declaration's brackets, swallowing its doc comment and body into this one's
    // "core" and leaving the next entry duplicated (once whole, once headerless and undocumented).
    const nextStart = idx + 1 < matches.length ? matches[idx + 1].index : text.length;
    let i = m.index + m[0].length;
    while (i < nextStart && !"{([".includes(text[i])) i++;
    let end = nextStart;
    if (i < nextStart) {
      let depth = 0;
      end = text.length;
      for (; i < text.length; i++) {
        if ("{([".includes(text[i])) depth++;
        else if ("})]".includes(text[i])) {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
    }
    out.push({ name, core: text.slice(m.index, end).trim() });
  }
  return out;
}

// Every root name is already a real Rust type name (not a synthetic/anonymous schema like
// packages/client's binding args/returns), so no RootTn placeholder + rename pass is needed:
// compiling each root with the full $defs pool attached makes jsts emit one named
// interface/type per referenced def, keyed by its $defs name directly.
const declByName = new Map();
const failures = [];
const rootNames = Object.keys(roots).sort();
for (const name of rootNames) {
  const schema = { ...patchedDefs[name], $defs: patchedDefs, title: name };
  let out;
  try {
    out = await compile(normalizeDefs(schema), name, JSTS_OPTS);
  } catch (e) {
    failures.push({ name, error: e.message });
    continue;
  }
  for (const { name: declName, core } of extractDeclarations(out)) {
    if (!declByName.has(declName)) declByName.set(declName, core);
  }
}

// jsts sometimes emits the same $defs entry under several numbered names within one compile call
// (e.g. `Target`'s `O2O`/`E2O` variants each referencing `ObjectEndpoint` independently produced
// `ObjectEndpoint`, `ObjectEndpoint1`, `ObjectEndpoint2`) -- structurally identical types with
// different names, not a correctness bug (TypeScript's structural typing accepts any of them
// interchangeably) but needless duplication in a file meant to be read. Collapse: group
// declarations by body content with the name masked out; within each group, prefer a name with no
// trailing digit suffix (real Rust type names never end in a bare digit) as canonical, then
// rewrite every reference to the others.
{
  const groups = new Map(); // signature -> canonical name
  const rename = new Map(); // dropped name -> canonical name
  for (const [name, core] of declByName) {
    const sig = core.replace(new RegExp(`\\b${name}\\b`, "g"), "");
    const existing = groups.get(sig);
    if (existing === undefined) {
      groups.set(sig, name);
      continue;
    }
    const suffixed = /\d+$/;
    const preferExisting = !suffixed.test(existing) || suffixed.test(name);
    const canonical = preferExisting ? existing : name;
    const dropped = preferExisting ? name : existing;
    if (!preferExisting) groups.set(sig, name);
    rename.set(dropped, canonical);
    declByName.delete(dropped);
  }
  if (rename.size > 0) {
    for (const [name, core] of declByName) {
      let next = core;
      for (const [dropped, canonical] of rename) {
        next = next.replace(new RegExp(`\\b${dropped}\\b`, "g"), canonical);
      }
      if (next !== core) declByName.set(name, next);
    }
  }
}

// Undo the placeholder patch: drop its own declaration, then rewrite every reference back to the
// real (self-recursive) type name -- both the named-reference form (XSelfRefPlaceholder[]) and
// the inlined single-literal form jsts produces for a lone-field reference (condition: "<token>"
// instead of naming it, since a one-value enum is small enough that jsts inlines it).
for (const name of SELF_RECURSIVE_TYPES) {
  const placeholderName = `${name}SelfRefPlaceholder`;
  declByName.delete(placeholderName);
  const wordRe = new RegExp(`\\b${placeholderName}\\b`, "g");
  const tokenRe = new RegExp(`"${RECURSION_TOKEN}"`, "g");
  for (const [k, v] of declByName) {
    declByName.set(k, v.replace(wordRe, name).replace(tokenRe, name));
  }
}

// Stable order: the schemars-derivation order (root iteration is alphabetical above; declaration
// order within `declByName` follows first-discovery, which is deterministic given that).
const body = [...declByName.values()].join("\n\n");

const output = `// AUTO-GENERATED by scripts/gen-extraction-blueprint-types.mjs from
// scripts/extraction-blueprint.schema.json (a schemars dump of rust4pm's
// process_mining::core::event_data::object_centric::extraction model). Do not edit by hand --
// regenerate per scripts/gen-extraction-blueprint-schema-rs/README.md.
//
// This package intentionally does not depend on @r4pm/client (see dfg/index.tsx,
// oc-declare/index.tsx for the established precedent), so these types are generated straight
// from the Rust model's JSON Schema instead of imported from generated client bindings or
// hand-mirrored. Every serde-tagged shape here uses the Rust side's
// #[serde(tag = "type", rename_all = "kebab-case")] convention.

${body}
`;

writeFileSync(join(here, "..", "src", "extraction-blueprint", "model.generated.ts"), output);
console.log(`model.generated.ts: ${rootNames.length} roots, ${declByName.size} types emitted`);

if (failures.length > 0) {
  console.error(`\ncodegen FAILED for ${failures.length} type(s):`);
  for (const f of failures) console.error(`  - ${f.name}: ${f.error}`);
  process.exitCode = 1;
}
