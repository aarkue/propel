// Generate a JSON manifest of the TS types this package exports (root + subpath entries): name,
// kind, defining file, and the declaration source text incl. its JSDoc. The custom autodocs page
// (.storybook/doc-blocks.tsx) renders, per component, the entries referenced from that component's
// props table -- inline on the component's docs page, no separate reference page. Output is
// committed; re-run with `pnpm --filter @r4pm/components docs:types` when exported types change.
import { writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const SRC = join(pkg, "src") + sep;
const OUT = join(pkg, ".storybook/component-types.generated.json");

// Entry order doubles as collision priority: a name exported from "." shadows subpath exports.
const ENTRIES = [
  ["@r4pm/components", "src/index.ts"],
  ["@r4pm/components/petri", "src/petri/index.ts"],
  ["@r4pm/components/charts", "src/charts/index.ts"],
  ["@r4pm/components/ui", "src/ui/index.ts"],
];

const KIND = {
  [ts.SyntaxKind.InterfaceDeclaration]: "interface",
  [ts.SyntaxKind.TypeAliasDeclaration]: "type",
  [ts.SyntaxKind.EnumDeclaration]: "enum",
};

const cfgPath = join(pkg, "tsconfig.json");
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, pkg);
const program = ts.createProgram(
  ENTRIES.map(([, f]) => join(pkg, f)),
  cfg.options,
);
const checker = program.getTypeChecker();

const types = new Map(); // name -> { name, kind, entry, file, code }

for (const [entry, rel] of ENTRIES) {
  const sf = program.getSourceFile(join(pkg, rel));
  const modSym = sf && checker.getSymbolAtLocation(sf);
  if (!modSym) {
    console.warn(`WARN: entry ${rel} not resolvable as a module`);
    continue;
  }
  for (let sym of checker.getExportsOfModule(modSym)) {
    if (sym.flags & ts.SymbolFlags.Alias) {
      try {
        sym = checker.getAliasedSymbol(sym);
      } catch {
        continue;
      }
    }
    for (const decl of sym.declarations ?? []) {
      const kind = KIND[decl.kind];
      if (!kind) continue;
      const dsf = decl.getSourceFile();
      // Only this package's own source; workspace/node_modules types are documented elsewhere
      // (bindings on the Data Types page).
      if (!dsf.fileName.startsWith(SRC)) continue;
      const name = sym.name;
      if (types.has(name)) {
        const prev = types.get(name);
        if (prev.file !== relative(pkg, dsf.fileName))
          console.warn(`WARN: "${name}" also exported from ${entry} (${relative(pkg, dsf.fileName)}); keeping ${prev.entry} (${prev.file})`);
        break;
      }
      // getStart(sf, true) includes the leading JSDoc block, so descriptions travel with the code.
      const code = dsf.text.slice(decl.getStart(dsf, true), decl.end).trim();
      types.set(name, { name, kind, entry, file: relative(pkg, dsf.fileName), code });
      break;
    }
  }
}

const list = [...types.values()].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(OUT, `${JSON.stringify(list, null, 2)}\n`);
console.log(`wrote ${OUT}: ${list.length} exported types`);
