// Build engine/viz-wasm into src/viz/pkg and embed it. The size settings go through cargo's env
// overrides: the engine workspace's release profile ignores per-crate `lto`/`panic`, and wasm-pack
// has no flag for a custom profile.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { genWasmInline } from "./gen-wasm-inline.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");

execFileSync(
  "wasm-pack",
  [
    "build",
    join(root, "engine", "viz-wasm"),
    "--target",
    "web",
    "--out-dir",
    join(root, "packages", "components", "src", "viz", "pkg"),
    "--out-name",
    "viz_wasm",
    "--release",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CARGO_PROFILE_RELEASE_OPT_LEVEL: "z",
      CARGO_PROFILE_RELEASE_LTO: "true",
      CARGO_PROFILE_RELEASE_CODEGEN_UNITS: "1",
      CARGO_PROFILE_RELEASE_PANIC: "abort",
    },
  },
);
genWasmInline();
