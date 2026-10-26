import { useQuery } from "@tanstack/react-query";
import { backend } from "../../backends";
import { type MinerChoice, type MinerVariant, presetOptions } from "../_discovery";
import { MinerPickerView } from "./MinerPickerView";

/** The miner picker with the preset of the current choice loaded from the backend. */
export function MinerPicker(props: {
  value: MinerChoice;
  onChange: (value: MinerChoice) => void;
  variants: readonly MinerVariant[];
}) {
  const { value } = props;
  const preset = useQuery({
    queryKey: ["miner-preset", value.variant, value.preset, value.noise],
    queryFn: () => presetOptions(backend, value),
    enabled: value.variant !== "Alpha",
    staleTime: Number.POSITIVE_INFINITY,
  });
  return <MinerPickerView {...props} presetValues={preset.data as Record<string, unknown> | undefined} />;
}
