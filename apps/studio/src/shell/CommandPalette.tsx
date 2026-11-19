import { Kbd } from "@r4pm/components/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { IconType } from "react-icons";
import {
  PiArrowRight,
  PiFileArrowDown,
  PiFileArrowUp,
  PiGear,
  PiHouse,
  PiMagnifyingGlass,
  PiMoon,
  PiSun,
  PiTrash,
} from "react-icons/pi";
import { useDatasets } from "../stores";
import { exportFormatsFor } from "@r4pm/client";
import { backend } from "../backends";
import { exportDataset } from "./export-dataset";
import { unloadDataset } from "../persistence/session";
import { addPanelToDockview, getPanelByType, VISIBLE_PANELS } from "../panels/registry";
import { TABBED } from "../panels/tabbed";
import { aboutPanel } from "./analyses";
import { useImport } from "./import-context";
import { useThemeMode } from "./theme-context";

type Section = "Recent" | "Panels" | "Data" | "View";
type Command = {
  id: string;
  title: string;
  subtitle?: string;
  section: Section;
  icon: IconType;
  keywords?: string[];
  run: () => void;
};

function scoreCommand(command: Command, query: string): number {
  if (!query) return 1;
  const q = query.toLowerCase().trim();
  const title = command.title.toLowerCase().replace(/^add panel: /, "");
  const words = (text: string) => text.split(/[^a-z0-9+]+/);
  const keywords = (command.keywords ?? []).map((k) => k.toLowerCase());
  if (title.startsWith(q)) return 100;
  if (words(title).some((w) => w.startsWith(q))) return 90;
  if (keywords.some((k) => k === q || k.startsWith(q))) return 80;
  if (title.includes(q)) return 70;
  if (keywords.some((k) => k.includes(q))) return 50;
  if ((command.subtitle ?? "").toLowerCase().includes(q)) return 30;
  // Letters in order, in the title only: forgives typos without matching long descriptions.
  let hi = 0;
  for (const ch of q.replace(/\s+/g, "")) {
    const found = title.indexOf(ch, hi);
    if (found === -1) return 0;
    hi = found + 1;
  }
  return 10;
}

const RECENT_KEY = "propel-recent-commands";

function recentCommands(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function rememberCommand(id: string): void {
  try {
    const next = [id, ...recentCommands().filter((x) => x !== id)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage off: no recent list.
  }
}

/** Words people search with that a panel's name does not contain. */
const SYNONYMS: Record<string, string[]> = {
  performanceSpectrum: ["bottleneck", "queue", "batching", "overtaking", "slow", "delay"],
  caseDuration: ["lead time", "cycle time", "throughput time", "sla", "slow"],
  workload: ["busy", "weekday", "hour", "resource load"],
  "group:conformance": ["fitness", "deviation", "compliance", "check model", "token replay"],
  alignmentNet: [
    "fitness",
    "deviation",
    "skipped",
    "missing step",
    "missing event",
    "extra event",
    "log move",
    "model move",
  ],
  logVariants: ["paths", "rework", "loops", "happy path", "process flows"],
  logHealth: ["quality", "missing timestamps", "duplicates", "errors", "cleanup"],
  traceBrowser: ["table", "raw data", "cases"],
  dfg: ["process map", "flow", "graph"],
  petriNet: ["process model", "inductive miner", "discover model"],
  ocdfg: ["process map", "object-centric flow"],
  pathSchemas: ["data model", "erd", "links", "how objects connect"],
  ocelTypeGraph: ["data model", "erd", "links"],
  objectBrowser: ["instances", "object table", "history"],
};

function synonymsFor(type: string): string[] {
  return SYNONYMS[type] ?? [];
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toggle: toggleTheme, resolved } = useThemeMode();
  const { importableKinds, importKind } = useImport();
  const datasets = useDatasets((s) => s.datasets);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const kinds = useQuery({
    queryKey: ["item-kinds"],
    queryFn: () => backend.listItemKinds(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const unload = useCallback(
    async (id: string) => {
      await unloadDataset(backend, id);
      await queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];

    for (const panel of VISIBLE_PANELS) {
      list.push({
        id: `panel:${panel.type}`,
        title: `Add panel: ${panel.name}`,
        subtitle: panel.description,
        section: "Panels",
        icon: panel.icon,
        keywords: [...aboutPanel(panel.type), ...(panel.keywords ?? []), ...synonymsFor(panel.type)],
        run: () => {
          addPanelToDockview(panel.type);
          onClose();
        },
      });
    }
    // Each tab of a tabbed panel is findable by its own name.
    for (const g of TABBED) {
      const group = getPanelByType(g.type);
      if (!group) continue;
      for (const t of g.tabs) {
        const member = getPanelByType(t.panel);
        list.push({
          id: `tab:${t.panel}`,
          title: `Add panel: ${g.name} · ${t.label}`,
          subtitle: member?.description,
          section: "Panels",
          icon: group.icon,
          keywords: [member?.name ?? "", ...(member?.keywords ?? []), ...synonymsFor(t.panel)],
          run: () => {
            addPanelToDockview(t.panel);
            onClose();
          },
        });
      }
    }
    list.push({
      id: "panel:gallery",
      title: "Browse panel gallery…",
      subtitle: "Open the full catalog",
      section: "Panels",
      icon: PiMagnifyingGlass,
      run: () => {
        window.dispatchEvent(new CustomEvent("propel-open-gallery"));
        onClose();
      },
    });

    for (const k of importableKinds) {
      list.push({
        id: `import:${k.kind}`,
        title: `Import ${k.kind}`,
        subtitle: k.import_formats.map((f) => `.${f.extension}`).join(" "),
        section: "Data",
        icon: PiFileArrowUp,
        keywords: ["load", "upload", "open"],
        run: () => {
          importKind(k);
          onClose();
        },
      });
    }

    for (const d of datasets) {
      for (const f of exportFormatsFor(kinds.data ?? [], d.kind)) {
        list.push({
          id: `export:${d.id}:${f.ext}`,
          title: `Export ${d.label} as ${f.ext.toUpperCase()}`,
          subtitle: `${d.kind} · .${f.ext}`,
          section: "Data",
          icon: PiFileArrowDown,
          keywords: [f.ext, "download"],
          run: () => {
            void exportDataset(d.id, f.ext, f.mime);
            onClose();
          },
        });
      }
      list.push({
        id: `unload:${d.id}`,
        title: `Unload ${d.label}`,
        subtitle: d.kind,
        section: "Data",
        icon: PiTrash,
        run: () => {
          void unload(d.id);
          onClose();
        },
      });
    }

    list.push({
      id: "view:theme",
      title: resolved === "dark" ? "Switch to light mode" : "Switch to dark mode",
      section: "View",
      icon: resolved === "dark" ? PiSun : PiMoon,
      keywords: ["theme", "dark", "light", "appearance"],
      run: () => {
        toggleTheme();
        onClose();
      },
    });
    list.push({
      id: "view:show-welcome",
      title: "Show welcome screen",
      section: "View",
      icon: PiHouse,
      keywords: ["home", "welcome", "start"],
      run: () => {
        window.dispatchEvent(new CustomEvent("propel-show-welcome"));
        onClose();
      },
    });
    list.push({
      id: "view:preferences",
      title: "Open preferences…",
      section: "View",
      icon: PiGear,
      keywords: ["settings", "preferences", "colors", "config"],
      run: () => {
        window.dispatchEvent(new CustomEvent("propel-open-settings"));
        onClose();
      },
    });

    return list;
  }, [datasets, kinds.data, importableKinds, resolved, importKind, unload, onClose, toggleTheme]);

  const ranked = useMemo(() => {
    const recent = recentCommands();
    // Without a query, recently used commands come first, in their own section.
    if (!deferredQuery) {
      const byId = new Map(commands.map((c) => [c.id, c]));
      const first = recent
        .map((id) => byId.get(id))
        .filter((c): c is Command => !!c)
        .map((c) => ({ ...c, section: "Recent" as const }));
      const rest = commands.filter((c) => !recent.includes(c.id));
      return [...first, ...rest].slice(0, 40);
    }
    return commands
      .map((cmd) => {
        const at = recent.indexOf(cmd.id);
        const score = scoreCommand(cmd, deferredQuery);
        return { cmd, score: score > 0 && at >= 0 ? score + 20 - at : score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((x) => x.cmd);
  }, [commands, deferredQuery]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cmd-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const grouped = useMemo(() => {
    const groups: { section: Section; items: Command[] }[] = [];
    for (const cmd of ranked) {
      const existing = groups.find((g) => g.section === cmd.section);
      if (existing) existing.items.push(cmd);
      else groups.push({ section: cmd.section, items: [cmd] });
    }
    return groups;
  }, [ranked]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(ranked.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = ranked[selectedIdx];
      if (cmd) {
        rememberCommand(cmd.id);
        cmd.run();
      }
    }
  };

  if (!open || typeof document === "undefined") return null;
  const portalTarget = document.querySelector<HTMLElement>(".radix-themes") ?? document.body;

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-start justify-center pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-modal
        className="relative w-[min(580px,92vw)] rounded-lg border border-[var(--gray-a6)] bg-[var(--color-panel-solid)] shadow-2xl overflow-hidden"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--gray-a5)]">
          <PiMagnifyingGlass className="text-[var(--gray-11)]" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            className="flex-1 bg-transparent outline-none text-[var(--gray-12)] placeholder:text-[var(--gray-10)] text-sm"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1.5">
          {grouped.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-[var(--gray-11)]">
              No commands match "{query}".
            </div>
          )}
          {grouped.map((group) => (
            <div key={group.section} className="px-1.5 py-0.5">
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--gray-10)] font-medium">
                {group.section}
              </div>
              {group.items.map((cmd) => {
                const idx = ranked.indexOf(cmd);
                const Icon = cmd.icon;
                return (
                  <CommandRow
                    key={cmd.id}
                    idx={idx}
                    active={idx === selectedIdx}
                    onSelect={() => {
                      rememberCommand(cmd.id);
                      cmd.run();
                    }}
                    onHover={() => setSelectedIdx(idx)}
                    icon={<Icon size={16} />}
                    title={cmd.title}
                    subtitle={cmd.subtitle}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--gray-a5)] text-[11px] text-[var(--gray-11)]">
          <div className="flex items-center gap-3">
            <span>
              <Kbd>↑↓</Kbd> navigate
            </span>
            <span>
              <Kbd>↵</Kbd> select
            </span>
          </div>
          <span>{ranked.length} results</span>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}

function CommandRow({
  idx,
  active,
  onSelect,
  onHover,
  icon,
  title,
  subtitle,
}: {
  idx: number;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
  icon: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <button
      type="button"
      data-cmd-idx={idx}
      onMouseEnter={onHover}
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded cursor-pointer mx-1 text-left ${
        active ? "bg-[var(--indigo-a4)] text-[var(--indigo-12)]" : "hover:bg-[var(--gray-a3)]"
      }`}
    >
      <span className={`shrink-0 ${active ? "text-[var(--indigo-11)]" : "text-[var(--gray-11)]"}`}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{title}</div>
        {subtitle && <div className="text-xs text-[var(--gray-10)] truncate">{subtitle}</div>}
      </div>
      {active && <PiArrowRight className="text-[var(--indigo-11)]" />}
    </button>
  );
}
