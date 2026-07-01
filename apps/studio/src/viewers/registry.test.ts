import { describe, expect, it } from "vitest";
import { ViewerRegistry, defineViewer, resolveViewerForReturnType } from "./registry";

const dummy = () => null;
const foo = defineViewer({
  id: "foo",
  title: "Foo",
  accepts: ({ returnType }) => returnType === "Foo",
  component: dummy,
});
const bar = defineViewer({
  id: "bar",
  title: "Bar",
  accepts: ({ returnType }) => returnType === "Bar",
  component: dummy,
});

describe("ViewerRegistry", () => {
  it("resolves a viewer by its accepted return type", () => {
    const r = new ViewerRegistry().register(foo, bar);
    expect(r.resolve({ returnType: "Foo" })?.id).toBe("foo");
    expect(r.resolve({ returnType: "Bar" })?.id).toBe("bar");
  });

  it("returns undefined when no viewer accepts the return type", () => {
    const r = new ViewerRegistry().register(foo);
    expect(r.resolve({ returnType: "Nope" })).toBeUndefined();
  });

  it("returns the first registered viewer when several accept at equal priority (order wins)", () => {
    const a = defineViewer({ id: "a", title: "A", accepts: () => true, component: dummy });
    const b = defineViewer({ id: "b", title: "B", accepts: () => true, component: dummy });
    expect(new ViewerRegistry().register(a, b).resolve({ returnType: "x" })?.id).toBe("a");
  });

  it("prefers higher priority over registration order when several accept", () => {
    const low = defineViewer({ id: "low", title: "Low", accepts: () => true, priority: 0, component: dummy });
    const high = defineViewer({
      id: "high",
      title: "High",
      accepts: () => true,
      priority: 10,
      component: dummy,
    });
    // `high` wins whether it is registered after `low` or before it.
    expect(new ViewerRegistry().register(low, high).resolve({ returnType: "x" })?.id).toBe("high");
    expect(new ViewerRegistry().register(high, low).resolve({ returnType: "x" })?.id).toBe("high");
  });

  it("matches on sourceBindingId provenance, not just return type", () => {
    const activities = defineViewer({
      id: "activities",
      title: "Activities",
      accepts: (m) => m.returnType === "Array_of_string" && m.sourceBindingId === "get_activities",
      component: dummy,
    });
    const r = new ViewerRegistry().register(activities);
    expect(r.resolve({ returnType: "Array_of_string", sourceBindingId: "get_activities" })?.id).toBe(
      "activities",
    );
    expect(r.resolve({ returnType: "Array_of_string", sourceBindingId: "get_object_types" })).toBeUndefined();
  });

  it("exposes all registered viewers via all()", () => {
    const r = new ViewerRegistry().register(foo, bar);
    expect(r.all().map((v) => v.id)).toEqual(["foo", "bar"]);
  });

  it("resolveViewerForReturnType is a thin wrapper over resolve", () => {
    const r = new ViewerRegistry().register(foo);
    expect(resolveViewerForReturnType(r, "Foo")?.id).toBe("foo");
    expect(resolveViewerForReturnType(r, "Bar")).toBeUndefined();
  });
});
