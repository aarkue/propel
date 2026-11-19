/** Font size in px of a transition's label: smaller for longer labels, from 14 down to 8. */
export const transitionLabelSize = (label: string | null | undefined) =>
  Math.min(Math.max(300 / Math.max(1, label?.length ?? 1), 8), 14);

/** A transition's label as `renderContent` draws it, sized like the default label, with room below. */
export function TransitionLabel({
  label,
  marginBottom,
  fontWeight,
  title,
}: {
  label: string;
  marginBottom: number;
  fontWeight?: number;
  title?: string;
}) {
  return (
    <div
      title={title}
      style={{
        maxWidth: "6rem",
        marginBottom,
        textAlign: "center",
        fontWeight,
        lineHeight: 1.15,
        overflowWrap: "break-word",
        fontSize: `${transitionLabelSize(label)}px`,
      }}
    >
      {label}
    </div>
  );
}
