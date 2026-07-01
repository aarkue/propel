import type { DockviewApi } from "dockview";

// Populated once by Dashboard's one-shot `onReady`.
// In dev, HMR can re-evaluate this module (resetting the local variable)
// long after `onReady` already fired, so save the api in `import.meta.hot.data`
// (which Vite carries across module reloads) and restore it on re-eval.
let _dockviewApi: DockviewApi | null = import.meta.hot?.data.dockviewApi ?? null;

export function setDockviewApi(api: DockviewApi | null) {
  _dockviewApi = api;
  if (import.meta.hot) import.meta.hot.data.dockviewApi = api;
}

export function getDockviewApi(): DockviewApi | null {
  return _dockviewApi;
}
