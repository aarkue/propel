import { OCDFGViewer, type OCDFGViewerProps } from "@r4pm/components";
import { useReflowAnnotations } from "./reflow-annotations";

/** OC-DFG viewer. rust4pm lays it out and draws its export through the backend passed as
 *  `ViewerConfig.viz` (set by `AppViewerConfig`). */
export function OCDFGPanel(props: OCDFGViewerProps) {
  const { badges, picker } = useReflowAnnotations(props.handle);
  return (
    <OCDFGViewer
      {...props}
      badges={badges}
      topLeftExtra={picker && <div style={{ marginTop: 8 }}>{picker}</div>}
    />
  );
}
