import { Text } from "@r4pm/components/ui";
import { type ColorResolver, useViewerConfig } from "../viewer/viewer-config";
import { type FreqItem, normalizeItems, sortByCountDesc } from "../inputs/selection";

// Self-coloring when no shared `colorOf` resolver is provided (standalone /
// Storybook / external hosts). Assigned by rank so the few visible items stay
// distinct (no hash collisions). A real ViewerConfig colorOf always wins.
const FALLBACK_PALETTE = [
  "#4f46e5",
  "#0891b2",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#9333ea",
  "#0d9488",
  "#db2777",
];

function withAlpha(color: string, alphaHex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alphaHex}` : color;
}

export interface RankedBarListProps {
  items: FreqItem[] | Record<string, number>;
  /** Scope passed to the shared colorOf resolver (e.g. "activity", "objectType"). */
  scope?: string;
  /** Override the color resolver; defaults to the shared ViewerConfig colorOf. */
  colorOf?: ColorResolver;
  /** Show at most this many rows (highest counts first). */
  max?: number;
  /** Format the value shown on the right (default: localized integer). */
  valueFormat?: (n: number) => string;
  onItemClick?: (key: string) => void;
  emptyText?: string;
}

/** Read-only ranked list with inline frequency data-bars + color swatches. Display
 *  sibling of FrequencyPicker; used for count/distribution displays (OCEL counts,
 *  activity frequencies, log-only alignment moves). */
export function RankedBarList({
  items,
  scope = "activity",
  colorOf,
  max,
  valueFormat,
  onItemClick,
  emptyText = "No items",
}: RankedBarListProps) {
  const cfg = useViewerConfig({ colorOf });
  const fmt = valueFormat ?? ((n: number) => n.toLocaleString("en"));

  const sorted = sortByCountDesc(normalizeItems(items));
  const shown = max ? sorted.slice(0, max) : sorted;
  const maxCount = Math.max(1, ...sorted.map((i) => i.count));

  if (shown.length === 0) {
    return (
      <Text size="1" color="gray">
        {emptyText}
      </Text>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        width: "100%",
        height: "100%",
        overflowY: "auto",
        paddingBlockEnd: "2rem",
      }}
    >
      {shown.map((it, i) => {
        const c = cfg.colorOf?.(scope, it.key) ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
        const rowStyle = {
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          minHeight: 30,
          padding: "0 8px",
          borderRadius: 6,
          border: "none",
          background: "transparent",
          textAlign: "left",
          cursor: onItemClick ? "pointer" : "default",
        } as const;
        const inner = (
          <>
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                top: 3,
                bottom: 3,
                width: `${(100 * it.count) / maxCount}%`,
                borderRadius: 6,
                background: withAlpha(c, "24"),
                pointerEvents: "none",
              }}
            />
            <span
              style={{
                position: "relative",
                width: 10,
                height: 10,
                borderRadius: 3,
                flex: "0 0 auto",
                background: c,
              }}
            />
            <span
              className="truncate"
              style={{
                position: "relative",
                flex: 1,
                minWidth: 0,
                fontSize: 13,
                fontWeight: 500,
                color: "var(--gray-12)",
              }}
            >
              {it.key}
            </span>
            <span
              className="tabular-nums"
              style={{ position: "relative", fontSize: 12, color: "var(--gray-11)", flex: "0 0 auto" }}
            >
              {fmt(it.count)}
            </span>
          </>
        );
        const title = `${it.key} (${fmt(it.count)})`;
        return onItemClick ? (
          <button
            key={it.key}
            type="button"
            onClick={() => onItemClick(it.key)}
            title={title}
            style={rowStyle}
          >
            {inner}
          </button>
        ) : (
          <div key={it.key} title={title} style={rowStyle}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
