import type { ReactNode } from "react";
import clsx from "clsx";
import type { IconType } from "react-icons";

export type ExecutionStatus = {
  status: "idle" | "running" | "success" | "error";
  error?: string;
};

interface NodeWrapperProps {
  selected?: boolean;
  executionStatus?: ExecutionStatus;
  title: string;
  subtitle?: string;
  icon?: IconType;
  color?: string; // For the icon or header accent
  children: ReactNode;
  headerRight?: ReactNode;
  className?: string;
  minWidth?: string;
  contentClassName?: string;
  style?: React.CSSProperties;
  handles?: ReactNode;
  /** Make the wrapper fill the node's box (for resizable viewer nodes): the
   *  root grows to the node size and the content area flex-fills it. */
  fill?: boolean;
  /** Extra node-level chrome rendered inside the root, e.g. a <NodeResizer />. */
  resizer?: ReactNode;
}

export function NodeWrapper({
  selected,
  executionStatus,
  title,
  subtitle,
  icon: Icon,
  color,
  children,
  headerRight,
  className,
  minWidth = "min-w-64",
  contentClassName,
  style,
  handles,
  fill,
  resizer,
}: NodeWrapperProps) {
  const statusClasses =
    executionStatus?.status === "running"
      ? "border-blue-400 ring-1 ring-blue-400"
      : executionStatus?.status === "success"
        ? "border-emerald-400 ring-1 ring-emerald-400"
        : executionStatus?.status === "error"
          ? "border-red-400 ring-1 ring-red-400"
          : "border-gray-200 hover:border-gray-300";

  const containerClasses = clsx(
    "bg-white rounded-md shadow-sm flex flex-col relative transition-all duration-200 border group",
    minWidth,
    fill && "w-full h-full",
    selected ? "ring-2 ring-blue-500 border-transparent!" : statusClasses,
    className,
  );

  return (
    <div className={containerClasses} style={style}>
      {resizer}
      {handles}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/50 rounded-t-sm">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="font-medium text-sm text-gray-700 truncate" title={title}>
            {title}
          </span>
          {subtitle && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-mono border border-gray-200 whitespace-nowrap">
              {subtitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {headerRight}
          {Icon && <Icon className={clsx("size-4", color ? "" : "text-gray-400")} style={{ color: color }} />}
        </div>
      </div>

      {/* Error Message Banner */}
      {executionStatus?.status === "error" && executionStatus.error && (
        <div className="px-3 py-1.5 bg-red-50 border-b border-red-100 text-[10px] text-red-600 leading-tight break-words">
          {executionStatus.error}
        </div>
      )}

      <div
        className={clsx(
          "p-3 relative",
          fill && "flex-1 min-h-0 overflow-hidden flex flex-col",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
