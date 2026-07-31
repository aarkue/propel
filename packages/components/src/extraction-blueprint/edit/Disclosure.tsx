// The form furniture the mapping editors are built from.
//
// A mapping form is a long column of small controls, and the failure mode is that it reads as one
// undifferentiated grey list: every label the same weight as every hint, nothing marking where one
// decision ends and the next begins. So `Field` gives its label real presence (uppercase, tracked,
// with an optional accent dot marking the fields that decide what the mapping produces), and
// `Disclosure` reads as a closed drawer with its current contents stated on the right rather than
// as another row of text.
import { Badge, Text } from "@r4pm/components/ui";
import { useState, type ReactNode } from "react";
import { PiCaretRight } from "react-icons/pi";

export interface DisclosureProps {
  title: string;
  /** One line describing what is inside while it is shut -- "auto-generated UUID", "2 mapped",
   *  "none". A section whose summary says "none" is visibly safe to leave alone. */
  summary?: string;
  /** Shown as a badge next to the title, for a count of what is configured inside. */
  count?: number;
  /** Start open. Use for a section that is already configured, so loading a blueprint shows what
   *  it actually does rather than hiding it behind a caret. */
  defaultOpen?: boolean;
  children: ReactNode;
}

export function Disclosure({ title, summary, count, defaultOpen, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div
      className="overflow-hidden rounded-lg transition-colors"
      style={{
        border: "1px solid var(--gray-a5)",
        background: open ? "var(--color-panel-solid)" : "var(--gray-a2)",
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-2.5 py-2 text-left"
      >
        <PiCaretRight
          size={12}
          className="shrink-0 transition-transform"
          style={{ transform: open ? "rotate(90deg)" : undefined, opacity: 0.5 }}
        />
        <Text size="2" weight="medium" className="shrink-0">
          {title}
        </Text>
        {!!count && (
          <Badge size="1" variant="soft" radius="full">
            {count}
          </Badge>
        )}
        {!open && summary && (
          <span
            className="ml-auto min-w-0 truncate rounded px-1.5 py-0.5 font-mono text-[11px]"
            style={{ background: "var(--gray-a3)", color: "var(--gray-11)" }}
            title={summary}
          >
            {summary}
          </span>
        )}
      </button>
      {open && (
        <div
          className="flex flex-col gap-3 px-2.5 pb-3 pt-1"
          style={{ borderTop: "1px solid var(--gray-a4)" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export interface FieldProps {
  label: string;
  hint?: string;
  /** A compact control shown right-aligned on the label's row, typically a `PillGroup`. */
  control?: ReactNode;
  /** Extra classes on the field wrapper -- grid placement, mostly. */
  className?: string;
  children: ReactNode;
}

/** A labelled control. */
export function Field({ label, hint, control, className, children }: FieldProps) {
  return (
    // `min-w-0` so a field in a grid cell can shrink instead of pushing into its neighbour.
    <div className={`flex min-w-0 flex-col gap-1.5${className ? ` ${className}` : ""}`}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <Text size="2" weight="medium" className="min-w-0 truncate" style={{ color: "var(--gray-12)" }}>
          {label}
        </Text>
        {control}
      </div>
      {children}
      {hint && (
        <Text size="1" color="gray" className="text-[12px] leading-snug">
          {hint}
        </Text>
      )}
    </div>
  );
}

/** A compact segmented switch, sized to its options, for a `Field`'s `control` slot. */
export function PillGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div
      className="flex min-w-0 max-w-full flex-wrap justify-end overflow-hidden rounded-md"
      style={{ border: "1px solid var(--gray-a5)" }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className="cursor-pointer border-none px-2 py-1 text-[11px] leading-none whitespace-nowrap transition-colors"
            style={{
              background: active ? "var(--accent-9)" : "transparent",
              color: active ? "var(--accent-contrast)" : "var(--gray-11)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A quiet disclosure for a setting that belongs to the field above it: a plain text toggle, and
 *  when open an indented block marked by a left rule rather than another bordered card. */
export function InlineDisclosure({
  label,
  defaultOpen,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-1 self-start border-none bg-transparent p-0 text-[12px]"
        style={{ color: "var(--gray-11)" }}
      >
        <PiCaretRight
          size={11}
          className="transition-transform"
          style={{ transform: open ? "rotate(90deg)" : undefined }}
        />
        {label}
      </button>
      {open && (
        <div className="flex flex-col gap-2 pl-2.5" style={{ borderLeft: "2px solid var(--gray-a5)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

/** A titled group of related fields, for a form long enough that flat labelling stops being
 *  enough -- the endpoints of a relation, say, or a transform's inputs versus its keys. */
export function FieldGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg p-3"
      style={{ border: "1px solid var(--gray-a5)", background: "var(--gray-a2)" }}
    >
      {title && (
        <Text size="2" weight="medium" style={{ color: "var(--gray-12)" }}>
          {title}
        </Text>
      )}
      {children}
    </div>
  );
}
