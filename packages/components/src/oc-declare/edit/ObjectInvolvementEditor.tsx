import {
  Badge,
  Button,
  Flex,
  IconButton,
  SegmentedControl,
  Tabs,
  Text,
  TextField,
} from "@r4pm/components/ui";
import { useId, useState } from "react";
import { PiArrowLeft, PiArrowRight, PiPlus, PiX } from "react-icons/pi";
import type { OCDeclareArcLabel, ObjectTypeAssociation } from "../index";
import type { DeclareNode } from "../model";
import type { SupportCtx } from "./edit-context";

type Group = "each" | "all" | "any";
const GROUPS: Group[] = ["each", "all", "any"];

const assocText = (a: ObjectTypeAssociation) =>
  a.type === "Simple" ? a.object_type : `${a.first} ${a.reversed ? "◄" : "►"} ${a.second}`;

/** Inline each/all/any object-involvement editor: removable chips per group + a compact add form
 *  (Simple or O2O, with E2O/O2O support hint). Edits are live via `onChange` (no Save step). */
export function ObjectInvolvementEditor({
  value,
  objectTypes,
  source,
  target,
  getSupport,
  onChange,
}: {
  value: OCDeclareArcLabel;
  objectTypes: string[];
  source: DeclareNode;
  target: DeclareNode;
  getSupport?: (a: ObjectTypeAssociation, ctx: SupportCtx) => number | undefined;
  onChange: (v: OCDeclareArcLabel) => void;
}) {
  const listId = useId();
  const [group, setGroup] = useState<Group>("all");
  const [mode, setMode] = useState<"simple" | "o2o">("simple");
  const [simple, setSimple] = useState("");
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [reversed, setReversed] = useState(false);

  const draft: ObjectTypeAssociation | null =
    mode === "simple"
      ? simple.trim()
        ? { type: "Simple", object_type: simple.trim() }
        : null
      : first.trim() && second.trim()
        ? { type: "O2O", first: first.trim(), second: second.trim(), reversed }
        : null;

  const add = () => {
    if (!draft) return;
    onChange({ ...value, [group]: [...value[group], draft] });
    setSimple("");
    setFirst("");
    setSecond("");
  };
  const removeAt = (g: Group, i: number) =>
    onChange({ ...value, [g]: value[g].filter((_, idx) => idx !== i) });

  const support = draft && getSupport ? getSupport(draft, { source, target }) : undefined;

  return (
    <div>
      {GROUPS.map((g) => (
        <Flex key={g} align="center" gap="2" mb="1">
          <Text size="1" color="gray" weight="medium" style={{ width: 30 }}>
            {g}
          </Text>
          <Flex gap="1" wrap="wrap" style={{ flex: 1 }}>
            {value[g].length === 0 ? (
              <Text size="1" color="gray">
                —
              </Text>
            ) : (
              value[g].map((a, i) => (
                <Badge key={`${assocText(a)}-${i}`} variant="soft" size="1">
                  {assocText(a)}
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    aria-label="remove"
                    onClick={() => removeAt(g, i)}
                  >
                    <PiX size={9} />
                  </IconButton>
                </Badge>
              ))
            )}
          </Flex>
        </Flex>
      ))}

      <Flex align="center" gap="2" mt="2">
        <SegmentedControl.Root size="1" value={group} onValueChange={(v) => setGroup(v as Group)}>
          <SegmentedControl.Item value="each">each</SegmentedControl.Item>
          <SegmentedControl.Item value="all">all</SegmentedControl.Item>
          <SegmentedControl.Item value="any">any</SegmentedControl.Item>
        </SegmentedControl.Root>
        <Tabs.Root value={mode} onValueChange={(v) => setMode(v as "simple" | "o2o")}>
          <Tabs.List size="1">
            <Tabs.Trigger value="simple">Simple</Tabs.Trigger>
            <Tabs.Trigger value="o2o">O2O</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </Flex>

      {mode === "simple" ? (
        <Flex gap="2" align="center" mt="1">
          <TextField.Root
            size="1"
            list={listId}
            placeholder="object type"
            value={simple}
            onChange={(e) => setSimple(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button size="1" onClick={add} disabled={!draft}>
            <PiPlus /> Add
          </Button>
        </Flex>
      ) : (
        <Flex gap="1" align="center" mt="1">
          <TextField.Root
            size="1"
            list={listId}
            placeholder="first"
            value={first}
            onChange={(e) => setFirst(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
          <IconButton size="1" variant="soft" onClick={() => setReversed((r) => !r)} title="Reverse relation">
            {reversed ? <PiArrowLeft /> : <PiArrowRight />}
          </IconButton>
          <TextField.Root
            size="1"
            list={listId}
            placeholder="second"
            value={second}
            onChange={(e) => setSecond(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
          <Button size="1" onClick={add} disabled={!draft}>
            <PiPlus />
          </Button>
        </Flex>
      )}
      {support != null && (
        <Text as="p" size="1" color={support > 0 ? "green" : "red"} mt="1">
          support: {support}
        </Text>
      )}
      <datalist id={listId}>
        {objectTypes.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}
