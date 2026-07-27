import { describe, expect, test } from "vitest";
import {
  addChild,
  copySubtrees,
  type EditableTree,
  groupNodes,
  invalidNodes,
  isValid,
  moveSubtrees,
  newLeaf,
  newOperator,
  type ProcessTree,
  remove,
  reorder,
  setLabel,
  setOperator,
  setTau,
  subtreeIds,
  toEditable,
  topmostIds,
  toProcessTree,
  wrap,
} from "./tree";

const sample: ProcessTree = {
  root: {
    type: "Operator",
    operator_type: "Sequence",
    children: [
      { type: "Leaf", activity_label: { type: "Activity", value: "a" } },
      {
        type: "Operator",
        operator_type: "ExclusiveChoice",
        children: [
          { type: "Leaf", activity_label: { type: "Activity", value: "b" } },
          { type: "Leaf", activity_label: { type: "Tau" } },
        ],
      },
    ],
  },
};

const editable = () => toEditable(sample);
const childId = (t: EditableTree, i: number) => (t.root.type === "Operator" ? t.root.children[i].id : "");

describe("conversion", () => {
  test("toEditable -> toProcessTree is identity", () => {
    expect(toProcessTree(toEditable(sample))).toEqual(sample);
  });

  test("editable ids are unique", () => {
    const t = editable();
    const ids: string[] = [];
    const walk = (n: (typeof t)["root"]) => {
      ids.push(n.id);
      if (n.type === "Operator") n.children.forEach(walk);
    };
    walk(t.root);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("ops are pure", () => {
  test("setOperator does not mutate the input", () => {
    const t = editable();
    const snapshot = structuredClone(t);
    setOperator(t, t.root.id, "Concurrency");
    expect(t).toEqual(snapshot);
  });
});

describe("structural ops", () => {
  test("setOperator changes an operator's type", () => {
    const base = editable();
    const next = setOperator(base, base.root.id, "Loop");
    expect(next.root.type === "Operator" && next.root.operator_type).toBe("Loop");
  });

  test("setOperator on a leaf is a no-op", () => {
    const base = editable();
    const leaf = childId(base, 0);
    const next = setOperator(base, leaf, "Loop");
    expect(toProcessTree(next)).toEqual(sample);
  });

  test("addChild appends", () => {
    const base = editable();
    const next = addChild(base, base.root.id, newLeaf("c"));
    expect(next.root.type === "Operator" && next.root.children).toHaveLength(3);
    expect(toProcessTree(next).root).toMatchObject({
      children: [{}, {}, { type: "Leaf", activity_label: { type: "Activity", value: "c" } }],
    });
  });

  test("wrap puts the node under a new operator in its place", () => {
    const base = editable();
    const next = wrap(base, childId(base, 0), "Loop");
    const root = toProcessTree(next).root;
    expect(root).toMatchObject({
      children: [
        {
          type: "Operator",
          operator_type: "Loop",
          children: [{ type: "Leaf", activity_label: { type: "Activity", value: "a" } }],
        },
        {},
      ],
    });
  });

  test("wrap works on the root", () => {
    const base = editable();
    const next = wrap(base, base.root.id, "Concurrency");
    expect(next.root).toMatchObject({ type: "Operator", operator_type: "Concurrency" });
    expect(next.root.type === "Operator" && next.root.children[0].id).toBe(base.root.id);
  });

  test("remove deletes a subtree", () => {
    const base = editable();
    const next = remove(base, childId(base, 1));
    expect(toProcessTree(next).root).toMatchObject({
      children: [{ type: "Leaf", activity_label: { type: "Activity", value: "a" } }],
    });
  });

  test("remove on the root is a no-op", () => {
    const base = editable();
    expect(toProcessTree(remove(base, base.root.id))).toEqual(sample);
  });

  test("reorder moves a child", () => {
    const base = editable();
    const next = reorder(base, base.root.id, 0, 1);
    expect(next.root.type === "Operator" && next.root.children[1].id).toBe(childId(base, 0));
  });

  test("reorder ignores out-of-range indices", () => {
    const base = editable();
    expect(toProcessTree(reorder(base, base.root.id, 0, 9))).toEqual(sample);
    expect(toProcessTree(reorder(base, base.root.id, -1, 0))).toEqual(sample);
  });

  test("setLabel renames a leaf and un-taus it", () => {
    const base = editable();
    const inner = base.root.type === "Operator" ? base.root.children[1] : base.root;
    const tauId = inner.type === "Operator" ? inner.children[1].id : "";
    const next = setLabel(base, tauId, "z");
    const root = toProcessTree(next).root;
    expect(root).toMatchObject({
      children: [{}, { children: [{}, { activity_label: { type: "Activity", value: "z" } }] }],
    });
  });

  test("setTau round-trips a named leaf", () => {
    const base = editable();
    const a = childId(base, 0);
    const silent = setTau(base, a, true);
    expect(toProcessTree(silent).root).toMatchObject({
      children: [{ activity_label: { type: "Tau" } }, {}],
    });
    const named = setTau(silent, a, false);
    expect(toProcessTree(named).root).toMatchObject({
      children: [{ activity_label: { type: "Activity", value: "" } }, {}],
    });
  });

  test("setTau(false) keeps an existing activity name", () => {
    const base = editable();
    const next = setTau(base, childId(base, 0), false);
    expect(toProcessTree(next)).toEqual(sample);
  });
});

describe("subtree move/copy", () => {
  // root(Seq)[ a, xor[ b, tau ] ]
  const xorId = (t: EditableTree) => childId(t, 1);

  test("moveSubtrees re-parents a leaf into a nested operator", () => {
    const base = editable();
    const next = moveSubtrees(base, [childId(base, 0)], xorId(base), 0);
    expect(toProcessTree(next).root).toMatchObject({
      children: [
        {
          type: "Operator",
          operator_type: "ExclusiveChoice",
          children: [{ activity_label: { type: "Activity", value: "a" } }, {}, {}],
        },
      ],
    });
  });

  test("moveSubtrees clamps the index", () => {
    const base = editable();
    const next = moveSubtrees(base, [childId(base, 0)], xorId(base), 99);
    const xor = toProcessTree(next).root as { children: { children: unknown[] }[] };
    expect(xor.children[0].children).toHaveLength(3);
  });

  test("moveSubtrees within the same parent reorders", () => {
    const base = editable();
    const next = moveSubtrees(base, [childId(base, 0)], base.root.id, 1);
    expect(next.root.type === "Operator" && next.root.children[1].id).toBe(childId(base, 0));
  });

  test("moveSubtrees into its own subtree is a no-op", () => {
    const base = editable();
    expect(moveSubtrees(base, [xorId(base)], xorId(base), 0)).toBe(base);
    const inner = base.root.type === "Operator" ? base.root.children[1] : base.root;
    const innerLeaf = inner.type === "Operator" ? inner.children[0].id : "";
    expect(moveSubtrees(base, [xorId(base)], innerLeaf, 0)).toBe(base);
  });

  test("moveSubtrees of the root or onto a leaf is a no-op", () => {
    const base = editable();
    expect(moveSubtrees(base, [base.root.id], xorId(base), 0)).toBe(base);
    expect(moveSubtrees(base, [xorId(base)], childId(base, 0), 0)).toBe(base);
  });

  test("copySubtrees duplicates with fresh ids", () => {
    const base = editable();
    const next = copySubtrees(base, [xorId(base)], base.root.id, 2);
    expect(next.root.type === "Operator" && next.root.children).toHaveLength(3);
    const all = subtreeIds(next.root);
    expect(all.size).toBe(8);
    const wire = toProcessTree(next).root as { children: unknown[] };
    expect(wire.children[2]).toEqual(wire.children[1]);
  });

  test("copySubtrees onto a leaf is a no-op", () => {
    const base = editable();
    expect(toProcessTree(copySubtrees(base, [xorId(base)], childId(base, 0), 0))).toEqual(sample);
  });
});

describe("multi-node ops", () => {
  // root(Seq)[ a, xor[ b, tau ] ]
  const xorId = (t: EditableTree) => childId(t, 1);
  const xorChild = (t: EditableTree, i: number) => {
    const xor = t.root.type === "Operator" ? t.root.children[1] : t.root;
    return xor.type === "Operator" ? xor.children[i].id : "";
  };

  test("topmostIds drops ids covered by a selected ancestor, keeps document order", () => {
    const base = editable();
    const ids = new Set([xorChild(base, 0), xorId(base), childId(base, 0)]);
    expect(topmostIds(base, ids)).toEqual([childId(base, 0), xorId(base)]);
  });

  test("moveSubtrees moves several roots keeping order", () => {
    const base = editable();
    const next = moveSubtrees(base, [childId(base, 0), xorChild(base, 1)], xorId(base), 0);
    expect(toProcessTree(next).root).toMatchObject({
      children: [
        {
          operator_type: "ExclusiveChoice",
          children: [
            { activity_label: { type: "Activity", value: "a" } },
            { activity_label: { type: "Tau" } },
            { activity_label: { type: "Activity", value: "b" } },
          ],
        },
      ],
    });
  });

  test("moveSubtrees is a no-op if any id fails a guard", () => {
    const base = editable();
    expect(moveSubtrees(base, [childId(base, 0), base.root.id], xorId(base), 0)).toBe(base);
    expect(moveSubtrees(base, [childId(base, 0), xorId(base)], xorChild(base, 0), 0)).toBe(base);
  });

  test("copySubtrees inserts fresh copies of all roots", () => {
    const base = editable();
    const next = copySubtrees(base, [childId(base, 0), xorChild(base, 0)], base.root.id, 2);
    const root = toProcessTree(next).root as { children: unknown[] };
    expect(root.children).toHaveLength(4);
    expect(root.children[2]).toEqual(
      toProcessTree(base).root.type === "Operator"
        ? (toProcessTree(base).root as { children: unknown[] }).children[0]
        : null,
    );
    expect(subtreeIds(next.root).size).toBe(7);
  });

  test("groupNodes wraps siblings in place, keeping sibling order", () => {
    const base = editable();
    const next = groupNodes(base, [xorChild(base, 1), xorChild(base, 0)], "Concurrency");
    expect(toProcessTree(next).root).toMatchObject({
      children: [
        {},
        {
          operator_type: "ExclusiveChoice",
          children: [
            {
              operator_type: "Concurrency",
              children: [
                { activity_label: { type: "Activity", value: "b" } },
                { activity_label: { type: "Tau" } },
              ],
            },
          ],
        },
      ],
    });
  });

  test("groupNodes across different parents or on the root is a no-op", () => {
    const base = editable();
    expect(groupNodes(base, [childId(base, 0), xorChild(base, 0)], "Sequence")).toBe(base);
    expect(groupNodes(base, [base.root.id], "Sequence")).toBe(base);
  });
});

describe("validity", () => {
  test("the sample is valid", () => {
    expect(isValid(editable())).toBe(true);
  });

  test("a childless operator is invalid", () => {
    const t: EditableTree = { root: newOperator("Sequence") };
    expect(isValid(t)).toBe(false);
    expect(invalidNodes(t)).toEqual(new Set([t.root.id]));
  });

  test("a Loop needs two children", () => {
    const one = newOperator("Loop", [newLeaf("a")]);
    expect(isValid({ root: one })).toBe(false);
    const two = newOperator("Loop", [newLeaf("a"), newLeaf("b")]);
    expect(isValid({ root: two })).toBe(true);
  });

  test("a bare leaf is a valid tree", () => {
    expect(isValid({ root: newLeaf("a") })).toBe(true);
  });

  test("invalidNodes reports every offender, not just the first", () => {
    const t: EditableTree = {
      root: newOperator("Sequence", [newOperator("Loop", [newLeaf("a")]), newOperator("Concurrency")]),
    };
    expect(invalidNodes(t).size).toBe(2);
  });
});
