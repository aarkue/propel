import type { IconType } from "react-icons";
import {
  PiCheckCircle,
  PiClockCountdown,
  PiFlowArrow,
  PiGraph,
  PiInfo,
  PiPuzzlePiece,
  PiShieldCheck,
  PiTreeStructure,
} from "react-icons/pi";

/** A panel as the picker lists it under an analysis. */
export interface Entry {
  type: string;
  /** What the panel shows or does, in a few words. */
  about: string;
}

/** A kind of analysis of a log: a section of the panel picker. */
export interface Analysis {
  id: string;
  title: string;
  /** What the analysis covers, in a few words. */
  summary: string;
  needs: "EventLog" | "SlimLinkedOCEL";
  icon: IconType;
  panels: Entry[];
  /** Words people search for this analysis with. */
  keywords?: string[];
}

export const ANALYSES: Analysis[] = [
  {
    id: "overview",
    title: "Overview",
    summary: "Size, time span and activities of the log",
    needs: "EventLog",
    icon: PiInfo,
    panels: [
      { type: "logOverview", about: "Cases over time, top variants and activities" },
      { type: "activityChart", about: "Events per activity" },
      { type: "eventsPerTime", about: "Events over time" },
    ],
  },
  {
    id: "what",
    keywords: ["process map", "flow", "happy path", "rework", "variants"],
    title: "Process flow",
    summary: "The order in which activities happen",
    needs: "EventLog",
    icon: PiFlowArrow,
    panels: [
      { type: "dfg", about: "Directly-follows graph with frequencies and durations" },
      { type: "logVariants", about: "Activity sequences and how many cases follow each" },
      { type: "prefixTree", about: "Variants merged on their shared prefixes" },
      { type: "variantTimeProfile", about: "Time since case start at each step of a variant" },
      { type: "dfgCompare", about: "Directly-follows graphs of two periods or logs, compared" },
      { type: "processAnimation", about: "Cases moving over the DFG or a Petri net" },
    ],
  },
  {
    id: "time",
    keywords: ["bottleneck", "slow", "lead time", "delay", "performance"],
    title: "Performance analysis",
    summary: "Case durations, waiting times and working hours",
    needs: "EventLog",
    icon: PiClockCountdown,
    panels: [
      { type: "performanceSpectrum", about: "Time between consecutive steps, per case over time" },
      { type: "caseDuration", about: "Distribution of case durations" },
      { type: "dottedChart", about: "Every event over time, one row per case" },
      { type: "workload", about: "Events by weekday and hour of day" },
    ],
  },
  {
    id: "models",
    keywords: ["discovery", "mining", "inductive miner"],
    title: "Process discovery",
    summary: "Petri nets and process trees discovered from the log",
    needs: "EventLog",
    icon: PiGraph,
    panels: [
      { type: "petriNet", about: "Petri net from the Inductive Miner or Alpha+++" },
      { type: "processTree", about: "Process tree from the Inductive Miner" },
      { type: "modelSweep", about: "Fitness, precision and size over a range of noise thresholds" },
      { type: "petriNetEditor", about: "Draw or edit a Petri net" },
    ],
  },
  {
    id: "fit",
    keywords: ["fitness", "deviation", "compliance", "alignments"],
    title: "Conformance checking",
    summary: "Alignments of the log against a saved Petri net",
    needs: "EventLog",
    icon: PiCheckCircle,
    panels: [{ type: "group:conformance", about: "Fitness, alignments on the net and aligned variants" }],
  },
  {
    id: "data",
    keywords: ["quality", "errors", "missing", "health"],
    title: "Data quality",
    summary: "Missing, incorrect and imprecise data",
    needs: "EventLog",
    icon: PiShieldCheck,
    panels: [
      { type: "logHealth", about: "Data-quality checks, with fixes" },
      { type: "traceBrowser", about: "Cases with their events and attributes" },
      { type: "attributeAnalysis", about: "Values and types of each attribute" },
    ],
  },
  {
    id: "transform",
    title: "Transform and create",
    summary: "Filter or change a log, or create a new one",
    needs: "EventLog",
    icon: PiPuzzlePiece,
    panels: [
      { type: "logTransforms", about: "Filter, relabel, sample or rescale the log" },
      { type: "pipeline", about: "Chain steps into a pipeline that can run again" },
      { type: "eventLogEditor", about: "Write an event log by hand" },
      { type: "extraction-blueprint", about: "Extract an event log from a database" },
    ],
  },
  {
    id: "ocelOverview",
    title: "Overview",
    summary: "Size, time span and types of the OCEL",
    needs: "SlimLinkedOCEL",
    icon: PiInfo,
    panels: [
      { type: "ocelOverview", about: "Types, objects over time and event mixes" },
      { type: "ocelCounts", about: "Events and objects per type" },
      { type: "objectPopulation", about: "Objects alive per type over time" },
      { type: "ocelWorkload", about: "Events by weekday and hour of day" },
    ],
  },
  {
    id: "ocelWhat",
    keywords: ["process map", "object lifecycle", "flow"],
    title: "Process flow",
    summary: "The order of activities per object type",
    needs: "SlimLinkedOCEL",
    icon: PiFlowArrow,
    panels: [
      { type: "ocdfg", about: "Directly-follows graph per object type" },
      { type: "lifecycleMap", about: "When each activity happens in an object's life" },
      { type: "objectLifelines", about: "Events of individual objects over time" },
      { type: "executionGraph", about: "Events around one object and how they connect" },
      { type: "ocelAnimation", about: "Objects moving over the OC-DFG or an OCPN" },
    ],
  },
  {
    id: "ocelRelations",
    keywords: ["data model", "links", "schema"],
    title: "Object relations",
    summary: "How object types relate to each other",
    needs: "SlimLinkedOCEL",
    icon: PiTreeStructure,
    panels: [
      { type: "pathSchemas", about: "Relation paths from one type to another" },
      { type: "ocelTypeGraph", about: "Object and event types and their relations" },
      { type: "eventSignatures", about: "Object types each event type involves" },
      { type: "reflow", about: "Which relations carry the flow between types" },
    ],
  },
  {
    id: "ocelFit",
    keywords: ["fitness", "conformance", "replay", "constraints"],
    title: "Models and conformance",
    summary: "Object-centric Petri nets and OC-DECLARE constraints",
    needs: "SlimLinkedOCEL",
    icon: PiCheckCircle,
    panels: [
      { type: "ocpn", about: "Object-centric Petri net from the Inductive Miner" },
      { type: "ocelAnimation", about: "Objects replayed on a saved OCPN, with fitness" },
      { type: "group:ocDeclare", about: "Constraints and their violations" },
      { type: "ocpnEditor", about: "Draw or edit an object-centric Petri net" },
    ],
  },
  {
    id: "ocelData",
    keywords: ["quality", "errors", "missing", "health"],
    title: "Data quality",
    summary: "Missing, incorrect and imprecise data",
    needs: "SlimLinkedOCEL",
    icon: PiShieldCheck,
    panels: [
      { type: "ocelHealth", about: "Data-quality checks, with fixes" },
      { type: "objectBrowser", about: "Objects with their attributes, events and relations" },
      { type: "objectChanges", about: "Attribute values of objects over time" },
    ],
  },
  {
    id: "ocelTransform",
    title: "Transform and create",
    summary: "Filter or flatten an OCEL, or create a new one",
    needs: "SlimLinkedOCEL",
    icon: PiPuzzlePiece,
    panels: [
      { type: "ocelTransforms", about: "Filter, relabel or sample the OCEL" },
      { type: "flattenOcel", about: "Event log for one object type" },
      { type: "pipeline", about: "Chain steps into a pipeline that can run again" },
      { type: "ocelEditor", about: "Write an OCEL by hand" },
      { type: "extraction-blueprint", about: "Extract an OCEL from a database" },
    ],
  },
];

/** How the analyses describe panel `type`. */
export function aboutPanel(type: string): string[] {
  return ANALYSES.flatMap((a) => a.panels.filter((e) => e.type === type).map((e) => e.about));
}
