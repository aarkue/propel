import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { type Connect, defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Updater-chip version fallback (mirrors the Tauri bundle version)
const appVersion = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL("../../engine/app/tauri.conf.json", import.meta.url)), "utf8"),
  ) as { version: string }
).version;

function propelExtensions(): Plugin {
  const id = "virtual:propel-extensions";
  const resolved = `\0${id}`;
  return {
    name: "propel-extensions",
    resolveId(source) {
      if (source === id) return resolved;
    },
    load(loadId) {
      if (loadId === resolved) return "export const extraPanels = [];";
    },
  };
}

/**
 * Serve `public/**.gz` as the gzip files they are. Vite's static server marks them
 * `Content-Encoding: gzip`, so the browser unpacks them: the 3 MB RTFM sample arrives as 185 MB of
 * XML, which the app then hands to the engine. The engine reads gzip itself.
 */
function gzipAsIs(): Plugin {
  const publicDir = fileURLToPath(new URL("./public", import.meta.url));
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    const path = decodeURIComponent((req.url ?? "").split("?")[0]);
    if (!path.endsWith(".gz")) return next();
    const file = join(publicDir, normalize(path));
    if (!file.startsWith(publicDir) || !existsSync(file)) return next();
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Length", statSync(file).size);
    createReadStream(file).pipe(res);
  };
  return {
    name: "gzip-as-is",
    configureServer: (server) => void server.middlewares.use(serve),
    configurePreviewServer: (server) => void server.middlewares.use(serve),
  };
}

export default defineConfig(({ mode }) => {
  // tauri/webserver use the native/HTTP backend; stub the wasm engine out of those bundles.
  const stubWasm = mode === "tauri" || mode === "webserver";
  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [propelExtensions(), gzipAsIs(), react(), tailwindcss()],
    resolve: {
      alias: {
        "@propel-engine": fileURLToPath(new URL("../../engine/wasm/pkg", import.meta.url)),
        "@backend-wasm": fileURLToPath(
          new URL(stubWasm ? "./src/backends/wasm.stub.ts" : "./src/backends/wasm.ts", import.meta.url),
        ),
      },
    },
    // @r4pm/components is consumed from TS source (its exports point at src/*). Keep it out of the
    // dep pre-bundler so edits to component source hot-reload instead of being frozen in a cached
    // optimized chunk.
    optimizeDeps: { exclude: ["@r4pm/components"] },
    server: {
      fs: { allow: ["../.."] },
      // Off for `pnpm thumbnails`: a reload mid-run would lose the loaded samples.
      hmr: process.env.PROPEL_NO_HMR ? false : undefined,
      // `--mode webserver`: proxy /api to the axum engine (PROPEL_PORT, default 3751).
      proxy: {
        "/api": { target: `http://localhost:${process.env.PROPEL_PORT ?? 3751}`, changeOrigin: true },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/plotly.js") || id.includes("react-plotly")) return "plotly";
            if (id.includes("@xyflow")) return "xyflow";
          },
        },
      },
      chunkSizeWarningLimit: 4000,
    },
  };
});
