import { Card, IconButton, Popover, Text } from "@r4pm/components/ui";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";
import { useMemo, useRef, useState } from "react";
import { FaArrowDown, FaArrowRight, FaCog } from "react-icons/fa";
import { shadeHex } from "../dfg/util/colors";
import { Legend } from "./Legend";
import { OCDeclareViz, type OCDeclareVizHandle } from "./OCDeclareViz";
import {
  type ArcType,
  collapseEfEpPairs,
  collectObjectTypes,
  type ConstraintLabel,
  type RawConstraint,
} from "./types";

const ALL_ARC_TYPES: ArcType[] = ["AS", "EF", "EP", "DF", "DP"];

// Local view-models mirroring the generated @r4pm/client types.
export type ObjectTypeAssociation =
  | {
      object_type: string;
      type: "Simple";
    }
  | {
      first: string;
      second: string;
      reversed: boolean;
      type: "O2O";
    };

export interface OCDeclareArcLabel {
  each: ObjectTypeAssociation[];
  any: ObjectTypeAssociation[];
  all: ObjectTypeAssociation[];
}

export interface OCDeclareArc {
  from: string;
  to: string;
  arc_type: "AS" | "EF" | "EP" | "DF" | "DP";
  label: OCDeclareArcLabel;
  counts: [number | null, number | null];
}

/** Convert backend `OCDeclareArc` (which uses tagged ObjectTypeAssociation) into viz-ready `RawConstraint`. */
function toRawConstraint(arc: OCDeclareArc): RawConstraint {
  const normalizeAssoc = (assocs: ObjectTypeAssociation[]) =>
    assocs.map((a) => {
      if (a.type === "Simple") return { object_type: a.object_type };
      // O2O: collapse to the first object type for visualization purposes.
      return { object_type: a.first };
    });
  const label: ConstraintLabel = {
    each: normalizeAssoc(arc.label.each),
    any: normalizeAssoc(arc.label.any),
    all: normalizeAssoc(arc.label.all),
  };
  return {
    from: (arc.from as unknown as string) ?? "",
    to: (arc.to as unknown as string) ?? "",
    arc_type: arc.arc_type as ArcType,
    counts: arc.counts as [number, number | null],
    label,
  };
}

/**
 * Reusable OC-DECLARE viewer: renders discovered object-centric DECLARE
 * behavioral constraints (`OCDeclareArc[]`) as an interactive ELK-routed graph,
 * with arc-type / object-type visibility filters, a layout-direction toggle and
 * an explanatory legend.
 */
export function OCDeclareViewer(props: ViewerProps<OCDeclareArc[]>) {
  const { data } = props;
  const cfg = useViewerConfig(props);
  const activityColor = (name: string, mode: "normal" | "foreground" | "light" = "normal") =>
    shadeHex(cfg.colorOf?.("activity", name) ?? "#888888", mode);
  const objectTypeColor = (name: string, mode: "normal" | "foreground" | "light" = "normal") =>
    shadeHex(cfg.colorOf?.("objectType", name) ?? "#888888", mode);
  const vizRef = useRef<OCDeclareVizHandle>(null);
  const [layoutDirection, setLayoutDirection] = useState<"RIGHT" | "DOWN">("RIGHT");
  const [hiddenArcTypes, setHiddenArcTypes] = useState<Set<string>>(new Set());
  const [hiddenObjectTypes, setHiddenObjectTypes] = useState<Set<string>>(new Set());

  // Convert to viz format and merge complementary EF/EP (and DF/DP) pairs.
  const rawConstraints: RawConstraint[] = useMemo(() => collapseEfEpPairs(data.map(toRawConstraint)), [data]);
  const objectTypes = useMemo(() => collectObjectTypes(rawConstraints), [rawConstraints]);

  const toggle = (set: Set<string>, value: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  // Root sizes inline so it fills its container; inner layout uses Tailwind from the bundled stylesheet.
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 200 }}>
      {rawConstraints.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          <Text size="2" color="gray">
            No constraints discovered.
          </Text>
        </div>
      ) : (
        <OCDeclareViz
          ref={vizRef}
          constraints={rawConstraints}
          activityColor={activityColor}
          objectTypeColor={objectTypeColor}
          hiddenArcTypes={hiddenArcTypes}
          hiddenObjectTypes={hiddenObjectTypes}
          direction={layoutDirection}
        />
      )}

      <div
        style={{ position: "absolute", top: 4, left: 4, zIndex: 20 }}
        className="flex flex-col items-end gap-1"
      >
        <Card className="bg-(--color-panel-translucent) backdrop-blur-sm shadow-md py-1.5! px-2! w-55">
          {/* Header row: layout toggles + arc-type filter popover. */}
          <div className="flex items-center gap-1 mb-2">
            <div className="flex items-center rounded-md border border-(--gray-6) overflow-hidden">
              <button
                type="button"
                className={`p-1 text-[11px] ${layoutDirection === "RIGHT" ? "bg-(--gray-12) text-(--gray-1)" : "bg-(--color-panel-solid) text-(--gray-9) hover:bg-(--gray-a3)"}`}
                title="Horizontal layout"
                onClick={() => setLayoutDirection("RIGHT")}
              >
                <FaArrowRight />
              </button>
              <button
                type="button"
                className={`p-1 text-[11px] ${layoutDirection === "DOWN" ? "bg-[var(--gray-12)] text-[var(--gray-1)]" : "bg-[var(--color-panel-solid)] text-[var(--gray-9)] hover:bg-[var(--gray-a3)]"}`}
                title="Vertical layout"
                onClick={() => setLayoutDirection("DOWN")}
              >
                <FaArrowDown />
              </button>
            </div>
            <div className="flex-1" />
            <Popover.Root>
              <Popover.Trigger>
                <IconButton size="1" variant="ghost" title="Arc-type filter">
                  <FaCog />
                </IconButton>
              </Popover.Trigger>
              <Popover.Content width="240px">
                <Text size="1" color="gray" className="block mb-1">
                  Hide arc types
                </Text>
                <div className="flex gap-1 flex-wrap">
                  {ALL_ARC_TYPES.map((t) => {
                    const hidden = hiddenArcTypes.has(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggle(hiddenArcTypes, t, setHiddenArcTypes)}
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors ${
                          hidden
                            ? "bg-[var(--gray-3)] text-[var(--gray-8)] border-[var(--gray-6)] line-through"
                            : "bg-[var(--gray-12)] text-[var(--gray-1)] border-[var(--gray-12)]"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </Popover.Content>
            </Popover.Root>
          </div>

          {/* Object types */}
          {objectTypes.length > 0 && (
            <div className="mb-2">
              <Text
                size="1"
                color="gray"
                className="block mb-1 text-[10px] uppercase tracking-wide font-semibold"
              >
                Object types
              </Text>
              <div className="mt-1 flex flex-wrap gap-1">
                {objectTypes.map((t) => {
                  const hidden = hiddenObjectTypes.has(t);
                  const color = objectTypeColor(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggle(hiddenObjectTypes, t, setHiddenObjectTypes)}
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-all ${
                        hidden ? "line-through" : ""
                      }`}
                      style={{
                        backgroundColor: hidden ? "var(--gray-3)" : `${color}22`,
                        borderColor: hidden ? "var(--gray-7)" : color,
                        color: hidden ? "var(--gray-9)" : color,
                      }}
                      title={`Toggle ${t}`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="mb-2 pt-1.5 border-t border-[var(--gray-a4)]">
            <Legend />
          </div>

          {/* Footer */}
          <div className="pt-1.5 border-t border-[var(--gray-a4)]">
            <span className="text-[10px] text-[var(--gray-8)] tabular-nums">{data.length} arcs</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
