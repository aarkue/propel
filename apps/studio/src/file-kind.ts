import type { ImportCandidate } from "./data-import";

/** What the open dialogs and menus call a kind. */
const KIND_NAME: Record<string, string> = {
  EventLog: "Event log",
  SlimLinkedOCEL: "Object-centric event log (OCEL)",
  OCEL: "OCEL, as stored",
  IndexLinkedOCEL: "OCEL, index-linked",
  EventLogActivityProjection: "Activity projection",
  AcceptingPetriNet: "Petri net",
  ProcessTree: "Process tree",
  ObjectCentricPetriNet: "Object-centric Petri net",
  OCDeclare: "OC-DECLARE model",
  ReflowMapping: "Reflow mapping",
};

export function kindName(kind: string): string {
  return KIND_NAME[kind] ?? kind;
}

/** How much of a file the content check reads. Models are far smaller, so a longer file is a log. */
export const SNIFF_BYTES = 4 * 1024 * 1024;

/**
 * The kind of a JSON file by its top-level keys, or null if they match no kind. `complete` is
 * whether `text` is the whole file. Of a longer file, only the start is searched.
 */
export function sniffJsonKind(text: string, complete: boolean): string | null {
  if (!complete) return /"(objectTypes|eventTypes)"\s*:/.test(text) ? "SlimLinkedOCEL" : null;
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const d = doc as Record<string, unknown>;
  if ("objectTypes" in d || "eventTypes" in d) return "SlimLinkedOCEL";
  if ("root" in d) return "ProcessTree";
  if ("places" in d && "initial_marking" in d) {
    const first = Array.isArray(d.places) ? d.places[0] : undefined;
    return first && typeof first === "object" && "object_type" in first
      ? "ObjectCentricPetriNet"
      : "AcceptingPetriNet";
  }
  return null;
}

/** The candidate that matches a JSON file's content, or null to let the user choose. */
export async function candidateByContent(
  candidates: ImportCandidate[],
  read: () => Promise<{ text: string; complete: boolean }>,
): Promise<ImportCandidate | null> {
  if (!candidates.some((c) => c.ext === "json")) return null;
  try {
    const { text, complete } = await read();
    const kind = sniffJsonKind(text, complete);
    return candidates.find((c) => c.kind === kind) ?? null;
  } catch {
    return null;
  }
}
