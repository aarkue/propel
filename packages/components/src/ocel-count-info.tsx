import { Card, Text } from "@r4pm/components/ui";
import { useMemo } from "react";
import type { ViewerProps } from "./viewer/viewer-config";
import { RankedBarList } from "./shared/RankedBarList";

/** OCEL per-type event/object counts. Local view-model; structurally assignable to/from the
 *  generated `@r4pm/client` `OCELTypeStats`. */
export interface OCELTypeStats {
  event_type_counts: Record<string, number>;
  object_type_counts: Record<string, number>;
}

function sum(counts: Record<string, number>): number {
  return Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
}

/** OCEL event/object counts per type, ported from propel's OCELCountInfo panel. */
export function OCELCountInfo({ data }: ViewerProps<OCELTypeStats>) {
  const numEvents = useMemo(() => sum(data.event_type_counts), [data]);
  const numObjects = useMemo(() => sum(data.object_type_counts), [data]);

  // Root sizes inline so it fills its container; inner layout uses Tailwind from the bundled stylesheet.
  return (
    <div style={{ width: "100%", height: "100%", minHeight: 200, overflow: "auto", padding: 8 }}>
      <Card>
        <Text as="div" size="4" weight="bold" mb="3">
          OCEL Counts
        </Text>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 32, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Text as="div" size="2" weight="bold" mb="1">
              Events{" "}
              <Text color="gray" weight="regular">
                ({numEvents.toLocaleString("en")})
              </Text>
            </Text>
            <RankedBarList items={data.event_type_counts} scope="activity" emptyText="No event types" />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Text as="div" size="2" weight="bold" mb="1">
              Objects{" "}
              <Text color="gray" weight="regular">
                ({numObjects.toLocaleString("en")})
              </Text>
            </Text>
            <RankedBarList items={data.object_type_counts} scope="objectType" emptyText="No object types" />
          </div>
        </div>
      </Card>
    </div>
  );
}
