import { Card, Flex, Heading, Text } from "@r4pm/components/ui";

export type StatTone = "good" | "bad" | "warn" | "neutral";
export type StatIndicator = "ring" | "bar";

const TONE_COLOR: Record<StatTone, string> = {
  good: "var(--green-11)",
  bad: "var(--red-11)",
  warn: "var(--amber-11)",
  neutral: "var(--gray-12)",
};

/** Smooth red -> amber -> green by value (no hard thresholds). 0 = red, 1 = green. */
function gradientColor(progress: number): string {
  const x = Math.max(0, Math.min(1, progress));
  return `hsl(${Math.round(x * 125)} 60% 42%)`;
}

function resolveColor(tone: StatTone | undefined, progress: number | undefined): string {
  if (tone) return TONE_COLOR[tone];
  if (progress != null) return gradientColor(progress);
  return TONE_COLOR.neutral;
}

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
  /** "start" = label over value, left aligned (metrics); "center" = centered big number. */
  align?: "start" | "center";
  /** Progress visualization for items with a `progress` value. Default "ring". */
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

function Meter({ progress, color }: { progress: number; color: string }) {
  const w = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <div
      style={{ width: "100%", height: 7, borderRadius: 4, background: "var(--gray-a4)", overflow: "hidden" }}
    >
      <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 4 }} />
    </div>
  );
}

/** Reusable metric-card grid. Backs log-summary + conformance fitness. Items with a `progress`
 *  render as a tone/gradient-colored ring (default) or bar; others as a plain number. */
export function StatCards({ items, align = "start", indicator = "bar" }: StatCardsProps) {
  const centered = align === "center";
  return (
    <Flex gap="3" wrap="wrap" align="stretch" justify={centered ? "center" : "start"}>
      {items.map((it) => {
        const color = resolveColor(it.tone, it.progress);
        const valueText = typeof it.value === "number" ? it.value.toLocaleString("en") : it.value;
        const hasProgress = it.progress != null;
        const asRing = hasProgress && indicator === "ring";
        const cardAlign = asRing || (centered && !hasProgress) ? "center" : "start";
        return (
          <Card key={it.label} style={{ minWidth: 150, flex: centered ? "0 0 auto" : 1 }}>
            {/* value / indicator first, then the (possibly wrapping) label, so bars stay aligned */}
            <Flex direction="column" gap="2" p="1" align={cardAlign} style={{ height: "100%" }}>
              {asRing ? (
                <Ring progress={it.progress as number} color={color} text={valueText} />
              ) : (
                <>
                  <Heading size={centered && !hasProgress ? "7" : "6"} style={{ color }}>
                    {valueText}
                  </Heading>
                  {hasProgress && <Meter progress={it.progress as number} color={color} />}
                </>
              )}
              <Text size="2" weight="medium" style={{ color: "var(--gray-12)", textAlign: cardAlign }}>
                {it.label}
              </Text>
              {it.hint && (
                <Text size="1" color="gray" style={{ textAlign: cardAlign }}>
                  {it.hint}
                </Text>
              )}
            </Flex>
          </Card>
        );
      })}
    </Flex>
  );
}
