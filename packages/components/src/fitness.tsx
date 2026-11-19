import type { StaticViewerProps } from "./viewer/viewer-config";
import { fmtInt, fmtPct, Metric, MetricRow, scoreTone, Section } from "./kit";

/** Conformance fitness summary. Local view-model; structurally assignable to/from the generated
 *  `@r4pm/client` `FitnessResult` (the studio adapter pins that mapping). */
export interface FitnessResult {
  log_fitness: number;
  average_fitness: number;
  perfectly_fitting_frac: number;
  total_costs: number;
}

export function FitnessView({ data }: StaticViewerProps<FitnessResult>) {
  return (
    <div style={{ width: "100%", height: "100%", overflow: "auto", padding: 16 }}>
      <Section
        title="Alignment fitness"
        subtitle="How well the traces fit the model, from optimal alignments"
      >
        <FitnessMetrics data={data} />
      </Section>
    </div>
  );
}

/** The four fitness numbers as metric tiles, shared by the conformance views. */
export function FitnessMetrics({ data }: { data: FitnessResult }) {
  return (
    <MetricRow>
      <Metric
        label="Trace fitness"
        value={fmtPct(data.average_fitness)}
        progress={data.average_fitness}
        tone={scoreTone(data.average_fitness)}
        hint="average over traces"
      />
      <Metric
        label="Log fitness"
        value={fmtPct(data.log_fitness)}
        progress={data.log_fitness}
        tone={scoreTone(data.log_fitness)}
      />
      <Metric
        label="Fitting traces"
        value={fmtPct(data.perfectly_fitting_frac)}
        progress={data.perfectly_fitting_frac}
        tone={scoreTone(data.perfectly_fitting_frac)}
        hint="without any deviation"
      />
      <Metric label="Total cost" value={fmtInt(data.total_costs)} hint="of all deviations" />
    </MetricRow>
  );
}
