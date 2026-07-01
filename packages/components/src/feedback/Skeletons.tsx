import { Skeleton } from "@r4pm/components/ui";

/** Opt-in, shape-aware loading placeholders for panels that know their layout.
 *  Built on the Radix `Skeleton` primitive so they share its shimmer + theming. */

export function SkeletonList({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 w-full p-3 ${className ?? ""}`}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-7 w-full rounded-md" />
      ))}
    </div>
  );
}

export function SkeletonTable({
  rows = 6,
  cols = 4,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 w-full p-3 ${className ?? ""}`}>
      <div className="flex gap-2">
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} className="h-6 flex-1 rounded-md opacity-80" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-5 flex-1 rounded-md" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-3 w-full p-4 ${className ?? ""}`}>
      <Skeleton className="h-6 w-1/3 rounded-md" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-4 w-2/3 rounded-md" />
    </div>
  );
}
