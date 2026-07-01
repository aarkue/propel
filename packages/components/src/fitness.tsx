import { Heading } from "@r4pm/components/ui";
import type { ViewerProps } from "./viewer/viewer-config";
import { StatCards } from "./shared/StatCards";

/** Conformance fitness summary. Local view-model; structurally assignable to/from the generated
 *  `@r4pm/client` `FitnessResult` (the studio adapter pins that mapping). */
export interface FitnessResult {
  log_fitness: number;
  average_fitness: number;
  perfectly_fitting_frac: number;
  total_costs: number;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function FitnessView({ data }: ViewerProps<FitnessResult>) {
  return (
    <div style={{ width: "100%", height: "100%", overflow: "auto", padding: 16 }}>
      <Heading size="3" mb="3">
        Conformance - alignment fitness
      </Heading>
      <StatCards
        items={[
          {
            label: "Average trace fitness",
            value: pct(data.average_fitness),
            progress: data.average_fitness,
          },
          { label: "Log fitness", value: pct(data.log_fitness), progress: data.log_fitness },
          {
            label: "Perfectly fitting traces",
            value: pct(data.perfectly_fitting_frac),
            progress: data.perfectly_fitting_frac,
          },
          { label: "Total alignment cost", value: data.total_costs },
        ]}
      />
    </div>
  );
}
