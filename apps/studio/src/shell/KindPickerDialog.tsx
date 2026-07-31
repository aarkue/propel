import { Button, Dialog, Flex, Text } from "@r4pm/components/ui";
import type { ReactNode } from "react";
import { PiDatabase, PiFileArrowUp } from "react-icons/pi";
import type { ImportCandidate } from "../data-import";

/** Shown when a dropped file can be loaded as more than one registry kind, or when it can be
 *  either loaded as a dataset or opened as the data an extraction reads. */
export function KindPickerDialog({
  filename,
  candidates,
  onPick,
  onPickSource,
  onCancel,
}: {
  filename: string | null;
  candidates: ImportCandidate[];
  onPick: (c: ImportCandidate) => void;
  /** Offered only for a file the extractor can open, and only when its real path is known --
   *  extraction connects to the file where it lies and never reads bytes through JS. */
  onPickSource?: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog.Root
      open={filename !== null}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <Dialog.Content maxWidth={onPickSource ? "560px" : "420px"} data-testid="kind-picker">
        <Dialog.Title>Open “{filename}”</Dialog.Title>
        <Dialog.Description size="2" color="gray">
          {onPickSource
            ? "This file can be a finished log, or the data you build one from."
            : "More than one kind can load this file. Choose how to interpret it."}
        </Dialog.Description>

        <div className={onPickSource ? "mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" : "mt-3"}>
          <PickerColumn
            icon={<PiFileArrowUp size={20} />}
            title="As a dataset"
            detail="Load it as a finished log and start exploring."
            accent="indigo"
            bare={!onPickSource}
          >
            {candidates.map((c) => (
              <Button
                key={c.kind}
                variant="soft"
                data-testid={`pick-kind-${c.kind}`}
                onClick={() => onPick(c)}
              >
                {c.kind}
                <Text size="1" color="gray" ml="1">
                  (.{c.ext})
                </Text>
              </Button>
            ))}
          </PickerColumn>

          {onPickSource && (
            <PickerColumn
              icon={<PiDatabase size={20} />}
              title="As a data source"
              detail="Build an OCEL log from its tables with a blueprint."
              accent="jade"
            >
              <Button variant="soft" color="jade" data-testid="pick-source" onClick={onPickSource}>
                Start a blueprint
              </Button>
            </PickerColumn>
          )}
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

/** One side of the choice. `bare` drops the framing for the single-column case, which is the
 *  plain "which kind?" dialog this has always been. */
function PickerColumn({
  icon,
  title,
  detail,
  accent,
  bare,
  children,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  accent: string;
  bare?: boolean;
  children: ReactNode;
}) {
  if (bare) {
    return (
      <Flex direction="column" gap="2">
        {children}
      </Flex>
    );
  }
  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{ border: "1px solid var(--gray-a5)", background: "var(--gray-a2)" }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: `var(--${accent}-11)` }}>{icon}</span>
        <Text size="2" weight="medium">
          {title}
        </Text>
      </div>
      <Text size="1" color="gray" className="leading-snug">
        {detail}
      </Text>
      <Flex direction="column" gap="2" mt="1">
        {children}
      </Flex>
    </div>
  );
}
