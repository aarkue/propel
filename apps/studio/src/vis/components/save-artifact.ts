import { backend } from "../../backends";
import { uniqueArtifactName, useArtifacts } from "../../stores";

/** Id `<idBase> N`, display label `label`. */
export async function saveArtifact(
  idBase: string,
  label: string,
  kind: string,
  bytes: Uint8Array,
  ext: string,
) {
  const id = uniqueArtifactName(idBase);
  const uniqueLabel = label === idBase ? id : uniqueArtifactName(label);
  await backend.loadArtifactBytes(id, kind, bytes, ext);
  // The artifacts-changed sync may not have listed it yet. addArtifact upserts either way.
  useArtifacts.getState().addArtifact({ id, kind, label: uniqueLabel });
}
