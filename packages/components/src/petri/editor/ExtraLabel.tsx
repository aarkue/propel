import type { ElementStyle } from "../../viz";

/** A node's `extra_label`, as the line rust4pm's drawing adds under the node's content. */
export default function ExtraLabel({ style }: { style?: ElementStyle }) {
  if (!style?.extra_label) return null;
  return (
    <div
      style={{
        width: "100%",
        textAlign: "center",
        fontSize: 10.5,
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        color: "var(--r4pm-node-text)",
      }}
    >
      {style.extra_label}
    </div>
  );
}
