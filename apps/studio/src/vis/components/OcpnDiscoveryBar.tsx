import type { SlimLinkedOCELHandle } from "@r4pm/client";
import { ActivityChooser, ObjectTypeChooser } from "@r4pm/components";
import { Button, Flex, NumberField, Popover, Text, Tooltip } from "@r4pm/components/ui";
import { useQuery } from "@tanstack/react-query";
import { type ComponentType, useState } from "react";
import { PiCaretDown } from "react-icons/pi";
import { backend } from "../../backends";
import {
  DEFAULT_ACTIVITIES,
  DEFAULT_OBJECT_TYPES,
  keptNames,
  namesToUse,
  OCPN_VARIANTS,
  type OcpnDiscovery,
} from "../_ocpn-discovery";
import { OCEL_TYPE_STATS } from "../_oc-declare-discovery";
import { MinerPicker } from "./MinerPicker";

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

type Chooser = ComponentType<{
  counts: Record<string, number>;
  value: Set<string>;
  onChange: (value: Set<string>) => void;
}>;

/** Names to discover with, picked in a popover and applied when it closes, so picking several
 *  runs the discovery once. */
function NamesPicker({
  label,
  chooser: Choose,
  counts,
  defaults,
  value,
  onChange,
}: {
  label: string;
  chooser: Chooser;
  counts: Record<string, number>;
  defaults: number;
  value: string[] | null | undefined;
  onChange: (value: string[] | null) => void;
}) {
  const all = Object.keys(counts);
  const kept = keptNames(value, counts, defaults);
  const [draft, setDraft] = useState<Set<string> | null>(null);
  return (
    <Flex align="center" gap="2">
      <Text size="1" color="gray">
        {label}
      </Text>
      <Popover.Root
        onOpenChange={(open) => {
          if (open) setDraft(kept);
          else {
            if (draft && !sameSet(draft, kept)) onChange(namesToUse(draft, all));
            setDraft(null);
          }
        }}
      >
        <Popover.Trigger>
          <Button size="1" variant="soft" color="gray" disabled={all.length === 0}>
            {kept.size === all.length ? "All" : `${kept.size} of ${all.length}`}
            <PiCaretDown />
          </Button>
        </Popover.Trigger>
        <Popover.Content size="1" width="320px">
          <Choose counts={counts} value={draft ?? kept} onChange={setDraft} />
        </Popover.Content>
      </Popover.Root>
    </Flex>
  );
}

const ActivitiesChooser: Chooser = (p) => <ActivityChooser {...p} mode="multi" />;

/** Options of the object-centric Petri net discovery: which object types and activities, how
 *  tolerant variable arcs are, and the Inductive Miner that discovers each type's net. */
export function OcpnDiscoveryBar({
  value,
  onChange,
  ocel,
}: {
  value: OcpnDiscovery;
  onChange: (value: OcpnDiscovery) => void;
  ocel: string;
}) {
  const stats = useQuery({
    queryKey: ["ocel-type-stats", ocel],
    queryFn: () => backend.callBinding(OCEL_TYPE_STATS, { ocel: ocel as SlimLinkedOCELHandle }),
  });
  return (
    <Flex
      align="center"
      gap="3"
      px="2"
      py="1"
      wrap="wrap"
      style={{ borderBottom: "1px solid var(--gray-5)" }}
    >
      <NamesPicker
        label="Object types"
        chooser={ObjectTypeChooser}
        counts={stats.data?.object_type_counts ?? {}}
        defaults={DEFAULT_OBJECT_TYPES}
        value={value.object_types_to_use}
        onChange={(object_types_to_use) => onChange({ ...value, object_types_to_use })}
      />
      <NamesPicker
        label="Activities"
        chooser={ActivitiesChooser}
        counts={stats.data?.event_type_counts ?? {}}
        defaults={DEFAULT_ACTIVITIES}
        value={value.activities_to_use}
        onChange={(activities_to_use) => onChange({ ...value, activities_to_use })}
      />
      <Flex align="center" gap="2">
        <Tooltip content="Share of an activity's events that may have zero or several objects of a type while its arc stays normal. 0 is strict.">
          <Text size="1" color="gray">
            Variable-arc tolerance
          </Text>
        </Tooltip>
        <NumberField
          label="Variable-arc tolerance"
          value={value.variable_arc_tolerance}
          onCommit={(variable_arc_tolerance) => onChange({ ...value, variable_arc_tolerance })}
        />
      </Flex>
      <MinerPicker
        value={value.miner}
        onChange={(miner) => onChange({ ...value, miner })}
        variants={OCPN_VARIANTS}
      />
    </Flex>
  );
}
