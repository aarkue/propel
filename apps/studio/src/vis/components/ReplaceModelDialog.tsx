import { AlertDialog, Button, Flex } from "@r4pm/components/ui";

/** Asked before discovery replaces a model that was edited or opened from a file. */
export function ReplaceModelDialog({
  open,
  onOpenChange,
  onReplace,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReplace: () => void;
  onAdd: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Content maxWidth="440px">
        <AlertDialog.Title>Replace the model?</AlertDialog.Title>
        <AlertDialog.Description size="2">
          Replace discards the current model. Add to model keeps it and adds the new constraints.
        </AlertDialog.Description>
        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button variant="soft" onClick={onAdd}>
              Add to model
            </Button>
          </AlertDialog.Action>
          <AlertDialog.Action>
            <Button color="red" onClick={onReplace}>
              Replace
            </Button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
