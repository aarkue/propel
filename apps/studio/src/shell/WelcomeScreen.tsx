import { Badge, Button, Flex, Heading, Text } from "@r4pm/components/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  PiArrowClockwise,
  PiArrowLeft,
  PiArrowRight,
  PiDatabase,
  PiFileArrowUp,
  PiLightning,
  PiSparkle,
} from "react-icons/pi";
import { backend } from "../backends";
import { addPanelToDockview } from "../panels/registry";
import { continuePreviousSession, declineRestore, lastSessionInfo } from "../persistence/restore";
import { loadSample, SAMPLE_DATASETS, type SampleDataset } from "../samples";
import { withBusy } from "./BusyOverlay";
import { refreshArtifacts, refreshDatasets } from "./EngineEvents";
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
  // Extraction is offered on every backend. In the browser a source is a file dropped into the
  // page and read from memory, so only the self-contained kinds work and there is no connection
  // string -- a narrower way in, not a dead end. Whether *that* is what a source looks like is
  // what changes the wording below.
  const nativeSources = backend.kind !== "wasm";
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [resume, setResume] = useState<{ name: string; datasets: number } | null>(null);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    // Only offer to continue on a genuine empty boot, not when the user navigated back to Welcome.
    if (canReturn) return;
    let cancelled = false;
    void lastSessionInfo(backend)
      .then((info) => {
        if (!cancelled) setResume(info);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canReturn]);

  const handleContinue = async () => {
    if (resuming) return;
    setResuming(true);
    try {
      await withBusy("Restoring session…", async () => {
        await continuePreviousSession(backend);
        await Promise.all([refreshDatasets(), refreshArtifacts()]);
      });
      await queryClient.invalidateQueries();
    } catch (e) {
      toast.error(`Could not restore session: ${String(e)}`);
    } finally {
      setResuming(false);
    }
  };

  const handleStartFresh = () => {
    setResume(null);
    void declineRestore();
  };

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
        {resume && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-[var(--indigo-8)] bg-[var(--indigo-a2)] p-4">
            <div className="rounded-full bg-[var(--indigo-a3)] text-[var(--indigo-11)] p-2 shrink-0">
              <PiArrowClockwise size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <Text size="2" weight="medium" as="div">
                Continue previous session
              </Text>
              <Text size="1" color="gray" as="div" className="truncate">
                {resume.name}
                {resume.datasets > 0 && ` — ${resume.datasets} dataset${resume.datasets === 1 ? "" : "s"}`}
              </Text>
            </div>
            <Flex gap="2" align="center" className="shrink-0">
              <Button variant="ghost" color="gray" disabled={resuming} onClick={handleStartFresh}>
                Start fresh
              </Button>
              <Button onClick={handleContinue} disabled={resuming}>
                {resuming ? "Restoring…" : "Continue"}
              </Button>
            </Flex>
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
            {nativeSources
              ? "Bring a finished log, or build one from your own database."
              : "Bring a finished log, or build one from a database file."}
          </Text>
        </div>

        {/* The two ways in, at equal weight. Extraction used to be reachable only after a dataset
            was already loaded, which put the tool's own way of making one behind the step it
            replaces. */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--gray-a6)] bg-[var(--gray-a2)] px-4 sm:px-6 py-6 sm:py-8 text-center">
            <div className="rounded-full bg-[var(--indigo-a3)] text-[var(--indigo-11)] p-3 mb-3">
              <PiFileArrowUp size={28} />
            </div>
            <Heading size="4" className="!mb-1">
              Open a log
            </Heading>
            <Text size="2" color="gray" className="max-w-sm">
              OCEL, XES and more. Drop anywhere in the window, or pick a kind:
            </Text>
            <div className="flex flex-wrap justify-center gap-2 mt-5">
              <ImportButton />
            </div>
          </div>

          <button
            type="button"
            onClick={() => addPanelToDockview("extraction-blueprint")}
            className="group relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-[var(--gray-a6)] bg-[var(--gray-a2)] px-4 sm:px-6 py-6 sm:py-8 text-center transition-colors hover:border-[var(--indigo-8)] hover:bg-[var(--indigo-a2)]"
          >
            <div className="rounded-full bg-[var(--jade-a3)] text-[var(--jade-11)] p-3 mb-3">
              <PiDatabase size={28} />
            </div>
            <Heading size="4" className="!mb-1">
              Extract from a database
            </Heading>
            <Text size="2" color="gray" className="max-w-sm">
              {nativeSources
                ? "Point at Postgres, SQLite, CSV or Parquet and build an OCEL log from its tables."
                : "Drop a SQLite database and build an OCEL log from its tables."}
            </Text>
            <Text size="2" className="mt-5 text-[var(--indigo-11)]">
              Start a blueprint <PiArrowRight className="inline align-middle" />
            </Text>
          </button>
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
