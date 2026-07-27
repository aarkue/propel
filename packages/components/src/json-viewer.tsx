import { type CSSProperties, type ReactNode, useCallback, useState } from "react";
import { PiCaretDown, PiCaretRight, PiCheck, PiCopy } from "react-icons/pi";
import { IconButton } from "@r4pm/components/ui";
import type { StaticViewerProps } from "./viewer/viewer-config";

// rows shallower than this open on mount; deeper nodes stay collapsed
const INITIAL_OPEN_DEPTH = 2;
// past this depth a container shows only its summary, guards against stack blowup
const MAX_DEPTH = 64;
// children rendered per page; rest hides behind a "show N more" affordance
const CHILD_PAGE = 100;
const INDENT = 14;

const COLOR = {
  key: "var(--gray-12)",
  index: "var(--gray-9)",
  punct: "var(--gray-10)",
  summary: "var(--gray-9)",
  string: "var(--green-11)",
  number: "var(--blue-11)",
  boolean: "var(--amber-11)",
  nullish: "var(--gray-9)",
  other: "var(--gray-11)",
};

type ContainerInfo =
  | { kind: "array"; length: number; value: unknown[] }
  | { kind: "object"; length: number; keys: string[]; value: Record<string, unknown> };

function asContainer(v: unknown): ContainerInfo | null {
  if (Array.isArray(v)) return { kind: "array", length: v.length, value: v };
  if (typeof v === "object" && v !== null && !(v instanceof Date)) {
    const rec = v as Record<string, unknown>;
    let keys: string[];
    try {
      keys = Object.keys(rec);
    } catch {
      return null;
    }
    return { kind: "object", length: keys.length, keys, value: rec };
  }
  return null;
}

function summary(info: ContainerInfo): string {
  if (info.kind === "array") return info.length === 0 ? "[]" : `[ ${info.length} ]`;
  if (info.length === 0) return "{}";
  return `{ ${info.length} ${info.length === 1 ? "key" : "keys"} }`;
}

function leafStyle(v: unknown): { color: string; text: string; italic?: boolean } {
  if (v === null) return { color: COLOR.nullish, text: "null" };
  switch (typeof v) {
    case "string":
      return { color: COLOR.string, text: JSON.stringify(v) };
    case "number":
    case "bigint":
      return { color: COLOR.number, text: String(v) };
    case "boolean":
      return { color: COLOR.boolean, text: String(v) };
    case "undefined":
      return { color: COLOR.nullish, text: "undefined" };
    case "function":
      return { color: COLOR.other, text: "f ()", italic: true };
    default:
      try {
        return { color: COLOR.other, text: String(v) };
      } catch {
        return { color: COLOR.other, text: "[unprintable]" };
      }
  }
}

const baseRow = (depth: number): CSSProperties => ({
  paddingLeft: 2 + depth * INDENT,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

function Caret({ open }: { open: boolean }) {
  const Icon = open ? PiCaretDown : PiCaretRight;
  return (
    <Icon
      size={11}
      style={{ display: "inline-block", verticalAlign: "-1px", marginRight: 3, color: COLOR.index }}
    />
  );
}

const Spacer = () => <span style={{ display: "inline-block", width: 14 }} />;

function Label({ text, isIndex }: { text: string; isIndex: boolean }) {
  return (
    <>
      <span style={{ color: isIndex ? COLOR.index : COLOR.key }}>{text}</span>
      <span style={{ color: COLOR.punct }}>: </span>
    </>
  );
}

interface NodeProps {
  label?: string;
  isIndex?: boolean;
  value: unknown;
  depth: number;
}

function JsonNode({ label, isIndex, value, depth }: NodeProps) {
  const info = asContainer(value);
  if (info && depth < MAX_DEPTH && info.length > 0) {
    return <ContainerNode label={label} isIndex={isIndex} info={info} depth={depth} />;
  }
  const leaf = info ? { color: COLOR.summary, text: summary(info), italic: false } : leafStyle(value);
  return (
    <div style={baseRow(depth)}>
      <Spacer />
      {label !== undefined && <Label text={label} isIndex={!!isIndex} />}
      <span style={{ color: leaf.color, fontStyle: leaf.italic ? "italic" : undefined }}>{leaf.text}</span>
    </div>
  );
}

function renderChildren(info: ContainerInfo, shown: number, depth: number) {
  const upto = Math.min(shown, info.length);
  const out: ReactNode[] = [];
  for (let i = 0; i < upto; i++) {
    if (info.kind === "array") {
      out.push(<JsonNode key={i} label={String(i)} isIndex value={info.value[i]} depth={depth + 1} />);
    } else {
      const k = info.keys[i];
      out.push(<JsonNode key={k} label={k} value={info.value[k]} depth={depth + 1} />);
    }
  }
  return out;
}

function ContainerNode({
  label,
  isIndex,
  info,
  depth,
}: {
  label?: string;
  isIndex?: boolean;
  info: ContainerInfo;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < INITIAL_OPEN_DEPTH);
  const [shown, setShown] = useState(() => Math.min(info.length, CHILD_PAGE));

  const toggle = useCallback(() => setOpen((o) => !o), []);

  const openBracket = info.kind === "array" ? "[" : "{";
  const closeBracket = info.kind === "array" ? "]" : "}";
  const hidden = info.length - shown;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="hover:bg-(--gray-a3)"
        style={{
          padding: 0,
          ...baseRow(depth),
          display: "block",
          width: "100%",
          textAlign: "left",
          appearance: "none",
          background: "transparent",
          border: "none",
          font: "inherit",
          color: "inherit",
          cursor: "pointer",
          borderRadius: 4,
        }}
      >
        <Caret open={open} />
        {label !== undefined && <Label text={label} isIndex={!!isIndex} />}
        {open ? (
          <span style={{ color: COLOR.punct }}>{openBracket}</span>
        ) : (
          <span style={{ color: COLOR.summary }}>{summary(info)}</span>
        )}
      </button>
      {open && (
        <>
          {renderChildren(info, shown, depth)}
          {hidden > 0 && (
            <div style={{ paddingLeft: 2 + (depth + 1) * INDENT }}>
              <button
                type="button"
                onClick={() => setShown((s) => Math.min(info.length, s + CHILD_PAGE))}
                style={{
                  appearance: "none",
                  background: "transparent",
                  border: "none",
                  padding: "1px 0",
                  margin: 0,
                  cursor: "pointer",
                  font: "inherit",
                  color: "var(--accent-11)",
                  textDecoration: "underline",
                }}
              >
                Show {Math.min(CHILD_PAGE, hidden)} more ({hidden} hidden)
              </button>
            </div>
          )}
          <div style={{ paddingLeft: 2 + depth * INDENT, color: COLOR.punct }}>{closeBracket}</div>
        </>
      )}
    </>
  );
}

/** Universal fallback viewer: a collapsible JSON tree for any unrecognized payload. Register it LAST
 *  so specific viewers win `resolve()`, while output nodes still offer it as an alternative. */
export function JSONViewer({ data }: StaticViewerProps<unknown>) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    let text: string;
    try {
      text = JSON.stringify(data, null, 2) ?? String(data);
    } catch {
      // Circular / non-serializable payload: fall back to a best-effort string.
      text = String(data);
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }
    } catch {
      // Clipboard blocked or unavailable (insecure context, permissions): leave state unchanged.
    }
  }, [data]);

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        overflow: "auto",
        position: "relative",
        background: "var(--color-background)",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          display: "flex",
          justifyContent: "flex-end",
          padding: 6,
          background: "var(--color-background)",
        }}
      >
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          title={copied ? "Copied" : "Copy JSON"}
          aria-label={copied ? "Copied" : "Copy JSON"}
          onClick={handleCopy}
        >
          {copied ? <PiCheck /> : <PiCopy />}
        </IconButton>
      </div>
      <div
        style={{
          padding: "0 12px 12px",
          fontFamily: "var(--code-font-family, monospace)",
          fontSize: 11,
          lineHeight: 1.7,
          color: "var(--gray-12)",
        }}
      >
        <JsonNode value={data} depth={0} />
      </div>
    </div>
  );
}
