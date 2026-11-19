import { ErrorState } from "@r4pm/components";
import type { IDockviewPanelProps } from "dockview";
import { Component, type ComponentType, type ReactNode } from "react";

/** Keeps a panel's render error inside the panel, so the rest of the app stays usable. */
export class PanelErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    console.error("Panel crashed:", error);
  }

  render() {
    if (this.state.error == null) return this.props.children;
    return (
      <ErrorState
        title="This panel crashed"
        error={this.state.error}
        retryLabel="Reload panel"
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}

export function withPanelErrorBoundary(
  Panel: ComponentType<IDockviewPanelProps>,
): ComponentType<IDockviewPanelProps> {
  return function Guarded(props: IDockviewPanelProps) {
    return (
      <PanelErrorBoundary>
        <Panel {...props} />
      </PanelErrorBoundary>
    );
  };
}
