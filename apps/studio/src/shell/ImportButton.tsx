import { kindColor } from "@r4pm/components";
import { Button, DropdownMenu } from "@r4pm/components/ui";
import type { ItemKindInfo } from "@r4pm/client";
import type { IconType } from "react-icons";
import {
  PiArrowsSplit,
  PiFile,
  PiFolderOpen,
  PiGraph,
  PiListChecks,
  PiRows,
  PiShareNetwork,
  PiTreeStructure,
  PiTreeView,
  PiUploadSimple,
} from "react-icons/pi";
import { kindName } from "../file-kind";
import { ioKindByName } from "../io-kinds";
import { isModelKind } from "../models";
import { useImport } from "./import-context";

const KIND_ICON: Record<string, IconType> = {
  EventLog: PiRows,
  SlimLinkedOCEL: PiGraph,
  OCEL: PiGraph,
  IndexLinkedOCEL: PiGraph,
  AcceptingPetriNet: PiTreeStructure,
  ProcessTree: PiTreeView,
  ObjectCentricPetriNet: PiShareNetwork,
  OCDeclare: PiListChecks,
  ReflowMapping: PiArrowsSplit,
};

const isModel = (k: ItemKindInfo) => isModelKind(k.kind) || !!ioKindByName(k.kind);

function Entry({
  icon: Icon,
  color,
  name,
  detail,
}: {
  icon: IconType;
  color: string;
  name: string;
  detail: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-md"
        style={{ background: `var(--${color}-a3)`, color: `var(--${color}-11)` }}
      >
        <Icon size={16} />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-medium">{name}</span>
        <span className="max-w-[20rem] truncate text-xs text-[var(--gray-a10)]">{detail}</span>
      </span>
    </span>
  );
}

/** "Import" menu: open any file, or pick its type first. */
export function ImportButton({ variant = "solid" }: { variant?: "solid" | "soft" }) {
  const { importableKinds, importKind, openFile } = useImport();
  const groups = [
    { title: "Logs", kinds: importableKinds.filter((k) => !isModel(k)) },
    { title: "Models", kinds: importableKinds.filter(isModel) },
  ].filter((g) => g.kinds.length > 0);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button size="2" variant={variant} data-testid="import-menu">
          <PiUploadSimple />
          <span className="hidden sm:inline">Import</span>
          <DropdownMenu.TriggerIcon className="hidden sm:block" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className="min-w-[17rem]">
        <DropdownMenu.Item
          data-testid="import-open-file"
          onSelect={() => openFile()}
          className="!h-auto !py-1.5"
        >
          <Entry
            icon={PiFolderOpen}
            color="indigo"
            name="Open file..."
            detail="Detects the type from the file"
          />
        </DropdownMenu.Item>
        {groups.map((g) => (
          <DropdownMenu.Group key={g.title}>
            <DropdownMenu.Separator />
            <DropdownMenu.Label>{g.title}</DropdownMenu.Label>
            {g.kinds.map((k) => (
              <DropdownMenu.Item
                key={k.kind}
                data-testid={`import-kind-${k.kind}`}
                onSelect={() => importKind(k)}
                className="!h-auto !py-1.5"
              >
                <Entry
                  icon={KIND_ICON[k.kind] ?? PiFile}
                  color={kindColor(k.kind)}
                  name={kindName(k.kind)}
                  detail={k.import_formats.map((f) => `.${f.extension}`).join(" ")}
                />
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Group>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
