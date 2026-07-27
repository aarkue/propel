import { useStore } from "@xyflow/react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import {
  addChild,
  newLeaf,
  newOperator,
  OPERATOR_SYMBOL,
  OPERATOR_TITLE,
  OPERATOR_TYPES,
  wrap,
} from "../tree";
import { useTreeEditor } from "./Editor";

type MenuEntry =
  | { key: string; heading: string }
  | { key: string; heading?: undefined; label: ReactNode; title?: string; onPick: () => void };

/** A button that opens a small popover of actions below itself. */
function MenuButton(props: {
  trigger: ReactNode;
  title: string;
  items: MenuEntry[];
  wrapClass?: string;
  menuStyle?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={ref} className={`pt-menu-wrap ${props.wrapClass ?? ""} ${open ? "open" : ""}`}>
      <button
        type="button"
        title={props.title}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {props.trigger}
      </button>
      {open && (
        <div className="pt-menu nodrag" style={props.menuStyle}>
          {props.items.map((it) =>
            it.heading !== undefined ? (
              <span key={it.key} className="pt-menu-heading">
                {it.heading}
              </span>
            ) : (
              <button
                key={it.key}
                type="button"
                title={it.title}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  it.onPick();
                }}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

const operatorEntries = (onPick: (op: (typeof OPERATOR_TYPES)[number]) => void): MenuEntry[] =>
  OPERATOR_TYPES.map((op) => ({
    key: op,
    label: (
      <>
        <span className="pt-menu-symbol">{OPERATOR_SYMBOL[op]}</span> {OPERATOR_TITLE[op]}
      </>
    ),
    onPick: () => onPick(op),
  }));

/** "Add parent": inserts the picked operator between this node and its current parent. */
export function InsertParentButton({ id }: { id: string }) {
  const { apply } = useTreeEditor();
  return (
    <MenuButton
      trigger={<>Add parent ▾</>}
      title="Insert a new operator between this node and its parent"
      items={[
        { key: "h", heading: "New parent operator" },
        ...operatorEntries((op) => apply((t) => wrap(t, id, op))),
      ]}
    />
  );
}

/** The hover "+" on an operator: appends a new child of the picked kind. */
export function AddChildSlot({ id }: { id: string }) {
  const { apply } = useTreeEditor();
  // The slot scales with the canvas zoom; counter-scale the menu so it stays at screen size.
  const zoom = useStore((s) => s.transform[2]);
  return (
    <MenuButton
      wrapClass="pt-add-slot nodrag"
      trigger="+"
      title="Add a child (appended after the last one)"
      menuStyle={{
        transform: `translateX(-50%) scale(${1 / zoom})`,
        transformOrigin: "top center",
      }}
      items={[
        { key: "h-step", heading: "Add step" },
        {
          key: "activity",
          label: (
            <>
              <span className="pt-menu-symbol">▭</span> Activity
            </>
          ),
          onPick: () => apply((t) => addChild(t, id, newLeaf(""))),
        },
        {
          key: "tau",
          label: (
            <>
              <span className="pt-menu-symbol">τ</span> Silent step
            </>
          ),
          title: "A step that leaves no trace in the log",
          onPick: () => apply((t) => addChild(t, id, newLeaf())),
        },
        { key: "h-op", heading: "Add operator" },
        ...operatorEntries((op) => apply((t) => addChild(t, id, newOperator(op)))),
      ]}
    />
  );
}
