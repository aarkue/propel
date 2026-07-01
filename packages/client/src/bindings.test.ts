import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const generated = readFileSync(join(here, "bindings.generated.ts"), "utf8");

describe("generated bindings", () => {
  it("declares the typed Bindings map + dispatch type", () => {
    expect(generated).toContain("export interface Bindings");
    expect(generated).toContain("export type CallBinding");
  });

  it("includes a known app binding", () => {
    expect(generated).toContain("app_bindings::event_log::get_activity_counts");
  });

  it("emits branded handle types", () => {
    expect(generated).toContain("export type EventLogHandle = Handle<");
  });

  it("has no untyped tuple leftovers (schemars prefixItems -> draft-07 items fix)", () => {
    // Rust tuples must render as e.g. `[string, number]`, never `[unknown, unknown]`.
    expect(generated).not.toContain("[unknown, unknown]");
  });

  it("leaks no `RootTn` placeholders (tuples inlined + bare $refs resolved)", () => {
    expect(generated).not.toMatch(/\bRootT\d+\b/);
  });

  it("has no swallowed compile failures (codegen fails loud, $defs threaded)", () => {
    // A failed compile would emit `export type X = unknown; // compile failed: ...`.
    expect(generated).not.toContain("compile failed");
    expect(generated).not.toContain("= unknown");
  });

  it("emits the return-type contract for rename-safe viewer matching", () => {
    expect(generated).toContain("export const RETURN_TYPES");
    expect(generated).toContain("export type ReturnTypeTitle");
    expect(generated).toContain("export const BINDING_RETURN_TYPE");
    // A known binding maps to its known return-type title.
    expect(generated).toMatch(/"app_bindings::event_log::get_activity_counts":\s*"[A-Za-z0-9_]+"/);
  });
});
