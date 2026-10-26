import type { OCDeclareArc, OCDeclareDiscoveryOptions, SlimLinkedOCELHandle } from "@r4pm/client";
import {
  ActivityChooser,
  DiscoveryForm,
  discoverySummary,
  OC_DECLARE_HIDDEN_ACTIVITIES_KEY,
} from "@r4pm/components";
import { Button, Flex, Popover, Text, Tooltip } from "@r4pm/components/ui";
import { useQuery } from "@tanstack/react-query";
import { PiCaretDown } from "react-icons/pi";
import { backend } from "../../backends";
import {
  hiddenActivitiesOf,
  OCEL_TYPE_STATS,
  showActivityCounts,
  showLabel,
  toBindingOptions,
  toFormOptions,
} from "../_oc-declare-discovery";
import type { PanelViewState } from "../define-vis";

/** The OC-DECLARE panel's bar: the discovery settings (changing them offers a Re-run) and which
 *  activities are shown, the rest projected away without discovering again. */
export function OCDeclareBar({
  value,
  onChange,
  ocel,
  view,
  arcs,
  showDisabled = false,
}: {
  value: OCDeclareDiscoveryOptions;
  onChange: (value: OCDeclareDiscoveryOptions) => void;
  /** The log discovery runs on. Without it the pickers are empty and Show offers the model's activities. */
  ocel?: string;
  view: PanelViewState;
  /** The model's constraints, once there is a model. */
  arcs?: OCDeclareArc[];
  /** Show is unavailable, e.g., while the model is being edited. */
  showDisabled?: boolean;
}) {
  const stats = useQuery({
    queryKey: ["ocel-type-stats", ocel],
    enabled: !!ocel,
    queryFn: () => backend.callBinding(OCEL_TYPE_STATS, { ocel: ocel as SlimLinkedOCELHandle }),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const eventCounts = stats.data?.event_type_counts ?? {};
  const objectCounts = stats.data?.object_type_counts ?? {};
  const showCounts = showActivityCounts(arcs, eventCounts);
  const activities = Object.keys(showCounts);
  const hidden = hiddenActivitiesOf(view);
  const hiddenSet = new Set(hidden);
  const projected = activities.some((a) => hiddenSet.has(a));
  const form = toFormOptions(value);

  return (
    <Flex
      align="center"
      gap="4"
      px="2"
      py="1"
      wrap="wrap"
      style={{ borderBottom: "1px solid var(--gray-5)" }}
    >
      <Flex align="center" gap="2">
        <Text size="1" color="gray">
          Discovery
        </Text>
        <Popover.Root>
          <Popover.Trigger>
            <Button size="1" variant="soft" color="gray">
              {discoverySummary(form, {
                objectTypes: Object.keys(objectCounts).length,
                activities: Object.keys(eventCounts).length,
              })}
              <PiCaretDown />
            </Button>
          </Popover.Trigger>
          <Popover.Content size="1" width="340px" onOpenAutoFocus={(e) => e.preventDefault()}>
            <DiscoveryForm
              value={form}
              onChange={(next) => onChange(toBindingOptions(next))}
              eventTypeCounts={eventCounts}
              objectTypeCounts={objectCounts}
            />
          </Popover.Content>
        </Popover.Root>
      </Flex>

      <Flex align="center" gap="2">
        <Text size="1" color="gray">
          Show
        </Text>
        <Popover.Root>
          {showDisabled ? (
            <Tooltip content="Switch to View to hide activities">
              <Button size="1" variant="soft" color="gray" disabled>
                {showLabel(activities, [])}
                <PiCaretDown />
              </Button>
            </Tooltip>
          ) : (
            <Popover.Trigger>
              <Button
                size="1"
                variant="soft"
                color={projected ? "indigo" : "gray"}
                disabled={activities.length === 0}
              >
                {showLabel(activities, hidden)}
                <PiCaretDown />
              </Button>
            </Popover.Trigger>
          )}
          <Popover.Content size="1" style={{ width: 300 }} onOpenAutoFocus={(e) => e.preventDefault()}>
            <Text as="p" size="1" color="gray" mb="2">
              Hidden activities are removed. Their constraints are kept between the remaining activities.
            </Text>
            <ActivityChooser
              counts={showCounts}
              mode="multi"
              value={new Set(activities.filter((a) => !hiddenSet.has(a)))}
              onChange={(next) =>
                view.set({
                  ...view.state,
                  [OC_DECLARE_HIDDEN_ACTIVITIES_KEY]: activities.filter((a) => !next.has(a)),
                })
              }
            />
          </Popover.Content>
        </Popover.Root>
      </Flex>
    </Flex>
  );
}
