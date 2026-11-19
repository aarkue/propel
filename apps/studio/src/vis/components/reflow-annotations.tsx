import {
  type Option,
  OptionMenu,
  type ReflowBadge,
  type ReflowMapping,
  reflowBadges,
} from "@r4pm/components";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";
import { backend } from "../../backends";
import { useArtifacts } from "../../stores";

const NONE = "none";

/**
 * The Reflow mapping drawn on top of a view of `datasetId`, and a picker for it. Starts with the
 * mapping made alongside that log, if any, so a flow log shows its annotations right away.
 */
export function useReflowAnnotations(datasetId: string | undefined): {
  badges: Record<string, ReflowBadge[]> | undefined;
  picker: ReactNode;
} {
  const artifacts = useArtifacts((s) => s.artifacts);
  const mappings = useMemo(() => artifacts.filter((a) => a.kind === "ReflowMapping"), [artifacts]);
  const { data: values } = useQuery({
    queryKey: ["reflow-mappings", mappings.map((m) => m.id).join("\n")],
    queryFn: async () =>
      Object.fromEntries(
        await Promise.all(
          mappings.map(async (m) => [m.id, (await backend.getArtifact(m.id)) as ReflowMapping]),
        ),
      ) as Record<string, ReflowMapping>,
    enabled: mappings.length > 0,
  });
  const own = mappings.find((m) => values?.[m.id]?.flowLog === datasetId)?.id;
  const [chosen, setChosen] = useState<string | null>(null);
  const id = chosen ?? own ?? NONE;
  const mapping = id === NONE ? undefined : values?.[id];
  // A stable object, so the net is laid out again only when the mapping changes.
  const badges = useMemo(() => (mapping ? reflowBadges(mapping.summary) : undefined), [mapping]);
  if (mappings.length === 0) return { badges: undefined, picker: null };
  const options: Option<string>[] = [
    { value: NONE, label: "None", description: "Only what the net itself shows" },
    ...mappings.map((m) => ({
      value: m.id,
      label: m.label,
      description:
        values?.[m.id]?.flowLog === datasetId
          ? "The object types of this flow log that do not flow"
          : `Reflow mapping${values?.[m.id]?.source ? ` of ${values[m.id].source}` : ""}`,
    })),
  ];
  return {
    badges,
    picker: <OptionMenu label="Annotations" value={id} options={options} onChange={setChosen} />,
  };
}
