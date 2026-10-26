import Editor, { type TreeEditorProps } from "./process-tree/editor/Editor";
import type { ViewerProps } from "./viewer/viewer-config";
import type { ProcessTree } from "./viz/types";

export type { ProcessTree, ProcessTreeNode, ProcessTreeOperatorType } from "./viz/types";

export interface ProcessTreeViewerProps
  extends ViewerProps<ProcessTree>,
    Pick<TreeEditorProps, "editable" | "onChange" | "nodeOverlay" | "exportKey"> {}

/** Renders a rust4pm process tree, optionally editable, laid out and exported by rust4pm through
 *  `viz` (or `ViewerConfig.viz`). */
export function ProcessTreeViewer({
  data,
  editable,
  onChange,
  nodeOverlay,
  exportKey,
  viz,
}: ProcessTreeViewerProps) {
  return (
    <Editor
      tree={data}
      editable={editable}
      onChange={onChange}
      nodeOverlay={nodeOverlay}
      exportKey={exportKey}
      viz={viz}
    />
  );
}
