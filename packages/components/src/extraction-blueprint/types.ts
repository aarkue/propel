// Re-exports of the generated extraction-blueprint model types, under the names Part B's plan
// specifies (Blueprint, Node, NodeOp, Target, ...). See model.generated.ts's header for how these
// are produced: schemars -> JSON Schema -> TypeScript via scripts/gen-extraction-blueprint-types.mjs,
// not hand-mirrored. This file exists so the rest of the package imports from a stable local path
// ("./types") rather than "./model.generated" directly, matching the file Part B's plan calls for.
//
// Includes report.rs's output types (ExtractionReport and friends) alongside the Blueprint model
// types: both are now generated from the same schema dump, so there is no reason to keep them in
// a separate hand-written file (see git history for `results.ts`, since deleted -- it existed only
// while those Rust types had no JsonSchema derive to generate from).
export type {
  AttributeMapping,
  Blueprint,
  ColumnSchema,
  CompareOp,
  CompileError,
  CompiledOcel,
  DropReason,
  DuplicateObjectPolicy,
  EmissionShape,
  EventEndpoint,
  ExtractionCatalog,
  ExtractionError,
  ExtractionReport,
  FinalizeReport,
  IdRendering,
  InlineObjectRef,
  Literal,
  Mapping,
  MappingEntry,
  MappingRef,
  MappingStats,
  MissingEndpointPolicy,
  Node,
  NodeOp,
  ObjectEndpoint,
  OCELAttributeType,
  Operand,
  Predicate,
  Probe,
  ProbeKind,
  ProviderError,
  RejectReason,
  SinkError,
  SplitKind,
  SplitSpec,
  SqlDialect,
  TablePreview,
  TableSchema,
  Target,
  TimestampFormat,
  TimestampPart,
  TimestampSource,
  ValidationError,
  ValueExpression,
  ViewDef,
} from "./model.generated";
