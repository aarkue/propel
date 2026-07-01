import { addons } from "storybook/manager-api";
import { create } from "storybook/theming/create";

addons.setConfig({
  enableShortcuts: false,
  theme: create({
    base: "light",
    brandTitle: "@r4pm/components",
    colorPrimary: "#654dc4",
    colorSecondary: "#2b9a66",
    appBorderRadius: 8,
    fontBase: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  }),
});
