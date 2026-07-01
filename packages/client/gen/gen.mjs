// Generate TS types from engine binding metadata (schemars JSON Schema).
// Input:  ./gen/bindings-meta.json  (dump of list_functions_meta())
// Output: ./src/bindings.generated.ts
import { compile } from "json-schema-to-typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizeDefs } from "./normalize.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const metas = JSON.parse(readFileSync(join(pkg, "gen/bindings-meta.json"), "utf8"));

const JSTS_OPTS = {
  bannerComment: "",
  declareExternallyReferenced: true,
  additionalProperties: false,
  format: false,
};

const handleRefs = new Set();
const namedRoots = []; // { schema, title }
const titleToRoot = new Map(); // dedup identical types by schemars title

const sanitize = (s) => s.replace(/[^A-Za-z0-9_]/g, "_");

// Roots are compiled under stable `RootT{n}` placeholders (json-schema-to-typescript
// leaves these untouched, unlike titles which it normalizes). After generation we
// rename each placeholder to its readable schemars title in a post-process pass.
function registerRoot(schema, defs) {
  const title = schema.title;
  if (title && titleToRoot.has(title)) return titleToRoot.get(title);
  // Carry the ambient `$defs` so nested `$ref`s still resolve when this root is compiled
  // in isolation (it may have been lifted out of an ancestor that owned the `$defs`).
  const stored = defs && !schema.$defs ? { ...schema, $defs: defs } : schema;
  const name = `RootT${namedRoots.length}`;
  namedRoots.push({ schema: stored, title });
  if (title) titleToRoot.set(title, name);
  return name;
}

function tsType(schema, defs) {
  if (!schema || typeof schema !== "object") return "unknown";
  if (schema["x-registry-ref"]) {
    handleRefs.add(schema["x-registry-ref"]);
    return `${sanitize(schema["x-registry-ref"])}Handle`;
  }
  // Pick up a `$defs` table declared at this level; otherwise inherit the ancestor's. Threading
  // it down is what lets nested arrays / refs (e.g. `X[][]`) resolve instead of degrading to
  // `unknown` (the `$defs` only live on the top-level return schema).
  defs = schema.$defs ?? schema.definitions ?? defs;
  // Resolve a bare `$ref` against the ambient `$defs` so refs in tuples / array items / args become
  // a real type instead of an opaque `RootTn`: object targets become a named type (via registerRoot),
  // primitive newtypes (e.g. `ObjectIndex` = u32) inline to `number`.
  const ref = typeof schema.$ref === "string" && schema.$ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/);
  if (ref && defs?.[ref[1]]) {
    return tsType({ title: ref[1], ...defs[ref[1]] }, defs);
  }
  const t = schema.type;
  if (t === "integer" || t === "number") return "number";
  if (t === "string" && !schema.oneOf && !schema.enum) return "string";
  if (t === "boolean") return "boolean";
  if (t === "null") return "null";
  // Tuple (Rust `(A, B)`): 2020-12 `prefixItems` (or draft-07 array-form `items`). Inline it so
  // it renders as `[A, B]` and never leaks an unnamed `RootTn` placeholder.
  const tuple = Array.isArray(schema.prefixItems)
    ? schema.prefixItems
    : Array.isArray(schema.items)
      ? schema.items
      : null;
  if (t === "array" && tuple) {
    return `[${tuple.map((s) => tsType(s, defs)).join(", ")}]`;
  }
  if (t === "array" && schema.items && !schema.items.oneOf) {
    return `${tsType(schema.items, defs)}[]`;
  }
  return registerRoot(schema, defs);
}

const bindingEntries = [];
const retTitleById = {}; // binding id -> return-type schemars title (null when unnamed)
const titleSet = new Set();
for (const m of metas) {
  const required = new Set(m.required_args || []);
  const argParts = m.args.map(([name, schema]) => {
    const opt = required.has(name) ? "" : "?";
    return `    ${JSON.stringify(name)}${opt}: ${tsType(schema)};`;
  });
  const retTy = tsType(m.return_type);
  const argsBlock = argParts.length ? `{\n${argParts.join("\n")}\n    }` : "{}";
  bindingEntries.push(`  ${JSON.stringify(m.id)}: { args: ${argsBlock}; ret: ${retTy} };`);
  const title = m.return_type?.title ?? null;
  retTitleById[m.id] = title;
  if (title) titleSet.add(title);
}

const declByName = new Map();
const declRe = /export\s+(?:interface|type)\s+([A-Za-z0-9_]+)/;
const failures = [];
for (let idx = 0; idx < namedRoots.length; idx++) {
  const name = `RootT${idx}`;
  let out;
  try {
    out = await compile({ ...normalizeDefs(namedRoots[idx].schema), title: name }, name, JSTS_OPTS);
  } catch (e) {
    out = `export type ${name} = unknown; // compile failed: ${e.message}`;
    failures.push({ name, title: namedRoots[idx].title, error: e.message });
  }
  for (const block of out.split(/\n(?=export )/)) {
    const mm = block.match(declRe);
    if (mm && !declByName.has(mm[1])) declByName.set(mm[1], block.trim());
  }
}

// Post-process: rename `RootT{n}` placeholders to their readable schemars title.
// If a structurally-equivalent type was already emitted under its title (jsts names
// nested occurrences by title), drop the placeholder declaration and alias references
// to the existing one (dedup). References are rewritten on binding entries below.
const rootRename = new Map(); // RootTn -> readable name
for (let idx = 0; idx < namedRoots.length; idx++) {
  const root = `RootT${idx}`;
  const { title } = namedRoots[idx];
  if (!title || !declByName.has(root)) continue;
  const desired = sanitize(title);
  if (desired === root) continue;
  if (declByName.has(desired)) {
    declByName.delete(root); // twin already exists -> dedup
  } else {
    const decl = declByName
      .get(root)
      .replace(new RegExp(`(export (?:interface|type) )${root}\\b`), `$1${desired}`);
    declByName.delete(root);
    declByName.set(desired, decl);
  }
  rootRename.set(root, desired);
}

const applyRename = (s) =>
  rootRename.size === 0 ? s : s.replace(/\bRootT\d+\b/g, (m) => rootRename.get(m) ?? m);

const handleDecls = [...handleRefs]
  .sort()
  .map((r) => `export type ${sanitize(r)}Handle = Handle<${JSON.stringify(r)}>;`)
  .join("\n");

const retTitles = [...titleSet].sort();
const retTypesEntries = retTitles
  .map((t) => `  ${JSON.stringify(sanitize(t))}: ${JSON.stringify(t)},`)
  .join("\n");
const bindingRetEntries = metas
  .map(
    (m) => `  ${JSON.stringify(m.id)}: ${retTitleById[m.id] ? JSON.stringify(retTitleById[m.id]) : "null"},`,
  )
  .join("\n");

const output = `// AUTO-GENERATED from engine binding metadata. Do not edit.

/** A registry-stored object referenced by id; never the value itself. */
export type Handle<T extends string> = string & { readonly __ref: T };

${handleDecls}

${applyRename([...declByName.values()].join("\n\n"))}

export interface Bindings {
${applyRename(bindingEntries.join("\n"))}
}

export type BindingId = keyof Bindings;

/** Typed dispatch. Runtime decodes the binding's Vec<u8> JSON; types are compile-time only.
 *  \`opts.outputName\` deterministically names a minted result handle (pipeline intermediates). */
export type CallBinding = <K extends BindingId>(id: K, args: Bindings[K]["args"], opts?: { outputName?: string }) => Promise<Bindings[K]["ret"]>;

/** Distinct return-type titles, keyed for rename-safe reference from viewer \`accepts\` predicates. */
export const RETURN_TYPES = {
${retTypesEntries}
} as const;

/** Every value a binding's return type can be matched on by the viewer registry. */
export type ReturnTypeTitle = (typeof RETURN_TYPES)[keyof typeof RETURN_TYPES];

/** Each binding's return-type title (null when the return type is unnamed, e.g. a tuple/primitive). */
export const BINDING_RETURN_TYPE: Record<BindingId, ReturnTypeTitle | null> = {
${bindingRetEntries}
};
`;

writeFileSync(join(pkg, "src/bindings.generated.ts"), output);
console.log(
  `bindings.generated.ts: ${metas.length} bindings, ${declByName.size} types, ${handleRefs.size} handles, ${retTitles.length} return types`,
);

if (failures.length > 0) {
  console.error(`\ncodegen FAILED: ${failures.length} type(s) did not compile (emitted as \`unknown\`):`);
  for (const f of failures) console.error(`  - ${f.title ?? f.name}: ${f.error}`);
  process.exitCode = 1;
}
