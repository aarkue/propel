import {
  defaultTransformForType,
  generateId,
  getTransformLabel,
  getTransformMeta,
  type PaletteType,
  stepPaletteType,
  suggestOutName,
  summarizeTransform,
  TRANSFORM_GROUPS,
  TRANSFORM_META,
  type TransformBuilderValue,
  transformGroup,
  type TransformWithID,
} from "./catalog";
import { Button, Checkbox, Flex, IconButton, Popover, Text, TextField } from "@r4pm/components/ui";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { FaArrowDown, FaArrowUp, FaPlus } from "react-icons/fa";
import { TiDelete } from "react-icons/ti";
import { LuDatabase, LuDownload, LuPlay, LuSearch, LuSlidersHorizontal, LuUpload } from "react-icons/lu";
import { Toolbar } from "@r4pm/components";
import toast from "react-hot-toast";
import type { BackendContext, EventLogHandle, SlimLinkedOCELHandle, Transform } from "@r4pm/client";
import { TransformEditor } from "./TransformEditors";

export function TransformBuilder({
  backend,
  datasetName,
  objectType,
  sourceLabel,
  onResult,
  value,
  onChange,
}: {
  backend: BackendContext;
  datasetName: string;
  objectType: "EventLog" | "OCEL";
  /** Prefixes the suggested output name. */
  sourceLabel?: string;
  /** `outName` falls back to the suggested name when the field is empty. */
  onResult?: (handle: string, outName: string) => void;
  /** Controlled config; provide with `onChange` to lift state out for persistence. Omit both for uncontrolled use. */
  value?: TransformBuilderValue;
  onChange?: (next: TransformBuilderValue) => void;
}) {
  const logHandle = datasetName as EventLogHandle;
  const ocelHandle = datasetName as SlimLinkedOCELHandle;

  const [innerTransforms, setInnerTransforms] = useState<TransformWithID[]>([]);
  const [innerOutName, setInnerOutName] = useState("");
  const controlled = value !== undefined && onChange !== undefined;
  const transforms = controlled ? value.transforms : innerTransforms;
  const outName = controlled ? value.outName : innerOutName;
  const setTransforms = (next: TransformWithID[] | ((prev: TransformWithID[]) => TransformWithID[])) => {
    if (value && onChange) {
      const resolved = typeof next === "function" ? next(value.transforms) : next;
      onChange({ transforms: resolved, outName: value.outName });
    } else {
      setInnerTransforms(next);
    }
  };
  const setOutName = (next: string) => {
    if (value && onChange) onChange({ transforms: value.transforms, outName: next });
    else setInnerOutName(next);
  };
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addPopoverOpen, setAddPopoverOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const activitiesQuery = useQuery({
    queryKey: [datasetName, "transform-activities", objectType],
    queryFn: () =>
      objectType === "EventLog"
        ? backend
            .callBinding("app_bindings::get_activity_counts", { event_log: logHandle })
            .then((c) => Object.keys(c).sort())
        : backend
            .callBinding("app_bindings::get_ocel_info", { ocel: ocelHandle })
            .then((i) => i.event_types.sort()),
    enabled: !!datasetName,
  });

  const objectTypesQuery = useQuery({
    queryKey: [datasetName, "transform-object-types"],
    queryFn: () =>
      backend
        .callBinding("app_bindings::get_ocel_info", { ocel: ocelHandle })
        .then((i) => i.object_types.sort()),
    enabled: !!datasetName && objectType === "OCEL",
  });

  const allActivities = activitiesQuery.data ?? [];
  const allObjTypes = objectTypesQuery.data;

  const activityCountsQuery = useQuery({
    queryKey: [datasetName, "transform-activity-counts", objectType],
    queryFn: () =>
      objectType === "EventLog"
        ? backend.callBinding("app_bindings::get_activity_counts", { event_log: logHandle })
        : backend
            .callBinding("process_mining::ocel_type_stats", { ocel: ocelHandle })
            .then((s) => s.event_type_counts),
    enabled: !!datasetName,
  });
  const objectTypeCountsQuery = useQuery({
    queryKey: [datasetName, "transform-objtype-counts"],
    queryFn: () =>
      backend
        .callBinding("process_mining::ocel_type_stats", { ocel: ocelHandle })
        .then((s) => s.object_type_counts),
    enabled: !!datasetName && objectType === "OCEL",
  });
  const activityCounts = activityCountsQuery.data ?? {};
  const objectTypeCounts = objectTypeCountsQuery.data ?? {};

  const countsQuery = useQuery({
    queryKey: [datasetName, "transform-counts", objectType],
    queryFn: () =>
      objectType === "EventLog"
        ? backend
            .callBinding("app_bindings::get_log_info", { event_log: logHandle })
            .then((i) => ({ traces: i.num_traces, events: i.num_events }))
        : backend
            .callBinding("app_bindings::get_ocel_info", { ocel: ocelHandle })
            .then((i) => ({ traces: i.num_objects, events: i.num_events })),
    enabled: !!datasetName,
  });
  const totalTraces = countsQuery.data?.traces;
  const totalEvents = countsQuery.data?.events;

  /** Effective activities/object-types at a pipeline index, after upstream Keep/Remove + relabel transforms. */
  function effectiveItemsAt(index: number): { activities: string[]; objectTypes?: string[] } {
    let acts = [...allActivities];
    let ots = allObjTypes ? [...allObjTypes] : undefined;
    for (let i = 0; i < index; i++) {
      const t = transforms[i];
      if (!t.enabled) continue;
      const v = t.value;
      if (v.type === "FilterActivities") {
        const set = new Set(v.activities);
        if (v.mode === "Keep") {
          acts = acts.filter((a) => set.has(a));
        } else {
          acts = acts.filter((a) => !set.has(a));
        }
      }
      if (v.type === "RelabelActivities") {
        acts = acts.map((a) => {
          const rules = v.rules[a];
          if (
            rules &&
            rules.length === 1 &&
            rules[0].condition === null &&
            rules[0].target.type === "Literal"
          ) {
            return rules[0].target.value;
          }
          return a;
        });
      }
      if (ots && v.type === "FilterObjectTypes") {
        const set = new Set(v.object_types);
        if (v.mode === "Keep") {
          ots = ots.filter((o) => set.has(o));
        } else {
          ots = ots.filter((o) => !set.has(o));
        }
      }
      if (ots && v.type === "RelabelObjectTypes") {
        ots = ots.map((o) => {
          const rules = v.rules[o];
          if (
            rules &&
            rules.length === 1 &&
            rules[0].condition === null &&
            rules[0].target.type === "Literal"
          ) {
            return rules[0].target.value;
          }
          return o;
        });
      }
    }
    return { activities: acts, objectTypes: ots };
  }

  const availableTypes = TRANSFORM_META.filter((m) => {
    if (objectType === "OCEL") return !m.xesOnly;
    return !m.ocelOnly;
  });

  const pickerQuery = pickerSearch.trim().toLowerCase();
  const pickerGroups = TRANSFORM_GROUPS.map((group) => ({
    group,
    items: availableTypes.filter(
      (m) =>
        transformGroup(m.type) === group &&
        (!pickerQuery ||
          m.label.toLowerCase().includes(pickerQuery) ||
          m.description.toLowerCase().includes(pickerQuery)),
    ),
  })).filter((g) => g.items.length > 0);

  const quickStartTypes: Transform["type"][] =
    objectType === "EventLog"
      ? ["FilterActivities", "FilterVariants", "FilterAttributes", "Sample"]
      : ["FilterObjectTypes", "FilterActivities", "FilterAttributes", "Sample"];
  const quickStart = quickStartTypes
    .map((tp) => availableTypes.find((m) => m.type === tp))
    .filter((m): m is (typeof availableTypes)[number] => !!m);

  const addTransform = (type: PaletteType) => {
    const item: TransformWithID = { id: generateId(), enabled: true, value: defaultTransformForType(type) };
    setTransforms((prev) => [...prev, item]);
    setExpandedId(item.id);
  };

  const moveTransform = (index: number, dir: -1 | 1) => {
    setTransforms((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const updateTransform = (id: string, value: Transform) => {
    setTransforms((prev) => prev.map((t) => (t.id === id ? { ...t, value } : t)));
  };

  const enabledCount = transforms.filter((t) => t.enabled).length;
  const suggestedName = suggestOutName(
    transforms.filter((t) => t.enabled).map((t) => t.value),
    sourceLabel,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const payload = {
      version: 1 as const,
      kind: objectType,
      transforms: transforms.map((t) => ({
        enabled: t.enabled,
        value: t.value,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const baseName = objectType === "EventLog" ? "log-transforms" : "ocel-transforms";
    a.download = `${baseName}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("transforms" in parsed) ||
        !Array.isArray((parsed as { transforms: unknown }).transforms)
      ) {
        throw new Error("Not a valid transform pipeline file.");
      }
      const payload = parsed as {
        version?: number;
        kind?: "EventLog" | "OCEL";
        transforms: { enabled?: boolean; value: Transform }[];
      };
      if (payload.kind && payload.kind !== objectType) {
        toast.error(`This file was exported for ${payload.kind}, but this panel targets ${objectType}.`);
        return;
      }
      const loaded: TransformWithID[] = payload.transforms.map((t) => ({
        id: generateId(),
        enabled: t.enabled !== false,
        value: t.value,
      }));
      setTransforms(loaded);
      setExpandedId(null);
      toast.success(`Loaded ${loaded.length} transform${loaded.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(`Failed to load pipeline: ${String(e).replace(/^Error:\s*/, "")}`);
    }
  };

  const unit = objectType === "EventLog" ? "cases" : "objects";
  const apply = async () => {
    const enabled = transforms.filter((t) => t.enabled).map((t) => t.value);
    const call: Promise<string> =
      objectType === "EventLog"
        ? backend
            .callBinding("app_bindings::apply_event_log_transforms", {
              event_log: logHandle,
              transforms: enabled,
            })
            .then((h) => h as string)
        : backend
            .callBinding("app_bindings::apply_ocel_transforms", {
              ocel: ocelHandle,
              transforms: enabled,
            })
            .then((h) => h as string);
    const handle = await toast.promise(call, {
      loading: "Applying transforms...",
      success: "Transforms applied",
      error: (e) => `Failed: ${e}`,
    });
    onResult?.(handle as string, outName.trim() || suggestedName);
  };

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <Toolbar
        end={
          <>
            <Flex align="center" gap="2">
              <Text size="1" color="gray">
                Save as
              </Text>
              <TextField.Root
                size="1"
                value={outName}
                placeholder={suggestedName}
                title={outName.trim() ? undefined : `Leave empty to use "${suggestedName}"`}
                onChange={(e) => setOutName(e.currentTarget.value)}
                style={{ width: 220 }}
              />
            </Flex>
            <Button size="2" disabled={!datasetName || enabledCount === 0} onClick={() => void apply()}>
              <LuPlay size={13} /> Apply {enabledCount} step{enabledCount !== 1 ? "s" : ""}
            </Button>
          </>
        }
      >
        <Button
          size="1"
          variant="ghost"
          color="gray"
          title="Load steps from a JSON file"
          onClick={() => fileInputRef.current?.click()}
        >
          <LuUpload size={13} /> Import steps
        </Button>
        <Button
          size="1"
          variant="ghost"
          color="gray"
          title="Save the steps as a JSON file"
          disabled={transforms.length === 0}
          onClick={handleExport}
        >
          <LuDownload size={13} /> Export steps
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
            e.target.value = "";
          }}
        />
      </Toolbar>
      <div className="flex flex-col gap-2.5 w-full" style={{ maxWidth: 880, margin: "0 auto", padding: 20 }}>
        <Flex
          align="center"
          gap="3"
          px="3"
          py="2"
          style={{ borderRadius: 12, background: "var(--gray-a2)", border: "1px solid var(--gray-a4)" }}
        >
          <LuDatabase size={16} style={{ color: "var(--gray-10)" }} />
          <Flex direction="column" style={{ minWidth: 0 }}>
            <span className="r4pm-eyebrow">Source</span>
            <Text size="2" weight="medium" truncate>
              {sourceLabel ?? datasetName}
            </Text>
          </Flex>
          {totalTraces != null && (
            <Text size="1" color="gray" ml="auto" style={{ fontVariantNumeric: "tabular-nums" }}>
              {totalTraces.toLocaleString("en")} {unit}
              {totalEvents != null && ` · ${totalEvents.toLocaleString("en")} events`}
            </Text>
          )}
        </Flex>
        {transforms.length === 0 && (
          <div
            className="flex flex-col items-center gap-3 py-9 px-4 text-center rounded-xl"
            style={{ border: "1px dashed var(--gray-6)" }}
          >
            <LuSlidersHorizontal size={26} style={{ color: "var(--gray-8)" }} />
            <div>
              <Text as="div" size="3" weight="medium">
                Build a transform pipeline
              </Text>
              <Text as="div" size="2" color="gray" style={{ maxWidth: 340 }}>
                Chain filters, relabels, and sampling into a new derived{" "}
                {objectType === "EventLog" ? "log" : "OCEL"}. Start with one:
              </Text>
            </div>
            <Flex gap="2" wrap="wrap" justify="center">
              {quickStart.map((m) => {
                const Icon = m.icon;
                return (
                  <Button key={m.type} size="2" variant="soft" onClick={() => addTransform(m.type)}>
                    <Icon size={14} />
                    {m.label}
                  </Button>
                );
              })}
            </Flex>
          </div>
        )}

        {transforms.map((t, i) => {
          const isExpanded = expandedId === t.id;
          return (
            <div
              key={t.id}
              className="rounded-xl overflow-hidden transition-all"
              style={{
                border: isExpanded ? "1px solid var(--accent-7)" : "1px solid var(--gray-a5)",
                boxShadow: isExpanded ? "var(--shadow-3)" : "var(--shadow-1)",
                background: "var(--color-panel-solid)",
                opacity: t.enabled ? 1 : 0.5,
              }}
            >
              <button
                type="button"
                className="flex items-center gap-2.5 w-full text-left cursor-pointer hover:bg-[var(--gray-a3)] transition-colors"
                style={{
                  padding: "10px 14px",
                  borderBottom: isExpanded ? "1px solid var(--gray-a4)" : "none",
                }}
                onClick={() => setExpandedId(isExpanded ? null : t.id)}
              >
                <span
                  className="flex items-center justify-center shrink-0 text-white font-semibold rounded-full"
                  style={{
                    width: 24,
                    height: 24,
                    fontSize: 11,
                    background: t.enabled ? "var(--accent-9)" : "var(--gray-8)",
                  }}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                    {(() => {
                      const Icon = getTransformMeta(stepPaletteType(t.value))?.icon;
                      return Icon ? <Icon size={13} /> : null;
                    })()}
                    {getTransformLabel(stepPaletteType(t.value))}
                  </div>
                  <div className="text-xs truncate" style={{ color: "var(--gray-9)" }}>
                    {summarizeTransform(t.value)}
                  </div>
                </div>
                <Checkbox
                  size="2"
                  checked={t.enabled}
                  onCheckedChange={(c) => {
                    setTransforms((prev) =>
                      prev.map((x) => (x.id === t.id ? { ...x, enabled: c === true } : x)),
                    );
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex flex-col shrink-0" onClickCapture={(e) => e.stopPropagation()}>
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    disabled={i === 0}
                    onClick={() => moveTransform(i, -1)}
                  >
                    <FaArrowUp size={9} />
                  </IconButton>
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    disabled={i === transforms.length - 1}
                    onClick={() => moveTransform(i, 1)}
                  >
                    <FaArrowDown size={9} />
                  </IconButton>
                </div>
                <IconButton
                  size="1"
                  variant="ghost"
                  color="red"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTransforms((prev) => prev.filter((x) => x.id !== t.id));
                    if (expandedId === t.id) setExpandedId(null);
                  }}
                >
                  <TiDelete size={16} />
                </IconButton>
              </button>

              {isExpanded &&
                (() => {
                  const eff = effectiveItemsAt(i);
                  const enabledPrefix = transforms
                    .slice(0, i)
                    .filter((x) => x.enabled)
                    .map((x) => x.value);
                  return (
                    <div style={{ padding: "14px 14px 14px 50px" }}>
                      <TransformEditor
                        transform={t.value}
                        activities={eff.activities}
                        objectTypes={eff.objectTypes}
                        objectType={objectType}
                        totalTraces={totalTraces}
                        totalEvents={totalEvents}
                        activityCounts={activityCounts}
                        objectTypeCounts={objectTypeCounts}
                        backend={backend}
                        datasetName={datasetName}
                        enabledPrefix={enabledPrefix}
                        onChange={(updated) => updateTransform(t.id, updated)}
                      />
                    </div>
                  );
                })()}
            </div>
          );
        })}

        <Popover.Root
          open={addPopoverOpen}
          onOpenChange={(o) => {
            setAddPopoverOpen(o);
            if (!o) setPickerSearch("");
          }}
        >
          <Popover.Trigger>
            <button
              type="button"
              className="w-full py-2.5 rounded-xl text-sm cursor-pointer transition-colors hover:bg-[var(--accent-a3)]"
              style={{
                background: "var(--accent-a2)",
                border: "1px dashed var(--accent-a7)",
                color: "var(--accent-11)",
                fontWeight: 500,
              }}
              disabled={!datasetName}
            >
              <FaPlus size={10} className="inline mr-1.5" style={{ verticalAlign: -1 }} />
              Add a step
            </button>
          </Popover.Trigger>
          <Popover.Content
            side="top"
            align="start"
            className="!p-2"
            style={{ width: 440, maxHeight: 460, display: "flex", flexDirection: "column" }}
          >
            <TextField.Root
              size="2"
              autoFocus
              placeholder="Search transforms…"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.currentTarget.value)}
              className="mb-2 shrink-0"
            >
              <TextField.Slot>
                <LuSearch size={14} />
              </TextField.Slot>
            </TextField.Root>
            <div className="overflow-auto flex flex-col gap-3" style={{ minHeight: 0 }}>
              {pickerGroups.length === 0 && (
                <Text size="2" color="gray" className="py-4 text-center">
                  No transforms match “{pickerSearch}”.
                </Text>
              )}
              {pickerGroups.map(({ group, items }) => (
                <div key={group} className="flex flex-col gap-1.5">
                  <Text size="1" weight="medium" color="gray" className="uppercase tracking-wide px-0.5">
                    {group}
                  </Text>
                  <div className="grid grid-cols-2 gap-1.5">
                    {items.map((m) => {
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.type}
                          type="button"
                          onClick={() => {
                            addTransform(m.type);
                            setAddPopoverOpen(false);
                          }}
                          className="flex items-start gap-2 p-2.5 rounded-md border border-[var(--gray-a5)] hover:border-[var(--indigo-8)] hover:bg-[var(--indigo-a2)] transition-colors cursor-pointer text-left"
                        >
                          <div className="rounded bg-[var(--indigo-a3)] text-[var(--indigo-11)] p-1 shrink-0">
                            <Icon size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-medium text-[var(--gray-12)] truncate">
                              {m.label}
                            </div>
                            <div className="text-[11px] text-[var(--gray-11)] leading-tight line-clamp-2">
                              {m.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Popover.Content>
        </Popover.Root>
      </div>
    </div>
  );
}

export { suggestOutName, type TransformBuilderValue, type TransformWithID } from "./catalog";
