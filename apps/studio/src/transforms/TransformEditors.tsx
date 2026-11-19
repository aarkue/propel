import type { BackendContext, Transform } from "@r4pm/client";
import { Text } from "@r4pm/components/ui";
import {
  FilterStartEndEditor,
  FilterTraceContainsEditor,
  RelabelActivitiesEditor,
} from "./editors/activities";
import { FilterAttributesEditor, RemoveAttributesEditor } from "./editors/attributes";
import {
  FilterActivitiesEditor,
  FilterMinRelatedEventsEditor,
  FilterMinRelatedObjectsEditor,
  FilterObjectTypesEditor,
} from "./editors/lists";
import { RelabelObjectTypesEditor } from "./editors/objects";
import { SampleEditor } from "./editors/sample";
import { FilterTimeRangeEditor, RescaleTimeframeEditor } from "./editors/time";
import { FilterVariantsEditor } from "./editors/variants";

/** The editor of one transform step, by its type. */
export function TransformEditor({
  transform,
  onChange,
  activities,
  objectTypes,
  objectType,
  totalTraces,
  totalEvents,
  activityCounts,
  objectTypeCounts,
  backend,
  datasetName,
  enabledPrefix,
}: {
  transform: Transform;
  onChange: (t: Transform) => void;
  activities: string[];
  objectTypes?: string[];
  objectType: "EventLog" | "OCEL";
  totalTraces?: number;
  totalEvents?: number;
  activityCounts?: Record<string, number>;
  objectTypeCounts?: Record<string, number>;
  backend: BackendContext;
  datasetName: string;
  /** Enabled upstream transforms (before this step), for on-demand variant reconstruction. */
  enabledPrefix: Transform[];
}) {
  switch (transform.type) {
    case "FilterActivities":
      return (
        <FilterActivitiesEditor
          transform={transform}
          onChange={onChange}
          activities={activities}
          counts={activityCounts}
        />
      );
    case "RelabelActivities":
      return <RelabelActivitiesEditor transform={transform} onChange={onChange} activities={activities} />;
    case "FilterStartEnd":
      return (
        <FilterStartEndEditor
          transform={transform}
          onChange={onChange}
          activities={activities}
          counts={activityCounts}
          objectType={objectType}
        />
      );
    case "FilterTraceContains":
      return (
        <FilterTraceContainsEditor
          transform={transform}
          onChange={onChange}
          activities={activities}
          counts={activityCounts}
          objectType={objectType}
        />
      );
    case "FilterVariants":
      return (
        <FilterVariantsEditor
          transform={transform}
          onChange={onChange}
          objectType={objectType}
          backend={backend}
          datasetName={datasetName}
          enabledPrefix={enabledPrefix}
          totalTraces={totalTraces}
          totalEvents={totalEvents}
        />
      );
    case "FilterTimeRange":
      return (
        <FilterTimeRangeEditor
          transform={transform}
          onChange={onChange}
          objectType={objectType}
          backend={backend}
          datasetName={datasetName}
        />
      );
    case "FilterObjectTypes":
      return (
        <FilterObjectTypesEditor
          transform={transform}
          onChange={onChange}
          objectTypes={objectTypes ?? []}
          counts={objectTypeCounts}
        />
      );
    case "RelabelObjectTypes":
      return (
        <RelabelObjectTypesEditor transform={transform} onChange={onChange} objectTypes={objectTypes ?? []} />
      );
    case "FilterMinRelatedEvents":
      return (
        <FilterMinRelatedEventsEditor transform={transform} onChange={onChange} activities={activities} />
      );
    case "FilterMinRelatedObjects":
      return (
        <FilterMinRelatedObjectsEditor
          transform={transform}
          onChange={onChange}
          objectTypes={objectTypes ?? []}
        />
      );
    case "Sample":
      return (
        <SampleEditor
          transform={transform}
          onChange={onChange}
          objectType={objectType}
          totalTraces={totalTraces}
          totalEvents={totalEvents}
        />
      );
    case "RescaleTimeframe":
      return (
        <RescaleTimeframeEditor
          transform={transform}
          onChange={onChange}
          objectType={objectType}
          objectTypes={objectTypes}
        />
      );
    case "RemoveAttributes":
      return (
        <RemoveAttributesEditor
          transform={transform}
          onChange={onChange}
          objectType={objectType}
          backend={backend}
          datasetName={datasetName}
        />
      );
    case "FilterAttributes":
      return (
        <FilterAttributesEditor
          transform={transform}
          onChange={onChange}
          objectType={objectType}
          activities={activities}
          objectTypes={objectTypes ?? []}
          activityCounts={activityCounts}
          objectTypeCounts={objectTypeCounts}
          backend={backend}
          datasetName={datasetName}
        />
      );
    default:
      return <Text color="red">Unknown transform type</Text>;
  }
}
