/// <reference types="vite/client" />
import { Heading, Source, useOf } from "@storybook/addon-docs/blocks";
import { useMemo, useState } from "react";
import manifest from "./component-types.generated.json";

/**
 * Custom autodocs blocks keeping everything on the component's single docs page:
 * - <ReferencedTypes/>: expandable declarations (with JSDoc) of every exported type the props
 *   table references, plus the types those reference, so opaque names resolve in place.
 * - <FullSource/>: the component's full story file, so the example is copy-paste runnable
 *   (imports + sample data included, unlike the render-fn-only "Show code" snippet).
 * Both derive everything from build artifacts (type manifest, raw story sources); nothing is
 * written per story.
 */

interface TypeEntry {
  name: string;
  kind: string;
  entry: string;
  file: string;
  code: string;
}

const TYPES = manifest as TypeEntry[];
const BY_NAME = new Map(TYPES.map((t) => [t.name, t]));
// Longest-first so e.g. OcpnFireGuardArgs matches before OcpnFireGuard.
const NAME_RE = new RegExp(
  `\\b(${[...BY_NAME.keys()].sort((a, b) => b.length - a.length).join("|")})\\b`,
  "g",
);

// Raw source of every story file, keyed like "../src/foo.stories.tsx".
const STORY_SOURCES = import.meta.glob("../src/**/*.stories.@(ts|tsx)", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Manifest types referenced by the props table, then (transitively) by those declarations. */
function collectReferenced(argTypes: unknown): TypeEntry[] {
  const found: TypeEntry[] = [];
  const seen = new Set<string>();
  const scan = (text: string) => {
    for (const m of text.matchAll(NAME_RE)) {
      const t = BY_NAME.get(m[1]);
      if (t && !seen.has(t.name)) {
        seen.add(t.name);
        found.push(t);
      }
    }
  };
  scan(JSON.stringify(argTypes) ?? "");
  // Grows while iterating: each shown declaration may pull in further named types (BFS closure).
  for (let i = 0; i < found.length; i++) scan(found[i].code);
  return found;
}

export function ReferencedTypes() {
  const resolved = useOf("story", ["story"]);
  const argTypes = resolved.type === "story" ? resolved.story.argTypes : undefined;
  const entries = useMemo(() => (argTypes ? collectReferenced(argTypes) : []), [argTypes]);
  if (!entries.length) return null;
  return (
    <>
      <Heading>Prop types</Heading>
      <p>
        Named types from the props table above, as declared in the package (including the types
        they reference). Expand to see the definition.
      </p>
      {entries.map((t) => (
        <details key={t.name} style={{ marginBottom: 8 }}>
          <summary style={{ cursor: "pointer", lineHeight: "24px" }}>
            <code style={{ fontWeight: 600 }}>{t.name}</code>{" "}
            <span style={{ opacity: 0.6, fontSize: 12 }}>
              {t.kind} from <code style={{ fontSize: 12 }}>{t.entry}</code>
            </span>
          </summary>
          <Source code={t.code} language="tsx" />
        </details>
      ))}
    </>
  );
}

/** Index of the bracket closing the one at `open` (any of `({[`, assumes well-formed code). */
function matchEnd(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if ("({[".includes(s[i])) depth++;
    else if (")}]".includes(s[i])) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Value slice starting at `start`, up to the first top-level `,` or closing bracket. */
function sliceValue(s: string, start: number): string {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if ("({[".includes(c)) depth++;
    else if (")}]".includes(c)) {
      if (depth === 0) return s.slice(start, i);
      depth--;
    } else if (c === "," && depth === 0) return s.slice(start, i);
  }
  return s.slice(start);
}

/**
 * Rewrite a story file into an app-ready example: drop `@storybook/*` imports and the
 * `const meta ... export default meta` block, and turn each `render:` story into a plain
 * exported component. Returns null when the file doesn't follow that shape (caller falls
 * back to the raw source).
 */
function toAppExample(src: string): string | null {
  let out = src.replace(/^import[^\n]*from\s+"@storybook\/[^"]*";[ \t]*\n/gm, "");
  const metaStart = out.search(/^const meta[:\s=]/m);
  const metaEnd = /^export default meta;?[ \t]*\n?/m.exec(out);
  if (metaStart < 0 || !metaEnd || metaEnd.index < metaStart) return null;
  out = out.slice(0, metaStart) + out.slice(metaEnd.index + metaEnd[0].length);

  const storyRe = /^export const (\w+)(?::[^=\n]*)? = /gm;
  let res = "";
  let cursor = 0;
  for (const m of [...out.matchAll(storyRe)]) {
    if (m.index < cursor) continue;
    const objStart = m.index + m[0].length;
    if (out[objStart] !== "{") continue;
    const objEnd = matchEnd(out, objStart);
    if (objEnd < 0) return null;
    const body = out.slice(objStart + 1, objEnd);
    const renderIdx = body.search(/\brender:/);
    if (renderIdx < 0) return null;
    const fn = m[1] === "Default" ? "Example" : m[1];
    let vStart = renderIdx + "render:".length;
    while (vStart < body.length && /\s/.test(body[vStart])) vStart++;
    let example: string;
    if (body.startsWith("function", vStart)) {
      const bOpen = body.indexOf("{", vStart);
      const bEnd = bOpen < 0 ? -1 : matchEnd(body, bOpen);
      if (bEnd < 0) return null;
      example = `export ${body.slice(vStart, bEnd + 1).replace(/^function\s*\(/, `function ${fn}(`)}`;
    } else {
      const arrowIdx = body.indexOf("=>", vStart);
      if (arrowIdx < 0) return null;
      let valStart = arrowIdx + 2;
      while (valStart < body.length && /\s/.test(body[valStart])) valStart++;
      let jsx: string;
      if (body[valStart] === "{") {
        // Block-bodied arrow: its body becomes the component body as-is.
        const bEnd = matchEnd(body, valStart);
        if (bEnd < 0) return null;
        res += out.slice(cursor, m.index);
        res += `export function ${fn}() ${body.slice(valStart, bEnd + 1)}`;
        cursor = objEnd + 1;
        while (out[cursor] === ";") cursor++;
        continue;
      }
      if (body[valStart] === "(") {
        const valEnd = matchEnd(body, valStart);
        if (valEnd < 0) return null;
        jsx = body.slice(valStart + 1, valEnd);
      } else {
        jsx = sliceValue(body, valStart);
      }
      jsx = jsx.trim();
      example = jsx.includes("\n")
        ? `export function ${fn}() {\n  return (\n    ${jsx}\n  );\n}`
        : `export function ${fn}() {\n  return ${jsx};\n}`;
    }
    res += out.slice(cursor, m.index);
    res += example;
    cursor = objEnd + 1;
    while (out[cursor] === ";") cursor++;
  }
  res += out.slice(cursor);
  return `${res.replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        zIndex: 1,
        padding: "4px 12px",
        border: "none",
        borderLeft: "1px solid rgba(0,0,0,0.1)",
        borderBottom: "1px solid rgba(0,0,0,0.1)",
        borderRadius: "0 4px 0 4px",
        background: "#fff",
        color: "#2b9a66",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function FullSource() {
  const resolved = useOf("story", ["story"]);
  const fileName =
    resolved.type === "story" ? (resolved.story.parameters?.fileName as string | undefined) : undefined;
  const code = useMemo(() => {
    if (!fileName) return undefined;
    // fileName is project-relative ("./src/x.stories.tsx"); glob keys are relative to this dir.
    const tail = fileName.replace(/^\.\//, "");
    const hit = Object.entries(STORY_SOURCES).find(([k]) => k.replace(/^(\.\.\/)+/, "") === tail);
    return hit && (toAppExample(hit[1]) ?? hit[1]);
  }, [fileName]);
  if (!code) return null;
  return (
    <>
      <Heading>Full example</Heading>
      <p>
        Standalone version of the example above, including imports and sample data. Copy it into
        your app as a starting point (render it inside <code>{"<Theme>"}</code> from{" "}
        <code>@r4pm/components</code>).
      </p>
      {/* Own copy button pinned top-right; the Source block's built-in one (bottom-right) is hidden.
          The Source margin moves to the wrapper so the button anchors to the visible block. */}
      <div className="r4pm-fullsource" style={{ position: "relative", margin: "16px 0 40px" }}>
        <style>{`
          .r4pm-fullsource .docblock-source { margin: 0; }
          .r4pm-fullsource .docblock-source > div:has(> button) { display: none; }
        `}</style>
        <CopyButton text={code} />
        <Source code={code} language="tsx" />
      </div>
    </>
  );
}
