// Generate a single Storybook MDX reference page documenting the `@r4pm/client` data types that
// viewers receive as their `data` prop. Source of truth is the schemars JSON Schema dumped in
// `@r4pm/client/gen/bindings-meta.json` (Rust types -> schemars); type and field descriptions are
// the original Rust `///` doc comments carried in the schema. Output is committed; re-run with
// `pnpm --filter @r4pm/components docs:types` when the bindings change.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const META = join(here, "../../client/gen/bindings-meta.json");
const OUT = join(here, "../src/concepts/data-types.mdx");

const metas = JSON.parse(readFileSync(META, "utf8"));

/** Render a JSON-Schema node to a short, readable TS-ish type. Named object/enum refs render as
 *  their name (so they cross-reference other rows on the page); primitives/arrays/maps inline. */
function renderType(s, defs) {
  if (!s || typeof s !== "object") return "unknown";
  if (s["x-registry-ref"]) return `${s["x-registry-ref"]}Handle`;
  defs = s.$defs ?? s.definitions ?? defs;
  const ref = typeof s.$ref === "string" && s.$ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/);
  if (ref) {
    const target = defs?.[ref[1]];
    // Object/enum targets are documented in their own row -> reference by name. Primitive newtypes
    // (e.g. ObjectIndex = u32) inline to their underlying type.
    if (target && (target.properties || target.enum || target.oneOf || target.anyOf)) return ref[1];
    return target ? renderType(target, defs) : ref[1];
  }
  if ("const" in s) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (s.oneOf || s.anyOf) return (s.oneOf ?? s.anyOf).map((x) => renderType(x, defs)).join(" | ");
  const t = s.type;
  if (Array.isArray(t)) return t.join(" | ");
  if (t === "integer" || t === "number") return "number";
  if (t === "string") return "string";
  if (t === "boolean") return "boolean";
  if (t === "null") return "null";
  if (t === "array") {
    if (Array.isArray(s.prefixItems)) return `[${s.prefixItems.map((x) => renderType(x, defs)).join(", ")}]`;
    return `${renderType(s.items, defs)}[]`;
  }
  if (t === "object") {
    if (s.additionalProperties && typeof s.additionalProperties === "object")
      return `{ [key: string]: ${renderType(s.additionalProperties, defs)} }`;
    if (s.properties)
      return `{ ${Object.entries(s.properties)
        .map(([k, v]) => `${k}: ${renderType(v, defs)}`)
        .join("; ")} }`;
    return "object";
  }
  return "unknown";
}

// Viewers render only a handful of the 100 binding return types, so documenting every return type
// (and every type they transitively reference) is overwhelming and mostly irrelevant. Scope the page
// to the return types `@r4pm/components` viewers actually receive as `data`, plus the types those
// reference (schemars already dumps each return type's full `$defs` closure, so a root pulls in
// exactly its dependencies and no dangling cross-references). Keep this list in sync with the
// viewers: each entry is the binding return-type title a viewer consumes.
// TODO: Find a way to automatically generate this list from the viewer code, or just type the viewer's props in the components themselves.
const ROOTS = new Set([
  "PetriNet", //                 petri-net, alignment-net
  "DirectlyFollowsGraph", //     dfg
  "OCDirectlyFollowsGraph", //   oc-dfg
  "OcelDfPerformance", //        dfg performance overlay (get_ocel_df_performance)
  "DottedChartData", //          dotted-chart
  "LogAlignments", //            alignment-list, alignment-net
  "FitnessResult", //            fitness
  "CaseDurations", //            case-duration
  "AggregatedEventTimestamps", //events-per-time
  "OCELTypeStats", //            ocel-count-info
  "NumberOfTracesAndEvents", //  log-summary
  "TraceVariants", //            log-variants
  "ObjectAttributeChanges", //   object-attribute-changes
  "LogGlobals", //               log-metadata card
  "Array_of_OCDeclareArc", //    oc-declare (documents OCDeclareArc + its deps)
]);

// Collect distinct documented types: object structs (own section) and named enums/unions (table).
const objects = new Map(); // name -> { desc, fields: [{name, type, required, desc}] }
const unions = new Map(); // name -> { desc, def }
const SKIP = /^(Array_of_|Nullable_|Map_of_|Tuple_of_|uint|int|double|boolean|string|null|DateTime$)/;

function consider(name, schema, defs) {
  if (!name || SKIP.test(name) || objects.has(name) || unions.has(name)) return;
  if (schema.type === "object" && schema.properties) {
    const required = new Set(schema.required ?? []);
    const fields = Object.entries(schema.properties).map(([fname, f]) => ({
      name: fname,
      type: renderType(f, defs),
      required: required.has(fname),
      desc: f.description ?? "",
    }));
    objects.set(name, { desc: schema.description ?? "", fields });
  } else if (schema.enum || schema.oneOf || schema.anyOf) {
    unions.set(name, { desc: schema.description ?? "", def: renderType(schema, defs) });
  }
}

const seenRoots = new Set();
for (const m of metas) {
  const R = m.return_type;
  if (!R || !ROOTS.has(R.title)) continue;
  seenRoots.add(R.title);
  const defs = R.$defs ?? R.definitions ?? {};
  consider(R.title, R, defs);
  for (const [k, v] of Object.entries(defs)) consider(k, { title: k, ...v }, defs);
}
for (const r of ROOTS)
  if (!seenRoots.has(r)) console.warn(`WARN: root "${r}" not found in bindings-meta.json (renamed or removed?)`);

// For backticked code columns: only the table-pipe needs escaping (content is literal in a code span).
const cell = (s) => (s ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
// For prose (descriptions, rendered as markdown): also escape MDX-significant `{`/`<` so a future Rust
// doc comment containing them can't be parsed as a JSX expression and break the page.
const prose = (s) =>
  (s ?? "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\[(`[^`]+`)\]/g, "$1") // unwrap Rust intra-doc links: [`Place`] -> `Place`
    .replace(/([<{}|])/g, "\\$1")
    .trim();
const objs = [...objects.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const uns = [...unions.entries()].sort((a, b) => a[0].localeCompare(b[0]));

const out = [];
out.push(`import { Meta } from "@storybook/addon-docs/blocks";`, "");
out.push(`<Meta title="Getting Started/Data Types" tags={["dev"]} />`, "");
out.push("# Data types", "");
out.push(
  "Reference for the typed values viewers receive as their `data` prop. Scoped to just those types " +
    "(the binding return types a viewer renders, plus what they reference) rather than every " +
    "binding. They're generated from Rust via schemars (JSON Schema) into `@r4pm/client`; the " +
    "descriptions are the original Rust doc comments. Type names in a field's type cross-reference " +
    "other entries on this page.",
  "",
  "See also [Introduction](?path=/docs/getting-started-introduction--docs) and " +
    "[Viewer Configuration](?path=/docs/getting-started-viewer-configuration--docs).",
  "",
);
out.push("> Auto-generated by `scripts/gen-data-types-doc.mjs`. Run `pnpm docs:types` to refresh; do not edit by hand.", "");

out.push("## Objects", "");
for (const [name, t] of objs) {
  out.push(`### ${name}`, "");
  if (t.desc) out.push(prose(t.desc), "");
  if (t.fields.length) {
    out.push("| Field | Type | Description |", "| --- | --- | --- |");
    for (const f of t.fields) {
      out.push(`| \`${f.name}${f.required ? "" : "?"}\` | \`${cell(f.type)}\` | ${prose(f.desc)} |`);
    }
    out.push("");
  } else {
    out.push("_(no fields)_", "");
  }
}

if (uns.length) {
  out.push("## Enums & unions", "");
  out.push("| Type | Definition | Description |", "| --- | --- | --- |");
  for (const [name, u] of uns) out.push(`| \`${name}\` | \`${cell(u.def)}\` | ${prose(u.desc)} |`);
  out.push("");
}

writeFileSync(OUT, out.join("\n"));
console.log(`wrote ${OUT}: ${objs.length} objects, ${uns.length} enums/unions`);
