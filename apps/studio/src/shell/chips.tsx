import { Badge, Popover, Separator, Text } from "@r4pm/components/ui";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { PiCaretLeft, PiCaretRight } from "react-icons/pi";
import { colorForKind, labelForKind } from "./object-colors";

/**
 * Horizontal, scrollable strip of chips with fade-in scroll arrows and an empty state. Shared by the
 * dataset and artifact strips so both scroll and look identical; the caller supplies the chip.
 */
export function ChipStrip<T extends { id: string }>({
  items,
  emptyText,
  renderChip,
  variant = "scroll",
}: {
  items: T[];
  emptyText: string;
  renderChip: (item: T) => ReactNode;
  /** "scroll" (default): single row, horizontal scroll + arrows. "wrap": chips wrap onto multiple rows (dialog / mobile). */
  variant?: "scroll" | "wrap";
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the item count changes
  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    el.addEventListener("scroll", updateScrollState);
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", updateScrollState);
    };
  }, [updateScrollState, items.length]);

  const scrollBy = (amount: number) => {
    scrollRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  };

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-(--gray-10) pl-1">
        <Text size="1" color="gray">
          {emptyText}
        </Text>
      </div>
    );
  }

  if (variant === "wrap") {
    return <div className="flex flex-wrap items-center gap-1.5">{items.map(renderChip)}</div>;
  }

  return (
    <div className="relative flex items-center min-w-0 flex-1">
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-200)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-(--color-panel-solid) rounded-full p-0.5 border border-(--gray-a6) shadow-sm hover:bg-(--gray-3)"
          aria-label="Scroll left"
        >
          <PiCaretLeft size={14} />
        </button>
      )}
      <div ref={scrollRef} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-1 min-w-0">
        {items.map(renderChip)}
      </div>
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollBy(200)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-(--color-panel-solid) rounded-full p-0.5 border border-(--gray-a6) shadow-sm hover:bg-(--gray-3)"
          aria-label="Scroll right"
        >
          <PiCaretRight size={14} />
        </button>
      )}
    </div>
  );
}

/** One action row inside an {@link EntityChip} popover. Consistent styling for open/export/unload/etc. */
export function ChipAction({
  icon,
  onClick,
  danger,
  title,
  children,
}: {
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left cursor-pointer ${
        danger ? "text-(--red-11) hover:bg-(--red-a3)" : "text-(--gray-12) hover:bg-(--gray-a3)"
      }`}
    >
      {icon && <span className="text-(--gray-11)">{icon}</span>}
      {children}
    </button>
  );
}

/**
 * A loaded-entity chip (dataset or artifact): a colored pill showing the label + kind, whose popover
 * lets the user rename it inline (label persists engine-side), see the raw id, and run entity-specific
 * actions. Actions are supplied by the caller via `children`, which receives a `close` callback.
 */
export function EntityChip({
  id,
  label,
  kind,
  testId,
  onRename,
  children,
}: {
  id: string;
  label: string;
  kind: string;
  testId: string;
  onRename: (label: string) => void;
  children: (close: () => void) => ReactNode;
}) {
  const color = colorForKind(kind);
  const [open, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(label);
  useEffect(() => setNameDraft(label), [label]);

  const close = () => setOpen(false);
  const commitRename = () => {
    if (nameDraft.trim() !== label) onRename(nameDraft);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <button
          type="button"
          data-testid={testId}
          className="group flex items-center gap-1.5 h-7 px-2 rounded-full border text-xs whitespace-nowrap cursor-pointer transition-colors shrink-0 border-(--gray-a6) hover:border-(--indigo-8) hover:bg-(--indigo-a2)"
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: `var(--${color}-9)` }}
          />
          <span className="font-medium text-(--gray-12) max-w-40 truncate">{label}</span>
          <Badge size="1" variant="soft" color={color} className="py-0! px-1! text-[10px]!">
            {labelForKind(kind)}
          </Badge>
        </button>
      </Popover.Trigger>
      <Popover.Content size="1" className="p-0!" maxWidth="280px">
        <div className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Badge size="1" variant="soft" color={color}>
              {labelForKind(kind)}
            </Badge>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                else if (e.key === "Escape") {
                  setNameDraft(label);
                  e.currentTarget.blur();
                }
              }}
              spellCheck={false}
              aria-label="Name"
              className="flex-1 min-w-0 bg-transparent text-sm font-medium text-(--gray-12) border-b border-transparent hover:border-(--gray-a6) focus:border-(--indigo-8) outline-none py-0.5"
            />
          </div>
          <span className="block text-[10px] font-mono text-(--gray-9) break-all" title="Object id">
            {id}
          </span>
        </div>
        <Separator size="4" />
        <div className="p-1">{children(close)}</div>
      </Popover.Content>
    </Popover.Root>
  );
}
