import { Button, Card, IconButton, Popover, Text } from "@r4pm/components/ui";
import { useMemo } from "react";
import { PiArrowDown, PiArrowRight, PiCaretDown, PiGearSix } from "react-icons/pi";
import { Legend } from "./Legend";
import { FrequencyPicker } from "../inputs/FrequencyPicker";
import type { ColorResolver } from "./VizContext";
import type { ArcType } from "./types";

const ALL_ARC_TYPES: ArcType[] = ["AS", "EF", "EP", "DF", "DP"];

export interface ControlsCardProps {
  direction: "RIGHT" | "DOWN";
  onDirectionChange: (d: "RIGHT" | "DOWN") => void;
  textLabels: boolean;
  onTextLabelsChange: (v: boolean) => void;
  hiddenArcTypes: ReadonlySet<string>;
  onToggleArcType: (t: string) => void;
  objectTypes: string[];
  hiddenObjectTypes: ReadonlySet<string>;
  onToggleObjectType: (t: string) => void;
  activities: string[];
  /** Optional per-activity event counts. Present: the picker sorts by frequency, shows bars + counts
   *  and a top-N cutoff rail. Absent: it sorts by name and shows name + color only. */
  activityCounts?: Record<string, number>;
  hiddenActivities: ReadonlySet<string>;
  onSetHiddenActivities: (next: Set<string>) => void;
  /** Arc types on screen (post EF/EP collapse); limits the legend. Absent: show all as guidance. */
  usedArcTypes?: ReadonlySet<string>;
  showCombined: boolean;
  arcsCount?: number;
  activityColor: ColorResolver;
  objectTypeColor: ColorResolver;
}

function SegButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`px-1.5 py-1 text-[11px] leading-none ${active ? "bg-(--gray-12) text-(--gray-1)" : "bg-(--color-panel-solid) text-(--gray-9) hover:bg-(--gray-a3)"}`}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ToggleChip({
  label,
  hidden,
  color,
  onToggle,
}: {
  label: string;
  hidden: boolean;
  color: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={hidden}
      onClick={onToggle}
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-all ${hidden ? "line-through" : ""}`}
      style={{
        backgroundColor: hidden ? "var(--gray-3)" : `${color}22`,
        borderColor: hidden ? "var(--gray-7)" : color,
        color: hidden ? "var(--gray-9)" : color,
      }}
      title={`Toggle ${label}`}
    >
      {label}
    </button>
  );
}

/** The shared controls/legend card of the OC-DECLARE surface (viewer and editor). */
export function ControlsCard({
  direction,
  onDirectionChange,
  textLabels,
  onTextLabelsChange,
  hiddenArcTypes,
  onToggleArcType,
  objectTypes,
  hiddenObjectTypes,
  onToggleObjectType,
  activities,
  activityCounts,
  hiddenActivities,
  onSetHiddenActivities,
  usedArcTypes,
  showCombined,
  arcsCount,
  activityColor,
  objectTypeColor,
}: ControlsCardProps) {
  const hasActivityCounts = useMemo(
    () => !!activityCounts && activities.some((a) => (activityCounts[a] ?? 0) > 0),
    [activityCounts, activities],
  );
  const activityItems = useMemo(
    () => Object.fromEntries(activities.map((a) => [a, activityCounts?.[a] ?? 0])),
    [activities, activityCounts],
  );
  const selectedActivities = useMemo(
    () => new Set(activities.filter((a) => !hiddenActivities.has(a))),
    [activities, hiddenActivities],
  );
  const shownActivityCount = selectedActivities.size;
  return (
    <Card className="bg-(--color-panel-translucent) backdrop-blur-sm shadow-md py-1.5! px-2! w-55">
      <div className="flex items-center gap-1 mb-2">
        <div className="flex items-center rounded-md border border-(--gray-6) overflow-hidden">
          <SegButton
            active={direction === "RIGHT"}
            title="Horizontal layout"
            onClick={() => onDirectionChange("RIGHT")}
          >
            <PiArrowRight />
          </SegButton>
          <SegButton
            active={direction === "DOWN"}
            title="Vertical layout"
            onClick={() => onDirectionChange("DOWN")}
          >
            <PiArrowDown />
          </SegButton>
        </div>
        <div className="flex items-center rounded-md border border-(--gray-6) overflow-hidden">
          <SegButton
            active={!textLabels}
            title="Show object involvement as dots"
            onClick={() => onTextLabelsChange(false)}
          >
            •••
          </SegButton>
          <SegButton
            active={textLabels}
            title="Show object involvement as ∀/ALL()/ANY() text"
            onClick={() => onTextLabelsChange(true)}
          >
            ∀
          </SegButton>
        </div>
        <div className="flex-1" />
        <Popover.Root>
          <Popover.Trigger>
            <IconButton size="1" variant="ghost" title="Arc-type filter">
              <PiGearSix />
            </IconButton>
          </Popover.Trigger>
          <Popover.Content width="240px">
            <Text size="1" color="gray" className="block mb-1">
              Hide arc types
            </Text>
            <div className="flex gap-1 flex-wrap">
              {ALL_ARC_TYPES.map((t) => {
                const hidden = hiddenArcTypes.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={hidden}
                    onClick={() => onToggleArcType(t)}
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors ${
                      hidden
                        ? "bg-(--gray-3) text-(--gray-8) border-(--gray-6) line-through"
                        : "bg-(--gray-12) text-(--gray-1) border-(--gray-12)"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </Popover.Content>
        </Popover.Root>
      </div>

      {objectTypes.length > 0 && (
        <div className="mb-2">
          <Text
            size="1"
            color="gray"
            className="block mb-1 text-[10px] uppercase tracking-wide font-semibold"
          >
            Object types
          </Text>
          <div className="mt-1 flex flex-wrap gap-1">
            {objectTypes.map((t) => (
              <ToggleChip
                key={t}
                label={t}
                hidden={hiddenObjectTypes.has(t)}
                color={objectTypeColor(t)}
                onToggle={() => onToggleObjectType(t)}
              />
            ))}
          </div>
        </div>
      )}

      {activities.length > 1 && (
        <div className="mb-2">
          <Text
            size="1"
            color="gray"
            className="block mb-1 text-[10px] uppercase tracking-wide font-semibold"
          >
            Activities
          </Text>
          <Popover.Root>
            <Popover.Trigger>
              <Button size="1" variant="soft" color="gray" className="w-full justify-between">
                {shownActivityCount}/{activities.length} shown
                <PiCaretDown className="opacity-70" />
              </Button>
            </Popover.Trigger>
            <Popover.Content
              size="1"
              onOpenAutoFocus={(e) => e.preventDefault()}
              style={{ width: 280, zIndex: 50 }}
            >
              <FrequencyPicker
                items={activityItems}
                value={selectedActivities}
                onChange={(next) => onSetHiddenActivities(new Set(activities.filter((a) => !next.has(a))))}
                scope="activity"
                colorOf={(_scope, key) => activityColor(key)}
                mode="multi"
                searchable
                showBars={hasActivityCounts}
                showCounts={hasActivityCounts}
                showCutoff
                sort={hasActivityCounts ? "count" : "name"}
                emptyText="No activities"
              />
            </Popover.Content>
          </Popover.Root>
        </div>
      )}

      <div className="pt-1.5 border-t border-(--gray-a4)">
        <Legend showCombined={showCombined} usedArcTypes={usedArcTypes} />
      </div>

      {arcsCount !== undefined && (
        <div className="mt-1.5 pt-1.5 border-t border-(--gray-a4)">
          <span className="text-[10px] text-(--gray-8) tabular-nums">{arcsCount} arcs</span>
        </div>
      )}
    </Card>
  );
}
