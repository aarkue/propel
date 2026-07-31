// Reading and writing a blueprint as a JSON document, so one can leave the editor and come back:
// pasted into an issue, committed next to the code it describes, or handed to someone else.
//
// The document is a plain `Blueprint` -- the same shape the Rust side parses, version field and
// all -- plus, only when explicitly asked for, the connection strings. Connections are deliberately
// not part of `Blueprint` (spec 1.7, 2.6) precisely so an export cannot leak a password by
// accident, so they travel in a sibling key and are opt-in per export.
import { fromBlueprint, toBlueprint, type EditorBlueprint } from "../model";
import type { Blueprint } from "../types";

/** How a blueprint is written to a file or the clipboard. */
export interface BlueprintDocument extends Blueprint {
  /** Present only when the export explicitly opted in. */
  connections?: Record<string, string>;
}

export interface ExportedBlueprint {
  json: string;
  /** Whether any connection string was actually written, for the UI to say so plainly. */
  includedConnections: boolean;
}

export function exportBlueprint(
  model: EditorBlueprint,
  connections: Record<string, string>,
  includeConnections: boolean,
): ExportedBlueprint {
  const doc: BlueprintDocument = toBlueprint(model);
  const withValues = Object.entries(connections).filter(([, v]) => v);
  if (includeConnections && withValues.length > 0) {
    doc.connections = Object.fromEntries(withValues);
  }
  return {
    json: `${JSON.stringify(doc, null, 2)}\n`,
    includedConnections: !!doc.connections,
  };
}

export type ImportResult =
  | { ok: true; model: EditorBlueprint; connections?: Record<string, string> }
  | { ok: false; error: string };

/** The model version this build writes and can read. Mirrors `MODEL_VERSION` on the Rust side. */
export const SUPPORTED_VERSION = 1;

/**
 * Parse a pasted or dropped document.
 *
 * Checks the declared version before anything else, mirroring `Blueprint::from_json`: a document
 * from a newer build uses constructs this one has never heard of, and "unsupported version" is a
 * far more useful thing to say than whatever the first structural mismatch happens to be. Every
 * failure comes back as a message rather than an exception, since a paste being malformed is
 * ordinary, not exceptional.
 */
export function importBlueprint(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Expected a JSON object describing a blueprint." };
  }
  const doc = parsed as Partial<BlueprintDocument>;
  if (typeof doc.version !== "number") {
    return { ok: false, error: "Missing a numeric `version` field -- is this a blueprint?" };
  }
  if (doc.version > SUPPORTED_VERSION) {
    return {
      ok: false,
      error: `This blueprint declares version ${doc.version}, but this build only understands up to ${SUPPORTED_VERSION}. Update before opening it.`,
    };
  }
  if (!Array.isArray(doc.nodes) || !Array.isArray(doc.mappings)) {
    return { ok: false, error: "Expected `nodes` and `mappings` arrays." };
  }
  const { connections, ...blueprint } = doc as BlueprintDocument;
  return {
    ok: true,
    model: fromBlueprint(blueprint as Blueprint),
    connections: connections && typeof connections === "object" ? connections : undefined,
  };
}

/** A filename that says what the document is and which blueprint it came from. */
export function suggestFilename(model: EditorBlueprint): string {
  const firstTable = model.nodes.find((n) => n.op.type === "source");
  const base =
    firstTable && firstTable.op.type === "source" && firstTable.op.table
      ? firstTable.op.table.replace(/[^\w-]+/g, "-")
      : "blueprint";
  return `${base}.blueprint.json`;
}
