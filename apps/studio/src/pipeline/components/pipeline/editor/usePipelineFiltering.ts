import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CoreBackend, ExtendedJSONSchema, ItemKindInfo } from "../../../BackendContext";
import type { AppNode } from "./types";
import { getNodeInputs, getNodeType, areInputsEqual } from "./helpers";
import { isCompatible } from "../utils";
import { buildSchemaCatalog, resolveSchema } from "./schema-catalog";

export function usePipelineFiltering(
  backend: CoreBackend,
  searchQuery: string,
  selectedNode: AppNode | null,
  showAllNodes: boolean,
) {
  const functionMetaQuery = useQuery({
    queryKey: ["function-metadata"],
    queryFn: () => backend.listFunctions(),
  });

  const availableObjectsQuery = useQuery({
    queryKey: ["loaded-objects", "types"],
    queryFn: () =>
      backend.getObjectsWithType().then((objs) => {
        const types = new Set(objs.map(([, type]) => type));
        return Array.from(types);
      }),
  });

  const itemKindsQuery = useQuery({
    queryKey: ["item-kinds"],
    queryFn: () => backend.listItemKinds(),
    staleTime: Infinity,
  });

  // Predicate matching the engine's convert-on-dispatch: which registry kinds an object of a
  // given kind can be transparently converted into. Drives convert-aware edge compatibility.
  const convertible = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const k of (itemKindsQuery.data ?? []) as ItemKindInfo[]) {
      map.set(k.kind, new Set(k.convertible_to));
    }
    return (from: string, to: string) => map.get(from)?.has(to) ?? false;
  }, [itemKindsQuery.data]);

  const { processedFunctions, structDefinitions, enumDefinitions, tupleDefinitions, definitions } = useMemo(
    () => buildSchemaCatalog(functionMetaQuery.data ?? []),
    [functionMetaQuery.data],
  );

  // The selected node carries raw function meta (with `$ref`s); resolve it so its output/input
  // schemas have concrete types/titles to compare against the (already-resolved) palette entries.
  const selectedNodeType = useMemo(() => {
    const t = selectedNode ? getNodeType(selectedNode) : undefined;
    return t ? resolveSchema(t, definitions) : undefined;
  }, [selectedNode, definitions]);
  const selectedNodeInputs = useMemo(
    () => (selectedNode ? getNodeInputs(selectedNode).map((s) => resolveSchema(s, definitions)) : []),
    [selectedNode, definitions],
  );
  const isFiltering = !!selectedNode && !showAllNodes;

  const filteredFunctions = useMemo(() => {
    let funcs = processedFunctions;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      funcs = funcs.filter(
        (f) => f.name.toLowerCase().includes(q) || (f.docs ?? []).some((d) => d.toLowerCase().includes(q)),
      );
    }

    if (isFiltering) {
      funcs = funcs.filter((f) => {
        // Can f accept selectedNode? (Target)
        const isTarget =
          !!selectedNodeType &&
          f.args.some(([, schema]) => isCompatible(selectedNodeType, schema, convertible));

        // Check if inputs are identical (sibling node)
        const candidateInputs = f.args.map(([, s]) => s);
        const hasSameInputs = areInputsEqual(candidateInputs, selectedNodeInputs);

        // Can f provide input to selectedNode? (Source)
        const isSource =
          !hasSameInputs &&
          !!f.return_type &&
          selectedNodeInputs.some((inputSchema) => isCompatible(f.return_type, inputSchema, convertible));

        // Special case for JsonView: it accepts everything
        const isJsonViewSource = selectedNode?.type === "jsonView";

        return isTarget || isSource || isJsonViewSource;
      });
    }

    return funcs;
  }, [
    processedFunctions,
    searchQuery,
    isFiltering,
    selectedNodeType,
    selectedNodeInputs,
    selectedNode,
    convertible,
  ]);

  const filteredStructs = useMemo(() => {
    let structs = Object.entries(structDefinitions);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      structs = structs.filter(([name]) => name.toLowerCase().includes(q));
    }

    if (isFiltering) {
      structs = structs.filter(([, schema]) => {
        // Can struct accept selectedNode? (Target)
        const isTarget =
          !!selectedNodeType &&
          !!schema.properties &&
          Object.values(schema.properties).some((propSchema) =>
            isCompatible(selectedNodeType, propSchema as ExtendedJSONSchema, convertible),
          );

        // Check if inputs are identical
        const candidateInputs = schema.properties
          ? Object.values(schema.properties).map((p) => p as ExtendedJSONSchema)
          : [];
        const hasSameInputs = areInputsEqual(candidateInputs, selectedNodeInputs);

        // Can struct provide input to selectedNode? (Source)
        const isSource =
          !hasSameInputs &&
          selectedNodeInputs.some((inputSchema) => isCompatible(schema, inputSchema, convertible));

        const isJsonViewSource = selectedNode?.type === "jsonView";

        return isTarget || isSource || isJsonViewSource;
      });
    }

    return structs;
  }, [
    structDefinitions,
    searchQuery,
    isFiltering,
    selectedNodeType,
    selectedNodeInputs,
    selectedNode,
    convertible,
  ]);

  const filteredEnums = useMemo(() => {
    let enums = Object.entries(enumDefinitions);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      enums = enums.filter(([name]) => name.toLowerCase().includes(q));
    }
    // Enums are usually sources (inputs to functions)
    if (isFiltering) {
      enums = enums.filter(([, schema]) => {
        // Can enum provide input to selectedNode?
        const isSource = selectedNodeInputs.some((inputSchema) =>
          isCompatible(schema, inputSchema, convertible),
        );
        const isJsonViewSource = selectedNode?.type === "jsonView";
        return isSource || isJsonViewSource;
      });
    }
    return enums;
  }, [enumDefinitions, searchQuery, isFiltering, selectedNodeInputs, selectedNode, convertible]);

  const filteredTuples = useMemo(() => {
    let tuples = Object.entries(tupleDefinitions);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      tuples = tuples.filter(([name]) => name.toLowerCase().includes(q));
    }
    if (isFiltering) {
      tuples = tuples.filter(([, schema]) => {
        // Can tuple provide input?
        const isSource = selectedNodeInputs.some((inputSchema) =>
          isCompatible(schema, inputSchema, convertible),
        );
        // Can tuple accept input? (Target)
        const isTarget =
          !!selectedNodeType &&
          !!schema.prefixItems &&
          schema.prefixItems.some((itemSchema) => isCompatible(selectedNodeType, itemSchema, convertible));
        const isJsonViewSource = selectedNode?.type === "jsonView";
        return isSource || isTarget || isJsonViewSource;
      });
    }
    return tuples;
  }, [
    tupleDefinitions,
    searchQuery,
    isFiltering,
    selectedNodeInputs,
    selectedNode,
    selectedNodeType,
    convertible,
  ]);

  const filteredObjects = useMemo(() => {
    if (!availableObjectsQuery.data) return [];
    let objs = availableObjectsQuery.data;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      objs = objs.filter((t: string) => t.toLowerCase().includes(q));
    }

    if (isFiltering) {
      return objs.filter((type: string) => {
        const hasSameInputs = areInputsEqual([], selectedNodeInputs);
        const objSchema: ExtendedJSONSchema = { type: "string", "x-registry-ref": type };
        const isSource =
          !hasSameInputs &&
          selectedNodeInputs.some((inputSchema) => isCompatible(objSchema, inputSchema, convertible));
        const isJsonViewSource = selectedNode?.type === "jsonView";
        return isSource || isJsonViewSource;
      });
    }

    return objs;
  }, [availableObjectsQuery.data, searchQuery, isFiltering, selectedNodeInputs, selectedNode, convertible]);

  const filteredPrimitives = useMemo(() => {
    const primitives: ("string" | "integer" | "number" | "boolean")[] = [
      "string",
      "integer",
      "number",
      "boolean",
    ];

    if (searchQuery) {
      return primitives.filter((p) => p.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    if (isFiltering) {
      return primitives.filter((type) => {
        const hasSameInputs = areInputsEqual([], selectedNodeInputs);
        const primSchema: ExtendedJSONSchema = { type };
        const isSource =
          !hasSameInputs &&
          selectedNodeInputs.some((inputSchema) => isCompatible(primSchema, inputSchema, convertible));
        const isJsonViewSource = selectedNode?.type === "jsonView";
        return isSource || isJsonViewSource;
      });
    }

    return primitives;
  }, [searchQuery, isFiltering, selectedNodeInputs, selectedNode, convertible]);

  return {
    filteredFunctions,
    filteredStructs,
    filteredEnums,
    filteredTuples,
    filteredObjects,
    filteredPrimitives,
    availableObjectsQuery,
    functionMetaQuery,
    structDefinitions,
    enumDefinitions,
    tupleDefinitions,
    convertible,
  };
}
