import Editor, { type TreeEditorProps } from "./process-tree/editor/Editor";
import type { ProcessTree } from "./process-tree/tree";
import type { ViewerProps } from "./viewer/viewer-config";

export type {
  EditableNode,
  EditableTree,
  LeafLabel,
  OperatorType,
  ProcessTree,
  PTNode,
} from "./process-tree/tree";

export interface ProcessTreeViewerProps
  extends ViewerProps<ProcessTree>,
    Pick<TreeEditorProps, "editable" | "onChange" | "renderSvg" | "nodeOverlay" | "exportKey"> {}

/** Renders a process tree, optionally editable. Layout comes from `ViewerConfig.layout.processTree`. */
export function ProcessTreeViewer({
  data,
  editable,
  onChange,
  renderSvg,
  nodeOverlay,
  exportKey,
}: ProcessTreeViewerProps) {
  return (
    <Editor
      tree={data}
      editable={editable}
      onChange={onChange}
      renderSvg={renderSvg}
      nodeOverlay={nodeOverlay}
      exportKey={exportKey}
    />
  );
}
