import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button, Flex, Popover, ScrollArea, Text, TextField } from "@radix-ui/themes";
import { PiCaretDown, PiCheck, PiPlus } from "react-icons/pi";

export interface ComboboxProps {
  /** Currently selected value (controlled). */
  value?: string;
  /** Selectable options. */
  options: readonly string[];
  /** Called with the chosen value - an existing option, or the typed text when created. */
  onValueChange: (value: string) => void;
  /** Offer a "Create ..." row for a typed value that matches no option. */
  allowCreate?: boolean;
  /** Trigger text when nothing is selected. */
  placeholder?: string;
  /** Search-field placeholder. */
  searchPlaceholder?: string;
  /** Label for the create row; defaults to `Create "<query>"`. */
  createLabel?: (query: string) => string;
  /** Shown when no option matches and creation is unavailable. */
  emptyLabel?: ReactNode;
  /** Color swatch shown next to an option (and the selected value), e.g. an object type's color. */
  optionColor?: (value: string) => string | undefined;
  /** Keep the popover open after a choice, clearing the query and holding focus - so several values
   *  can be added in a row (type, Enter, type, Enter). Best paired with a controlled `value=""`. */
  keepOpenOnSelect?: boolean;
  /** Open the popover on mount (and focus its search) - e.g. to continue a keyboard flow into the
   *  next field. Only the initial mount opens; it does not force-open on later renders. */
  autoOpen?: boolean;
  size?: "1" | "2" | "3";
  disabled?: boolean;
  /** Accessible name for the control and its listbox. */
  "aria-label"?: string;
  /** Style applied to the trigger. */
  style?: CSSProperties;
}

/**
 * Accessible select-or-create combobox built on Radix Themes. A trigger reveals a
 * filterable listbox; with `allowCreate`, typing a new name offers a "Create" row that
 * selects the typed value. Keyboard: type to filter, Up/Down to move, Enter to choose,
 * Escape to close. Implements the editable-combobox ARIA pattern (the search field is
 * the `combobox`, the list is its `listbox`, options use `aria-activedescendant`).
 */
export function Combobox({
  value,
  options,
  onValueChange,
  allowCreate = false,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  createLabel = (q) => `Create "${q}"`,
  emptyLabel = "No options",
  optionColor,
  keepOpenOnSelect = false,
  autoOpen = false,
  size = "2",
  disabled,
  "aria-label": ariaLabel,
  style,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Auto-open only when actually on screen. A combobox inside an inactive/hidden dockview panel
  // (e.g. a layout restored on Tauri reload) must not pop its popover over the visible panel:
  // `offsetParent` is null when any ancestor is `display:none`, so we skip opening then.
  useEffect(() => {
    if (!autoOpen) return;
    const raf = requestAnimationFrame(() => {
      const el = triggerRef.current;
      if (el && el.offsetParent !== null && document.visibilityState !== "hidden") setOpen(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [autoOpen]);
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const q = query.trim();
  const filtered = useMemo(
    () => options.filter((o) => o.toLowerCase().includes(q.toLowerCase())),
    [options, q],
  );
  const canCreate = allowCreate && q.length > 0 && !options.some((o) => o === q);
  const count = filtered.length + (canCreate ? 1 : 0);
  const activeClamped = Math.min(active, Math.max(0, count - 1));

  const commit = (i: number) => {
    const chosen = i < filtered.length ? filtered[i] : canCreate ? q : undefined;
    if (chosen == null) return;
    onValueChange(chosen);
    if (keepOpenOnSelect) {
      setQuery("");
      setActive(0);
      searchRef.current?.focus();
    } else {
      setOpen(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(count - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      if (e.metaKey || e.ctrlKey) return; // let a global shortcut (e.g. new-trace) handle it
      e.preventDefault();
      commit(activeClamped);
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuery("");
          setActive(0);
        }
      }}
    >
      <Popover.Trigger>
        <Button
          ref={triggerRef}
          variant="surface"
          color="gray"
          size={size}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          style={style}
        >
          {value && <Swatch color={optionColor?.(value)} />}
          <Text truncate color={value ? undefined : "gray"} style={{ flex: 1, textAlign: "left" }}>
            {value || placeholder}
          </Text>
          <PiCaretDown style={{ opacity: 0.6, flexShrink: 0 }} />
        </Button>
      </Popover.Trigger>
      <Popover.Content size="1" width="240px">
        <TextField.Root
          size={size}
          autoFocus
          ref={searchRef}
          value={query}
          placeholder={searchPlaceholder}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={count > 0 ? optionId(activeClamped) : undefined}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: 220, marginTop: 6 }}>
          <div role="listbox" id={listId} aria-label={ariaLabel}>
            {filtered.map((opt, i) => (
              <Option
                key={opt}
                id={optionId(i)}
                active={i === activeClamped}
                selected={opt === value}
                onSelect={() => commit(i)}
                onHover={() => setActive(i)}
              >
                <Flex align="center" justify="between" gap="2">
                  <Flex align="center" gap="2" style={{ minWidth: 0 }}>
                    <Swatch color={optionColor?.(opt)} />
                    <Text size="2" truncate>
                      {opt}
                    </Text>
                  </Flex>
                  {opt === value && <PiCheck style={{ flexShrink: 0 }} />}
                </Flex>
              </Option>
            ))}
            {canCreate && (
              <Option
                id={optionId(filtered.length)}
                active={activeClamped === filtered.length}
                selected={false}
                onSelect={() => commit(filtered.length)}
                onHover={() => setActive(filtered.length)}
              >
                <Flex align="center" gap="2">
                  <PiPlus style={{ flexShrink: 0 }} />
                  <Text size="2" truncate>
                    {createLabel(q)}
                  </Text>
                </Flex>
              </Option>
            )}
            {count === 0 && (
              <Text size="2" color="gray" style={{ display: "block", padding: "6px 8px" }}>
                {emptyLabel}
              </Text>
            )}
          </div>
        </ScrollArea>
      </Popover.Content>
    </Popover.Root>
  );
}

function Swatch({ color }: { color?: string }) {
  if (!color) return null;
  return (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        background: color,
        boxShadow: "inset 0 0 0 1px var(--black-a3)",
        flexShrink: 0,
      }}
      aria-hidden
    />
  );
}

function Option({
  id,
  active,
  selected,
  onSelect,
  onHover,
  children,
}: {
  id: string;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      // Focus stays on the search field (aria-activedescendant pattern); -1 keeps the
      // option out of the tab order while satisfying the focusable-interactive rule.
      tabIndex={-1}
      onMouseEnter={onHover}
      // Keep focus in the search field so typing and arrow keys keep working.
      onPointerDown={(e) => e.preventDefault()}
      onClick={onSelect}
      style={{
        cursor: "pointer",
        padding: "4px 8px",
        borderRadius: "var(--radius-2)",
        background: active ? "var(--accent-a4)" : undefined,
      }}
    >
      {children}
    </div>
  );
}
