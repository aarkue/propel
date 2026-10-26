import {
  Badge,
  Button,
  CardSelector,
  Checkbox,
  Flex,
  NumberField,
  Popover,
  SegmentedControl,
  Separator,
  Text,
  Tooltip,
} from "@r4pm/components/ui";
import { type ReactNode, useState } from "react";
import {
  PiCaretDown,
  PiCaretRight,
  PiFunnel,
  PiFunnelSimple,
  PiGraph,
  PiLightning,
  PiShuffle,
  PiTreeStructure,
} from "react-icons/pi";
import {
  type MinerChoice,
  type MinerPreset,
  type MinerVariant,
  usesDfg,
  usesNoise,
  usesPreset,
} from "../_discovery";
import { DFG_SETTINGS, LOG_SETTINGS } from "../_miner-settings";

/** Colored by what the miner reads: indigo the event log, teal its DFG, amber for Alpha+++. */
const VARIANTS: Record<MinerVariant, { name: string; hint: string; icon: ReactNode; color: string }> = {
  IM: { name: "IM", hint: "Fits every trace", icon: <PiTreeStructure size={13} />, color: "indigo" },
  IMf: { name: "IMf", hint: "Filters infrequent behavior", icon: <PiFunnel size={13} />, color: "indigo" },
  IMa: {
    name: "IMa",
    hint: "Interleaving, inclusive choice",
    icon: <PiShuffle size={13} />,
    color: "indigo",
  },
  IMd: { name: "IMd", hint: "From the DFG, for large logs", icon: <PiLightning size={13} />, color: "teal" },
  IMfd: { name: "IMfd", hint: "IMd with noise filtering", icon: <PiFunnelSimple size={13} />, color: "teal" },
  Alpha: { name: "Alpha+++", hint: "Alpha-based discovery", icon: <PiGraph size={13} />, color: "amber" },
};

const PRESET_LABELS: Record<MinerPreset, string> = { default: "rust4pm", prom: "ProM", pm4py: "pm4py" };

/** The tweaks that differ from the preset's value. */
function changedTweaks(preset: Record<string, unknown> | undefined, tweaks: Record<string, boolean>) {
  return preset ? Object.keys(tweaks).filter((key) => preset[key] !== tweaks[key]) : [];
}

export function minerSummary(choice: MinerChoice): string {
  const parts = [VARIANTS[choice.variant].name];
  if (usesNoise(choice.variant)) parts.push(`noise ${choice.noise.toFixed(2)}`);
  if (usesPreset(choice.variant) && choice.preset !== "default") parts.push(PRESET_LABELS[choice.preset]);
  return parts.join(" · ");
}

function SettingRow({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3" style={{ minHeight: 28 }}>
      <Tooltip content={help}>
        <span className="whitespace-nowrap text-[12px]" style={{ color: "var(--gray-12)" }}>
          {label}
        </span>
      </Tooltip>
      {children}
    </div>
  );
}

/** Which miner a discovery view runs: the bar shows the choice, the popover changes it.
 *  `presetValues` are the options of the preset the choice starts from, once loaded. */
export function MinerPickerView({
  value,
  onChange,
  variants,
  presetValues,
}: {
  value: MinerChoice;
  onChange: (value: MinerChoice) => void;
  variants: readonly MinerVariant[];
  presetValues: Record<string, unknown> | undefined;
}) {
  const [fineTuneOpen, setFineTuneOpen] = useState(false);
  const tunable = value.variant !== "Alpha";
  const changed = changedTweaks(presetValues, value.tweaks);
  const settings = usesDfg(value.variant) ? DFG_SETTINGS : LOG_SETTINGS;

  return (
    <Flex align="center" gap="2">
      <Text size="1" color="gray">
        Miner
      </Text>
      <Popover.Root>
        <Popover.Trigger>
          <Button size="1" variant="soft" color="gray">
            {minerSummary(value)}
            {changed.length > 0 ? (
              <Badge size="1" color="indigo">
                {changed.length} changed
              </Badge>
            ) : null}
            <PiCaretDown />
          </Button>
        </Popover.Trigger>
        <Popover.Content size="1" width="352px" onOpenAutoFocus={(e) => e.preventDefault()}>
          <CardSelector
            size="1"
            columns={3}
            aria-label="Miner"
            value={value.variant}
            onValueChange={(variant) => onChange({ ...value, variant, tweaks: {} })}
            options={variants.map((v) => ({
              value: v,
              title: VARIANTS[v].name,
              description: VARIANTS[v].hint,
              icon: VARIANTS[v].icon,
              accent: VARIANTS[v].color,
              iconColor: VARIANTS[v].color,
            }))}
          />

          {tunable ? (
            <div className="flex flex-col">
              {usesNoise(value.variant) ? (
                <SettingRow
                  label="Noise threshold"
                  help="How much infrequent behavior to filter, from 0 (none) to 1."
                >
                  <NumberField
                    label="Noise threshold"
                    value={value.noise}
                    onCommit={(noise) => onChange({ ...value, noise })}
                  />
                </SettingRow>
              ) : null}

              {usesPreset(value.variant) ? (
                <SettingRow label="Preset" help="Settings that match this tool's Inductive Miner.">
                  <SegmentedControl.Root
                    size="1"
                    value={value.preset}
                    onValueChange={(p) => onChange({ ...value, preset: p as MinerPreset, tweaks: {} })}
                  >
                    {(Object.keys(PRESET_LABELS) as MinerPreset[]).map((p) => (
                      <SegmentedControl.Item key={p} value={p}>
                        {PRESET_LABELS[p]}
                      </SegmentedControl.Item>
                    ))}
                  </SegmentedControl.Root>
                </SettingRow>
              ) : null}

              <Separator size="4" my="2" />
              <div className="flex items-center justify-between" style={{ height: 28 }}>
                <button
                  type="button"
                  onClick={() => setFineTuneOpen((o) => !o)}
                  className="flex cursor-pointer items-center gap-1.5 text-[12px]"
                  style={{ color: "var(--gray-11)" }}
                >
                  {fineTuneOpen ? <PiCaretDown size={11} /> : <PiCaretRight size={11} />}
                  Fine-tune
                  {changed.length > 0 ? (
                    <span style={{ color: "var(--accent-11)" }}>{changed.length} changed</span>
                  ) : null}
                </button>
                {changed.length > 0 ? (
                  <Button
                    size="1"
                    variant="ghost"
                    color="gray"
                    onClick={() => onChange({ ...value, tweaks: {} })}
                  >
                    Reset
                  </Button>
                ) : null}
              </div>
              {fineTuneOpen ? (
                <div className="flex flex-col" style={{ margin: "2px -6px 0" }}>
                  {settings.map((s) => {
                    const checked = (value.tweaks[s.key] ?? presetValues?.[s.key]) === true;
                    return (
                      <Tooltip key={s.key} content={s.help} side="left">
                        <Text
                          as="label"
                          size="1"
                          className="flex cursor-pointer items-center gap-2 rounded px-1.5 hover:bg-(--gray-a3)"
                          style={{ height: 26 }}
                        >
                          <Checkbox
                            size="1"
                            checked={checked}
                            disabled={!presetValues}
                            onCheckedChange={(on) =>
                              onChange({ ...value, tweaks: { ...value.tweaks, [s.key]: on === true } })
                            }
                          />
                          <span className="flex-1">{s.label}</span>
                          {changed.includes(s.key) ? (
                            <span
                              className="size-1.5 rounded-full"
                              style={{ background: "var(--accent-9)" }}
                            />
                          ) : null}
                        </Text>
                      </Tooltip>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Root>
    </Flex>
  );
}
