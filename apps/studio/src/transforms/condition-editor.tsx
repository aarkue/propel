import {
  ActivitySetLeaf,
  AttributeDistLeaf,
  AttributeLeafRow,
  DurationLeafRow,
  EntityTypeLeafRow,
} from "./conditions/leaves";
import { COMBI } from "./conditions/text";
import { EVENT_SUBSCOPE, OBJECT_SUBSCOPE, useCondEnv } from "./conditions/env";
import { TimeframeLeafRow } from "./conditions/time";
import { Button, DropdownMenu, Flex, IconButton, SegmentedControl, Select, Text } from "@r4pm/components/ui";
import { LuPlus, LuX } from "react-icons/lu";
import type { AttributeScope, Condition, MatchQuantifier } from "@r4pm/client";
import {
  buildGroup,
  type Combinator,
  defaultAttributeLeaf,
  defaultDuration,
  defaultEntityType,
  defaultEventMatch,
  defaultObjectMatch,
  defaultGroup,
  defaultTimeframeCondition,
  MATCH_QUANTIFIERS,
  readActivitySet,
  readAttrDist,
  readGroup,
} from "./condition";
// Nesting deeper than this stops offering sub-groups / related-entity matches so a
// narrow panel never becomes an unreadable staircase.
const MAX_DEPTH = 6;

function MatchBlock({
  condition,
  onChange,
  onRemove,
  depth,
}: {
  condition: Extract<Condition, { type: "EventMatch" | "ObjectMatch" }>;
  onChange: (c: Condition) => void;
  onRemove?: () => void;
  depth: number;
}) {
  const isEvent = condition.type === "EventMatch";
  const subScope = isEvent ? EVENT_SUBSCOPE : OBJECT_SUBSCOPE;
  const noun = isEvent ? "related event" : "related object";
  const quantOptions = isEvent
    ? MATCH_QUANTIFIERS
    : MATCH_QUANTIFIERS.filter((q) => q.value === "Any" || q.value === "All");
  return (
    <div
      style={{
        borderLeft: "3px solid var(--cyan-8)",
        background: "var(--cyan-2)",
        borderRadius: "0 8px 8px 0",
        padding: "8px 8px 8px 10px",
      }}
    >
      <Flex align="center" justify="between" gap="2" wrap="wrap">
        <Flex align="center" gap="2" wrap="wrap">
          <Text size="1" weight="medium" style={{ color: "var(--cyan-11)" }}>
            For
          </Text>
          <Select.Root
            value={condition.quantifier}
            onValueChange={(v) => onChange({ ...condition, quantifier: v as MatchQuantifier })}
          >
            <Select.Trigger variant="soft" color="cyan" aria-label="Quantifier" />
            <Select.Content>
              {quantOptions.map((q) => (
                <Select.Item key={q.value} value={q.value}>
                  {q.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Text size="1" weight="medium" style={{ color: "var(--cyan-11)" }}>
            {noun}:
          </Text>
        </Flex>
        {onRemove && (
          <IconButton size="1" variant="ghost" color="gray" onClick={onRemove} aria-label="Remove match">
            <LuX size={13} />
          </IconButton>
        )}
      </Flex>
      <div style={{ marginTop: 6 }}>
        <ConditionEditor
          condition={condition.condition}
          scope={subScope}
          depth={depth + 1}
          asGroupRoot
          onChange={(c) => onChange({ ...condition, condition: c })}
        />
      </div>
    </div>
  );
}

function LeafRow({
  condition,
  onChange,
  onRemove,
  scope,
  depth,
}: {
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove?: () => void;
  scope?: AttributeScope;
  depth: number;
}) {
  if (condition.type === "EventMatch" || condition.type === "ObjectMatch") {
    return <MatchBlock condition={condition} onChange={onChange} onRemove={onRemove} depth={depth} />;
  }
  if (condition.type === "Timeframe") {
    return <TimeframeLeafRow condition={condition} onChange={onChange} onRemove={onRemove} scope={scope} />;
  }
  if (condition.type === "EntityType") {
    return <EntityTypeLeafRow condition={condition} onChange={onChange} onRemove={onRemove} />;
  }
  if (condition.type === "Duration") {
    return <DurationLeafRow condition={condition} onChange={onChange} onRemove={onRemove} />;
  }
  return <AttributeLeafRow condition={condition} onChange={onChange} onRemove={onRemove} />;
}

function AddPredicateMenu({
  scope,
  depth,
  onAdd,
}: {
  scope?: AttributeScope;
  depth: number;
  onAdd: (c: Condition) => void;
}) {
  const env = useCondEnv();
  const objectType = env?.objectType;
  const eventScope = scope?.type === "Event";
  const objectScope = scope?.type === "Object";
  const unknownScope = scope == null;

  const canDuration = objectScope || unknownScope;
  const canEventMatch = objectScope && depth < MAX_DEPTH;
  const showObjectMatch = objectType === "OCEL";
  const canObjectMatch = showObjectMatch && depth < MAX_DEPTH;
  const canGroup = depth < MAX_DEPTH;
  const typeLabel = eventScope ? "Event type / activity" : objectScope ? "Object type" : "Type";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button size="2" variant="soft" style={{ width: "fit-content" }}>
          <LuPlus size={13} /> Add predicate
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Label>Attributes</DropdownMenu.Label>
        <DropdownMenu.Item onSelect={() => onAdd(defaultAttributeLeaf())}>Attribute value</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => onAdd(defaultEntityType())}>{typeLabel}</DropdownMenu.Item>

        <DropdownMenu.Separator />
        <DropdownMenu.Label>Time</DropdownMenu.Label>
        <DropdownMenu.Item onSelect={() => onAdd(defaultTimeframeCondition())}>Time window</DropdownMenu.Item>
        <DropdownMenu.Item disabled={!canDuration} onSelect={() => onAdd(defaultDuration())}>
          <Flex direction="column" style={{ lineHeight: 1.3 }}>
            <Text size="2">Duration</Text>
            {!canDuration && (
              <Text size="1" color="gray">
                Set target to a case or object
              </Text>
            )}
          </Flex>
        </DropdownMenu.Item>

        {(objectScope || showObjectMatch) && <DropdownMenu.Separator />}
        {(objectScope || showObjectMatch) && <DropdownMenu.Label>Related entities</DropdownMenu.Label>}
        {(objectScope || !eventScope) && (
          <DropdownMenu.Item disabled={!canEventMatch} onSelect={() => onAdd(defaultEventMatch())}>
            <Flex direction="column" style={{ lineHeight: 1.3 }}>
              <Text size="2">Matching event...</Text>
              {!canEventMatch && (
                <Text size="1" color="gray">
                  {depth >= MAX_DEPTH ? "Nesting too deep" : "Set target to a case or object"}
                </Text>
              )}
            </Flex>
          </DropdownMenu.Item>
        )}
        {showObjectMatch && (
          <DropdownMenu.Item disabled={!canObjectMatch} onSelect={() => onAdd(defaultObjectMatch())}>
            <Flex direction="column" style={{ lineHeight: 1.3 }}>
              <Text size="2">Related object...</Text>
              {!canObjectMatch && (
                <Text size="1" color="gray">
                  Nesting too deep
                </Text>
              )}
            </Flex>
          </DropdownMenu.Item>
        )}

        <DropdownMenu.Separator />
        <DropdownMenu.Label>Group</DropdownMenu.Label>
        <DropdownMenu.Item disabled={!canGroup} onSelect={() => onAdd(defaultGroup("all"))}>
          All-of group
        </DropdownMenu.Item>
        <DropdownMenu.Item disabled={!canGroup} onSelect={() => onAdd(defaultGroup("any"))}>
          Any-of group
        </DropdownMenu.Item>
        <DropdownMenu.Item disabled={!canGroup} onSelect={() => onAdd(defaultGroup("none"))}>
          None-of group
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

function GroupCard({
  combinator,
  childList,
  onChangeGroup,
  scope,
  depth,
  isRoot,
  onRemove,
}: {
  combinator: Combinator;
  childList: Condition[];
  onChangeGroup: (combinator: Combinator, children: Condition[]) => void;
  scope?: AttributeScope;
  depth: number;
  isRoot: boolean;
  onRemove?: () => void;
}) {
  const theme = COMBI[combinator];
  const setCombinator = (c: Combinator) => onChangeGroup(c, childList);
  const addChild = (c: Condition) => onChangeGroup(combinator, [...childList, c]);
  const updateChild = (i: number, c: Condition) =>
    onChangeGroup(
      combinator,
      childList.map((x, j) => (j === i ? c : x)),
    );
  const removeChild = (i: number) =>
    onChangeGroup(
      combinator,
      childList.filter((_, j) => j !== i),
    );

  return (
    <div
      style={
        isRoot ? { minWidth: 0 } : { borderLeft: `3px solid ${theme.rail}`, paddingLeft: 10, minWidth: 0 }
      }
    >
      <Flex align="center" justify="between" gap="2" wrap="wrap">
        <Flex align="center" gap="2">
          <SegmentedControl.Root
            size="1"
            value={combinator}
            onValueChange={(v) => v && setCombinator(v as Combinator)}
          >
            <SegmentedControl.Item value="all">All</SegmentedControl.Item>
            <SegmentedControl.Item value="any">Any</SegmentedControl.Item>
            <SegmentedControl.Item value="none">None</SegmentedControl.Item>
          </SegmentedControl.Root>
          <Text size="1" color="gray">
            {combinator === "none" ? "match none of" : "of the following"}
          </Text>
        </Flex>
        {onRemove && !isRoot && (
          <IconButton size="1" variant="ghost" color="gray" onClick={onRemove} aria-label="Remove group">
            <LuX size={13} />
          </IconButton>
        )}
      </Flex>

      <Flex direction="column" gap="2" style={{ marginTop: 8 }}>
        {childList.map((child, i) => (
          <ConditionEditor
            key={`${depth}-${i}-${child.type}`}
            condition={child}
            scope={scope}
            depth={depth + 1}
            onChange={(c) => updateChild(i, c)}
            onRemove={() => removeChild(i)}
          />
        ))}

        {childList.length === 0 && (
          <Flex align="center" gap="2" wrap="wrap">
            <Text size="1" color="gray">
              No predicates yet.
            </Text>
            <Button size="1" variant="soft" color="gray" onClick={() => addChild(defaultAttributeLeaf())}>
              Attribute
            </Button>
            <Button size="1" variant="soft" color="gray" onClick={() => addChild(defaultEntityType())}>
              Type
            </Button>
            <Button
              size="1"
              variant="soft"
              color="gray"
              onClick={() => addChild(defaultTimeframeCondition())}
            >
              Time
            </Button>
          </Flex>
        )}

        <AddPredicateMenu scope={scope} depth={depth} onAdd={addChild} />
      </Flex>
    </div>
  );
}

export function ConditionEditor({
  condition,
  onChange,
  onRemove,
  scope,
  depth = 0,
  asGroupRoot,
}: {
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove?: () => void;
  scope?: AttributeScope;
  depth?: number;
  /** Force a group shell even for a bare leaf (so predicates can be added). Defaults to depth 0. */
  asGroupRoot?: boolean;
}) {
  const env = useCondEnv();
  const rootish = asGroupRoot ?? depth === 0;

  // Composite-leaf detection needs dataset access for the rich pickers; without an env
  // (e.g. the relabel-rule editor) fall back to atomic rows and plain group handling.
  const actSet = env ? readActivitySet(condition) : null;
  const attrDist = env && actSet === null ? readAttrDist(condition) : null;
  const isRichLeaf = actSet !== null || attrDist !== null;
  const grp = isRichLeaf ? null : readGroup(condition);
  const isLeaf = grp === null;

  if (isLeaf) {
    if (rootish) {
      // Lazy group: a stored bare leaf gets group affordances, but stays a bare leaf on
      // write until a second predicate or a non-"all" combinator materializes the group.
      return (
        <GroupCard
          combinator="all"
          childList={[condition]}
          scope={scope}
          depth={depth}
          isRoot={depth === 0}
          onChangeGroup={(comb, kids) =>
            onChange(comb === "all" && kids.length === 1 ? kids[0] : buildGroup(comb, kids))
          }
        />
      );
    }
    if (actSet !== null) {
      return <ActivitySetLeaf condition={condition} onChange={onChange} onRemove={onRemove} scope={scope} />;
    }
    if (attrDist !== null) {
      return (
        <AttributeDistLeaf
          condition={condition}
          onChange={onChange}
          onRemove={onRemove}
          scope={scope}
          attrKey={attrDist.key}
        />
      );
    }
    return (
      <LeafRow condition={condition} onChange={onChange} onRemove={onRemove} scope={scope} depth={depth} />
    );
  }

  return (
    <GroupCard
      combinator={grp.combinator}
      childList={grp.children}
      scope={scope}
      depth={depth}
      isRoot={depth === 0}
      onRemove={onRemove}
      onChangeGroup={(comb, kids) => onChange(buildGroup(comb, kids))}
    />
  );
}

export { ConditionEnvProvider, type CondEnv } from "./conditions/env";
export { ConditionSummary, conditionToText } from "./conditions/text";
export { EventTimeRangePicker } from "./conditions/time";
