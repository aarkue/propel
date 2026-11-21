import { DropdownMenu, Flex, Text } from "@r4pm/components/ui";
import { useId, useMemo, useState } from "react";
import { PiCaretDown, PiGraph } from "react-icons/pi";
import { EmptyState } from "../feedback/EmptyState";
import {
  fmtInt,
  formatDuration,
  LegendItem,
  Metric,
  MetricRow,
  type Option,
  OptionMenu,
  Toolbar,
  ToolbarDivider,
  useChartTooltip,
} from "../kit";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";
import type { Layout } from "../viz/types";

export interface ExecutionEvent {
  id: string;
  activity: string;
  time_ms: number;
  objects: [string, string][];
}

export interface ExecutionEdge {
  from: number;
  to: number;
  object_types: string[];
  objects: string[];
}

export interface ExecutionObject {
  id: string;
  object_type: string;
  distance: number;
}

export interface ExecutionGraph {
  root: ExecutionObject;
  objects: ExecutionObject[];
  events: ExecutionEvent[];
  edges: ExecutionEdge[];
  /** More objects were reachable than the object limit allows. */
  truncated: boolean;
  /** The events of all objects in the graph, also those beyond the event limit. */
  total_events: number;
  layout: Layout;
}

export interface ExecutionGraphControls {
  /** The start object's type; null for the host's choice. */
  objectType?: string | null;
  /** The start object; null for the host's choice. */
  objectId?: string | null;
  /** How many relation hops from the start object the graph reaches. */
  depth: number;
  /** Long-lived types to include anyway. */
  included?: string[];
}

export const DEFAULT_EXECUTION_GRAPH_CONTROLS: ExecutionGraphControls = {
  objectType: null,
  objectId: null,
  depth: 2,
};

export interface ExecutionGraphViewProps extends ViewerProps<ExecutionGraph> {
  /** The start object types to pick from, e.g., with their object counts as descriptions. */
  objectTypeOptions: Option<string>[];
  /** The objects of the start object type to pick from. */
  objectOptions: Option<string>[];
  /** Long-lived types (e.g., master data), left out unless in `controls.included`. */
  longLived?: string[];
  controls?: ExecutionGraphControls;
  onControlsChange?: (next: ExecutionGraphControls) => void;
}

const PAD = 24;
const LANE = 3;

/**
 * One process execution: the events around a start object as a partial order. An arrow joins an
 * object's consecutive events and takes its object type's color, so parallel object lifecycles and
 * the events where they meet are visible at once.
 */
export function ExecutionGraphView({
  data,
  objectTypeOptions,
  objectOptions,
  longLived = [],
  controls = DEFAULT_EXECUTION_GRAPH_CONTROLS,
  onControlsChange,
  ...config
}: ExecutionGraphViewProps) {
  const cfg = useViewerConfig(config);
  const arrowId = `exec-arrow-${useId().replace(/[^\w-]/g, "")}`;
  const { show, hide, tooltip } = useChartTooltip();
  const [focusType, setFocusType] = useState<string | null>(null);
  const duration = cfg.format?.duration ?? formatDuration;
  const date = cfg.format?.date ?? ((ms: number) => new Date(ms).toLocaleString());
  const typeColor = (t: string) => cfg.colorOf?.("objectType", t) ?? "var(--gray-9)";
  const types = useMemo(() => [...new Set(data.objects.map((o) => o.object_type))].sort(), [data.objects]);
  const { bounds } = data.layout;
  const w = bounds.max.x - bounds.min.x + 2 * PAD;
  const h = bounds.max.y - bounds.min.y + 2 * PAD;
  const tx = (x: number) => x - bounds.min.x + PAD;
  const ty = (y: number) => y - bounds.min.y + PAD;
  const span = data.events.length ? data.events[data.events.length - 1].time_ms - data.events[0].time_ms : 0;
  const set = (patch: Partial<ExecutionGraphControls>) => onControlsChange?.({ ...controls, ...patch });

  return (
    <Flex direction="column" style={{ height: "100%", minHeight: 0 }}>
      <Toolbar
        end={
          <Flex gap="3" align="center" wrap="wrap">
            {types.map((t) => (
              <button
                key={t}
                type="button"
                onMouseEnter={() => setFocusType(t)}
                onMouseLeave={() => setFocusType(null)}
                style={{ all: "unset", cursor: "default" }}
              >
                <LegendItem color={typeColor(t)} label={t} shape="line" />
              </button>
            ))}
          </Flex>
        }
      >
        <OptionMenu
          label="Type"
          value={controls.objectType ?? data.root.object_type}
          options={objectTypeOptions}
          onChange={(objectType) => set({ objectType, objectId: null })}
          disabled={!onControlsChange}
        />
        <OptionMenu
          label="Start object"
          value={data.root.id}
          options={objectOptions}
          onChange={(objectId) => set({ objectId })}
          disabled={!onControlsChange}
        />
        <ToolbarDivider />
        <OptionMenu
          label="Hops"
          value={String(controls.depth)}
          options={[
            {
              value: "1",
              label: "1",
              description: "Objects that share an event with it or have an object-to-object relation to it",
            },
            {
              value: "2",
              label: "2",
              description: "Also the objects related to those, e.g., an order's items' packages",
            },
            { value: "3", label: "3", description: "Three steps of relations, can include many objects" },
          ]}
          onChange={(d) => set({ depth: Number(d) })}
          disabled={!onControlsChange}
        />
        {longLived.length > 0 && (
          <>
            <ToolbarDivider />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger disabled={!onControlsChange}>
                <button type="button" className="r4pm-option-trigger">
                  <span style={{ color: "var(--gray-10)" }}>Left out</span>
                  <span style={{ color: "var(--gray-12)", fontWeight: 500 }}>
                    {longLived.filter((t) => !controls.included?.includes(t)).join(", ") || "none"}
                  </span>
                  <PiCaretDown style={{ color: "var(--gray-9)" }} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content size="2">
                <DropdownMenu.Label>Long-lived types, related to many objects</DropdownMenu.Label>
                {longLived.map((t) => (
                  <DropdownMenu.CheckboxItem
                    key={t}
                    checked={!controls.included?.includes(t)}
                    onCheckedChange={(leftOut) => {
                      const rest = (controls.included ?? []).filter((x) => x !== t);
                      set({ included: leftOut ? rest : [...rest, t] });
                    }}
                  >
                    Leave out {t}
                  </DropdownMenu.CheckboxItem>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </>
        )}
      </Toolbar>
      {data.events.length === 0 ? (
        <EmptyState icon={<PiGraph />} title="No events" description="This object has no events." />
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
          <Flex direction="column" gap="4">
            <MetricRow>
              <Metric
                label="Objects"
                value={fmtInt(data.objects.length)}
                hint={data.truncated ? "limit reached" : `${types.length} types`}
              />
              <Metric
                label="Events"
                value={fmtInt(data.events.length)}
                hint={
                  data.total_events > data.events.length
                    ? `of ${fmtInt(data.total_events)}, those of the nearest objects`
                    : undefined
                }
              />
              <Metric label="Duration" value={duration(span)} hint={`from ${date(data.events[0].time_ms)}`} />
              <Metric
                label="Synchronizations"
                value={fmtInt(data.events.filter((e) => new Set(e.objects.map((o) => o[0])).size > 1).length)}
                hint="events joining object types"
              />
            </MetricRow>
            <div
              data-tooltip-host
              style={{
                position: "relative",
                overflow: "auto",
                borderRadius: 12,
                border: "1px solid var(--gray-a4)",
                background: "var(--gray-a2)",
              }}
            >
              <svg
                width={w}
                height={h}
                role="img"
                aria-label="Process execution graph"
                style={{ display: "block" }}
              >
                <defs>
                  {types.map((t, i) => (
                    <marker
                      key={t}
                      id={`${arrowId}-${i}`}
                      viewBox="0 0 8 8"
                      refX="7"
                      refY="4"
                      markerWidth="9"
                      markerHeight="9"
                      markerUnits="userSpaceOnUse"
                      orient="auto"
                    >
                      <path d="M0,0 L8,4 L0,8 z" fill={typeColor(t)} />
                    </marker>
                  ))}
                </defs>
                {data.edges.map((e, i) => {
                  const pts = data.layout.edges[i]?.points ?? [];
                  if (pts.length < 2) return null;
                  return e.object_types.map((t, k) => {
                    const off = (k - (e.object_types.length - 1) / 2) * LANE;
                    const dim = focusType != null && focusType !== t;
                    return (
                      <polyline
                        key={`${e.from}-${e.to}-${t}`}
                        points={pts.map((p) => `${tx(p.x)},${ty(p.y) + off}`).join(" ")}
                        fill="none"
                        stroke={typeColor(t)}
                        strokeWidth={1.4 + Math.min(3, Math.sqrt(e.objects.length))}
                        strokeOpacity={dim ? 0.12 : 0.85}
                        markerEnd={`url(#${arrowId}-${types.indexOf(t)})`}
                      />
                    );
                  });
                })}
                {data.events.map((ev, i) => {
                  const pl = data.layout.nodes[i];
                  if (!pl) return null;
                  const { center: c, size: s } = pl;
                  const evTypes = [...new Set(ev.objects.map((o) => o[0]))].sort();
                  const isRootEvent = ev.objects.some(([, id]) => id === data.root.id);
                  return (
                    <g
                      key={ev.id}
                      onMouseMove={(m) =>
                        show(m, {
                          title: ev.activity,
                          rows: evTypes.map((t) => ({
                            label: t,
                            value: ev.objects.filter((o) => o[0] === t).length,
                            color: typeColor(t),
                          })),
                          footer: `${date(ev.time_ms)} · event ${ev.id}`,
                        })
                      }
                      onMouseLeave={hide}
                    >
                      <rect
                        x={tx(c.x - s.width / 2)}
                        y={ty(c.y - s.height / 2)}
                        width={s.width}
                        height={s.height}
                        rx={10}
                        fill="var(--color-panel-solid)"
                        stroke={isRootEvent ? "var(--gray-12)" : "var(--gray-a7)"}
                        strokeWidth={isRootEvent ? 1.6 : 1}
                        style={{ filter: "drop-shadow(0 1px 1px rgb(0 0 0 / 0.08))" }}
                      />
                      <text
                        x={tx(c.x)}
                        y={ty(c.y) - 2}
                        textAnchor="middle"
                        fontSize="12"
                        fontWeight={600}
                        fill="var(--gray-12)"
                      >
                        {ev.activity}
                      </text>
                      <g transform={`translate(${tx(c.x) - (evTypes.length * 12) / 2 + 6} ${ty(c.y) + 12})`}>
                        {evTypes.map((t, k) => (
                          <circle key={t} cx={k * 12} cy={0} r={4} fill={typeColor(t)} />
                        ))}
                      </g>
                    </g>
                  );
                })}
              </svg>
              {tooltip}
            </div>
            <Text size="1" color="gray">
              Start object {data.root.object_type} {data.root.id}: its events have a dark border. Hover a type
              in the legend to follow its objects.
            </Text>
          </Flex>
        </div>
      )}
    </Flex>
  );
}
