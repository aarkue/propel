import { useViewerConfig } from "../../../viewer/viewer-config";
import { noopProcessTreeLayout, type ProcessTreeLayoutFn } from "./layout-graph";

/** The process-tree layout fn from `ViewerConfig.layout.processTree`, falling back to the engine-agnostic no-op. */
export const useProcessTreeLayout = (): ProcessTreeLayoutFn =>
  useViewerConfig({}).layout?.processTree ?? noopProcessTreeLayout;
