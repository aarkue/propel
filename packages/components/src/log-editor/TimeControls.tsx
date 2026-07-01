import { Button, Text, TextField } from "@r4pm/components/ui";
import { PiClockClockwise } from "react-icons/pi";
import type { TimeConfig } from "./model";

interface TimeControlsProps {
  time: TimeConfig;
  onChange: (next: TimeConfig) => void;
  onReflow: () => void;
}

const STEP_PRESETS: Array<{ label: string; seconds: number }> = [
  { label: "1m", seconds: 60 },
  { label: "5m", seconds: 300 },
  { label: "1h", seconds: 3600 },
  { label: "1d", seconds: 86400 },
];

/** Convert an RFC3339 instant to the `datetime-local` value (UTC, minute precision). */
function toLocalInput(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toISOString().slice(0, 16);
}

function fromLocalInput(v: string): string {
  const ms = Date.parse(`${v}:00Z`);
  return Number.isNaN(ms) ? v : new Date(ms).toISOString();
}

/** Per-case start + default step, with a one-click reflow that re-stamps all non-manual events. */
export function TimeControls({ time, onChange, onReflow }: TimeControlsProps) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <Text size="1" color="gray">
          Start
        </Text>
        <TextField.Root
          type="datetime-local"
          size="1"
          aria-label="Case start time (UTC)"
          value={toLocalInput(time.start)}
          onChange={(e) => onChange({ ...time, start: fromLocalInput(e.target.value) })}
        />
        <Text size="1" color="gray">
          (UTC)
        </Text>
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <Text size="1" color="gray">
          Step
        </Text>
        {STEP_PRESETS.map((p) => (
          <Button
            key={p.seconds}
            size="1"
            variant={time.stepSeconds === p.seconds ? "solid" : "soft"}
            color="gray"
            onClick={() => onChange({ ...time, stepSeconds: p.seconds })}
          >
            {p.label}
          </Button>
        ))}
        <TextField.Root
          type="number"
          size="1"
          min={0}
          value={String(time.stepSeconds)}
          onChange={(e) => onChange({ ...time, stepSeconds: Math.max(0, Number(e.target.value) || 0) })}
          style={{ width: 72 }}
        />
        <Text size="1" color="gray">
          s
        </Text>
      </div>
      <Button size="1" variant="surface" onClick={onReflow}>
        <PiClockClockwise size={13} /> Reflow times
      </Button>
    </div>
  );
}
