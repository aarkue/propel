import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { EXPERT_IMPORT_FORMATS, EXPERT_IMPORT_KINDS, useDatasets, usePreferences } from "../stores";
import type { ItemKindInfo } from "@r4pm/client";
import { backend } from "../backends";
import { candidateKinds, formatsForKind, type ImportCandidate, importFileAs } from "../data-import";
import { IO_KINDS, ioKindByName } from "../io-kinds";
import { openOutputAsPanel } from "../panels/pipeline-bridge";
import { GlobalDropOverlay } from "./GlobalDropOverlay";
import { ImportContext } from "./import-context";
import { KindPickerDialog } from "./KindPickerDialog";

/** Convert a `file://` URI (as WebKit puts in drop events) to a native filesystem path. */
function fileUriToPath(uri: string): string | null {
  if (!uri.startsWith("file://")) return null;
  try {
    const u = new URL(uri);
    let p = decodeURIComponent(u.pathname);
    // Windows: `file:///C:/x` -> pathname `/C:/x`; strip the leading slash.
    if (/^\/[a-zA-Z]:/.test(p)) p = p.slice(1);
    return p;
  } catch {
    return null;
  }
}

/**
 * Recover native file paths from a drop's DataTransfer.
 * On Tauri's WebKit webview (Linux/macOS) the dropped `File` bytes might be stripped for sandboxing.
 * At least on Linux, the real paths arrive as a `text/uri-list`, or even as `file://` anchors (`<a ...`) embedded in `text/html`.
 */
function extractPathsFromDataTransfer(dt: DataTransfer | null): string[] {
  if (!dt) return [];
  const out: string[] = [];
  const uriList = dt.getData("text/uri-list");
  if (uriList) {
    for (const line of uriList.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const p = fileUriToPath(trimmed);
      if (p) out.push(p);
    }
  }
  if (out.length === 0) {
    const html = dt.getData("text/html");
    if (html) {
      // WebKitGTK wraps a dropped file as `<a ...>file:///path</a>` (URL as anchor text), so the
      // match must stop at `<` and `>`, not only `>`.
      for (const m of html.matchAll(/file:\/\/[^\s"'<>]+/gi)) {
        const p = fileUriToPath(m[0]);
        if (p) out.push(p);
      }
    }
  }
  if (out.length === 0) {
    // Some WebKitGTK builds might expose the dropped path only as text/plain
    // (a file:// URI or an absolute path), not as text/uri-list.
    const plain = dt.getData("text/plain").trim();
    if (plain.startsWith("file://")) {
      const p = fileUriToPath(plain);
      if (p) out.push(p);
    } else if (plain.startsWith("/") && !plain.includes("\n")) {
      out.push(plain);
    }
  }
  return out;
}

/** Slugify a filename into a filesystem-friendly id base. */
function slugifyFilename(filename: string, fallback: string): string {
  return (
    filename
      .replace(/\.[^.]*$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

/** First id of `base`, `base-2`, `base-3`, ... not already in `taken`. */
function firstFreeId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** Derive a unique, filesystem-friendly artifact id from a filename, avoiding ids already in use. */
async function uniqueArtifactId(filename: string): Promise<string> {
  const taken = new Set((await backend.listArtifacts()).map((a) => a.id));
  return firstFreeId(slugifyFilename(filename, "artifact"), taken);
}

/** Derive a unique registry-object id from a filename, avoiding ids already loaded. */
async function uniqueDatasetId(filename: string): Promise<string> {
  const taken = new Set((await backend.listObjects()).map((o) => o.id));
  return firstFreeId(slugifyFilename(filename, "dataset"), taken);
}

/**
 * Owns all import surfaces:
 * 1. the hidden file input,
 * 2. the window-wide drop zone (+ overlay),
 * 3. and the disambiguation picker.
 * Import is generic over kinds.
 */
export function ImportProvider({ children }: { children: ReactNode }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<ItemKindInfo | null>(null);
  const [dragging, setDragging] = useState(false);
  // A drop with an ambiguous extension needs disambiguation. The source is either an in-memory
  // `File` (web / Windows) or a native `path` (desktop WebKit, OS file association).
  const [picker, setPicker] = useState<{
    name: string;
    candidates: ImportCandidate[];
    source: { kind: "file"; file: File } | { kind: "path"; path: string };
  } | null>(null);

  const showExpertKinds = usePreferences((s) => s.showExpertKinds);

  const kindsQuery = useQuery({
    queryKey: ["item-kinds"],
    queryFn: () => backend.listItemKinds(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const importableKinds = useMemo<ItemKindInfo[]>(() => {
    const registry = (kindsQuery.data ?? [])
      .filter((k) => k.import_formats.length > 0)
      // Hide advanced/internal kinds (raw OCEL, IndexLinkedOCEL, activity projection) unless the
      // expert toggle is on. This collapses the OCEL/EventLog families to one curated choice each,
      // removing ambiguous import options everywhere (menu, palette, drop picker).
      .filter((k) => showExpertKinds || !EXPERT_IMPORT_KINDS.includes(k.kind))
      // Also drop per-kind expert formats (e.g. EventLog's `.json`).
      .map((k) => {
        const hidden = showExpertKinds ? undefined : EXPERT_IMPORT_FORMATS[k.kind];
        if (!hidden) return k;
        return { ...k, import_formats: k.import_formats.filter((f) => !hidden.includes(f.extension)) };
      })
      .filter((k) => k.import_formats.length > 0);
    // Also include io-kinds (non-registry, codec-backed) in the same menu/classification as `ItemKindInfo`.
    const io: ItemKindInfo[] = IO_KINDS.map((k) => ({
      kind: k.kind,
      import_formats: k.import_formats,
      export_formats: k.export_formats,
      convertible_to: [],
    }));
    return [...registry, ...io];
  }, [kindsQuery.data, showExpertKinds]);

  const runImport = useCallback((file: File, kind: string, ext: string) => {
    // Import toasts + dataset refresh are driven by the engine's `import-*` / `objects-changed`
    // events (see <EngineEvents />); here we only kick off the load and set an initial label.
    void (async () => {
      // Artifacts / io-kinds (e.g. PetriNet/PNML) are engine-stored artifacts (not registry items).
      // Thus, load the bytes into the engine's artifact store, then fetch the value to open it in a viewer.
      // The `artifacts-changed` event triggers the Artifacts strip update (see <EngineEvents />).
      const io = ioKindByName(kind);
      if (io) {
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const id = await uniqueArtifactId(file.name);
          await backend.loadArtifactBytes(id, io.kind, bytes, ext);
          const value = await backend.getArtifact(id);
          openOutputAsPanel(io.returnType, value);
        } catch (e) {
          toast.error(`Failed to import "${file.name}": ${String(e)}`);
        }
        return;
      }
      try {
        const d = await importFileAs(backend, file, kind, ext);
        useDatasets.getState().addDataset(d);
      } catch {
        // Engine parse errors surface via the `import-failed` event; pre-engine (file-read) errors
        // are rare and only logged by the backend call.
      }
    })();
  }, []);

  const handleDroppedFile = useCallback(
    (file: File) => {
      const cands = candidateKinds(importableKinds, file.name);
      if (cands.length === 0) {
        toast.error(`Unsupported file "${file.name}".`);
        return;
      }
      if (cands.length === 1) {
        runImport(file, cands[0].kind, cands[0].ext);
        return;
      }
      setPicker({ name: file.name, candidates: cands, source: { kind: "file", file } });
    },
    [importableKinds, runImport],
  );

  // Native path-import (desktop): dispatch by kind. io-kind -> engine artifact store + viewer;
  // registry kind -> engine object store + dataset chip. No file bytes cross the JS boundary.
  const importPath = useCallback(async (kind: string, path: string) => {
    const filename = path.split(/[\\/]/).pop() ?? path;
    const io = ioKindByName(kind);
    try {
      if (io) {
        const id = await uniqueArtifactId(filename);
        await backend.loadArtifactPath?.(id, io.kind, path);
        const value = await backend.getArtifact(id);
        openOutputAsPanel(io.returnType, value);
      } else {
        const id = await uniqueDatasetId(filename);
        await backend.loadItemPath?.(id, kind, path);
        useDatasets.getState().addDataset({ id, kind, label: filename });
      }
    } catch (e) {
      toast.error(`Failed to import "${filename}": ${String(e)}`);
    }
  }, []);

  // A native path (dropped on desktop, or passed by an OS file association): classify by filename,
  // then import directly from the path (no bytes through JS) or disambiguate via the picker.
  const handleDroppedPath = useCallback(
    (path: string) => {
      const name = path.split(/[\\/]/).pop() ?? path;
      const cands = candidateKinds(importableKinds, name);
      if (cands.length === 0) {
        toast.error(`Unsupported file "${name}".`);
        return;
      }
      if (cands.length === 1) {
        void importPath(cands[0].kind, path);
        return;
      }
      setPicker({ name, candidates: cands, source: { kind: "path", path } });
    },
    [importableKinds, importPath],
  );

  const importKind = useCallback(
    async (kind: ItemKindInfo) => {
      // Desktop: native OS dialog + native path read (no bytes through JS).
      if (backend.pickFiles) {
        const exts = kind.import_formats.map((f) => f.extension);
        const paths = await backend.pickFiles({ filters: [{ name: kind.kind, extensions: exts }] });
        if (!paths?.length) return;
        for (const path of paths) await importPath(kind.kind, path);
        return;
      }
      // Web fallback: the hidden <input> flow.
      pendingKind.current = kind;
      const input = fileInputRef.current;
      if (!input) return;
      input.accept = kind.import_formats.map((f) => `.${f.extension}`).join(",");
      input.click();
    },
    [importPath],
  );

  const onFileChosen = (file: File | undefined) => {
    if (!file) return;
    const kind = pendingKind.current;
    pendingKind.current = null;
    if (!kind) return handleDroppedFile(file);
    const fmt = formatsForKind(kind, file.name)[0];
    if (!fmt) {
      const exts = kind.import_formats.map((f) => `.${f.extension}`).join(", ");
      toast.error(`"${file.name}" is not a ${kind.kind} file (expected ${exts}).`);
      return;
    }
    runImport(file, kind.kind, fmt.ext);
  };

  useEffect(() => {
    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    const onDesktop = !!(backend.loadItemPath || backend.loadArtifactPath);
    // Show the overlay only for actual file drags. Dockview panel drags carry `text/plain` only, and
    // in-app HTML5 drags (e.g. reordering events in a trace) carry a `application/x-r4pm-*` type or
    // nothing at all. Desktop WebKit (Tauri, dragDropEnabled=false) strips the "Files" type and
    // delivers paths via `text/uri-list` / `text/html`, and can strip ALL types on a native drop -
    // so empty types count as a file only on desktop; in a browser they mean an internal drag.
    const looksLikeFile = (dt: DataTransfer | null) => {
      if (!dt) return false;
      const types = Array.from(dt.types);
      if (types.some((t) => t.startsWith("application/x-r4pm"))) return false;
      return (
        types.includes("Files") ||
        types.includes("text/uri-list") ||
        types.includes("text/html") ||
        (onDesktop && types.length === 0)
      );
    };
    const onEnter = (e: Event) => {
      const dt = (e as DragEvent).dataTransfer;
      if (!looksLikeFile(dt)) return;
      e.preventDefault();
      if (clearTimer) clearTimeout(clearTimer);
      setDragging(true);
    };
    const onOver = (e: Event) => {
      const dt = (e as DragEvent).dataTransfer;
      if (!looksLikeFile(dt)) return;
      // Required or `drop` never fires; also stops WebKit from navigating to the dropped file://.
      e.preventDefault();
      if (dt) dt.dropEffect = "copy";
      if (clearTimer) clearTimeout(clearTimer);
      setDragging(true);
    };
    const onLeave = () => {
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => setDragging(false), 120);
    };
    const filesOf = (dt: DataTransfer | null): File[] => {
      if (!dt) return [];
      if (dt.files && dt.files.length > 0) return Array.from(dt.files);
      if (dt.items)
        return Array.from(dt.items)
          .filter((it) => it.kind === "file")
          .map((it) => it.getAsFile())
          .filter((f): f is File => f !== null);
      return [];
    };
    const onDrop = (e: Event) => {
      const dt = (e as DragEvent).dataTransfer;
      if (!looksLikeFile(dt)) return;
      e.preventDefault();
      setDragging(false);

      // On desktop prefer the native path: efficient (no bytes through IPC) and reliable. WebKitGTK
      // can present a placeholder-named File, so the path is the trustworthy source.
      if (onDesktop) {
        const paths = extractPathsFromDataTransfer(dt);
        if (paths.length > 0) {
          for (const p of paths) handleDroppedPath(p);
          return;
        }
      }
      const files = filesOf(dt);
      if (files.length > 0) {
        for (const f of files) handleDroppedFile(f);
        return;
      }
      const types = Array.from(dt?.types ?? []);
      if (types.includes("Files") || types.includes("text/uri-list")) {
        toast.error("Drop received but no files were attached.");
      }
    };
    const opts: AddEventListenerOptions = { capture: true };
    window.addEventListener("dragenter", onEnter, opts);
    window.addEventListener("dragover", onOver, opts);
    window.addEventListener("dragleave", onLeave, opts);
    window.addEventListener("drop", onDrop, opts);
    return () => {
      window.removeEventListener("dragenter", onEnter, opts);
      window.removeEventListener("dragover", onOver, opts);
      window.removeEventListener("dragleave", onLeave, opts);
      window.removeEventListener("drop", onDrop, opts);
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, [handleDroppedFile, handleDroppedPath]);

  // OS file association ("Open with propel"): the desktop backend collects the launch path(s); import
  // them once the kind registry is loaded so classification sees registry + artifact kinds. macOS may
  // deliver files after startup, so also re-drain on the engine's `initial-files-changed` event.
  const initialFilesDone = useRef(false);
  useEffect(() => {
    if (!kindsQuery.isSuccess || !backend.getInitialFiles) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const drain = async () => {
      try {
        const paths = await backend.getInitialFiles?.();
        if (cancelled) return;
        for (const p of paths ?? []) handleDroppedPath(p);
      } catch (e) {
        toast.error(`Failed to open file: ${String(e)}`);
      }
    };
    if (!initialFilesDone.current) {
      initialFilesDone.current = true;
      void drain();
    }
    const reg = backend.registerListener?.("initial-files-changed", () => {
      void drain();
    });
    void reg?.then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [kindsQuery.isSuccess, handleDroppedPath]);

  return (
    <ImportContext.Provider value={{ importableKinds, importKind }}>
      {children}
      <input
        ref={fileInputRef}
        type="file"
        data-testid="import-file"
        style={{ display: "none" }}
        onChange={(e) => {
          onFileChosen(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {dragging && <GlobalDropOverlay />}
      <KindPickerDialog
        filename={picker?.name ?? null}
        candidates={picker?.candidates ?? []}
        onPick={(c) => {
          if (picker) {
            if (picker.source.kind === "file") runImport(picker.source.file, c.kind, c.ext);
            else void importPath(c.kind, picker.source.path);
          }
          setPicker(null);
        }}
        onCancel={() => setPicker(null)}
      />
    </ImportContext.Provider>
  );
}
