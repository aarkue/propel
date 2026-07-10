/** Minimal ELK types we rely on. elkjs' own types are imprecise for the `elk.bundled.js` entry, so
 *  we describe just the graph in/out shapes used by the layout adapters here. */
export type ElkPoint = { x: number; y: number };

export type ElkGraphNode = {
  id: string;
  width: number;
  height: number;
  layoutOptions?: Record<string, string>;
};

export type ElkGraphEdge = {
  id: string;
  sources: string[];
  targets: string[];
  labels?: { width: number; height: number; layoutOptions?: Record<string, string> }[];
};

export type ElkGraph = {
  id: string;
  layoutOptions?: Record<string, string>;
  children: ElkGraphNode[];
  edges: ElkGraphEdge[];
};

export type ElkLaidOut = {
  children?: Array<{ id: string; x?: number; y?: number }>;
  edges?: Array<{
    id: string;
    sections?: Array<{ startPoint: ElkPoint; endPoint: ElkPoint; bendPoints?: ElkPoint[] }>;
  }>;
};

type ElkInstance = { layout: (g: ElkGraph) => Promise<ElkLaidOut> };

let elkPromise: Promise<ElkInstance> | null = null;

/**
 * Lazily load the bundled (synchronous, worker-free) elkjs engine and memoize a single instance.
 * The dynamic import keeps elkjs out of the main chunk - it only lands in an async chunk pulled in
 * when an ELK layout is actually requested, so the Rust default never pays for it.
 */
export async function loadElk(): Promise<ElkInstance> {
  if (!elkPromise) {
    elkPromise = import("elkjs/lib/elk.bundled.js").then((mod) => {
      const ELK = (mod as unknown as { default: new () => ElkInstance }).default;
      return new ELK();
    });
  }
  return elkPromise;
}
