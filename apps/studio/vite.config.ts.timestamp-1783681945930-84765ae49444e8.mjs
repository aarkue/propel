// vite.config.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "file:///home/aarkue/doc/projects/propel/node_modules/.pnpm/vite@5.4.21_@types+node@26.0.0_lightningcss@1.32.0_terser@5.48.0/node_modules/vite/dist/node/index.js";
import react from "file:///home/aarkue/doc/projects/propel/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.21_@types+node@26.0.0_lightningcss@1.32.0_terser@5.48.0_/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///home/aarkue/doc/projects/propel/node_modules/.pnpm/@tailwindcss+vite@4.3.1_vite@5.4.21_@types+node@26.0.0_lightningcss@1.32.0_terser@5.48.0_/node_modules/@tailwindcss/vite/dist/index.mjs";
var __vite_injected_original_import_meta_url = "file:///home/aarkue/doc/projects/propel/apps/studio/vite.config.ts";
var appVersion = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../engine/app/tauri.conf.json", __vite_injected_original_import_meta_url)), "utf8")
).version;
function propelExtensions() {
  const id = "virtual:propel-extensions";
  const resolved = `\0${id}`;
  return {
    name: "propel-extensions",
    resolveId(source) {
      if (source === id) return resolved;
    },
    load(loadId) {
      if (loadId === resolved) return "export const extraPanels = [];";
    }
  };
}
var vite_config_default = defineConfig(({ mode }) => {
  const stubWasm = mode === "tauri" || mode === "webserver";
  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion)
    },
    plugins: [propelExtensions(), react(), tailwindcss()],
    resolve: {
      alias: {
        "@propel-engine": fileURLToPath(new URL("../../engine/wasm/pkg", __vite_injected_original_import_meta_url)),
        "@backend-wasm": fileURLToPath(
          new URL(stubWasm ? "./src/backends/wasm.stub.ts" : "./src/backends/wasm.ts", __vite_injected_original_import_meta_url)
        )
      }
    },
    // @r4pm/components is consumed from TS source (its exports point at src/*). Keep it out of the
    // dep pre-bundler so edits to component source hot-reload instead of being frozen in a cached
    // optimized chunk.
    optimizeDeps: { exclude: ["@r4pm/components"] },
    server: {
      fs: { allow: ["../.."] },
      // `--mode webserver`: proxy /api to the axum engine (PROPEL_PORT 3751).
      proxy: {
        "/api": { target: "http://localhost:3751", changeOrigin: true }
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/plotly.js") || id.includes("react-plotly")) return "plotly";
            if (id.includes("@xyflow")) return "xyflow";
          }
        }
      },
      chunkSizeWarningLimit: 4e3
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9hYXJrdWUvZG9jL3Byb2plY3RzL3Byb3BlbC9hcHBzL3N0dWRpb1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvYWFya3VlL2RvYy9wcm9qZWN0cy9wcm9wZWwvYXBwcy9zdHVkaW8vdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvYWFya3VlL2RvYy9wcm9qZWN0cy9wcm9wZWwvYXBwcy9zdHVkaW8vdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyByZWFkRmlsZVN5bmMgfSBmcm9tIFwibm9kZTpmc1wiO1xuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gXCJub2RlOnVybFwiO1xuaW1wb3J0IHsgZGVmaW5lQ29uZmlnLCB0eXBlIFBsdWdpbiB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0XCI7XG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSBcIkB0YWlsd2luZGNzcy92aXRlXCI7XG5cbi8vIFVwZGF0ZXItY2hpcCB2ZXJzaW9uIGZhbGxiYWNrIChtaXJyb3JzIHRoZSBUYXVyaSBidW5kbGUgdmVyc2lvbilcbmNvbnN0IGFwcFZlcnNpb24gPSAoXG4gIEpTT04ucGFyc2UoXG4gICAgcmVhZEZpbGVTeW5jKGZpbGVVUkxUb1BhdGgobmV3IFVSTChcIi4uLy4uL2VuZ2luZS9hcHAvdGF1cmkuY29uZi5qc29uXCIsIGltcG9ydC5tZXRhLnVybCkpLCBcInV0ZjhcIiksXG4gICkgYXMgeyB2ZXJzaW9uOiBzdHJpbmcgfVxuKS52ZXJzaW9uO1xuXG5mdW5jdGlvbiBwcm9wZWxFeHRlbnNpb25zKCk6IFBsdWdpbiB7XG4gIGNvbnN0IGlkID0gXCJ2aXJ0dWFsOnByb3BlbC1leHRlbnNpb25zXCI7XG4gIGNvbnN0IHJlc29sdmVkID0gYFxcMCR7aWR9YDtcbiAgcmV0dXJuIHtcbiAgICBuYW1lOiBcInByb3BlbC1leHRlbnNpb25zXCIsXG4gICAgcmVzb2x2ZUlkKHNvdXJjZSkge1xuICAgICAgaWYgKHNvdXJjZSA9PT0gaWQpIHJldHVybiByZXNvbHZlZDtcbiAgICB9LFxuICAgIGxvYWQobG9hZElkKSB7XG4gICAgICBpZiAobG9hZElkID09PSByZXNvbHZlZCkgcmV0dXJuIFwiZXhwb3J0IGNvbnN0IGV4dHJhUGFuZWxzID0gW107XCI7XG4gICAgfSxcbiAgfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4ge1xuICAvLyB0YXVyaS93ZWJzZXJ2ZXIgdXNlIHRoZSBuYXRpdmUvSFRUUCBiYWNrZW5kOyBzdHViIHRoZSB3YXNtIGVuZ2luZSBvdXQgb2YgdGhvc2UgYnVuZGxlcy5cbiAgY29uc3Qgc3R1Yldhc20gPSBtb2RlID09PSBcInRhdXJpXCIgfHwgbW9kZSA9PT0gXCJ3ZWJzZXJ2ZXJcIjtcbiAgcmV0dXJuIHtcbiAgICBkZWZpbmU6IHtcbiAgICAgIF9fQVBQX1ZFUlNJT05fXzogSlNPTi5zdHJpbmdpZnkoYXBwVmVyc2lvbiksXG4gICAgfSxcbiAgICBwbHVnaW5zOiBbcHJvcGVsRXh0ZW5zaW9ucygpLCByZWFjdCgpLCB0YWlsd2luZGNzcygpXSxcbiAgICByZXNvbHZlOiB7XG4gICAgICBhbGlhczoge1xuICAgICAgICBcIkBwcm9wZWwtZW5naW5lXCI6IGZpbGVVUkxUb1BhdGgobmV3IFVSTChcIi4uLy4uL2VuZ2luZS93YXNtL3BrZ1wiLCBpbXBvcnQubWV0YS51cmwpKSxcbiAgICAgICAgXCJAYmFja2VuZC13YXNtXCI6IGZpbGVVUkxUb1BhdGgoXG4gICAgICAgICAgbmV3IFVSTChzdHViV2FzbSA/IFwiLi9zcmMvYmFja2VuZHMvd2FzbS5zdHViLnRzXCIgOiBcIi4vc3JjL2JhY2tlbmRzL3dhc20udHNcIiwgaW1wb3J0Lm1ldGEudXJsKSxcbiAgICAgICAgKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICAvLyBAcjRwbS9jb21wb25lbnRzIGlzIGNvbnN1bWVkIGZyb20gVFMgc291cmNlIChpdHMgZXhwb3J0cyBwb2ludCBhdCBzcmMvKikuIEtlZXAgaXQgb3V0IG9mIHRoZVxuICAgIC8vIGRlcCBwcmUtYnVuZGxlciBzbyBlZGl0cyB0byBjb21wb25lbnQgc291cmNlIGhvdC1yZWxvYWQgaW5zdGVhZCBvZiBiZWluZyBmcm96ZW4gaW4gYSBjYWNoZWRcbiAgICAvLyBvcHRpbWl6ZWQgY2h1bmsuXG4gICAgb3B0aW1pemVEZXBzOiB7IGV4Y2x1ZGU6IFtcIkByNHBtL2NvbXBvbmVudHNcIl0gfSxcbiAgICBzZXJ2ZXI6IHtcbiAgICAgIGZzOiB7IGFsbG93OiBbXCIuLi8uLlwiXSB9LFxuICAgICAgLy8gYC0tbW9kZSB3ZWJzZXJ2ZXJgOiBwcm94eSAvYXBpIHRvIHRoZSBheHVtIGVuZ2luZSAoUFJPUEVMX1BPUlQgMzc1MSkuXG4gICAgICBwcm94eToge1xuICAgICAgICBcIi9hcGlcIjogeyB0YXJnZXQ6IFwiaHR0cDovL2xvY2FsaG9zdDozNzUxXCIsIGNoYW5nZU9yaWdpbjogdHJ1ZSB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIGJ1aWxkOiB7XG4gICAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICAgIG91dHB1dDoge1xuICAgICAgICAgIG1hbnVhbENodW5rcyhpZCkge1xuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwibm9kZV9tb2R1bGVzL3Bsb3RseS5qc1wiKSB8fCBpZC5pbmNsdWRlcyhcInJlYWN0LXBsb3RseVwiKSkgcmV0dXJuIFwicGxvdGx5XCI7XG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoXCJAeHlmbG93XCIpKSByZXR1cm4gXCJ4eWZsb3dcIjtcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGNodW5rU2l6ZVdhcm5pbmdMaW1pdDogNDAwMCxcbiAgICB9LFxuICB9O1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXNULFNBQVMsb0JBQW9CO0FBQ25WLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0JBQWlDO0FBQzFDLE9BQU8sV0FBVztBQUNsQixPQUFPLGlCQUFpQjtBQUp3SyxJQUFNLDJDQUEyQztBQU9qUCxJQUFNLGFBQ0osS0FBSztBQUFBLEVBQ0gsYUFBYSxjQUFjLElBQUksSUFBSSxvQ0FBb0Msd0NBQWUsQ0FBQyxHQUFHLE1BQU07QUFDbEcsRUFDQTtBQUVGLFNBQVMsbUJBQTJCO0FBQ2xDLFFBQU0sS0FBSztBQUNYLFFBQU0sV0FBVyxLQUFLLEVBQUU7QUFDeEIsU0FBTztBQUFBLElBQ0wsTUFBTTtBQUFBLElBQ04sVUFBVSxRQUFRO0FBQ2hCLFVBQUksV0FBVyxHQUFJLFFBQU87QUFBQSxJQUM1QjtBQUFBLElBQ0EsS0FBSyxRQUFRO0FBQ1gsVUFBSSxXQUFXLFNBQVUsUUFBTztBQUFBLElBQ2xDO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE1BQU07QUFFeEMsUUFBTSxXQUFXLFNBQVMsV0FBVyxTQUFTO0FBQzlDLFNBQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxNQUNOLGlCQUFpQixLQUFLLFVBQVUsVUFBVTtBQUFBLElBQzVDO0FBQUEsSUFDQSxTQUFTLENBQUMsaUJBQWlCLEdBQUcsTUFBTSxHQUFHLFlBQVksQ0FBQztBQUFBLElBQ3BELFNBQVM7QUFBQSxNQUNQLE9BQU87QUFBQSxRQUNMLGtCQUFrQixjQUFjLElBQUksSUFBSSx5QkFBeUIsd0NBQWUsQ0FBQztBQUFBLFFBQ2pGLGlCQUFpQjtBQUFBLFVBQ2YsSUFBSSxJQUFJLFdBQVcsZ0NBQWdDLDBCQUEwQix3Q0FBZTtBQUFBLFFBQzlGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUlBLGNBQWMsRUFBRSxTQUFTLENBQUMsa0JBQWtCLEVBQUU7QUFBQSxJQUM5QyxRQUFRO0FBQUEsTUFDTixJQUFJLEVBQUUsT0FBTyxDQUFDLE9BQU8sRUFBRTtBQUFBO0FBQUEsTUFFdkIsT0FBTztBQUFBLFFBQ0wsUUFBUSxFQUFFLFFBQVEseUJBQXlCLGNBQWMsS0FBSztBQUFBLE1BQ2hFO0FBQUEsSUFDRjtBQUFBLElBQ0EsT0FBTztBQUFBLE1BQ0wsZUFBZTtBQUFBLFFBQ2IsUUFBUTtBQUFBLFVBQ04sYUFBYSxJQUFJO0FBQ2YsZ0JBQUksR0FBRyxTQUFTLHdCQUF3QixLQUFLLEdBQUcsU0FBUyxjQUFjLEVBQUcsUUFBTztBQUNqRixnQkFBSSxHQUFHLFNBQVMsU0FBUyxFQUFHLFFBQU87QUFBQSxVQUNyQztBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQUEsTUFDQSx1QkFBdUI7QUFBQSxJQUN6QjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
