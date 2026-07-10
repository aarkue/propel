import { AlignmentStrip, type ResolvedMove } from "@r4pm/components";
import {
  Badge,
  Button,
  Dialog,
  Flex,
  ScrollArea,
  SegmentedControl,
  Switch,
  Text,
  TextField,
} from "@r4pm/components/ui";
import { useMemo, useState } from "react";
import { makeColorResolver, usePreferences } from "../stores";

const SCOPE_LABELS: Record<string, string> = {
  activity: "Activities",
  objectType: "Object types",
};

/** Split a `"scope:key"` override key back into its parts (keys may contain further colons). */
function split(k: string): [string, string] {
  const i = k.indexOf(":");
  return [k.slice(0, i), k.slice(i + 1)];
}

type SectionId = "display" | "import" | "colors";

const SECTIONS: { id: SectionId; label: string; hint: string }[] = [
  { id: "display", label: "Display", hint: "Formatting" },
  { id: "import", label: "Import", hint: "Data types" },
  { id: "colors", label: "Colors", hint: "Palette" },
];

const MOVES: ResolvedMove[] = [
  { kind: "sync", label: "a", hidden: false },
  { kind: "log", label: "b", hidden: false },
  { kind: "model", label: "c", hidden: false },
  { kind: "sync", label: "d", hidden: false },
];

/** Preferences editor: a left section rail (Display / Import / Colors) over a content pane. The
 *  Colors pane doubles as a live legend of every encountered activity / object type, editable inline. */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const durationStyle = usePreferences((s) => s.durationStyle);
  const setDurationStyle = usePreferences((s) => s.setDurationStyle);
  const alignmentStyle = usePreferences((s) => s.alignmentStyle);
  const setAlignmentStyle = usePreferences((s) => s.setAlignmentStyle);
  const layoutEngine = usePreferences((s) => s.layoutEngine);
  const setLayoutEngine = usePreferences((s) => s.setLayoutEngine);
  const dfgRouting = usePreferences((s) => s.dfgRouting);
  const setDfgRouting = usePreferences((s) => s.setDfgRouting);
  const colorOverrides = usePreferences((s) => s.colorOverrides);
  const knownColorKeys = usePreferences((s) => s.knownColorKeys);
  const setColor = usePreferences((s) => s.setColor);
  const clearColor = usePreferences((s) => s.clearColor);
  const showExpertKinds = usePreferences((s) => s.showExpertKinds);
  const setShowExpertKinds = usePreferences((s) => s.setShowExpertKinds);

  const [section, setSection] = useState<SectionId>("display");
  const [colorSearch, setColorSearch] = useState("");

  const overrides = Object.entries(colorOverrides);
  const resolve = useMemo(() => makeColorResolver(colorOverrides), [colorOverrides]);

  // Union of every seen key and any override (an override may exist for a not-yet-rendered key),
  // grouped by scope and filtered by the search box.
  const grouped = useMemo(() => {
    const allKeys = new Set([...Object.keys(knownColorKeys), ...Object.keys(colorOverrides)]);
    const q = colorSearch.trim().toLowerCase();
    const groups = new Map<string, Array<{ k: string; scope: string; key: string }>>();
    for (const k of allKeys) {
      const [scope, key] = split(k);
      if (q && !key.toLowerCase().includes(q) && !scope.toLowerCase().includes(q)) continue;
      const list = groups.get(scope) ?? [];
      list.push({ k, scope, key });
      groups.set(scope, list);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([scope, items]) => ({
        scope,
        items: items.sort((a, b) => a.key.localeCompare(b.key)),
      }));
  }, [knownColorKeys, colorOverrides, colorSearch]);
  const totalKeys = useMemo(
    () => new Set([...Object.keys(knownColorKeys), ...Object.keys(colorOverrides)]).size,
    [knownColorKeys, colorOverrides],
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Content maxWidth="840px" style={{ padding: 0, overflow: "hidden" }}>
        <Dialog.Title style={{ margin: 0 }} className="sr-only">
          Preferences
        </Dialog.Title>
        <Flex style={{ minHeight: 420 }}>
          {/* Section rail */}
          <Flex
            direction="column"
            style={{
              width: 168,
              flex: "0 0 auto",
              borderRight: "1px solid var(--gray-a4)",
              background: "var(--gray-a2)",
              padding: 12,
            }}
          >
            <Text size="3" weight="bold" mb="3" ml="1" style={{ letterSpacing: "-0.01em" }}>
              Preferences
            </Text>
            <Flex direction="column" gap="1">
              {SECTIONS.map((s) => {
                const active = s.id === section;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSection(s.id)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      textAlign: "left",
                      padding: "7px 10px",
                      borderRadius: 7,
                      cursor: "pointer",
                      border: "none",
                      background: active ? "var(--accent-a3)" : "transparent",
                      color: active ? "var(--accent-11)" : "var(--gray-11)",
                      transition: "background 120ms ease, color 120ms ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = "var(--gray-a3)";
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Text size="2" weight={active ? "bold" : "medium"}>
                      {s.label}
                    </Text>
                    <Text
                      size="1"
                      style={{ color: active ? "var(--accent-11)" : "var(--gray-9)", opacity: 0.85 }}
                    >
                      {s.hint}
                    </Text>
                  </button>
                );
              })}
            </Flex>
          </Flex>

          {/* Content pane */}
          <Flex direction="column" style={{ flex: 1, minWidth: 0 }}>
            <ScrollArea type="auto" scrollbars="vertical" style={{ flex: 1 }}>
              <div style={{ padding: 20 }}>
                {section === "display" && (
                  <Flex direction="column" gap="6">
                    <SectionBlock title="Duration format" hint="How time spans are shown across all viewers.">
                      <SegmentedControl.Root
                        value={durationStyle}
                        onValueChange={(v) => setDurationStyle(v === "long" ? "long" : "short")}
                      >
                        <SegmentedControl.Item value="short">Short (2h 5m)</SegmentedControl.Item>
                        <SegmentedControl.Item value="long">Long (2 hours 5 minutes)</SegmentedControl.Item>
                      </SegmentedControl.Root>
                    </SectionBlock>
                    <SectionBlock
                      title="Alignment style"
                      hint="How conformance alignments are drawn wherever an alignment strip appears."
                    >
                      <SegmentedControl.Root
                        value={alignmentStyle}
                        onValueChange={(v) => setAlignmentStyle(v === "deviation" ? "deviation" : "trace")}
                      >
                        <SegmentedControl.Item value="trace">Trace (log / model rows)</SegmentedControl.Item>
                        <SegmentedControl.Item value="deviation">
                          Deviation (central axis)
                          <br />
                        </SegmentedControl.Item>
                      </SegmentedControl.Root>
                      <Flex className="h-20 mt-4" gap="4" align="center">
                        <Text size="1" color="gray">
                          Preview:
                        </Text>
                        <AlignmentStrip moves={MOVES} variant={alignmentStyle} />
                      </Flex>
                    </SectionBlock>
                    <SectionBlock
                      title="Layout engine"
                      hint="Which engine positions graph nodes in the DFG, OC-DFG, Petri net, and OC-declare viewers. ELK does not re-layout on drag; Rust is tuned and re-layouts stably on drag (and its SVG export is byte-identical to the on-screen graph)."
                    >
                      <SegmentedControl.Root
                        value={layoutEngine}
                        onValueChange={(v) => setLayoutEngine(v === "rust" ? "rust" : "elk")}
                      >
                        <SegmentedControl.Item value="elk">ELK</SegmentedControl.Item>
                        <SegmentedControl.Item value="rust">Rust (default)</SegmentedControl.Item>
                      </SegmentedControl.Root>
                    </SectionBlock>
                    {layoutEngine === "rust" && (
                      <SectionBlock
                        title="DFG edge routing"
                        hint="How the Rust engine routes DFG / OC-DFG edges. Diagonal draws flowing edges; Orthogonal draws straight vertical channels with L-bends (ELK-like)."
                      >
                        <SegmentedControl.Root
                          value={dfgRouting}
                          onValueChange={(v) => setDfgRouting(v === "orthogonal" ? "orthogonal" : "diagonal")}
                        >
                          <SegmentedControl.Item value="diagonal">Diagonal (default)</SegmentedControl.Item>
                          <SegmentedControl.Item value="orthogonal">Orthogonal</SegmentedControl.Item>
                        </SegmentedControl.Root>
                      </SectionBlock>
                    )}
                  </Flex>
                )}

                {section === "import" && (
                  <SectionBlock
                    title="Expert import types"
                    hint="Off by default. Imports use the curated SlimLinkedOCEL / EventLog."
                  >
                    <Flex
                      align="center"
                      justify="between"
                      gap="3"
                      style={{
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--gray-a4)",
                        background: "var(--gray-a2)",
                      }}
                    >
                      <Text size="2" color="gray" style={{ flex: 1 }}>
                        Show advanced representations (raw OCEL, IndexLinkedOCEL, activity projection) when
                        importing files.
                      </Text>
                      <Switch checked={showExpertKinds} onCheckedChange={setShowExpertKinds} />
                    </Flex>
                  </SectionBlock>
                )}

                {section === "colors" && (
                  <SectionBlock
                    title="Colors"
                    hint="Auto-assigned and consistent across panels. Click a swatch to override."
                    action={
                      <Button
                        size="1"
                        variant="soft"
                        color="gray"
                        disabled={overrides.length === 0}
                        onClick={() => {
                          for (const [k] of overrides) {
                            const [scope, key] = split(k);
                            clearColor(scope, key);
                          }
                        }}
                        title="Clear all color overrides (revert to default colors)"
                      >
                        Reset all
                      </Button>
                    }
                  >
                    <TextField.Root
                      size="2"
                      placeholder="Search activities or object types..."
                      value={colorSearch}
                      onChange={(e) => setColorSearch(e.target.value)}
                      mb="3"
                    />
                    {totalKeys === 0 ? (
                      <EmptyHint>No colors yet. Open a viewer (e.g. a DFG) to populate this list.</EmptyHint>
                    ) : grouped.length === 0 ? (
                      <EmptyHint>No matches for "{colorSearch.trim()}".</EmptyHint>
                    ) : (
                      <Flex direction="column" gap="4">
                        {grouped.map(({ scope, items }) => (
                          <div key={scope}>
                            <Flex align="center" gap="2" mb="2">
                              <Text size="1" weight="bold" style={{ color: "var(--gray-11)" }}>
                                {(SCOPE_LABELS[scope] ?? scope).toUpperCase()}
                              </Text>
                              <Badge size="1" color="gray" variant="soft" radius="full">
                                {items.length}
                              </Badge>
                            </Flex>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                                gap: 6,
                              }}
                            >
                              {items.map(({ k, scope: s, key }) => (
                                <ColorChip
                                  key={k}
                                  hex={resolve(s, key) ?? "#888888"}
                                  label={key}
                                  overridden={k in colorOverrides}
                                  onPick={(c) => setColor(s, key, c)}
                                  onReset={() => clearColor(s, key)}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </Flex>
                    )}
                  </SectionBlock>
                )}
              </div>
            </ScrollArea>

            <Flex
              justify="end"
              gap="2"
              style={{ padding: "12px 16px", borderTop: "1px solid var(--gray-a4)" }}
            >
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  Close
                </Button>
              </Dialog.Close>
            </Flex>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function SectionBlock({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Flex align="start" justify="between" gap="3" mb="3">
        <div>
          <Text as="div" size="4" weight="bold" style={{ letterSpacing: "-0.01em" }}>
            {title}
          </Text>
          {hint && (
            <Text as="div" size="1" color="gray" mt="1" style={{ maxWidth: 380 }}>
              {hint}
            </Text>
          )}
        </div>
        {action}
      </Flex>
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <Flex
      align="center"
      justify="center"
      style={{
        padding: "28px 16px",
        borderRadius: 10,
        border: "1px dashed var(--gray-a5)",
        background: "var(--gray-a2)",
      }}
    >
      <Text size="1" color="gray" align="center">
        {children}
      </Text>
    </Flex>
  );
}

/** A single legend swatch: a round color dot (native picker hidden beneath it) + label, with an
 *  accent ring and hover-revealed reset when the color has been overridden. */
function ColorChip({
  hex,
  label,
  overridden,
  onPick,
  onReset,
}: {
  hex: string;
  label: string;
  overridden: boolean;
  onPick: (color: string) => void;
  onReset: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Flex
      align="center"
      gap="2"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        minWidth: 0,
        padding: "5px 8px",
        borderRadius: 8,
        border: "1px solid",
        borderColor: overridden ? "var(--accent-a6)" : "var(--gray-a4)",
        background: hover ? "var(--gray-a3)" : "var(--gray-a2)",
        transition: "background 120ms ease, border-color 120ms ease",
      }}
    >
      <label
        style={{ position: "relative", width: 16, height: 16, flex: "0 0 auto", cursor: "pointer" }}
        title={`Set color for ${label}`}
      >
        <span
          style={{
            display: "block",
            width: 16,
            height: 16,
            borderRadius: "9999px",
            background: hex,
            boxShadow: overridden
              ? "0 0 0 2px var(--color-panel-solid), 0 0 0 3px var(--accent-8)"
              : "inset 0 0 0 1px var(--gray-a5)",
          }}
        />
        <input
          type="color"
          value={hex}
          onChange={(e) => onPick(e.target.value)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            cursor: "pointer",
          }}
        />
      </label>
      <Text size="1" style={{ flex: 1, minWidth: 0 }} truncate>
        {label}
      </Text>
      {overridden && (
        <button
          type="button"
          onClick={onReset}
          title="Reset to default color"
          aria-label={`Reset ${label} to default color`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 auto",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--gray-10)",
            padding: 2,
            opacity: hover ? 1 : 0.55,
            transition: "opacity 120ms ease",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </Flex>
  );
}
