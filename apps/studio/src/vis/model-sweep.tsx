import { type EventLogActivityProjectionHandle, isCancelled } from "@r4pm/client";
import type { IDockviewPanelProps } from "dockview";
import {
  EmptyState,
  fmtPct,
  Metric,
  MetricRow,
  type Option,
  OptionMenu,
  Section,
  Toolbar,
  ToolbarDivider,
} from "@r4pm/components";
import { bestThreshold, ModelSweepChart, type SweepPoint, visibleTransitions } from "@r4pm/components/charts";
import { Badge, Button, Flex, Text } from "@r4pm/components/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { PiChartLineUp, PiPlay, PiStop } from "react-icons/pi";
import { backend } from "../backends";
import { usePanelState } from "../panels/panel-state";
import { PetriNetPanel } from "./components/PetriNetPanel";
import { inductiveMiner, type MinerChoice, minerChoice, type MinerVariant } from "./_discovery";
import { MinerPicker } from "./components/MinerPicker";
import { minerSummary } from "./components/MinerPickerView";
import { type DatasetPanelProps, defineDatasetPanel } from "./define-vis";

const EVALUATE = "app_bindings::evaluate_inductive_net" as const;

/** The miners with a noise threshold to sweep. */
const SWEEP_VARIANTS: readonly MinerVariant[] = ["IMf", "IMa", "IMfd"];
const STEPS: Option<string>[] = [
  { value: "0.2", label: "6 thresholds", description: "0, 0.2, ..., 1." },
  { value: "0.1", label: "11 thresholds", description: "0, 0.1, ..., 1." },
  {
    value: "0.05",
    label: "21 thresholds",
    description: "0, 0.05, ..., 1. Takes about twice as long as 11 thresholds.",
  },
];

interface Settings {
  /** Its noise is not used: the sweep sets it per threshold. */
  miner: MinerChoice;
  step: string;
}

const settingsOf = (raw: Partial<Settings> | null | undefined): Settings => ({
  miner: minerChoice(raw?.miner, SWEEP_VARIANTS),
  step: STEPS.some((o) => o.value === raw?.step) ? (raw?.step as string) : "0.1",
});

const thresholdsOf = (step: string) => {
  const s = Number(step);
  const n = Math.round(1 / s);
  return Array.from({ length: n + 1 }, (_, i) => Math.round(i * s * 100) / 100);
};

type Quality = Awaited<ReturnType<typeof evaluate>>;
async function evaluate(log: string, s: Settings, threshold: number, signal?: AbortSignal) {
  const miner = await inductiveMiner(backend, { ...s.miner, noise: threshold });
  return backend.callBinding(EVALUATE, { log: log as EventLogActivityProjectionHandle, miner }, { signal });
}

function ModelSweep({ log, props }: { log: string; props: IDockviewPanelProps }) {
  const queryClient = useQueryClient();
  const [stored, setSettings] = usePanelState<Settings | null>(props, "sweep", null);
  const settings = settingsOf(stored);
  const [points, setPoints] = useState<SweepPoint[]>([]);
  const [models, setModels] = useState<Map<number, Quality>>(new Map());
  const [selected, setSelected] = useState<number | undefined>();
  const [running, setRunning] = useState(false);
  // The settings the shown points were measured with; changing the settings does not change them.
  const [ran, setRan] = useState<Settings | null>(null);
  const shown = ran ?? settings;
  const stale =
    !running && ran !== null && points.length > 0 && JSON.stringify(ran) !== JSON.stringify(settings);
  const stop = useRef(false);
  // Stops the point in flight too, not only the ones after it.
  const abort = useRef<AbortController | null>(null);
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });
  useEffect(
    () => () => {
      stop.current = true;
      abort.current?.abort();
    },
    [],
  );

  const run = async () => {
    const thresholds = thresholdsOf(settings.step);
    stop.current = false;
    abort.current = new AbortController();
    const { signal } = abort.current;
    setRunning(true);
    setRan(settings);
    setSelected(undefined);
    const results = new Map<number, Quality>();
    setModels(results);
    setPoints(thresholds.map((threshold) => ({ threshold })));
    let best: number | undefined;
    for (const t of thresholds) {
      if (stop.current) break;
      setPoints((ps) => ps.map((p) => (p.threshold === t ? { ...p, status: "running" } : p)));
      try {
        // Cached per log, settings and threshold, so re-running only computes what changed.
        const q = await queryClient.fetchQuery({
          queryKey: ["model-sweep", log, settings.miner, t],
          queryFn: () => evaluate(log, settings, t, signal),
          staleTime: Number.POSITIVE_INFINITY,
        });
        results.set(t, q);
        setPoints((ps) => ps.map((p) => (p.threshold === t ? { threshold: t, quality: q } : p)));
        if (best === undefined || (q.f_score ?? 0) > (results.get(best)?.f_score ?? 0)) {
          best = t;
          setSelected(t);
        }
      } catch (e) {
        if (isCancelled(e)) break;
        setPoints((ps) => ps.map((p) => (p.threshold === t ? { threshold: t, status: "error" } : p)));
      }
      setModels(new Map(results));
    }
    setPoints((ps) => ps.filter((p) => p.quality || p.status === "error"));
    setRunning(false);
  };

  const total = running ? points.length : 0;
  const finished = points.filter((p) => p.quality || p.status === "error").length;
  const selectedModel = selected != null ? models.get(selected) : undefined;
  const best = bestThreshold(points);

  const runButton = running ? (
    <Button
      size="2"
      color="red"
      variant="soft"
      onClick={() => {
        stop.current = true;
        abort.current?.abort();
      }}
    >
      <PiStop /> Stop
    </Button>
  ) : (
    <Flex align="center" gap="3">
      {stale && (
        <Text size="1" color="amber">
          Settings changed: the results are for {minerSummary(shown.miner, false)}, step {shown.step}
        </Text>
      )}
      <Button size="2" color={stale ? "amber" : undefined} onClick={() => void run()}>
        <PiPlay /> {points.length ? "Run again" : "Run sweep"}
      </Button>
    </Flex>
  );

  return (
    <Flex direction="column" style={{ height: "100%", minHeight: 0 }}>
      <Toolbar
        end={
          running ? (
            <Flex align="center" gap="3">
              <div
                style={{
                  width: 140,
                  height: 4,
                  borderRadius: 2,
                  background: "var(--gray-a4)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(finished / Math.max(1, total)) * 100}%`,
                    background: "var(--accent-9)",
                    transition: "width 300ms ease",
                  }}
                />
              </div>
              <Text size="1" color="gray" style={{ fontVariantNumeric: "tabular-nums" }}>
                {finished} of {total} measured
              </Text>
              {runButton}
            </Flex>
          ) : (
            runButton
          )
        }
      >
        <MinerPicker
          value={settings.miner}
          onChange={(miner) => set({ miner })}
          variants={SWEEP_VARIANTS}
          withNoise={false}
          disabled={running}
        />
        <ToolbarDivider />
        <OptionMenu
          label="Noise"
          value={settings.step}
          options={STEPS}
          onChange={(step) => set({ step })}
          disabled={running}
        />
      </Toolbar>
      {points.length === 0 ? (
        <EmptyState
          icon={<PiChartLineUp />}
          title="Compare models over noise thresholds"
          description={`Discovers a net with ${minerSummary(settings.miner, false)} at each threshold. Alignments give its fitness (how much of the log the net replays) and precision (how little else it allows). Points appear as they finish.`}
          action={
            <Button size="2" onClick={() => void run()}>
              <PiPlay /> Run sweep
            </Button>
          }
        />
      ) : (
        <Flex style={{ flex: 1, minHeight: 0 }}>
          <div
            style={{
              width: "min(48%, 680px)",
              padding: 16,
              overflow: "auto",
              borderRight: "1px solid var(--gray-a4)",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            {selectedModel && selected != null && (
              <Flex direction="column" gap="3">
                <Flex align="center" gap="2">
                  <Text size="4" weight="bold">
                    {minerSummary(shown.miner, false)} at noise {selected.toFixed(2)}
                  </Text>
                  {selected === best && (
                    <Badge color="violet" radius="full">
                      Best F-score
                    </Badge>
                  )}
                </Flex>
                <MetricRow>
                  <Metric
                    label="Fitness"
                    value={selectedModel.fitness != null ? fmtPct(selectedModel.fitness) : "n/a"}
                  />
                  <Metric
                    label="Precision"
                    value={selectedModel.precision != null ? fmtPct(selectedModel.precision) : "n/a"}
                  />
                  <Metric
                    label="F-score"
                    value={selectedModel.f_score != null ? fmtPct(selectedModel.f_score) : "n/a"}
                  />
                  <Metric
                    label="Size"
                    value={visibleTransitions(selectedModel)}
                    hint={`activities, ${selectedModel.silent_transitions} silent, ${selectedModel.places} places`}
                  />
                </MetricRow>
                {selectedModel.unaligned_variants > 0 && (
                  <Text size="1" color="amber">
                    {selectedModel.unaligned_variants} variants could not be aligned and are left out.
                  </Text>
                )}
              </Flex>
            )}
            <Section title="Quality per noise threshold">
              <ModelSweepChart data={points} threshold={selected} onThresholdChange={setSelected} />
            </Section>
          </div>
          <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
            {selectedModel ? (
              <PetriNetPanel
                key={selected}
                data={selectedModel.net}
                handle={log}
                controls={{ ...shown.miner, noise: selected ?? 0 }}
              />
            ) : (
              <EmptyState
                title="No model yet"
                description="After the sweep, the net with the highest F-score is shown here."
              />
            )}
          </div>
        </Flex>
      )}
    </Flex>
  );
}

function ModelSweepPanel({ id, props }: DatasetPanelProps) {
  return <ModelSweep log={id} props={props} />;
}

export const vis = defineDatasetPanel({
  needs: "EventLog",
  type: "modelSweep",
  name: "Model Sweep",
  description: "Discover nets over a range of noise thresholds and compare fitness, precision and size.",
  category: "models",
  tags: ["conformance"],
  icon: PiChartLineUp,
  supports: ["EventLog"],
  keywords: ["noise", "threshold", "inductive", "fitness", "precision", "f-score", "tradeoff", "pareto"],
  order: 8,
  component: ModelSweepPanel,
});
