import { Theme } from "@r4pm/components/ui";
import { ReactFlowProvider } from "@xyflow/react";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ActivityNode, hoverAction } from "./ActivityNode";
import { EditContext, type EditContextValue } from "./edit/edit-context";
import { VizProvider } from "./VizContext";

const color = () => "#888888";
const noop = () => {};

function render({
  kind = "activity",
  hovered = true,
  edit = false,
}: {
  kind?: "activity" | "init";
  hovered?: boolean;
  edit?: boolean;
} = {}) {
  const node = (
    <ActivityNode
      {...({
        id: "n1",
        data: { label: "place order", kind, objectTypes: [] },
        width: 150,
        height: 58,
      } as unknown as ComponentProps<typeof ActivityNode>)}
    />
  );
  return renderToStaticMarkup(
    <Theme>
      <ReactFlowProvider>
        <VizProvider
          value={{
            activityColor: color,
            objectTypeColor: color,
            hiddenObjectTypes: new Set(),
            hiddenArcTypes: new Set(),
            focusedNodeId: null,
            hoveredNodeId: hovered ? "n1" : null,
            eventTypeCounts: {},
            showTextLabels: false,
            onHideActivity: noop,
            onFocusActivity: noop,
          }}
        >
          {edit ? (
            <EditContext.Provider value={{ callbacks: {} } as unknown as EditContextValue}>
              {node}
            </EditContext.Provider>
          ) : (
            node
          )}
        </VizProvider>
      </ReactFlowProvider>
    </Theme>,
  );
}

describe("ActivityNode hover actions", () => {
  it("offer Hide and Focus on a hovered read-only activity", () => {
    const html = render();
    expect(html).toContain("Hide");
    expect(html).toContain("Focus");
  });

  it("stay away from unhovered nodes, object nodes and edit mode", () => {
    expect(render({ hovered: false })).not.toContain("Hide");
    expect(render({ kind: "init" })).not.toContain("Hide");
    expect(render({ edit: true })).not.toContain("Hide");
  });
});

describe("hoverAction", () => {
  it("runs the action for the activity without the click reaching the node", () => {
    const action = vi.fn();
    const event = { stopPropagation: vi.fn() };
    hoverAction(action, "place order")(event as unknown as React.MouseEvent);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(action).toHaveBeenCalledWith("place order");
  });
});
