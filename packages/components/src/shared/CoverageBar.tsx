import { Bar } from "../kit";

/** A "% of cases" indicator: the percentage above a compact accent bar.
 *  `value` is a percentage in [0, 100]. Used by variant / trace / alignment rows. */
export function CoverageBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="flex flex-col items-end gap-1 w-fit ml-auto">
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{label ?? `${value.toFixed(2)}%`}</span>
      <Bar value={value / 100} width={56} height={4} minFill={2} />
    </div>
  );
}
