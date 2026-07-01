import { Button, Flex, Popover, Text } from "@radix-ui/themes";
import type { ComponentProps, ReactNode } from "react";

type ButtonProps = ComponentProps<typeof Button>;

export interface ConfirmButtonProps {
  /** Run only after the user confirms in the popover. */
  onConfirm: () => void;
  /** Trigger button content. */
  children: ReactNode;
  /** Prompt shown in the popover. Defaults to "Are you sure?". */
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  color?: ButtonProps["color"];
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  disabled?: boolean;
  title?: string;
}

/** A button that asks for confirmation in a popover before firing `onConfirm`. Use for
 *  destructive, easily-misclicked actions (clearing, deleting) where a full dialog is overkill. */
export function ConfirmButton({
  onConfirm,
  children,
  message = "Are you sure?",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  color = "red",
  variant = "soft",
  size = "1",
  disabled,
  title,
}: ConfirmButtonProps) {
  return (
    <Popover.Root>
      <Popover.Trigger>
        <Button color={color} variant={variant} size={size} disabled={disabled} title={title}>
          {children}
        </Button>
      </Popover.Trigger>
      <Popover.Content size="1" style={{ maxWidth: 260 }}>
        <Flex direction="column" gap="2">
          <Text size="1">{message}</Text>
          <Flex gap="2" justify="end">
            <Popover.Close>
              <Button variant="soft" color="gray" size={size}>
                {cancelLabel}
              </Button>
            </Popover.Close>
            <Popover.Close>
              <Button variant="solid" color={color} size={size} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </Popover.Close>
          </Flex>
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
}
