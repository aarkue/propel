import type { Edge } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { assignArcLanes, fanArcRoute, snapEndpointsToNodeBorders, straightenClearRoute } from "./layout-util";

const HW = 75;
const HH = 29;
type P = { x: number; y: number };

/** Any polyline segment (excluding a small border tolerance) that passes through a node's interior. */
function threadsBox(pts: P[], c: P): boolean {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    for (let s = 1; s < 40; s++) {
      const t = s / 40;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (Math.abs(x - c.x) < HW - 4 && Math.abs(y - c.y) < HH - 4) return true;
    }
  }
  return false;
}

describe("snapEndpointsToNodeBorders", () => {
  // A penultimate waypoint on the target centre must not snap the endpoint to the far border.
  it("does not thread the target when the route enters through its centre", () => {
    const src = { x: 75, y: 29 };
    const tgt = { x: 75, y: 137 };
    // route: source bottom -> down onto target centre -> target left border (engine output)
    const route = [
      { x: 75, y: 58 },
      { x: 75, y: 137 },
      { x: 0, y: 137 },
    ];
    const out = snapEndpointsToNodeBorders(route, src, tgt, HW, HH);
    expect(threadsBox(out, tgt)).toBe(false);
    expect(threadsBox(out, src)).toBe(false);
    // Endpoint lands on the border it approaches (the top), not the opposite side.
    const end = out[out.length - 1];
    expect(end.y).toBeCloseTo(tgt.y - HH, 0);
  });

  it("keeps a clean vertical edge unchanged (no false clipping)", () => {
    const src = { x: 75, y: 29 };
    const tgt = { x: 75, y: 137 };
    const route = [
      { x: 75, y: 58 },
      { x: 75, y: 108 },
    ];
    const out = snapEndpointsToNodeBorders(route, src, tgt, HW, HH);
    expect(out).toEqual(route);
  });

  it("snaps a plain two-point center-to-center line to both borders", () => {
    const src = { x: 0, y: 0 };
    const tgt = { x: 300, y: 0 };
    const out = snapEndpointsToNodeBorders([src, tgt], src, tgt, HW, HH);
    expect(out[0]).toEqual({ x: HW, y: 0 });
    expect(out[1]).toEqual({ x: 300 - HW, y: 0 });
  });

  it("drops interior vertices when the nodes overlap", () => {
    const src = { x: 0, y: 0 };
    const tgt = { x: 40, y: 0 }; // heavily overlapping boxes
    const route = [
      { x: 20, y: 0 }, // inside both
      { x: 30, y: 5 }, // inside both
      { x: 45, y: 0 },
    ];
    const out = snapEndpointsToNodeBorders(route, src, tgt, HW, HH);
    const strictlyInside = (p: { x: number; y: number }, c: { x: number; y: number }) =>
      Math.abs(p.x - c.x) < HW && Math.abs(p.y - c.y) < HH;
    for (let i = 1; i < out.length - 1; i++) {
      expect(strictlyInside(out[i], src) || strictlyInside(out[i], tgt)).toBe(false);
    }
  });
});

describe("assignArcLanes", () => {
  const e = (id: string, source: string, target: string): Edge => ({ id, source, target });

  it("groups anti-parallel edges into one pair and lanes them by canonical order", () => {
    const lanes = assignArcLanes([e("x", "b", "a"), e("y", "a", "b")]);
    // Sorted canonically (a->b before b->a): y=lane0, x=lane1, both total 2.
    expect(lanes.get("y")).toEqual({ index: 0, total: 2 });
    expect(lanes.get("x")).toEqual({ index: 1, total: 2 });
  });

  it("ignores self-loops", () => {
    const lanes = assignArcLanes([e("s", "a", "a"), e("t", "a", "b")]);
    expect(lanes.has("s")).toBe(false);
    expect(lanes.get("t")).toEqual({ index: 0, total: 1 });
  });
});

describe("fanArcRoute", () => {
  const src = { x: 0, y: 0 };
  const tgt = { x: 300, y: 0 };

  it("fans a pair's arcs into distinct parallel lanes", () => {
    const a = fanArcRoute(src, tgt, { index: 0, total: 2 }, false, HW, HH);
    const b = fanArcRoute(src, tgt, { index: 1, total: 2 }, false, HW, HH);
    expect(a[0].y).not.toBeCloseTo(b[0].y, 0);
    expect(Math.abs(a[0].y - b[0].y)).toBeGreaterThan(20);
  });

  it("puts anti-parallel arcs on opposite sides of the axis", () => {
    const forward = fanArcRoute(src, tgt, { index: 0, total: 2 }, false, HW, HH);
    const backward = fanArcRoute(tgt, src, { index: 1, total: 2 }, true, HW, HH);
    // forward starts above the centre line, backward below (or vice versa) - opposite signs.
    expect(Math.sign(forward[0].y) === Math.sign(backward[0].y)).toBe(false);
  });

  it("keeps endpoints on the node border", () => {
    const [start, end] = fanArcRoute(src, tgt, { index: 0, total: 3 }, false, HW, HH);
    expect(Math.abs(start.y)).toBeLessThanOrEqual(HH);
    expect(Math.abs(end.y - tgt.y)).toBeLessThanOrEqual(HH);
  });
});

describe("straightenClearRoute", () => {
  const src = { x: 0, y: 0 };
  const tgt = { x: 300, y: 20 }; // near-aligned: 20px cross-offset
  // Engine emits a step jog for this near-aligned pair.
  const jog = [
    { x: HW, y: 0 },
    { x: 150, y: 0 },
    { x: 150, y: 20 },
    { x: 300 - HW, y: 20 },
  ];

  it("collapses a small unobstructed jog to a straight line", () => {
    const out = straightenClearRoute(jog, src, tgt, [], HW, HH);
    expect(out).toHaveLength(2);
  });

  it("keeps the jog when the straight line would cross another node", () => {
    const obstacle = { x: 150, y: 10 };
    const out = straightenClearRoute(jog, src, tgt, [obstacle], HW, HH);
    expect(out).toEqual(jog);
  });

  it("keeps a genuine large-deviation detour untouched", () => {
    const detour = [
      { x: HW, y: 0 },
      { x: 150, y: -120 },
      { x: 300 - HW, y: 0 },
    ];
    const out = straightenClearRoute(detour, src, { x: 300, y: 0 }, [], HW, HH);
    expect(out).toEqual(detour);
  });
});
