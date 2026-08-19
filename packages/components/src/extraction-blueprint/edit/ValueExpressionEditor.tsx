import { Button, Combobox, TextArea, TextField } from "@r4pm/components/ui";
import { useRef } from "react";
import { PiCaretDown, PiCaretUp, PiPlus, PiX } from "react-icons/pi";
import type { ValueExpression } from "../types";
import { ColumnPicker } from "./ColumnPicker";
import { PillGroup } from "./Disclosure";
import { useEditContext } from "./edit-context";
import { resolveNodeColumns, type ColumnHint } from "../schema-resolution";

export const KIND_LABEL: Record<ValueExpression["type"], string> = {
  column: "Column",
  constant: "Constant",
  template: "Template",
  coalesce: "Coalesce",
};

export const KIND_ORDER: ValueExpression["type"][] = ["column", "template", "constant", "coalesce"];

export function defaultForKind(kind: ValueExpression["type"]): ValueExpression {
  switch (kind) {
    case "column":
      return { type: "column", column: "" };
    case "constant":
      return { type: "constant", value: "" };
    case "template":
      return { type: "template", template: "" };
    case "coalesce":
      return { type: "coalesce", parts: [] };
  }
}

/**
 * Insert `{column}` at `cursorPos`, unless the text before the cursor has an unterminated `{`,
 * in which case complete that placeholder in place instead of inserting a second `{`.
 */
export function insertColumnToken(
  template: string,
  cursorPos: number,
  column: string,
): { text: string; cursorPos: number } {
  const before = template.slice(0, cursorPos);
  const after = template.slice(cursorPos);
  const openIdx = before.lastIndexOf("{");
  const closeIdx = before.lastIndexOf("}");
  if (openIdx > closeIdx) {
    const completed = `${before.slice(0, openIdx + 1)}${column}}`;
    return { text: completed + after, cursorPos: completed.length };
  }
  const token = `{${column}}`;
  return { text: before + token + after, cursorPos: cursorPos + token.length };
}

/** Move the element at `from` to `to`, shifting the elements between them -- used by Coalesce's
 *  reorder buttons. A no-op copy (new array, same order) when `to` is out of range. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export interface ValueExpressionEditorProps {
  value: ValueExpression;
  onChange: (next: ValueExpression) => void;
  /** Node whose resolved schema drives Column's picker and Template's insert-helper -- must be
   *  the node actually being edited, not some other node in the graph (a Join's schema is the
   *  union of two tables' columns under the `right_<name>` rule, so this routes through the same
   *  schema-resolution the backend's `validate.rs` uses). */
  nodeId: string;
  /** Floats the columns this field usually wants to the top of the picker. */
  hint?: ColumnHint;
  /** Values to offer for a `Constant`, as a select-or-create list. Used for type names, where the
   *  right answer is usually one the blueprint already uses elsewhere and a typo silently produces
   *  a second, near-identical type. */
  suggestions?: readonly string[];
  /** Placeholder for the `Constant` input. */
  constantPlaceholder?: string;
  /** Suppress the built-in kind pills, for a caller rendering its own switch over the same choice
   *  plus more (`OptionalValueExpression` adds an "Auto"/"None" option). */
  hideKindSwitch?: boolean;
}

/** All four kinds stay visible rather than hiding behind a dropdown: the choice is made constantly
 *  while building a mapping, and seeing them is what tells a user "Template" exists at all. */
export function ValueExpressionEditor({
  value,
  onChange,
  nodeId,
  hint,
  suggestions,
  constantPlaceholder,
  hideKindSwitch,
}: ValueExpressionEditorProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {!hideKindSwitch && (
        <div className="flex justify-end">
          <PillGroup
            value={value.type}
            options={KIND_ORDER.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            onChange={(k) => onChange(defaultForKind(k))}
          />
        </div>
      )}
      {value.type === "column" && (
        <ColumnPicker
          nodeId={nodeId}
          hint={hint}
          value={value.column}
          onValueChange={(column) => onChange({ type: "column", column })}
        />
      )}
      {value.type === "constant" &&
        (suggestions && suggestions.length > 0 ? (
          <Combobox
            size="1"
            value={value.value}
            options={suggestions}
            allowCreate
            placeholder={constantPlaceholder ?? "fixed text..."}
            onValueChange={(v) => onChange({ type: "constant", value: v })}
          />
        ) : (
          <TextField.Root
            size="1"
            value={value.value}
            onChange={(e) => onChange({ type: "constant", value: e.target.value })}
            placeholder={constantPlaceholder ?? "fixed text..."}
          />
        ))}
      {value.type === "template" && <TemplateEditor value={value} onChange={onChange} nodeId={nodeId} />}
      {value.type === "coalesce" && (
        <div className="flex flex-col gap-1.5 pl-2" style={{ borderLeft: "2px solid var(--gray-a5)" }}>
          <span className="text-[10px] opacity-55">First part that is not null wins.</span>
          {value.parts.map((part, i) => (
            <div key={i} className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <ValueExpressionEditor
                  value={part}
                  nodeId={nodeId}
                  hint={hint}
                  suggestions={suggestions}
                  onChange={(next) =>
                    onChange({
                      type: "coalesce",
                      parts: value.parts.map((p, ii) => (ii === i ? next : p)),
                    })
                  }
                />
              </div>
              <Button
                size="1"
                variant="ghost"
                color="gray"
                disabled={i === 0}
                title="Move up"
                onClick={() => onChange({ type: "coalesce", parts: moveItem(value.parts, i, i - 1) })}
              >
                <PiCaretUp />
              </Button>
              <Button
                size="1"
                variant="ghost"
                color="gray"
                disabled={i === value.parts.length - 1}
                title="Move down"
                onClick={() => onChange({ type: "coalesce", parts: moveItem(value.parts, i, i + 1) })}
              >
                <PiCaretDown />
              </Button>
              <Button
                size="1"
                variant="ghost"
                color="red"
                title="Remove part"
                onClick={() => onChange({ type: "coalesce", parts: value.parts.filter((_, ii) => ii !== i) })}
              >
                <PiX />
              </Button>
            </div>
          ))}
          <Button
            size="1"
            variant="soft"
            onClick={() => onChange({ type: "coalesce", parts: [...value.parts, defaultForKind("column")] })}
          >
            <PiPlus /> Add part
          </Button>
        </div>
      )}
    </div>
  );
}

/** `Template` needs a column-aware text input: a textarea plus a row of the node's columns,
 *  click-to-insert at the cursor. Gets most of the misspelling-prevention value without a
 *  syntax-highlighted-input primitive, which `packages/components/src/ui/` does not have today.
 *  Live inline highlighting of resolved-vs-unresolved `{placeholder}`s is a deferred follow-up. */
function TemplateEditor({
  value,
  onChange,
  nodeId,
}: {
  value: Extract<ValueExpression, { type: "template" }>;
  onChange: (next: ValueExpression) => void;
  nodeId: string;
}) {
  const edit = useEditContext();
  const columns = edit ? resolveNodeColumns(edit.model.nodes, edit.catalog, nodeId) : [];
  const ref = useRef<HTMLTextAreaElement>(null);

  const insert = (column: string) => {
    const el = ref.current;
    const cursor = el?.selectionStart ?? value.template.length;
    const { text, cursorPos } = insertColumnToken(value.template, cursor, column);
    onChange({ type: "template", template: text });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(cursorPos, cursorPos);
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <TextArea
        ref={ref}
        size="1"
        rows={2}
        value={value.template}
        onChange={(e) => onChange({ type: "template", template: e.target.value })}
        placeholder="ORD-{order_id}-{region}"
        className="font-mono"
      />
      {columns.length > 0 && (
        <div className="flex max-h-[72px] flex-wrap items-center gap-1 overflow-y-auto">
          <span className="text-[10px] opacity-55">Insert:</span>
          {columns.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => insert(c)}
              // Hover as a class: the chip declared `transition-colors` but had nothing to
              // transition to, so a row of them read as labels rather than as things to click.
              className="cursor-pointer rounded border border-[var(--gray-a5)] bg-[var(--gray-a3)] px-1 py-px font-mono text-[10px] transition-colors hover:border-[var(--accent-8)] hover:bg-[var(--accent-a4)] focus-visible:-outline-offset-1 focus-visible:outline-2 focus-visible:[outline-color:var(--accent-8)]"
            >
              {`{${c}}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
