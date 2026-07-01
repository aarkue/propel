import { Card, Heading, Kbd, Text } from "@r4pm/components/ui";
import { PiInfo } from "react-icons/pi";
import { shortcutLabel } from "../shell/platform";
import { definePanel } from "./define-vis";

function AboutPanel() {
  return (
    <Card className="h-full w-full">
      <div className="flex flex-col items-center text-center gap-4 py-6 px-4 max-w-md mx-auto">
        <img src="/icon.png" alt="propel" className="size-20 rounded-full" />
        <Heading size="6">propel</Heading>
        <Text size="2" color="gray">
          A process-mining workbench for event logs and OCEL 2.0: Rust backend, React frontend, deployable to
          the browser (wasm), a web server, or the desktop.
        </Text>
        <div className="text-left text-xs text-[var(--gray-11)] space-y-1.5 w-full">
          <div>
            Press <Kbd>{shortcutLabel("K")}</Kbd> to open the command palette.
          </div>
          <div>Drop files anywhere in the window to import them.</div>
          <div>Click "Add panel" in the top bar to browse visualisations.</div>
        </div>
      </div>
    </Card>
  );
}

export const vis = definePanel({
  type: "about",
  name: "About propel",
  description: "What this tool is + key shortcuts.",
  category: "overview",
  icon: PiInfo,
  keywords: ["help", "about", "info"],
  genericExport: false,
  order: 21,
  component: AboutPanel,
});
