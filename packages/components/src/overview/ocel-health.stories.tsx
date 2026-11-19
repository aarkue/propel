import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { type HealthFinding, type LogHealth, type OcelHealth, OcelHealthView } from "@r4pm/components";
import { Flex, Text } from "@r4pm/components/ui";
import { useState } from "react";

const meta = {
  title: "Viewers/OCEL Health",
  component: OcelHealthView,
  parameters: { frame: { mode: "canvas", height: 760 } },
} satisfies Meta<typeof OcelHealthView>;
export default meta;

// An order-management OCEL as the health check reports it: failed checks first (warnings before
// notes), then the passed ones.
const ocelHealth: OcelHealth = {
  num_events: 21_008,
  num_objects: 10_840,
  findings: [
    {
      check: "type_mismatch",
      title: "Values of another type than declared",
      category: "Incorrect attribute value",
      description:
        "Attribute values that do not match the declared attribute type, e.g., text in a number attribute. Filters and statistics skip or misread them.",
      severity: "warning",
      count: 37,
      examples: [
        "price of object i-880214: string declared float",
        "price of object i-880379: string declared float",
        "weight of object p-660031: string declared float",
        "price of object i-881102: string declared float",
        "weight of object p-660415: string declared float",
      ],
      fixes: [],
    },
    {
      check: "objects_without_events",
      title: "Objects without events",
      category: "Irrelevant object",
      description:
        "Objects that no event relates to. Master data, such as customers or products, often has no events.",
      severity: "info",
      count: 212,
      examples: ["Kiara Hoffmann", "Jonas Albrecht", "Mila Petrovic", "MySoundBar 300", "o-991873"],
      fixes: [
        {
          id: "remove_unrelated",
          label: "Remove those without relations",
          description: "Removes these objects unless they have an O2O relation, so linked master data stays.",
          recommended: true,
          repairs: [{ type: "RemoveObjectsWithoutEvents", keep_related: true }],
        },
        {
          id: "remove_all",
          label: "Remove all",
          description: "Removes all objects without events, together with their O2O relations.",
          recommended: false,
          repairs: [{ type: "RemoveObjectsWithoutEvents", keep_related: false }],
        },
      ],
    },
    {
      check: "same_time_events",
      title: "Objects with simultaneous events",
      category: "Imprecise time",
      description:
        "Objects with two or more events at the same time. Their order in directly-follows relations is arbitrary.",
      severity: "info",
      count: 1_408,
      examples: ["o-990017", "o-990042", "i-880051", "i-880052", "p-660008"],
      fixes: [
        {
          id: "spread",
          label: "Spread equal times by 1 ms",
          description:
            "Adds 1 ms steps between events that share a timestamp, ordered by where their activity typically occurs in an object's lifecycle and then by event id.",
          recommended: true,
          repairs: [{ type: "SpreadTies" }],
        },
      ],
    },
    {
      check: "null_values",
      title: "Empty attribute values",
      category: "Missing attribute value",
      description: "Attribute values that are null.",
      severity: "info",
      count: 54,
      examples: [
        "weight of object p-660123",
        "weight of object p-660124",
        "role of object Lena Brandt",
        "weight of object p-660301",
      ],
      fixes: [],
    },
    {
      check: "unused_types",
      title: "Types without instances",
      category: "Irrelevant type",
      description: "Declared event or object types that no event or object has.",
      severity: "info",
      count: 2,
      examples: ["event type cancel order", "object type returns"],
      fixes: [
        {
          id: "remove",
          label: "Remove these types",
          description: "Removes the declarations of these types.",
          recommended: true,
          repairs: [{ type: "RemoveUnusedTypes" }],
        },
      ],
    },
    {
      check: "epoch_timestamps",
      title: "Events at 1970-01-01",
      category: "Incorrect time",
      description:
        "Events with the time 1970-01-01T00:00:00Z, usually a missing timestamp. Durations and time ranges that include them are wrong.",
      severity: "warning",
      count: 0,
      examples: [],
      fixes: [],
    },
    {
      check: "events_without_objects",
      title: "Events without objects",
      category: "Missing relation",
      description:
        "Events related to no object. Object-centric views (OC-DFG, OCPN, flattening) leave them out.",
      severity: "warning",
      count: 0,
      examples: [],
      fixes: [],
    },
    {
      check: "self_relations",
      title: "Objects related to themselves",
      category: "Incorrect relation",
      description: "O2O relations from an object to itself.",
      severity: "info",
      count: 0,
      examples: [],
      fixes: [],
    },
  ],
};

// What each OCEL check counts; checks of types and attribute values show no share.
const OCEL_COUNTS: Record<string, "events" | "objects"> = {
  epoch_timestamps: "events",
  events_without_objects: "events",
  objects_without_events: "objects",
  same_time_events: "objects",
  self_relations: "objects",
};
const ocelTotalOf = (f: HealthFinding) =>
  f.check in OCEL_COUNTS
    ? {
        total: OCEL_COUNTS[f.check] === "events" ? ocelHealth.num_events : ocelHealth.num_objects,
        noun: OCEL_COUNTS[f.check],
      }
    : { total: 0, noun: "" };

// The road traffic fine log: dates only, a few double exports, some very long cases.
const logHealth: LogHealth = {
  num_cases: 150_370,
  num_events: 561_470,
  findings: [
    {
      check: "duplicate_events",
      title: "Duplicate events",
      category: "Incorrect event",
      description:
        "Events with the same activity and time as an earlier event of the same case. Often a double export, sometimes a real batch.",
      severity: "warning",
      count: 512,
      examples: ["A10023", "A1254", "C17421", "N95311", "S120884"],
      fixes: [
        {
          id: "remove_exact",
          label: "Remove exact copies",
          description: "Removes events whose attributes all equal those of an earlier event of their case.",
          recommended: true,
          repairs: [{ type: "RemoveDuplicateEvents", exact: true }],
        },
        {
          id: "remove_all",
          label: "Remove all repeats",
          description:
            "Removes every event with the activity and time of an earlier event of its case, even if other attributes differ.",
          recommended: false,
          repairs: [{ type: "RemoveDuplicateEvents", exact: false }],
        },
      ],
    },
    {
      check: "mixed_type_attributes",
      title: "Attributes with mixed types",
      category: "Incorrect attribute value",
      description:
        "Event attributes whose values have different types in different events. Filters and statistics may misread them.",
      severity: "warning",
      count: 1,
      examples: ["amount: float, string"],
      fixes: [],
    },
    {
      check: "tied_events",
      title: "Events at the same time",
      category: "Imprecise time",
      description:
        "Cases with consecutive events at the same time. Their order comes from the file, not from the times.",
      severity: "info",
      count: 79_860,
      examples: ["A1", "A100", "A10000", "A10001", "A10004"],
      fixes: [
        {
          id: "order",
          label: "Spread equal times by 1 ms",
          description:
            "Adds 1 ms steps between events of a case that share a timestamp, ordered by where their activity typically occurs in a case and then by file order.",
          recommended: true,
          repairs: [{ type: "OrderTies" }],
        },
      ],
    },
    {
      check: "extreme_durations",
      title: "Very long cases",
      category: "Incorrect time",
      description:
        "Cases more than ten times longer than the 99th percentile. Often a wrong timestamp, sometimes a real outlier.",
      severity: "info",
      count: 14,
      examples: ["A21877", "C40125", "N81622", "P1093", "S93012"],
      fixes: [
        {
          id: "remove",
          label: "Remove these cases",
          description: "Removes the cases more than ten times longer than the 99th percentile.",
          recommended: false,
          repairs: [{ type: "RemoveLongCases" }],
        },
      ],
    },
    {
      check: "date_only",
      title: "Timestamps without a time of day",
      category: "Imprecise time",
      description:
        "Most events are at midnight: the timestamps carry dates only, so durations under a day are unknown.",
      severity: "info",
      count: 561_470,
      examples: ["A1", "A100", "A10000", "A10001", "A10004"],
      fixes: [],
    },
    {
      check: "events_without_activity",
      title: "Events without an activity",
      category: "Missing event type",
      description: "Events with no concept:name. Discovery and conformance checking cannot place them.",
      severity: "warning",
      count: 0,
      examples: [],
      fixes: [],
    },
    {
      check: "epoch_timestamps",
      title: "Events at 1970-01-01",
      category: "Incorrect time",
      description:
        "Events with the time 1970-01-01T00:00:00Z, usually a missing timestamp. Durations that include them are wrong.",
      severity: "warning",
      count: 0,
      examples: [],
      fixes: [],
    },
    {
      check: "unordered_events",
      title: "Events out of time order",
      category: "Incorrect time",
      description:
        "Events earlier than the event before them in their case. Directly-follows relations use the file order, so they may contradict the times.",
      severity: "warning",
      count: 0,
      examples: [],
      fixes: [],
    },
    {
      check: "empty_cases",
      title: "Cases without events",
      category: "Irrelevant case",
      description: "Traces with no events. They count as cases but appear in no view.",
      severity: "warning",
      count: 0,
      examples: [],
      fixes: [],
    },
  ],
};

// Checks that count cases or attributes; the rest count events.
const NOT_EVENTS: Record<string, string> = {
  empty_cases: "cases",
  tied_events: "cases",
  extreme_durations: "cases",
  mixed_type_attributes: "",
};
const logTotalOf = (f: HealthFinding) =>
  f.check in NOT_EVENTS
    ? { total: NOT_EVENTS[f.check] ? logHealth.num_cases : 0, noun: NOT_EVENTS[f.check] }
    : { total: logHealth.num_events, noun: "events" };

/** Hands the repairs of the picked fixes to the host and shows what it received. */
function WithRepair({
  data,
  subject,
  unit,
  totalOf,
}: {
  data: OcelHealth;
  subject?: string;
  unit?: string;
  totalOf?: (f: HealthFinding) => { total: number; noun: string };
}) {
  const [repairs, setRepairs] = useState<unknown[] | null>(null);
  return (
    <Flex direction="column" style={{ height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <OcelHealthView
          data={data}
          subject={subject}
          unit={unit}
          totalOf={totalOf}
          onRepair={(picked) =>
            new Promise((done) =>
              setTimeout(() => {
                setRepairs(picked);
                done(undefined);
              }, 800),
            )
          }
        />
      </div>
      <Text size="1" color="gray" style={{ padding: "8px 16px", borderTop: "1px solid var(--gray-a4)" }}>
        {repairs ? `Repairs handed to the host: ${JSON.stringify(repairs)}` : "No repaired copy created yet"}
      </Text>
    </Flex>
  );
}

/** Findings of an order-management OCEL with fixes. The recommended ones start out selected. */
export const WithFixes: StoryObj = {
  render: () => <WithRepair data={ocelHealth} totalOf={ocelTotalOf} />,
};

/** Without `onRepair` the view only reports: no fix pickers and no repair action. */
export const ReportOnly: StoryObj = {
  render: () => <OcelHealthView data={ocelHealth} totalOf={ocelTotalOf} />,
};

/** The same view over an event log, counting cases instead of objects. */
export const EventLog: StoryObj = {
  render: () => (
    <WithRepair
      data={{
        num_events: logHealth.num_events,
        num_objects: logHealth.num_cases,
        findings: logHealth.findings,
      }}
      subject="event log"
      unit="cases"
      totalOf={logTotalOf}
    />
  ),
};

/** Every check passed: the passed checks fold into one expandable list. */
export const AllPassed: StoryObj = {
  render: () => (
    <OcelHealthView
      data={{
        ...ocelHealth,
        findings: ocelHealth.findings.map((f) => ({ ...f, count: 0, examples: [], fixes: [] })),
      }}
    />
  ),
};
