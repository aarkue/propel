// Two separate, non-mixable routes: `item://<registry id>` reads a `TabularSource`'s bytes from
// the engine (works with no filesystem, e.g. in the browser); anything else is a `dbcon` connection
// string that opens a real path. A blueprint mixing both would silently drop one group's mappings.
import { fileUriToPath } from "./shell/dnd";

/** Marks a `connections` entry as naming a registry item rather than a database. */
export const SOURCE_ITEM_PREFIX = "item://";

/** Extensions the `extraction-dbcon` connector can open as an extraction source, given a path. */
const SOURCE_EXTENSIONS = ["sqlite", "sqlite3", "db", "csv", "parquet", "xlsx"];

/** Extensions the *bytes* route can read back, i.e. every one `TabularSource` stores. */
const SOURCE_ITEM_EXTENSIONS = SOURCE_EXTENSIONS;

/** The lowercased extension of `filename`, or undefined when it has none. */
function extensionOf(filename: string): string | undefined {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  // A leading dot is a hidden file (`.gitignore`), not an extension.
  if (dot <= 0 || dot === base.length - 1) return undefined;
  return base.slice(dot + 1).toLowerCase();
}

/** Whether a *path* can be opened as an extraction source (the `dbcon` route). */
export function isExtractionSource(filename: string): boolean {
  const ext = extensionOf(filename);
  return !!ext && SOURCE_EXTENSIONS.includes(ext);
}

/** Whether a browser `File`'s bytes can be opened as an extraction source (the registry route).
 *  Narrower than {@link isExtractionSource}: only the SQLite family is readable from memory. */
export function isExtractionSourceFile(filename: string): boolean {
  const ext = extensionOf(filename);
  return !!ext && SOURCE_ITEM_EXTENSIONS.includes(ext);
}

/** A `dbcon` connection string for `path`, or undefined if the extension is not one we open. */
export function connectionStringForPath(path: string): string | undefined {
  const ext = extensionOf(path);
  if (!ext || !SOURCE_EXTENSIONS.includes(ext)) return undefined;
  // csv/parquet/xlsx are opened by bare path; sqlite needs its scheme. List them explicitly so an
  // unknown extension can't fall into the sqlite branch.
  return ext === "csv" || ext === "parquet" || ext === "xlsx" ? path : `sqlite://${path}`;
}

/**
 * A connection string for one entry dropped on a blueprint canvas, or undefined when it names
 * nothing this build can open. The canvas hands over the raw drop text (a `text/uri-list` line on
 * desktop), so a `file://` URI must be decoded to a path before {@link connectionStringForPath}.
 */
export function connectionForDroppedText(text: string): string | undefined {
  const decoded = fileUriToPath(text);
  if (decoded !== null) return connectionStringForPath(decoded);
  // A dragged hyperlink is a URL, not a file: `https://host/shop.sqlite` would otherwise become
  // `sqlite://https://host/shop.sqlite`.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return undefined;
  if (!text.includes("/") && !text.includes("\\")) return undefined;
  return connectionStringForPath(text);
}

/** The format `TabularSource` should be told to store `filename`'s bytes as, or undefined when the
 *  bytes route cannot read that format back. */
export function sourceItemFormat(filename: string): string | undefined {
  const ext = extensionOf(filename);
  return ext && SOURCE_ITEM_EXTENSIONS.includes(ext) ? ext : undefined;
}

export type SourceRoute =
  /** Nothing to read yet (no connections, or only blank ones the dialog just created). */
  | { kind: "none" }
  /** Registry-held sources, keyed as the item bindings expect: source id -> registry item id. */
  | { kind: "items"; sources: Record<string, string> }
  /** Database connection strings, keyed source id -> connection string. */
  | { kind: "connections"; connections: Record<string, string> };

/**
 * Decide which route `conns` takes. Blank values (an added-but-unfilled row) are ignored.
 * @throws when both kinds are present.
 */
export function routeConnections(conns: Record<string, string>): SourceRoute {
  const sources: Record<string, string> = {};
  const connections: Record<string, string> = {};
  for (const [sourceId, value] of Object.entries(conns)) {
    if (!value) continue;
    if (value.startsWith(SOURCE_ITEM_PREFIX)) sources[sourceId] = value.slice(SOURCE_ITEM_PREFIX.length);
    else connections[sourceId] = value;
  }
  const itemIds = Object.keys(sources);
  const connectionIds = Object.keys(connections);
  if (itemIds.length > 0 && connectionIds.length > 0) {
    throw new Error(
      `One extraction reads one kind of source, but this blueprint mixes imported files (${itemIds.join(", ")}) with database connections (${connectionIds.join(", ")}). Point every source at the same kind.`,
    );
  }
  if (itemIds.length > 0) return { kind: "items", sources };
  if (connectionIds.length > 0) return { kind: "connections", connections };
  return { kind: "none" };
}
