import { Button, Popover, Text } from "@radix-ui/themes";
import { type ReactNode, useState } from "react";
import { PiCaretDown } from "react-icons/pi";
import { CardSelector, type CardSelectorOption } from "./CardSelector";

export interface CardPickerButtonProps<T extends string> {
  label: ReactNode;
  icon?: ReactNode;
  /** With one option the button runs it directly; with several it opens them as cards. */
  options: CardSelectorOption<T>[];
  onPick: (value: T) => void;
  /** Shown above the cards. */
  heading?: string;
  size?: "1" | "2";
  title?: string;
}

/** A button for an action that can be done in several ways, e.g., discovering a model by
 *  different methods. Picking a card runs that option right away. */
export function CardPickerButton<T extends string>({
  label,
  icon,
  options,
  onPick,
  heading,
  size = "1",
  title,
}: CardPickerButtonProps<T>) {
  const [open, setOpen] = useState(false);
  if (options.length === 1) {
    return (
      <Button size={size} variant="soft" title={title} onClick={() => onPick(options[0].value)}>
        {icon} {label}
      </Button>
    );
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <Button size={size} variant="soft" title={title}>
          {icon} {label} <PiCaretDown />
        </Button>
      </Popover.Trigger>
      <Popover.Content size="1" style={{ width: 360 }}>
        {heading && (
          <Text as="div" size="1" color="gray" mb="2">
            {heading}
          </Text>
        )}
        <CardSelector
          size="1"
          columns={1}
          options={options}
          value={"" as T}
          onValueChange={(v) => {
            setOpen(false);
            onPick(v);
          }}
          aria-label={typeof label === "string" ? label : undefined}
        />
      </Popover.Content>
    </Popover.Root>
  );
}
