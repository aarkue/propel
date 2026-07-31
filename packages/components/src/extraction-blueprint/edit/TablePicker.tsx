import { Combobox } from "@r4pm/components/ui";
import { useEditContext } from "./edit-context";

/** Source-id combobox: `Object.keys(connections)` -- the editor doesn't invent source ids, the
 *  user names them when editing the connections map (`ConnectionsDialog`). */
export function SourceIdPicker({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (v: string) => void;
}) {
  const edit = useEditContext();
  const options = Object.keys(edit?.connections ?? {});
  return (
    <Combobox
      value={value}
      options={options}
      onValueChange={onValueChange}
      allowCreate
      placeholder="source id..."
      size="1"
    />
  );
}

/** Table combobox scoped to `catalog.tables[sourceId]`. */
export function TablePicker({
  sourceId,
  value,
  onValueChange,
}: {
  sourceId: string;
  value: string;
  onValueChange: (v: string) => void;
}) {
  const edit = useEditContext();
  const options = Object.keys(edit?.catalog.tables[sourceId] ?? {});
  return (
    <Combobox
      value={value}
      options={options}
      onValueChange={onValueChange}
      allowCreate
      placeholder="table..."
      size="1"
    />
  );
}

// `ColumnPicker` used to live here as a thin `Combobox`. It now has its own file: a column needs
// its type and a sample of its real values shown next to the name, which a list of bare strings
// cannot do. Re-exported from here so existing imports keep working.
export { ColumnPicker } from "./ColumnPicker";
export type { ColumnPickerProps } from "./ColumnPicker";
