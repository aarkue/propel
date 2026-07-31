// The recursive `Predicate` tree editor -- the largest single piece of Part B (see the plan's
// "Hard parts and open risks" #2). Appears in exactly two places: `NodeOp::Filter.condition`
// (always present) and `Mapping.when` (optional) -- one component serves both via `allowEmpty`.
//
// Design, per the plan:
// - And/Or render as collapsible groups with "add condition"/"add group"; Not is not its own row
//   -- every row (leaf or group) carries a "negate" toggle that wraps/unwraps it in `Not`
//   (`predicate-ops.ts`'s `toggleNegate`).
// - `Compare`'s `left`/`right` are two *independent* operand pickers (Column or Literal each), not
//   "column compared to a value" -- the two-column case (SAP's `VALUE_OLD <> VALUE_NEW`) is a
//   first-class, tested path (`predicate-ops.test.ts`), not an oversight.
// - Literal typing: when the *other* side of a `Compare` is a `Column` whose declared kind the
//   catalog resolves (via `guessColumnKind`), a literal being typed defaults to that JSON kind
//   (number/boolean/timestamp-object) instead of always emitting text and relying solely on the
//   backend's coercion rule (spec 1.7a) -- covers the catalog-unavailable case for free and costs
//   little, per the plan's recommendation. The user can still override the kind manually.
// - Recursion, not a fixed depth bound: `PredicateRow` calls itself for And/Or's children and
//   Not's condition.
import { Button, Select, Switch, Text, TextField } from "@r4pm/components/ui";
import { useId } from "react";
import { PiPlus, PiUsersThree } from "react-icons/pi";
import type { CompareOp, Literal, Operand, Predicate } from "../types";
import { RemoveButton } from "./RemoveButton";
import { type ValueKind, guessColumnKind } from "../schema-resolution";
import {
  addChild,
  defaultGroup,
  defaultLeaf,
  defaultOperand,
  isGroup,
  removeChildAt,
  setChildAt,
  setColumn,
  setCompareLeft,
  setCompareOp,
  setCompareRight,
  setGroupOp,
  setInValues,
  setRegex,
  toggleNegate,
} from "./predicate-ops";
import { ColumnPicker } from "./TablePicker";
import { useEditContext } from "./edit-context";

const COMPARE_OPS: { value: CompareOp; label: string }[] = [
  { value: "eq", label: "=" },
  { value: "ne", label: "≠" },
  { value: "lt", label: "<" },
  { value: "le", label: "≤" },
  { value: "gt", label: ">" },
  { value: "ge", label: "≥" },
];

const LEAF_KINDS: { value: Predicate["type"]; label: string }[] = [
  { value: "compare", label: "Compare" },
  { value: "is-null", label: "Is null" },
  { value: "is-empty", label: "Is empty" },
  { value: "matches", label: "Matches (regex)" },
  { value: "in", label: "In (list)" },
];

function defaultForLeafKind(kind: Predicate["type"]): Predicate {
  switch (kind) {
    case "compare":
      return { type: "compare", left: defaultOperand(), op: "eq", right: { type: "literal", value: "" } };
    case "is-empty":
      return { type: "is-empty", column: "" };
    case "matches":
      return { type: "matches", column: "", regex: "" };
    case "in":
      return { type: "in", column: "", values: [] };
    default:
      return defaultLeaf();
  }
}

export interface PredicateEditorProps {
  value: Predicate | null;
  onChange: (next: Predicate | null) => void;
  /** Node whose resolved schema drives every column picker in this tree. */
  nodeId: string;
  /** `Mapping.when` is optional (null accepts every row); `Filter.condition` is always present. */
  allowEmpty?: boolean;
}

export function PredicateEditor({ value, onChange, nodeId, allowEmpty }: PredicateEditorProps) {
  if (value === null) {
    return (
      <Button size="1" variant="soft" onClick={() => onChange(defaultLeaf())}>
        <PiPlus /> Add condition
      </Button>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <PredicateRow
        value={value}
        onChange={(next) => onChange(next)}
        onRemove={allowEmpty ? () => onChange(null) : undefined}
        nodeId={nodeId}
      />
    </div>
  );
}

interface RowProps {
  value: Predicate;
  onChange: (next: Predicate) => void;
  onRemove?: () => void;
  nodeId: string;
}

function NegateToggle({ negated, onToggle }: { negated: boolean; onToggle: () => void }) {
  const id = useId();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }} title="Negate (wrap in NOT)">
      <Switch id={id} size="1" checked={negated} onCheckedChange={onToggle} />
      <Text
        size="1"
        color={negated ? "red" : "gray"}
        weight={negated ? "bold" : undefined}
        style={{ cursor: "pointer" }}
      >
        <label htmlFor={id}>NOT</label>
      </Text>
    </div>
  );
}

function PredicateRow({ value, onChange, onRemove, nodeId }: RowProps) {
  if (value.type === "not") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: 6,
          borderRadius: 6,
          border: "1px dashed var(--red-a6)",
          background: "var(--red-a2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NegateToggle negated onToggle={() => onChange(toggleNegate(value))} />
          {onRemove && <RemoveButton label="Remove" onClick={onRemove} />}
        </div>
        <PredicateRow
          value={value.condition}
          onChange={(next) => onChange({ type: "not", condition: next })}
          nodeId={nodeId}
        />
      </div>
    );
  }

  if (isGroup(value)) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: 8,
          borderRadius: 6,
          border: "1px solid var(--gray-a6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <PiUsersThree />
          <Select.Root
            size="1"
            value={value.type}
            onValueChange={(op) => onChange(setGroupOp(value, op as "and" | "or"))}
          >
            <Select.Trigger />
            <Select.Content>
              <Select.Item value="and">AND (all)</Select.Item>
              <Select.Item value="or">OR (any)</Select.Item>
            </Select.Content>
          </Select.Root>
          <NegateToggle negated={false} onToggle={() => onChange(toggleNegate(value))} />
          {onRemove && <RemoveButton label="Remove group" onClick={onRemove} />}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            paddingLeft: 14,
            borderLeft: "2px solid var(--gray-a5)",
          }}
        >
          {value.conditions.length === 0 && (
            <Text size="1" color="gray">
              No conditions -- {value.type === "and" ? "always true" : "always false"}.
            </Text>
          )}
          {value.conditions.map((child, i) => (
            <PredicateRow
              key={i}
              value={child}
              nodeId={nodeId}
              onChange={(next) => onChange(setChildAt(value, i, next))}
              onRemove={() => onChange(removeChildAt(value, i))}
            />
          ))}
          <div style={{ display: "flex", gap: 6 }}>
            <Button size="1" variant="soft" onClick={() => onChange(addChild(value, defaultLeaf()))}>
              <PiPlus /> Condition
            </Button>
            <Button
              size="1"
              variant="soft"
              color="gray"
              onClick={() => onChange(addChild(value, defaultGroup("and")))}
            >
              <PiPlus /> Group
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Leaf: compare / is-null / is-empty / matches / in.
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
      <Select.Root
        size="1"
        value={value.type}
        onValueChange={(k) => onChange(defaultForLeafKind(k as Predicate["type"]))}
      >
        <Select.Trigger />
        <Select.Content>
          {LEAF_KINDS.map((k) => (
            <Select.Item key={k.value} value={k.value}>
              {k.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      <LeafFields value={value} onChange={onChange} nodeId={nodeId} />
      <NegateToggle negated={false} onToggle={() => onChange(toggleNegate(value))} />
      {onRemove && <RemoveButton label="Remove" onClick={onRemove} />}
    </div>
  );
}

function LeafFields({
  value,
  onChange,
  nodeId,
}: {
  value: Extract<Predicate, { type: "compare" | "is-null" | "is-empty" | "matches" | "in" }>;
  onChange: (next: Predicate) => void;
  nodeId: string;
}) {
  if (value.type === "compare") {
    return (
      <>
        <OperandEditor
          operand={value.left}
          nodeId={nodeId}
          otherColumn={value.right.type === "column" ? value.right.column : undefined}
          onChange={(left) => onChange(setCompareLeft(value, left))}
        />
        <Select.Root
          size="1"
          value={value.op}
          onValueChange={(op) => onChange(setCompareOp(value, op as CompareOp))}
        >
          <Select.Trigger />
          <Select.Content>
            {COMPARE_OPS.map((o) => (
              <Select.Item key={o.value} value={o.value}>
                {o.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <OperandEditor
          operand={value.right}
          nodeId={nodeId}
          otherColumn={value.left.type === "column" ? value.left.column : undefined}
          onChange={(right) => onChange(setCompareRight(value, right))}
        />
      </>
    );
  }
  if (value.type === "matches") {
    return (
      <>
        <ColumnPicker
          nodeId={nodeId}
          value={value.column}
          onValueChange={(column) => onChange(setColumn(value, column))}
        />
        <TextField.Root
          size="1"
          value={value.regex}
          onChange={(e) => onChange(setRegex(value, e.target.value))}
          placeholder="regex..."
          style={{ fontFamily: "var(--code-font-family, monospace)" }}
        />
      </>
    );
  }
  if (value.type === "in") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <ColumnPicker
          nodeId={nodeId}
          value={value.column}
          onValueChange={(column) => onChange(setColumn(value, column))}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {value.values.map((lit, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <LiteralEditor
                value={lit}
                suggestedKind={guessColumnKindOr(nodeId, value.column)}
                onChange={(next) =>
                  onChange(
                    setInValues(
                      value,
                      value.values.map((v, ii) => (ii === i ? next : v)),
                    ),
                  )
                }
              />
              <RemoveButton
                label="Remove value"
                onClick={() =>
                  onChange(
                    setInValues(
                      value,
                      value.values.filter((_, ii) => ii !== i),
                    ),
                  )
                }
              />
            </div>
          ))}
          <Button size="1" variant="soft" onClick={() => onChange(setInValues(value, [...value.values, ""]))}>
            <PiPlus /> Value
          </Button>
        </div>
      </div>
    );
  }
  // is-null / is-empty
  return (
    <ColumnPicker
      nodeId={nodeId}
      value={value.column}
      onValueChange={(column) => onChange(setColumn(value, column))}
    />
  );
}

function guessColumnKindOr(_nodeId: string, _column: string): ValueKind | undefined {
  // Placeholder kept as a named hook point: `In`'s literal kind is currently always text-default
  // (the column's own type isn't threaded down to this call site the way Compare's is, since `In`
  // has one column but N literals, not a column-per-literal); see EditContext for the catalog if
  // extending this to resolve here too.
  return undefined;
}

function OperandEditor({
  operand,
  onChange,
  nodeId,
  otherColumn,
}: {
  operand: Operand;
  onChange: (next: Operand) => void;
  nodeId: string;
  /** The Compare's *other* side's column name, when it is a Column operand -- used to guess this
   *  literal's JSON kind from the catalog. */
  otherColumn?: string;
}) {
  const edit = useEditContext();
  const suggestedKind =
    otherColumn && edit ? guessColumnKind(edit.model.nodes, edit.catalog, nodeId, otherColumn) : undefined;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <Select.Root
        size="1"
        value={operand.type}
        onValueChange={(t) =>
          onChange(t === "column" ? { type: "column", column: "" } : { type: "literal", value: "" })
        }
      >
        <Select.Trigger />
        <Select.Content>
          <Select.Item value="column">Column</Select.Item>
          <Select.Item value="literal">Literal</Select.Item>
        </Select.Content>
      </Select.Root>
      {operand.type === "column" ? (
        <ColumnPicker
          nodeId={nodeId}
          value={operand.column}
          onValueChange={(column) => onChange({ type: "column", column })}
        />
      ) : (
        <LiteralEditor
          value={operand.value}
          suggestedKind={suggestedKind}
          onChange={(value) => onChange({ type: "literal", value })}
        />
      )}
    </div>
  );
}

const KIND_OPTIONS: { value: ValueKind; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "integer", label: "Integer" },
  { value: "float", label: "Float" },
  { value: "boolean", label: "Boolean" },
  { value: "timestamp", label: "Timestamp" },
];

function kindOfLiteral(lit: Literal): ValueKind {
  if (typeof lit === "boolean") return "boolean";
  if (typeof lit === "number") return Number.isInteger(lit) ? "integer" : "float";
  if (typeof lit === "object" && lit !== null && "timestamp" in lit) return "timestamp";
  return "text";
}

function literalText(lit: Literal): string {
  if (typeof lit === "object" && lit !== null && "timestamp" in lit) return lit.timestamp;
  return String(lit);
}

function coerce(text: string, kind: ValueKind): Literal {
  switch (kind) {
    case "boolean":
      return text === "true";
    case "integer": {
      const n = Number.parseInt(text, 10);
      return Number.isFinite(n) ? n : text;
    }
    case "float": {
      const n = Number.parseFloat(text);
      return Number.isFinite(n) ? n : text;
    }
    case "timestamp":
      return { timestamp: text };
    default:
      return text;
  }
}

/** A `Literal` (untagged: `true` | number | string | `{timestamp}`) editor: a kind selector
 *  (defaulting to `suggestedKind` when the catalog resolves the other side's column type, per
 *  spec 1.7a's coercion rule and the plan's recommendation) plus a value input matching that kind. */
function LiteralEditor({
  value,
  onChange,
  suggestedKind,
}: {
  value: Literal;
  onChange: (next: Literal) => void;
  suggestedKind?: ValueKind;
}) {
  const kind = kindOfLiteral(value);
  const effectiveKind = value === "" && suggestedKind ? suggestedKind : kind;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <Select.Root
        size="1"
        value={effectiveKind}
        onValueChange={(k) => onChange(coerce(literalText(value), k as ValueKind))}
      >
        <Select.Trigger />
        <Select.Content>
          {KIND_OPTIONS.map((o) => (
            <Select.Item key={o.value} value={o.value}>
              {o.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      {effectiveKind === "boolean" ? (
        <Switch size="1" checked={value === true} onCheckedChange={(checked) => onChange(checked)} />
      ) : (
        <TextField.Root
          size="1"
          value={literalText(value)}
          onChange={(e) => onChange(coerce(e.target.value, effectiveKind))}
          placeholder={effectiveKind === "timestamp" ? "2024-01-01T00:00:00Z" : "value..."}
        />
      )}
    </div>
  );
}
