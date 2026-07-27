import {
  Button,
  Checkbox,
  Dialog,
  Flex,
  IconButton,
  Select,
  Switch,
  Text,
  TextField,
} from "@r4pm/components/ui";
import type React from "react";
import { useId, useState } from "react";
import { PiRobotBold, PiX } from "react-icons/pi";
import type { OCDeclareArc } from "../index";
import type { DiscoveryOptions } from "./edit-context";

const ARROW_TYPES = ["AS", "EF", "EP", "DF", "DP"] as const;
const O2O_MODES: DiscoveryOptions["o2o_mode"][] = ["None", "Direct", "Reversed", "Bidirectional"];
const REDUCTIONS: DiscoveryOptions["reduction"][] = ["None", "Lossless", "Lossy"];

const DEFAULTS: DiscoveryOptions = {
  noise_threshold: 0.2,
  o2o_mode: "None",
  counts_for_generation: [1, 20],
  counts_for_filter: [1, 20],
  reduction: "Lossless",
  refinement: true,
  considered_arrow_types: ["AS", "EF", "EP"],
};

/** Max-count filter mode, derived from the two count pairs (mirrors OCPQ's tri-state select). */
function countMode(o: DiscoveryOptions): "no-max" | "after" | "during" {
  if (o.counts_for_filter[1] === null) return "no-max";
  if (o.counts_for_generation[1] === null) return "after";
  return "during";
}

/** Discovery options dialog. Runs `onDiscover(options)` and hands the resulting arcs to `onResult`
 *  (the host merges them into the model + re-lays out). Ported from OCPQ `OCDeclareDiscoveryButton`. */
export function DiscoveryPanel({
  open,
  onOpenChange,
  eventTypes,
  onDiscover,
  onResult,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventTypes: string[];
  onDiscover: (options: DiscoveryOptions) => Promise<OCDeclareArc[]>;
  onResult: (arcs: OCDeclareArc[]) => void;
}) {
  const [opts, setOpts] = useState<DiscoveryOptions>(DEFAULTS);
  const [running, setRunning] = useState(false);
  const idPrefix = useId();
  const o2oModeId = `${idPrefix}-o2o-mode`;
  const noiseThresholdId = `${idPrefix}-noise-threshold`;
  const maxCountFilterId = `${idPrefix}-max-count-filter`;
  const reductionId = `${idPrefix}-reduction`;
  const patch = (p: Partial<DiscoveryOptions>) => setOpts((o) => ({ ...o, ...p }));

  const toggleArrow = (t: string) =>
    patch({
      considered_arrow_types: opts.considered_arrow_types.includes(t)
        ? opts.considered_arrow_types.filter((x) => x !== t)
        : [...opts.considered_arrow_types, t],
    });

  const setCountMode = (mode: "no-max" | "after" | "during") => {
    if (mode === "no-max")
      patch({ counts_for_filter: [1, null], counts_for_generation: [1, null], refinement: false });
    else if (mode === "after")
      patch({ counts_for_filter: [1, 20], counts_for_generation: [1, null], refinement: false });
    else patch({ counts_for_filter: [1, 20], counts_for_generation: [1, 20] });
  };

  const run = async () => {
    setRunning(true);
    try {
      const arcs = await onDiscover(opts);
      onResult(arcs);
      onOpenChange(false);
    } finally {
      setRunning(false);
    }
  };

  const usingAll = opts.acts_to_use === undefined;
  const refinementDisabled = opts.counts_for_filter[1] == null || opts.counts_for_generation[1] == null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="2" maxWidth="420px">
        <Flex justify="between" align="center" mb="3">
          <Dialog.Title mb="0" size="3">
            Auto-discover constraints
          </Dialog.Title>
          <Dialog.Close>
            <IconButton size="1" variant="ghost" color="gray">
              <PiX />
            </IconButton>
          </Dialog.Close>
        </Flex>

        <Flex direction="column" gap="3">
          <Field label="O2O mode" htmlFor={o2oModeId}>
            <Select.Root
              value={opts.o2o_mode}
              onValueChange={(v) => patch({ o2o_mode: v as DiscoveryOptions["o2o_mode"] })}
            >
              <Select.Trigger id={o2oModeId} />
              <Select.Content>
                {O2O_MODES.map((v) => (
                  <Select.Item key={v} value={v}>
                    {v}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Field>

          <Field label="Noise threshold" htmlFor={noiseThresholdId}>
            <TextField.Root
              id={noiseThresholdId}
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={String(opts.noise_threshold)}
              onChange={(e) => patch({ noise_threshold: e.currentTarget.valueAsNumber })}
            />
          </Field>

          <Field label="Max-count filter" htmlFor={maxCountFilterId}>
            <Select.Root
              value={countMode(opts)}
              onValueChange={(v) => setCountMode(v as "no-max" | "after" | "during")}
            >
              <Select.Trigger id={maxCountFilterId} />
              <Select.Content>
                <Select.Item value="no-max">No max counts</Select.Item>
                <Select.Item value="after">Filter after discovery</Select.Item>
                <Select.Item value="during">Filter during discovery</Select.Item>
              </Select.Content>
            </Select.Root>
          </Field>

          <Field label="Reduction" htmlFor={reductionId}>
            <Select.Root
              value={opts.reduction}
              onValueChange={(v) => patch({ reduction: v as DiscoveryOptions["reduction"] })}
            >
              <Select.Trigger id={reductionId} />
              <Select.Content>
                {REDUCTIONS.map((v) => (
                  <Select.Item key={v} value={v}>
                    {v}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Field>

          <Flex align="center" gap="2">
            <Switch
              checked={opts.refinement}
              disabled={refinementDisabled}
              onCheckedChange={(c) => patch({ refinement: c })}
            />
            <Text size="2">Refine discovered constraints</Text>
          </Flex>

          <div>
            <Text size="2" weight="medium" mb="1" as="div">
              Arrow types
            </Text>
            <Flex gap="1" wrap="wrap">
              {ARROW_TYPES.map((t) => {
                const on = opts.considered_arrow_types.includes(t);
                return (
                  <Button
                    key={t}
                    size="1"
                    variant={on ? "solid" : "soft"}
                    color={on ? undefined : "gray"}
                    onClick={() => toggleArrow(t)}
                  >
                    {t}
                  </Button>
                );
              })}
            </Flex>
          </div>

          {eventTypes.length > 0 && (
            <div>
              <Flex align="center" gap="2" mb="1">
                <Switch
                  checked={usingAll}
                  onCheckedChange={(c) => patch({ acts_to_use: c ? undefined : eventTypes.slice(0, 3) })}
                />
                <Text size="2">Use {usingAll ? "all" : "selected"} activities</Text>
              </Flex>
              {!usingAll && (
                <Flex direction="column" gap="1" style={{ maxHeight: 160, overflowY: "auto" }}>
                  {eventTypes.map((t) => {
                    const on = opts.acts_to_use?.includes(t) ?? false;
                    return (
                      <Text key={t} size="1" as="label">
                        <Flex align="center" gap="2">
                          <Checkbox
                            checked={on}
                            onCheckedChange={(c) =>
                              patch({
                                acts_to_use: c
                                  ? [...(opts.acts_to_use ?? []), t]
                                  : (opts.acts_to_use ?? []).filter((x) => x !== t),
                              })
                            }
                          />
                          {t}
                        </Flex>
                      </Text>
                    );
                  })}
                </Flex>
              )}
            </div>
          )}
        </Flex>

        <Flex gap="2" justify="end" mt="4">
          <Dialog.Close>
            <Button size="2" variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Button size="2" disabled={running} onClick={run}>
            <PiRobotBold /> {running ? "Discovering…" : "Run"}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Text asChild size="2" weight="medium">
        <label htmlFor={htmlFor}>{label}</label>
      </Text>
      {children}
    </div>
  );
}
