import { IconButton } from "@r4pm/components/ui";
import { PiCircle, PiCircleFill, PiCircleHalfFill } from "react-icons/pi";

export interface SelectionActionsProps {
  /** Full set of selectable keys (for All / Invert). */
  allKeys: string[];
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  size?: "1" | "2";
}

/** Reusable Select-all / Invert / Select-none icon controls for any multi-select. */
export function SelectionActions({ allKeys, value, onChange, size = "1" }: SelectionActionsProps) {
  return (
    <div className="flex items-center gap-1 **:fill-(--r4pm-control-text)!">
      <IconButton size={size} variant="ghost" title="Select all" onClick={() => onChange(new Set(allKeys))}>
        <PiCircleFill />
      </IconButton>
      <IconButton
        size={size}
        variant="ghost"
        title="Invert selection"
        onClick={() => onChange(new Set(allKeys.filter((k) => !value.has(k))))}
      >
        <PiCircleHalfFill />
      </IconButton>
      <IconButton size={size} variant="ghost" title="Select none" onClick={() => onChange(new Set())}>
        <PiCircle />
      </IconButton>
    </div>
  );
}
