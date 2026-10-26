import {
  Button,
  Checkbox,
  NumberField,
  Popover,
  SegmentedControl,
  Select,
  Separator,
  Tooltip,
} from "@r4pm/components/ui";
import { type ReactNode, useState } from "react";
import { PiCaretDown, PiCaretRight } from "react-icons/pi";
import { ActivityChooser, ObjectTypeChooser } from "../../inputs/choosers";
import type { DiscoveryOptions } from "./edit-context";

const ARROW_TYPES = ["AS", "EF", "EP", "DF", "DP"] as const;
const REDUCTIONS: DiscoveryOptions["reduction"][] = ["None", "Lossless", "Lossy"];
const O2O_MODES: DiscoveryOptions["o2o_mode"][] = ["None", "Direct", "Reversed", "Bidirectional"];
const MAX_COUNT = 20;

type CountMode = "during" | "after" | "none";

/** The max-count filter as one choice over the two count pairs. */
function countMode(o: DiscoveryOptions): CountMode {
  if (o.counts_for_filter[1] === null) return "none";
  if (o.counts_for_generation[1] === null) return "after";
  return "during";
}

function countPatch(mode: CountMode): Partial<DiscoveryOptions> {
  if (mode === "none")
    return { counts_for_filter: [1, null], counts_for_generation: [1, null], refinement: false };
  if (mode === "after")
    return { counts_for_filter: [1, MAX_COUNT], counts_for_generation: [1, null], refinement: false };
  return { counts_for_filter: [1, MAX_COUNT], counts_for_generation: [1, MAX_COUNT] };
}

function Row({ label, help, children }: { label: string; help: string; children: ReactNode }) {
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

/** A subset of `counts` (null = all), picked in a frequency picker beside the form. */
function SubsetButton({
  counts,
  value,
  onChange,
  kind,
}: {
  counts: Record<string, number>;
  value: string[] | null | undefined;
  onChange: (next: string[] | null) => void;
  kind: "activity" | "objectType";
}) {
  const all = Object.keys(counts);
  const selected = new Set(value ?? all);
  const hasCounts = all.some((k) => counts[k] > 0);
  const Chooser = kind === "activity" ? ActivityChooser : ObjectTypeChooser;
  return (
    <Popover.Root>
      <Popover.Trigger>
        <Button size="1" variant="soft" color="gray" disabled={all.length === 0}>
          {value ? `${value.length} of ${all.length}` : `All ${all.length}`}
          <PiCaretDown />
        </Button>
      </Popover.Trigger>
      <Popover.Content
        size="1"
        side="right"
        align="start"
        style={{ width: 300 }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Chooser
          counts={counts}
          value={selected}
          mode="multi"
          showBars={hasCounts}
          showCutoff={hasCounts}
          onChange={(next) => onChange(next.size === all.length ? null : all.filter((a) => next.has(a)))}
        />
      </Popover.Content>
    </Popover.Root>
  );
}

function ArrowToggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="cursor-pointer rounded px-1.5 text-[11px]"
      style={{
        height: 22,
        border: `1px solid ${on ? "var(--accent-a7)" : "var(--gray-a5)"}`,
        background: on ? "var(--accent-a3)" : "transparent",
        color: on ? "var(--accent-11)" : "var(--gray-10)",
        textDecoration: on ? undefined : "line-through",
      }}
    >
      {children}
    </button>
  );
}

export interface DiscoveryFormProps {
  value: DiscoveryOptions;
  onChange: (next: DiscoveryOptions) => void;
  /** Events per activity and objects per object type, for the two pickers. */
  eventTypeCounts: Record<string, number>;
  objectTypeCounts: Record<string, number>;
}

/** The OC-DECLARE discovery settings: what to discover from, the main knobs, and the rest under
 *  Fine-tune. Each change is reported at once. The host decides when discovery runs. */
export function DiscoveryForm({ value, onChange, eventTypeCounts, objectTypeCounts }: DiscoveryFormProps) {
  const [fineTuneOpen, setFineTuneOpen] = useState(false);
  const patch = (p: Partial<DiscoveryOptions>) => onChange({ ...value, ...p });
  const toggleArrow = (t: string) => {
    const on = value.considered_arrow_types.includes(t);
    if (on && value.considered_arrow_types.length === 1) return;
    patch({
      considered_arrow_types: on
        ? value.considered_arrow_types.filter((x) => x !== t)
        : ARROW_TYPES.filter((x) => x === t || value.considered_arrow_types.includes(x)),
    });
  };
  const refinementDisabled = value.counts_for_filter[1] == null || value.counts_for_generation[1] == null;

  return (
    <div className="flex flex-col">
      <Row label="Object types" help="Only use these object types.">
        <SubsetButton
          kind="objectType"
          counts={objectTypeCounts}
          value={value.object_types_to_use}
          onChange={(v) => patch({ object_types_to_use: v })}
        />
      </Row>
      <Row label="Activities" help="Only use these activities.">
        <SubsetButton
          kind="activity"
          counts={eventTypeCounts}
          value={value.acts_to_use}
          onChange={(v) => patch({ acts_to_use: v })}
        />
      </Row>

      <Separator size="4" my="2" />
      <Row label="Noise threshold" help="Share of events that may violate a constraint, from 0 to 1.">
        <NumberField
          label="Noise threshold"
          value={value.noise_threshold}
          onCommit={(noise_threshold) => patch({ noise_threshold })}
        />
      </Row>
      <Row label="Reduction" help="Lossless removes constraints that others imply. Lossy removes more.">
        <SegmentedControl.Root
          size="1"
          value={value.reduction}
          onValueChange={(r) => patch({ reduction: r as DiscoveryOptions["reduction"] })}
        >
          {REDUCTIONS.map((r) => (
            <SegmentedControl.Item key={r} value={r}>
              {r}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>
      </Row>
      <Row
        label="Constraint types"
        help="AS always succeeds, EF/EP eventually follows/precedes, DF/DP directly follows/precedes."
      >
        <div className="flex gap-1">
          {ARROW_TYPES.map((t) => (
            <ArrowToggle key={t} on={value.considered_arrow_types.includes(t)} onClick={() => toggleArrow(t)}>
              {t}
            </ArrowToggle>
          ))}
        </div>
      </Row>

      <Separator size="4" my="2" />
      <button
        type="button"
        onClick={() => setFineTuneOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-1.5 text-[12px]"
        style={{ color: "var(--gray-11)", height: 28 }}
      >
        {fineTuneOpen ? <PiCaretDown size={11} /> : <PiCaretRight size={11} />}
        Fine-tune
      </button>
      {fineTuneOpen ? (
        <>
          <Row
            label="Object-to-object relations"
            help="Also relate objects through object-to-object links, in the chosen direction."
          >
            <Select.Root
              size="1"
              value={value.o2o_mode}
              onValueChange={(m) => patch({ o2o_mode: m as DiscoveryOptions["o2o_mode"] })}
            >
              <Select.Trigger />
              <Select.Content>
                {O2O_MODES.map((m) => (
                  <Select.Item key={m} value={m}>
                    {m}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Row>
          <Row
            label="Max count"
            help={`At most ${MAX_COUNT} target events per constraint. Applying it during discovery is faster.`}
          >
            <Select.Root
              size="1"
              value={countMode(value)}
              onValueChange={(m) => patch(countPatch(m as CountMode))}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="during">During discovery</Select.Item>
                <Select.Item value="after">After discovery</Select.Item>
                <Select.Item value="none">None</Select.Item>
              </Select.Content>
            </Select.Root>
          </Row>
          <Row
            label="Refine object involvement"
            help="Tighten each constraint's object involvement as far as the log allows. Needs Max count during discovery."
          >
            <Checkbox
              size="1"
              checked={value.refinement && !refinementDisabled}
              disabled={refinementDisabled}
              onCheckedChange={(on) => patch({ refinement: on === true })}
            />
          </Row>
        </>
      ) : null}
    </div>
  );
}
