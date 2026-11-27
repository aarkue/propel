/**
 * The suggested file name for exporting an object labelled `label` as `ext`: the label without the
 * extension it was imported with, minus characters a file name cannot hold (Windows rejects the most).
 */
export function exportFileName(label: string, ext: string): string {
  const stem = label
    .replace(/(\.[a-z][a-z0-9]{1,7}){1,2}$/i, "")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.-]+|[\s.-]+$/g, "")
    .slice(0, 120);
  return `${stem || "export"}.${ext}`;
}

/**
 * Save dialogs handle one-part extensions only: Windows' default extension breaks on `xes.gz`, so
 * the dialog filters on its last part.
 */
export function dialogExtension(ext: string): string {
  return ext.split(".").pop() ?? ext;
}

/**
 * Completes a compound extension the dialog cut short (`log.xes` for `xes.gz` becomes `log.xes.gz`),
 * so the file can be imported again. Any other name is the user's choice and stays.
 */
export function completeExtension(path: string, ext: string): string {
  const parts = ext.split(".");
  const lower = path.toLowerCase();
  if (lower.endsWith(`.${ext.toLowerCase()}`)) return path;
  for (let k = parts.length - 1; k >= 1; k--) {
    if (lower.endsWith(`.${parts.slice(0, k).join(".").toLowerCase()}`)) {
      return `${path}.${parts.slice(k).join(".")}`;
    }
  }
  return path;
}
