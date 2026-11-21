import { Flex, Text } from "@r4pm/components/ui";
import { useMemo } from "react";
import { PiStackSimple } from "react-icons/pi";
import { EmptyState } from "../feedback/EmptyState";
import {
  Bar,
  fmtInt,
  fmtPct,
  LegendItem,
  Metric,
  MetricRow,
  type Option,
  OptionMenu,
  rampColor,
  rampInk,
  Section,
  Toolbar,
  TypeChip,
  useChartTooltip,
} from "../kit";
import { useViewSetting } from "../viewer/view-state";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";

export interface SignatureObjects {
  object_type: string;
  min: number;
  max: number;
  mean: number;
}

export interface EventSignature {
  /** One entry per related object type, sorted by object type. */
  objects: SignatureObjects[];
  events: number;
}

/** How the events of one event type relate to one object type, over all its events. */
export interface TypeObjects {
  object_type: string;
  /** Events related to at least one object of the type; min, max and mean are over these. */
  events: number;
  min: number;
  max: number;
  mean: number;
}

export interface EventTypeSignatures {
  event_type: string;
  events: number;
  /** Events related to more than one object of some type. */
  events_with_several: number;
  /** One entry per related object type, over all events. */
  per_object_type: TypeObjects[];
  signatures: EventSignature[];
  other_events: number;
}

export interface EventSignatures {
  event_types: EventTypeSignatures[];
  object_types: string[];
}

/** How the events of one event type relate to one object type, over all its signatures. */
interface Cell {
  /** Events of the type related to at least one object of the object type */
  events: number;
  min: number;
  max: number;
  mean: number;
}

function cellsOf(et: EventTypeSignatures): Map<string, Cell> {
  return new Map(et.per_object_type.map((c) => [c.object_type, c]));
}

const range = (min: number, max: number) => (min === max ? String(min) : `${min}-${max}`);

type Sort = "events" | "name";
const SORTS: Option<Sort>[] = [
  { value: "events", label: "Most events", description: "Event types with the most events first" },
  { value: "name", label: "Name", description: "Alphabetical" },
];

export type EventSignaturesViewProps = ViewerProps<EventSignatures>;

/**
 * Which object types the events of each type carry, as a matrix of event types by object types. A
 * cell gives how many objects of the column's type one event relates to; darker cells relate more,
 * and a count above 1 (bold) means an event relates to several objects of that type, which a log
 * flattened on that type repeats. Below, the exact mixes of the selected event type.
 */
export function EventSignaturesView({ data, colorOf }: EventSignaturesViewProps) {
  const cfg = useViewerConfig({ colorOf });
  const [sort, setSort] = useViewSetting<Sort>("signatures.sort", "events");
  const [picked, setPicked] = useViewSetting<string | null>("signatures.selected", null);
  const { show, hide, tooltip } = useChartTooltip();

  const rows = useMemo(() => {
    const r = data.event_types.map((et) => ({ et, cells: cellsOf(et) }));
    if (sort === "name") r.sort((a, b) => a.et.event_type.localeCompare(b.et.event_type));
    return r;
  }, [data.event_types, sort]);
  const columns = data.object_types;
  const maxMean = Math.max(1.0001, ...rows.flatMap((r) => [...r.cells.values()].map((c) => c.mean)));

  if (rows.length === 0) {
    return <EmptyState icon={<PiStackSimple />} title="No events" description="This OCEL has no events." />;
  }

  const color = (t: string) => cfg.colorOf?.("objectType", t) ?? "var(--gray-9)";
  const totalEvents = rows.reduce((s, r) => s + r.et.events, 0);
  const severalTypes = rows.filter((r) => r.et.events_with_several > 0);
  const severalEvents = severalTypes.reduce((s, r) => s + r.et.events_with_several, 0);
  const mixed = rows.filter((r) => r.et.signatures.length + (r.et.other_events > 0 ? 1 : 0) > 1).length;
  const selected = rows.find((r) => r.et.event_type === picked) ?? rows[0];
  const maxEvents = Math.max(1, ...rows.map((r) => r.et.events));
  const intensity = (mean: number) => 0.12 + 0.88 * Math.min(1, Math.log(mean) / Math.log(maxMean));
  const cols = `minmax(150px, 220px) 110px repeat(${columns.length}, minmax(76px, 1fr))`;

  return (
    <Flex direction="column" style={{ height: "100%", minHeight: 0 }}>
      <Toolbar
        end={
          <Flex gap="3" align="center" wrap="wrap">
            <LegendItem shape="square" color={rampColor(0.12)} label="1 object" />
            <LegendItem
              shape="square"
              color={rampColor(1)}
              label={`up to ${maxMean.toFixed(1)} on average`}
            />
          </Flex>
        }
      >
        <OptionMenu label="Sort" value={sort} options={SORTS} onChange={setSort} />
      </Toolbar>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
        <Flex direction="column" gap="5" style={{ maxWidth: 1280 }}>
          <MetricRow>
            <Metric label="Event types" value={fmtInt(rows.length)} hint={`${fmtInt(totalEvents)} events`} />
            <Metric label="Object types" value={fmtInt(columns.length)} />
            <Metric
              label="Several objects of one type"
              value={fmtPct(severalEvents / Math.max(1, totalEvents))}
              hint={`of events, in ${severalTypes.length} event types`}
            />
            <Metric label="Mixed types" value={fmtInt(mixed)} hint="event types with several mixes" />
          </MetricRow>

          <Section
            title="Objects per event"
            subtitle="How many objects of each type one event relates to. Counts above 1 are bold. Click a row for its mixes."
          >
            <div data-tooltip-host style={{ position: "relative", overflowX: "auto" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: cols,
                  gap: 3,
                  alignItems: "stretch",
                  minWidth: "fit-content",
                }}
              >
                <span />
                <span className="r4pm-eyebrow" style={{ alignSelf: "end", paddingBottom: 4 }}>
                  Events
                </span>
                {columns.map((t) => (
                  <Flex
                    key={t}
                    align="center"
                    gap="1"
                    justify="center"
                    style={{ paddingBottom: 4, minWidth: 0 }}
                  >
                    <span
                      style={{ width: 8, height: 8, borderRadius: 4, background: color(t), flex: "none" }}
                    />
                    <Text size="1" weight="medium" truncate title={t}>
                      {t}
                    </Text>
                  </Flex>
                ))}
                {rows.map(({ et, cells }) => {
                  const active = et.event_type === selected.et.event_type;
                  const pick = () => setPicked(et.event_type);
                  return (
                    <div key={et.event_type} style={{ display: "contents" }}>
                      <button
                        type="button"
                        onClick={pick}
                        style={{
                          all: "unset",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 8px",
                          borderRadius: 6,
                          background: active ? "var(--accent-a3)" : undefined,
                          boxShadow: active ? "inset 3px 0 0 var(--accent-9)" : undefined,
                          minWidth: 0,
                          cursor: "pointer",
                        }}
                      >
                        <Text size="2" weight={active ? "medium" : "regular"} truncate title={et.event_type}>
                          {et.event_type}
                        </Text>
                      </button>
                      <Flex direction="column" justify="center" gap="1">
                        <Text size="1" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {fmtInt(et.events)}
                        </Text>
                        <Bar value={et.events / maxEvents} height={4} color="var(--accent-8)" />
                      </Flex>
                      {columns.map((t) => {
                        const c = cells.get(t);
                        if (!c) {
                          return (
                            <div
                              key={t}
                              style={{ height: 36, borderRadius: 6, border: "1px dashed var(--gray-a5)" }}
                            />
                          );
                        }
                        const share = c.events / Math.max(1, et.events);
                        const v = intensity(c.mean);
                        return (
                          <button
                            type="button"
                            key={t}
                            onClick={pick}
                            onMouseMove={(e) =>
                              show(e, {
                                title: `${et.event_type} with ${t}`,
                                rows: [
                                  { label: "Objects per event", value: range(c.min, c.max), color: color(t) },
                                  { label: "Mean", value: c.mean.toFixed(2) },
                                  {
                                    label: "Events with this type",
                                    value: `${fmtInt(c.events)} (${fmtPct(share)})`,
                                  },
                                ],
                                footer:
                                  c.max > 1
                                    ? "Involves several objects of this type, so a log flattened on it repeats these events."
                                    : undefined,
                              })
                            }
                            onMouseLeave={hide}
                            style={{
                              all: "unset",
                              boxSizing: "border-box",
                              position: "relative",
                              height: 36,
                              borderRadius: 6,
                              background: rampColor(v),
                              color: rampInk(v),
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 13,
                              fontWeight: c.max > 1 ? 700 : 400,
                              fontVariantNumeric: "tabular-nums",
                              overflow: "hidden",
                              cursor: "pointer",
                              outline: active ? "1px solid var(--accent-a8)" : undefined,
                            }}
                          >
                            {range(c.min, c.max)}
                            {share < 0.995 && (
                              <span
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  bottom: 0,
                                  height: 3,
                                  width: `${share * 100}%`,
                                  background: "var(--amber-9)",
                                }}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              {tooltip}
            </div>
            <Flex gap="4" wrap="wrap">
              <LegendItem shape="square" color="var(--gray-a4)" label="not related" />
              <LegendItem
                shape="line"
                color="var(--amber-9)"
                label="only some of the events relate (bar: share)"
              />
            </Flex>
          </Section>

          <Section
            title={`Mixes of ${selected.et.event_type}`}
            subtitle="The sets of object types single events relate to, most frequent first."
          >
            <Flex direction="column" gap="2">
              {selected.et.signatures.map((s) => (
                <SignatureRow
                  key={s.objects.map((o) => o.object_type).join(",")}
                  signature={s}
                  total={selected.et.events}
                  color={color}
                />
              ))}
              {selected.et.other_events > 0 && (
                <Text size="1" color="gray">
                  {fmtInt(selected.et.other_events)} events (
                  {fmtPct(selected.et.other_events / selected.et.events)}) with rarer mixes
                </Text>
              )}
            </Flex>
          </Section>
        </Flex>
      </div>
    </Flex>
  );
}

function SignatureRow({
  signature,
  total,
  color,
}: {
  signature: EventSignature;
  total: number;
  color: (t: string) => string;
}) {
  const share = signature.events / Math.max(1, total);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(160px, 260px) 64px minmax(0, 1fr)",
        gap: 12,
        alignItems: "center",
        padding: "8px 12px",
        borderRadius: 8,
        background: "var(--gray-a2)",
        border: "1px solid var(--gray-a3)",
      }}
    >
      <Bar value={share} height={8} />
      <Text size="2" weight="medium" align="right" style={{ fontVariantNumeric: "tabular-nums" }}>
        {fmtPct(share, share === 1 ? 0 : 1)}
      </Text>
      <Flex gap="2" wrap="wrap">
        {signature.objects.length === 0 ? (
          <Text size="1" color="gray">
            no objects
          </Text>
        ) : (
          signature.objects.map((o) => (
            <TypeChip
              key={o.object_type}
              color={color(o.object_type)}
              title={o.min === o.max ? undefined : `mean ${o.mean.toFixed(1)} per event`}
            >
              <span style={{ fontWeight: o.max > 1 ? 700 : 500, fontVariantNumeric: "tabular-nums" }}>
                {range(o.min, o.max)}
              </span>{" "}
              <span style={{ color: "var(--gray-11)" }}>{o.object_type}</span>
            </TypeChip>
          ))
        )}
      </Flex>
    </div>
  );
}
