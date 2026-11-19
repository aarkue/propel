import { Button } from "@r4pm/components/ui";
import { PiArrowRight } from "react-icons/pi";

/** A link from an overview board to the host's detail view `target`; nothing without `onOpen`. */
export function OpenLink<T extends string>({
  onOpen,
  target,
  children,
}: {
  onOpen?: (target: T) => void;
  target: T;
  children: string;
}) {
  if (!onOpen) return null;
  return (
    <Button size="1" variant="ghost" onClick={() => onOpen(target)}>
      {children} <PiArrowRight />
    </Button>
  );
}

/** The data-quality metric of a board: how many checks found something, amber when one warns. */
export function findingsMetric(findings: { count: number; severity: string }[]) {
  const failed = findings.filter((f) => f.count > 0);
  return {
    value: failed.length === 0 ? "No findings" : `${failed.length} finding${failed.length === 1 ? "" : "s"}`,
    tone: failed.some((f) => f.severity === "warning") ? ("warn" as const) : undefined,
  };
}
