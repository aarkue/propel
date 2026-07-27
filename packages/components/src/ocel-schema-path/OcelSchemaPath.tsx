import type { CSSProperties } from "react";
import { PiArrowLeft, PiArrowRight } from "react-icons/pi";
import { softBadgeStyle } from "../dfg/util/colors";
import { type ColorResolver, colorForKey, colorForSeed } from "../viewer/viewer-config";

export interface OcelSchemaPathNode {
  name: string;
  kind: "event" | "object";
}

/** The relation between two consecutive nodes: a qualified edge, optionally traversed backwards. */
export interface OcelSchemaPathConnector {
  qualifier?: string;
  /** The edge is followed against its direction, so the arrow points back to the previous node. */
  reverse?: boolean;
}

export interface OcelSchemaPathProps {
  /** Ordered nodes of the path (length N). */
  nodes: OcelSchemaPathNode[];
  /** Relations between consecutive nodes (length N - 1). */
  connectors?: OcelSchemaPathConnector[];
  /** Inline, denser variant (truncated names, no qualifier labels) for tables. */
  compact?: boolean;
  /** Shared color resolver `(scope, key) => hex`; defaults to the deterministic palette so a type
   *  reads the same color here as in the `OcelTypeGraph`. */
  colorOf?: ColorResolver;
  className?: string;
}

const MUTED = "color-mix(in srgb, CanvasText 45%, transparent)";

function truncate(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function TypeChip({ node, color, compact }: { node: OcelSchemaPathNode; color: string; compact: boolean }) {
  const isEvent = node.kind === "event";
  const dotStyle: CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: isEvent ? 1 : 999,
    background: color,
    flex: "0 0 auto",
  };
  return (
    <span
      title={node.name}
      style={{
        ...softBadgeStyle(color),
        border: `1.5px solid color-mix(in srgb, ${color} 40%, transparent)`,
        borderRadius: isEvent ? 5 : 999,
        padding: compact ? "1px 7px" : "4px 11px",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flex: "0 0 auto",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: compact ? 11.5 : 13,
        lineHeight: 1.4,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {/* Compact rows drop the dot; the chip's fill/shape already carries the color there. */}
      {!compact && <span aria-hidden style={dotStyle} />}
      {compact ? truncate(node.name, 11) : node.name}
    </span>
  );
}

function Connector({ connector, compact }: { connector: OcelSchemaPathConnector; compact: boolean }) {
  const Arrow = connector.reverse ? PiArrowLeft : PiArrowRight;
  if (compact) {
    return (
      <Arrow
        size={15}
        title={connector.qualifier || undefined}
        style={{ color: MUTED, flex: "0 0 auto", margin: "0 1px" }}
      />
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 4px",
        flex: "0 0 auto",
      }}
    >
      {connector.qualifier && (
        <span
          title={connector.qualifier}
          style={{
            fontSize: 9,
            lineHeight: 1,
            color: MUTED,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            marginBottom: 2,
            maxWidth: 90,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {connector.qualifier}
        </span>
      )}
      <Arrow size={18} style={{ color: MUTED }} />
    </span>
  );
}

/** A path schema rendered as a chain of typed chips joined by qualified, directional arrows.
 *  View-only and engine-free; colors come from the shared `colorOf` so chips match the type graph. */
export function OcelSchemaPath({
  nodes,
  connectors = [],
  compact = false,
  colorOf = colorForKey,
  className,
}: OcelSchemaPathProps) {
  const colorFor = (node: OcelSchemaPathNode): string => {
    const scope = node.kind === "event" ? "activity" : "objectType";
    return colorOf(scope, node.name) ?? colorForSeed(`${scope}:${node.name}`);
  };
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        maxWidth: "100%",
        overflowX: compact ? "hidden" : "auto",
      }}
    >
      {nodes.map((node, i) => (
        <span key={`${node.kind}:${node.name}:${i}`} style={{ display: "inline-flex", alignItems: "center" }}>
          {i > 0 && connectors[i - 1] && <Connector connector={connectors[i - 1]} compact={compact} />}
          <TypeChip node={node} color={colorFor(node)} compact={compact} />
        </span>
      ))}
    </span>
  );
}
