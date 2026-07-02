import { useQuery } from "@tanstack/react-query";
import type { BackendContext } from "@r4pm/client";
import { type ViewerRegistry, resolveViewerForReturnType } from "../viewers";

export interface BindingViewerPanelProps {
  backend: BackendContext;
  /** Registry used to resolve the viewer for the binding's return type. */
  viewerRegistry: ViewerRegistry;
  /** Binding id to call. */
  bindingId: string;
  /** Arguments for the binding. */
  args: unknown;
  /** The schemars title of the binding's return type, used to pick the viewer. */
  returnType: string;
  /** Optional react-query key (defaults to `[bindingId, args]`). */
  queryKey?: readonly unknown[];
  /** Optional render overrides. */
  renderLoading?: () => React.ReactNode;
  renderError?: (error: unknown) => React.ReactNode;
}

/**
 * Runs one binding via react-query and renders its result through the viewer that `viewerRegistry`
 * resolves for the result's return-type title. A host can mount a visualization from just a binding
 * id and return type, with no per-binding component.
 */
export function BindingViewerPanel({
  backend,
  viewerRegistry,
  bindingId,
  args,
  returnType,
  queryKey,
  renderLoading,
  renderError,
}: BindingViewerPanelProps) {
  const { data, error, isPending } = useQuery({
    queryKey: queryKey ?? [bindingId, args],
    // Dynamic dispatch: the host runs an arbitrary binding chosen at runtime, so the strongly-typed
    // per-id `callBinding` overload can't apply.
    queryFn: () => (backend.callBinding as (id: string, a: unknown) => Promise<unknown>)(bindingId, args),
  });

  if (error) {
    return renderError ? (
      renderError(error)
    ) : (
      <pre data-testid="error" style={{ color: "crimson", padding: 16 }}>
        {String(error)}
      </pre>
    );
  }
  if (isPending) {
    return renderLoading ? renderLoading() : <div style={{ padding: 16 }}>computing…</div>;
  }

  const viewer = resolveViewerForReturnType(viewerRegistry, returnType, bindingId);
  if (!viewer) return <pre style={{ padding: 16 }}>No viewer registered for "{returnType}".</pre>;
  const Viewer = viewer.component;
  return (
    <div style={{ height: "100%", width: "100%" }}>
      <Viewer data={data} returnType={returnType} />
    </div>
  );
}
