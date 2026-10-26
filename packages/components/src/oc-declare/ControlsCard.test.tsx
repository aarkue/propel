import { Theme } from "@r4pm/components/ui";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ControlsCard, type ControlsCardProps } from "./ControlsCard";

const color = () => "#888888";
const noop = () => {};
const objectTypes = Array.from({ length: 300 }, (_, i) => `ot${String(i).padStart(3, "0")}`);

const props: ControlsCardProps = {
  direction: "RIGHT",
  onDirectionChange: noop,
  textLabels: false,
  onTextLabelsChange: noop,
  hiddenArcTypes: new Set(),
  onToggleArcType: noop,
  objectTypes,
  hiddenObjectTypes: new Set(objectTypes.slice(0, 5)),
  onSetHiddenObjectTypes: noop,
  activities: ["a", "b"],
  hiddenActivities: new Set(),
  onSetHiddenActivities: noop,
  showCombined: true,
  activityColor: color,
  objectTypeColor: color,
};

const render = (p: Partial<ControlsCardProps> = {}) =>
  renderToStaticMarkup(
    <Theme>
      <ControlsCard {...props} {...p} />
    </Theme>,
  );

describe("ControlsCard", () => {
  it("shows object types as one picker button, also for hundreds of types", () => {
    const html = render();
    expect(html).toContain("295/300 shown");
    expect(html).not.toContain("ot123");
  });

  it("can leave the activities section out", () => {
    expect(render()).toContain("Activities");
    expect(render({ showActivities: false })).not.toContain("Activities");
  });
});
