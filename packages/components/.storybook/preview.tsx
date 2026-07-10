import { Controls, Description, Primary, Stories, Subtitle, Title } from "@storybook/addon-docs/blocks";
import type { Preview } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Theme, ViewerConfigProvider, ViewerExportFrame, type LayoutDefaults } from "@r4pm/components";
import {
  createElkDfgLayout,
  createElkGraphLayout,
  elkDeclareLayout,
  elkLayoutPetriNet,
} from "@r4pm/components/elk-layout";
import { FullSource, ReferencedTypes } from "./doc-blocks";
// Global styles so every story + autodocs canvas renders with the viewers' real styling.
import "../src/styles.css";

/** Stories run standalone (no backend), so default every graph viewer to the ELK engine - the core
 *  ships none. Real layouts render; SVG export (backend-only) is not wired in Storybook. */
const ELK_LAYOUT: LayoutDefaults = {
  dfg: createElkDfgLayout(),
  ocdfg: createElkGraphLayout("TB"),
  declare: elkDeclareLayout,
  petri: elkLayoutPetriNet,
};

/**
 * Per-story framing. `canvas` gives graph/plot viewers a fixed-height bordered box (height tuned
 * per component to its real layout, so wide-short graphs like Petri nets don't leave a tall white
 * gap). `pad` gives inputs/primitives/content-sized charts padding + intrinsic height. Stories opt
 * in via `parameters.frame`; default is `pad`.
 *
 * Stories render inline in the docs page (docs.story.inline). A root Radix Theme carries
 * `min-height: 100vh` (sized for a full-page app); inline that stretches the block to the whole
 * viewport, so we override `minHeight: 0` to let the Theme collapse to the framed content.
 */
type Frame = { mode: "canvas"; height: number } | { mode: "pad"; width?: number };

function Framed({
  frame,
  appearance,
  children,
}: {
  frame: Frame;
  appearance: "light" | "dark";
  children: ReactNode;
}) {
  if (frame.mode === "canvas") {
    return (
      <Theme appearance={appearance} style={{ height: frame.height, minHeight: 0 }}>
        <ViewerExportFrame>
          <div
            style={{
              height: frame.height,
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid var(--gray-a5)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {children}
          </div>
        </ViewerExportFrame>
      </Theme>
    );
  }
  return (
    <Theme appearance={appearance} style={{ minHeight: 0 }}>
      <div style={{ padding: 16, width: frame.width, maxWidth: "100%" }}>{children}</div>
    </Theme>
  );
}

const preview: Preview = {
  globalTypes: {
    colorScheme: {
      description: "Color scheme",
      toolbar: {
        title: "Scheme",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    colorScheme: "light",
  },
  // Docs-only sidebar: every component shows a single "Docs" entry (with its live example +
  // props table); the individual story leaves are hidden from the nav ("!dev") but still render
  // inside the Docs page.
  tags: ["autodocs", "!dev"],
  parameters: {
    // fullscreen: the decorator draws the bordered frame itself; Storybook's "padded" inset would
    // stack on top of it and add stray whitespace. Stories render inline (docs.story.inline), so a
    // canvas frame's height === its declared pixel height exactly (no iframe, no gap, no scrollbar).
    layout: "fullscreen",
    controls: { expanded: true },
    docs: {
      toc: true,
      // Default autodocs template + two generated sections: inline declarations of the types the
      // props table references, and the full copy-paste-runnable story source (see doc-blocks.tsx).
      page: () => (
        <>
          <Title />
          <Subtitle />
          <Description />
          <Primary />
          <Controls />
          <ReferencedTypes />
          {/* Without includePrimary={false} the primary story renders twice on single-story pages. */}
          <Stories includePrimary={false} />
          <FullSource />
        </>
      ),
    },
    options: {
      storySort: { order: ["Getting Started", "Viewers", "Inputs & Primitives", "*"] },
    },
  },
  decorators: [
    (Story, ctx) => {
      const frame = (ctx.parameters.frame as Frame) ?? { mode: "pad" };
      const appearance = ((ctx.globals.colorScheme as string) ?? "light") as "light" | "dark";
      return (
        <Framed frame={frame} appearance={appearance}>
          <ViewerConfigProvider value={{ layout: ELK_LAYOUT }}>
            <Story />
          </ViewerConfigProvider>
        </Framed>
      );
    },
  ],
};

export default preview;
