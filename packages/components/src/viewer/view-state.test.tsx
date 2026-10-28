import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useViewSetting, ViewStateProvider } from "./view-state";

describe("useViewSetting", () => {
  it("keeps both writes when two settings change before the host re-renders", () => {
    const writes: Record<string, unknown>[] = [];
    let setVariant: (v: number) => void = () => {};
    let setCase: (v: string | null) => void = () => {};
    function Probe() {
      setVariant = useViewSetting("variant", 0)[1];
      setCase = useViewSetting<string | null>("case", null)[1];
      return null;
    }
    renderToStaticMarkup(
      <ViewStateProvider viewState={{ case: "c1", bands: true }} onViewStateChange={(s) => writes.push(s)}>
        <Probe />
      </ViewStateProvider>,
    );
    setVariant(3);
    setCase(null);
    expect(writes[writes.length - 1]).toEqual({ variant: 3, case: null, bands: true });
  });
});
