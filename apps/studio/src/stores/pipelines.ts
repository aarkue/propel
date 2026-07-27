import type { Edge } from "@xyflow/react";
import { create } from "zustand";
import { getSession, putSession } from "../persistence/idb";
import type { AppNode, ProjectPipelines, SavedPipeline } from "../pipeline/components/pipeline/editor/types";
import { slimNode } from "../pipeline/pipeline-slim";

interface PipelinesState {
  saved: SavedPipeline[];
  draft: { nodes: AppNode[]; edges: Edge[] } | null;
  /** Bumped only on `load`/`clear` (a project switch/open), never on save/delete/setDraft. Lets the
   *  editor reset its canvas to the incoming project's draft without reacting to its own autosaves. */
  loadSeq: number;
  savePipeline: (name: string, nodes: AppNode[], edges: Edge[]) => void;
  deletePipeline: (name: string) => void;
  setDraft: (nodes: AppNode[], edges: Edge[]) => void;
  load: (p: ProjectPipelines) => void;
  clear: () => void;
  snapshot: () => ProjectPipelines;
}

/** The active project's pipeline state: named/saved pipelines + the unsaved working canvas. Nodes are slimmed on write so persisted state never carries React Flow transient data. */
export const usePipelines = create<PipelinesState>((set, get) => ({
  saved: [],
  draft: null,
  loadSeq: 0,
  savePipeline: (name, nodes, edges) => {
    if (!name) return;
    const slim: SavedPipeline = { name, nodes: nodes.map(slimNode), edges, createdAt: Date.now() };
    set((s) => ({ saved: [...s.saved.filter((p) => p.name !== name), slim] }));
  },
  deletePipeline: (name) => set((s) => ({ saved: s.saved.filter((p) => p.name !== name) })),
  setDraft: (nodes, edges) => set({ draft: { nodes: nodes.map(slimNode), edges } }),
  load: (p) => set((s) => ({ saved: p.saved ?? [], draft: p.draft ?? null, loadSeq: s.loadSeq + 1 })),
  clear: () => set((s) => ({ saved: [], draft: null, loadSeq: s.loadSeq + 1 })),
  snapshot: () => {
    const { saved, draft } = get();
    return draft ? { saved, draft } : { saved };
  },
}));

const LEGACY_LIB = "r4pm-pipelines";
const LEGACY_DRAFT = "r4pm-pipeline-draft";

/** Fold the pre-project global pipeline library + draft (localStorage) into `project`'s session once, then delete the legacy keys. Idempotent. */
export async function migrateLegacyPipelines(project: string): Promise<boolean> {
  let saved: SavedPipeline[] = [];
  let draft: { nodes: AppNode[]; edges: Edge[] } | undefined;
  try {
    const lib = localStorage.getItem(LEGACY_LIB);
    const d = localStorage.getItem(LEGACY_DRAFT);
    if (!lib && !d) return false;
    if (lib)
      saved = (JSON.parse(lib) as SavedPipeline[]).map((p) => ({ ...p, nodes: p.nodes.map(slimNode) }));
    if (d) {
      const parsed = JSON.parse(d) as { nodes: AppNode[]; edges: Edge[] };
      draft = { nodes: parsed.nodes.map(slimNode), edges: parsed.edges };
    }
    localStorage.removeItem(LEGACY_LIB);
    localStorage.removeItem(LEGACY_DRAFT);
  } catch {
    return false;
  }
  const session = await getSession(project);
  const pipelines: ProjectPipelines = draft ? { saved, draft } : { saved };
  await putSession(project, {
    manifest: session?.manifest ?? { version: 1, roots: [], derived: [] },
    workspace: session?.workspace ?? {},
    pipelines,
  });
  return true;
}
