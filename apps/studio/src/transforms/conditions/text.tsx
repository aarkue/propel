import { Flex, Text } from "@r4pm/components/ui";
import type { Condition } from "@r4pm/client";
import {
  type Combinator,
  fmtDurMs,
  quantifierLabel,
  readActivitySet,
  readAttrDist,
  rfcToLocalInput,
  timeframeModeLabel,
} from "../condition";

export const COMBI: Record<Combinator, { rail: string }> = {
  all: { rail: "var(--indigo-8)" },
  any: { rail: "var(--amber-8)" },
  none: { rail: "var(--red-8)" },
};

export type AttrOp = "is" | "contains" | "gt" | "lt" | "exists";
export const ATTR_OPS: { value: AttrOp; label: string }[] = [
  { value: "is", label: "is" },
  { value: "contains", label: "contains" },
  { value: "gt", label: "greater than" },
  { value: "lt", label: "less than" },
  { value: "exists", label: "exists" },
];

export function opOf(c: Condition): AttrOp {
  switch (c.type) {
    case "AttributeGreaterThan":
      return "gt";
    case "AttributeLessThan":
      return "lt";
    case "AttributeContains":
      return "contains";
    case "AttributeExists":
      return "exists";
    default:
      return "is";
  }
}
export function keyOf(c: Condition): string {
  return "key" in c ? c.key : "";
}
export function valOf(c: Condition): string {
  switch (c.type) {
    case "AttributeEquals":
      return c.value;
    case "AttributeGreaterThan":
    case "AttributeLessThan":
      return String(c.value);
    case "AttributeContains":
      return c.substring;
    default:
      return "";
  }
}
export function makeAttr(key: string, op: AttrOp, value: string): Condition {
  switch (op) {
    case "gt":
      return { type: "AttributeGreaterThan", key, value: Number.parseFloat(value) || 0 };
    case "lt":
      return { type: "AttributeLessThan", key, value: Number.parseFloat(value) || 0 };
    case "contains":
      return { type: "AttributeContains", key, substring: value };
    case "exists":
      return { type: "AttributeExists", key };
    default:
      return { type: "AttributeEquals", key, value };
  }
}

export function conditionToText(c: Condition): string {
  switch (c.type) {
    case "AttributeEquals":
      return `${c.key || "?"} is "${c.value}"`;
    case "AttributeGreaterThan":
      return `${c.key || "?"} > ${c.value}`;
    case "AttributeLessThan":
      return `${c.key || "?"} < ${c.value}`;
    case "AttributeContains":
      return `${c.key || "?"} contains "${c.substring}"`;
    case "AttributeExists":
      return c.key ? `has ${c.key}` : "attribute (not set)";
    case "EntityType":
      return c.value ? `type is "${c.value}"` : "type (not set)";
    case "Duration": {
      const parts: string[] = [];
      if (c.min_ms != null) parts.push(`at least ${fmtDurMs(c.min_ms)}`);
      if (c.max_ms != null) parts.push(`at most ${fmtDurMs(c.max_ms)}`);
      return `lasts ${parts.join(" and ") || "any duration"}`;
    }
    case "Timeframe":
      return `${timeframeModeLabel(c.mode)} [${rfcToLocalInput(c.start)} .. ${rfcToLocalInput(c.end)}]`;
    case "EventMatch":
      return `${quantifierLabel(c.quantifier)} related event (${conditionToText(c.condition)})`;
    case "ObjectMatch":
      return `${quantifierLabel(c.quantifier)} related object (${conditionToText(c.condition)})`;
    case "And":
      return c.conditions.length ? c.conditions.map(conditionToText).join(" and ") : "anything";
    case "Or": {
      const acts = readActivitySet(c);
      if (acts)
        return `type is any of ${
          acts
            .filter(Boolean)
            .map((a) => `"${a}"`)
            .join(", ") || "(none)"
        }`;
      const dist = readAttrDist(c);
      if (dist && dist.kind === "categorical") {
        const vals = c.conditions.map((x) => (x as Extract<Condition, { type: "AttributeEquals" }>).value);
        return `${dist.key} is any of ${vals.map((v) => `"${v}"`).join(", ")}`;
      }
      return `(${c.conditions.map(conditionToText).join(" or ")})`;
    }
    case "Not": {
      const inner = c.condition;
      if (inner.type === "Or") return `none of (${inner.conditions.map(conditionToText).join(", ")})`;
      return `not (${conditionToText(inner)})`;
    }
  }
}

/** "Reads as" plain-language line. */
export function ConditionSummary({ condition }: { condition: Condition }) {
  return (
    <Flex
      direction="column"
      gap="1"
      style={{
        marginTop: 8,
        padding: "8px 10px",
        background: "var(--gray-2)",
        borderRadius: 8,
        border: "1px solid var(--gray-5)",
      }}
    >
      <Text size="1" color="gray">
        Reads as
      </Text>
      <Text size="2">{conditionToText(condition)}</Text>
    </Flex>
  );
}
