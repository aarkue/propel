import type { BackendContext, ItemKindInfo } from "@r4pm/client";
import { SOURCE_ITEM_PREFIX, sourceItemFormat } from "./extraction-sources";
import { loadItemCached } from "./persistence/session";

/** A registry kind that can load a given file, with the import format (extension) that matched. */
export interface ImportCandidate {
  kind: string;
  ext: string;
  mime: string;
}

/** Every kind the engine can import a file into (advertises at least one import format). */
export async function importableKinds(backend: BackendContext): Promise<ItemKindInfo[]> {
  return (await backend.listItemKinds()).filter((k) => k.import_formats.length > 0);
}

/** Import formats of one kind whose extension this filename ends with (longest-first). */
export function formatsForKind(kind: ItemKindInfo, filename: string): { ext: string; mime: string }[] {
  const lower = filename.toLowerCase();
  return kind.import_formats
    .map((f) => ({ ext: f.extension.toLowerCase(), mime: f.mime }))
    .sort((a, b) => b.ext.length - a.ext.length)
    .filter((f) => lower.endsWith(`.${f.ext}`));
}

/** All importable kinds that can load this filename, by extension (drives the drop-time picker). */
export function candidateKinds(kinds: ItemKindInfo[], filename: string): ImportCandidate[] {
  const out: ImportCandidate[] = [];
  for (const k of kinds) {
    const m = formatsForKind(k, filename)[0];
    if (m) out.push({ kind: k.kind, ext: m.ext, mime: m.mime });
  }
  return out;
}

/** Strip extension + non-word chars into a handle-safe id. */
function sanitizeId(name: string): string {
  const base = name.replace(/\.[^.]*$/, "").replace(/\.(xes|ocel|csv|sqlite|json)$/i, "");
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "dataset";
}

/** An id not already loaded in the engine (numeric suffix on collision). */
async function uniqueId(backend: BackendContext, base: string): Promise<string> {
  const taken = new Set((await backend.listObjects()).map((o) => o.id));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface ImportedDataset {
  id: string;
  kind: string;
  label: string;
}

/**
 * Load a file into the engine as a user-chosen registry kind. Fully generic: the kind is whatever
 * the caller picked (auto when only one kind claims the extension, otherwise via the picker), and
 * the engine owns all parsing/decompression. A unique id is derived from the filename.
 */
export async function importFileAs(
  backend: BackendContext,
  file: File,
  kind: string,
  ext: string,
): Promise<ImportedDataset> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = await uniqueId(backend, sanitizeId(file.name));
  await loadItemCached(backend, { id, kind, format: ext, label: file.name }, bytes);
  return { id, kind, label: file.name };
}

/** Load in-memory text as a registry item (used for the bundled sample datasets). */
export function loadTextItem(
  backend: BackendContext,
  id: string,
  kind: string,
  text: string,
  format: string,
): Promise<void> {
  return backend.loadItem(id, kind, new TextEncoder().encode(text), format);
}

/** The registry kind a file dropped *as data* is imported into. Its bytes stay in the engine and
 *  an extraction reads them from there, which is the only route available where there is no
 *  filesystem (wasm) or no path (a browser `File`). */
export const TABULAR_SOURCE_KIND = "TabularSource";

/**
 * Import `file`'s bytes as a `TabularSource` and return the `connections` value naming it.
 *
 * Rejects a format the bytes route cannot read back, rather than storing a source that only fails
 * once the editor asks it for a catalog -- see `sourceItemFormat`.
 */
export async function importFileAsSource(
  backend: BackendContext,
  file: File,
): Promise<{ sourceId: string; connection: string }> {
  const format = sourceItemFormat(file.name);
  if (!format) {
    throw new Error("this file cannot be read from memory; open it from a file path instead");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = await uniqueId(backend, sanitizeId(file.name));
  await backend.loadItem(id, TABULAR_SOURCE_KIND, bytes, format);
  return { sourceId: sanitizeId(file.name), connection: `${SOURCE_ITEM_PREFIX}${id}` };
}
