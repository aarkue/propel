import { Button, Callout, Text } from "@r4pm/components/ui";
import { PiArrowClockwise, PiWarningCircle } from "react-icons/pi";

export interface ErrorStateProps {
  /** The thrown value; its message is shown and its stack is offered under "Details". */
  error?: unknown;
  title?: string;
  /** Override the derived message (defaults to `error.message`). */
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/** Normalize any thrown value to a human string. */
export function errorMessage(error: unknown): string {
  if (error == null) return "Something went wrong.";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

/** Consistent error block: a red Radix Callout with title, message, optional retry,
 *  and a collapsible stack trace. Centered within its container. */
export function ErrorState({
  error,
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Retry",
  className,
}: ErrorStateProps) {
  const msg = message ?? errorMessage(error);
  const stack = error instanceof Error ? error.stack : undefined;

  return (
    <div
      className={`flex items-center justify-center w-full h-full min-h-[8rem] p-6 ${className ?? ""}`}
      role="alert"
    >
      <Callout.Root color="red" variant="surface" className="max-w-[32rem]">
        <Callout.Icon>
          <PiWarningCircle />
        </Callout.Icon>
        <Callout.Text>
          <Text as="div" weight="medium" size="2" className="mb-1">
            {title}
          </Text>
          <Text as="div" size="2" className="opacity-90 break-words">
            {msg}
          </Text>
          {stack && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[12px] opacity-70">Details</summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] opacity-70">
                {stack}
              </pre>
            </details>
          )}
          {onRetry && (
            <div className="mt-3">
              <Button size="1" variant="soft" color="red" onClick={onRetry}>
                <PiArrowClockwise /> {retryLabel}
              </Button>
            </div>
          )}
        </Callout.Text>
      </Callout.Root>
    </div>
  );
}
