import { useViewerConfig, type AlignmentStyle } from "../viewer/viewer-config";
import { TraceAlignmentStrip, type ResolvedMove } from "./TraceAlignmentStrip";
import { DeviationAlignmentStrip } from "./DeviationAlignmentStrip";

/**
 * Alignment strip that auto-switches between the two styles so callers do not choose one. The style
 * comes from the surrounding `ViewerConfigProvider`'s `alignmentStyle` (default "trace"); pass
 * `variant` to force a style regardless of config. `exportKey` is forwarded to whichever strip
 * renders; both advertise a true vector SVG to a surrounding `ViewerExportFrame`.
 */
export function AlignmentStrip({
  moves,
  colorOf,
  exportKey,
  variant,
  singleLine,
}: {
  moves: ResolvedMove[];
  colorOf?: (activity: string) => string;
  exportKey?: string;
  variant?: AlignmentStyle;
  singleLine?: boolean;
}) {
  const { alignmentStyle } = useViewerConfig({ alignmentStyle: variant });
  if ((alignmentStyle ?? "trace") === "deviation") {
    return (
      <DeviationAlignmentStrip
        moves={moves}
        colorOf={colorOf}
        exportKey={exportKey}
        singleLine={singleLine}
      />
    );
  }
  return (
    <TraceAlignmentStrip moves={moves} colorOf={colorOf} exportKey={exportKey} singleLine={singleLine} />
  );
}
