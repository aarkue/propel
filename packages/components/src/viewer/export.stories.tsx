import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo } from "react";
// Minimal example: what an external consumer imports.
import "@r4pm/components/styles.css";
import {
  PetriNetViewer,
  useRegisterExport,
  ViewerExportFrame,
  type PetriNet,
  type VectorExportSource,
} from "@r4pm/components";
import { Badge, Button, Card, Heading, Text } from "@r4pm/components/ui";

const sample: PetriNet = {
  places: [{ id: "p0" }, { id: "p1" }, { id: "p2" }],
  transitions: [
    { id: "a", label: "register request" },
    { id: "b", label: "decide" },
  ],
  arcs: [{ nodes: ["p0", "a"] }, { nodes: ["a", "p1"] }, { nodes: ["p1", "b"] }, { nodes: ["b", "p2"] }],
  initial_marking: { p0: 1 },
  final_marking: { p2: 1 },
};

const box = {
  height: 260,
  border: "1px solid var(--gray-a5)",
  borderRadius: 8,
  overflow: "hidden",
} as const;

const meta = {
  title: "Getting Started/Image Export",
  component: ViewerExportFrame,
  // The concepts page (concepts/image-export.mdx) is this component's docs page, so skip autodocs
  // rather than generate a second entry under the same title.
  tags: ["!autodocs"],
  // "pad" and not "canvas": a canvas frame supplies a ViewerExportFrame of its own, and these
  // stories need exactly one, their own.
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof ViewerExportFrame>;
export default meta;

export const Default: StoryObj<typeof ViewerExportFrame> = {
  name: "Wrapping a viewer",
  args: { filename: "petri-net", showMenu: true, menuPlacement: "top-right" },
  render: (args) => (
    <ViewerExportFrame {...args} style={box}>
      <PetriNetViewer data={sample} />
    </ViewerExportFrame>
  ),
};

export const Snapshot: StoryObj = {
  name: "Wrapping arbitrary content",
  render: () => (
    // No viewer registers a vector source here, so the menu offers the screenshot targets only.
    <ViewerExportFrame filename="summary" style={{ ...box, height: "auto" }}>
      <div style={{ padding: 16 }}>
        {/* data-export-ignore: chrome that should not end up in the image. */}
        <div data-export-ignore style={{ marginBottom: 12 }}>
          <Button size="1" variant="soft">
            Refresh
          </Button>
        </div>
        {/* data-export-root: the subtree the screenshot captures. */}
        <div data-export-root>
          <Card>
            <Heading size="3">Order handling</Heading>
            <Text as="p" size="2" color="gray">
              1 402 cases · 8 931 events
            </Text>
            <Badge color="green">fitness 0.94</Badge>
          </Card>
        </div>
      </div>
    </ViewerExportFrame>
  ),
};

/** Anything can advertise a vector rendering: build an SVG string and register it. */
function Sparkline({ values }: { values: number[] }) {
  const svg = useMemo(() => {
    const max = Math.max(...values, 1);
    const points = values
      .map((v, i) => `${(i / (values.length - 1)) * 280 + 10},${70 - (v / max) * 60}`)
      .join(" ");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80" viewBox="0 0 300 80"><polyline fill="none" stroke="#3358d4" stroke-width="2" points="${points}"/></svg>`;
  }, [values]);

  const source = useMemo<VectorExportSource>(() => ({ label: "Throughput", toSvg: () => svg }), [svg]);
  useRegisterExport("sparkline", source);

  // biome-ignore lint/security/noDangerouslySetInnerHtml: the SVG is built above, not user input.
  return <div style={{ padding: 16 }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export const CustomSource: StoryObj = {
  name: "Registering your own SVG",
  render: () => (
    <ViewerExportFrame filename="throughput" style={{ ...box, height: "auto" }}>
      <Sparkline values={[3, 7, 4, 9, 6, 11, 8, 14]} />
    </ViewerExportFrame>
  ),
};
