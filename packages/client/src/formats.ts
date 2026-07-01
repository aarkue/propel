import type { ItemKindInfo } from "./index";

/** Export formats the engine advertises for one registry kind (drives the export menu). */
export function exportFormatsFor(kinds: ItemKindInfo[], kind: string): { ext: string; mime: string }[] {
  return (kinds.find((i) => i.kind === kind)?.export_formats ?? []).map((f) => ({
    ext: f.extension,
    mime: f.mime,
  }));
}
