import { Text } from "@r4pm/components/ui";
import type { ReactNode } from "react";
import { PiTrayLight } from "react-icons/pi";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Defaults to a tray glyph. Pass a sized react-icon for a domain-specific look. */
  icon?: ReactNode;
  /** Optional CTA, e.g. a "Load OCEL" button. */
  action?: ReactNode;
  className?: string;
}

/** Calm "nothing here yet" block: muted icon, title, optional description and action. */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 w-full h-full min-h-[8rem] p-6 text-center ${className ?? ""}`}
    >
      <div className="text-[var(--gray-8)] text-2xl" aria-hidden>
        {icon ?? <PiTrayLight />}
      </div>
      <Text size="2" weight="medium" color="gray">
        {title}
      </Text>
      {description && (
        <Text size="1" color="gray" className="opacity-70 max-w-[24rem]">
          {description}
        </Text>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
