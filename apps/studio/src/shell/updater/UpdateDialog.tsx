import { Button, Callout, Dialog, Flex, Progress, Text } from "@r4pm/components/ui";
import {
  PiArrowClockwise,
  PiCheckCircle,
  PiDownloadSimple,
  PiSpinnerGap,
  PiWarningCircle,
} from "react-icons/pi";
import type { Updater } from "./useUpdater";

/** Body controls for the download -> install -> restart flow (only shown when an update exists). */
function UpdateControls({ updater }: { updater: Updater }) {
  const { available, status } = updater;
  if (!available) return null;

  switch (status.state) {
    case "error":
      return (
        <>
          <Callout.Root color="red" size="1">
            <Callout.Icon>
              <PiWarningCircle />
            </Callout.Icon>
            <Callout.Text>{status.message}</Callout.Text>
          </Callout.Root>
          <Button variant="soft" color="gray" onClick={updater.reset}>
            Try again
          </Button>
        </>
      );
    case "initial":
    case "downloading": {
      const percent =
        status.state === "downloading" && status.contentLength
          ? Math.min(100, Math.floor((100 * status.downloaded) / status.contentLength))
          : undefined;
      return (
        <>
          <Button
            variant="solid"
            color="blue"
            size="3"
            onClick={updater.startDownload}
            disabled={status.state === "downloading"}
          >
            {status.state === "downloading" ? (
              <>
                <PiSpinnerGap className="animate-spin" /> Downloading…
              </>
            ) : (
              <>
                <PiDownloadSimple /> Download {available.version}
              </>
            )}
          </Button>
          {status.state === "downloading" && <Progress value={percent} size="1" />}
        </>
      );
    }
    case "downloaded":
    case "installing":
      return (
        <Button
          variant="solid"
          size="3"
          color="jade"
          onClick={updater.install}
          disabled={status.state === "installing"}
        >
          {status.state === "installing" ? (
            <>
              <PiSpinnerGap className="animate-spin" /> Installing…
            </>
          ) : (
            <>Install {available.version}</>
          )}
        </Button>
      );
    case "installed":
    case "restarting":
      return (
        <>
          <Text color="green" size="2" className="inline-flex items-center gap-1">
            <PiCheckCircle /> Installed successfully.
          </Text>
          <Button color="green" onClick={updater.restart} disabled={status.state === "restarting"}>
            {status.state === "restarting" ? (
              <>
                <PiSpinnerGap className="animate-spin" /> Restarting…
              </>
            ) : (
              <>
                <PiArrowClockwise /> Restart propel
              </>
            )}
          </Button>
        </>
      );
    default:
      return null;
  }
}

export function UpdateDialog({
  open,
  onOpenChange,
  updater,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updater: Updater;
}) {
  const { version, available, checkState } = updater;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="440px">
        <Dialog.Title>{available ? "Update available" : "propel"}</Dialog.Title>
        <Dialog.Description size="2" color="gray">
          {available
            ? `Version ${available.version} is available. Currently installed: ${version}.`
            : checkState === "checking"
              ? `Checking for updates… (installed: ${version})`
              : checkState === "done"
                ? `You're running the latest version (${version}).`
                : checkState === "failed"
                  ? `Couldn't check for updates. Installed: ${version}.`
                  : `Version ${version}.`}
        </Dialog.Description>

        {available && (
          <Flex direction="column" gap="3" mt="4">
            {available.body && (
              <Text size="1" color="gray" className="whitespace-pre-wrap max-h-32 overflow-auto">
                {available.body}
              </Text>
            )}
            <UpdateControls updater={updater} />
          </Flex>
        )}

        <Flex justify="end" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Close
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
