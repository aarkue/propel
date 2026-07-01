import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// Used by Storybook's Vite builder (it merges the package's vite config). Compiles the
// `@import "tailwindcss"` entry on the fly so stories render with the viewers' real styling.
export default defineConfig({
  plugins: [tailwindcss()],
  server: { fs: { allow: ["../.."] } },
});
