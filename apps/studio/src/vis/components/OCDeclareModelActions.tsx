import {
  type DeclareFlowModel,
  fromModelFile,
  OC_DECLARE_FILE_EXTENSION,
  toModelFile,
} from "@r4pm/components";
import { Button } from "@r4pm/components/ui";
import toast from "react-hot-toast";
import { backend } from "../../backends";
import { uniqueArtifactName } from "../../stores";

/** Import, save-as-artifact and export of an OC-DECLARE model, in the file format that keeps the layout. */
export function OCDeclareModelActions({
  model,
  onLoad,
}: {
  model: DeclareFlowModel;
  onLoad: (model: DeclareFlowModel) => void;
}) {
  const bytes = () => new TextEncoder().encode(JSON.stringify(toModelFile(model), null, 2));
  const importFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `.${OC_DECLARE_FILE_EXTENSION},.json`;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        onLoad(fromModelFile(JSON.parse(await file.text())));
      } catch {
        toast.error("Not an OC-DECLARE model");
      }
    };
    input.click();
  };
  return (
    <>
      <Button size="1" variant="soft" onClick={importFile}>
        Import
      </Button>
      <Button
        size="1"
        variant="soft"
        onClick={async () => {
          try {
            await backend.loadArtifactBytes(
              uniqueArtifactName("OC-DECLARE model"),
              "OCDeclare",
              bytes(),
              `.${OC_DECLARE_FILE_EXTENSION}`,
            );
          } catch (e) {
            toast.error(`Save failed: ${String(e)}`);
          }
        }}
      >
        Save
      </Button>
      <Button
        size="1"
        variant="soft"
        onClick={() =>
          void backend.saveBytes(bytes(), `model.${OC_DECLARE_FILE_EXTENSION}`, "application/json")
        }
      >
        Export
      </Button>
    </>
  );
}
