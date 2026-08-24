import type { ReactNode } from "react";
import type { ConstraintLabel, RenderArcType } from "./types";
import type { ColorResolver } from "./VizContext";

/** Rich JSX description of a constraint with colored activity/object-type spans; see `coreDescription`/`involvementDescription` for the arc-type and quantifier wording. */
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

  /** An O2O association names two types and no `object_type`; describe the pair it relates. */
  const subject = (ref: ConstraintLabel["each"][number]): { key: string; node: ReactNode } | null => {
    if (ref.type === "O2O" && ref.first && ref.second) {
      const [from, to] = ref.reversed ? [ref.second, ref.first] : [ref.first, ref.second];
      return {
        key: `${from}-o2o-${to}`,
        node: (
          <>
            {OT(from)} linked to {OT(to)}
          </>
        ),
      };
    }
    return ref.object_type ? { key: ref.object_type, node: OT(ref.object_type) } : null;
  };

  for (const [refs, prefix, tag] of [
    [label.each, "for each involved ", "each"],
    [label.all, "involving all the same ", "all"],
    [label.any, "sharing at least one ", "any"],
  ] as const) {
    for (const ref of refs) {
      const s = subject(ref);
      if (!s) continue;
      segments.push(
        <span key={`${tag}-${s.key}`}>
          {prefix}
          {s.node}
        </span>,
      );
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
