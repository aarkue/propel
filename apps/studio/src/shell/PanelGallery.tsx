import { Dialog, SegmentedControl, TextField } from "@r4pm/components/ui";
import { useMemo, useRef, useState } from "react";
import type { IconType } from "react-icons";
import { PiDotsThreeCircle, PiMagnifyingGlass } from "react-icons/pi";
import { addPanelToDockview, getPanelByType, type PanelDefinition, VISIBLE_PANELS } from "../panels/registry";
import { useDatasets } from "../stores";
import { ANALYSES, type Analysis, type Entry } from "./analyses";
import { useThemeMode } from "./theme-context";
import { thumbUrl } from "./thumbs";

export type Kind = "EventLog" | "SlimLinkedOCEL";

interface Section {
  id: string;
  title: string;
  summary: string;
  icon: IconType;
  items: { panel: PanelDefinition; about: string }[];
}

/** `panel` matches `q` by its own words or by those of the analysis listing it. */
function matches(panel: PanelDefinition, about: string, q: string, analysis?: Analysis): boolean {
  if (!q) return true;
  const words = [panel.name, about, panel.description, ...(panel.keywords ?? [])];
  if (analysis) words.push(analysis.title, analysis.summary, ...(analysis.keywords ?? []));
  return words.join(" ").toLowerCase().includes(q);
}

/** The analyses of `kind` as sections, then the panels none of them lists. */
export function sectionsFor(kind: Kind, q: string): Section[] {
  // A panel some analysis lists, of either kind, does not go under "More".
  const listed = new Set(ANALYSES.flatMap((a) => a.panels.map((e) => e.type)));
  const entry = (a: Analysis) => (e: Entry) => {
    const panel = getPanelByType(e.type);
    return panel && matches(panel, e.about, q, a) ? [{ panel, about: e.about }] : [];
  };
  const out: Section[] = ANALYSES.filter((a) => a.needs === kind).map((a) => ({
    id: a.id,
    title: a.title,
    summary: a.summary,
    icon: a.icon,
    items: a.panels.flatMap(entry(a)),
  }));
  const rest = VISIBLE_PANELS.filter(
    (p) => !listed.has(p.type) && (!p.supports?.length || p.supports.includes(kind)),
  );
  out.push({
    id: "more",
    title: "More",
    summary: "Panels that fit no analysis above",
    icon: PiDotsThreeCircle,
    items: rest.filter((p) => matches(p, "", q)).map((panel) => ({ panel, about: panel.description })),
  });
  return out.filter((s) => s.items.length > 0);
}

export function PanelGallery({ open, onClose }: { open: boolean; onClose: () => void }) {
  const datasets = useDatasets((s) => s.datasets);
  const latest = useMemo(() => {
    const logs = datasets.filter((d) => d.kind === "EventLog" || d.kind === "SlimLinkedOCEL");
    return logs[logs.length - 1];
  }, [datasets]);
  const [picked, setPicked] = useState<Kind | null>(null);
  const kind: Kind = picked ?? (latest?.kind as Kind | undefined) ?? "EventLog";
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const sections = useMemo(() => sectionsFor(kind, q), [kind, q]);
  const other: Kind = kind === "EventLog" ? "SlimLinkedOCEL" : "EventLog";
  const otherCount = useMemo(
    () => (q ? sectionsFor(other, q).reduce((n, s) => n + s.items.length, 0) : 0),
    [other, q],
  );
  const scroller = useRef<HTMLDivElement>(null);

  const add = (type: string) => {
    addPanelToDockview(type);
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
        maxWidth="1120px"
        className="!p-0 !overflow-hidden"
        style={{ height: "min(800px, 88vh)" }}
      >
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 flex-col items-center justify-between gap-3 border-b border-[var(--gray-a5)] px-5 py-4 sm:flex-row">
            <div>
              <Dialog.Title className="!mb-0">Add a panel</Dialog.Title>
              <Dialog.Description size="2" color="gray" className="!mt-0.5">
                Grouped by the analysis they serve
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-3">
              <SegmentedControl.Root size="2" value={kind} onValueChange={(v) => setPicked(v as Kind)}>
                <SegmentedControl.Item value="EventLog">Case-centric</SegmentedControl.Item>
                <SegmentedControl.Item value="SlimLinkedOCEL">Object-centric</SegmentedControl.Item>
              </SegmentedControl.Root>
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
          <div className="flex min-h-0 flex-1">
            <nav className="hidden w-56 shrink-0 overflow-y-auto border-r border-[var(--gray-a5)] p-2 sm:block">
              {sections.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      scroller.current
                        ?.querySelector(`[data-section="${s.id}"]`)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-[var(--gray-12)] transition-colors hover:bg-[var(--gray-a3)]"
                  >
                    <Icon size={14} className="text-[var(--indigo-11)]" />
                    <span className="flex-1 truncate">{s.title}</span>
                    <span className="text-xs text-[var(--gray-10)]">{s.items.length}</span>
                  </button>
                );
              })}
            </nav>
            <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto">
              <div className="flex flex-col gap-8 p-5">
                {sections.length === 0 && (
                  <div className="py-16 text-center text-sm text-[var(--gray-11)]">
                    No panels match "{query}".{" "}
                    {otherCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setPicked(other)}
                        className="ml-1 cursor-pointer text-[var(--indigo-11)] underline-offset-2 hover:underline"
                      >
                        Show {otherCount} {other === "EventLog" ? "case-centric" : "object-centric"} panel
                        {otherCount === 1 ? "" : "s"} that match.
                      </button>
                    )}
                  </div>
                )}
                {sections.map((s) => (
                  <SectionView key={s.id} section={s} onAdd={add} />
                ))}
                {sections.length > 0 && otherCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setPicked(other)}
                    className="cursor-pointer self-start text-sm text-[var(--indigo-11)] underline-offset-2 hover:underline"
                  >
                    {otherCount} more {other === "EventLog" ? "case-centric" : "object-centric"} panel
                    {otherCount === 1 ? " matches" : "s match"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export function SectionView({
  section,
  onAdd,
  fact,
}: {
  section: Section;
  onAdd: (type: string) => void;
  /** A fact from the data about this analysis, e.g., the number of variants. */
  fact?: string;
}) {
  const Icon = section.icon;
  return (
    <section data-section={section.id} className="flex scroll-mt-2 flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-md bg-[var(--indigo-a3)] p-1.5 text-[var(--indigo-11)]">
            <Icon size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[15px] font-medium leading-tight text-[var(--gray-12)]">
              {section.title}
            </span>
            <span className="text-xs text-[var(--gray-11)]">{section.summary}</span>
          </div>
        </div>
        {fact && <span className="text-right text-xs text-[var(--gray-12)]">{fact}</span>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {section.items.map(({ panel, about }) => (
          <PanelCard key={panel.type} panel={panel} about={about} onAdd={() => onAdd(panel.type)} />
        ))}
      </div>
    </section>
  );
}

function PanelCard({ panel, about, onAdd }: { panel: PanelDefinition; about: string; onAdd: () => void }) {
  const Icon = panel.icon;
  const { resolved } = useThemeMode();
  const thumb = thumbUrl(panel.type, resolved === "dark");
  return (
    <button
      type="button"
      onClick={onAdd}
      title={panel.description}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-lg border border-[var(--gray-a5)] bg-[var(--color-panel-solid)] text-left transition-[border-color,box-shadow] hover:border-[var(--indigo-8)] hover:shadow-[0_2px_10px_var(--gray-a4)]"
    >
      <div className="relative aspect-[7/4] w-full overflow-hidden border-b border-[var(--gray-a4)] bg-[var(--gray-a2)]">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            // Absolute, so older WebKitGTK (AppImage) does not size the card from the image's natural height.
            className="absolute inset-0 h-full w-full object-cover object-left-top transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,var(--indigo-a3),transparent_70%)] text-[var(--indigo-a9)]">
            <Icon size={44} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Icon size={14} className="shrink-0 text-[var(--indigo-11)]" />
          <span className="truncate text-sm font-medium text-[var(--gray-12)]">{panel.name}</span>
        </div>
        <span className="line-clamp-2 text-xs leading-snug text-[var(--gray-11)]">{about}</span>
      </div>
    </button>
  );
}
