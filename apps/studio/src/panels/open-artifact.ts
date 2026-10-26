import { artifactOpening } from "../io-kinds";
import { openOutputAsPanel } from "./pipeline-bridge";
import { addPanelToDockview } from "./registry";

/** Open a stored artifact value where its kind belongs: its own panel, or the generic viewer. */
export function openArtifact(kind: string, value: unknown) {
  const opening = artifactOpening(kind, value);
  if ("panel" in opening) addPanelToDockview(opening.panel, undefined, opening.params);
  else openOutputAsPanel(opening.returnType, opening.data);
}
