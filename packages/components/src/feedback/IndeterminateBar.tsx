/** Thin animated bar pinned to the top edge of its (positioned) container. Signals
 *  in-flight work without occupying layout space. Driven by CSS keyframes in styles.css. */
export function IndeterminateBar({ className }: { className?: string }) {
  return (
    <div className={`r4pm-indet-track ${className ?? ""}`} role="progressbar" aria-label="Loading">
      <div className="r4pm-indet-bar" />
    </div>
  );
}
