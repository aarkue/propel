/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Selects the backend transport at build time. Unset/`wasm` -> in-process wasm; `http` -> remote axum. */
  readonly VITE_BACKEND?: "wasm" | "http";
  /** API root for the http backend (defaults to "/api"); set in dev to point at the axum port. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Extension panel injection point. */
declare module "virtual:propel-extensions" {
  import type { PanelDefinition } from "./panels/types";
  export const extraPanels: PanelDefinition[];
}
