import type { ExtendedJSONSchema, FunctionMeta } from "../../../BackendContext";

/** A function meta whose schemas have had their `$ref`s resolved to concrete shapes. */
export type ProcessedFunction = FunctionMeta;

export interface SchemaCatalog {
  /** Function metas with every arg/return schema `$ref`-resolved. */
  processedFunctions: ProcessedFunction[];
  /** Object-like definitions (and inline object args), keyed by name. */
  structDefinitions: Record<string, ExtendedJSONSchema>;
  /** `oneOf` definitions (enums), keyed by name. */
  enumDefinitions: Record<string, ExtendedJSONSchema>;
  /** `prefixItems` definitions (tuples), keyed by name. */
  tupleDefinitions: Record<string, ExtendedJSONSchema>;
  /** Flattened `$defs`/`definitions` table collected across all function args. */
  definitions: Record<string, ExtendedJSONSchema>;
}

/** Resolve a schema's `$ref` (recursively) and recurse into items/properties/prefixItems so the
 *  result carries concrete types/titles instead of references. */
export function resolveSchema(
  schema: ExtendedJSONSchema,
  definitions: Record<string, ExtendedJSONSchema>,
): ExtendedJSONSchema {
  if (schema.$ref) {
    const refName = schema.$ref.split("/").pop();
    if (refName && definitions[refName]) {
      return resolveSchema(definitions[refName], definitions);
    }
  }

  if (schema.type === "array" && schema.items) {
    if (Array.isArray(schema.items)) {
      return {
        ...schema,
        items: schema.items.map((s) => resolveSchema(s as ExtendedJSONSchema, definitions)),
      };
    } else {
      return {
        ...schema,
        items: resolveSchema(schema.items as ExtendedJSONSchema, definitions),
      };
    }
  }

  if (schema.properties) {
    const newProps: Record<string, ExtendedJSONSchema> = {};
    for (const [key, val] of Object.entries(schema.properties)) {
      newProps[key] = resolveSchema(val as ExtendedJSONSchema, definitions);
    }
    return { ...schema, properties: newProps };
  }

  if (schema.prefixItems) {
    return {
      ...schema,
      prefixItems: schema.prefixItems.map((s) => resolveSchema(s, definitions)),
    };
  }

  return schema;
}

/** Build the sidebar's struct/enum/tuple catalog (plus `$ref`-resolved function metas) from the
 *  raw function metadata the backend reports. Pure: no React, no I/O. */
export function buildSchemaCatalog(functionMeta: FunctionMeta[]): SchemaCatalog {
  const definitions: Record<string, ExtendedJSONSchema> = {};

  functionMeta.forEach((func) => {
    func.args.forEach(([, argSchema]) => {
      if (argSchema.$defs) {
        Object.assign(definitions, argSchema.$defs);
      }
      if (argSchema.definitions) {
        Object.assign(definitions, argSchema.definitions);
      }
    });
  });

  const structs: Record<string, ExtendedJSONSchema> = {};
  const enums: Record<string, ExtendedJSONSchema> = {};
  const tuples: Record<string, ExtendedJSONSchema> = {};

  Object.entries(definitions).forEach(([name, schema]) => {
    const resolved = resolveSchema(schema, definitions);
    if (!resolved.title) resolved.title = name;

    if (resolved.oneOf) {
      enums[name] = resolved;
    } else if (resolved.prefixItems) {
      tuples[name] = resolved;
    } else if (resolved.type === "object" || resolved.properties) {
      structs[name] = resolved;
    }
  });

  // Also add inline object arguments as structs.
  functionMeta.forEach((func) => {
    func.args.forEach(([argName, argSchema]) => {
      if (argSchema.type === "object" && argSchema.properties && !argSchema.$ref) {
        const name = argSchema.title || `${func.name} - ${argName}`;
        structs[name] = resolveSchema(argSchema, definitions);
      }
    });
  });

  const processedFunctions: ProcessedFunction[] = functionMeta.map((func) => ({
    ...func,
    args: func.args.map(([name, schema]): [string, ExtendedJSONSchema] => [
      name,
      resolveSchema(schema, definitions),
    ]),
    return_type: resolveSchema(func.return_type, definitions),
  }));

  return {
    processedFunctions,
    structDefinitions: structs,
    enumDefinitions: enums,
    tupleDefinitions: tuples,
    definitions,
  };
}
