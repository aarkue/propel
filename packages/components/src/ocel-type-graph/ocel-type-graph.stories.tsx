import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { useState } from "react";
import { OcelTypeGraph, type OcelTypeGraphEdge, type OcelTypeGraphNode } from "./OcelTypeGraph";
import { OcelTypeGraphViewer } from "./OcelTypeGraphViewer";
import { TypeScopeSelector } from "./TypeScopeSelector";

const nodes: OcelTypeGraphNode[] = [
  { id: "e:place order", label: "place order", kind: "event", count: 1200 },
  { id: "e:confirm order", label: "confirm order", kind: "event", count: 1150 },
  { id: "e:pick item", label: "pick item", kind: "event", count: 4300 },
  { id: "e:pay order", label: "pay order", kind: "event", count: 980 },
  { id: "o:order", label: "order", kind: "object", count: 1200 },
  { id: "o:item", label: "item", kind: "object", count: 8700 },
  { id: "o:customer", label: "customer", kind: "object", count: 340 },
];

const edges: OcelTypeGraphEdge[] = [
  { id: "1", source: "e:place order", target: "o:order", qualifier: "creates" },
  { id: "2", source: "e:place order", target: "o:customer", qualifier: "by" },
  { id: "3", source: "e:confirm order", target: "o:order", qualifier: "confirms" },
  { id: "4", source: "e:pick item", target: "o:item", qualifier: "picks" },
  { id: "5", source: "e:pay order", target: "o:order", qualifier: "pays" },
  { id: "6", source: "o:order", target: "o:item", qualifier: "contains" },
  { id: "7", source: "o:order", target: "o:customer", qualifier: "placed-by" },
  { id: "8", source: "o:item", target: "o:item", qualifier: "replaces" },
];

// The preview decorator provides <Theme> + a sized canvas frame; render components directly.
const meta = {
  title: "Viewers/OCEL Type Graph",
  component: OcelTypeGraph,
  parameters: {
    frame: { mode: "canvas", height: 620 },
    docs: { story: { iframeHeight: 660, inline: false } },
  },
} satisfies Meta<typeof OcelTypeGraph>;
export default meta;

export const FullViewer: StoryObj = {
  name: "Full viewer (auto scope + scope picker)",
  render: () => <OcelTypeGraphViewer nodes={nodes} edges={edges} autoScopeLimit={4} />,
};

export const Default: StoryObj = {
  name: "Bare type graph",
  render: () => <OcelTypeGraph nodes={nodes} edges={edges} />,
};

export const WithScopeSelector: StoryObj = {
  name: "Composed with TypeScopeSelector (decoupled)",
  render: () => {
    const [scope, setScope] = useState<Set<string>>(new Set(nodes.map((n) => n.id)));
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ padding: 8 }}>
          <TypeScopeSelector items={nodes} value={scope} onChange={setScope} />
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <OcelTypeGraph nodes={nodes} edges={edges} visibleNodeIds={scope} />
        </div>
      </div>
    );
  },
};

export const HostSelection: StoryObj = {
  name: "Host-driven selection (source/target)",
  render: () => {
    const [source, setSource] = useState<string | null>("e:place order");
    const [target, setTarget] = useState<string | null>("o:item");
    return (
      <OcelTypeGraph
        nodes={nodes}
        edges={edges}
        nodeRingColor={(id) => (id === source ? "#10b98180" : id === target ? "#f43f5e80" : undefined)}
        onNodeClick={(id) => {
          if (!source || (source && target)) {
            setSource(id);
            setTarget(null);
          } else if (id !== source) {
            setTarget(id);
          }
        }}
      />
    );
  },
};

/** Dimmed types and highlighted relations carry over into the image export. */
export const HostHighlight: StoryObj = {
  name: "Host-driven highlight (dimmed types, colored relations)",
  render: () => {
    const onPath = new Set(["e:place order", "o:order", "o:item"]);
    return (
      <OcelTypeGraph
        nodes={nodes}
        edges={edges}
        nodeRingColor={(id) => (id === "e:place order" ? "#10b981" : id === "o:item" ? "#f43f5e" : undefined)}
        nodeDimmed={(id) => !onPath.has(id)}
        edgeStyle={(id) => (id === "1" || id === "6" ? { color: "#2563eb", width: 3 } : { dimmed: true })}
      />
    );
  },
};
