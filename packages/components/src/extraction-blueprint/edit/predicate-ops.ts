// Pure, immutable tree operations `PredicateEditor.tsx` is built on. Extracted from the rendering
// component on purpose: `Predicate` is a genuine recursive tree (`predicate.rs`'s And/Or/Not
// nesting), and "adding a condition inside a nested Or must not touch sibling branches" is a
// classic immutable-tree-update bug class -- exactly the kind of logic that should be pure and
// unit-testable without needing to render anything (this package has no component-rendering test
// infrastructure today -- no `@testing-library/react`, `environment: "node"` in the root
// `vitest.config.ts` -- so pure-function extraction is what makes this testable at all without
// adding that infrastructure; see `predicate-ops.test.ts`).
import type { CompareOp, Literal, Operand, Predicate } from "../types";

type Group = Extract<Predicate, { type: "and" | "or" }>;

export function isGroup(p: Predicate): p is Group {
  return p.type === "and" || p.type === "or";
}

export function defaultLeaf(): Predicate {
  return { type: "is-null", column: "" };
}

export function defaultGroup(op: "and" | "or"): Predicate {
  return { type: op, conditions: [] };
}

export function defaultOperand(): Operand {
  return { type: "column", column: "" };
}

/** Replace the child at `index` of a group, leaving every other child reference-identical. */
export function setChildAt(group: Group, index: number, next: Predicate): Predicate {
  return { ...group, conditions: group.conditions.map((c, i) => (i === index ? next : c)) };
}

/** Remove the child at `index`, leaving the others (and their order) unchanged. */
export function removeChildAt(group: Group, index: number): Predicate {
  return { ...group, conditions: group.conditions.filter((_, i) => i !== index) };
}

/** Append a child (a leaf by default; pass `defaultGroup(...)` for "add group"). */
export function addChild(group: Group, child: Predicate = defaultLeaf()): Predicate {
  return { ...group, conditions: [...group.conditions, child] };
}

/** Switch a group between And/Or, keeping its children untouched. */
export function setGroupOp(group: Group, op: "and" | "or"): Predicate {
  return { type: op, conditions: group.conditions };
}

/** Wrap in `Not`, or unwrap if already `Not` -- the toggle `PredicateEditor` renders on every row
 *  instead of giving `Not` its own row (per the plan). */
export function toggleNegate(node: Predicate): Predicate {
  return node.type === "not" ? node.condition : { type: "not", condition: node };
}

export function setCompareLeft(node: Extract<Predicate, { type: "compare" }>, left: Operand): Predicate {
  return { ...node, left };
}
export function setCompareRight(node: Extract<Predicate, { type: "compare" }>, right: Operand): Predicate {
  return { ...node, right };
}
export function setCompareOp(node: Extract<Predicate, { type: "compare" }>, op: CompareOp): Predicate {
  return { ...node, op };
}

export function setColumn(
  node: Extract<Predicate, { type: "is-null" | "is-empty" | "matches" | "in" }>,
  column: string,
): Predicate {
  return { ...node, column };
}
export function setRegex(node: Extract<Predicate, { type: "matches" }>, regex: string): Predicate {
  return { ...node, regex };
}

/** Set an `In`'s literal list wholesale -- used by add/remove-value, which build the new array
 *  first (`[...values, newLiteral]` / `values.filter((_, i) => i !== idx)`) and never touch `column`. */
export function setInValues(node: Extract<Predicate, { type: "in" }>, values: Literal[]): Predicate {
  return { ...node, values };
}
