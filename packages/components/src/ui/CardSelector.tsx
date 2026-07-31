import { useId, useMemo, type ReactNode } from "react";
import { PiCheck } from "react-icons/pi";

export interface CardSelectorOption<T extends string> {
  value: T;
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Radix color scale for this card when selected (e.g. "pink", "indigo"). Defaults to the
   *  theme accent, so a caller that does not care about per-option color still looks coherent. */
  accent?: string;
  /** Radix color scale for the *icon only* (e.g. "pink", "indigo"). Separate from `accent`, so a
   *  grid can be legible per option without a card changing four things at once when selected. */
  iconColor?: string;
  /** Greyed out but still selectable -- for an option that is legal yet discouraged in context. */
  softDisabled?: boolean;
  /** Options sharing a group render together under one heading, in first-seen order. */
  group?: string;
}

export interface CardSelectorProps<T extends string> {
  options: CardSelectorOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Rendered below the cards -- pair with `CardSelectorContent` to show the selected option's
   *  own form, which is the pattern this component exists for. */
  children?: ReactNode;
  className?: string;
  /** Cards per row at the widest breakpoint. Defaults to the option count, capped at 3. */
  columns?: 2 | 3 | 4;
  /** Heading per group key. A group with no entry here renders without a heading. */
  groupLabels?: Record<string, string>;
  /** Accessible name for the group. */
  "aria-label"?: string;
}

const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
};

/**
 * A grid of selectable cards, each with an icon, a title and a description: the "pick what kind of
 * thing this is" control, for choices that deserve more than a dropdown row because the user has
 * to read what each one *does* before choosing.
 *
 * Semantically a radio group, not tabs -- there is one choice with several options, and the panel
 * below is a consequence of the choice rather than a peer view of it. Each card wraps a visually
 * hidden native radio, so arrow-key navigation, roving tabindex and screen-reader semantics come
 * from the platform rather than being reimplemented on buttons.
 */
export function CardSelector<T extends string>({
  options,
  value,
  onValueChange,
  children,
  className,
  columns,
  groupLabels,
  "aria-label": ariaLabel,
}: CardSelectorProps<T>) {
  const gridCols = GRID_COLS[columns ?? Math.min(options.length, 3)] ?? GRID_COLS[3];
  // One `name` per instance, so several CardSelectors on a page stay independent radio groups.
  const groupName = useId();

  // Preserve first-seen order of groups. Options without a group share one anonymous group.
  const groups = useMemo(() => {
    const out: { key: string; items: CardSelectorOption<T>[] }[] = [];
    const index = new Map<string, number>();
    for (const option of options) {
      const key = option.group ?? "__default__";
      let i = index.get(key);
      if (i === undefined) {
        i = out.length;
        index.set(key, i);
        out.push({ key, items: [] });
      }
      out[i].items.push(option);
    }
    return out;
  }, [options]);

  const renderCard = (option: CardSelectorOption<T>) => {
    const selected = option.value === value;
    const accent = option.accent ?? "accent";
    return (
      <label
        key={option.value}
        className="flex cursor-pointer flex-col items-start gap-1 rounded-lg p-3 text-left transition-colors focus-within:outline-2 focus-within:outline-offset-2"
        style={{
          // 2px on both states, so selecting a card never shifts the grid.
          border: `2px solid ${selected ? `var(--${accent}-9)` : "var(--gray-a6)"}`,
          background: selected ? `var(--${accent}-a2)` : "var(--color-panel-solid)",
          opacity: option.softDisabled ? 0.55 : 1,
          outlineColor: `var(--${accent}-9)`,
        }}
      >
        {/* A real radio, visually hidden: native grouping gives arrow-key navigation, roving
            tabindex and screen-reader semantics that a role="radio" button has to reimplement. */}
        <input
          type="radio"
          name={groupName}
          value={option.value}
          checked={selected}
          onChange={() => onValueChange(option.value)}
          className="sr-only"
        />
        <div className="flex w-full items-center gap-2">
          {option.icon && (
            // Unchanged by selection: the icon says what the option is, the border and radio say
            // which one is chosen.
            <span
              className="flex shrink-0"
              style={{ color: option.iconColor ? `var(--${option.iconColor}-11)` : "var(--gray-11)" }}
            >
              {option.icon}
            </span>
          )}
          <span className="truncate text-[14px] font-medium">{option.title}</span>
          <span
            className="ml-auto flex size-4 shrink-0 items-center justify-center rounded-full transition-colors"
            style={{
              border: `1.5px solid ${selected ? `var(--${accent}-9)` : "var(--gray-a7)"}`,
              background: selected ? `var(--${accent}-9)` : "transparent",
            }}
          >
            {selected && <PiCheck size={9} color="white" />}
          </span>
        </div>
        {option.description && (
          <span className="text-[12px] leading-snug" style={{ color: "var(--gray-11)" }}>
            {option.description}
          </span>
        )}
      </label>
    );
  };

  return (
    <div className={className ? `w-full ${className}` : "w-full"}>
      <div role="radiogroup" aria-label={ariaLabel} className="mb-3 flex flex-col gap-2.5">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-1.5">
            {groupLabels?.[group.key] && (
              <span
                className="text-[12px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--gray-11)" }}
              >
                {groupLabels[group.key]}
              </span>
            )}
            <div className={`grid gap-2 ${gridCols}`}>{group.items.map(renderCard)}</div>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

/** The panel showing the selected option's own form. Always neutral: it is a work surface, so it
 *  should recede rather than take the selected card's accent. */
export function CardSelectorContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg p-4 ${className ?? ""}`}
      style={{ border: "1px solid var(--gray-a5)", background: "var(--gray-a2)" }}
    >
      {children}
    </div>
  );
}
