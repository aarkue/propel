import type { BackendContext, KeepOrRemove, Transform } from "@r4pm/client";
import { Badge, Flex, SegmentedControl, Select, Text, TextField } from "@r4pm/components/ui";
import { useState } from "react";
import { DURATION_UNITS, localInputToRfc, rfcToLocalInput } from "../condition";
import { EventTimeRangePicker } from "../condition-editor";

export function FilterTimeRangeEditor({
  transform,
  onChange,
  objectType,
  backend,
  datasetName,
}: {
  transform: Extract<Transform, { type: "FilterTimeRange" }>;
  onChange: (t: Transform) => void;
  objectType: "EventLog" | "OCEL";
  backend: BackendContext;
  datasetName: string;
}) {
  return (
    <Flex direction="column" gap="3">
      <Flex align="center" gap="3">
        <Text size="2" weight="medium">
          Mode
        </Text>
        <SegmentedControl.Root
          size="1"
          value={transform.mode}
          onValueChange={(v) => onChange({ ...transform, mode: v as KeepOrRemove })}
        >
          <SegmentedControl.Item value="Keep">Keep</SegmentedControl.Item>
          <SegmentedControl.Item value="Remove">Remove</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>
      <Text size="2" color="gray">
        {transform.mode === "Keep"
          ? "Keep only events whose timestamp falls inside the range."
          : "Remove events whose timestamp falls inside the range."}
      </Text>
      <Flex gap="3" wrap="wrap">
        <div>
          <Text size="2" weight="medium" as="div" mb="1">
            Start
          </Text>
          <input
            type="datetime-local"
            className="rt-TextFieldInput border rounded px-2 py-1 text-[12px]"
            style={{
              borderColor: "var(--gray-6)",
              background: "var(--color-background)",
              color: "var(--gray-12)",
            }}
            value={rfcToLocalInput(transform.start)}
            onChange={(e) => onChange({ ...transform, start: localInputToRfc(e.currentTarget.value) })}
          />
        </div>
        <div>
          <Text size="2" weight="medium" as="div" mb="1">
            End
          </Text>
          <input
            type="datetime-local"
            className="rt-TextFieldInput border rounded px-2 py-1 text-[12px]"
            style={{
              borderColor: "var(--gray-6)",
              background: "var(--color-background)",
              color: "var(--gray-12)",
            }}
            value={rfcToLocalInput(transform.end)}
            onChange={(e) => onChange({ ...transform, end: localInputToRfc(e.currentTarget.value) })}
          />
        </div>
        <Badge
          color="gray"
          variant="soft"
          style={{ alignSelf: "end" }}
          title="Times are interpreted as UTC, matching the event data."
        >
          UTC
        </Badge>
      </Flex>
      <EventTimeRangePicker
        backend={backend}
        datasetName={datasetName}
        objectType={objectType}
        start={transform.start}
        end={transform.end}
        onRangeChange={(start, end) => onChange({ ...transform, start, end })}
      />
    </Flex>
  );
}

/** Separator joining a variant's activity labels into a stable identity key. */

type DurationUnitLabel = (typeof DURATION_UNITS)[number]["long"];

export function DurationInput({
  label,
  valueMs,
  onChange,
}: {
  label: string;
  valueMs: number | null;
  onChange: (ms: number | null) => void;
}) {
  // Pick the best unit for display
  const bestUnit =
    valueMs != null
      ? ([...DURATION_UNITS].reverse().find((u) => valueMs >= u.ms && valueMs % u.ms === 0) ??
        DURATION_UNITS[0])
      : DURATION_UNITS[1]; // default to minutes
  const [unit, setUnit] = useState<DurationUnitLabel>(bestUnit.long);
  const unitMs = DURATION_UNITS.find((u) => u.long === unit)?.ms ?? 1_000;
  const displayVal = valueMs != null ? valueMs / unitMs : "";

  return (
    <div>
      <Text size="2" weight="medium" as="div" mb="1">
        {label}
      </Text>
      <Flex gap="1" align="center">
        <TextField.Root
          size="2"
          type="number"
          min="0"
          placeholder="—"
          value={displayVal}
          style={{ width: 80 }}
          onChange={(e) => {
            const v = e.currentTarget.value;
            if (v === "") {
              onChange(null);
              return;
            }
            const n = parseFloat(v);
            if (!Number.isNaN(n) && n >= 0) onChange(Math.round(n * unitMs));
          }}
        />
        <Select.Root
          size="2"
          value={unit}
          onValueChange={(u) => {
            setUnit(u as DurationUnitLabel);
          }}
        >
          <Select.Trigger variant="soft" />
          <Select.Content>
            {DURATION_UNITS.map((u) => (
              <Select.Item key={u.long} value={u.long}>
                {u.long}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>
    </div>
  );
}

export function RescaleTimeframeEditor({
  transform,
  onChange,
  objectType,
  objectTypes,
}: {
  transform: Extract<Transform, { type: "RescaleTimeframe" }>;
  onChange: (t: Transform) => void;
  objectType: "EventLog" | "OCEL";
  objectTypes?: string[];
}) {
  const startDate = transform.target_start.split("T")[0] || "2025-01-01";
  const endDate = transform.target_end.split("T")[0] || "2025-12-31";

  return (
    <Flex direction="column" gap="3">
      <Text size="2" color="gray">
        Linearly rescale all timestamps to fit within the target timeframe. Relative ordering and proportional
        gaps are preserved.
      </Text>
      <Flex gap="3" align="end">
        <div>
          <Text size="2" weight="medium" as="div" mb="1">
            Start date
          </Text>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onChange({ ...transform, target_start: `${e.target.value}T00:00:00+00:00` })}
            style={{
              border: "1px solid var(--gray-6)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              fontFamily: "inherit",
              background: "var(--color-background)",
              color: "var(--gray-12)",
            }}
          />
        </div>
        <Text size="2" color="gray" style={{ paddingBottom: 8 }}>
          →
        </Text>
        <div>
          <Text size="2" weight="medium" as="div" mb="1">
            End date
          </Text>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onChange({ ...transform, target_end: `${e.target.value}T23:59:59+00:00` })}
            style={{
              border: "1px solid var(--gray-6)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              fontFamily: "inherit",
              background: "var(--color-background)",
              color: "var(--gray-12)",
            }}
          />
        </div>
        <Badge
          color="gray"
          variant="soft"
          style={{ alignSelf: "end", marginBottom: 6 }}
          title="Target dates are interpreted as UTC (00:00:00 to 23:59:59), matching the event data."
        >
          UTC
        </Badge>
      </Flex>

      {/* Gap constraints */}
      <Text size="2" weight="medium" as="div" style={{ marginTop: 4 }}>
        Gap constraints (between consecutive events{objectType === "OCEL" ? " per object" : " per trace"})
      </Text>
      <Flex gap="3" align="end" wrap="wrap">
        <DurationInput
          label="Min gap"
          valueMs={transform.min_gap_ms ?? null}
          onChange={(ms) => onChange({ ...transform, min_gap_ms: ms })}
        />
        <DurationInput
          label="Max gap"
          valueMs={transform.max_gap_ms ?? null}
          onChange={(ms) => onChange({ ...transform, max_gap_ms: ms })}
        />
      </Flex>

      {/* OCEL object type scope */}
      {objectType === "OCEL" &&
        objectTypes &&
        (transform.min_gap_ms != null || transform.max_gap_ms != null) && (
          <div>
            <Text size="2" weight="medium" as="div" mb="1">
              Apply gap constraints to
            </Text>
            <Select.Root
              size="2"
              value={transform.gap_object_type ?? "__all__"}
              onValueChange={(v) => onChange({ ...transform, gap_object_type: v === "__all__" ? null : v })}
            >
              <Select.Trigger variant="soft" />
              <Select.Content>
                <Select.Item value="__all__">All object types</Select.Item>
                {objectTypes.map((ot) => (
                  <Select.Item key={ot} value={ot}>
                    {ot}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
        )}
    </Flex>
  );
}
