import { type PointerEvent, useEffect, useRef, useState } from "react";
import type { Rect } from "../viz/types";
import { useKeyedState } from "./hooks";

/** A scene drawn at `translate(x y) scale(k)`, in px of its box. */
export interface PanZoomView {
  k: number;
  x: number;
  y: number;
}

/** The view that centers `bounds`, with `pad` around them, in a `w` by `h` box, scaled up to `maxScale`. */
export function fitView(
  bounds: Rect,
  box: { w: number; h: number },
  pad: number,
  maxScale = Number.POSITIVE_INFINITY,
): PanZoomView {
  const bw = bounds.max.x - bounds.min.x + 2 * pad;
  const bh = bounds.max.y - bounds.min.y + 2 * pad;
  const k = Math.min(box.w / bw, box.h / bh, maxScale);
  return {
    k,
    x: (box.w - bw * k) / 2 - (bounds.min.x - pad) * k,
    y: (box.h - bh * k) / 2 - (bounds.min.y - pad) * k,
  };
}

/**
 * Wheel zoom around the pointer and drag to pan over `element`, which gets the returned `handlers`.
 * The view starts at `fit` and goes back to it when `key` changes or on `reset`.
 */
export function usePanZoom(element: Element | null, fit: PanZoomView, key: unknown) {
  const [view, setView] = useKeyedState<PanZoomView | null>(key, null);
  const current = view ?? fit;
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const minK = Math.min(0.1, fit.k);
  const maxK = Math.max(8, fit.k);
  const zoomAt = (factor: number, px: number, py: number) => {
    const k = Math.min(maxK, Math.max(minK, current.k * factor));
    setView({
      k,
      x: px - ((px - current.x) / current.k) * k,
      y: py - ((py - current.y) / current.k) * k,
    });
  };
  // The wheel listener lives across renders, so it reads the latest zoom through a ref.
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;
  // React attaches wheel listeners as passive, so keeping the page from scrolling needs a native one.
  useEffect(() => {
    if (!element) return;
    const onWheel = (e: Event) => {
      const w = e as WheelEvent;
      w.preventDefault();
      const r = element.getBoundingClientRect();
      zoomRef.current(Math.exp(-w.deltaY * 0.0015), w.clientX - r.left, w.clientY - r.top);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [element]);

  const end = () => {
    drag.current = null;
    setDragging(false);
  };
  // Panning goes from where the drag started, so moves that arrive between renders do not add up.
  const handlers = {
    onPointerDown: (e: PointerEvent<Element>) => {
      if (e.button !== 0) return;
      // Otherwise the drag also selects text across the page.
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, vx: current.x, vy: current.y };
      setDragging(true);
    },
    onPointerMove: (e: PointerEvent<Element>) => {
      const d = drag.current;
      if (d) setView({ k: current.k, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y });
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
  const zoomBy = (factor: number) => {
    const r = element?.getBoundingClientRect();
    zoomAt(factor, (r?.width ?? 0) / 2, (r?.height ?? 0) / 2);
  };
  return { view: current, handlers, dragging, zoomBy, reset: () => setView(null) };
}
