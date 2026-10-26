import { describe, expect, it } from "vitest";
import { latestOnly, snapEndpointsToNodeBorders } from "./layout-util";

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

describe("latestOnly", () => {
  it("lets only the most recently started run apply its result", () => {
    const start = latestOnly();
    const first = start();
    const second = start();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });
});
