import type { BackendContext } from "@r4pm/client";

/** Process-wide backend handle, set once at startup. Transport-agnostic. */
let _backend: BackendContext | null = null;

export function setBackend(backend: BackendContext | null) {
  _backend = backend;
}

export function getBackend(): BackendContext {
  if (!_backend) throw new Error("Backend not set: call setBackend() during app startup");
  return _backend;
}
