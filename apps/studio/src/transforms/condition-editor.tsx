import { IconButton, Text } from "@r4pm/components/ui";
import type { Condition } from "@r4pm/client";

// Color-coded nesting: AND=violet, OR=amber, NOT=red.

const GROUP_STYLES = {
  And: {
    bg: "var(--violet-2)",
    border: "var(--violet-6)",
    label: "AND",
    labelBg: "var(--violet-3)",
    labelColor: "var(--violet-11)",
    selectBg: "var(--violet-3)",
    selectBorder: "var(--violet-6)",
  },
  Or: {
    bg: "var(--amber-2)",
    border: "var(--amber-6)",
    label: "OR",
    labelBg: "var(--amber-3)",
    labelColor: "var(--amber-11)",
    selectBg: "var(--amber-3)",
    selectBorder: "var(--amber-6)",
  },
  Not: {
    bg: "var(--red-2)",
    border: "var(--red-6)",
    label: "NOT",
    labelBg: "var(--red-3)",
    labelColor: "var(--red-11)",
    selectBg: "var(--red-3)",
    selectBorder: "var(--red-6)",
  },
} as const;

const OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "greater than", label: "greater than" },
  { value: "less than", label: "less than" },
  { value: "contains", label: "contains" },
] as const;

function conditionToOperator(c: Condition): string {
  switch (c.type) {
    case "AttributeEquals":
      return "equals";
    case "AttributeGreaterThan":
      return "greater than";
    case "AttributeLessThan":
      return "less than";
    case "AttributeContains":
      return "contains";
    default:
      return "equals";
  }
}

function makeLeafCondition(key: string, operator: string, value: string): Condition {
  switch (operator) {
    case "greater than":
      return { type: "AttributeGreaterThan", key, value: Number.parseFloat(value) || 0 };
    case "less than":
      return { type: "AttributeLessThan", key, value: Number.parseFloat(value) || 0 };
    case "contains":
      return { type: "AttributeContains", key, substring: value };
    default:
      return { type: "AttributeEquals", key, value };
  }
}

function getLeafKey(c: Condition): string {
  if ("key" in c) return c.key;
  return "";
}

function getLeafValue(c: Condition): string {
  switch (c.type) {
    case "AttributeEquals":
      return c.value;
    case "AttributeGreaterThan":
      return String(c.value);
    case "AttributeLessThan":
      return String(c.value);
    case "AttributeContains":
      return c.substring;
    default:
      return "";
  }
}

function isLeaf(c: Condition): boolean {
  return c.type !== "And" && c.type !== "Or" && c.type !== "Not";
}

/** Render a human-readable condition summary. */
export function conditionToText(c: Condition): string {
  switch (c.type) {
    case "AttributeEquals":
      return `${c.key} = "${c.value}"`;
    case "AttributeGreaterThan":
      return `${c.key} > ${c.value}`;
    case "AttributeLessThan":
      return `${c.key} < ${c.value}`;
    case "AttributeContains":
      return `${c.key} contains "${c.substring}"`;
    case "And":
      return c.conditions.map(conditionToText).join(" AND ");
    case "Or":
      return `(${c.conditions.map(conditionToText).join(" OR ")})`;
    case "Not":
      return `NOT (${conditionToText(c.condition)})`;
  }
}

function LeafConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove?: () => void;
}) {
  const key = getLeafKey(condition);
  const value = getLeafValue(condition);
  const operator = conditionToOperator(condition);

  return (
    <div
      className="flex items-center gap-1.5"
      style={{
        background: "var(--color-background)",
        border: "1px solid var(--gray-6)",
        borderRadius: 6,
        padding: "6px 8px",
      }}
    >
      <input
        style={{
          border: "1px solid var(--gray-6)",
          borderRadius: 4,
          padding: "4px 7px",
          fontSize: 12,
          width: 95,
          outline: "none",
          fontFamily: "inherit",
          background: "var(--color-background)",
          color: "var(--gray-12)",
        }}
        value={key}
        placeholder="attribute"
        onChange={(e) => onChange(makeLeafCondition(e.target.value, operator, value))}
      />
      <select
        style={{
          border: "1px solid var(--gray-6)",
          borderRadius: 4,
          padding: "4px 7px",
          fontSize: 12,
          outline: "none",
          fontFamily: "inherit",
          background: "var(--color-background)",
          color: "var(--gray-12)",
        }}
        value={operator}
        onChange={(e) => onChange(makeLeafCondition(key, e.target.value, value))}
      >
        {OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>
      <input
        style={{
          border: "1px solid var(--gray-6)",
          borderRadius: 4,
          padding: "4px 7px",
          fontSize: 12,
          width: 70,
          outline: "none",
          fontFamily: "inherit",
          background: "var(--color-background)",
          color: "var(--gray-12)",
        }}
        value={value}
        placeholder="value"
        type={operator === "greater than" || operator === "less than" ? "number" : "text"}
        onChange={(e) => onChange(makeLeafCondition(key, operator, e.target.value))}
      />
      {onRemove && (
        <IconButton size="1" variant="ghost" color="gray" onClick={onRemove} title="Remove">
          x
        </IconButton>
      )}
    </div>
  );
}

export function ConditionEditor({
  condition,
  onChange,
  onRemove,
  depth = 0,
}: {
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove?: () => void;
  depth?: number;
}) {
  if (isLeaf(condition)) {
    return <LeafConditionRow condition={condition} onChange={onChange} onRemove={onRemove} />;
  }

  const groupType = condition.type as "And" | "Or" | "Not";
  const style = GROUP_STYLES[groupType];

  return (
    <div style={{ background: style.bg, border: `1px solid ${style.border}`, borderRadius: 8, padding: 10 }}>
      <div className="flex items-start gap-2">
        <select
          style={{
            border: `1px solid ${style.selectBorder}`,
            borderRadius: 5,
            padding: "5px 8px",
            fontSize: 11,
            fontWeight: 600,
            color: style.labelColor,
            background: style.selectBg,
            outline: "none",
            flexShrink: 0,
          }}
          value={groupType}
          onChange={(e) => {
            const v = e.target.value as "And" | "Or" | "Not";
            if (v === "Not") {
              const inner =
                condition.type === "Not"
                  ? condition.condition
                  : condition.type === "And" || condition.type === "Or"
                    ? (condition.conditions[0] ?? { type: "AttributeEquals" as const, key: "", value: "" })
                    : condition;
              onChange({ type: "Not", condition: inner });
            } else {
              const children =
                condition.type === "Not"
                  ? [condition.condition]
                  : condition.type === "And" || condition.type === "Or"
                    ? condition.conditions
                    : [condition];
              onChange({ type: v, conditions: children });
            }
          }}
        >
          <option value="And">ALL of</option>
          <option value="Or">ANY of</option>
          <option value="Not">NOT</option>
        </select>

        <div
          className="flex-1"
          style={{
            borderLeft: `2px solid ${style.border}`,
            paddingLeft: 10,
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          {groupType === "Not" && condition.type === "Not" && (
            <ConditionEditor
              condition={condition.condition}
              depth={depth + 1}
              onChange={(c) => onChange({ type: "Not", condition: c })}
            />
          )}

          {(groupType === "And" || groupType === "Or") &&
            (condition.type === "And" || condition.type === "Or") && (
              <>
                {condition.conditions.map((sub, i) => (
                  <div key={`cond-${depth}-${sub.type}-${i}`}>
                    {i > 0 && (
                      <div style={{ padding: "3px 0 3px 4px" }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: style.labelColor,
                            background: style.labelBg,
                            padding: "1px 8px",
                            borderRadius: 3,
                            border: groupType === "Or" ? `1px solid ${style.border}` : "none",
                          }}
                        >
                          {style.label}
                        </span>
                      </div>
                    )}
                    <ConditionEditor
                      condition={sub}
                      depth={depth + 1}
                      onChange={(c) => {
                        const next = [...condition.conditions];
                        next[i] = c;
                        onChange({ ...condition, conditions: next });
                      }}
                      onRemove={
                        condition.conditions.length > 1
                          ? () => {
                              onChange({
                                ...condition,
                                conditions: condition.conditions.filter((_, j) => j !== i),
                              });
                            }
                          : undefined
                      }
                    />
                  </div>
                ))}
                <div className="flex gap-2 pt-1.5">
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      color: style.labelColor,
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                    onClick={() =>
                      onChange({
                        ...condition,
                        conditions: [
                          ...condition.conditions,
                          { type: "AttributeEquals", key: "", value: "" },
                        ],
                      })
                    }
                  >
                    + Add condition
                  </button>
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--gray-9)",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                    onClick={() =>
                      onChange({
                        ...condition,
                        conditions: [
                          ...condition.conditions,
                          { type: "And", conditions: [{ type: "AttributeEquals", key: "", value: "" }] },
                        ],
                      })
                    }
                  >
                    + Add group
                  </button>
                </div>
              </>
            )}
        </div>

        {onRemove && (
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            onClick={onRemove}
            title="Remove group"
            style={{ flexShrink: 0 }}
          >
            x
          </IconButton>
        )}
      </div>
    </div>
  );
}

/** "Reads as" summary line. */
export function ConditionSummary({ condition }: { condition: Condition }) {
  return (
    <div
      style={{
        marginTop: 8,
        padding: "8px 10px",
        background: "var(--gray-2)",
        borderRadius: 6,
        border: "1px solid var(--gray-6)",
      }}
    >
      <Text size="1" color="gray" as="div" style={{ marginBottom: 2 }}>
        Reads as:
      </Text>
      <Text size="2" as="div">
        {conditionToText(condition)}
      </Text>
    </div>
  );
}
