import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";
import remarkGfm from "remark-gfm";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  // GFM tables/strikethrough are opt-in in Storybook's MDX pipeline; enable remark-gfm so the
  // generated Data Types page (and any MDX tables) render as tables instead of literal `| … |` text.
  addons: [
    {
      name: "@storybook/addon-docs",
      options: { mdxPluginOptions: { mdxCompileOptions: { remarkPlugins: [remarkGfm] } } },
    },
  ],
  core: {
    disableTelemetry: true,
    disableWhatsNewNotifications: true,
  },
  managerHead: (head) => `${head}<style>[title="About your Storybook"]{display:none!important}</style>`,
  // Normalize file:// imports back to filesystem paths.
  viteFinal: (cfg) => {
    cfg.plugins = cfg.plugins ?? [];
    cfg.plugins.push({
      name: "r4pm-resolve-file-url",
      enforce: "pre",
      resolveId: (id) => (id.startsWith("file://") ? fileURLToPath(id) : null),
    });
    return cfg;
  },
  typescript: {
    // Auto-generate the props/args tables from our TS interfaces + JSDoc.
    reactDocgen: "react-docgen-typescript",
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      shouldRemoveUndefinedFromOptional: true,
      // Only docgen this package's own source. Workspace deps (e.g. @r4pm/components/petri, whose
      // `main` is raw `src/`) get pulled into the module graph by viewers like the Petri net editor;
      // without this scope react-docgen-typescript tries to parse their .tsx (not in this package's
      // TS program) and warns "not included in the active TypeScript project" for each. They have no
      // stories, so nothing is lost. Program-based type resolution is unaffected.
      include: ["src/**/*.tsx"],
      exclude: ["**/*.stories.tsx"],
      // Keep our own props (incl. workspace @r4pm/* sources); drop inherited DOM/React props.
      propFilter: (prop) => (prop.parent ? !/node_modules/.test(prop.parent.fileName) : true),
    },
  },
};

export default config;
