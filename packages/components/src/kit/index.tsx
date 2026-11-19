import { DropdownMenu, Flex, Text, Tooltip } from "@r4pm/components/ui";
import { createContext, type CSSProperties, type ReactNode, useCallback, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { PiCaretDown, PiCheck } from "react-icons/pi";
import { Floating } from "./floating";

export { Floating };
export {
  type OffsetChange,
  offsetAt,
  RECORDED_TIME,
  TimeZonePicker,
  type TimeZonePickerProps,
  timeZoneArg,
  zoneOffsets,
} from "./time-zone";

// The visual building blocks every analysis view shares, so toolbars, menus, tooltips and numbers
// look the same everywhere.

/**
 * Where a panel wants view toolbars rendered: its header row, next to the dataset picker. Without a
 * host (e.g., in Storybook or the pipeline viewer), a {@link Toolbar} draws its own bar.
 */
export const ToolbarHostContext = createContext<HTMLElement | null>(null);

export interface ToolbarProps {
  children?: ReactNode;
  end?: ReactNode;
}

/** A view's controls on the left, a summary on the right; rendered into the panel header when there is one. */
export function Toolbar({ children, end }: ToolbarProps) {
  const host = useContext(ToolbarHostContext);
  const content = (
    <>
      {children}
      {end && <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>{end}</div>}
    </>
  );
  if (host) return createPortal(content, host);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        padding: "6px 12px",
        minHeight: 44,
        borderBottom: "1px solid var(--gray-a4)",
        background: "var(--color-panel-solid)",
      }}
    >
      {content}
    </div>
  );
}

/** A thin divider between toolbar groups. */
export function ToolbarDivider() {
  return (
    <span
      aria-hidden
      style={{ width: 1, alignSelf: "stretch", margin: "4px 4px", background: "var(--gray-a5)" }}
    />
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
  /** One line explaining what the option does. */
  description?: string;
  icon?: ReactNode;
}

export interface OptionMenuProps<T extends string> {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
}

/**
 * A labelled dropdown: `Label · Value ⌄`, opening a menu whose entries carry a description. Use it
 * for every setting with a few named options instead of a bare select.
 */
export function OptionMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: OptionMenuProps<T>) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger disabled={disabled}>
        <button type="button" className="r4pm-option-trigger">
          <span style={{ color: "var(--gray-10)" }}>{label}</span>
          <span
            style={{
              color: "var(--gray-12)",
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {current?.icon}
            {current?.label ?? value}
          </span>
          <PiCaretDown style={{ color: "var(--gray-9)" }} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content size="2" style={{ minWidth: 240, maxWidth: 360 }}>
        {options.map((o) => (
          <DropdownMenu.Item
            key={o.value}
            onSelect={() => onChange(o.value)}
            style={{ height: "auto", paddingBlock: 6 }}
          >
            <Flex align="start" gap="2" style={{ width: "100%" }}>
              <span style={{ width: 16, display: "inline-flex", paddingTop: 2, color: "var(--accent-11)" }}>
                {o.value === value ? <PiCheck /> : o.icon}
              </span>
              <Flex direction="column" style={{ minWidth: 0 }}>
                <Text size="2" weight={o.value === value ? "medium" : "regular"}>
                  {o.label}
                </Text>
                {o.description && (
                  <Text size="1" color="gray" style={{ whiteSpace: "normal" }}>
                    {o.description}
                  </Text>
                )}
              </Flex>
            </Flex>
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

export interface MetricProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "good" | "warn" | "bad";
  /** 0..1, drawn as a thin bar under the value in the tone's color. */
  progress?: number;
}

/** A big number with a label, for the summary row of a view. */
export function Metric({ label, value, hint, tone, progress }: MetricProps) {
  const color = tone
    ? { good: "var(--green-11)", warn: "var(--amber-11)", bad: "var(--red-11)" }[tone]
    : "var(--gray-12)";
  return (
    <div className="r4pm-metric">
      <span className="r4pm-eyebrow">{label}</span>
      <span
        style={{
          fontSize: 22,
          lineHeight: "28px",
          fontWeight: 600,
          color,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </span>
      {progress != null && (
        <Bar
          value={progress}
          height={4}
          color={tone ? color : "var(--accent-9)"}
          style={{ marginBlock: 2 }}
        />
      )}
      {hint && (
        <Text size="1" color="gray">
          {hint}
        </Text>
      )}
    </div>
  );
}

export interface BarProps {
  /** The filled share, 0 to 1. */
  value: number;
  color?: string;
  /** Thickness in px. */
  height?: number;
  /** Corner radius in px; half the height by default. */
  radius?: number;
  /** Least fill in px for a value above 0, so small shares stay visible. */
  minFill?: number;
  width?: CSSProperties["width"];
  /** Shown above the bar on the left. */
  label?: ReactNode;
  /** Shown above the bar on the right, e.g., the value. */
  hint?: ReactNode;
  title?: string;
  style?: CSSProperties;
}

/** A horizontal bar: a gray track filled to `value`, with an optional label and hint above it. */
export function Bar({
  value,
  color = "var(--accent-9)",
  height = 6,
  radius = height / 2,
  minFill = 0,
  width,
  label,
  hint,
  title,
  style,
}: BarProps) {
  const share = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const track = (
    <div
      title={label || hint ? undefined : title}
      style={{
        width,
        height,
        borderRadius: radius,
        background: "var(--gray-a4)",
        overflow: "hidden",
        flexShrink: 0,
        ...(label || hint ? undefined : style),
      }}
    >
      <div
        style={{
          width: `${share * 100}%`,
          minWidth: share > 0 ? minFill : 0,
          height: "100%",
          borderRadius: radius,
          background: color,
        }}
      />
    </div>
  );
  if (!label && !hint) return track;
  return (
    <div title={title} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, ...style }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
        {label && (
          <Text size="2" truncate style={{ minWidth: 0 }}>
            {label}
          </Text>
        )}
        {hint && (
          <Text
            size="1"
            weight="medium"
            style={{ marginLeft: "auto", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
          >
            {hint}
          </Text>
        )}
      </div>
      {track}
    </div>
  );
}

export interface SegmentedProps<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  /** Small items, for narrow side rails. */
  compact?: boolean;
  /** Only the icons; the label becomes the item's name and tooltip. */
  iconOnly?: boolean;
  /** Stretch over the available width, items sharing it equally. */
  fill?: boolean;
  /** Wrap items onto more rows when they do not fit. */
  wrap?: boolean;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  disabled?: boolean;
  "aria-label"?: string;
}

/**
 * A few mutually exclusive options side by side, the chosen one raised. Takes the same options as
 * {@link OptionMenu}; use that one for longer lists.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  compact,
  iconOnly,
  fill,
  wrap,
  tooltipSide = "top",
  disabled,
  "aria-label": ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      className="r4pm-segmented"
      data-compact={compact || undefined}
      style={{
        display: fill ? "flex" : "inline-flex",
        width: fill ? "100%" : undefined,
        flexWrap: wrap ? "wrap" : undefined,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        const tip = iconOnly ? (o.description ?? o.label) : o.description;
        const item = (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            aria-label={iconOnly ? o.label : undefined}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className="r4pm-segment"
            data-on={on || undefined}
            style={fill ? { flex: 1 } : undefined}
          >
            {o.icon}
            {!iconOnly && o.label}
          </button>
        );
        return tip ? (
          <Tooltip key={o.value} content={tip} side={tooltipSide}>
            {item}
          </Tooltip>
        ) : (
          item
        );
      })}
    </div>
  );
}

export interface RampLegendProps {
  /** Label before the swatches, for the low end. */
  low: ReactNode;
  /** Label after the swatches, for the high end. */
  high: ReactNode;
  /** Swatch color for `t` in 0..1; {@link rampColor} by default. */
  color?: (t: number) => string;
  /** The `t` of each swatch. */
  steps?: number[];
  style?: CSSProperties;
}

/** A legend for a color ramp: `low`, a row of swatches, `high`. */
export function RampLegend({
  low,
  high,
  color = rampColor,
  steps = [0.05, 0.2, 0.4, 0.6, 0.8, 1],
  style,
}: RampLegendProps) {
  return (
    <Flex align="center" gap="2" style={style}>
      <Text size="1" color="gray">
        {low}
      </Text>
      {steps.map((t) => (
        <span
          key={t}
          style={{ width: 18, height: 10, borderRadius: 3, background: color(t), flexShrink: 0 }}
        />
      ))}
      <Text size="1" color="gray">
        {high}
      </Text>
    </Flex>
  );
}

export interface TypeChipProps {
  /** The type's color, drawn as a dot. */
  color: string;
  children: ReactNode;
  /** Muted text after the content. */
  suffix?: ReactNode;
  /** The content in the code font, e.g., for object ids. */
  mono?: boolean;
  title?: string;
  onClick?: () => void;
}

const TYPE_CHIP: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontFamily: "inherit",
  lineHeight: "16px",
  color: "var(--gray-12)",
  background: "var(--color-panel-solid)",
  border: "1px solid var(--gray-a5)",
  whiteSpace: "nowrap",
};

/** A pill with a type's color dot, e.g., an object type, an object of it, or a state. */
export function TypeChip({ color, children, suffix, mono, title, onClick }: TypeChipProps) {
  const body = (
    <>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
      <span style={mono ? { fontFamily: "var(--code-font-family)" } : undefined}>{children}</span>
      {suffix != null && <span style={{ color: "var(--gray-10)" }}>{suffix}</span>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} title={title} style={{ ...TYPE_CHIP, cursor: "pointer" }}>
      {body}
    </button>
  ) : (
    <span title={title} style={TYPE_CHIP}>
      {body}
    </span>
  );
}

/** A row of {@link Metric}s. */
export interface MetricRowProps {
  children: ReactNode;
}

export function MetricRow({ children }: MetricRowProps) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{children}</div>;
}

export interface SectionProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}

/** A titled block of a view. */
export function Section({ title, subtitle, actions, children, style }: SectionProps) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0, ...style }}>
      {(title || actions) && (
        <Flex align="end" gap="3">
          <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
            {title && <span className="r4pm-eyebrow">{title}</span>}
            {subtitle && (
              <Text size="1" color="gray">
                {subtitle}
              </Text>
            )}
          </Flex>
          {actions && <div style={{ marginLeft: "auto" }}>{actions}</div>}
        </Flex>
      )}
      {children}
    </section>
  );
}

export interface LegendItemProps {
  color: string;
  label: ReactNode;
  shape?: "dot" | "line" | "square";
  dashed?: boolean;
  /** Explanation shown on hover. */
  title?: string;
}

/** A legend entry: a swatch (dot, line or square) and its label. */
export function LegendItem({ color, label, shape = "dot", dashed, title }: LegendItemProps) {
  const swatch: CSSProperties =
    shape === "line"
      ? { width: 16, height: 0, borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }
      : { width: 10, height: 10, borderRadius: shape === "dot" ? 5 : 3, background: color };
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--gray-11)",
        cursor: title ? "help" : undefined,
      }}
    >
      <span style={swatch} />
      {label}
    </span>
  );
}

/** One row of a {@link ChartTooltip}. */
export interface TooltipRow {
  label: ReactNode;
  value: ReactNode;
  color?: string;
}

export interface TooltipContent {
  title: ReactNode;
  rows?: TooltipRow[];
  footer?: ReactNode;
}

/**
 * Hover state for a chart: `show` with the pointer event and what to say, `hide` on leave, and render
 * `tooltip` once inside the chart's positioned container.
 */
export function useChartTooltip() {
  const [state, setState] = useState<{ x: number; y: number; content: TooltipContent } | null>(null);
  const show = useCallback(
    (e: { clientX: number; clientY: number; currentTarget: Element }, content: TooltipContent) =>
      setState({ x: e.clientX, y: e.clientY, content }),
    [],
  );
  const hide = useCallback(() => setState(null), []);
  const tooltip = state ? <ChartTooltip x={state.x} y={state.y} content={state.content} /> : null;
  return { show, hide, tooltip };
}

function ChartTooltip({ x, y, content }: { x: number; y: number; content: TooltipContent }) {
  return (
    <Floating
      x={x}
      y={y}
      offset={14}
      role="tooltip"
      style={{
        pointerEvents: "none",
        minWidth: 160,
        maxWidth: 320,
        padding: "8px 10px",
        borderRadius: 8,
        background: "var(--color-panel-solid)",
        boxShadow: "var(--shadow-4)",
        border: "1px solid var(--gray-a5)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <Text size="2" weight="medium">
        {content.title}
      </Text>
      {content.rows?.map((r, i) => (
        <Flex key={i} align="center" gap="2" justify="between">
          <Flex align="center" gap="2">
            {r.color && <span style={{ width: 8, height: 8, borderRadius: 4, background: r.color }} />}
            <Text size="1" color="gray">
              {r.label}
            </Text>
          </Flex>
          <Text size="1" weight="medium" style={{ fontVariantNumeric: "tabular-nums" }}>
            {r.value}
          </Text>
        </Flex>
      ))}
      {content.footer && (
        <Text size="1" color="gray">
          {content.footer}
        </Text>
      )}
    </Floating>
  );
}

/**
 * A sequential color for `t` in [0, 1] from the accent scale's steps 3 to 11: crisp in both themes,
 * light-to-dark in light mode and dark-to-bright in dark mode.
 */
export function rampColor(t: number, scale = "accent"): string {
  if (!Number.isFinite(t) || t <= 0) return `var(--${scale}-2)`;
  const step = 3 + Math.round(Math.min(1, t) * 8);
  return `var(--${scale}-${step})`;
}

/** Text color readable on {@link rampColor}(t). */
export function rampInk(t: number, scale = "accent"): string {
  return t > 0.55 ? `var(--${scale}-contrast)` : `var(--${scale}-12)`;
}

export const fmtInt = (n: number) => n.toLocaleString("en");

/** Tone of a quality score in 0..1 (fitness, precision): good from 0.9, warn from 0.7. */
export const scoreTone = (x: number): "good" | "warn" | "bad" =>
  x >= 0.9 ? "good" : x >= 0.7 ? "warn" : "bad";
export const fmtPct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export type DurationStyle = "short" | "long";

/** A duration in its two largest units, e.g., "3d 4h" or, long, "3 days 4 hours". */
export function formatDuration(ms: number, style: DurationStyle = "short"): string {
  if (!Number.isFinite(ms)) return "-";
  const sign = ms < 0 ? "-" : "";
  if (Math.abs(ms) < 1000) {
    const n = Math.round(ms);
    return style === "short" ? `${n}ms` : `${n} milliseconds`;
  }
  const units: [string, string, number][] = [
    ["d", " days", 86_400_000],
    ["h", " hours", 3_600_000],
    ["m", " minutes", 60_000],
    ["s", " seconds", 1000],
  ];
  let rest = Math.abs(Math.round(ms));
  const parts: string[] = [];
  for (const [short, long, size] of units) {
    if (rest < size && parts.length === 0 && size > 1000) continue;
    const n = Math.floor(rest / size);
    rest -= n * size;
    if (n > 0) parts.push(style === "short" ? `${n}${short}` : `${n}${long}`);
    if (parts.length === 2) break;
  }
  return parts.length ? sign + parts.join(" ") : style === "short" ? "0s" : "0 seconds";
}
