// What a blueprint with no nodes shows. One step at a time: connect a source, then pick a table.
// A blank canvas plus a toolbar left the first step to be guessed.
import { Button, Text } from "@r4pm/components/ui";
import { PiArrowRight } from "react-icons/pi";
import type { ExtractionCatalog } from "../types";
import { TableList, type TableRef } from "./AddTableMenu";

const CARD: React.CSSProperties = {
  background: "var(--color-panel-solid)",
  border: "1px solid var(--gray-a6)",
  boxShadow: "0 8px 28px -12px rgba(0,0,0,0.28)",
};

export interface EmptyStateProps {
  catalog: ExtractionCatalog;
  hasConnection: boolean;
  onAddTable: (ref: TableRef) => void;
  onConnect: () => void;
  /** False when the build can open no source at all. A build without a database connector can
   *  still read a dropped file, so this is about capability, not about being wasm. */
  canConnect?: boolean;
}

export function EmptyState({
  catalog,
  hasConnection,
  onAddTable,
  onConnect,
  canConnect = true,
}: EmptyStateProps) {
  if (!canConnect) {
    return (
      <div className="pointer-events-auto flex w-[420px] flex-col gap-2 rounded-xl p-4" style={CARD}>
        <Text size="3" weight="medium">
          No data source available
        </Text>
        <Text as="p" size="2" color="gray" className="leading-snug">
          This build can't open a source. You can still load, validate and compile a blueprint here.
        </Text>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto flex w-[420px] flex-col gap-3 rounded-xl p-4" style={CARD}>
      <div>
        <Text size="3" weight="medium">
          Build an OCEL log
        </Text>
        <Text as="p" size="2" color="gray" className="mt-1 leading-snug">
          {hasConnection
            ? "Pick a table. Its rows become events, objects or relations."
            : "Drop a database file on the canvas, or connect a source to begin."}
        </Text>
      </div>

      {hasConnection ? (
        <TableList catalog={catalog} onSelect={onAddTable} />
      ) : (
        <Button size="2" onClick={onConnect}>
          Connect a source <PiArrowRight />
        </Button>
      )}
    </div>
  );
}
