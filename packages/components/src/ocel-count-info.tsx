import { Card, Text } from "@r4pm/components/ui";
import { type ReactNode, useMemo, useState } from "react";
import { LuClock, LuHash, LuToggleRight, LuType } from "react-icons/lu";
import type { StaticViewerProps } from "./viewer/viewer-config";
import { RankedBarList } from "./shared/RankedBarList";

/** OCEL per-type event/object counts. Local view-model; structurally assignable to/from the
 *  generated `@r4pm/client` `OCELTypeStats`. */
export interface OCELTypeStats {
  event_type_counts: Record<string, number>;
  object_type_counts: Record<string, number>;
}

/** One declared attribute of an OCEL type: name + value-type label (e.g. "string", "float"). */
export interface OCELTypeAttr {
  name: string;
  type: string;
}

/** Declared attributes per type name, split by scope so event/object types with the same name
 *  don't collide. Optional: when absent, `OCELCountInfo` is a pure read-only counts display. */
export interface OCELTypeAttributes {
  event?: Record<string, OCELTypeAttr[]>;
  object?: Record<string, OCELTypeAttr[]>;
}

function sum(counts: Record<string, number>): number {
  return Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
}

type Scope = "event" | "object";
type Selected = { scope: Scope; type: string } | null;

// Icon + accent per value-type, so an attribute's kind reads at a glance on its chip.
const TYPE_META: Record<string, { Icon: typeof LuHash; color: string }> = {
  string: { Icon: LuType, color: "var(--blue-9)" },
  float: { Icon: LuHash, color: "var(--green-9)" },
  integer: { Icon: LuHash, color: "var(--green-9)" },
  time: { Icon: LuClock, color: "var(--amber-9)" },
  boolean: { Icon: LuToggleRight, color: "var(--purple-9)" },
};

function AttributeChip({
  attr,
  active,
  onClick,
}: {
  attr: OCELTypeAttr;
  active: boolean;
  onClick?: () => void;
}) {
  const meta = TYPE_META[attr.type];
  const Icon = meta?.Icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "4px 11px",
        borderRadius: 8,
        fontSize: 13,
        cursor: onClick ? "pointer" : "default",
        border: `1px solid ${active ? "var(--accent-8)" : "var(--gray-a5)"}`,
        background: active ? "var(--accent-a3)" : "var(--gray-a2)",
        color: "var(--gray-12)",
        transition: "background 120ms, border-color 120ms",
      }}
    >
      {Icon && <Icon style={{ color: meta.color, fontSize: 14, flex: "0 0 auto" }} />}
      <span style={{ fontWeight: 600 }}>{attr.name}</span>
      <span style={{ color: "var(--gray-10)", fontSize: 11 }}>{attr.type}</span>
    </button>
  );
}

function AttributeDetail({
  attrs,
  onAttributeClick,
  activeAttr,
}: {
  attrs: OCELTypeAttr[];
  onAttributeClick?: (attr: string) => void;
  activeAttr?: string;
}) {
  return (
    <div style={{ marginTop: 12, borderTop: "1px solid var(--gray-a5)", paddingTop: 10 }}>
      {attrs.length === 0 ? (
        <Text size="1" color="gray">
          No attributes
        </Text>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {attrs.map((a) => (
            <AttributeChip
              key={a.name}
              attr={a}
              active={activeAttr === a.name}
              onClick={onAttributeClick ? () => onAttributeClick(a.name) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** OCEL event/object counts per type. When `attributes` is provided, each type row is clickable
 *  and reveals that type's declared attributes in a detail strip below the columns. */
export function OCELCountInfo({
  data,
  attributes,
  renderAttributeDetail,
}: StaticViewerProps<OCELTypeStats> & {
  attributes?: OCELTypeAttributes;
  /** When provided, attribute chips become clickable and this renders the value-stats detail for the
   *  active `(scope, type, attribute)` below the chips. A single-attribute type auto-expands. */
  renderAttributeDetail?: (scope: Scope, type: string, attribute: string) => ReactNode;
}) {
  const numEvents = useMemo(() => sum(data.event_type_counts), [data]);
  const numObjects = useMemo(() => sum(data.object_type_counts), [data]);
  const [selected, setSelected] = useState<Selected>(null);
  const [activeAttr, setActiveAttr] = useState<string | null>(null);

  const clickable = attributes != null;
  const interactiveAttrs = renderAttributeDetail != null;
  const pick = (scope: Scope) => (type: string) => {
    const same = selected && selected.scope === scope && selected.type === type;
    if (same) {
      setSelected(null);
      setActiveAttr(null);
      return;
    }
    const attrs = attributes?.[scope]?.[type] ?? [];
    setSelected({ scope, type });
    // Auto-expand when a type has a single attribute, so its stats show without an extra click.
    setActiveAttr(interactiveAttrs && attrs.length === 1 ? attrs[0].name : null);
  };

  const selectedAttrs = selected ? (attributes?.[selected.scope]?.[selected.type] ?? []) : null;

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
            {/* cap list height so long type lists scroll instead of pushing content down */}
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              <RankedBarList
                items={data.event_type_counts}
                scope="activity"
                emptyText="No event types"
                onItemClick={clickable ? pick("event") : undefined}
                selectedKey={selected?.scope === "event" ? selected.type : undefined}
              />
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Text as="div" size="2" weight="bold" mb="1">
              Objects{" "}
              <Text color="gray" weight="regular">
                ({numObjects.toLocaleString("en")})
              </Text>
            </Text>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              <RankedBarList
                items={data.object_type_counts}
                scope="objectType"
                emptyText="No object types"
                onItemClick={clickable ? pick("object") : undefined}
                selectedKey={selected?.scope === "object" ? selected.type : undefined}
              />
            </div>
          </div>
        </div>
        {selected && selectedAttrs && (
          <AttributeDetail
            attrs={selectedAttrs}
            onAttributeClick={
              interactiveAttrs ? (attr) => setActiveAttr((cur) => (cur === attr ? null : attr)) : undefined
            }
            activeAttr={activeAttr ?? undefined}
          />
        )}
        {selected && activeAttr && renderAttributeDetail?.(selected.scope, selected.type, activeAttr)}
        {clickable && !selected && (
          <Text as="div" size="1" color="gray" mt="3">
            Click a type for its attributes
          </Text>
        )}
      </Card>
    </div>
  );
}
