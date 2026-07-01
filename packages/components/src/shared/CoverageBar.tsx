import { Progress } from "@r4pm/components/ui";

/** A "% of cases" indicator: the percentage stacked above a compact gray bar.
 *  `value` is a percentage in [0, 100]. Used by variant / trace / alignment rows. */
export function CoverageBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="flex flex-col items-center w-fit ml-auto">
      {label ?? `${value.toFixed(2)}%`}
      <Progress color="gray" radius="large" size="1" className="w-[3rem]" value={value} />
    </div>
  );
}
