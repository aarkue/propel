import { Button, DropdownMenu, Text } from "@r4pm/components/ui";
import { PiUploadSimple } from "react-icons/pi";
import { useImport } from "./import-context";

/** "Import" dropdown listing every importable registry kind (import per registry item). */
export function ImportButton({ variant = "solid" }: { variant?: "solid" | "soft" }) {
  const { importableKinds, importKind } = useImport();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button size="2" variant={variant} data-testid="import-menu">
          <PiUploadSimple />
          <span className="hidden sm:inline">Import</span>
          <DropdownMenu.TriggerIcon />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {importableKinds.length === 0 && <DropdownMenu.Item disabled>No importable kinds</DropdownMenu.Item>}
        {importableKinds.map((k) => (
          <DropdownMenu.Item
            key={k.kind}
            data-testid={`import-kind-${k.kind}`}
            onSelect={() => importKind(k)}
          >
            {k.kind}
            <Text size="1" color="gray" ml="2">
              {k.import_formats.map((f) => `.${f.extension}`).join(" ")}
            </Text>
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
