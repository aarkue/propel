import { Text } from "@r4pm/components/ui";
import { SearchSelect } from "../ui/SearchSelect";

/** From `from_ms` on, until the next change, a time zone is `offset_minutes` ahead of UTC. */
export interface OffsetChange {
  from_ms: number;
  offset_minutes: number;
}

/** The time zone value meaning each event's own recorded offset. */
export const RECORDED_TIME = "";

const MINUTE = 60_000;
const WEEK = 7 * 24 * 60 * MINUTE;
const FROM = Date.UTC(1970, 0, 1);
const TO = Date.UTC(2060, 0, 1);

const formatters = new Map<string, Intl.DateTimeFormat>();

/** UTC offset of `zone` at `ms`, in minutes. Reads the zone's wall clock rather than its offset
 *  name (`timeZoneName: "longOffset"`), which older WebKit lacks. */
export function offsetAt(zone: string, ms: number): number {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(zone, f);
  }
  const parts = f.formatToParts(ms);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return Math.round((wall - Math.floor(ms / 1000) * 1000) / 60_000);
}

const cache = new Map<string, OffsetChange[]>();

/**
 * Every offset change of IANA zone `zone` from 1970 to 2060, daylight saving time included, to the
 * minute. Probes weekly, then narrows each change down; zones change at most a few times a year.
 */
export function zoneOffsets(zone: string): OffsetChange[] {
  const known = cache.get(zone);
  if (known) return known;
  const out: OffsetChange[] = [{ from_ms: FROM, offset_minutes: offsetAt(zone, FROM) }];
  let prev = out[0].offset_minutes;
  for (let t = FROM + WEEK; t <= TO; t += WEEK) {
    const now = offsetAt(zone, t);
    if (now === prev) continue;
    let lo = t - WEEK;
    let hi = t;
    while (hi - lo > MINUTE) {
      const mid = lo + Math.floor((hi - lo) / 2 / MINUTE) * MINUTE;
      if (offsetAt(zone, mid) === prev) lo = mid;
      else hi = mid;
    }
    out.push({ from_ms: hi, offset_minutes: now });
    prev = now;
  }
  cache.set(zone, out);
  return out;
}

/** The changes for a picked zone, or none for {@link RECORDED_TIME}. */
export function timeZoneArg(zone: string): OffsetChange[] | undefined {
  if (zone === RECORDED_TIME) return undefined;
  try {
    return zoneOffsets(zone);
  } catch {
    return undefined;
  }
}

const fmtOffset = (minutes: number) => {
  const sign = minutes < 0 ? "-" : "+";
  const a = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
};

interface ZoneRow {
  zone: string;
  label: string;
  hint: string;
}

let zoneRows: ZoneRow[] | undefined;
function rows(): ZoneRow[] {
  if (zoneRows) return zoneRows;
  const now = Date.now();
  let names: string[] = [];
  try {
    names = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {}
  const zones: ZoneRow[] = [];
  for (const zone of names) {
    if (zone === "UTC") continue;
    try {
      zones.push({ zone, label: zone.split("_").join(" "), hint: `${fmtOffset(offsetAt(zone, now))} now` });
    } catch {
      // A zone this engine cannot read is not offered.
    }
  }
  zoneRows = [
    { zone: RECORDED_TIME, label: "As recorded", hint: "The offset stored with each event" },
    { zone: "UTC", label: "UTC", hint: "UTC+00:00" },
    ...zones,
  ];
  return zoneRows;
}

export interface TimeZonePickerProps {
  /** An IANA zone, "UTC", or `RECORDED_TIME`. */
  value: string;
  onChange: (zone: string) => void;
  disabled?: boolean;
}

/** Picks the time zone to read event times in: as recorded, UTC, or a region with its DST rules. */
export function TimeZonePicker({ value, onChange, disabled }: TimeZonePickerProps) {
  const items = rows();
  const selected = items.find((r) => r.zone === value) ?? null;
  return (
    <SearchSelect<ZoneRow>
      aria-label="Time zone"
      items={items}
      getKey={(r) => r.zone}
      value={value}
      selectedItem={selected}
      onChange={(_, r) => r && onChange(r.zone)}
      searchText={(r) => `${r.label} ${r.zone} ${r.hint}`}
      searchPlaceholder="City or region, e.g., Berlin"
      disabled={disabled}
      renderItem={(r) => (
        <span style={{ display: "flex", gap: 8, alignItems: "baseline", minWidth: 0 }}>
          <Text size="2" truncate>
            {r.label}
          </Text>
          <Text size="1" color="gray" style={{ marginLeft: "auto", flexShrink: 0 }}>
            {r.hint}
          </Text>
        </span>
      )}
      renderValue={(r) => (
        <Text size="1">
          <span style={{ color: "var(--gray-10)" }}>Time zone </span>
          {r?.label ?? value}
        </Text>
      )}
      rowHeight={32}
      popoverWidth="340px"
      style={{ minWidth: 200 }}
    />
  );
}
