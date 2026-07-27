import { Button, Popover, Text } from "@r4pm/components/ui";
import { useMemo } from "react";
import { FrequencyPicker } from "../inputs/FrequencyPicker";
import type { ColorResolver } from "../viewer/viewer-config";

export interface TypeScopeItem {
  id: string;
  label: string;
  kind: "event" | "object";
  count?: number;
}

export interface TypeScopeSelectorProps {
  items: TypeScopeItem[];
  /** Currently-visible ids (the graph's `visibleNodeIds`). */
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Optional host action: reset scope to the host's automatic default. */
  onResetAuto?: () => void;
  /** Whether the current scope equals the automatic default (labels the trigger). */
  isAuto?: boolean;
  /** Shared color resolver so the frequency bars match the graph node colors. */
  colorOf?: ColorResolver;
  triggerVariant?: "soft" | "surface" | "outline";
}

/** Reusable scope picker for the OCEL type graph: an Events + an Objects frequency picker. Pairs with `visibleNodeIds`. */
export function TypeScopeSelector({
  items,
  value,
  onChange,
  onResetAuto,
  isAuto,
  colorOf,
  triggerVariant = "soft",
}: TypeScopeSelectorProps) {
  const events = useMemo(() => items.filter((i) => i.kind === "event"), [items]);
  const objects = useMemo(() => items.filter((i) => i.kind === "object"), [items]);

  const evLabelToId = useMemo(() => new Map(events.map((i) => [i.label, i.id])), [events]);
  const obLabelToId = useMemo(() => new Map(objects.map((i) => [i.label, i.id])), [objects]);

  const evItems = useMemo(() => Object.fromEntries(events.map((i) => [i.label, i.count ?? 0])), [events]);
  const obItems = useMemo(() => Object.fromEntries(objects.map((i) => [i.label, i.count ?? 0])), [objects]);

  const evValue = useMemo(
    () => new Set(events.filter((i) => value.has(i.id)).map((i) => i.label)),
    [events, value],
  );
  const obValue = useMemo(
    () => new Set(objects.filter((i) => value.has(i.id)).map((i) => i.label)),
    [objects, value],
  );

  const combine = (evLabels: Set<string>, obLabels: Set<string>) => {
    const ids = new Set<string>();
    for (const l of evLabels) {
      const id = evLabelToId.get(l);
      if (id) ids.add(id);
    }
    for (const l of obLabels) {
      const id = obLabelToId.get(l);
      if (id) ids.add(id);
    }
    onChange(ids);
  };

  return (
    <Popover.Root>
      <Popover.Trigger>
        <Button size="1" variant={triggerVariant}>
          Scope {value.size}/{items.length}
          {isAuto ? " · auto" : ""}
        </Button>
      </Popover.Trigger>
      <Popover.Content
        size="1"
        // Avoid focus-triggered scroll jump when a FrequencyPicker scrolls its list into view on mount.
        onOpenAutoFocus={(e) => e.preventDefault()}
        // No outer scroll, so each FrequencyPicker's own scroll-into-view can't drag the popover down.
        // Explicit z-index: content portals outside .radix-themes, so Radix's own z-index doesn't apply.
        style={{ width: 300, zIndex: 50 }}
      >
        {onResetAuto && !isAuto && (
          <button
            type="button"
            onClick={onResetAuto}
            title="Reset to automatic scope"
            style={{
              position: "absolute",
              top: 6,
              right: 10,
              zIndex: 1,
              border: "none",
              background: "transparent",
              color: "var(--accent-11)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            reset
          </button>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {events.length > 0 && (
            <div>
              <Text as="div" size="1" weight="bold" mb="1" color="gray">
                Event types ({evValue.size}/{events.length})
              </Text>
              <FrequencyPicker
                items={evItems}
                value={evValue}
                onChange={(next) => combine(next, obValue)}
                scope="activity"
                colorOf={colorOf}
                mode="multi"
                searchable
                showBars
                emptyText="No event types"
              />
            </div>
          )}
          {objects.length > 0 && (
            <div>
              <Text as="div" size="1" weight="bold" mb="1" color="gray">
                Object types ({obValue.size}/{objects.length})
              </Text>
              <FrequencyPicker
                items={obItems}
                value={obValue}
                onChange={(next) => combine(evValue, next)}
                scope="objectType"
                colorOf={colorOf}
                mode="multi"
                searchable
                showBars
                emptyText="No object types"
              />
            </div>
          )}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}
