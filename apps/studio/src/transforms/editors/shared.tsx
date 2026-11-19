import type { RelabelRule } from "@r4pm/client";
import { colorForSeed, FrequencyPicker, softBadgeStyle } from "@r4pm/components";
import { Badge, Button, Flex, IconButton, SegmentedControl, Text, TextField } from "@r4pm/components/ui";
import { useState } from "react";
import { FaChevronDown, FaChevronRight, FaPlus, FaTrash } from "react-icons/fa";
import { ConditionEditor, ConditionSummary } from "../condition-editor";

export function ItemCheckboxList({
  allItems,
  selectedItems,
  onSelectionChange,
  useActivityColors = true,
  counts,
}: {
  allItems: string[];
  selectedItems: string[];
  onSelectionChange: (items: string[]) => void;
  useActivityColors?: boolean;
  /** Per-item frequency; when present the picker shows bars + the top-N cutoff rail. */
  counts?: Record<string, number>;
}) {
  const hasCounts = !!counts && allItems.some((k) => (counts[k] ?? 0) > 0);
  return (
    <FrequencyPicker
      items={allItems.map((k) => ({ key: k, count: counts?.[k] ?? 0 }))}
      value={new Set(selectedItems)}
      onChange={(s) => onSelectionChange([...s])}
      scope={useActivityColors ? "activity" : "objectType"}
      showBars={hasCounts}
      showCutoff={hasCounts}
      emptyText="No items available"
    />
  );
}

export function RelabelTable({
  items,
  rules,
  onRulesChange,
  useActivityColors = true,
}: {
  items: string[];
  rules: Record<string, RelabelRule[] | undefined>;
  onRulesChange: (rules: Record<string, RelabelRule[] | undefined>) => void;
  useActivityColors?: boolean;
}) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const getSimpleName = (item: string): string => {
    const r = rules[item];
    if (!r || r.length === 0) return "";
    if (r.length === 1 && r[0].condition === null && r[0].target.type === "Literal") return r[0].target.value;
    return "";
  };

  const setSimpleName = (item: string, newName: string) => {
    const next = { ...rules };
    if (newName.trim() === "" || newName.trim() === item) {
      delete next[item];
    } else {
      next[item] = [{ target: { type: "Literal", value: newName.trim() }, condition: null }];
    }
    onRulesChange(next);
  };

  const hasAdvanced = (item: string): boolean => {
    const r = rules[item];
    if (!r || r.length === 0) return false;
    return r.length > 1 || r[0].condition !== null || r[0].target.type === "Template";
  };

  return (
    <div className="flex flex-col gap-1.5 max-h-96 overflow-y-auto pr-1">
      {items.map((item) => {
        const expanded = expandedItem === item;
        const advanced = hasAdvanced(item);
        const itemRules = rules[item] ?? [];
        const isRenamed = getSimpleName(item) !== "";

        return (
          <div
            key={item}
            className={`rounded-lg ${expanded ? "p-3" : "px-2 py-1.5"}`}
            style={{
              background: expanded ? "var(--violet-2)" : isRenamed ? "var(--green-2)" : undefined,
              border: expanded
                ? "1px solid var(--violet-4)"
                : isRenamed
                  ? "1px solid var(--green-6)"
                  : "1px solid transparent",
            }}
          >
            <Flex align="center" gap="2" className={expanded ? "mb-3" : ""}>
              <Badge
                size="2"
                variant="surface"
                className="!shrink-0 !max-w-32"
                title={item}
                color={useActivityColors ? undefined : "gray"}
                style={useActivityColors ? softBadgeStyle(colorForSeed(`activity:${item}`)) : undefined}
              >
                <span className="truncate">{item}</span>
              </Badge>
              <Text size="2" color="gray" className="shrink-0">
                →
              </Text>
              {!advanced ? (
                <TextField.Root
                  size="2"
                  placeholder={item}
                  value={getSimpleName(item)}
                  onChange={(e) => setSimpleName(item, e.currentTarget.value)}
                  className="!flex-1"
                />
              ) : (
                <Text size="2" color="blue" className="flex-1">
                  {itemRules.length} rule{itemRules.length !== 1 ? "s" : ""}
                </Text>
              )}
              <Button
                size="1"
                variant="ghost"
                color={expanded ? "violet" : "gray"}
                onClick={() => setExpandedItem(expanded ? null : item)}
              >
                {expanded ? (
                  <>
                    <FaChevronDown size={9} /> Advanced
                  </>
                ) : (
                  <>
                    <FaChevronRight size={9} /> Advanced
                  </>
                )}
              </Button>
            </Flex>

            {expanded && (
              <div className="flex flex-col gap-2 ml-2">
                {itemRules.map((rule, idx) => (
                  <RelabelRuleCard
                    key={`rule-${item}-${rule.target.type}-${idx}`}
                    rule={rule}
                    onChange={(updated) => {
                      const next = { ...rules };
                      const list = [...(next[item] ?? [])];
                      list[idx] = updated;
                      next[item] = list;
                      onRulesChange(next);
                    }}
                    onRemove={() => {
                      const next = { ...rules };
                      const list = (next[item] ?? []).filter((_, i) => i !== idx);
                      if (list.length === 0) delete next[item];
                      else next[item] = list;
                      onRulesChange(next);
                    }}
                  />
                ))}
                <Button
                  size="1"
                  variant="soft"
                  color="gray"
                  className="!w-fit"
                  onClick={() => {
                    const next = { ...rules };
                    next[item] = [
                      ...(next[item] ?? []),
                      { target: { type: "Literal" as const, value: "" }, condition: null },
                    ];
                    onRulesChange(next);
                  }}
                >
                  <FaPlus size={8} /> Add rule
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function RelabelRuleCard({
  rule,
  onChange,
  onRemove,
}: {
  rule: RelabelRule;
  onChange: (r: RelabelRule) => void;
  onRemove: () => void;
}) {
  const [showCondition, setShowCondition] = useState(rule.condition !== null);

  return (
    <div
      style={{
        border: "1px solid var(--gray-6)",
        borderRadius: 8,
        padding: 12,
        background: "var(--color-background)",
      }}
    >
      {/* Target */}
      <Flex align="center" gap="2" mb="2">
        <Text size="1" color="gray" className="shrink-0">
          Rename to:
        </Text>
        <SegmentedControl.Root
          size="1"
          value={rule.target.type}
          onValueChange={(v) => {
            if (v === "Literal")
              onChange({
                ...rule,
                target: { type: "Literal", value: rule.target.type === "Literal" ? rule.target.value : "" },
              });
            else
              onChange({
                ...rule,
                target: {
                  type: "Template",
                  template: rule.target.type === "Template" ? rule.target.template : "",
                },
              });
          }}
        >
          <SegmentedControl.Item value="Literal">Literal</SegmentedControl.Item>
          <SegmentedControl.Item value="Template">Template</SegmentedControl.Item>
        </SegmentedControl.Root>
        <div className="flex-1">
          {rule.target.type === "Literal" ? (
            <TextField.Root
              size="1"
              placeholder="New name"
              value={rule.target.value}
              onChange={(e) =>
                onChange({ ...rule, target: { type: "Literal", value: e.currentTarget.value } })
              }
            />
          ) : (
            <TextField.Root
              size="1"
              placeholder="e.g. Order_{country}"
              value={rule.target.template}
              onChange={(e) =>
                onChange({ ...rule, target: { type: "Template", template: e.currentTarget.value } })
              }
            />
          )}
        </div>
        <IconButton size="1" variant="ghost" color="red" onClick={onRemove} title="Remove rule">
          <FaTrash size={10} />
        </IconButton>
      </Flex>

      {/* Condition toggle */}
      <button
        type="button"
        className="flex items-center gap-1.5 mb-1"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--gray-9)",
          fontSize: 12,
        }}
        onClick={() => {
          if (showCondition) {
            setShowCondition(false);
            onChange({ ...rule, condition: null });
          } else {
            setShowCondition(true);
            if (!rule.condition)
              onChange({
                ...rule,
                condition: { type: "And", conditions: [{ type: "AttributeEquals", key: "", value: "" }] },
              });
          }
        }}
      >
        {showCondition ? <FaChevronDown size={8} /> : <FaChevronRight size={8} />}
        {showCondition ? "Hide condition" : "Add condition"}
      </button>

      {showCondition && rule.condition && (
        <>
          <ConditionEditor condition={rule.condition} onChange={(c) => onChange({ ...rule, condition: c })} />
          <ConditionSummary condition={rule.condition} />
        </>
      )}
    </div>
  );
}
