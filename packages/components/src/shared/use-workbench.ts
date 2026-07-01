import { useCallback, useEffect, useRef, useState } from "react";

export type WorkbenchMode = "view" | "simulate" | "edit";

/** State shared by the Petri / OCPN workbenches: the active mode, the current
 *  (possibly edited) net, and a stable edit seed snapshotted at view->edit so live
 *  edits never remount the editor. Call `enterEdit()` before switching to "edit". */
export function useWorkbench<T>(
  data: T,
  onNetChange?: (net: T) => void,
  initialMode: WorkbenchMode = "view",
) {
  const [mode, setMode] = useState<WorkbenchMode>(initialMode);
  const [currentNet, setCurrentNet] = useState<T>(data);
  const [editSeed, setEditSeed] = useState<T>(data);

  // A new incoming net (new discovery / artifact) resets any edits.
  useEffect(() => {
    setCurrentNet(data);
    setEditSeed(data);
  }, [data]);

  const onNetChangeRef = useRef(onNetChange);
  onNetChangeRef.current = onNetChange;
  const handleEdit = useCallback((net: T) => {
    setCurrentNet(net);
    onNetChangeRef.current?.(net);
  }, []);

  const enterEdit = useCallback(() => setEditSeed(currentNet), [currentNet]);

  return { mode, setMode, currentNet, editSeed, handleEdit, enterEdit };
}
