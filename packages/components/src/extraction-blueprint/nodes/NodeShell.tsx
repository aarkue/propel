import type { ReactNode } from "react";
import { useReactFlow } from "@xyflow/react";
import { ContextMenu, Text } from "@r4pm/components/ui";
import { PiGearSix, PiPlus, PiTrash, PiWarningCircle } from "react-icons/pi";

/** Every visual family a blueprint node can belong to. Row-producing kinds (`source`, `filter`,
 *  `join`, `union`) get a `+` affordance; mapping kinds are leaves and do not. */
export type NodeKind = "source" | "filter" | "join" | "union" | "event" | "object" | "relation";

/** Radix color scale per kind, driving the header tint, the border and the handles. Matches
 *  OCPQ's palette: sources jade, transforms warm, events pink, objects indigo, relations purple.
 *  Radix scales are theme-aware, so one name is correct in both light and dark -- which a static
 *  Tailwind color class would not be. */
export const KIND_ACCENT: Record<NodeKind, string> = {
  source: "jade",
  filter: "teal",
  join: "orange",
  union: "green",
  event: "pink",
  object: "indigo",
  relation: "purple",
};

/** Transform nodes are drawn with a dashed border, exactly as in OCPQ, so a derived row set is
 *  visually distinct from a real table and from a mapping at a glance. */
const DASHED: ReadonlySet<NodeKind> = new Set<NodeKind>(["filter", "join", "union"]);

export interface NodeShellProps {
  /** The ReactFlow node id, so the shell can offer Delete without each node wiring it up. */
  id: string;
  kind: NodeKind;
  title: string;
  /** Small muted line under the title, inside the header. */
  subtitle?: string;
  icon?: ReactNode;
  selected?: boolean;
  errorCount?: number;
  /** Shown as an amber warning strip at the top of the body. */
  warning?: string;
  /** Makes the warning strip a button -- for a warning with an obvious remedy. */
  onWarningClick?: () => void;
  width: number;
  /** Opens the configuration dialog. Omitted -> no gear (a Source node has no dialog). */
  onEdit?: () => void;
  /** Opens the add-child dialog. Omitted -> no `+` (mapping nodes are leaves). */
  onAddChild?: () => void;
  /** What Delete says in the context menu. */
  deleteLabel?: string;
  children?: ReactNode;
}

/**
 * Shared chrome for every blueprint node: a tinted header with icon, title and an optional gear;
 * a body; a validation-error badge; the `+` that opens the add-child dialog; and a right-click
 * menu.
 *
 * The context menu is per-node rather than canvas-wide on purpose. The canvas has its own
 * right-click menu (add a table), and without a node-level menu stopping the event, right-clicking
 * a node opened *that* -- offering to add a table when the user meant to delete what was under the
 * cursor.
 *
 * Handles are rendered by each node component itself, since their count and position differ
 * (Source: one source handle; Join: two named target handles; a mapping: one target).
 */
export function NodeShell({
  id,
  kind,
  title,
  subtitle,
  icon,
  selected,
  errorCount,
  warning,
  onWarningClick,
  width,
  onEdit,
  onAddChild,
  deleteLabel = "Delete node",
  children,
}: NodeShellProps) {
  const accent = KIND_ACCENT[kind];
  const { deleteElements } = useReactFlow();

  return (
    // The canvas has its own right-click menu (add a table). A right-click on a node opens the
    // node's menu first and is then stopped here, on the way up, so the canvas menu does not also
    // fire -- otherwise right-clicking a node offered to add a table.
    <div onContextMenu={(e) => e.stopPropagation()}>
      <ContextMenu.Root>
        <ContextMenu.Trigger>
          <div
            className="relative flex flex-col rounded-lg transition-shadow"
            style={{
              width,
              background: "var(--color-panel-solid)",
              border: `1.5px ${DASHED.has(kind) ? "dashed" : "solid"} ${
                selected ? `var(--${accent}-9)` : `var(--${accent}-a7)`
              }`,
              boxShadow: selected
                ? `0 0 0 3px var(--${accent}-a5), 0 4px 12px -4px rgba(0,0,0,0.25)`
                : "0 1px 2px rgba(0,0,0,0.08), 0 4px 10px -6px rgba(0,0,0,0.12)",
            }}
          >
            <div
              className="flex min-w-0 items-center gap-1.5 rounded-t-[6px] py-1 pl-2 pr-1"
              style={{
                background: `var(--${accent}-a3)`,
                borderBottom: `1px solid var(--${accent}-a5)`,
              }}
            >
              {icon && (
                <span className="flex shrink-0" style={{ color: `var(--${accent}-11)` }}>
                  {icon}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-[11px] font-semibold leading-tight"
                  style={{ color: `var(--${accent}-12)` }}
                  title={title}
                >
                  {title}
                </div>
                {subtitle && (
                  <div className="truncate text-[9px] leading-tight opacity-70" title={subtitle}>
                    {subtitle}
                  </div>
                )}
              </div>
              {onEdit && (
                <button
                  type="button"
                  title="Configure"
                  aria-label="Configure"
                  className="nodrag flex size-5 shrink-0 cursor-pointer items-center justify-center rounded border-none bg-transparent p-0 opacity-60 transition-opacity hover:opacity-100"
                  style={{ color: `var(--${accent}-11)` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <PiGearSix size={13} />
                </button>
              )}
            </div>

            <div className="flex flex-col gap-[3px] px-2 pb-1.5 pt-1.5">
              {warning &&
                (onWarningClick ? (
                  <button
                    type="button"
                    className="nodrag mb-0.5 flex cursor-pointer items-center gap-1 rounded border-none px-1 py-0.5 text-left text-[9px] leading-tight underline decoration-dotted"
                    style={{ background: "var(--amber-a3)", color: "var(--amber-11)" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onWarningClick();
                    }}
                  >
                    <PiWarningCircle className="shrink-0" size={11} />
                    {warning}
                  </button>
                ) : (
                  <div
                    className="mb-0.5 flex items-center gap-1 rounded px-1 py-0.5 text-[9px] leading-tight"
                    style={{ background: "var(--amber-a3)", color: "var(--amber-11)" }}
                  >
                    <PiWarningCircle className="shrink-0" size={11} />
                    {warning}
                  </div>
                ))}
              {children}
            </div>

            {onAddChild && (
              <button
                type="button"
                title="Add mapping or transform"
                aria-label="Add mapping or transform"
                // Sits under the output handle, since `+` adds the node on the far end of an edge.
                // Hover is paint-only via `.bp-node-affordance` -- see styles.css for why.
                className="nodrag bp-node-affordance absolute -right-2.5 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full border-none p-0 text-white shadow-sm"
                style={
                  {
                    // Inline, not `top-[calc(50%+12px)]`: CSS requires whitespace around `+` in
                    // calc(), so that arbitrary class emits a declaration the browser discards and
                    // the button falls back to a corner.
                    top: "calc(50% + 12px)",
                    background: `var(--${accent}-9)`,
                    "--bp-affordance-hover": `var(--${accent}-10)`,
                  } as React.CSSProperties
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onAddChild();
                }}
              >
                <PiPlus size={12} />
              </button>
            )}

            {!!errorCount && (
              <div
                title={`${errorCount} validation ${errorCount === 1 ? "issue" : "issues"}`}
                className="absolute -right-2 -top-2 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                style={{ background: "var(--red-9)" }}
              >
                {errorCount}
              </div>
            )}
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Content size="1">
          {onEdit && (
            <ContextMenu.Item onSelect={onEdit}>
              <PiGearSix /> Configure
            </ContextMenu.Item>
          )}
          {onAddChild && (
            <ContextMenu.Item onSelect={onAddChild}>
              <PiPlus /> Add mapping or transform
            </ContextMenu.Item>
          )}
          {(onEdit || onAddChild) && <ContextMenu.Separator />}
          <ContextMenu.Item color="red" onSelect={() => void deleteElements({ nodes: [{ id }] })}>
            <PiTrash /> {deleteLabel}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    </div>
  );
}

/** The `label: value` rows a mapping node and a transform node show under their header. */
export function SummaryRows({ lines }: { lines: { label: string; value: string }[] }) {
  if (lines.length === 0) {
    return (
      <Text size="1" color="gray" className="text-[10px] italic">
        Not configured yet
      </Text>
    );
  }
  return (
    <>
      {lines.map((line) => (
        <div key={line.label} className="flex min-w-0 items-center gap-1.5">
          <span className="w-10 shrink-0 text-[9px] uppercase tracking-wide opacity-55">{line.label}</span>
          <span
            className="truncate rounded px-1 py-px font-mono text-[10px]"
            style={{ background: "var(--gray-a3)" }}
            title={line.value}
          >
            {line.value}
          </span>
        </div>
      ))}
    </>
  );
}
