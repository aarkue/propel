import type { QueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useDatasets } from "./stores";
import type { BackendContext } from "@r4pm/client";

export interface SampleDataset {
  id: string;
  name: string;
  description: string;
  /** Display kind shown on the card badge. */
  kind: string;
  /** Path under the studio `public/` dir (served same-origin in every target). */
  path: string;
  /** Load the fetched bytes into the engine and return the store descriptor. */
  load: (backend: BackendContext, bytes: Uint8Array) => Promise<{ id: string; kind: string; label: string }>;
}

/**
 * Propel's bundled example datasets (served from `public/examples/`):
 * the Road Traffic Fine Management (RTFM) event log and the Order Management OCEL.
 */
export const SAMPLE_DATASETS: SampleDataset[] = [
  {
    id: "rtfm",
    name: "Road Traffic Fine Management",
    description:
      "Real-life event log of an information system managing road traffic fines (de Leoni & Mannhardt).",
    kind: "EventLog",
    path: "examples/Road_Traffic_Fine_Management_Process.xes.gz",
    load: async (backend, bytes) => {
      // The dev server may transparently gunzip the response (vite/Content-Encoding), so pick the
      // format from the actual bytes: gzip magic (1f 8b) -> still compressed, else already decompressed.
      const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
      await backend.loadItem("rtfm", "EventLog", bytes, gzipped ? "xes.gz" : "xes");
      return { id: "rtfm", kind: "EventLog", label: "Road Traffic Fine Management" };
    },
  },
  {
    id: "order-management",
    name: "Order Management OCEL",
    description: "Simulated process managing customer orders within a company (Knopp & van der Aalst).",
    kind: "SlimLinkedOCEL",
    path: "examples/order-management.xml.gz",
    load: async (backend, bytes) => {
      const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
      // The dev server may transparently gunzip the response (vite/Content-Encoding), so pick the
      // format from the actual bytes: gzip magic (1f 8b) -> still compressed, else already decompressed.
      await backend.loadItem("order-management", "SlimLinkedOCEL", bytes, gzipped ? "xml.gz" : ".ocel.xml");
      return { id: "order-management", kind: "SlimLinkedOCEL", label: "Order Management" };
    },
  },
];

export async function loadSample(
  backend: BackendContext,
  queryClient: QueryClient,
  sample: SampleDataset,
): Promise<void> {
  await toast.promise(
    (async () => {
      const url = new URL(sample.path, document.baseURI).toString();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const d = await sample.load(backend, bytes);
      useDatasets.getState().addDataset(d);
      await queryClient.invalidateQueries();
    })(),
    {
      loading: `Loading ${sample.name}…`,
      success: `Loaded ${sample.name}!`,
      error: (e) => `Failed to load: ${String(e)}`,
    },
  );
}
