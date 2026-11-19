import type { SlimLinkedOCELHandle } from "@r4pm/client";
import {
  applyOcelQuickAdd,
  applyQuickAdd,
  baseElements,
  EMPTY_LOG,
  EMPTY_OCEL,
  type EventLogModel,
  type OcelModel,
  normalizePetriNet,
} from "@r4pm/components";
import { type Blueprint, fromBlueprint } from "@r4pm/components/extraction-blueprint";
import { layoutPetriElements } from "@r4pm/components/petri";
import { backend, vizTransport } from "../backends";
import { saveModel } from "../models";
import { defaultTransformForType, type PaletteType } from "../transforms/catalog";
import { exportLineageAsPipeline } from "../shell/export-lineage";
import { useDatasets } from "../stores";
import { DEFAULT_MINER, discoverPetriNet } from "../vis/_discovery";
import { discoverOcpn, OCPN_DISCOVERY_DEFAULTS } from "../vis/_ocpn-discovery";
import blueprint from "./blueprint.json";

/**
 * How each panel is shown for its thumbnail in the panel picker (`scripts/thumbnails.mjs`): the
 * sample it opens on, the settings it starts with and the buttons pressed once it has loaded. Every
 * panel in the picker gets a demo, so each card shows the panel in use.
 */
export interface Demo {
  /** Panel params besides the dataset, computed in the app. */
  params?: (env: DemoEnv) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** Run once the panel is open, for a panel that keeps its state outside its params. */
  setup?: (env: DemoEnv) => Promise<void>;
  /** Buttons pressed in turn once the panel has loaded, by their text or accessible name. */
  press?: string[];
  /** Milliseconds to wait after loading, e.g., for an animation to get going (default 800). */
  wait?: number;
}

export interface DemoEnv {
  /** The Road Traffic Fine Management sample. */
  log: string;
  /** The Order Management sample. */
  ocel: string;
}

const GET_OCEL_OBJECT_IDS = "app_bindings::get_ocel_object_ids" as const;
const FLATTEN_OCEL_ON = "process_mining::flatten_ocel_on" as const;
const GET_OBJECT_ATTRIBUTE_CHANGES = "process_mining::get_object_attribute_changes" as const;

/** `make` once per key: each panel is captured in two themes, the net is discovered and saved once. */
function once<T>(make: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const made = new Map<string, Promise<T>>();
  return (key) => {
    if (!made.has(key)) made.set(key, make(key));
    return made.get(key) as Promise<T>;
  };
}

const discovered = once((log) => discoverPetriNet(backend, log, DEFAULT_MINER));
const discoveredNet = (env: DemoEnv) => discovered(env.log);

/** A Petri net discovered from the log and saved, for the views that check a log against one. */
const saved = once(async (log) => saveModel("AcceptingPetriNet", "Demo net", await discovered(log)));
const savedNet = (env: DemoEnv) => saved(env.log);

/** Of a spread of objects, the one with the longest history of one attribute. */
async function changingObject(ocel: string): Promise<string> {
  const ids = await backend.callBinding(GET_OCEL_OBJECT_IDS, { ocel: ocel as SlimLinkedOCELHandle });
  const step = Math.max(1, Math.floor(ids.length / 200));
  let best = { id: ids[0] ?? "", changes: 0 };
  for (let i = 0; i < ids.length; i += step) {
    const res = (await backend.callBinding(GET_OBJECT_ATTRIBUTE_CHANGES, {
      ocel: ocel as SlimLinkedOCELHandle,
      object_id: ids[i],
    })) as { traces: Record<string, unknown[]> };
    const changes = Math.max(0, ...Object.values(res.traces).map((t) => t.length));
    if (changes > best.changes) best = { id: ids[i], changes };
  }
  return best.id;
}

/** A transform builder with some steps on `dataset`, not run. */
const transforms = (dataset: string, types: PaletteType[], outName: string) => ({
  transformBuilder: {
    forDataset: dataset,
    value: {
      transforms: types.map((t, i) => ({
        id: `demo-${i}`,
        value: defaultTransformForType(t),
        enabled: true,
      })),
      outName,
    },
  },
});

const LOG: EventLogModel = [
  "c1 > Register Check Approve Pay",
  "c2 > Register Check Reject Notify",
  "c3 > Register Check Approve Pay",
  "c4 > Register Escalate Check Approve Pay",
].reduce<EventLogModel>((m, line) => applyQuickAdd(m, line), {
  ...EMPTY_LOG,
  attrColumns: [{ name: "Amount", type: "int" }],
});

const OCEL: OcelModel = [
  "place_order Order:o1 Item:i1 Item:i2 Customer:c1",
  "confirm Order:o1",
  "pick Item:i1",
  "pick Item:i2",
  "pack Package:k1 Item:i1 Item:i2",
  "ship Package:k1 Order:o1",
  "place_order Order:o2 Item:i3 Customer:c1",
  "pick Item:i3",
].reduce<OcelModel>((m, line) => applyOcelQuickAdd(m, line), EMPTY_OCEL);

export const DEMOS: Record<string, Demo> = {
  "group:conformance": {
    params: async (env) => ({
      tab: "model",
      "tab.model": { controls: { type: "net", id: await savedNet(env) } },
      autorun: true,
    }),
  },
  modelSweep: { press: ["Run sweep"] },
  "group:ocDeclare": { press: ["Discover"] },
  processAnimation: { press: ["Play"], wait: 5000 },
  ocelAnimation: { press: ["Play"], wait: 5000 },
  objectChanges: {
    params: async (env) => ({ objectID: { forDataset: env.ocel, value: await changingObject(env.ocel) } }),
  },
  flattenOcel: {
    params: (env) => ({ objectType: { forDataset: env.ocel, value: "orders" } }),
    press: ["Flatten"],
  },
  petriNetEditor: {
    // The editor fits the net into view after mounting.
    wait: 3000,
    params: async (env) => {
      const net = normalizePetriNet(await discoveredNet(env));
      const graph = await layoutPetriElements(vizTransport, net, baseElements(net));
      return { graph: { nodes: graph.nodes, edges: graph.edges } };
    },
  },
  ocpnEditor: {
    params: async (env) => ({ net: await discoverOcpn(backend, env.ocel, OCPN_DISCOVERY_DEFAULTS) }),
  },
  eventLogEditor: { params: () => ({ model: LOG, name: "Claims" }) },
  ocelEditor: { params: () => ({ model: OCEL, name: "Orders" }) },
  logTransforms: {
    params: (env) => transforms(env.log, ["FilterActivities", "FilterStartEnd", "Sample"], "Cleaned log"),
  },
  ocelTransforms: {
    params: (env) =>
      transforms(env.ocel, ["FilterObjectTypes", "FilterMinRelatedEvents", "Sample"], "Cleaned OCEL"),
  },
  pipeline: {
    // The lineage of a flattened OCEL, as "Export as pipeline" opens it.
    setup: async (env) => {
      const handle = await backend.callBinding(FLATTEN_OCEL_ON, {
        ocel: env.ocel as SlimLinkedOCELHandle,
        object_type: "orders",
      });
      const made = (await backend.listObjects()).find((o) => o.id === handle);
      useDatasets
        .getState()
        .addDataset({ id: handle, kind: "EventLog", label: "Orders", provenance: made?.provenance });
      await exportLineageAsPipeline(handle);
    },
  },
  "extraction-blueprint": { params: () => ({ blueprint: fromBlueprint(blueprint as unknown as Blueprint) }) },
};

/** The params panel `type` opens with for its thumbnail, on the sample of the kind it shows. */
export async function demoParams(
  type: string,
  supports: string[] | undefined,
  env: DemoEnv,
): Promise<Record<string, unknown>> {
  const datasetId = supports?.includes("EventLog")
    ? env.log
    : supports?.includes("SlimLinkedOCEL")
      ? env.ocel
      : undefined;
  const extra = (await DEMOS[type]?.params?.(env)) ?? {};
  return { ...(datasetId ? { datasetId } : {}), ...extra };
}

/** Panel `type`'s setup, once it is open. */
export async function demoSetup(type: string, env: DemoEnv): Promise<void> {
  await DEMOS[type]?.setup?.(env);
}
