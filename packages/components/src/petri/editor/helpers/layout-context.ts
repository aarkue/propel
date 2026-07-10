import { useViewerConfig } from "../../../viewer/viewer-config";
import { noopPetriLayout, type PetriLayoutFn } from "./layout-graph";

/**
 * The Petri-net layout fn for the current subtree, read from `ViewerConfig.layout.petri` (set via
 * `ViewerConfigProvider`) with the engine-agnostic no-op as fallback. Every Petri surface (editor,
 * viewer, simulator) picks it up without threading a prop; a viewer/editor's explicit `layoutOverride`
 * still wins. Supply an engine bundle (`@r4pm/components/elk-layout` or
 * `@r4pm/components/rust-layout/wasm`) through the provider for a real layout.
 */
export const usePetriLayout = (): PetriLayoutFn => useViewerConfig({}).layout?.petri ?? noopPetriLayout;
