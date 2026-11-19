import { Flex, IconButton, Text, Tooltip } from "@r4pm/components/ui";
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  PiArrowCounterClockwise,
  PiCornersOut,
  PiMinus,
  PiPauseFill,
  PiPlayFill,
  PiPlus,
} from "react-icons/pi";
import { fmtInt, formatDuration, type Option, OptionMenu } from "../kit";
import { useCanvasColors, useElementSize } from "../kit/hooks";
import { fitView, usePanZoom } from "../kit/pan-zoom";
import type { Point, Rect, Size } from "../viz/types";

/** One token moving along `points` from time `t0` to `t1` (epoch ms). */
export interface Trip {
  points: Point[];
  t0: number;
  t1: number;
  color: string;
  /** Key of the node the token arrives at (see `nodes`), which then pulses. */
  target?: string;
}

/** A node tokens arrive at, in scene coordinates. */
export interface AnimatedNode {
  center: Point;
  size: Size;
  /** Corner radius of the pulse outline. */
  radius?: number;
}

type Marks = "glow" | "counts" | "off";
const MARKS: Option<Marks>[] = [
  { value: "glow", label: "Glow", description: "Activities glow while tokens arrive" },
  { value: "counts", label: "Glow and counts", description: "Also how often each fired in the recent past" },
  { value: "off", label: "Off", description: "Only the tokens" },
];

const SPEEDS: Option<string>[] = [
  { value: "20", label: "Fast", description: "The whole log plays in 20 seconds" },
  { value: "60", label: "Normal", description: "The whole log plays in one minute" },
  { value: "300", label: "Slow", description: "The whole log plays in five minutes" },
  { value: "1200", label: "Slowest", description: "The whole log plays in twenty minutes" },
];

const DENSITY_BINS = 320;
const PAD = 32;

/** A trip with its polyline's cumulative lengths, so a frame finds positions without allocating. */
interface Prepared extends Trip {
  cum: number[];
  length: number;
}

function prepare(trip: Trip): Prepared {
  const cum = [0];
  for (let i = 1; i < trip.points.length; i++) {
    const a = trip.points[i - 1];
    const b = trip.points[i];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return { ...trip, cum, length: cum[cum.length - 1] };
}

function along(p: Prepared, f: number, out: { x: number; y: number }) {
  const pts = p.points;
  if (pts.length === 1 || p.length === 0) {
    out.x = pts[0].x;
    out.y = pts[0].y;
    return;
  }
  const d = Math.min(1, Math.max(0, f)) * p.length;
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < d) i++;
  const seg = p.cum[i] - p.cum[i - 1];
  const t = seg > 0 ? (d - p.cum[i - 1]) / seg : 0;
  out.x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t;
  out.y = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t;
}

/** A soft glowing dot per (resolved) color, drawn once and stamped for every token. */
function useSprites() {
  const cache = useRef(new Map<string, HTMLCanvasElement>());
  return useCallback((color: string, r: number, dpr: number) => {
    const key = `${color}|${Math.round(r * 4)}|${dpr}`;
    let c = cache.current.get(key);
    if (!c) {
      const glow = r * 2.6;
      const px = Math.ceil(glow * 2 * dpr);
      c = document.createElement("canvas");
      c.width = px;
      c.height = px;
      const g = c.getContext("2d");
      if (g) {
        g.scale(dpr, dpr);
        // The halo's fading alpha first, then the color painted into it, so any color format works.
        const grad = g.createRadialGradient(glow, glow, r * 0.4, glow, glow, glow);
        grad.addColorStop(0, "rgba(0,0,0,0.3)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, glow * 2, glow * 2);
        g.globalCompositeOperation = "source-in";
        g.fillStyle = color;
        g.fillRect(0, 0, glow * 2, glow * 2);
        g.globalCompositeOperation = "source-over";
        g.beginPath();
        g.arc(glow, glow, r, 0, Math.PI * 2);
        g.fillStyle = color;
        g.fill();
        g.lineWidth = Math.max(0.6, r * 0.16);
        g.strokeStyle = "rgba(255,255,255,0.5)";
        g.stroke();
      }
      cache.current.set(key, c);
    }
    return c;
  }, []);
}

/** In-flight tokens over time, for the sparkline behind the timeline. */
function density(trips: Trip[], range: [number, number]): number[] {
  const span = Math.max(1, range[1] - range[0]);
  const diff = new Array(DENSITY_BINS + 1).fill(0);
  const bin = (t: number) =>
    Math.min(DENSITY_BINS - 1, Math.max(0, Math.floor(((t - range[0]) / span) * DENSITY_BINS)));
  for (const t of trips) {
    diff[bin(t.t0)] += 1;
    diff[bin(t.t1) + 1] -= 1;
  }
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < DENSITY_BINS; i++) {
    acc += diff[i];
    out.push(acc);
  }
  return out;
}

function defaultDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Plays tokens over a drawn graph: `scene` is SVG content in the coordinates of `bounds`, and each
 * trip a token travelling along a polyline during a time span. Tokens queue up on the edges where
 * work waits, so bottlenecks show as crowded edges; nodes in `nodes` pulse as tokens arrive.
 */
export function TokenAnimator({
  bounds,
  scene,
  trips,
  range,
  formatDate = defaultDate,
  legend,
  nodes,
  unit = "active",
}: {
  bounds: Rect;
  scene: ReactNode;
  trips: Trip[];
  range: [number, number];
  formatDate?: (ms: number) => string;
  legend?: ReactNode;
  nodes?: Record<string, AnimatedNode>;
  /** Word after the count of moving tokens, e.g., "cases" or "objects". */
  unit?: string;
}) {
  const { ref: boxRef, element: boxEl, size } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const box = useMemo(() => ({ w: size?.width ?? 800, h: size?.height ?? 600 }), [size]);
  const [t, setT] = useState(range[0]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("60");
  const [marks, setMarks] = useState<Marks>("glow");
  // Keyed on the values, so a caller passing a fresh but equal `bounds` keeps the user's view.
  const boundsKey = `${bounds.min.x},${bounds.min.y},${bounds.max.x},${bounds.max.y}`;
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    setPlaying(false);
    setT(range[0]);
  }, [range[0], range[1]]);
  const sprite = useSprites();
  const paint = useCanvasColors(canvasRef);
  const playedId = `anim-played-${useId().replace(/[^\w-]/g, "")}`;

  const fit = useMemo(() => fitView(bounds, box, PAD, 1.6), [box, bounds]);
  const { view: v, handlers, dragging, zoomBy, reset } = usePanZoom(boxEl, fit, boundsKey);

  const sorted = useMemo(() => trips.map(prepare).sort((a, b) => a.t0 - b.t0), [trips]);
  // A reduce, not a spread: a spread of one argument per trip overflows on long logs.
  const longest = useMemo(() => trips.reduce((m, tr) => Math.max(m, tr.t1 - tr.t0), 0), [trips]);
  const arrivals = useMemo(
    () =>
      trips
        .filter((tr) => tr.target)
        .map((tr) => ({ t: tr.t1, key: tr.target as string }))
        .sort((a, b) => a.t - b.t),
    [trips],
  );
  const [r0, r1] = range;
  const curve = useMemo(() => density(trips, [r0, r1]), [trips, r0, r1]);
  const pulseWindow = Math.max(1, (range[1] - range[0]) / 120);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = 0;
    const span = range[1] - range[0];
    const tick = (now: number) => {
      const next = tRef.current + ((now - last) / 1000) * (span / Number(speed));
      last = now;
      if (next >= range[1]) {
        setT(range[1]);
        setPlaying(false);
        return;
      }
      setT(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, range[0], range[1]]);

  let inFlight = 0;
  for (const tr of sorted) {
    if (tr.t0 > t) break;
    if (tr.t1 >= t) inFlight++;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== box.w * dpr || canvas.height !== box.h * dpr) {
      canvas.width = box.w * dpr;
      canvas.height = box.h * dpr;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.w, box.h);
    const sx = (x: number) => v.x + x * v.k;
    const sy = (y: number) => v.y + y * v.k;

    // Nodes that tokens reached in the last moments glow, stronger the more arrived.
    if (nodes && arrivals.length && marks !== "off") {
      const recent = new Map<string, number>();
      let lo = 0;
      let hi = arrivals.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arrivals[mid].t < t - pulseWindow) lo = mid + 1;
        else hi = mid;
      }
      for (let i = lo; i < arrivals.length && arrivals[i].t <= t; i++) {
        recent.set(arrivals[i].key, (recent.get(arrivals[i].key) ?? 0) + 1);
      }
      const peak = Math.max(1, ...recent.values());
      const accent = paint("var(--accent-9)");
      const contrast = paint("var(--accent-contrast)");
      ctx.font = "600 11px system-ui, sans-serif";
      for (const [key, n] of recent) {
        const node = nodes[key];
        if (!node) continue;
        const a = 0.45 + 0.55 * Math.sqrt(n / peak);
        const w = node.size.width * v.k;
        const h = node.size.height * v.k;
        const x = sx(node.center.x) - w / 2;
        const y = sy(node.center.y) - h / 2;
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.5 * a;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6 + 16 * a;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5 + 1.5 * a;
        ctx.beginPath();
        ctx.roundRect(x - 3, y - 3, w + 6, h + 6, (node.radius ?? 8) * v.k + 3);
        ctx.stroke();
        ctx.restore();
        if (marks !== "counts") continue;
        const label = `+${n}`;
        const bwidth = ctx.measureText(label).width + 10;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.roundRect(x + w - bwidth / 2, y - 9, bwidth, 18, 9);
        ctx.fill();
        ctx.fillStyle = contrast;
        ctx.fillText(label, x + w - bwidth / 2 + 5, y + 4);
      }
    }

    const r = Math.min(7, Math.max(2.6, 3.4 * Math.sqrt(v.k)));
    const p = { x: 0, y: 0 };
    const q = { x: 0, y: 0 };
    ctx.lineCap = "round";
    for (const tr of sorted) {
      if (tr.t0 > t) break;
      if (tr.t1 < t || tr.t0 < t - longest - 1) continue;
      const f = tr.t1 > tr.t0 ? (t - tr.t0) / (tr.t1 - tr.t0) : 1;
      along(tr, f, p);
      const color = paint(tr.color);
      // A short trail: a fixed on-screen length behind the token, so slow and fast tokens differ.
      const trail = tr.length > 0 ? Math.min(f, 14 / v.k / tr.length) : 0;
      if (trail > 0.001) {
        along(tr, f - trail, q);
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = color;
        ctx.lineWidth = r * 1.3;
        ctx.beginPath();
        ctx.moveTo(sx(q.x), sy(q.y));
        ctx.lineTo(sx(p.x), sy(p.y));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const img = sprite(color, r, dpr);
      const s = img.width / dpr;
      ctx.drawImage(img, sx(p.x) - s / 2, sy(p.y) - s / 2, s, s);
    }
  }, [t, sorted, longest, box, v, nodes, arrivals, pulseWindow, sprite, paint, marks]);

  const span = Math.max(1, range[1] - range[0]);
  const progress = Math.min(1, Math.max(0, (t - range[0]) / span));
  const peak = Math.max(1, ...curve);
  const area = `M0,40 ${curve.map((c, i) => `L${(i / (DENSITY_BINS - 1)) * 1000},${40 - (c / peak) * 36}`).join(" ")} L1000,40 Z`;
  const scrubTo = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setT(range[0] + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * span);
  };
  const date = new Date(t);

  return (
    <Flex direction="column" className="r4pm-no-select" style={{ height: "100%", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "10px 16px",
          borderBottom: "1px solid var(--gray-a4)",
          background: "var(--color-panel-solid)",
        }}
      >
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            if (t >= range[1]) setT(range[0]);
            setPlaying((p) => !p);
          }}
          style={{
            width: 42,
            height: 42,
            flex: "none",
            borderRadius: 21,
            border: "none",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            color: "var(--accent-contrast)",
            background: "var(--accent-9)",
            boxShadow: "0 2px 10px var(--accent-a6)",
            fontSize: 18,
          }}
        >
          {playing ? <PiPauseFill /> : <PiPlayFill style={{ marginLeft: 2 }} />}
        </button>
        <Tooltip content="Back to the start">
          <IconButton
            size="2"
            variant="ghost"
            color="gray"
            onClick={() => {
              setPlaying(false);
              setT(range[0]);
            }}
          >
            <PiArrowCounterClockwise />
          </IconButton>
        </Tooltip>
        <Flex direction="column" style={{ minWidth: 168, flex: "none" }}>
          <span
            style={{
              fontSize: 17,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              fontVariantNumeric: "tabular-nums",
              color: "var(--gray-12)",
            }}
          >
            {formatDate(t)}
          </span>
          <span style={{ fontSize: 12, color: "var(--gray-10)", fontVariantNumeric: "tabular-nums" }}>
            {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </span>
        </Flex>
        <div
          style={{ position: "relative", flex: 1, minWidth: 160, height: 40, cursor: "pointer" }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            scrubTo(e.clientX, e.currentTarget);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) scrubTo(e.clientX, e.currentTarget);
          }}
        >
          <svg
            viewBox="0 0 1000 40"
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            aria-hidden="true"
          >
            <defs>
              <clipPath id={playedId}>
                <rect x="0" y="0" width={progress * 1000} height="40" />
              </clipPath>
            </defs>
            <path d={area} fill="var(--gray-a4)" />
            <path d={area} fill="var(--accent-a7)" clipPath={`url(#${playedId})`} />
            <line
              x1="0"
              x2="1000"
              y1="39.5"
              y2="39.5"
              stroke="var(--gray-a6)"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div
            style={{
              position: "absolute",
              top: -2,
              bottom: -2,
              left: `calc(${progress * 100}% - 1px)`,
              width: 2,
              borderRadius: 1,
              background: "var(--accent-11)",
              boxShadow: "0 0 0 3px var(--accent-a4)",
            }}
          />
          <Flex
            justify="between"
            style={{ position: "absolute", left: 0, right: 0, bottom: -16, pointerEvents: "none" }}
          >
            <Text size="1" color="gray" style={{ fontSize: 10 }}>
              {formatDate(range[0])}
            </Text>
            <Text size="1" color="gray" style={{ fontSize: 10 }}>
              {formatDate(range[1])}
            </Text>
          </Flex>
        </div>
        <OptionMenu label="Speed" value={speed} options={SPEEDS} onChange={setSpeed} />
        {nodes && Object.keys(nodes).length > 0 && (
          <OptionMenu label="Firings" value={marks} options={MARKS} onChange={setMarks} />
        )}
        <Flex direction="column" align="end" style={{ minWidth: 88, flex: "none" }}>
          <span
            style={{
              fontSize: 17,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              color: "var(--gray-12)",
            }}
          >
            {fmtInt(inFlight)}
          </span>
          <span style={{ fontSize: 12, color: "var(--gray-10)" }}>{unit} in flight</span>
        </Flex>
      </div>
      <div
        ref={boxRef}
        {...handlers}
        style={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          overflow: "hidden",
          cursor: dragging ? "grabbing" : "grab",
          background:
            "radial-gradient(circle at 1px 1px, var(--gray-a4) 1px, transparent 0) 0 0 / 22px 22px, var(--color-background)",
          touchAction: "none",
        }}
      >
        <svg
          width={box.w}
          height={box.h}
          style={{ position: "absolute", inset: 0 }}
          role="img"
          aria-label="Process map"
        >
          <g transform={`translate(${v.x} ${v.y}) scale(${v.k})`}>{scene}</g>
        </svg>
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", inset: 0, width: box.w, height: box.h, pointerEvents: "none" }}
        />
        {legend && (
          <div
            style={{
              position: "absolute",
              left: 12,
              bottom: 12,
              padding: "8px 12px",
              borderRadius: 10,
              background: "var(--color-panel-translucent)",
              backdropFilter: "blur(8px)",
              border: "1px solid var(--gray-a4)",
              boxShadow: "var(--shadow-2)",
              maxWidth: "60%",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {legend}
            {marks === "counts" && nodes && Object.keys(nodes).length > 0 && (
              <Text as="div" size="1" color="gray" mt="1">
                +N on a node: arrivals in the last {formatDuration(pulseWindow, "long")} of log time
              </Text>
            )}
          </div>
        )}
        <Flex
          direction="column"
          gap="1"
          p="1"
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            borderRadius: 10,
            background: "var(--color-panel-translucent)",
            backdropFilter: "blur(8px)",
            border: "1px solid var(--gray-a4)",
            boxShadow: "var(--shadow-2)",
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <IconButton size="1" variant="ghost" color="gray" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
            <PiPlus />
          </IconButton>
          <IconButton size="1" variant="ghost" color="gray" aria-label="Zoom out" onClick={() => zoomBy(0.8)}>
            <PiMinus />
          </IconButton>
          <IconButton size="1" variant="ghost" color="gray" aria-label="Fit to view" onClick={reset}>
            <PiCornersOut />
          </IconButton>
        </Flex>
      </div>
    </Flex>
  );
}
