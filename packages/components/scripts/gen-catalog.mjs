// Regenerate the component catalog embedded in the docs: the sizing table on the "Sizing & Layout"
// Storybook page and the component/export tables in `llms.txt`. Source of truth is the stories
// themselves -- each story declares the component it documents, the entry point it imports from, and
// (via `parameters.frame`) whether it needs a sized parent -- plus the `useRegisterExport` call sites.
//
// Only the regions between `@generated:<id>` and `@end` markers are rewritten; the surrounding prose
// is hand-written. Re-run with `pnpm --filter @r4pm/components docs:types`.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const SRC = join(pkg, "src");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(SRC);
const storyFiles = files.filter((f) => f.endsWith(".stories.tsx") || f.endsWith(".stories.ts"));

// Stories under these directories import their subject relatively; map the directory to its entry.
const DIR_ENTRY = [
  ["src/ui/", "@r4pm/components/ui"],
  ["src/charts/", "@r4pm/components/charts"],
  ["src/extraction-blueprint/", "@r4pm/components/extraction-blueprint"],
];

/** The `@r4pm/components[/sub]` specifier a story imports `name` from, or the root entry. */
function entryFor(src, name, file) {
  for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"(@r4pm\/components[^"]*)"/g)) {
    const named = m[1].split(",").map((s) => s.replace(/\btype\b/, "").trim());
    if (named.includes(name)) return m[2];
  }
  const rel = relative(pkg, file).replaceAll("\\", "/");
  return DIR_ENTRY.find(([dir]) => rel.startsWith(dir))?.[1] ?? "@r4pm/components";
}

const SIZING = {
  canvas: "fills parent",
  pad: "content-sized",
};

const components = [];
for (const file of storyFiles) {
  const src = readFileSync(file, "utf8");
  const title = src.match(/title:\s*"([^"]+)"/)?.[1];
  const name = src.match(/^\s*component:\s*([A-Za-z0-9_]+)\s*,/m)?.[1];
  if (!title || !name) continue;
  const mode = src.match(/frame:\s*\{\s*mode:\s*"(\w+)"/)?.[1] ?? "pad";
  const [group, ...rest] = title.split("/");
  components.push({
    group,
    label: rest.join("/"),
    name,
    entry: entryFor(src, name, file),
    sizing: SIZING[mode] ?? "content-sized",
    docs: `?path=/docs/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}--docs`,
  });
}

// "Getting Started" holds concept pages, not components.
const GROUP_ORDER = ["Viewers", "Editors", "Inputs & Primitives"];
components.sort(
  (a, b) =>
    GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.label.localeCompare(b.label),
);
const cataloged = components.filter((c) => GROUP_ORDER.includes(c.group));

/** Every `useRegisterExport` call site: its literal key and whether an `exportKey` prop overrides it. */
const exportKeys = [];
for (const file of files) {
  if (!/\.tsx?$/.test(file) || file.includes(".stories.")) continue;
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/useRegisterExport\(\s*(?:([\w.]+)\s*\?\?\s*)?"([^"]+)"/g)) {
    exportKeys.push({
      key: m[2],
      overridable: Boolean(m[1]),
      file: relative(pkg, file).replaceAll("\\", "/"),
    });
  }
}
exportKeys.sort((a, b) => a.key.localeCompare(b.key));

const BLOCKS = {
  "sizing-table": () =>
    [
      "| Page | Component | Import from | Sizing |",
      "| --- | --- | --- | --- |",
      ...cataloged.map(
        (c) => `| [${c.label}](${c.docs}) | \`${c.name}\` | \`${c.entry}\` | ${c.sizing} |`,
      ),
    ].join("\n"),

  "components-table": () =>
    [
      "| Component | Import from | Group | Sizing | Docs page |",
      "| --- | --- | --- | --- | --- |",
      ...cataloged.map(
        (c) => `| \`${c.name}\` | \`${c.entry}\` | ${c.group} | ${c.sizing} | ${c.label} |`,
      ),
    ].join("\n"),

  "export-keys": () =>
    [
      "| Registry key | `exportKey` prop overrides it | Source |",
      "| --- | --- | --- |",
      ...exportKeys.map((e) => `| \`${e.key}\` | ${e.overridable ? "yes" : "no"} | \`${e.file}\` |`),
    ].join("\n"),
};

// Rewrite every `@generated:<id>` .. `@end` region; accepts MDX braces-comment and HTML markers.
function applyBlocks(text, path) {
  let out = text;
  for (const [id, render] of Object.entries(BLOCKS)) {
    const re = new RegExp(
      `((?:\\{/\\*|<!--)\\s*@generated:${id}\\s*(?:\\*/\\}|-->))[\\s\\S]*?((?:\\{/\\*|<!--)\\s*@end\\s*(?:\\*/\\}|-->))`,
    );
    if (!re.test(out)) continue;
    out = out.replace(re, `$1\n\n${render()}\n\n$2`);
  }
  writeFileSync(path, out);
}

for (const rel of ["src/concepts/sizing.mdx", "llms.txt"]) {
  const path = join(pkg, rel);
  applyBlocks(readFileSync(path, "utf8"), path);
  console.log(`wrote ${rel}`);
}
console.log(`${cataloged.length} components, ${exportKeys.length} export sources`);
