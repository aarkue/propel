import type { SlimLinkedOCELHandle } from "@r4pm/client";
import {
  type OcDfg,
  type Ocpn,
  OcpnAnimation,
  type OcpnAnimationData,
  type OcpnReplay,
  ProcessMapAnimation,
  type ProcessMapAnimationData,
  type ViewerProps,
  Segmented,
} from "@r4pm/components";
import { Flex } from "@r4pm/components/ui";
import { PiFilmStrip } from "react-icons/pi";
import { getOcpnValue } from "../models";
import { useDatasets } from "../stores";
import { OCPN_SOURCES } from "./components/DiscoverModelButton";
import { SavedModelPicker } from "./components/SavedModelPicker";
import { defineResolvedVis } from "./define-vis";

const DISCOVER_OCDFG = "process_mining::discover_ocdfg" as const;
const OBJECT_JOURNEYS = "app_bindings::get_object_journeys" as const;
const OCPN_REPLAY = "app_bindings::get_ocpn_replay" as const;

const OCPN_KIND = "ObjectCentricPetriNet";

type Model = "ocdfg" | "ocpn";
/** `ocpn` is the id of the saved OCPN replayed in the `ocpn` model. */
type Controls = { model?: Model; ocpn?: string | null };

const modelOf = (c: Controls | null | undefined): Model => (c?.model === "ocpn" ? "ocpn" : "ocdfg");
const ocpnId = (c: Controls | null | undefined): string | null =>
  typeof c?.ocpn === "string" ? c.ocpn : null;

type Data = { model: "ocdfg"; map: ProcessMapAnimationData } | { model: "ocpn"; replay: OcpnAnimationData };

export const vis = defineResolvedVis({
  type: "ocelAnimation",
  name: "Object Animation",
  description:
    "Objects as tokens moving in real time over the OC-DFG, or replayed on a saved OCPN with fitness and synchronization waits.",
  category: "ocel",
  tags: ["time", "conformance", "models"],
  icon: PiFilmStrip,
  supports: ["SlimLinkedOCEL"],
  keywords: [
    "animation",
    "replay",
    "movie",
    "tokens",
    "objects",
    "playback",
    "ocpn",
    "conformance",
    "fitness",
    "synchronization",
    "waiting",
  ],
  order: 16,
  controls: {
    initial: { model: "ocdfg", ocpn: null } as Controls,
    useMissing: (c) => {
      const id = ocpnId(c);
      const saved = useDatasets((s) => s.datasets).filter((d) => d.kind === OCPN_KIND);
      if (modelOf(c) !== "ocpn" || saved.some((d) => d.id === id)) return null;
      return saved.length
        ? "Pick a saved object-centric Petri net to replay"
        : "Save an object-centric Petri net to replay it here";
    },
  },
  source: {
    needs: "SlimLinkedOCEL",
    resolve: async (ctx, c): Promise<Data> => {
      const ocel = ctx.datasetId as SlimLinkedOCELHandle;
      if (modelOf(c) === "ocdfg") {
        const [ocdfg, journeys] = await Promise.all([
          ctx.backend.callBinding(DISCOVER_OCDFG, { ocel }),
          ctx.backend.callBinding(OBJECT_JOURNEYS, { ocel }),
        ]);
        const data = ocdfg as OcDfg;
        const types = Object.keys(data.object_type_to_dfg).sort();
        return { model: "ocdfg", map: { source: { kind: "ocdfg", data, types }, journeys } };
      }
      const id = ocpnId(c);
      if (!id) throw new Error("No object-centric Petri net selected.");
      const ocpn = await getOcpnValue(id);
      const replay = await ctx.backend.callBinding(OCPN_REPLAY, { ocel, ocpn }, ctx.job);
      return { model: "ocpn", replay: { ocpn: ocpn as Ocpn, replay: replay as OcpnReplay } };
    },
  },
  viewer: false,
  panelControlsBar: (c, set, datasetId) => {
    const model = modelOf(c);
    return (
      <Flex align="center" gap="3" wrap="wrap">
        <Segmented<Model>
          aria-label="Model"
          value={model}
          onChange={(m) => set({ ...c, model: m })}
          options={[
            { value: "ocdfg", label: "OC-DFG", description: "Objects move over the object-centric DFG" },
            {
              value: "ocpn",
              label: "OCPN",
              description: "Objects are replayed on a saved object-centric Petri net",
            },
          ]}
        />
        {model === "ocpn" && (
          <SavedModelPicker
            kind={OCPN_KIND}
            value={ocpnId(c)}
            onChange={(ocpn) => set({ ...c, model: "ocpn", ocpn })}
            datasetId={datasetId}
            label="Net"
            empty="No saved OCPN yet."
            discover={{ label: "Make an OCPN", sources: OCPN_SOURCES }}
          />
        )}
      </Flex>
    );
  },
  component: ({ data, ...config }: ViewerProps<Data>) =>
    data.model === "ocdfg" ? (
      <ProcessMapAnimation {...config} data={data.map} />
    ) : (
      <OcpnAnimation {...config} data={data.replay} />
    ),
});
