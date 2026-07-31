// Pure formatting helpers for `CompilePanel`. `extraction_compile` returns `CompiledOcel`'s raw
// data (dialect/shape/views/probes/errors) -- Rust's own `ddl`/`with_prelude`/`probe_statements`
// methods are not part of the serialized payload, since a bindings boundary can only carry data,
// not behavior -- so a UI has to reproduce them. Mirrors
// process_mining::core::event_data::object_centric::extraction::compile's `dialect` module and
// `CompiledOcel`'s own methods exactly. Only `SqlDialect::DuckDb` exists today; if a second
// dialect ships, `quoteIdent` needs its own arm, exactly like the Rust side's `match`.
import type { CompiledOcel, CompileError, MappingRef, Probe, RejectReason } from "../types";

function quoteIdent(dialect: CompiledOcel["dialect"], name: string): string {
  switch (dialect) {
    case "DuckDb":
      return `"${name.replace(/"/g, '""')}"`;
  }
}

/** `CompiledOcel::ddl` -- every relation as `CREATE VIEW`, in dependency order. What most users
 *  want to copy: it presents the OCEL 2.0 surface with no materialization, but needs `CREATE
 *  VIEW` rights. */
export function compiledDdl(compiled: CompiledOcel): string {
  return compiled.views
    .map((v) => `CREATE VIEW ${quoteIdent(compiled.dialect, v.name)} AS\n${v.body};`)
    .join("\n");
}

/** `CompiledOcel::materialize_ddl` -- every relation as `CREATE TABLE ... AS`, for a caller with
 *  write rights who wants a relation computed once rather than re-inlined on every reference. */
export function compiledMaterializeDdl(compiled: CompiledOcel): string {
  return compiled.views
    .map((v) => `CREATE TABLE ${quoteIdent(compiled.dialect, v.name)} AS\n${v.body};`)
    .join("\n");
}

/** `CompiledOcel::with_prelude` -- every relation bound as a `WITH` CTE in front of `analysisSql`,
 *  so it runs with no view or table ever created (no DDL right needed, so it runs against a
 *  read-only database). */
export function withPrelude(compiled: CompiledOcel, analysisSql: string): string {
  if (compiled.views.length === 0) return analysisSql;
  const ctes = compiled.views.map((v) => `${quoteIdent(compiled.dialect, v.name)} AS (\n${v.body}\n)`);
  return `WITH ${ctes.join(",\n")}\n${analysisSql}`;
}

/** `CompiledOcel::probe_statements` -- each probe rewritten to run standalone, with the relation
 *  CTEs prepended instead of assuming any view exists. A probe's own `sql` often names a relation
 *  by its bare view name (e.g. `SELECT ocel_id FROM "object" ...`), so pasting `probe.sql` alone
 *  into a SQL client fails with "table not found" unless the views were created first -- this is
 *  the form that is actually runnable on its own. */
export function compiledProbeStatements(compiled: CompiledOcel): { probe: Probe; sql: string }[] {
  return compiled.probes.map((probe) => ({ probe, sql: withPrelude(compiled, probe.sql) }));
}

/** Human-readable one-liner for a `RejectReason`, mirroring compile.rs's `Display` impl. */
export function describeRejectReason(reason: RejectReason): string {
  if ("SynthesizedId" in reason) {
    const { field } = reason.SynthesizedId;
    return `'${field}' is absent, so the extractor mints a random UUID per row.`;
  }
  if ("DynamicTypeName" in reason) {
    const { field, detail } = reason.DynamicTypeName;
    return `'${field}' is read from the data and no column domain is available (${detail}), so the per-type view name is unknown at compile time.`;
  }
  if ("TypeDomainTooLarge" in reason) {
    const { column, size, cap } = reason.TypeDomainTooLarge;
    return `the domain of '${column}' has ${size} values, above the per-type cap of ${cap}.`;
  }
  if ("ReservedTypeName" in reason) {
    const { name } = reason.ReservedTypeName;
    return `type name '${name}' collides with a relation the compiler defines.`;
  }
  if ("UnknownNode" in reason) {
    const { node } = reason.UnknownNode;
    return `no node '${node}' is declared.`;
  }
  if ("UnresolvedNodeSchema" in reason) {
    const { node } = reason.UnresolvedNodeSchema;
    return `the column shape of node '${node}' could not be resolved.`;
  }
  if ("NodeCycle" in reason) {
    const { node } = reason.NodeCycle;
    return `node '${node}' takes part in a cycle.`;
  }
  if ("EmptyProjection" in reason) {
    const { node } = reason.EmptyProjection;
    return `node '${node}' has no columns, and SQL has no zero-column SELECT.`;
  }
  if ("EmptyUnion" in reason) {
    const { node } = reason.EmptyUnion;
    return `union node '${node}' has no inputs.`;
  }
  if ("UnknownColumn" in reason) {
    const { column, field } = reason.UnknownColumn;
    return `column '${column}' used by '${field}' is not declared for this node.`;
  }
  if ("UndeclaredColumnKind" in reason) {
    const { column, col_type, field } = reason.UndeclaredColumnKind;
    return `column '${column}' is declared '${col_type}', which maps to no value kind, so '${field}' cannot be decided without reading the data.`;
  }
  if ("UnstableIdentityRendering" in reason) {
    const { column, col_type, field } = reason.UnstableIdentityRendering;
    return `column '${column}' (${col_type}) has no canonical identity rendering, so '${field}' is None for every row.`;
  }
  if ("UnstableDisplayRendering" in reason) {
    const { column, col_type, field } = reason.UnstableDisplayRendering;
    return `column '${column}' (${col_type}) feeds '${field}' through a text rendering a SQL cast does not reproduce.`;
  }
  if ("ResidualTimestamp" in reason) {
    const { detail } = reason.ResidualTimestamp;
    return `timestamp is residual: ${detail}`;
  }
  if ("UndecidableJoinKey" in reason) {
    const { node, side, column, col_type } = reason.UndecidableJoinKey;
    return `join '${node}': the ${side} key '${column}' is declared '${col_type}', which maps to no value kind, so whether the extractor's kind-tagged keys can match is not decidable at compile time.`;
  }
  if ("UnportableRegex" in reason) {
    const { pattern, detail } = reason.UnportableRegex;
    return `regex '${pattern}' is not provably identical between Rust regex and RE2: ${detail}`;
  }
  if ("InvalidRegex" in reason) {
    const { pattern, message } = reason.InvalidRegex;
    return `invalid regular expression '${pattern}': ${message}`;
  }
  if ("InvalidTemplate" in reason) {
    const { template, reason: templateReason } = reason.InvalidTemplate;
    return `invalid template '${template}': ${templateReason}`;
  }
  if ("AttributeCoercion" in reason) {
    const { attribute, column, col_type, declared } = reason.AttributeCoercion;
    return `attribute '${attribute}' reads column '${column}' (${col_type}) as '${declared}', a coercion whose fallback value has a different type than the column it would be stored in.`;
  }
  if ("DynamicTypeAttributeConflict" in reason) {
    const { attribute } = reason.DynamicTypeAttributeConflict;
    return `attribute '${attribute}' is declared under conflicting types, and this mapping's type name comes from the data, so which declaration wins depends on row order.`;
  }
  if ("UnsupportedEmissionShape" in reason) {
    const { shape } = reason.UnsupportedEmissionShape;
    return `emission shape ${shape} is not implemented.`;
  }
  if ("ViewCycle" in reason) {
    const { view } = reason.ViewCycle;
    return `relation '${view}' could not be ordered: its dependencies on other relations form a cycle.`;
  }
  if ("Invalid" in reason) {
    const { detail } = reason.Invalid;
    return `the blueprint does not validate: ${detail}`;
  }
  // `RejectReason` is `#[non_exhaustive]` on the Rust side, so a future variant can arrive before
  // this switch is updated -- fall back to the raw shape rather than throwing.
  return `unrecognized compile error: ${JSON.stringify(reason)}`;
}

/** A `MappingRef`'s label, falling back to its JSON path, or "(blueprint)" for a whole-log
 *  `CompileError`/`Probe` (`mapping: null`) -- a `CompileError` has one only for
 *  `RejectReason::Invalid`, fired before any mapping is read; a `Probe` has one for the object/
 *  event identity-ambiguity checks, which span every mapping rather than naming one. */
export function describeMappingTarget(ref: MappingRef | null | undefined): string {
  if (!ref) return "(blueprint)";
  return ref.label ?? ref.path;
}

/** Where a `CompileError` points -- see {@link describeMappingTarget}. */
export function describeCompileErrorTarget(e: CompileError): string {
  return describeMappingTarget(e.mapping);
}

/** Human-readable one-liner for a `Probe["kind"]`, mirroring compile.rs's `ProbeKind::Display`. */
export function describeProbeKind(kind: Probe["kind"]): string {
  if (kind === "AmbiguousObjectIdentity") return "one object id carries more than one type";
  if (kind === "AmbiguousEventIdentity") return "one event id carries more than one event";
  if (kind === "AmbiguousStaticObjectAttributes") {
    return "one object id is given different static attribute values by one mapping";
  }
  return `column '${kind.StaleTypeDomain.column}' holds a value outside the domain this compile pinned`;
}
