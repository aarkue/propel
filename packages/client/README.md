# @r4pm/client

Typed client for the engine binding registry: a `callBinding(id, args)` whose
argument and result types are generated from the engine's schemars JSON Schemas,
plus the transport-agnostic `BackendContext` interface and branded `Handle<K>` types.

```ts
import type { BackendContext, Bindings, EventLogHandle } from "@r4pm/client";

const dfg = await backend.callBinding(
  "process_mining::discovery::case_centric::dfg::discover_dfg",
  { event_log: "log-1" as EventLogHandle },
); // typed as DirectlyFollowsGraph
```

- `BackendContext` - `callBinding`, `listObjects()`, `listFunctions()`. Implement per transport (wasm/tauri/fetch).
- `Bindings` - generated map of every binding's `args`/`ret` types (names from schemars `title`).
- `Handle<K>` - branded id; big data stays in the engine, TS holds the handle.
- Regenerate after Rust changes: `pnpm codegen` (input `gen/bindings-meta.json`).

Data stays in Rust/WASM; this package moves handles, metadata, and small results only.
