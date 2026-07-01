import { Badge, Dialog, Switch, Text, TextField } from "@r4pm/components/ui";
import { useMemo, useState } from "react";
import { PiMagnifyingGlass, PiSparkle } from "react-icons/pi";
import { useDatasets } from "../stores";
import {
  addPanelToDockview,
  PANEL_CATEGORIES,
  type PanelCategory,
  type PanelDefinition,
  panelHasNoRequirement,
  panelIsCompatible,
  panelMatchesCategory,
  VISIBLE_PANELS,
} from "../panels/registry";
import { colorForKind, labelForKind } from "./object-colors";

type CategoryFilter = "all" | PanelCategory;

export function PanelGallery({ open, onClose }: { open: boolean; onClose: () => void }) {
  const datasets = useDatasets((s) => s.datasets);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [onlyCompatible, setOnlyCompatible] = useState(true);

  const loadedKinds = useMemo(() => new Set(datasets.map((d) => d.kind)), [datasets]);
  const hasAnyData = loadedKinds.size > 0;
  const effectiveOnlyCompatible = onlyCompatible && hasAnyData;

  const visibleRegistry = useMemo(
    () =>
      effectiveOnlyCompatible
        ? VISIBLE_PANELS.filter((panel) => panelIsCompatible(panel, loadedKinds))
        : VISIBLE_PANELS,
    [effectiveOnlyCompatible, loadedKinds],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleRegistry.filter((panel) => {
      if (category !== "all" && !panelMatchesCategory(panel, category)) return false;
      if (!q) return true;
      const haystack = [panel.name, panel.description, panel.category, ...(panel.keywords ?? [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, category, visibleRegistry]);

  const handleAdd = (panel: PanelDefinition) => {
    addPanelToDockview(panel.type);
    onClose();
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Content
        maxWidth="1000px"
        className="!p-0 !overflow-hidden"
        style={{ height: "min(720px, 85vh)" }}
      >
        <div className="flex flex-col h-full">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-b border-[var(--gray-a5)] shrink-0">
            <div>
              <Dialog.Title className="!mb-0">Add a panel</Dialog.Title>
              <Dialog.Description size="2" color="gray" className="!mt-0.5">
                Browse and drop in any analysis view
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-3">
              {hasAnyData && (
                <Text
                  as="label"
                  size="1"
                  color="indigo"
                  weight="medium"
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <Switch
                    size="1"
                    color="indigo"
                    checked={onlyCompatible}
                    onCheckedChange={setOnlyCompatible}
                  />
                  Compatible only
                </Text>
              )}
              <div className="sm:w-64">
                <TextField.Root
                  autoFocus
                  placeholder="Search panels..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                >
                  <TextField.Slot>
                    <PiMagnifyingGlass />
                  </TextField.Slot>
                </TextField.Root>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row flex-1 min-h-0">
            <nav className="w-full max-h-24 sm:max-h-full sm:w-52 shrink-0 border-r border-[var(--gray-a5)] p-2 overflow-y-auto">
              <CategoryButton
                label="All panels"
                icon={PiSparkle}
                active={category === "all"}
                onClick={() => setCategory("all")}
                count={visibleRegistry.length}
              />
              <div className="h-2" />
              {PANEL_CATEGORIES.map((cat) => {
                const count = visibleRegistry.filter((p) => panelMatchesCategory(p, cat.id)).length;
                if (count === 0) return null;
                return (
                  <CategoryButton
                    key={cat.id}
                    label={cat.label}
                    icon={cat.icon}
                    active={category === cat.id}
                    onClick={() => setCategory(cat.id)}
                    count={count}
                  />
                );
              })}
            </nav>
            <div className="flex-1 min-w-0 overflow-y-auto">
              <div className="p-5">
                {effectiveOnlyCompatible && (
                  <div className="mb-3 flex items-center gap-2">
                    <Text size="1" color="gray">
                      Showing panels compatible with:
                    </Text>
                    {Array.from(loadedKinds).map((kind) => (
                      <Badge key={kind} size="1" variant="soft" color={colorForKind(kind)}>
                        {labelForKind(kind)}
                      </Badge>
                    ))}
                  </div>
                )}
                {filtered.length === 0 ? (
                  <div className="py-16 text-center text-[var(--gray-11)] text-sm">
                    {query
                      ? `No panels match "${query}".`
                      : effectiveOnlyCompatible
                        ? "No compatible panels in this category. Turn off 'Compatible only' to see all panels."
                        : "No panels in this category."}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filtered.map((panel) => (
                      <PanelCard key={panel.type} panel={panel} onAdd={() => handleAdd(panel)} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function CategoryButton({
  label,
  icon: Icon,
  active,
  onClick,
  count,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-sm transition-colors ${
        active
          ? "bg-[var(--indigo-a4)] text-[var(--indigo-11)]"
          : "text-[var(--gray-12)] hover:bg-[var(--gray-a3)]"
      }`}
    >
      <Icon size={14} />
      <span className="flex-1">{label}</span>
      <span className="text-xs text-[var(--gray-10)]">{count}</span>
    </button>
  );
}

function PanelCard({ panel, onAdd }: { panel: PanelDefinition; onAdd: () => void }) {
  const Icon = panel.icon;
  return (
    <button
      type="button"
      onClick={onAdd}
      className="group flex flex-col gap-2 items-start text-left p-4 rounded-md border border-[var(--gray-a5)] hover:border-[var(--indigo-8)] hover:bg-[var(--indigo-a2)] transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-2.5 w-full">
        <div className="rounded bg-[var(--indigo-a3)] text-[var(--indigo-11)] p-1.5 group-hover:bg-[var(--indigo-a5)] transition-colors">
          <Icon size={18} />
        </div>
        <span className="font-medium text-[var(--gray-12)] text-sm flex-1 truncate">{panel.name}</span>
      </div>
      <p className="text-xs text-[var(--gray-11)] leading-snug line-clamp-2">{panel.description}</p>
      {!panelHasNoRequirement(panel) && (
        <div className="flex gap-1 mt-auto">
          {panel.supports?.map((kind) => (
            <Badge key={kind} size="1" variant="soft" color={colorForKind(kind)}>
              {labelForKind(kind)}
            </Badge>
          ))}
        </div>
      )}
    </button>
  );
}
