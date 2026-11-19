import { Flex } from "@r4pm/components/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { PiRows } from "react-icons/pi";
import { EmptyState } from "../feedback/EmptyState";
import {
  fmtInt,
  LegendItem,
  Metric,
  MetricRow,
  type Option,
  OptionMenu,
  Toolbar,
  useChartTooltip,
} from "../kit";
import { useFitText } from "../kit/fit-label";
import { useCanvasColors, useElementSize } from "../kit/hooks";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";

export interface LifelineEvent {
  id: string;
  activity: string;
  time_ms: number;
}

export interface Lifeline {
  id: string;
  object_type: string;
  events: number[];
}

export interface Lifelines {
  lifelines: Lifeline[];
  events: LifelineEvent[];
  total: number;
}

/** Which objects the host loaded: the first, middle or last to appear, consecutive by start. */
export type LifelinesWindow = "start" | "middle" | "end";

export interface ObjectLifelinesControls {
  /** Only objects of this type; null for a share of every type. */
  objectType?: string | null;
  window?: LifelinesWindow;
}

export const DEFAULT_OBJECT_LIFELINES_CONTROLS: Required<ObjectLifelinesControls> = {
  objectType: null,
  window: "middle",
};

export interface ObjectLifelinesViewProps extends ViewerProps<Lifelines> {
  /** The types the objects menu offers. */
  objectTypes: string[];
  controls?: ObjectLifelinesControls;
  onControlsChange?: (next: ObjectLifelinesControls) => void;
}

const ROW_H = 16;
const LABEL_W = 150;
const ALL = "__all__";

/**
 * One row per object from its first to its last event, a dot per event. Hovering an event rings it
 * in every row it touches, so the objects that meet in one event line up.
 */
export function ObjectLifelinesView({
  data,
  objectTypes,
  controls = DEFAULT_OBJECT_LIFELINES_CONTROLS,
  onControlsChange,
  ...config
}: ObjectLifelinesViewProps) {
  const objectType = controls.objectType ?? null;
  const win = controls.window ?? DEFAULT_OBJECT_LIFELINES_CONTROLS.window;
  const cfg = useViewerConfig(config);
  const date = cfg.format?.date ?? ((ms: number) => new Date(ms).toLocaleString());
  const { ref: boxRef, size } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paint = useCanvasColors(canvasRef);
  const width = Math.max(500, size?.width ?? 900);
  const [hover, setHover] = useState<number | null>(null);
  const { show, hide, tooltip } = useChartTooltip();
  const fitId = useFitText(11);
  const [lo, hi] = useMemo(() => {
    let a = Number.POSITIVE_INFINITY;
    let b = Number.NEGATIVE_INFINITY;
    for (const e of data.events) {
      a = Math.min(a, e.time_ms);
      b = Math.max(b, e.time_ms);
    }
    return [a, b > a ? b : a + 1];
  }, [data.events]);
  const rowsOf = useMemo(() => {
    const m = new Map<number, number[]>();
    data.lifelines.forEach((l, r) => {
      for (const e of l.events) m.set(e, [...(m.get(e) ?? []), r]);
    });
    return m;
  }, [data.lifelines]);
  const plotW = width - LABEL_W - 16;
  const height = data.lifelines.length * ROW_H + 8;
  const x = (t: number) => LABEL_W + ((t - lo) / (hi - lo)) * plotW;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const ink = paint("var(--gray-11)");
    const xAt = (t: number) => LABEL_W + ((t - lo) / (hi - lo)) * plotW;
    const highlighted = hover != null ? new Set(rowsOf.get(hover) ?? []) : null;
    ctx.font = "11px system-ui, sans-serif";
    data.lifelines.forEach((l, r) => {
      const y = r * ROW_H + ROW_H / 2 + 4;
      const evs = l.events.map((i) => data.events[i]);
      if (evs.length === 0) return;
      const typeColor = cfg.colorOf?.("objectType", l.object_type) ?? "#888";
      const dim = highlighted && !highlighted.has(r);
      ctx.globalAlpha = dim ? 0.25 : 1;
      ctx.fillStyle = ink;
      ctx.fillText(fitId(l.id, LABEL_W - 26), 18, y + 4);
      ctx.fillStyle = typeColor;
      ctx.beginPath();
      ctx.arc(8, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = typeColor;
      ctx.globalAlpha = dim ? 0.1 : 0.35;
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(xAt(evs[0].time_ms), y);
      ctx.lineTo(xAt(evs[evs.length - 1].time_ms), y);
      ctx.stroke();
      ctx.globalAlpha = dim ? 0.25 : 1;
      for (const e of evs) {
        ctx.fillStyle = cfg.colorOf?.("activity", e.activity) ?? "#3b82f6";
        ctx.beginPath();
        ctx.arc(xAt(e.time_ms), y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
    if (hover != null) {
      const ev = data.events[hover];
      const hx = xAt(ev.time_ms);
      ctx.strokeStyle = ink;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.lineTo(hx, height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
      for (const r of rowsOf.get(hover) ?? []) {
        ctx.beginPath();
        ctx.arc(hx, r * ROW_H + ROW_H / 2 + 4, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }, [data, width, height, lo, hi, plotW, hover, rowsOf, cfg.colorOf, paint, fitId]);

  if (data.lifelines.length === 0) {
    return (
      <EmptyState icon={<PiRows />} title="No objects with events" description="Pick another object type." />
    );
  }

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const row = Math.floor((e.clientY - r.top - 4) / ROW_H);
    const line = data.lifelines[row];
    if (!line) return leave();
    let best: number | null = null;
    let bestD = 8;
    for (const i of line.events) {
      const d = Math.abs(x(data.events[i].time_ms) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best == null) return leave();
    setHover(best);
    const ev = data.events[best];
    const rows = rowsOf.get(best) ?? [];
    show(e, {
      title: ev.activity,
      rows: [
        { label: "Time", value: date(ev.time_ms) },
        { label: "Event", value: ev.id },
      ],
      footer: `${rows.length} shown object${rows.length === 1 ? "" : "s"}: ${rows
        .slice(0, 6)
        .map((r) => data.lifelines[r].id)
        .join(", ")}${rows.length > 6 ? ", ..." : ""}`,
    });
  };
  const leave = () => {
    setHover(null);
    hide();
  };
  const typeOptions: Option<string>[] = [
    { value: ALL, label: "All types", description: "A share of every type's objects" },
    ...objectTypes.map((t) => ({ value: t, label: t })),
  ];

  return (
    <Flex direction="column" style={{ height: "100%", minHeight: 0 }}>
      <Toolbar
        end={
          <Flex gap="3" wrap="wrap">
            {[...new Set(data.lifelines.map((l) => l.object_type))].map((t) => (
              <LegendItem key={t} color={cfg.colorOf?.("objectType", t) ?? "#888"} label={t} />
            ))}
          </Flex>
        }
      >
        <OptionMenu
          label="Objects"
          value={objectType ?? ALL}
          options={typeOptions}
          onChange={(v) => onControlsChange?.({ ...controls, objectType: v === ALL ? null : v })}
          disabled={!onControlsChange}
        />
        <OptionMenu
          label="From"
          value={win}
          options={[
            { value: "start", label: "Start of the log", description: "The first objects to appear" },
            {
              value: "middle",
              label: "Middle of the log",
              description: "Objects that start around the middle",
            },
            { value: "end", label: "End of the log", description: "The last objects to appear" },
          ]}
          onChange={(w) => onControlsChange?.({ ...controls, window: w })}
          disabled={!onControlsChange}
        />
      </Toolbar>
      <div style={{ padding: "16px 16px 8px" }}>
        <MetricRow>
          <Metric
            label="Objects shown"
            value={fmtInt(data.lifelines.length)}
            hint={`of ${fmtInt(data.total)}, consecutive by start`}
          />
          <Metric label="Events" value={fmtInt(data.events.length)} />
          <Metric
            label="From"
            value={new Date(lo).toLocaleDateString()}
            hint={`to ${new Date(hi).toLocaleDateString()}`}
          />
        </MetricRow>
      </div>
      <div
        ref={boxRef}
        style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative", padding: "0 0 16px" }}
      >
        <canvas
          ref={canvasRef}
          style={{ width, height, display: "block" }}
          onMouseMove={onMove}
          onMouseLeave={leave}
        />
        {tooltip}
      </div>
    </Flex>
  );
}
