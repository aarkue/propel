import { CardPickerButton } from "@r4pm/components/ui";
import type { ReactNode } from "react";
import { PiChartLineUp, PiPencilSimple, PiShareNetwork, PiTreeStructure } from "react-icons/pi";
import { addPanelToDockview } from "../../panels/registry";

/** A panel that produces a model the user can save. */
export interface ModelSource {
  panel: string;
  title: string;
  description: string;
  icon: ReactNode;
}

export const PETRI_NET_SOURCES: ModelSource[] = [
  {
    panel: "petriNet",
    title: "Petri Net",
    description: "Inductive Miner or Alpha+++ on this log",
    icon: <PiTreeStructure />,
  },
  {
    panel: "modelSweep",
    title: "Model Sweep",
    description: "Nets over a range of noise thresholds, compared by F-score",
    icon: <PiChartLineUp />,
  },
  {
    panel: "petriNetEditor",
    title: "Petri Net Editor",
    description: "Draw a net or import a PNML file",
    icon: <PiPencilSimple />,
  },
];

export const OCPN_SOURCES: ModelSource[] = [
  {
    panel: "ocpn",
    title: "Object-Centric Petri Net",
    description: "Inductive Miner per object type on this OCEL",
    icon: <PiShareNetwork />,
  },
  {
    panel: "ocpnEditor",
    title: "OCPN Editor",
    description: "Draw an object-centric Petri net",
    icon: <PiPencilSimple />,
  },
];

/** Opens a panel that makes a model of a kind for dataset `datasetId`, letting the user pick the
 *  panel when there are several. */
export function DiscoverModelButton({
  datasetId,
  label,
  sources,
}: {
  datasetId: string;
  label: string;
  sources: ModelSource[];
}) {
  return (
    <CardPickerButton
      label={label}
      icon={sources[0]?.icon}
      heading="Opens the panel. Save the model there to use it here."
      options={sources.map((s) => ({
        value: s.panel,
        title: s.title,
        description: s.description,
        icon: s.icon,
      }))}
      onPick={(panel) => addPanelToDockview(panel, undefined, { datasetId })}
    />
  );
}
