import type { BackendContext } from "@r4pm/client";
import toast from "react-hot-toast";
import { parseOp } from "../pipeline/lineage-to-pipeline";
import { findSample, loadSampleIntoEngine } from "../samples";
import { getDockviewApi } from "../shell/dockviewApi";
import { usePipelines } from "../stores/pipelines";
import { useArtifacts } from "../stores/artifacts";
import { useDatasets } from "../stores/datasets";
import { type MissingRoot, useRelink } from "../stores/relink";
import {
  countRoots,
  deleteProject as idbDeleteProject,
  deleteProjectRoots,
  deleteSession,
  getAllRoots,
  getRoot,
  getSession,
  gunzip,
  listProjects,
  type ProjectMeta,
  putProject,
} from "./idb";
import type { DerivedEntry, Manifest, RootEntry, StoreKind } from "./manifest";
import { topoOrderDerived } from "./manifest";
import { fromB64, parseProject, serializeProject } from "./project-file";
import {
  armSessionSaves,
  buildCurrentManifest,
  captureWorkspace,
  clearSession,
  DEFAULT_PROJECT,
  getCurrentProject,
  getLastProject,
  getLiveLayout,
  loadArtifactCached,
  loadItemCached,
  PANELS_KEY,
  saveCurrentSession,
  setCurrentProject,
  setLastProject,
  setLiveLayout,
} from "./session";

function addRestoredObject(
  storeKind: StoreKind,
  o: { id: string; kind: string; label: string; path?: string },
): void {
  if (storeKind === "artifact") useArtifacts.getState().addArtifact(o);
  else useDatasets.getState().addDataset(o);
}

async function loadRootFromPath(
  backend: BackendContext,
  r: { id: string; kind: string; label: string; storeKind: StoreKind },
  path: string,
): Promise<void> {
  if (r.storeKind === "artifact") await backend.loadArtifactPath?.(r.id, r.kind, path);
  else await backend.loadItemPath?.(r.id, r.kind, path);
  addRestoredObject(r.storeKind, { id: r.id, kind: r.kind, label: r.label, path });
}

/** Rewrite any string in `value` that is a key of `idMap` to its mapped id, so a derived op's source
 *  references point at the ids their (also-derived) sources were actually restored under. */
function remapArgs(value: unknown, idMap: Map<string, string>): unknown {
  if (typeof value === "string") return idMap.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => remapArgs(v, idMap));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = remapArgs(v, idMap);
    return out;
  }
  return value;
}

/** Replay derived objects from their provenance in dependency order, remapping old->new ids for later ops' sources; non-replayable ones are dropped and toasted. */
async function replayDerived(backend: BackendContext, derived: DerivedEntry[]): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();
  const dropped: string[] = [];
  for (const d of topoOrderDerived(derived)) {
    try {
      const op = parseOp(d.provenance.op);
      if (!op) throw new Error("non-replayable op");
      const args = remapArgs(op.args, idMap);
      // op.fn is a runtime-dynamic binding id; CallBinding's typed signature can't express that.
      const newId = (await backend.callBinding(op.fn as never, args as never)) as string;
      idMap.set(d.id, newId);
      addRestoredObject(d.storeKind, { id: newId, kind: d.kind, label: d.label });
    } catch (e) {
      console.error(`persistence: restore derived ${d.id} failed`, e);
      dropped.push(d.label);
    }
  }
  if (dropped.length > 0) {
    const n = dropped.length;
    toast.error(`Could not rebuild ${n} derived dataset${n === 1 ? "" : "s"}: ${dropped.join(", ")}`, {
      duration: 8000,
    });
  }
  return idMap;
}

/** Rewrite dataset-id references inside each panel's `params` to the ids its derived datasets were replayed under; panel ids/titles untouched. */
export function remapLayoutParams(layoutJson: string, idMap: Map<string, string>): string {
  if (idMap.size === 0) return layoutJson;
  let layout: unknown;
  try {
    layout = JSON.parse(layoutJson);
  } catch {
    return layoutJson;
  }
  const panels = (layout as { panels?: Record<string, { params?: unknown }> })?.panels;
  if (!panels || typeof panels !== "object") return layoutJson;
  for (const panel of Object.values(panels)) {
    if (panel && typeof panel === "object" && panel.params && typeof panel.params === "object") {
      panel.params = remapArgs(panel.params, idMap);
    }
  }
  return JSON.stringify(layout);
}

function remapWorkspace(
  workspace: Record<string, string>,
  idMap: Map<string, string>,
): Record<string, string> {
  const layout = workspace[PANELS_KEY];
  if (!layout || idMap.size === 0) return workspace;
  return { ...workspace, [PANELS_KEY]: remapLayoutParams(layout, idMap) };
}

/** Set the live layout and apply it to the dockview if mounted, so panels reopen without a reload. On
 *  boot the dockview isn't ready; Dashboard reads the live layout on mount. */
function applyWorkspace(workspace: Record<string, string>): void {
  const layoutRaw = workspace[PANELS_KEY] ?? null;
  setLiveLayout(layoutRaw);
  const api = getDockviewApi();
  if (!api) return; // boot: dockview not mounted; Dashboard reads the live layout itself
  // Sync the dockview to the target (clear when it has no layout) so panels and layout never drift.
  try {
    if (layoutRaw) api.fromJSON(JSON.parse(layoutRaw));
    else api.clear();
  } catch (e) {
    console.error("persistence: apply layout failed", e);
  }
}

const missingRootOf = (r: RootEntry): MissingRoot => ({
  id: r.id,
  kind: r.kind,
  label: r.label,
  format: r.format,
  storeKind: r.storeKind,
});

/** Queue roots that could not be re-sourced (file missing, uncached bytes) for the relink dialog. */
function reportMissing(roots: RootEntry[]): void {
  if (roots.length) useRelink.getState().addMissing(roots.map(missingRootOf));
}

/** Once no roots are missing, replay any derived objects whose replay was deferred (they may have
 *  depended on a relinked root), then persist. Runs after every relink / skip / dismiss. */
export async function finalizeRelink(backend: BackendContext): Promise<void> {
  const { missing, pendingDerived } = useRelink.getState();
  if (missing.length === 0 && pendingDerived.length > 0) {
    const idMap = await replayDerived(backend, pendingDerived);
    useRelink.getState().clearPending();
    // The panels are already open (layout applied earlier with the pre-replay ids); re-point them at
    // the reconstructed derived datasets.
    const live = getLiveLayout();
    if (live && idMap.size > 0) applyWorkspace({ [PANELS_KEY]: remapLayoutParams(live, idMap) });
  }
  await saveCurrentSession();
}

/** Relink a missing root from a filesystem path (desktop) and persist the new path ref. */
export async function relinkRootFromPath(
  backend: BackendContext,
  m: MissingRoot,
  path: string,
): Promise<void> {
  await loadRootFromPath(backend, m, path);
  useRelink.getState().resolve(m.id);
  await finalizeRelink(backend);
}

/** Relink a missing root from picked/dropped file bytes (web) and persist (re-caching on wasm). */
export async function relinkRootFromBytes(
  backend: BackendContext,
  m: MissingRoot,
  bytes: Uint8Array,
): Promise<void> {
  const opts = { id: m.id, kind: m.kind, format: m.format, label: m.label };
  if (m.storeKind === "artifact") await loadArtifactCached(backend, opts, bytes);
  else await loadItemCached(backend, opts, bytes);
  addRestoredObject(m.storeKind, { id: m.id, kind: m.kind, label: m.label });
  useRelink.getState().resolve(m.id);
  await finalizeRelink(backend);
}

/** Skip a single missing root (leave it absent), then finalize (replay derived if it was the last). */
export async function skipMissingRoot(backend: BackendContext, id: string): Promise<void> {
  useRelink.getState().resolve(id);
  await finalizeRelink(backend);
}

/** Dismiss the relink dialog: skip all remaining, then replay derived best-effort with whatever roots
 *  did load. */
export async function dismissRelink(backend: BackendContext): Promise<void> {
  useRelink.getState().clearMissing();
  await finalizeRelink(backend);
}

/** Restore a bundled example root by re-fetching it from `public/examples/`; re-tags with `sampleId` so a later save re-emits the sample ref instead of embedding bytes. */
async function loadSampleRoot(backend: BackendContext, r: RootEntry, sampleId: string): Promise<boolean> {
  const sample = findSample(sampleId);
  if (!sample) {
    console.error(`persistence: unknown sample "${sampleId}" for root ${r.id}`);
    return false;
  }
  const d = await loadSampleIntoEngine(backend, sample);
  useDatasets.getState().addDataset({ id: d.id, kind: d.kind, label: r.label || d.label, sampleId });
  return true;
}

/** Load one root by its ref: sample, filesystem path (Tauri), inline bytes (.propel), or cached idb bytes (wasm). `recache` re-caches under the current project when opening a project file. */
async function loadRootFromRef(
  backend: BackendContext,
  project: string,
  r: RootEntry,
  recache: boolean,
): Promise<boolean> {
  if (r.ref.kind === "sample") return loadSampleRoot(backend, r, r.ref.id);
  if (r.ref.kind === "path") {
    await loadRootFromPath(backend, r, r.ref.path);
    return true;
  }
  let bytes: Uint8Array | undefined;
  let format = r.format;
  if (r.ref.kind === "inline") {
    bytes = await gunzip(fromB64(r.ref.bytesB64));
  } else if (r.ref.kind === "idb") {
    const blob = await getRoot(project, r.ref.key);
    if (blob) {
      bytes = await gunzip(new Uint8Array(blob.bytes));
      // The session manifest's root entries carry no format; the cached blob is authoritative.
      format = blob.format || r.format;
    }
  }
  if (!bytes) return false;
  if (recache) {
    const opts = { id: r.id, kind: r.kind, format, label: r.label };
    if (r.storeKind === "artifact") await loadArtifactCached(backend, opts, bytes);
    else await loadItemCached(backend, opts, bytes);
  } else if (r.storeKind === "artifact") {
    await backend.loadArtifactBytes(r.id, r.kind, bytes, format);
  } else {
    await backend.loadItem(r.id, r.kind, bytes, format);
  }
  addRestoredObject(r.storeKind, { id: r.id, kind: r.kind, label: r.label });
  return true;
}

async function restoreFromManifest(
  backend: BackendContext,
  project: string,
  manifest: Manifest,
  recache: boolean,
): Promise<{ restored: number; idMap: Map<string, string> }> {
  let restored = 0;
  const missing: RootEntry[] = [];
  for (const r of manifest.roots) {
    try {
      if (await loadRootFromRef(backend, project, r, recache)) restored++;
      else missing.push(r);
    } catch (e) {
      console.error(`persistence: restore root ${r.id} failed`, e);
      missing.push(r);
    }
  }
  reportMissing(missing);
  let idMap = new Map<string, string>();
  if (missing.length > 0) {
    // A root is unresolved; defer derived replay so transforms/discovery aren't rebuilt against a
    // missing source. `finalizeRelink` replays them once the gaps are relinked (or skipped).
    useRelink.getState().setPendingDerived(manifest.derived);
  } else {
    idMap = await replayDerived(backend, manifest.derived);
    restored += idMap.size;
  }
  return { restored, idMap };
}

/** Load a project into an (assumed empty) engine from its saved session: roots by ref, then replay
 *  derived, then apply the workspace. Falls back to raw cached blobs when no session was saved yet. */
export async function loadProjectIntoEngine(backend: BackendContext, project: string): Promise<number> {
  const session = await getSession(project);
  let restored: number;
  if (session) {
    const res = await restoreFromManifest(backend, project, session.manifest, false);
    restored = res.restored;
    applyWorkspace(remapWorkspace(session.workspace, res.idMap));
  } else {
    // Pre-session cache: synthesize a manifest of idb refs from the raw cached blobs.
    const roots = (await getAllRoots(project)).map(
      (b): RootEntry => ({
        id: b.id,
        kind: b.kind,
        label: b.label,
        format: b.format,
        storeKind: b.storeKind,
        ref: { kind: "idb", key: b.id },
      }),
    );
    const manifest: Manifest = { version: 1, roots, derived: [] };
    restored = (await restoreFromManifest(backend, project, manifest, false)).restored;
    applyWorkspace({});
  }
  await loadProjectPipelines(project);
  return restored;
}

/** Summary of the session Continue would reopen (last worked-in project, any backend), for the welcome-screen offer; null when there is nothing to continue. */
export async function lastSessionInfo(
  backend: BackendContext,
): Promise<{ name: string; datasets: number } | null> {
  const last = getLastProject();
  const live = await backend.listObjects();
  const session = await getSession(last);
  const restorable =
    live.length > 0 ||
    (session != null && session.manifest.roots.length + session.manifest.derived.length > 0) ||
    (await countRoots(last)) > 0;
  if (!restorable) return null;
  const name =
    (await listProjects()).find((p) => p.id === last)?.name ?? (last === DEFAULT_PROJECT ? "Default" : last);
  const datasets = session
    ? [...session.manifest.roots, ...session.manifest.derived].filter((o) => o.storeKind === "dataset").length
    : live.length;
  return { name, datasets };
}

/** Load a project's saved pipelines + working canvas from its idb session into the store (empties the
 *  store when the project has none). Frontend-only, so it runs on every transport. */
export async function loadProjectPipelines(project: string): Promise<void> {
  const session = await getSession(project);
  usePipelines.getState().load(session?.pipelines ?? { saved: [] });
}

let restoreOnce: Promise<number> | null = null;

/** "Continue previous session": reopen the last worked-in project, adopting a still-live engine or rebuilding from cache. Runs at most once per page load. */
export function continuePreviousSession(backend: BackendContext): Promise<number> {
  // Don't cache a rejected restore: on failure reset so the user can retry (else Continue stays
  // wedged on the same rejected promise until a reload).
  restoreOnce ??= doRestoreSession(backend).catch((e) => {
    restoreOnce = null;
    throw e;
  });
  return restoreOnce;
}

/** Decline the offer: adopt the current empty session so the previous one is no longer offered.
 *  Non-destructive -- cached bytes stay and named projects remain in the switcher. */
export async function declineRestore(): Promise<void> {
  restoreOnce = Promise.resolve(0); // a later Continue must not re-run the restore we declined
  setLastProject(getCurrentProject());
  armSessionSaves();
  await saveCurrentSession();
}

/** Wipe the current project's cached bytes, saved session, and pending relink: the escape hatch for
 *  a poisoned or unwanted session. Leaves the (now empty) project active. */
export async function clearCurrentProjectData(backend: BackendContext): Promise<void> {
  const id = getCurrentProject();
  restoreOnce = Promise.resolve(0);
  useRelink.getState().clearMissing();
  useRelink.getState().clearPending();
  await clearSession(backend);
  await deleteProjectRoots(id);
  await deleteSession(id);
  usePipelines.getState().clear();
  applyWorkspace({});
  armSessionSaves();
  await saveCurrentSession();
}

async function doRestoreSession(backend: BackendContext): Promise<number> {
  const last = getLastProject();
  const live = (await backend.listObjects()).length > 0;
  setCurrentProject(last);
  setLastProject(last);
  armSessionSaves();
  if (live) {
    // Engine already holds the data (tauri/webserver reload); still restore the project's panel
    // layout + pipelines (boot cleared the live workspace). Caller reconciles the stores.
    const session = await getSession(last);
    applyWorkspace(session?.workspace ?? {});
    await loadProjectPipelines(last);
    return 0;
  }
  return loadProjectIntoEngine(backend, last);
}

/** The project registry plus the active id, ensuring a Default entry always exists. */
export async function listProjectsWithCurrent(): Promise<{ projects: ProjectMeta[]; current: string }> {
  let projects = await listProjects();
  if (!projects.some((p) => p.id === DEFAULT_PROJECT)) {
    await putProject({ id: DEFAULT_PROJECT, name: "Default", updatedAt: 0 });
    projects = await listProjects();
  }
  return { projects, current: getCurrentProject() };
}

function newProjectId(): string {
  return `p-${crypto.randomUUID()}`;
}

/** Save the current session, create a fresh empty project, and switch to it. */
export async function createProject(backend: BackendContext, name: string): Promise<string> {
  await saveCurrentSession();
  const id = newProjectId();
  await putProject({ id, name: name.trim() || "Untitled", updatedAt: Date.now() });
  setCurrentProject(id);
  setLastProject(id);
  await clearSession(backend);
  applyWorkspace({});
  usePipelines.getState().clear();
  armSessionSaves();
  return id;
}

/** Persist the current project, then load `id` in its place (data + panels). */
export async function switchProject(backend: BackendContext, id: string): Promise<void> {
  if (id === getCurrentProject()) return;
  await saveCurrentSession();
  setCurrentProject(id);
  setLastProject(id);
  await clearSession(backend);
  await loadProjectIntoEngine(backend, id);
  armSessionSaves();
  const meta = (await listProjects()).find((p) => p.id === id);
  if (meta) await putProject({ ...meta, updatedAt: Date.now() });
}

export async function renameProject(id: string, name: string): Promise<void> {
  const meta = (await listProjects()).find((p) => p.id === id);
  if (meta) await putProject({ ...meta, name: name.trim() || meta.name });
}

/** Delete a project and its data; if it was active, fall back to Default. */
export async function deleteProject(backend: BackendContext, id: string): Promise<void> {
  if (id === DEFAULT_PROJECT) return;
  await deleteProjectRoots(id);
  await deleteSession(id);
  await idbDeleteProject(id);
  if (getCurrentProject() === id) {
    setCurrentProject(DEFAULT_PROJECT);
    await clearSession(backend);
    await loadProjectIntoEngine(backend, DEFAULT_PROJECT);
  }
}

/** Serialize the current session (data + workspace) to a portable `.propel` file and save it. */
export async function saveProjectFile(backend: BackendContext): Promise<void> {
  const { manifest, blobs } = await buildCurrentManifest();
  const bytes = await serializeProject(
    manifest,
    async (key) => {
      const blob = blobs.get(key);
      return blob ? new Uint8Array(blob.bytes) : undefined;
    },
    captureWorkspace(),
    usePipelines.getState().snapshot(),
  );
  await backend.saveBytes(bytes, "session.propel", "application/octet-stream");
}

/** Open a `.propel` payload as a NEW project (data + panels), leaving existing projects intact. */
export async function openProjectFile(
  backend: BackendContext,
  data: Uint8Array,
  name = "Opened project",
): Promise<number> {
  const { manifest, workspace, pipelines } = parseProject(data);
  await saveCurrentSession();
  const id = newProjectId();
  await putProject({ id, name, updatedAt: Date.now() });
  setCurrentProject(id);
  setLastProject(id);
  await clearSession(backend);
  const { restored, idMap } = await restoreFromManifest(backend, id, manifest, true);
  applyWorkspace(remapWorkspace(workspace, idMap));
  usePipelines.getState().load(pipelines);
  armSessionSaves();
  return restored;
}
