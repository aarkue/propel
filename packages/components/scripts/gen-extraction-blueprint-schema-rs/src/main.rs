// One-off tool: dump JSON Schema (2020-12, via schemars) for the extraction-blueprint model
// types, so json-schema-to-typescript can compile them into model.generated.ts in propel.
// Not part of any crate's normal build; run manually against a checkout of rust4pm's
// feat/extraction-blueprint-migration branch.
use process_mining::core::event_data::object_centric::extraction::{
    AttributeMapping, Blueprint, ColumnSchema, CompareOp, CompileError, CompiledOcel,
    DropReason, DuplicateObjectPolicy, EmissionShape, EventEndpoint, ExtractionCatalog,
    ExtractionError, ExtractionReport, ExtractionTiming, FinalizeReport, IdRendering, InlineObjectRef, Literal,
    Mapping, MappingEntry, MappingRef, MappingStats, MissingEndpointPolicy, Node, NodeOp,
    ObjectEndpoint, Operand, Predicate, Probe, ProbeKind, ProviderError, RejectReason, SinkError,
    SplitKind, SplitSpec, SqlDialect, Target, TableSchema, TimestampFormat, TimestampSource,
    ValidationError, ValueExpression, ViewDef,
};
use process_mining::core::event_data::object_centric::OCELAttributeType;
use schemars::generate::SchemaSettings;
use schemars::JsonSchema;
use serde_json::{json, Map, Value};

fn add_root<T: JsonSchema>(g: &mut schemars::SchemaGenerator, roots: &mut Map<String, Value>, name: &str) {
    let schema = g.subschema_for::<T>();
    roots.insert(name.to_string(), serde_json::to_value(&schema).unwrap());
}

fn main() {
    let settings = SchemaSettings::draft2020_12();
    let mut g = settings.into_generator();
    let mut roots = Map::new();

    // Blueprint pulls in the whole model graph (Node/NodeOp/Target/Mapping/MappingEntry/
    // ObjectEndpoint/EventEndpoint/InlineObjectRef/ValueExpression/SplitSpec/SplitKind/
    // AttributeMapping/TimestampSource/TimestampFormat/Predicate/Operand/Literal/CompareOp/
    // IdRendering/MissingEndpointPolicy/DuplicateObjectPolicy/OCELAttributeType) via $defs.
    add_root::<Blueprint>(&mut g, &mut roots, "Blueprint");
    // Not reachable from Blueprint: supplied separately by the caller.
    add_root::<ExtractionCatalog>(&mut g, &mut roots, "ExtractionCatalog");
    add_root::<ValidationError>(&mut g, &mut roots, "ValidationError");

    // Also register every type individually so each has its own top-level entry in `roots`,
    // even though most are already reachable via Blueprint's $defs -- belt and suspenders in
    // case a future model change makes one of these unreachable from Blueprint.
    add_root::<Node>(&mut g, &mut roots, "Node");
    add_root::<NodeOp>(&mut g, &mut roots, "NodeOp");
    add_root::<ObjectEndpoint>(&mut g, &mut roots, "ObjectEndpoint");
    add_root::<EventEndpoint>(&mut g, &mut roots, "EventEndpoint");
    add_root::<InlineObjectRef>(&mut g, &mut roots, "InlineObjectRef");
    add_root::<Target>(&mut g, &mut roots, "Target");
    add_root::<Mapping>(&mut g, &mut roots, "Mapping");
    add_root::<MappingEntry>(&mut g, &mut roots, "MappingEntry");
    add_root::<IdRendering>(&mut g, &mut roots, "IdRendering");
    add_root::<MissingEndpointPolicy>(&mut g, &mut roots, "MissingEndpointPolicy");
    add_root::<DuplicateObjectPolicy>(&mut g, &mut roots, "DuplicateObjectPolicy");
    add_root::<ValueExpression>(&mut g, &mut roots, "ValueExpression");
    add_root::<SplitSpec>(&mut g, &mut roots, "SplitSpec");
    add_root::<SplitKind>(&mut g, &mut roots, "SplitKind");
    add_root::<AttributeMapping>(&mut g, &mut roots, "AttributeMapping");
    add_root::<TimestampFormat>(&mut g, &mut roots, "TimestampFormat");
    add_root::<TimestampSource>(&mut g, &mut roots, "TimestampSource");
    add_root::<Predicate>(&mut g, &mut roots, "Predicate");
    add_root::<Operand>(&mut g, &mut roots, "Operand");
    add_root::<CompareOp>(&mut g, &mut roots, "CompareOp");
    add_root::<Literal>(&mut g, &mut roots, "Literal");
    add_root::<TableSchema>(&mut g, &mut roots, "TableSchema");
    add_root::<ColumnSchema>(&mut g, &mut roots, "ColumnSchema");
    add_root::<OCELAttributeType>(&mut g, &mut roots, "OCELAttributeType");

    // report.rs: what `extract` produces alongside the OCEL. `ExtractionReport`/`ExtractionError`
    // derive `Serialize, JsonSchema` but not `Deserialize` (some `ExtractionError` variants carry
    // `&'static str`, which no deserializer can manufacture) -- fine for `JsonSchema` generation,
    // which needs neither; these only ever flow frontend-ward (a run's output), never back.
    add_root::<ExtractionReport>(&mut g, &mut roots, "ExtractionReport");
    add_root::<ExtractionTiming>(&mut g, &mut roots, "ExtractionTiming");
    add_root::<ExtractionError>(&mut g, &mut roots, "ExtractionError");
    add_root::<MappingStats>(&mut g, &mut roots, "MappingStats");
    add_root::<MappingRef>(&mut g, &mut roots, "MappingRef");
    add_root::<DropReason>(&mut g, &mut roots, "DropReason");
    add_root::<FinalizeReport>(&mut g, &mut roots, "FinalizeReport");
    add_root::<ProviderError>(&mut g, &mut roots, "ProviderError");
    add_root::<SinkError>(&mut g, &mut roots, "SinkError");

    // compile.rs: the SQL compiler's output. `CompileError`/`RejectReason`/`CompiledOcel` derive
    // `Serialize, JsonSchema` but not `Deserialize` (some `RejectReason` variants carry
    // `&'static str`) -- fine here, same as `ExtractionError` above: outbound-only.
    add_root::<CompiledOcel>(&mut g, &mut roots, "CompiledOcel");
    add_root::<ViewDef>(&mut g, &mut roots, "ViewDef");
    add_root::<Probe>(&mut g, &mut roots, "Probe");
    add_root::<ProbeKind>(&mut g, &mut roots, "ProbeKind");
    add_root::<CompileError>(&mut g, &mut roots, "CompileError");
    add_root::<RejectReason>(&mut g, &mut roots, "RejectReason");
    add_root::<EmissionShape>(&mut g, &mut roots, "EmissionShape");
    add_root::<SqlDialect>(&mut g, &mut roots, "SqlDialect");

    let defs = g.definitions().clone();
    let out = json!({ "defs": defs, "roots": roots });
    println!("{}", serde_json::to_string_pretty(&out).unwrap());
}
