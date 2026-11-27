import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Least distance to the window's edges. */
const MARGIN = 8;

/**
 * Content floating at a point of the window (`x`, `y` in client coordinates), e.g. a tooltip or a
 * context menu. It is rendered at the theme's root, so no panel clips it or grows scrollbars for
 * it, and it flips to the other side of the point where it would leave the window.
 */
export function Floating({
  x,
  y,
  offset = 0,
  style,
  children,
  ...rest
}: {
  x: number;
  y: number;
  /** Gap between the point and the content. */
  offset?: number;
  style?: CSSProperties;
  children: ReactNode;
  role?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // Once per point: the measured size can shift with the position (seen on Windows), so measuring
  // again after its own update could flip sides forever near an edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    let left = x + offset;
    if (left + width > window.innerWidth - MARGIN) left = x - offset - width;
    let top = y + offset;
    if (top + height > window.innerHeight - MARGIN) top = y - offset - height;
    left = Math.max(MARGIN, left);
    top = Math.max(MARGIN, top);
    setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
  }, [x, y, offset]);
  // The theme root carries the colors and fonts; inside it nothing transforms or clips.
  const root = document.querySelector(".radix-themes") ?? document.body;
  return createPortal(
    <div
      ref={ref}
      {...rest}
      style={{
        position: "fixed",
        left: pos?.left ?? x + offset,
        top: pos?.top ?? y + offset,
        visibility: pos ? undefined : "hidden",
        zIndex: 1000,
        // Its size must not depend on the room left at its position, which the flip changes.
        width: "max-content",
        ...style,
      }}
    >
      {children}
    </div>,
    root,
  );
}
