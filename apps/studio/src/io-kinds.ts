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
}

export const IO_KINDS: IoKind[] = [
  {
    kind: "PetriNet",
    import_formats: [
      { extension: "pnml", mime: "text/plain" },
      { extension: "apnml", mime: "text/plain" },
    ],
    export_formats: [{ extension: "pnml", mime: "text/plain" }],
    returnType: "PetriNet",
  },
];

export function ioKindByName(kind: string): IoKind | undefined {
  return IO_KINDS.find((k) => k.kind === kind);
}
