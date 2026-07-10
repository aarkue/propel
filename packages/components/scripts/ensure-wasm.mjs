// Ensure the viz-layout wasm is present and embedded. Run in `prepare` (post-install) and `prebuild`
// so a fresh clone / CI produces a working package:
//   - inline module already there  -> nothing to do
//   - built .wasm present           -> (re)generate the base64 inline module
//   - nothing                       -> build from Rust (needs the Rust + wasm-pack toolchain)
//
// `prepare` runs it best-effort (`--soft`): a missing toolchain warns but does NOT fail `pnpm install`,
// so contributors who never touch layout can still install. `prebuild` runs it strict: the dist build
// is broken without the wasm, so a missing toolchain is a hard error there.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const soft = process.argv.includes("--soft");
const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, "..", "src", "rust-layout", "pkg");
const inlineJs = join(pkgDir, "wasm-inline.js");
const wasmBin = join(pkgDir, "viz_layout_wasm_bg.wasm");

if (existsSync(inlineJs) && existsSync(wasmBin)) {
  process.exit(0);
}

try {
  if (existsSync(wasmBin)) {
    const { genWasmInline } = await import("./gen-wasm-inline.mjs");
    genWasmInline();
  } else {
    console.log("[ensure-wasm] viz-layout wasm missing - building from Rust (needs Rust + wasm-pack)...");
    execFileSync("pnpm", ["run", "build:wasm"], { stdio: "inherit" });
  }
} catch (err) {
  const msg = `[ensure-wasm] could not build the viz-layout wasm: ${err?.message ?? err}`;
  if (soft) {
    console.warn(`${msg}\n[ensure-wasm] skipping (run \`pnpm --filter @r4pm/components build:wasm\` when you have the Rust toolchain).`);
    process.exit(0);
  }
  console.error(msg);
  process.exit(1);
}
