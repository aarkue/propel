import { Flex, Slider, Text } from "@r4pm/components/ui";
import { useEffect, useMemo, useState } from "react";
import { PiCaretRight, PiTreeView } from "react-icons/pi";
import { EmptyState } from "../feedback/EmptyState";
import {
  fmtInt,
  fmtPct,
  formatDuration,
  Metric,
  MetricRow,
  type Option,
  OptionMenu,
  RampLegend,
  rampColor,
  rampInk,
  Toolbar,
  useChartTooltip,
} from "../kit";
import { useFitText } from "../kit/fit-label";
import { useElementSize } from "../kit/hooks";
import { useViewSetting } from "../viewer/view-state";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";

export interface PrefixNode {
  parent?: number | null;
  activity: string;
  depth: number;
  cases: number;
  ending: number;
  median_remaining_ms?: number | null;
  median_elapsed_ms?: number | null;
  pruned_cases: number;
}

export interface PrefixTree {
  nodes: PrefixNode[];
  max_depth: number;
  min_cases: number;
}

/** Settings that change what the engine computes. */
export interface PrefixTreeControls {
  /** Prefixes shared by fewer than this share of all cases are hidden. */
  minShare: number;
}

export const DEFAULT_PREFIX_TREE_CONTROLS: PrefixTreeControls = { minShare: 0.005 };

export interface PrefixTreeViewProps extends ViewerProps<PrefixTree> {
  controls?: PrefixTreeControls;
  /** When given, a slider sets the smallest share of cases a shown prefix needs. */
  onControlsChange?: (next: PrefixTreeControls) => void;
}

/** The shares the slider steps through. */
const SHARES = [0.0001, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1];

const fmtShare = (x: number) => `${+(x * 100).toPrecision(2)}%`;

type ColorBy = "remaining" | "elapsed" | "activity";

const COLOR_OPTIONS: Option<ColorBy>[] = [
  {
    value: "remaining",
    label: "Time left",
    description: "Median time from the prefix until the case ends. Darker nodes take longer to finish.",
  },
  {
    value: "elapsed",
    label: "Time spent",
    description: "Median time from the case start to the end of the prefix.",
  },
  { value: "activity", label: "Activity", description: "The activity's color, as in the other views." },
];

const COLS = 7;
const MIN_COL_W = 150;
const GAP = 3;

interface Placed {
  i: number;
  col: number;
  y: number;
  h: number;
}

/** Positions of the subtree under `root` (which the breadcrumb shows, so it gets no column): one
 *  column per depth, heights proportional to cases out of `height`. */
function place(nodes: PrefixNode[], children: number[][], root: number, height: number): Placed[] {
  const out: Placed[] = [];
  if (!nodes[root]) return out;
  const total = Math.max(1, nodes[root].cases);
  const walk = (i: number, y: number, col: number) => {
    let cy = y;
    for (const c of children[i]) {
      const ch = (nodes[c].cases / total) * height;
      out.push({ i: c, col, y: cy, h: ch });
      if (col + 1 < COLS) walk(c, cy, col + 1);
      cy += ch;
    }
  };
  walk(root, 0, 0);
  return out;
}

/**
 * Every trace as a path through a tree of shared prefixes, laid out left to right. A node's height is
 * the number of cases starting with its prefix; the gap under a node's children is the cases that end
 * there or take a rare branch. Click a node to zoom into its subtree.
 */
export function PrefixTreeView({ data, colorOf, format, controls, onControlsChange }: PrefixTreeViewProps) {
  const cfg = useViewerConfig({ colorOf, format });
  const [colorBy, setColorBy] = useViewSetting<ColorBy>("prefixTree.color", "remaining");
  // The zoomed prefix by its activities, so it survives a recompute that renumbers the nodes.
  const [rootPath, setRootPath] = useState<string[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const { show, hide, tooltip } = useChartTooltip();
  const { ref: boxRef, size } = useElementSize<HTMLDivElement>();
  // Less the box's horizontal padding.
  const box = { w: (size?.width ?? 1032) - 32, h: size?.height ?? 520 };
  const duration = cfg.format?.duration ?? formatDuration;
  const fitName = useFitText(12, 600);

  const children = useMemo(() => {
    const ch: number[][] = data.nodes.map(() => []);
    data.nodes.forEach((n, i) => {
      if (n.parent != null) ch[n.parent].push(i);
    });
    return ch;
  }, [data.nodes]);
  const focus = useMemo(() => {
    let at = 0;
    for (const activity of rootPath) {
      const next = children[at]?.find((c) => data.nodes[c].activity === activity);
      if (next === undefined) break;
      at = next;
    }
    return at;
  }, [rootPath, children, data.nodes]);
  const setRoot = (i: number) => {
    const acts: string[] = [];
    for (let k: number | null | undefined = i; k != null && k !== 0; k = data.nodes[k].parent)
      acts.unshift(data.nodes[k].activity);
    setRootPath(acts);
  };
  const height = Math.max(320, box.h - 64);
  const placed = useMemo(
    () => place(data.nodes, children, focus, height),
    [data.nodes, children, focus, height],
  );

  if (data.nodes.length <= 1) {
    return <EmptyState icon={<PiTreeView />} title="No traces" description="This log has no events." />;
  }

  const nodes = data.nodes;
  const ancestors = (i: number) => {
    const out: number[] = [];
    for (let k: number | null | undefined = i; k != null; k = nodes[k].parent) out.unshift(k);
    return out;
  };
  const path = ancestors(focus);
  const hoverPath = new Set(hovered != null ? ancestors(hovered) : []);
  const cols = Math.max(1, Math.min(COLS, 1 + placed.reduce((m, p) => Math.max(m, p.col), 0)));
  const colW = Math.max(MIN_COL_W, Math.floor(box.w / cols));
  const width = cols * colW;

  const colorValue = (n: PrefixNode) =>
    colorBy === "elapsed" ? (n.median_elapsed_ms ?? 0) : (n.median_remaining_ms ?? 0);
  const maxValue = placed.reduce((m, p) => Math.max(m, colorValue(nodes[p.i])), 1);
  const look = (n: PrefixNode): { fill: string; ink: string; stripe?: string } => {
    if (colorBy === "activity") {
      return {
        fill: "var(--gray-a3)",
        ink: "var(--gray-12)",
        stripe: cfg.colorOf?.("activity", n.activity) ?? "var(--accent-9)",
      };
    }
    const t = 0.08 + 0.92 * Math.sqrt(colorValue(n) / maxValue);
    return { fill: rampColor(t), ink: rampInk(t) };
  };

  const focusNode = nodes[focus];
  const leaves = placed.filter((p) => children[p.i].length === 0 || p.col === cols - 1).length;

  return (
    <Flex direction="column" style={{ height: "100%", minHeight: 0 }}>
      <Toolbar
        end={
          onControlsChange ? (
            <ShareSlider
              value={controls?.minShare ?? DEFAULT_PREFIX_TREE_CONTROLS.minShare}
              minCases={data.min_cases}
              onChange={(minShare) =>
                onControlsChange({ ...(controls ?? DEFAULT_PREFIX_TREE_CONTROLS), minShare })
              }
            />
          ) : (
            <Text size="1" color="gray">
              Prefixes of fewer than {fmtInt(data.min_cases)} cases hidden
            </Text>
          )
        }
      >
        <nav
          aria-label="Zoom path"
          style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}
        >
          {path.map((i, k) => {
            const current = i === focus;
            return (
              <Flex key={i} align="center" gap="1">
                {k > 0 && <PiCaretRight style={{ color: "var(--gray-8)" }} />}
                <button
                  type="button"
                  className="r4pm-option-trigger"
                  onClick={() => setRoot(i)}
                  aria-current={current ? "page" : undefined}
                  style={{
                    background: current ? "var(--accent-a3)" : "transparent",
                    borderColor: current ? "var(--accent-a6)" : "transparent",
                    color: current ? "var(--accent-12)" : "var(--gray-11)",
                    fontWeight: current ? 600 : 400,
                  }}
                >
                  <span
                    style={{
                      maxWidth: 200,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {i === 0 ? "All cases" : nodes[i].activity}
                  </span>
                </button>
              </Flex>
            );
          })}
        </nav>
        <span style={{ width: 8 }} />
        <OptionMenu label="Color" value={colorBy} options={COLOR_OPTIONS} onChange={setColorBy} />
      </Toolbar>

      <div style={{ padding: "14px 16px 0" }}>
        <MetricRow>
          <Metric label={focus === 0 ? "Cases" : "Cases with prefix"} value={fmtInt(focusNode.cases)} />
          <Metric label="Paths shown" value={fmtInt(leaves)} hint={`up to ${COLS} steps ahead`} />
          {focusNode.median_remaining_ms != null && focus !== 0 && (
            <Metric label="Median time left" value={duration(focusNode.median_remaining_ms)} />
          )}
          {focus !== 0 && (
            <Metric
              label="End here"
              value={fmtPct(focusNode.ending / Math.max(1, focusNode.cases))}
              hint={`${fmtInt(focusNode.ending)} cases`}
            />
          )}
        </MetricRow>
      </div>

      <div
        ref={boxRef}
        data-tooltip-host
        style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative", padding: "12px 16px" }}
      >
        <svg
          key={focus}
          width={width}
          height={height}
          style={{ display: "block", animation: "r4pm-tree-in 220ms ease-out" }}
          role="img"
          aria-label="Prefix tree of the traces"
        >
          {placed.map(({ i, col, y, h }) => {
            const n = nodes[i];
            const parent = n.parent != null ? nodes[n.parent] : undefined;
            const { fill, ink, stripe } = look(n);
            const dim = hovered != null && !hoverPath.has(i);
            const onPath = hovered != null && hoverPath.has(i);
            const x = col * colW;
            const rh = Math.max(1, h - GAP);
            const canZoom = children[i].length > 0;
            return (
              <g
                key={i}
                onClick={() => {
                  if (!canZoom) return;
                  setHovered(null);
                  hide();
                  setRoot(i);
                }}
                onMouseMove={(e) => {
                  setHovered(i);
                  show(e, {
                    title: n.activity,
                    rows: [
                      { label: "Cases", value: fmtInt(n.cases) },
                      {
                        label: "Of the step before",
                        value: fmtPct(n.cases / Math.max(1, parent?.cases ?? n.cases)),
                      },
                      ...(n.ending > 0 ? [{ label: "End here", value: fmtInt(n.ending) }] : []),
                      ...(n.median_elapsed_ms
                        ? [{ label: "Median since start", value: duration(n.median_elapsed_ms) }]
                        : []),
                      ...(n.median_remaining_ms != null
                        ? [{ label: "Median until end", value: duration(n.median_remaining_ms) }]
                        : []),
                      ...(n.pruned_cases > 0
                        ? [{ label: "In rare branches", value: fmtInt(n.pruned_cases) }]
                        : []),
                    ],
                    footer: canZoom ? "Click to zoom in" : undefined,
                  });
                }}
                onMouseLeave={() => {
                  setHovered(null);
                  hide();
                }}
                style={{
                  cursor: canZoom ? "pointer" : "default",
                  opacity: dim ? 0.38 : 1,
                  transition: "opacity 140ms",
                }}
              >
                <rect
                  x={x + GAP / 2}
                  y={y + GAP / 2}
                  width={colW - GAP}
                  height={rh}
                  rx={Math.min(7, rh / 2)}
                  fill={fill}
                  stroke={onPath ? "var(--accent-12)" : "none"}
                  strokeOpacity={0.7}
                  strokeWidth={2}
                />
                {stripe && rh > 4 && (
                  <rect
                    x={x + GAP / 2}
                    y={y + GAP / 2}
                    width={4}
                    height={rh}
                    rx={Math.min(2, rh / 2)}
                    fill={stripe}
                  />
                )}
                {rh >= 16 && (
                  <text
                    x={x + 12}
                    y={y + GAP / 2 + Math.min(rh / 2 + 4, 18)}
                    fontSize="12"
                    fill={ink}
                    fontWeight={600}
                  >
                    {fitName(n.activity, colW - 24)}
                  </text>
                )}
                {rh >= 36 && (
                  <text x={x + 12} y={y + GAP / 2 + 34} fontSize="11" fill={ink} fillOpacity={0.8}>
                    {fmtInt(n.cases)}
                    {colorBy !== "activity" && colorValue(n) > 0 && ` · ${duration(colorValue(n))}`}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {colorBy !== "activity" && (
          <RampLegend
            low={colorBy === "remaining" ? "Little time left" : "Early in the case"}
            high={colorBy === "remaining" ? "Much time left" : "Late in the case"}
            steps={[0.1, 0.3, 0.5, 0.7, 0.85, 1]}
            style={{ marginTop: 12 }}
          />
        )}
        {tooltip}
      </div>
    </Flex>
  );
}

/** Picks the smallest share of cases a shown prefix needs; recomputes only on release. */
function ShareSlider({
  value,
  minCases,
  onChange,
}: {
  value: number;
  minCases: number;
  onChange: (share: number) => void;
}) {
  const nearest = (v: number) =>
    SHARES.reduce((best, s, i) => (Math.abs(s - v) < Math.abs(SHARES[best] - v) ? i : best), 0);
  const [drag, setDrag] = useState<number | null>(null);
  // Radix reports a key press's change after its commit, so the drag ends when the value arrives.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on each new value
  useEffect(() => setDrag(null), [value]);
  const index = drag ?? nearest(value);
  return (
    <Flex
      align="center"
      gap="2"
      title="Prefixes shared by fewer cases are hidden. Lower shows rarer paths, but more boxes."
    >
      <Text size="1" color="gray" style={{ whiteSpace: "nowrap" }}>
        Hide below
      </Text>
      <Slider
        size="1"
        style={{ width: 110 }}
        min={0}
        max={SHARES.length - 1}
        step={1}
        value={[index]}
        onValueChange={([i]) => setDrag(i)}
        onValueCommit={([i]) => {
          if (SHARES[i] !== value) onChange(SHARES[i]);
          else setDrag(null);
        }}
        aria-label="Smallest share of cases per prefix"
      />
      <Text size="1" style={{ whiteSpace: "nowrap", minWidth: 120 }}>
        {fmtShare(SHARES[index])}
        <Text color="gray">{drag === null ? ` · ${fmtInt(minCases)} cases` : ""}</Text>
      </Text>
    </Flex>
  );
}
