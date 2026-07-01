export * from "./bindings.generated";
export * from "./formats";
import type { CallBinding } from "./bindings.generated";
import type { JSONSchema7 } from "json-schema";

/** A loaded registry object, referenced by handle id. */
export interface LoadedObject {
  id: string;
  kind: string;
}

/**
 * The schema shape the engine emits (schemars). `@types/json-schema` tops out at draft-07
 * (`JSONSchema7`), which is structurally identical to 2020-12 for every field we read; we add the
 * two 2020-12-only fields schemars produces that we actually consume, plus the registry-handle marker.
 */
export type ExtendedJSONSchema = JSONSchema7 & {
  "x-registry-ref"?: string;
  /** 2020-12 tuple items (Rust tuples); schemars emits this instead of draft-07 array-form `items`. */
  prefixItems?: ExtendedJSONSchema[];
  /** 2020-12 definitions table (schemars uses `$defs`, not draft-07 `definitions`). */
  $defs?: Record<string, ExtendedJSONSchema>;
};

/** Metadata for a registered binding function (mirrors the engine's BindingMeta). */
export interface FunctionMeta {
  id: string;
  name: string;
  docs?: string[];
  module?: string;
  source_path?: string;
  source_line?: number;
  return_type: ExtendedJSONSchema;
  args: [string, ExtendedJSONSchema][];
  required_args: string[];
}

/** One import/export format a registry kind advertises (mirrors the engine's `ExtensionWithMime`). */
export interface FormatInfo {
  extension: string;
  mime: string;
}

/** A registry item kind plus the formats the engine can import it from / export it to. */
export interface ItemKindInfo {
  kind: string;
  import_formats: FormatInfo[];
  export_formats: FormatInfo[];
  /** Registry kinds an item of this kind can be transparently converted into. */
  convertible_to: string[];
}

/** Metadata for an engine-stored artifact (non-registry value, e.g. a Petri net). */
export interface ArtifactInfo {
  id: string;
  kind: string;
}

/** Which transport an active backend speaks. */
export type BackendKind = "wasm" | "http" | "tauri";

/**
 * The single backend surface the UI talks to, implemented once per transport
 * (wasm direct / http fetch / tauri invoke). Data stays in the engine; only handles,
 * metadata, file bytes, and small/plot-bound results cross this boundary.
 *
 * Everything here is async so the http and tauri transports fit without special-casing;
 * the wasm transport wraps its synchronous calls in resolved promises.
 */
export interface BackendContext {
  readonly kind: BackendKind;
  /** Resolves once the backend can accept calls (wasm module init, etc). */
  readonly ready: Promise<void>;

  // --- binding / registry surface ---
  callBinding: CallBinding;
  listObjects(): Promise<LoadedObject[]>;
  listFunctions(): Promise<FunctionMeta[]>;
  listItemKinds(): Promise<ItemKindInfo[]>;

  // --- IO (the engine owns parsing/serialization for every format) ---
  loadItem(id: string, kind: string, data: Uint8Array, format: string): Promise<void>;
  exportObject(name: string, format: string): Promise<Uint8Array>;
  unloadObject(name: string): Promise<void>;

  // --- artifacts (engine-owned, non-registry values, e.g. Petri nets) ---
  loadArtifactBytes(id: string, kind: string, data: Uint8Array, format: string): Promise<void>;
  listArtifacts(): Promise<ArtifactInfo[]>;
  getArtifact(id: string): Promise<unknown>;
  unloadArtifact(id: string): Promise<void>;
  exportArtifact(id: string, format: string): Promise<Uint8Array>;
  /** Desktop-only (tauri): native read from a path. Absent on wasm/http. */
  loadArtifactPath?(id: string, kind: string, path: string): Promise<void>;
  /** Desktop-only (tauri): native read of a registry item from a path. Absent on wasm/http. */
  loadItemPath?(id: string, kind: string, path: string): Promise<void>;
  /** Desktop-only (tauri): native file picker; returns selected paths or null if cancelled. */
  pickFiles?(opts: {
    filters?: { name: string; extensions: string[] }[];
    multiple?: boolean;
  }): Promise<string[] | null>;
  /**
   * Desktop-only (tauri): paths the app was launched with via an OS file association
   * ("Open with propel") or CLI args. Drained on first read; absent on wasm/http.
   */
  getInitialFiles?(): Promise<string[]>;

  // --- platform ---
  /** Save bytes to the user's disk (browser anchor-download or native save dialog). */
  saveBytes(data: Uint8Array, filename: string, mime?: string): Promise<void>;
  /**
   * Subscribe to a backend-emitted event (e.g. import progress). Returns an unsubscribe fn.
   * Optional: a transport may not emit (the http transport currently does not).
   */
  registerListener?<T>(event: string, listener: (data: T) => void): Promise<() => void>;
}
