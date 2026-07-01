import type { ReactNode } from "react";
import type { ConstraintLabel, RenderArcType } from "./types";
import type { ColorResolver } from "./VizContext";

/**
 * Rich JSX description of a constraint with colored activity/object-type spans.
 *
 * Arc semantics (source = "from" node with the dot):
 * - AS:  source and target always co-occur
 * - EF:  after source, target eventually follows
 * - EP:  before source, target must have occurred (arrow points back to target)
 * - DF/DP: direct variants of EF/EP
 *
 * Object involvement:
 * - each(T): checked per-object, for each T-object involved in source,
 *   the matching target event must also involve that same T-object
 * - all(T): the target event must involve ALL T-objects from the source event
 * - any(T): the target event must share at least one T-object with the source
 */
export function describeConstraintRich(
  from: string,
  to: string,
  arcType: RenderArcType,
  label: ConstraintLabel,
  activityColor: ColorResolver,
  objectTypeColor: ColorResolver,
): ReactNode {
  const A = <span style={{ color: activityColor(from), fontWeight: 600 }}>{from}</span>;
  const B = <span style={{ color: activityColor(to), fontWeight: 600 }}>{to}</span>;

  const core = coreDescription(arcType, A, B);
  const involvement = involvementDescription(label, objectTypeColor);

  return (
    <>
      {core}
      {involvement}.
    </>
  );
}

function coreDescription(arcType: RenderArcType, A: ReactNode, B: ReactNode): ReactNode {
  switch (arcType) {
    case "AS":
      return (
        <>
          Whenever {A} occurs, {B} also occurs, and vice versa
        </>
      );
    case "EF":
      return (
        <>
          After each {A} event, a {B} event eventually occurs
        </>
      );
    case "EP":
      return (
        <>
          Before each {A} event, a {B} event must have occurred
        </>
      );
    case "EFEP":
      return (
        <>
          {A} and {B} always eventually follow each other in both directions
        </>
      );
    case "DF":
      return (
        <>
          After each {A} event, a {B} event directly follows
        </>
      );
    case "DP":
      return (
        <>
          Before each {A} event, a {B} event directly precedes it
        </>
      );
    case "DFDP":
      return (
        <>
          {A} and {B} directly follow each other in both directions
        </>
      );
    default:
      return (
        <>
          {A} {"->"} {B} ({arcType})
        </>
      );
  }
}

function involvementDescription(label: ConstraintLabel, objectTypeColor: ColorResolver): ReactNode {
  const OT = (name: string) => <span style={{ color: objectTypeColor(name), fontWeight: 600 }}>{name}</span>;

  const segments: ReactNode[] = [];

  for (const ref of label.each) {
    if (ref.object_type) {
      segments.push(<span key={`each-${ref.object_type}`}>for each involved {OT(ref.object_type)}</span>);
    }
  }
  for (const ref of label.all) {
    if (ref.object_type) {
      segments.push(<span key={`all-${ref.object_type}`}>involving all the same {OT(ref.object_type)}</span>);
    }
  }
  for (const ref of label.any) {
    if (ref.object_type) {
      segments.push(<span key={`any-${ref.object_type}`}>sharing at least one {OT(ref.object_type)}</span>);
    }
  }

  if (segments.length === 0) return null;

  // Join with commas: ", for each X, involving all Y"
  const joined: ReactNode[] = [];
  for (let i = 0; i < segments.length; i++) {
    joined.push(i === 0 ? <span key={`sep-${i}`}> — </span> : <span key={`sep-${i}`}>, </span>);
    joined.push(segments[i]);
  }
  return <>{joined}</>;
}
