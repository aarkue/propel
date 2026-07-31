// `ObjectEndpoint.split`: one cell holding several ids, split into one relation per part. Ported
// from OCPQ's MultiValueConfigEditor, including the thing that made it usable -- a live preview of
// what the rule does to a real sample value, so a delimiter or a regex is verified against the
// data instead of guessed and discovered wrong after a run.
import { Button, SegmentedControl, Select, Switch, Text, TextField } from "@r4pm/components/ui";
import { useId, useState } from "react";
import { PiPlus } from "react-icons/pi";
import type { SplitSpec } from "../types";
import { RemoveButton } from "./RemoveButton";

const COMMON_DELIMITERS: { value: string; label: string }[] = [
  { value: ",", label: "Comma  ," },
  { value: ";", label: "Semicolon  ;" },
  { value: "|", label: "Pipe  |" },
  { value: "/", label: "Slash  /" },
  { value: " ", label: "Space" },
  { value: "\t", label: "Tab" },
];

const CUSTOM = "__custom__";

export function defaultSplitSpec(): SplitSpec {
  return { kind: { type: "delimiter", delimiter: "," }, trim: true };
}

/** Apply `spec` to `raw` exactly as the extractor would, for the preview. A regex uses each
 *  capture group when it has any, else the whole match -- the rule the backend documents. */
export function previewSplit(spec: SplitSpec, raw: string): { values: string[] } | { error: string } {
  const trim = (v: string) => (spec.trim ? v.trim() : v);
  if (spec.kind.type === "regex") {
    if (!spec.kind.pattern) return { error: "No pattern" };
    try {
      const re = new RegExp(spec.kind.pattern, "g");
      const out: string[] = [];
      for (const m of raw.matchAll(re)) {
        if (m.length > 1) {
          for (let i = 1; i < m.length; i++) {
            const g = m[i];
            if (g != null && trim(g)) out.push(trim(g));
          }
        } else if (trim(m[0])) {
          out.push(trim(m[0]));
        }
      }
      return { values: out };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }
  if (!spec.kind.delimiter) return { values: [raw] };
  return { values: raw.split(spec.kind.delimiter).map(trim).filter(Boolean) };
}

export function SplitSpecEditor({
  value,
  onChange,
  /** A real cell value from the column being split, when one is known -- drives the preview. */
  sample,
}: {
  value: SplitSpec | null | undefined;
  onChange: (next: SplitSpec | undefined) => void;
  sample?: string;
}) {
  const delimiter = value?.kind.type === "delimiter" ? value.kind.delimiter : ",";
  const preset = COMMON_DELIMITERS.find((d) => d.value === delimiter);
  // Once "Custom" is chosen, stay there even if the typed text happens to equal a preset.
  const [customSticky, setCustomSticky] = useState(() => !preset);
  const trimId = useId();
  const custom = customSticky || !preset;

  if (!value) {
    return (
      <Button size="1" variant="soft" onClick={() => onChange(defaultSplitSpec())}>
        <PiPlus /> Split into several ids
      </Button>
    );
  }

  const previewFor = sample || (value.kind.type === "delimiter" ? `a${delimiter}b${delimiter}c` : "");
  const result = previewFor ? previewSplit(value, previewFor) : undefined;

  return (
    <div
      className="flex flex-col gap-2 rounded-md p-2"
      style={{ background: "var(--gray-a2)", border: "1px solid var(--gray-a5)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <SegmentedControl.Root
          size="1"
          value={value.kind.type}
          onValueChange={(t) =>
            onChange({
              ...value,
              kind: t === "regex" ? { type: "regex", pattern: "" } : { type: "delimiter", delimiter: "," },
            })
          }
        >
          <SegmentedControl.Item value="delimiter">Delimiter</SegmentedControl.Item>
          <SegmentedControl.Item value="regex">Regex</SegmentedControl.Item>
        </SegmentedControl.Root>
        <RemoveButton withLabel label="Remove" onClick={() => onChange(undefined)} />
      </div>

      {value.kind.type === "delimiter" && (
        <div className="flex items-center gap-2">
          <Select.Root
            size="1"
            value={custom ? CUSTOM : delimiter}
            onValueChange={(v) => {
              if (v === CUSTOM) {
                setCustomSticky(true);
                onChange({ ...value, kind: { type: "delimiter", delimiter: preset ? "" : delimiter } });
              } else {
                setCustomSticky(false);
                onChange({ ...value, kind: { type: "delimiter", delimiter: v } });
              }
            }}
          >
            <Select.Trigger className="flex-1" />
            <Select.Content>
              {COMMON_DELIMITERS.map((d) => (
                <Select.Item key={d.value} value={d.value}>
                  {d.label}
                </Select.Item>
              ))}
              <Select.Item value={CUSTOM}>Custom...</Select.Item>
            </Select.Content>
          </Select.Root>
          {custom && (
            <TextField.Root
              size="1"
              className="flex-1 font-mono"
              placeholder="separator"
              value={delimiter}
              onChange={(e) => onChange({ ...value, kind: { type: "delimiter", delimiter: e.target.value } })}
            />
          )}
        </div>
      )}

      {value.kind.type === "regex" && (
        <div className="flex flex-col gap-1">
          <TextField.Root
            size="1"
            className="font-mono"
            placeholder="(?:^|/)([\w-]+)"
            value={value.kind.pattern}
            onChange={(e) => onChange({ ...value, kind: { type: "regex", pattern: e.target.value } })}
          />
          <Text size="1" color="gray" className="text-[10px]">
            Each capture group becomes one value; with no groups, the whole match is used.
          </Text>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Switch
          id={trimId}
          size="1"
          checked={value.trim}
          onCheckedChange={(trim) => onChange({ ...value, trim })}
        />
        <label htmlFor={trimId} className="cursor-pointer">
          <Text size="1" color="gray">
            Trim whitespace around each part
          </Text>
        </label>
      </div>

      {result && (
        <div className="rounded p-1.5 text-[10px]" style={{ background: "var(--gray-a3)" }}>
          <div className="mb-1 opacity-60">
            Splitting <span className="font-mono">{previewFor}</span>
            {!sample && " (example)"}:
          </div>
          {"error" in result ? (
            <span className="font-mono" style={{ color: "var(--red-11)" }}>
              {result.error}
            </span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {result.values.map((v, i) => (
                <span
                  key={i}
                  className="rounded px-1 py-px font-mono"
                  style={{ background: "var(--purple-a4)", color: "var(--purple-11)" }}
                >
                  {v}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
