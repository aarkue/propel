import { backend } from "../../backends";
import { loadArtifactCached } from "../../persistence/session";
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
  // Through the cache, so a wasm reload can restore the saved model.
  await loadArtifactCached(backend, { id, kind, format: ext, label: uniqueLabel }, bytes);
  // The artifacts-changed sync may not have listed it yet. addArtifact upserts either way.
  useArtifacts.getState().addArtifact({ id, kind, label: uniqueLabel });
}
