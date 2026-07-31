// What an extraction can be pointed at, and which binding set reads it.
//
// Two entirely separate routes exist and neither can read the other's sources:
//
//  - `item://<registry id>` names a `TabularSource` whose bytes are held in the engine. Read by
//    `extraction_discover_catalog_items` / `extraction_run_items`, which need only `ocel-sqlite` --
//    so this is the only route that works on the pure-wasm backend and in the browser, where there
//    is no filesystem and a dropped `File` has no path.
//  - anything else is a database connection string, read by the `extraction-dbcon` bindings,
//    which open the file where it lies and so need a real path.
//
// One extraction opens one set of providers, so a blueprint cannot mix the two in a single run.
// That is a real limit rather than something to paper over: picking one group and quietly ignoring
// the other produces a log missing whole mappings, with nothing on screen saying why.
//
// Deliberately dependency-light (`dnd` is itself import-free), so it stays cheap to test and cannot
// drag the app's module graph into a unit test.
import { fileUriToPath } from "./shell/dnd";

/** Marks a `connections` entry as naming a registry item rather than a database. */
export const SOURCE_ITEM_PREFIX = "item://";

/** Extensions the `extraction-dbcon` connector can open as an extraction source, given a path. */
const SOURCE_EXTENSIONS = ["sqlite", "sqlite3", "db", "csv", "parquet"];

/** Extensions the *bytes* route can read back, which is every one `TabularSource` stores.
 *  `extraction_discover_catalog_items` opens the SQLite family itself and hands CSV, TSV and
 *  Parquet to `dbcon` (see `open_sources`), so a dropped file of any of these works with no
 *  filesystem -- the browser included. */
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
  // csv/parquet are opened by bare path; sqlite needs its scheme.
  return ext === "csv" || ext === "parquet" ? path : `sqlite://${path}`;
}

/**
 * A connection string for one entry of what was dropped on a blueprint canvas, or undefined when
 * that entry names nothing this build can open.
 *
 * The canvas hands over whatever the drop carried verbatim, which on desktop is a `text/uri-list`
 * line (`file:///data/shop.sqlite`) rather than a path -- feeding that straight to
 * {@link connectionStringForPath} yields `sqlite://file:///data/shop.sqlite`, which opens nothing.
 * A bare name with no separator is a browser `File`, which has no path at all: those go through
 * the import picker's "as a data source" column instead, which reads their bytes.
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
 * Decide which route `conns` takes.
 *
 * Blank values are ignored throughout: `ConnectionsDialog` creates an empty row the moment it
 * opens, and a row naming nothing must neither pick a route nor count as a conflict.
 *
 * @throws when both kinds are present, naming each group -- see this module's header.
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
