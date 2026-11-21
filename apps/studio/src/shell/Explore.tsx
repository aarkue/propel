import type { EventLogHandle, SlimLinkedOCELHandle } from "@r4pm/client";
import { DatasetSelector, formatDuration } from "@r4pm/components";
import { Button, Heading, Text } from "@r4pm/components/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PiCompass, PiMagnifyingGlass } from "react-icons/pi";
import { backend } from "../backends";
import { addPanelToDockview } from "../panels/registry";
import { useDatasets } from "../stores";
import { type Kind, SectionView, sectionsFor } from "./PanelGallery";

const KINDS = ["EventLog", "SlimLinkedOCEL"];
const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

/** A fact from the data per analysis, from bindings that are quick to compute. */
function useFacts(datasetId: string | undefined, kind: string | undefined): Record<string, string> {
  const nets = useDatasets((s) => s.datasets.filter((d) => d.kind === "AcceptingPetriNet").length);
  const ocpns = useDatasets((s) => s.datasets.filter((d) => d.kind === "ObjectCentricPetriNet").length);
  const log = useQuery({
    queryKey: ["explore", "log", datasetId],
    enabled: kind === "EventLog" && !!datasetId,
    queryFn: () =>
      backend.callBinding("app_bindings::get_log_overview", {
        event_log: datasetId as EventLogHandle,
      }),
  });
  const ocel = useQuery({
    queryKey: ["explore", "ocel", datasetId],
    enabled: kind === "SlimLinkedOCEL" && !!datasetId,
    queryFn: () =>
      backend.callBinding("process_mining::ocel_type_stats", {
        ocel: datasetId as SlimLinkedOCELHandle,
      }),
  });
  const out: Record<string, string> = {};
  const o = log.data;
  if (o) {
    const top = o.top_variants[0];
    out.what = top
      ? `${o.num_variants.toLocaleString("en")} variants, the most frequent has ${pct(top.cases / Math.max(1, o.num_cases))} of cases`
      : `${o.num_variants.toLocaleString("en")} variants`;
    if (o.median_case_duration_ms != null)
      out.time = `Median case duration ${formatDuration(o.median_case_duration_ms)}`;
    const failed = o.health.findings.filter((f) => f.count > 0).length;
    out.data = failed
      ? `${failed} finding${failed === 1 ? "" : "s"} in ${o.health.findings.length} checks`
      : `No findings in ${o.health.findings.length} checks`;
  }
  out.fit = nets ? `${nets} saved Petri net${nets === 1 ? "" : "s"}` : "No saved Petri net yet";
  const s = ocel.data;
  if (s) {
    const objects = Object.values(s.object_type_counts as Record<string, number>);
    const events = Object.values(s.event_type_counts as Record<string, number>);
    out.ocelWhat = `${events.length} activities, ${objects.length} object types`;
  }
  out.ocelFit = ocpns ? `${ocpns} saved OCPN${ocpns === 1 ? "" : "s"}` : "No saved OCPN yet";
  return out;
}

/** The panels for a log, grouped by analysis. Shown on an empty dock and, from the header, over it. */
export function ExploreHome() {
  const datasets = useDatasets((s) => s.datasets);
  const logs = datasets.filter((d) => KINDS.includes(d.kind));
  const [chosen, setChosen] = useState<string | null>(null);
  const current = logs.find((d) => d.id === chosen) ?? logs[logs.length - 1];
  const facts = useFacts(current?.id, current?.kind);

  return (
    <div className="h-full w-full overflow-auto bg-[var(--color-background)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[var(--indigo-11)]">
              <PiCompass size={20} />
              <Heading size="5">Explore</Heading>
            </div>
            <Text size="2" color="gray">
              Click a panel to open it for the selected log.
            </Text>
          </div>
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
            <Button
              size="2"
              variant="soft"
              color="gray"
              className="shrink-0"
              onClick={() => window.dispatchEvent(new CustomEvent("propel-open-gallery"))}
            >
              <PiMagnifyingGlass /> Search panels
            </Button>
            {current && (
              <div className="min-w-0 flex-1 sm:w-[260px] sm:flex-none">
                <DatasetSelector datasets={logs} value={current.id} onChange={setChosen} searchable />
              </div>
            )}
          </div>
        </div>

        {!current && (
          <Text size="2" color="gray">
            Import an event log or OCEL to analyze it.
          </Text>
        )}

        {current && (
          <div className="flex flex-col gap-6">
            {sectionsFor(current.kind as Kind, "").map((s) => (
              <SectionView
                key={s.id}
                section={s}
                fact={facts[s.id]}
                onAdd={(type) => addPanelToDockview(type, undefined, { datasetId: current.id })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
