import { useViewerConfig } from "../../../viewer/viewer-config";
import { noopPetriLayout, type PetriLayoutFn } from "./layout-graph";

/** The Petri-net layout fn from `ViewerConfig.layout.petri`, falling back to the engine-agnostic no-op. */
export const usePetriLayout = (): PetriLayoutFn => useViewerConfig({}).layout?.petri ?? noopPetriLayout;
