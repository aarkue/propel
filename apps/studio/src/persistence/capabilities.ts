import type { BackendContext } from "@r4pm/client";

/** wasm holds no server-side state, so imported bytes are cached in idb for reload restore. */
export function canCacheBytes(backend: BackendContext): boolean {
  return backend.kind === "wasm";
}

/** Desktop (tauri) exposes native path loaders; web transports take file bytes instead. */
export function canLoadFromPath(backend: BackendContext): boolean {
  return !!backend.loadItemPath;
}

/** Projects need byte caching (wasm) or path refs (tauri); http has neither, so no switcher. */
export function supportsProjects(backend: BackendContext): boolean {
  return backend.kind !== "http";
}
