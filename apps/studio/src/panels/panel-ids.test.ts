import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Panel ids are persisted in saved layouts and referenced by string across the studio, so a rename
// or typo must fail here instead of silently opening nothing.
const SRC = join(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

const sources = files(SRC).map((p) => ({ p, s: readFileSync(p, "utf8") }));

/** `type: "..."` of every view module in vis/ (the registry globs `vis/*.tsx`, skipping `_*`). */
const registered = new Set(
  sources
    .filter(({ p }) => /[\\/]vis[\\/][^_\\/][^\\/]*\.tsx$/.test(p))
    .flatMap(({ s }) => [...s.matchAll(/^\s{2}type: "([^"]+)",$/gm)].map((m) => m[1])),
);

/** Tabbed panels register their own `group:` types. */
for (const { s } of sources.filter(({ p }) => p.endsWith("tabbed.tsx")))
  for (const m of s.matchAll(/type: "(group:[^"]+)"/g)) registered.add(m[1]);

const referenced = sources.flatMap(({ p, s }) =>
  [
    ...s.matchAll(/addPanelToDockview\(\s*"([^"]+)"/g),
    ...s.matchAll(/component: "([^"]+)"/g),
    // The views of tabbed panels and of analysis layouts, and the picker's entries.
    ...s.matchAll(/panel: "([^"]+)"/g),
    ...s.matchAll(/\{ type: "([^"]+)", about:/g),
  ]
    .map((m) => ({ p: p.slice(SRC.length + 1), id: m[1] }))
    .filter((r) => !r.id.includes("${")),
);

/** Views a component library board links to by id (the OCEL overview's `OcelOverviewTarget`). */
const overviewTargets = (() => {
  const s = readFileSync(join(SRC, "../../../packages/components/src/overview/ocel-overview.tsx"), "utf8");
  const union = s.match(/export type OcelOverviewTarget =([^;]+);/)?.[1] ?? "";
  return [...union.matchAll(/"([^"]+)"/g)].map((m) => ({ p: "OcelOverviewTarget", id: m[1] }));
})();

describe("panel ids", () => {
  it("finds the registered views", () => {
    expect(registered.size).toBeGreaterThan(30);
    expect(registered.has("dfg")).toBe(true);
  });

  it("include the picker's entries", () => {
    expect(referenced.filter((r) => r.p.endsWith("analyses.tsx")).length).toBeGreaterThan(30);
  });

  it("are only referenced when a view registers them", () => {
    const unknown = [...referenced, ...overviewTargets].filter((r) => !registered.has(r.id));
    expect(unknown).toEqual([]);
  });

  it("are unique", () => {
    const all = sources
      .filter(({ p }) => /[\\/]vis[\\/][^_\\/][^\\/]*\.tsx$/.test(p))
      .flatMap(({ s }) => [...s.matchAll(/^\s{2}type: "([^"]+)",$/gm)].map((m) => m[1]));
    expect(all.length).toBe(new Set(all).size);
  });
});
