import { Button, Dialog, Flex, Text } from "@r4pm/components/ui";
import type { ImportCandidate } from "../data-import";

/** Shown when a dropped file can be loaded as more than one registry kind. */
export function KindPickerDialog({
  filename,
  candidates,
  onPick,
  onCancel,
}: {
  filename: string | null;
  candidates: ImportCandidate[];
  onPick: (c: ImportCandidate) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog.Root
      open={filename !== null}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <Dialog.Content maxWidth="420px" data-testid="kind-picker">
        <Dialog.Title>Import “{filename}” as...</Dialog.Title>
        <Dialog.Description size="2" color="gray">
          More than one kind can load this file. Choose how to interpret it.
        </Dialog.Description>
        <Flex direction="column" gap="2" mt="3">
          {candidates.map((c) => (
            <Button key={c.kind} variant="soft" data-testid={`pick-kind-${c.kind}`} onClick={() => onPick(c)}>
              {c.kind}
              <Text size="1" color="gray" ml="1">
                (.{c.ext})
              </Text>
            </Button>
          ))}
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
