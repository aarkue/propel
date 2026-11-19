import type { Transform } from "@r4pm/client";
import { Flex, SegmentedControl, Text, TextField } from "@r4pm/components/ui";

export function SampleEditor({
  transform,
  onChange,
  objectType,
  totalTraces,
  totalEvents,
}: {
  transform: Extract<Transform, { type: "Sample" }>;
  onChange: (t: Transform) => void;
  objectType: "EventLog" | "OCEL";
  totalTraces?: number;
  totalEvents?: number;
}) {
  const tracesLabel = objectType === "EventLog" ? "Traces" : "Objects";
  const total = transform.target === "Events" ? totalEvents : totalTraces;
  const mode = transform.amount.type; // "Count" | "Percent"

  // Preview: compute actual count based on amount + total
  const previewCount =
    total != null
      ? mode === "Count"
        ? Math.min(transform.amount.value, total)
        : Math.max(0, Math.round(total * (transform.amount.value / 100)))
      : null;

  return (
    <Flex direction="column" gap="3">
      <Text size="2" color="gray">
        Randomly sample {tracesLabel.toLowerCase()} or events.
      </Text>
      <div>
        <Text size="2" weight="medium" as="div" mb="1">
          Sample what
        </Text>
        <SegmentedControl.Root
          size="2"
          value={transform.target}
          onValueChange={(v) => onChange({ ...transform, target: v as "TracesOrObjects" | "Events" })}
        >
          <SegmentedControl.Item value="TracesOrObjects">{tracesLabel}</SegmentedControl.Item>
          <SegmentedControl.Item value="Events">Events</SegmentedControl.Item>
        </SegmentedControl.Root>
      </div>
      <div>
        <Flex align="center" gap="2" mb="1">
          <Text size="2" weight="medium">
            Amount
          </Text>
          <SegmentedControl.Root
            size="1"
            value={mode}
            onValueChange={(v) => {
              // When switching modes, preserve the intent by converting if possible
              if (v === "Count") {
                const newCount =
                  previewCount ?? (transform.amount.type === "Count" ? transform.amount.value : 100);
                onChange({ ...transform, amount: { type: "Count", value: newCount } });
              } else {
                // Switching to percent: compute % from current count if possible, else default 50
                let newPct = 50;
                if (transform.amount.type === "Count" && total != null && total > 0) {
                  newPct = Math.round((transform.amount.value / total) * 100);
                } else if (transform.amount.type === "Percent") {
                  newPct = transform.amount.value;
                }
                onChange({ ...transform, amount: { type: "Percent", value: newPct } });
              }
            }}
          >
            <SegmentedControl.Item value="Count">Count</SegmentedControl.Item>
            <SegmentedControl.Item value="Percent">%</SegmentedControl.Item>
          </SegmentedControl.Root>
        </Flex>
        {mode === "Count" ? (
          <Flex align="center" gap="2">
            <TextField.Root
              size="2"
              type="number"
              min={1}
              className="!w-32"
              value={String(transform.amount.value)}
              onChange={(e) =>
                onChange({
                  ...transform,
                  amount: { type: "Count", value: Math.max(1, parseInt(e.currentTarget.value, 10) || 1) },
                })
              }
            />
            {total != null && (
              <Text size="1" color="gray">
                of {total.toLocaleString()}
              </Text>
            )}
          </Flex>
        ) : (
          <Flex align="center" gap="2">
            <TextField.Root
              size="2"
              type="number"
              min={0}
              max={100}
              className="!w-20"
              value={String(transform.amount.value)}
              onChange={(e) => {
                const p = Math.min(100, Math.max(0, parseFloat(e.currentTarget.value) || 0));
                onChange({ ...transform, amount: { type: "Percent", value: p } });
              }}
            />
            <Text size="2" color="gray">
              %
            </Text>
            {previewCount != null && (
              <Text size="2" color="gray">
                ≈ {previewCount.toLocaleString()} items
              </Text>
            )}
            {previewCount == null && (
              <Text size="1" color="orange">
                Load data to preview
              </Text>
            )}
          </Flex>
        )}
      </div>
      <div>
        <Text size="2" weight="medium" as="div" mb="1">
          Seed (optional)
        </Text>
        <TextField.Root
          size="2"
          type="number"
          min={0}
          className="!w-32"
          placeholder="42"
          value={transform.seed != null ? String(transform.seed) : ""}
          onChange={(e) => {
            const v = e.currentTarget.value;
            onChange({ ...transform, seed: v === "" ? null : Math.max(0, parseInt(v, 10) || 0) });
          }}
        />
      </div>
    </Flex>
  );
}
