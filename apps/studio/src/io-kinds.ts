import type { FormatInfo } from "@r4pm/client";

/**
 * A non-registry, engine-stored kind ("artifact"): importable/exportable via the engine's artifact
 * methods (which map kind -> the right Importable/Exportable), classified here for the Import menu,
 * file filters, and viewer resolution.
 */
export interface IoKind {
  kind: string;
  import_formats: FormatInfo[];
  export_formats: FormatInfo[];
  /** Return-type title used to resolve the viewer for the value. */
  returnType: string;
  /** The viewer's data for a stored value, when it differs from the value itself. */
  toViewerData?: (value: unknown) => unknown;
  /** Panel type that opens stored values (as its `doc` param) instead of the generic viewer. */
  editorPanel?: string;
}

export const IO_KINDS: IoKind[] = [
  {
    kind: "PetriNet",
    import_formats: [
      { extension: "pnml", mime: "text/plain" },
      { extension: "apnml", mime: "text/plain" },
    ],
    export_formats: [{ extension: "pnml", mime: "text/plain" }],
    returnType: "AcceptingPetriNet",
  },
  {
    kind: "OCDeclare",
    import_formats: [{ extension: "ocdeclare", mime: "application/json" }],
    export_formats: [{ extension: "ocdeclare", mime: "application/json" }],
    returnType: "Array_of_OCDeclareArc",
    toViewerData: (value) => (value as { arcs: unknown }).arcs,
    editorPanel: "ocDeclare",
  },
];

export function ioKindByName(kind: string): IoKind | undefined {
  return IO_KINDS.find((k) => k.kind === kind);
}

/** Where an artifact of `kind` opens: its own panel, or the generic viewer with its viewer data. */
export function artifactOpening(
  kind: string,
  value: unknown,
): { panel: string; params: Record<string, unknown> } | { returnType: string; data: unknown } {
  const io = ioKindByName(kind);
  if (io?.editorPanel) return { panel: io.editorPanel, params: { doc: value } };
  return { returnType: io?.returnType ?? kind, data: artifactViewerData(kind, value) };
}

/** What a viewer of an artifact of `kind` renders, for every path that opens one. */
export function artifactViewerData(kind: string, value: unknown): unknown {
  const io = ioKindByName(kind);
  return io?.toViewerData ? io.toViewerData(value) : value;
}
