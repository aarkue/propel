import { Flex } from "@r4pm/components/ui";
import { fmtInt, Metric, scoreTone } from "../kit";

export type StatTone = "good" | "bad" | "warn" | "neutral";
export type StatIndicator = "ring" | "bar";

const TONE_COLOR: Record<StatTone, string> = {
  good: "var(--green-11)",
  bad: "var(--red-11)",
  warn: "var(--amber-11)",
  neutral: "var(--gray-12)",
};

export interface StatItem {
  label: string;
  value: string | number;
  hint?: string;
  /** Semantic direction; colors the value / indicator (e.g. high fitness = good). */
  tone?: StatTone;
  /** 0..1 fraction. When set, the value renders with the chosen progress indicator. */
  progress?: number;
}

export interface StatCardsProps {
  items: StatItem[];
  /** "center" centers the row of tiles. */
  align?: "start" | "center";
  /** How items with a `progress` show it: a bar under the value (default) or a ring in its place. */
  indicator?: StatIndicator;
}

function Ring({ progress, color, text }: { progress: number; color: string; text: string }) {
  const size = 78;
  const sw = 8;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, progress)));
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} role="img">
        <title>{text}</title>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gray-a4)" strokeWidth={sw} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
          fontWeight: 700,
          color,
        }}
      >
        {text}
      </div>
    </div>
  );
}

/**
 * A row of {@link Metric} tiles. An item's `progress` shows as a bar under the value, or with
 * `indicator="ring"` as a ring in place of it; without a `tone`, {@link scoreTone} of the progress
 * colors it. `align="center"` centers the row.
 */
export function StatCards({ items, align = "start", indicator = "bar" }: StatCardsProps) {
  return (
    <Flex gap="3" wrap="wrap" justify={align === "center" ? "center" : "start"}>
      {items.map((it) => {
        const tone =
          it.tone === "neutral"
            ? undefined
            : (it.tone ?? (it.progress != null ? scoreTone(it.progress) : undefined));
        const text = typeof it.value === "number" ? fmtInt(it.value) : it.value;
        const ring = indicator === "ring" && it.progress != null;
        return (
          <Metric
            key={it.label}
            label={it.label}
            value={
              ring ? (
                <Ring progress={it.progress as number} color={TONE_COLOR[tone ?? "neutral"]} text={text} />
              ) : (
                text
              )
            }
            hint={it.hint}
            tone={tone}
            progress={ring ? undefined : it.progress}
          />
        );
      })}
    </Flex>
  );
}
