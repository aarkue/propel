import { SearchSelect, Text } from "@r4pm/components/ui";
import type { ReactNode } from "react";
import { Bar } from "../kit";
import { useColorOf } from "../viewer/viewer-config";
import { ActivityChip } from "./ActivitySequence";

export interface VariantRowProps {
  /** 0-based; shown as #1, #2, ... */
  rank?: number;
  activities: string[];
  cases: number;
  /** Share of all cases, 0 to 1. */
  share: number;
  note?: ReactNode;
  matched?: number[];
}

/** One row of a variant list: rank, share of cases with a bar, the activities as chips, and a note
 *  at the end (e.g., "6 steps, 2d 4h"). Activities at positions outside `matched` are dimmed. */
export function VariantRow({ rank, activities, cases, share, note, matched }: VariantRowProps) {
  const colorOf = useColorOf("activity");
  const hit = matched && matched.length > 0 ? new Set(matched) : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      {rank !== undefined && (
        <Text
          size="1"
          color="gray"
          style={{ minWidth: 26, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
        >
          #{(rank + 1).toLocaleString("en")}
        </Text>
      )}
      <div style={{ width: 52, flexShrink: 0 }} title={`${cases.toLocaleString("en")} cases`}>
        <Text size="1" weight="medium" style={{ fontVariantNumeric: "tabular-nums" }}>
          {share >= 0.001 || share === 0 ? `${(share * 100).toFixed(1)}%` : "<0.1%"}
        </Text>
        <Bar value={Math.max(0.02, share)} height={4} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          maskImage: "linear-gradient(to right, black calc(100% - 24px), transparent)",
        }}
      >
        {activities.length === 0 ? (
          <Text size="1" color="gray">
            (empty trace)
          </Text>
        ) : (
          activities.map((a, i) => (
            <ActivityChip
              key={`${i}-${a}`}
              activity={a}
              color={colorOf(a)}
              widthClass="max-w-[7rem]"
              className={hit && !hit.has(i) ? "shrink-0 opacity-35" : "shrink-0"}
            />
          ))
        )}
      </div>
      {note !== undefined && (
        <Text size="1" color="gray" style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
          {note}
        </Text>
      )}
    </div>
  );
}

export interface VariantOption {
  activities: string[];
  cases: number;
  /** Shown at the end of the row, e.g., a cost or a duration. */
  note?: ReactNode;
}

export interface VariantSelectProps {
  variants: VariantOption[];
  value: number | null;
  onChange: (index: number) => void;
  /** What the shares are of; defaults to the cases of all `variants`. */
  totalCases?: number;
  placeholder?: ReactNode;
  disabled?: boolean;
}

/**
 * Picks one variant from `variants` (most frequent first, as given): a searchable dropdown whose
 * rows show the activities as chips, with prev/next buttons. `value` is an index into `variants`;
 * with none, the trigger shows `placeholder`.
 */
export function VariantSelect({
  variants,
  value,
  onChange,
  totalCases,
  placeholder = "Pick a variant",
  disabled,
}: VariantSelectProps) {
  const total = totalCases ?? variants.reduce((n, v) => n + v.cases, 0);
  const share = (v: VariantOption) => v.cases / Math.max(1, total);
  const items = variants.map((v, i) => ({ ...v, i }));
  const row = (v: (typeof items)[number]) => (
    <VariantRow rank={v.i} activities={v.activities} cases={v.cases} share={share(v)} note={v.note} />
  );
  return (
    <SearchSelect<(typeof items)[number]>
      aria-label="Variant"
      items={items}
      getKey={(v) => String(v.i)}
      value={value !== null && value >= 0 ? String(value) : null}
      onChange={(_, v) => v && onChange(v.i)}
      searchText={(v) => `#${v.i + 1} ${v.activities.join(" ")}`}
      searchPlaceholder="Activities in order, e.g., 'create send pay', or #rank"
      renderItem={row}
      renderValue={(v) => (v ? row(v) : <Text size="1">{placeholder}</Text>)}
      rowHeight={40}
      popoverWidth="min(760px, 90vw)"
      stepper
      disabled={disabled}
      style={{ minWidth: 360 }}
    />
  );
}
