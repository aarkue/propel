import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
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

export default defineConfig(({ mode }) => {
  // tauri/webserver use the native/HTTP backend; stub the wasm engine out of those bundles.
  const stubWasm = mode === "tauri" || mode === "webserver";
  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [propelExtensions(), react(), tailwindcss()],
    resolve: {
      alias: {
        "@propel-engine": fileURLToPath(new URL("../../engine/wasm/pkg", import.meta.url)),
        "@backend-wasm": fileURLToPath(
          new URL(stubWasm ? "./src/backends/wasm.stub.ts" : "./src/backends/wasm.ts", import.meta.url),
        ),
      },
    },
    server: {
      fs: { allow: ["../.."] },
      // `--mode webserver`: proxy /api to the axum engine (PROPEL_PORT 3751).
      proxy: {
        "/api": { target: "http://localhost:3751", changeOrigin: true },
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
