import type { Point } from "../viz/types";
import type { Trip } from "./TokenAnimator";

/** One transition firing of a replayed case or object, with its arcs by place key and weight. */
export interface FlowFiring {
  transition: string;
  time: number;
  inputs: [string, number][];
  outputs: [string, number][];
  color: string;
  /** Node key that pulses when the firing's tokens arrive. */
  target?: string;
}

export interface FlowGeometry {
  /** Route between two node keys (transition to place or back). */
  leg: (from: string, to: string) => Point[];
  /** A stable spot inside a place for the token with this seed. */
  spot: (place: string, seed: number) => Point | undefined;
}

/**
 * The trips of one run as in the token game: a firing's output tokens hop into their places, wait
 * there, and hop out to the transition that consumes them just before it fires. Places hold
 * tokens oldest first, so no token is lost when a place holds several. A hop takes at most `hop`
 * (data time), so a token stays visible in its place for nearly its whole wait, however short the
 * steps between events are.
 */
export function tokenFlow(
  firings: FlowFiring[],
  initial: [string, number][],
  final: Set<string>,
  geometry: FlowGeometry,
  hop: number,
  endColor: string,
  seed: { next: number },
  out: Trip[],
): void {
  const stay = (
    place: string,
    from: string | null,
    to: FlowFiring | null,
    t0: number,
    t1: number,
    color: string,
    announce: boolean,
  ) => {
    const at = geometry.spot(place, seed.next++);
    if (!at) return;
    const h = Math.min(hop, (t1 - t0) / 3);
    if (from !== null) {
      const pts = [...geometry.leg(from, place), at];
      if (pts.length > 1) out.push({ points: pts, t0, t1: t0 + h, color });
    }
    out.push({ points: [at, at], t0: from === null ? t0 : t0 + h, t1: to === null ? t1 : t1 - h, color });
    if (to !== null) {
      const pts = [at, ...geometry.leg(place, to.transition)];
      if (pts.length > 1)
        out.push({ points: pts, t0: t1 - h, t1, color, target: announce ? to.target : undefined });
    }
  };
  const tokens = new Map<string, { from: string | null; time: number }[]>();
  const queue = (p: string) => {
    let q = tokens.get(p);
    if (!q) {
      q = [];
      tokens.set(p, q);
    }
    return q;
  };
  const start = (firings[0]?.time ?? 0) - 3 * hop;
  for (const [p, n] of initial) for (let k = 0; k < n; k++) queue(p).push({ from: null, time: start });
  for (const f of firings) {
    // The node counts firings, so only the first token a firing consumes announces it.
    let announce = true;
    for (const [p, weight] of f.inputs) {
      for (let k = 0; k < weight; k++) {
        const token = queue(p).shift();
        if (token) {
          stay(p, token.from, f, token.time, f.time, f.color, announce);
          announce = false;
        }
      }
    }
    for (const [p, weight] of f.outputs) {
      for (let k = 0; k < weight; k++) queue(p).push({ from: f.transition, time: f.time });
    }
  }
  for (const [p, waiting] of tokens) {
    if (!final.has(p)) continue;
    for (const token of waiting) {
      if (token.from !== null) stay(p, token.from, null, token.time, token.time + 3 * hop, endColor, false);
    }
  }
}

/** A deterministic spot within `radius` of `centre`, spread so piled tokens stay apart. */
export function spreadSpot(centre: Point, radius: number, seed: number): Point {
  const r = radius * 0.55 * Math.sqrt(((seed * 2654435761) >>> 0) / 4294967296);
  const a = (seed * 2.399963) % (Math.PI * 2);
  return { x: centre.x + r * Math.cos(a), y: centre.y + r * Math.sin(a) };
}
