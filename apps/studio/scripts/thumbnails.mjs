#!/usr/bin/env node
// Captures the panel picker's thumbnails: every panel in its demo state (src/demo/panel-demos.ts) on
// the bundled samples, in light and dark, into src/assets/thumbs.
//
//   pnpm thumbnails                 capture all
//   pnpm thumbnails dfg ocdfg       capture some
//   pnpm thumbnails --check [...]   capture and compare with the saved ones; exits 1 on a change
//
// Starts its own engine webserver and dev server on spare ports. Needs a built webserver
// (`cargo build -p propel-webserver`, or PROPEL_WEBSERVER=path) and Chromium or Chrome
// (CHROME_PATH=path if it is not found).

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const STUDIO = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(STUDIO, "../..");
const OUT = join(STUDIO, "src/assets/thumbs");
const REPORT = join(STUDIO, ".thumbnail-check");
const ENGINE_PORT = 3851;
const UI_PORT = 5299;
// The dock is 1000px wide; the picker shows thumbnails at most 560px wide.
const VIEWPORT = { width: 1000, height: 740, deviceScaleFactor: 0.56 };
/** Share of pixels that may differ before `--check` calls a thumbnail changed. */
const CHANGED = 0.02;

const args = process.argv.slice(2);
const check = args.includes("--check");
const only = new Set(args.filter((a) => !a.startsWith("--")));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileName = (type, theme) => `${type.replace(/:/g, "-")}.${theme}.webp`;

function firstExisting(paths, what, hint) {
  const found = paths.find((p) => p && existsSync(p));
  if (!found) {
    console.error(`No ${what} found. ${hint}`);
    process.exit(2);
  }
  return found;
}

const targetDir = process.env.CARGO_TARGET_DIR ?? join(ROOT, "engine/target");
const webserver = firstExisting(
  [
    process.env.PROPEL_WEBSERVER,
    join(targetDir, "release/propel-webserver"),
    join(targetDir, "debug/propel-webserver"),
  ],
  "engine webserver",
  "Build it with `cargo build -p propel-webserver` in engine/, or set PROPEL_WEBSERVER.",
);
const chrome = firstExisting(
  [
    process.env.CHROME_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  "Chromium or Chrome",
  "Set CHROME_PATH.",
);

const env = { ...process.env, PROPEL_PORT: String(ENGINE_PORT), PROPEL_NO_HMR: "1" };
const children = [
  spawn(webserver, [], { env, stdio: "ignore" }),
  spawn("pnpm", ["exec", "vite", "--mode", "webserver", "--port", String(UI_PORT), "--strictPort"], {
    cwd: STUDIO,
    env,
    stdio: "ignore",
  }),
];
const stop = () => {
  for (const c of children) c.kill();
};
process.on("exit", stop);
process.on("SIGINT", () => process.exit(130));

async function waitForServer(url) {
  for (let i = 0; i < 300; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await sleep(200);
    }
  }
  throw new Error(`${url} did not come up`);
}

await waitForServer(`http://localhost:${ENGINE_PORT}/`);
await waitForServer(`http://localhost:${UI_PORT}/`);

const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport(VIEWPORT);

// Engine calls in flight; the event stream stays open and does not count.
const inflight = new Set();
const isCall = (r) => r.url().includes("/api/") && !r.url().includes("/api/events");
page.on("request", (r) => isCall(r) && inflight.add(r));
page.on("requestfinished", (r) => inflight.delete(r));
page.on("requestfailed", (r) => inflight.delete(r));
page.on("pageerror", (e) => console.warn(`  page error: ${e.message}`));

/** Until no engine call is pending and no panel shows a spinner or progress, for a second. */
async function idle(timeout = 180_000) {
  const start = Date.now();
  let quiet = 0;
  while (Date.now() - start < timeout) {
    const busy =
      inflight.size > 0 ||
      (await page.evaluate(
        () =>
          !!document.querySelector(
            ":is(.dv-render-overlay, .dv-content-container) :is([role=status], .rt-Spinner)",
          ),
      ));
    quiet = busy ? 0 : quiet || Date.now();
    if (quiet && Date.now() - quiet > 1000) return;
    await sleep(150);
  }
  throw new Error("still loading after 3 minutes");
}

async function press(label) {
  const seen = await page.evaluate((label) => {
    const buttons = [...document.querySelectorAll(":is(.dv-render-overlay, .dv-content-container) button")].filter(
      (b) => b.getClientRects().length > 0 && !b.disabled,
    );
    const name = (b) => b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "";
    const b = buttons.find((b) => b.getAttribute("aria-label") === label || b.textContent?.trim() === label);
    b?.click();
    return b ? null : buttons.map(name);
  }, label);
  if (seen) throw new Error(`no button "${label}" among: ${seen.join(", ")}`);
}

/** Stats of a WebP: how much of it differs from its corner color, and from `other` if given. */
function compare(webp, other) {
  return page.evaluate(
    async (a, b) => {
      const load = async (b64) => {
        const img = new Image();
        img.src = `data:image/webp;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height);
      };
      const x = await load(a);
      const px = x.data;
      let content = 0;
      for (let i = 0; i < px.length; i += 4) {
        const d = Math.max(
          Math.abs(px[i] - px[0]),
          Math.abs(px[i + 1] - px[1]),
          Math.abs(px[i + 2] - px[2]),
        );
        if (d > 16) content++;
      }
      const out = { content: content / (px.length / 4), changed: null };
      if (b) {
        const y = await load(b);
        if (y.width !== x.width || y.height !== x.height) out.changed = 1;
        else {
          let n = 0;
          for (let i = 0; i < px.length; i += 4) {
            const d = Math.max(
              Math.abs(px[i] - y.data[i]),
              Math.abs(px[i + 1] - y.data[i + 1]),
              Math.abs(px[i + 2] - y.data[i + 2]),
            );
            if (d > 40) n++;
          }
          out.changed = n / (px.length / 4);
        }
      }
      return out;
    },
    webp.toString("base64"),
    other?.toString("base64"),
  );
}

await page.goto(`http://localhost:${UI_PORT}/`, { waitUntil: "networkidle2" });
const demoEnv = await page.evaluate(async () => {
  const { SAMPLE_DATASETS, loadSampleIntoEngine } = await import("/src/samples.ts");
  const { backend } = await import("/src/backends/index.ts");
  const { useDatasets } = await import("/src/stores/index.ts");
  const ids = {};
  for (const s of SAMPLE_DATASETS) {
    const d = await loadSampleIntoEngine(backend, s);
    useDatasets.getState().addDataset(d);
    ids[d.kind] = d.id;
  }
  return { log: ids.EventLog, ocel: ids.SlimLinkedOCEL };
});
// Toasts (e.g., "Imported ...") would land in the captures.
await page.addStyleTag({ content: "[data-rht-toaster] { display: none !important; }" });
await page.waitForFunction(() =>
  import("/src/shell/dockviewApi.ts").then((m) => !!m.getDockviewApi()),
);

/** Every panel the picker lists, with the data kinds it supports and its demo. */
const entries = await page.evaluate(async () => {
  const { ANALYSES } = await import("/src/shell/analyses.tsx");
  const { VISIBLE_PANELS, getPanelByType } = await import("/src/panels/registry.tsx");
  const { DEMOS } = await import("/src/demo/panel-demos.ts");
  const types = [...new Set([...ANALYSES.flatMap((a) => a.panels.map((e) => e.type)), ...VISIBLE_PANELS.map((p) => p.type)])];
  return types.map((type) => ({
    type,
    supports: getPanelByType(type)?.supports ?? [],
    press: DEMOS[type]?.press ?? [],
    wait: DEMOS[type]?.wait ?? 800,
  }));
});

if (check) {
  rmSync(REPORT, { recursive: true, force: true });
  mkdirSync(REPORT, { recursive: true });
}
mkdirSync(OUT, { recursive: true });
const failed = [];
const changed = [];
const todo = entries.filter((e) => !only.size || only.has(e.type));
for (const name of only) if (!entries.some((e) => e.type === name)) failed.push(`${name}: not in the picker`);

for (const theme of ["light", "dark"]) {
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
  for (const { type, supports, press: buttons, wait } of todo) {
    const label = `${theme} ${type}`;
    try {
      await page.evaluate(
        async (type, supports, demoEnv) => {
          const { getDockviewApi } = await import("/src/shell/dockviewApi.ts");
          const { addPanelToDockview } = await import("/src/panels/registry.tsx");
          const { demoParams } = await import("/src/demo/panel-demos.ts");
          getDockviewApi().clear();
          const { demoSetup } = await import("/src/demo/panel-demos.ts");
          addPanelToDockview(type, undefined, await demoParams(type, supports, demoEnv));
          await demoSetup(type, demoEnv);
        },
        type,
        supports,
        demoEnv,
      );
      await idle();
      for (const b of buttons) {
        await press(b);
        await sleep(300);
        await idle();
      }
      await sleep(wait);
      const error = await page.evaluate(
        () => document.querySelector(":is(.dv-render-overlay, .dv-content-container) [role=alert]")?.textContent ?? null,
      );
      if (error) throw new Error(`shows an error: ${error.slice(0, 200)}`);
      const box = await page.evaluate(() => {
        // Dockview draws always-rendered panels in an overlay above their content container.
        const root = document.querySelector(".dv-render-overlay") ?? document.querySelector(".dv-content-container");
        const el = root?.querySelector("[data-export-root]") ?? root;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      const shot = Buffer.from(
        await page.screenshot({ type: "webp", quality: 80, clip: box, captureBeyondViewport: false }),
      );
      const file = join(OUT, fileName(type, theme));
      const saved = check && existsSync(file) ? readFileSync(file) : undefined;
      const stats = await compare(shot, saved);
      if (stats.content < 0.004) throw new Error("came out blank");
      if (check) {
        if (!saved || stats.changed > CHANGED) {
          const why = saved ? `${(stats.changed * 100).toFixed(1)}% of pixels differ` : "no saved thumbnail";
          changed.push(`${label}: ${why}`);
          writeFileSync(join(REPORT, fileName(type, theme).replace(".webp", ".new.webp")), shot);
          if (saved) writeFileSync(join(REPORT, fileName(type, theme).replace(".webp", ".old.webp")), saved);
        }
      } else {
        writeFileSync(file, shot);
      }
      console.log(`ok   ${label}`);
    } catch (e) {
      failed.push(`${label}: ${e.message}`);
      mkdirSync(REPORT, { recursive: true });
      await page
        .screenshot({ path: join(REPORT, `${fileName(type, theme).replace(".webp", ".failed.png")}`) })
        .catch(() => {});
      console.log(`FAIL ${label}: ${e.message}`);
    }
  }
}

const known = new Set(entries.flatMap((e) => ["light", "dark"].map((t) => fileName(e.type, t))));
const orphans = readdirSync(OUT).filter((f) => f.endsWith(".webp") && !known.has(f));

await browser.close();
if (orphans.length) console.log(`\nThumbnails of no panel in the picker:\n  ${orphans.join("\n  ")}`);
if (changed.length) console.log(`\nChanged (new and old images in ${REPORT}):\n  ${changed.join("\n  ")}`);
if (failed.length) console.log(`\nFailed (screenshots in ${REPORT}):\n  ${failed.join("\n  ")}`);
if (!failed.length && !changed.length) console.log(`\n${todo.length * 2} thumbnails ${check ? "unchanged" : "written"}.`);
process.exit(failed.length || changed.length ? 1 : 0);
