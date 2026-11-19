import type { EventLogHandle } from "@r4pm/client";
import {
  DatasetSelector,
  DfgDiffViewer,
  EmptyState,
  ErrorState,
  LoadingState,
  type Option,
  OptionMenu,
  Toolbar,
  ToolbarDivider,
} from "@r4pm/components";
import { Flex, IconButton, Text, TextField } from "@r4pm/components/ui";
import { useQuery } from "@tanstack/react-query";
import type { IDockviewPanelProps } from "dockview";
import { PiGitDiff, PiX } from "react-icons/pi";
import { backend } from "../backends";
import { usePanelState } from "../panels/panel-state";
import { useDatasets } from "../stores";
import { definePanel } from "./define-vis";

const COMPARE_LOGS = "app_bindings::compare_dfgs" as const;
const COMPARE_PERIODS = "app_bindings::compare_dfg_periods" as const;

type Mode = "periods" | "logs";
const MODES: Option<Mode>[] = [
  {
    value: "periods",
    label: "Two periods of a log",
    description: "Cases starting before a date (A) against cases starting from it (B).",
  },
  {
    value: "logs",
    label: "Two logs",
    description: "Any two event logs, e.g., a log and a filtered copy of it.",
  },
];
interface Settings {
  mode: Mode;
  a: string | null;
  b: string | null;
  /** `YYYY-MM-DD`; empty splits at the median case start. */
  split: string;
}

function DfgComparePanel(props: IDockviewPanelProps) {
  const logs = useDatasets((s) => s.datasets).filter((d) => d.kind === "EventLog");
  const [s, setS] = usePanelState<Settings>(props, "compare", {
    mode: "periods",
    a: null,
    b: null,
    split: "",
  });
  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch });
  const pick = (id: string | null, fallback: number) =>
    id && logs.some((l) => l.id === id) ? id : (logs[fallback]?.id ?? logs[0]?.id ?? null);
  const a = pick(s.a, 0);
  const b = pick(s.b, 1);
  // Midnight of the picked day where the user is, as the date field shows it.
  const splitMs = s.split ? new Date(`${s.split}T00:00:00`).getTime() : Number.NaN;

  const query = useQuery({
    queryKey: ["dfg-compare", s.mode, a, b, s.mode === "periods" ? s.split : null],
    enabled: !!a && (s.mode === "periods" || !!b),
    queryFn: () =>
      s.mode === "periods"
        ? backend.callBinding(COMPARE_PERIODS, {
            event_log: a as EventLogHandle,
            split_ms: Number.isNaN(splitMs) ? null : splitMs,
          })
        : backend.callBinding(COMPARE_LOGS, { log_a: a as EventLogHandle, log_b: b as EventLogHandle }),
  });

  const selector = (letter: string, value: string | null, onChange: (id: string) => void) => (
    <Flex align="center" gap="2">
      <span className="r4pm-eyebrow">{letter}</span>
      <div style={{ width: 230 }}>
        <DatasetSelector datasets={logs} value={value} onChange={onChange} searchable />
      </div>
    </Flex>
  );

  return (
    <Flex direction="column" style={{ height: "100%" }}>
      <Toolbar>
        <OptionMenu label="Compare" value={s.mode} options={MODES} onChange={(mode) => set({ mode })} />
        <ToolbarDivider />
        {selector(s.mode === "periods" ? "Log" : "A", a, (id) => set({ a: id }))}
        {s.mode === "logs" ? (
          selector("B", b, (id) => set({ b: id }))
        ) : (
          <Flex align="center" gap="2">
            <span className="r4pm-eyebrow">Split at</span>
            <TextField.Root
              size="1"
              type="date"
              value={s.split}
              onChange={(e) => set({ split: e.target.value })}
              style={{ width: 150 }}
            >
              {s.split && (
                <TextField.Slot side="right">
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    onClick={() => set({ split: "" })}
                    aria-label="Split at the median case start"
                  >
                    <PiX />
                  </IconButton>
                </TextField.Slot>
              )}
            </TextField.Root>
            {!s.split && (
              <Text size="1" color="gray">
                median case start
              </Text>
            )}
          </Flex>
        )}
      </Toolbar>
      <div data-export-root style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {logs.length === 0 ? (
          <EmptyState
            title="No event log loaded"
            description="Load one or two event logs to compare their DFGs."
          />
        ) : s.mode === "logs" && logs.length < 2 ? (
          <EmptyState
            title="One event log loaded"
            description="Load a second log, derive one with a transform, or compare two periods of this log."
          />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : !query.data ? (
          <LoadingState label="comparing" />
        ) : (
          <DfgDiffViewer
            data={query.data}
            note={
              s.mode === "periods"
                ? "Cases that start late in B may still be running when the log ends, so their later arcs and end arcs look rarer there."
                : undefined
            }
          />
        )}
      </div>
    </Flex>
  );
}

export const vis = definePanel({
  type: "dfgCompare",
  name: "DFG Comparison",
  description:
    "Two logs or two periods on one DFG, with arcs colored by the change in how often cases take them.",
  category: "activities",
  tags: ["variants"],
  icon: PiGitDiff,
  supports: ["EventLog"],
  keywords: ["compare", "difference", "diff", "drift", "before after", "delta", "periods"],
  order: 6,
  component: DfgComparePanel,
});
