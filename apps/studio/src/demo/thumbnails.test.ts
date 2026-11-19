import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { thumbName } from "../shell/thumbs";

// `pnpm thumbnails` writes one thumbnail per picker panel and theme; a panel added to the picker
// without one, or one left behind by a removed panel, fails here. The registry pulls in browser-only
// modules, so the picker's panels are read from the sources.
const SRC = join(__dirname, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

const listed = [...read("shell/analyses.tsx").matchAll(/\{ type: "([^"]+)", about:/g)].map((m) => m[1]);
const tabbed = read("panels/tabbed.tsx");
const groups = [...tabbed.matchAll(/type: "(group:[^"]+)"/g)].map((m) => m[1]);
const members = new Set([...tabbed.matchAll(/panel: "([^"]+)"/g)].map((m) => m[1]));
const replaced = new Set(
  [...(tabbed.match(/REPLACED = new Set\(\[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]),
);
/** Every view module's type, unless it is hidden, replaced or only a tab of a tabbed panel. */
const views = readdirSync(join(SRC, "vis"))
  .filter((f) => /^[^_].*\.tsx$/.test(f) && !f.includes(".test."))
  .map((f) => read(`vis/${f}`))
  .filter((s) => !/^\s{2}hidden: true,$/m.test(s))
  .flatMap((s) => [...s.matchAll(/^\s{2}type: "([^"]+)",$/gm)].map((m) => m[1]))
  .filter((t) => !members.has(t) && !replaced.has(t));
const panels = [...new Set([...listed, ...groups, ...views])];
const expected = panels.flatMap((t) => [thumbName(t, false), thumbName(t, true)]);
const files = new Set(readdirSync(join(SRC, "assets/thumbs")).filter((f) => f.endsWith(".webp")));

describe("panel picker thumbnails", () => {
  it("cover the picker", () => {
    expect(listed.length).toBeGreaterThan(30);
    expect(panels).toContain("dfg");
  });

  it("exist for every panel (run `pnpm thumbnails <panel>`)", () => {
    expect(expected.filter((f) => !files.has(f))).toEqual([]);
  });

  it("belong to a panel", () => {
    expect([...files].filter((f) => !expected.includes(f))).toEqual([]);
  });
});
