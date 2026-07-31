import { Button, IconButton } from "@r4pm/components/ui";
import { PiX } from "react-icons/pi";

/** The one way to remove something from a list in this editor. `PiTrash` is reserved for the two
 *  places that destroy a whole node or document (the node context menu, the toolbar's Clear), so
 *  the two weights stay distinguishable.
 *
 *  `withLabel` spells the action out, for a row inside an expanded panel where a bare icon would
 *  not say what it removes. Same icon and colour either way. */
export function RemoveButton({
  label,
  disabled,
  withLabel,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  withLabel?: boolean;
  onClick: () => void;
}) {
  if (withLabel) {
    return (
      <Button size="1" variant="ghost" color="red" disabled={disabled} onClick={onClick}>
        <PiX /> {label}
      </Button>
    );
  }
  return (
    <IconButton
      size="1"
      variant="ghost"
      color="red"
      disabled={disabled}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <PiX />
    </IconButton>
  );
}
