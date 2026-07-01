import { Badge, Button, Heading, Text } from "@r4pm/components/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PiArrowLeft, PiArrowRight, PiFileArrowUp, PiLightning, PiSparkle } from "react-icons/pi";
import { backend } from "../backends";
import { loadSample, SAMPLE_DATASETS, type SampleDataset } from "../samples";
import { ImportButton } from "./ImportButton";
import { colorForKind, labelForKind } from "./object-colors";
import { shortcutLabel } from "./platform";

/** First-run screen: drop zone, example datasets, and quick-start tips. Shown until data loads. */
export function WelcomeScreen({
  canReturn = false,
  onReturn,
}: {
  canReturn?: boolean;
  onReturn?: () => void;
}) {
  const queryClient = useQueryClient();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleLoadSample = async (sample: SampleDataset) => {
    if (loadingId) return;
    setLoadingId(sample.id);
    try {
      await loadSample(backend, queryClient, sample);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="w-full h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {canReturn && (
          <div className="mb-4">
            <Button variant="ghost" color="gray" size="2" onClick={onReturn}>
              <PiArrowLeft />
              Back to panels
            </Button>
          </div>
        )}
        <div className="text-center mb-8">
          <Heading size={{ initial: "6", sm: "8" }} className="!mb-2">
            Welcome to propel
            <img
              src="/icon.png"
              className="size-8 sm:size-12 inline ml-2 mb-1 align-middle"
              alt="propel logo"
            />
          </Heading>
          <Text as="p" size="3" color="gray">
            Import an event log or OCEL to start exploring.
          </Text>
        </div>

        <div className="relative rounded-lg border-2 border-dashed border-[var(--gray-a6)] bg-[var(--gray-a2)] px-4 sm:px-8 py-6 sm:py-10 flex flex-col items-center justify-center text-center">
          <div className="rounded-full bg-[var(--indigo-a3)] text-[var(--indigo-11)] p-3 mb-3">
            <PiFileArrowUp size={28} />
          </div>
          <Heading size="4" className="!mb-1">
            Drop files here
          </Heading>
          <Text size="2" color="gray" className="max-w-sm">
            Drop anywhere in the window, or pick a kind to import:
          </Text>
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            <ImportButton />
          </div>
        </div>

        {SAMPLE_DATASETS.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <PiSparkle className="text-[var(--indigo-11)]" />
              <Text size="2" weight="medium">
                Try an example dataset
              </Text>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SAMPLE_DATASETS.map((sample) => {
                const isLoading = loadingId === sample.id;
                return (
                  <button
                    key={sample.id}
                    type="button"
                    disabled={loadingId !== null}
                    onClick={() => handleLoadSample(sample)}
                    className="group flex flex-col items-start text-left gap-1.5 p-4 rounded-md border border-[var(--gray-a5)] hover:border-[var(--indigo-8)] hover:bg-[var(--indigo-a2)] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <Badge size="1" variant="soft" color={colorForKind(sample.kind)}>
                        {labelForKind(sample.kind)}
                      </Badge>
                      <Text size="2" weight="medium" className="flex-1 truncate">
                        {sample.name}
                      </Text>
                      <PiArrowRight
                        className={
                          isLoading
                            ? "text-[var(--indigo-11)] animate-pulse"
                            : "text-[var(--gray-10)] group-hover:text-[var(--indigo-11)]"
                        }
                      />
                    </div>
                    <Text size="1" color="gray" className="leading-snug">
                      {sample.description}
                    </Text>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-8">
          <div className="flex items-center gap-2 mb-2">
            <PiLightning className="text-[var(--indigo-11)]" />
            <Text size="2" weight="medium">
              Quick start
            </Text>
          </div>
          <ul className="space-y-1.5 text-sm text-[var(--gray-11)]">
            <li>1. Import an event log or OCEL (or load an example)</li>
            <li>2. Click "Add panel" to pick a visualisation</li>
            <li>
              3. Press{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--gray-a3)] border border-[var(--gray-a5)] text-[10px] font-mono">
                {shortcutLabel("K")}
              </kbd>{" "}
              any time for the command palette
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
