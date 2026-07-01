import type { ViewerProps } from "./viewer/viewer-config";

/** Universal fallback viewer: pretty-prints any result as JSON. Register it LAST so specific
 *  viewers win `resolve()`, while output nodes still offer it as an alternative visualization. */
export function JSONViewer({ data }: ViewerProps<unknown>) {
  return (
    <div style={{ height: "100%", width: "100%", overflow: "auto", padding: 12 }}>
      <pre
        style={{
          margin: 0,
          fontSize: 11,
          fontFamily: "var(--code-font-family, monospace)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          color: "var(--gray-12)",
        }}
      >
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
