import { TextField } from "@radix-ui/themes";
import { useEffect, useState } from "react";

/** A number typed in or stepped with the arrow keys, shown with two decimals and committed on Enter
 *  or blur. Out-of-range or unparsable input snaps back. */
export function NumberField({
  value,
  onCommit,
  min = 0,
  max = 1,
  step = 0.05,
  label,
}: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}) {
  const [draft, setDraft] = useState(value.toFixed(2));
  useEffect(() => setDraft(value.toFixed(2)), [value]);
  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
      if (parsed !== value) onCommit(parsed);
      setDraft(parsed.toFixed(2));
    } else setDraft(value.toFixed(2));
  };
  return (
    <TextField.Root
      size="1"
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={draft}
      aria-label={label}
      style={{ width: 72, fontVariantNumeric: "tabular-nums" }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(value.toFixed(2));
      }}
    />
  );
}
