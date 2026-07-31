# extraction-blueprint schema dumper

One-off Rust tool: dumps JSON Schema (2020-12, via `schemars`) for the
`process_mining::core::event_data::object_centric::extraction` model types (`Blueprint`,
`ExtractionCatalog`, `ValidationError`, `ExtractionReport`, `ExtractionError`, and everything
reachable from them) to stdout.

Not part of any normal build (npm or cargo). Run manually whenever the Rust model changes, then
feed the output into `../gen-extraction-blueprint-types.mjs` to regenerate
`src/extraction-blueprint/model.generated.ts`.

## Usage

`Cargo.toml`'s `process_mining` dependency is a `path` dependency pointing at a local checkout of
rust4pm's `feat/extraction-blueprint-migration` branch (or whatever branch/commit has the
`extraction-blueprint` feature). Edit the path if your checkout lives elsewhere, then:

```sh
cd gen-extraction-blueprint-schema-rs
cargo run --release > ../extraction-blueprint.schema.json
cd ..
node gen-extraction-blueprint-types.mjs
```

This requires only the `extraction-blueprint` Cargo feature (pure model types, `dep:regex` +
`dep:regex-syntax`, no `dbcon`) -- it builds standalone even when `dbcon`'s `sea-schema` git
dependency is broken, since that dependency only gates `process_mining`'s `extraction-dbcon`.
