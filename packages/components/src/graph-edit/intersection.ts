export function getIntersectionCirc(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  diameter: number,
) {
  const diffX = targetX - sourceX;
  const diffY = targetY - sourceY;

  const a = Math.atan(diffY / diffX);
  const xFactor = (diffX > 0 ? 1 : -1) * Math.cos(a);
  const yFactor = Math.sin(a);

  const offsetX = (xFactor * diameter) / 2;
  const offsetY =
    diffX === 0 ? (Math.sign(diffY) * diameter) / 2 : ((diffX > 0 ? 1 : -1) * yFactor * diameter) / 2;
  return { x: targetX - offsetX, y: targetY - offsetY };
}

export function getIntersectionRect(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const slope = (targetY - sourceY) / (targetX - sourceX);
  const topY = targetY + height / 2;
  const bottomY = targetY - height / 2;
  const rightX = targetX + width / 2;
  const leftX = targetX - width / 2;

  const intersectionPoints = [
    { x: sourceX + (topY - sourceY) / slope, y: topY },
    { x: sourceX + (bottomY - sourceY) / slope, y: bottomY },
    { x: rightX, y: sourceY + slope * (rightX - sourceX) },
    { x: leftX, y: sourceY + slope * (leftX - sourceX) },
  ].filter(
    ({ x, y }) =>
      targetX - width / 2 <= x &&
      x <= targetX + width / 2 &&
      targetY - height / 2 <= y &&
      y <= targetY + height / 2,
  );

  if (intersectionPoints.length === 0) return null;

  const closestPoint = intersectionPoints.reduce((prev, curr) =>
    Math.hypot(curr.x - sourceX, curr.y - sourceY) < Math.hypot(prev.x - sourceX, prev.y - sourceY)
      ? curr
      : prev,
  );

  return closestPoint;
}
