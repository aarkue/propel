import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { AsyncBoundary, EmptyState, ErrorState, LoadingState, SkeletonTable } from "@r4pm/components";
import { Button } from "@r4pm/components/ui";
import { PiDatabaseLight } from "react-icons/pi";

const meta = {
  title: "Inputs & Primitives/Async State",
  component: LoadingState,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof LoadingState>;
export default meta;

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      position: "relative",
      width: 560,
      height: 220,
      border: "1px solid var(--gray-5)",
      borderRadius: 8,
    }}
  >
    {children}
  </div>
);

export const Loading: StoryObj = {
  name: "Loading",
  render: () => (
    <Frame>
      <LoadingState label="discovering DFG" />
    </Frame>
  ),
};

export const LoadingSlow: StoryObj = {
  name: "Loading (slow hint)",
  render: () => (
    <Frame>
      <LoadingState label="mining process model" slowAfterMs={0} />
    </Frame>
  ),
};

export const Errored: StoryObj = {
  name: "Error",
  render: () => (
    <Frame>
      <ErrorState error={new Error("Binding failed: OCEL handle expired")} onRetry={() => {}} />
    </Frame>
  ),
};

export const Empty: StoryObj = {
  name: "Empty",
  render: () => (
    <Frame>
      <EmptyState
        title="No OCEL loaded"
        description="Import an OCEL to discover its object-centric DFG."
        icon={<PiDatabaseLight />}
        action={
          <Button size="1" variant="soft">
            Load OCEL
          </Button>
        }
      />
    </Frame>
  ),
};

export const Skeleton: StoryObj = {
  name: "Skeleton (opt-in)",
  render: () => (
    <Frame>
      <SkeletonTable rows={5} cols={4} />
    </Frame>
  ),
};

export const Boundary: StoryObj = {
  name: "AsyncBoundary (data)",
  render: () => (
    <Frame>
      <AsyncBoundary
        status={{ isPending: false, isError: false, data: ["a", "b", "c"] }}
        isEmpty={(d) => d.length === 0}
      >
        {(rows) => <div style={{ padding: 24 }}>Loaded {rows.length} rows.</div>}
      </AsyncBoundary>
    </Frame>
  ),
};
