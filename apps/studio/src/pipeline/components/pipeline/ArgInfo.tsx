import { JSONViewer } from "@r4pm/components";
import { Badge, Code, Flex, HoverCard, Text } from "@r4pm/components/ui";
import type { ReactNode } from "react";
import type { ExtendedJSONSchema } from "../../BackendContext";
import SimpleMarkdown from "../../utils/SimpleMarkdown";

/** The type of an argument as one label, e.g., `EventLog`, `InductiveMiner` or `integer | null`. */
export function typeLabel(schema: ExtendedJSONSchema): string {
  if (schema["x-registry-ref"]) return schema["x-registry-ref"];
  if (schema.title && schema.title !== schema.type) return schema.title;
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  return schema.type ?? "any";
}

/** Hovering `children` shows an argument's type, description and default. */
export function ArgInfo({
  name,
  schema,
  required,
  children,
}: {
  name: string;
  schema: ExtendedJSONSchema;
  required: boolean;
  children: ReactNode;
}) {
  const paragraphs = (schema.description ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  const value = schema.default;
  const structured = value !== null && typeof value === "object";
  return (
    <HoverCard.Root openDelay={350} closeDelay={100}>
      <HoverCard.Trigger>
        <div className="cursor-help">{children}</div>
      </HoverCard.Trigger>
      <HoverCard.Content size="1" side="right" align="start" maxWidth="380px">
        <Flex direction="column" gap="2">
          <Flex align="center" gap="2" wrap="wrap">
            <Text size="2" weight="bold" style={{ fontFamily: "var(--code-font-family)" }}>
              {name}
            </Text>
            <Badge size="1" color="gray" variant="soft">
              {typeLabel(schema)}
            </Badge>
            <Text size="1" color={required ? "red" : "gray"}>
              {required ? "required" : "optional"}
            </Text>
          </Flex>
          {paragraphs.length > 0 && (
            <Text as="div" size="1" color="gray">
              {paragraphs.map((p, i) => (
                <SimpleMarkdown key={i} text={p} />
              ))}
            </Text>
          )}
          {value !== undefined && (
            <Flex direction="column" gap="1">
              <Text size="1" weight="medium">
                Default
              </Text>
              {structured ? (
                <div
                  className="nowheel"
                  style={{
                    maxHeight: 240,
                    overflow: "auto",
                    border: "1px solid var(--gray-a5)",
                    borderRadius: "var(--radius-2)",
                  }}
                >
                  <JSONViewer data={value} />
                </div>
              ) : (
                <Code size="1" variant="ghost">
                  {value === null ? "none" : JSON.stringify(value)}
                </Code>
              )}
            </Flex>
          )}
        </Flex>
      </HoverCard.Content>
    </HoverCard.Root>
  );
}
