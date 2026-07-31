// Public exports for the extraction-blueprint editor. See model.ts's header and
// model.generated.ts's header for why the model types are generated (schemars -> JSON Schema ->
// TypeScript, scripts/gen-extraction-blueprint-types.mjs) rather than hand-mirrored or imported
// from @r4pm/client -- this package must not depend on @r4pm/client (dfg/index.tsx,
// oc-declare/index.tsx precedent: it is consumed by both propel's studio and OCPQ, which each
// generate their own bindings over the same rust4pm crate).
export { BlueprintGraph } from "./BlueprintGraph";
export type { BlueprintGraphProps } from "./BlueprintGraph";

export {
  deriveEdges,
  entryMappings,
  entryNode,
  entryTargetKind,
  fromBlueprint,
  mappingIdForIndex,
  newBlueprint,
  singleEntry,
  toBlueprint,
  withEntryNode,
} from "./model";
export type { DerivedEdge, EdgeKind, EditorBlueprint, EditorMapping, EditorNode } from "./model";

export {
  categoryOf,
  describeExpr,
  describeLiteral,
  describeNodeOp,
  describeOperand,
  describePredicate,
  describeTimestamp,
  mappingsByNode,
  mappingSummaryLines,
  mappingTitle,
  TARGET_LABEL,
} from "./node-summary";
export type { MappingCategory, SummaryLine } from "./node-summary";

export { layoutBlueprintGraph } from "./elk-layout";
export type { BlueprintLayoutFn, LayoutResult as BlueprintLayoutResult } from "./elk-layout";

export {
  declaredKind,
  guessColumnKind,
  rankedColumnInfo,
  resolveAllNodeColumns,
  resolveColumnInfo,
  resolveNodeColumns,
  scoreColumn,
} from "./schema-resolution";
export type { ColumnHint, ColumnInfo, ValueKind } from "./schema-resolution";

export { useEditContext, EditContext } from "./edit/edit-context";
export type { BlueprintEditCallbacks, EditContextValue } from "./edit/edit-context";

export { PredicateEditor } from "./edit/PredicateEditor";
export type { PredicateEditorProps } from "./edit/PredicateEditor";
export { ValueExpressionEditor, insertColumnToken, moveItem } from "./edit/ValueExpressionEditor";
export type { ValueExpressionEditorProps } from "./edit/ValueExpressionEditor";
export { TargetEditor, ObjectEndpointEditor, EventEndpointEditor } from "./edit/TargetEditor";
export type { TargetEditorProps } from "./edit/TargetEditor";
export { ConnectionsDialog } from "./edit/ConnectionsDialog";
export { LeftToolbar, RightToolbar, GlobalErrorBanner } from "./edit/EditToolbar";
export { Disclosure, Field } from "./edit/Disclosure";
export type { DisclosureProps } from "./edit/Disclosure";
export { ColumnPicker } from "./edit/ColumnPicker";
export type { ColumnPickerProps } from "./edit/ColumnPicker";
export { SplitSpecEditor, defaultSplitSpec, previewSplit } from "./edit/SplitSpecEditor";
export {
  buildConnectionString,
  describeConnection,
  maskSecrets,
  parseConnectionString,
  isAutoSourceId,
  suggestedSourceId,
  CONNECTION_KIND_LABEL,
  EMPTY_DRAFT,
} from "./edit/connection-string";
export type { ConnectionDraft, ConnectionKind } from "./edit/connection-string";
export { BlueprintFileDialog } from "./edit/BlueprintFileDialog";
export {
  exportBlueprint,
  importBlueprint,
  suggestFilename,
  SUPPORTED_VERSION,
} from "./edit/blueprint-file";
export type { BlueprintDocument, ExportedBlueprint, ImportResult } from "./edit/blueprint-file";
export { NodeDialog } from "./edit/NodeDialog";
export type { NodeDialogProps, NodeDialogRequest } from "./edit/NodeDialog";
export { AddTableMenu, TableList, filterCatalog } from "./edit/AddTableMenu";
export type { TableRef } from "./edit/AddTableMenu";
export {
  attributeNameFor,
  knownTypeNames,
  relationIdColumns,
  scoringColumns,
  suggestJoinKeys,
  suggestMappingSeed,
  typeNameFromTable,
  addMapping,
  addTransform,
  childCount,
  childPosition,
  convertEntry,
  convertNodeOp,
  defaultEntry,
  defaultNodeOp,
  defaultTarget,
  freshId,
  renameSourceId,
  isTransformKind,
  KIND_META,
  MAPPING_KINDS,
  TRANSFORM_KINDS,
} from "./edit/node-draft";
export type { DraftKind, MappingSeed } from "./edit/node-draft";
export { groupValidationErrors, describeValidationError } from "./edit/ValidationBadges";
export type { GroupedErrors } from "./edit/ValidationBadges";

export {
  SourceNode,
  FilterNode,
  JoinNode,
  UnionNode,
  MappingNode,
  NodeShell,
  SummaryRows,
  KIND_ACCENT,
  NODE_SIZE,
  blueprintNodeTypes,
} from "./nodes";
export type { BlueprintNodeData, MappingNodeData, NodeKind } from "./nodes";

// Model + report types, all generated from the Rust model's JSON Schema; see ./types.ts for the
// full list and model.generated.ts's header for how. report.rs's output types
// (ExtractionReport/ExtractionError/MappingStats/MappingRef/DropReason/FinalizeReport/
// ProviderError/SinkError) gained JsonSchema derives after this package's first pass, at which
// point they moved from a hand-written results.ts (since deleted) into the same generated file.
// compile.rs's output types (CompiledOcel/ViewDef/Probe/ProbeKind/CompileError/RejectReason/
// EmissionShape/SqlDialect) followed the same path once compile.rs gained the derives.
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
} from "./types";
