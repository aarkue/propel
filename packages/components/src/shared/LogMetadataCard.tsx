import { Badge, Card, Text } from "@r4pm/components/ui";
import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";

// Local view-models mirror the generated @r4pm/client types.
interface LogExtensionInfo {
  name: string;
  prefix: string;
  uri: string;
}

interface LogClassifierInfo {
  name: string;
  keys: string[];
}

export interface LogGlobals {
  attributes: Record<string, string>;
  extensions: LogExtensionInfo[];
  classifiers: LogClassifierInfo[];
  global_trace_attrs: Record<string, string>;
  global_event_attrs: Record<string, string>;
}

/** Collapsible "log at a glance" card: attributes, extensions, classifiers, and global
 *  trace/event attributes from an event log's globals. Renders nothing when `globals` is
 *  absent or carries no metadata. Backend-free: pass a `LogGlobals` from the engine. */
export function LogMetadataCard({ globals }: { globals?: LogGlobals }) {
  const [open, setOpen] = useState(false);
  if (!globals) return null;

  const hasAttrs = Object.keys(globals.attributes).length > 0;
  const hasExt = globals.extensions.length > 0;
  const hasCls = globals.classifiers.length > 0;
  const hasGlobTrace = Object.keys(globals.global_trace_attrs).length > 0;
  const hasGlobEvent = Object.keys(globals.global_event_attrs).length > 0;
  const any = hasAttrs || hasExt || hasCls || hasGlobTrace || hasGlobEvent;
  if (!any) return null;

  return (
    <Card className="mb-2">
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <FaChevronDown /> : <FaChevronRight />}
        <Text size="2" weight="bold">
          Log Metadata
        </Text>
        <Text size="1" color="gray">
          ({Object.keys(globals.attributes).length} attrs, {globals.extensions.length} extensions,{" "}
          {globals.classifiers.length} classifiers)
        </Text>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-3 text-sm">
          {hasAttrs && (
            <div>
              <Text size="2" weight="medium">
                Attributes
              </Text>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(globals.attributes).map(([k, v]) => (
                  <Badge key={k} variant="outline" color="gray" size="1">
                    {k}: {v}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {hasExt && (
            <div>
              <Text size="2" weight="medium">
                Extensions
              </Text>
              <div className="flex flex-wrap gap-1 mt-1">
                {globals.extensions.map((e) => (
                  <Badge key={e.name} variant="soft" color="blue" size="1" title={e.uri}>
                    {e.prefix}: {e.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {hasCls && (
            <div>
              <Text size="2" weight="medium">
                Classifiers
              </Text>
              <div className="flex flex-wrap gap-1 mt-1">
                {globals.classifiers.map((c) => (
                  <Badge key={c.name} variant="soft" color="plum" size="1" title={c.keys.join(", ")}>
                    {c.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {hasGlobTrace && (
            <div>
              <Text size="2" weight="medium">
                Global Trace Attributes
              </Text>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(globals.global_trace_attrs).map(([k, v]) => (
                  <Badge key={k} variant="outline" color="gray" size="1">
                    {k}: {v}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {hasGlobEvent && (
            <div>
              <Text size="2" weight="medium">
                Global Event Attributes
              </Text>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(globals.global_event_attrs).map(([k, v]) => (
                  <Badge key={k} variant="outline" color="gray" size="1">
                    {k}: {v}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
