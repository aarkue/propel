import type { BackendContext } from "@r4pm/client";
import { useArtifacts } from "../stores/artifacts";
import { useDatasets } from "../stores/datasets";
import { usePipelines } from "../stores/pipelines";
import { usePreferences } from "../stores/preferences";
import { canCacheBytes } from "./capabilities";
import {
  deleteRoot,
  estimate,
  getRoot,
  gzip,
  putRoot,
  putSession,
  requestPersist,
  type RootBlob,
} from "./idb";
import { buildManifest, type Manifest, type ManifestObject, type StoreKind } from "./manifest";
import { flushPendingDrafts, makeDebouncedWriter } from "../panels/panel-state";
import { getDockviewApi } from "../shell/dockviewApi";

export const DEFAULT_PROJECT = "default";
const CURRENT_KEY = "propel-current-project";
/** The `workspace` field key carrying the dockview panel layout in a session / .propel. */
export const PANELS_KEY = "propel-panels";

/** Live dockview panel layout, in memory (not localStorage), captured into the active session. Layout-change events only mark it dirty; serialization is deferred to the next read so drags don't stringify on every event. */
let liveLayout: string | null = null;
let liveLayoutDirty = false;
export function markLiveLayoutDirty(): void {
  liveLayoutDirty = true;
}
export function getLiveLayout(): string | null {
  if (liveLayoutDirty) {
    const api = getDockviewApi();
    if (api) {
      try {
        liveLayout = JSON.stringify(api.toJSON());
        liveLayoutDirty = false;
      } catch (e) {
        console.error("persistence: serialize layout failed", e);
      }
    }
  }
  return liveLayout;
}
export function setLiveLayout(layout: string | null): void {
  liveLayout = layout;
  liveLayoutDirty = false;
}
const BUDGET_SAFETY = 0.9;
const SAVE_DEBOUNCE_MS = 800;

let persistRequested = false;

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore (storage disabled)
  }
}

/** The active project id; everything caches to / restores from it. */
export function getCurrentProject(): string {
  return lsGet(CURRENT_KEY) ?? DEFAULT_PROJECT;
}
export function setCurrentProject(id: string): void {
  lsSet(CURRENT_KEY, id);
}

const LAST_PROJECT_KEY = "propel-last-project";
/** The project the user last worked in. Boot lands in Default but Continue reopens THIS one, so it's
 *  kept separate from the active project. */
export function getLastProject(): string {
  return lsGet(LAST_PROJECT_KEY) ?? DEFAULT_PROJECT;
}
export function setLastProject(id: string): void {
  lsSet(LAST_PROJECT_KEY, id);
}

/** Boot into the Default scratch project. On first run the previously-active project becomes "last worked-in" so Continue can still reopen it. */
export function bootToDefault(): void {
  if (lsGet(LAST_PROJECT_KEY) == null) setLastProject(getCurrentProject());
  setLiveLayout(null);
  setCurrentProject(DEFAULT_PROJECT);
}

/** Snapshot the live workspace (panel layout) for persisting into a session / .propel. */
export function captureWorkspace(): Record<string, string> {
  // Flush debounced drafts into params first, then read via `api.toJSON()`: it reflects the just-flushed
  // params, whereas in-memory `liveLayout` lags (dockview buffers its layout-change event).
  flushPendingDrafts();
  const api = getDockviewApi();
  const layout = api ? JSON.stringify(api.toJSON()) : liveLayout;
  return layout != null ? { [PANELS_KEY]: layout } : {};
}

/** Cache an imported object's source bytes (gzipped) under the current project so a wasm reload can
 *  re-load it. Skips (rather than failing the import) when caching would exceed the storage budget. */
export async function cacheImportedRoot(
  opts: { id: string; kind: string; format: string; label: string; storeKind: StoreKind },
  rawBytes: Uint8Array,
): Promise<void> {
  // Skip caching datasets over the user's size cap; they relink from their file on restore instead of
  // eating browser quota. 0 = unlimited.
  const cap = usePreferences.getState().cacheMaxMb;
  if (cap > 0 && rawBytes.byteLength > cap * 1024 * 1024) {
    console.info(`persistence: skip caching ${opts.id} (over ${cap}MB cap; will relink on restore)`);
    return;
  }
  if (!persistRequested) {
    persistRequested = true;
    void requestPersist();
  }
  const gz = await gzip(rawBytes);
  const { usage, quota } = await estimate();
  if (quota > 0 && usage + gz.byteLength > quota * BUDGET_SAFETY) {
    console.warn(`persistence: skip caching ${opts.id} (over storage budget)`);
    return;
  }
  await putRoot({ projectId: getCurrentProject(), ...opts, bytes: gz.buffer as ArrayBuffer });
}

/** The single path for loading source bytes as a dataset: caches them first (wasm only, so a reload
 *  can restore), then loads. Every import entry point routes through this so none skips caching. */
export async function loadItemCached(
  backend: BackendContext,
  opts: { id: string; kind: string; format: string; label: string; sampleId?: string },
  bytes: Uint8Array,
): Promise<void> {
  // A sample root is re-fetched from public/examples on restore, so cached bytes would never be read.
  if (canCacheBytes(backend) && !opts.sampleId) {
    // loadItem transfers `bytes` into the worker (neutering it), so cache from a copy taken first.
    void cacheImportedRoot({ ...opts, storeKind: "dataset" }, bytes.slice()).catch((e) =>
      console.error("persistence: cache import failed", e),
    );
  }
  await backend.loadItem(opts.id, opts.kind, bytes, opts.format);
}

/** As {@link loadItemCached}, for engine artifacts (Petri nets, ...). */
export async function loadArtifactCached(
  backend: BackendContext,
  opts: { id: string; kind: string; format: string; label: string },
  bytes: Uint8Array,
): Promise<void> {
  if (canCacheBytes(backend)) {
    void cacheImportedRoot({ ...opts, storeKind: "artifact" }, bytes.slice()).catch((e) =>
      console.error("persistence: cache import failed", e),
    );
  }
  await backend.loadArtifactBytes(opts.id, opts.kind, bytes, opts.format);
}

/** Unload a dataset everywhere it persists: the store, the engine, and the current project's cache. */
export async function unloadDataset(backend: BackendContext, id: string): Promise<void> {
  useDatasets.getState().removeDataset(id);
  await deleteRoot(getCurrentProject(), id).catch(() => {});
  await backend.unloadObject(id);
}

/** As {@link unloadDataset}, for engine artifacts. */
export async function unloadArtifact(backend: BackendContext, id: string): Promise<void> {
  useArtifacts.getState().removeArtifact(id);
  await deleteRoot(getCurrentProject(), id).catch(() => {});
  await backend.unloadArtifact(id);
}

/** Unload every currently loaded dataset and artifact (engine + store + cache). Used before opening
 *  or switching a project so it replaces, rather than merges with, the current session. */
export async function clearSession(backend: BackendContext): Promise<void> {
  await Promise.all([
    ...useDatasets.getState().datasets.map((d) => unloadDataset(backend, d.id)),
    ...useArtifacts.getState().artifacts.map((a) => unloadArtifact(backend, a.id)),
  ]);
}

function collectObjects(): ManifestObject[] {
  const rootRef = (id: string, path?: string, sampleId?: string): ManifestObject["ref"] =>
    sampleId ? { kind: "sample", id: sampleId } : path ? { kind: "path", path } : { kind: "idb", key: id };
  const datasets = useDatasets.getState().datasets.map(
    (d): ManifestObject => ({
      id: d.id,
      kind: d.kind,
      label: d.label,
      storeKind: "dataset",
      provenance: d.provenance,
      ref: d.provenance ? undefined : rootRef(d.id, d.path, d.sampleId),
    }),
  );
  const artifacts = useArtifacts.getState().artifacts.map(
    (a): ManifestObject => ({
      id: a.id,
      kind: a.kind,
      label: a.label,
      storeKind: "artifact",
      provenance: a.provenance,
      ref: a.provenance ? undefined : rootRef(a.id, a.path),
    }),
  );
  return [...datasets, ...artifacts];
}

/** Manifest for the current session, with each idb root's format backfilled from its cached blob; blobs are returned alongside so export reuses them instead of re-reading idb. */
export async function buildCurrentManifest(): Promise<{
  manifest: Manifest;
  blobs: Map<string, RootBlob>;
}> {
  const manifest = buildManifest(collectObjects());
  const project = getCurrentProject();
  const blobs = new Map<string, RootBlob>();
  await Promise.all(
    manifest.roots.map(async (r) => {
      if (r.ref.kind !== "idb") return;
      const blob = await getRoot(project, r.ref.key);
      if (!blob) return;
      blobs.set(r.ref.key, blob);
      if (!r.format) r.format = blob.format;
    }),
  );
  return { manifest, blobs };
}

/** Saves are disarmed at boot so the empty opening state can't overwrite the saved session before the user acts on the Continue offer. */
let savesArmed = false;
export function armSessionSaves(): void {
  savesArmed = true;
}

/** Immediately persist the current project's session state (used before switching projects). */
export async function saveCurrentSession(): Promise<void> {
  if (!savesArmed) return;
  const project = getCurrentProject();
  const state = {
    manifest: buildManifest(collectObjects()),
    workspace: captureWorkspace(),
    pipelines: usePipelines.getState().snapshot(),
  };
  await putSession(project, state);
  // Working here makes this the project Continue reopens next boot (Default scratch or a named one).
  setLastProject(project);
}

const sessionSaveWriter = makeDebouncedWriter<void>(() => {
  void saveCurrentSession().catch((e) => console.error("persistence: session save failed", e));
}, SAVE_DEBOUNCE_MS);

/** Debounced write of the current project's session state (derived manifest + workspace snapshot) to
 *  IndexedDB. Roots are cached separately. No-op until session saves are armed (see `savesArmed`). */
export function scheduleSessionSave(): void {
  if (!savesArmed) return;
  sessionSaveWriter.schedule(undefined);
}
