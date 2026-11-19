import { Badge, Table, Text } from "@r4pm/components/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { PiTable } from "react-icons/pi";
import {
  ExpandableRow,
  OptionMenu,
  SearchField,
  SortableHeader,
  TablePager,
  Toolbar,
  useViewerConfig,
} from "@r4pm/components";
import { ErrorState, LoadingState, softBadgeStyle } from "@r4pm/components";
import type { IDockviewPanelProps } from "dockview";
import type {
  BackendContext,
  ObjectBrowserPage,
  ObjectDetail,
  ObjectSortField,
  SlimLinkedOCELHandle,
} from "@r4pm/client";
import { type DatasetPanelProps, defineDatasetPanel } from "./define-vis";
import { useDatasetScopedState } from "../panels/panel-state";
import { backend } from "../backends";

import { FILTER_DEBOUNCE_MS, formatTimestamp, PAGE_SIZES } from "./components/browser-format";

const GET_OCEL_OBJECTS_PAGE = "app_bindings::get_ocel_objects_page" as const;
const GET_OBJECT_DETAIL = "app_bindings::get_object_detail" as const;

function ObjectDetailView({
  detail,
  loading,
  error,
  activityColor,
  objectTypeColor,
  onNavigateToObject,
}: {
  detail?: ObjectDetail;
  loading: boolean;
  error?: unknown;
  activityColor: (act: string) => string;
  objectTypeColor: (t: string) => string;
  onNavigateToObject: (id: string) => void;
}) {
  return (
    <>
      {error ? (
        <ErrorState error={error} title="Failed to load object detail" />
      ) : loading ? (
        <LoadingState label="loading..." topBar={false} />
      ) : null}
      {detail && (
        <div className="flex flex-col gap-3">
          {detail.attributes && Object.keys(detail.attributes).length > 0 && (
            <div>
              <Text size="2" weight="bold" className="mb-1 block">
                Attributes
              </Text>
              <div className="flex flex-wrap gap-1">
                {Object.entries(detail.attributes)
                  .filter(([, v]) => v != null)
                  .map(([k, v]) => (
                    <Badge key={k} variant="outline" color="gray" size="1">
                      {k}: {v}
                    </Badge>
                  ))}
              </div>
            </div>
          )}

          {detail.events.length > 0 && (
            <div>
              <Text size="2" weight="bold" className="mb-1 block">
                Events ({detail.events.length})
              </Text>
              <Table.Root variant="surface" size="1">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>#</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Event Type</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Timestamp</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Other Objects</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {detail.events.map((ev, i) => (
                    <Table.Row key={ev.event_id}>
                      <Table.Cell className="font-mono text-[var(--gray-a9)] text-xs">{i + 1}</Table.Cell>
                      <Table.Cell>
                        <Badge style={softBadgeStyle(activityColor(ev.event_type))} size="1">
                          {ev.event_type}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell className="text-sm">{formatTimestamp(ev.timestamp)}</Table.Cell>
                      <Table.Cell>
                        <div className="flex flex-wrap gap-1">
                          {ev.other_objects.map(([objId, objType]) => (
                            <Badge
                              key={objId}
                              style={softBadgeStyle(objectTypeColor(objType))}
                              size="1"
                              className="cursor-pointer hover:opacity-80"
                              title={`${objType}: ${objId}`}
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                onNavigateToObject(objId);
                              }}
                            >
                              {objId}
                            </Badge>
                          ))}
                          {ev.other_objects.length === 0 && (
                            <Text size="1" color="gray">
                              -
                            </Text>
                          )}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </div>
          )}

          {detail.related_objects.length > 0 && (
            <div>
              <Text size="2" weight="bold" className="mb-1 block">
                Related Objects ({detail.related_objects.length})
              </Text>
              <div className="flex flex-wrap gap-1">
                {detail.related_objects.map(([objId, objType]) => (
                  <Badge
                    key={objId}
                    style={softBadgeStyle(objectTypeColor(objType))}
                    size="1"
                    className="cursor-pointer hover:opacity-80"
                    title={`${objType}: ${objId}`}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      onNavigateToObject(objId);
                    }}
                  >
                    {objType}: {objId}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {detail.events.length === 0 && detail.related_objects.length === 0 && (
            <Text size="2" color="gray">
              No events or related objects.
            </Text>
          )}
        </div>
      )}
    </>
  );
}

interface ObjView {
  page: number;
  pageSize: number;
  sortField: ObjectSortField;
  sortAsc: boolean;
  filter: string;
  typeFilter: string | null;
}

const INITIAL_OBJ_VIEW: ObjView = {
  page: 0,
  pageSize: 20,
  sortField: "ObjectId",
  sortAsc: true,
  filter: "",
  typeFilter: null,
};

export interface ObjectBrowserPanelProps {
  props: IDockviewPanelProps;
  backend: BackendContext;
  ocel: SlimLinkedOCELHandle;
}

/**
 * Interactive OCEL object-browser panel. Shows a paged, sortable, filterable
 * object table with a per-object
 * detail drill-down (attributes + ordered events with cross-object navigation +
 * related objects). Backed by the migrated registry bindings
 * `get_ocel_objects_page` and `get_object_detail`, which operate on the slim OCEL.
 */
export function ObjectBrowserPanel({ props, backend, ocel }: ObjectBrowserPanelProps) {
  const [view, setView] = useDatasetScopedState<ObjView>(props, "objView", ocel, INITIAL_OBJ_VIEW);
  const { page, pageSize, sortField, sortAsc, filter, typeFilter } = view;
  const [expandedObject, setExpandedObject] = useState<string | null>(null);

  // Local activity-color cache.
  const { colorOf } = useViewerConfig({});
  const activityColor = (act: string) => colorOf?.("activity", act) ?? "#888888";
  const objectTypeColor = (t: string) => colorOf?.("objectType", t) ?? "#888888";

  const pageQuery = useQuery({
    queryKey: [ocel, "object-browser", page, pageSize, sortField, sortAsc, filter, typeFilter],
    queryFn: () =>
      backend.callBinding(GET_OCEL_OBJECTS_PAGE, {
        ocel,
        offset: page * pageSize,
        limit: pageSize,
        sort_field: sortField,
        sort_asc: sortAsc,
        filter,
        type_filter: typeFilter,
      }) as Promise<ObjectBrowserPage>,
    placeholderData: keepPreviousData,
  });

  const detailQuery = useQuery({
    queryKey: [ocel, "object-detail", expandedObject],
    queryFn: () =>
      backend.callBinding(GET_OBJECT_DETAIL, {
        ocel,
        object_id: expandedObject!,
      }) as Promise<ObjectDetail>,
    enabled: expandedObject != null,
  });

  const data = pageQuery.data;
  const total = data?.total ?? 0;
  const rows = data?.rows ?? [];
  const objectTypes = data?.object_types ?? [];

  const toggleSort = (field: ObjectSortField) => {
    if (sortField === field) {
      setView({ ...view, sortAsc: !sortAsc, page: 0 });
    } else {
      setView({ ...view, sortField: field, sortAsc: true, page: 0 });
    }
  };

  const header = (field: ObjectSortField, label: string, align?: "right") => (
    <SortableHeader
      sorted={sortField === field ? (sortAsc ? "asc" : "desc") : null}
      onSort={() => toggleSort(field)}
      align={align}
    >
      {label}
    </SortableHeader>
  );

  const navigateToObject = (objectId: string) => {
    setExpandedObject(objectId);
    setView({ ...view, filter: objectId, typeFilter: null, page: 0 });
  };

  // Structural sizing inline so the panel renders in any host (Tailwind-agnostic).
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "8px 16px 0",
      }}
    >
      <Toolbar>
        <SearchField
          placeholder="Filter by Object ID..."
          value={filter}
          onChange={(f) => setView({ ...view, filter: f, page: 0 })}
          debounceMs={FILTER_DEBOUNCE_MS}
        />

        {objectTypes.length > 0 && (
          <OptionMenu
            label="Type"
            value={typeFilter ?? "__all__"}
            options={[
              { value: "__all__", label: "All types" },
              ...objectTypes.map((t) => ({ value: t, label: t })),
            ]}
            onChange={(v) => setView({ ...view, typeFilter: v === "__all__" ? null : v, page: 0 })}
          />
        )}
      </Toolbar>

      <div className="grow overflow-auto" style={{ minHeight: 0 }}>
        {pageQuery.error ? (
          <ErrorState
            error={pageQuery.error}
            title="Failed to load objects"
            onRetry={() => pageQuery.refetch()}
          />
        ) : !data ? (
          <LoadingState label="loading objects" />
        ) : (
          <>
            <Table.Root variant="ghost" size="1">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell style={{ width: 16 }} />
                  {header("ObjectId", "Object ID")}
                  {header("ObjectType", "Type")}
                  {header("NumEvents", "# Events", "right")}
                  {header("FirstTime", "First Time")}
                  <SortableHeader>Last Time</SortableHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rows.map((row) => {
                  const expanded = expandedObject === row.object_id;
                  return (
                    <ExpandableRow
                      key={row.object_id}
                      expanded={expanded}
                      onToggle={() => setExpandedObject(expanded ? null : row.object_id)}
                      columns={6}
                      detail={
                        <ObjectDetailView
                          detail={detailQuery.data ?? undefined}
                          loading={detailQuery.isLoading}
                          error={detailQuery.error}
                          activityColor={activityColor}
                          objectTypeColor={objectTypeColor}
                          onNavigateToObject={navigateToObject}
                        />
                      }
                    >
                      <Table.Cell className="font-mono text-sm">{row.object_id}</Table.Cell>
                      <Table.Cell>
                        <Badge style={softBadgeStyle(objectTypeColor(row.object_type))} size="1">
                          {row.object_type}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell className="text-right font-mono">{row.num_events}</Table.Cell>
                      <Table.Cell>{formatTimestamp(row.first_time)}</Table.Cell>
                      <Table.Cell>{formatTimestamp(row.last_time)}</Table.Cell>
                    </ExpandableRow>
                  );
                })}
                {rows.length === 0 && (
                  <Table.Row>
                    <Table.Cell colSpan={6}>
                      <Text color="gray" size="2">
                        {filter ? `No objects matching "${filter}".` : "No objects found."}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table.Root>

            <TablePager
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={(p) => setView({ ...view, page: p })}
              pageSizes={PAGE_SIZES}
              onPageSizeChange={(size) => setView({ ...view, pageSize: size, page: 0 })}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ObjectBrowser({ id, props }: DatasetPanelProps) {
  return <ObjectBrowserPanel props={props} backend={backend} ocel={id as SlimLinkedOCELHandle} />;
}

export const vis = defineDatasetPanel({
  needs: "SlimLinkedOCEL",
  type: "objectBrowser",
  name: "Object Browser",
  description: "Paged, sortable object table with attributes, events and related objects.",
  category: "ocel",
  icon: PiTable,
  supports: ["SlimLinkedOCEL"],
  keywords: ["objects", "browse", "table", "search", "attributes"],
  order: 20,
  component: ObjectBrowser,
});
