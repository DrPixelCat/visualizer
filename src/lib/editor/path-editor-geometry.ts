import {
  BSpline,
  PathSegment,
  Vector2d,
  type Translation2d,
} from "@/lib/geometry";
import {
  FIELD_EDGE_MARGIN_IN,
  FIELD_SIZE_IN,
  MIN_ARC_CLEARANCE_IN,
  MIN_ARC_RADIUS_IN,
} from "@/lib/editor/path-editor-constants";
import type {
  BuiltPath,
  EditorPath,
  EditorPose,
  EditorState,
  ProcessedControlPoint,
} from "@/lib/editor/path-editor-types";

// Builds the renderable spline and LUT wrapper for a single editor path.
export function buildPath(path: EditorPath): BuiltPath {
  const controls = buildProcessedControls(path.poses);
  const spline = controls.length >= 2 ? new BSpline(controls) : null;
  const segment = spline ? new PathSegment(spline) : null;

  return {
    path,
    controls,
    spline,
    segment,
    curve: spline ? sampleSplinePoints(spline, 140) : [],
  };
}

export function buildProcessedControls(poses: EditorPose[]): ProcessedControlPoint[] {
  const processed: ProcessedControlPoint[] = [];

  for (let i = 0; i < poses.length; i++) {
    const pose = poses[i];
    if (pose.kind === "arc" && !isEndpoint(i, poses.length)) {
      const [p1, p2] = expandArcPose(poses[i - 1], pose, poses[i + 1]);
      processed.push({
        ...p1,
        id: `${pose.id}-ghost-a`,
        sourcePoseId: pose.id,
        ghost: true,
        ghostRole: "before",
      });
      processed.push({ ...pose, id: `${pose.id}-control`, sourcePoseId: pose.id, ghost: false });
      processed.push({
        ...p2,
        id: `${pose.id}-ghost-b`,
        sourcePoseId: pose.id,
        ghost: true,
        ghostRole: "after",
      });
    } else {
      processed.push({ ...pose, id: `${pose.id}-control`, sourcePoseId: pose.id, ghost: false });
    }
  }

  return processed;
}

export function expandArcPose(
  prevPose: EditorPose,
  arcPose: EditorPose,
  nextPose: EditorPose,
): [Translation2d, Translation2d] {
  // Arc poses add two ghost controls around the actual pose, matching the Java builder.
  const arcVector = new Vector2d(arcPose.x, arcPose.y);
  const vecToLast = new Vector2d(prevPose.x, prevPose.y).subtract(arcVector);
  const vecToNext = new Vector2d(nextPose.x, nextPose.y).subtract(arcVector);
  const distToLast = vecToLast.getMagnitude();
  const distToNext = vecToNext.getMagnitude();

  if (distToLast <= 1e-9 || distToNext <= 1e-9) {
    return [arcVector.copy(), arcVector.copy()];
  }

  const maxRadius = Math.max(MIN_ARC_RADIUS_IN, Math.min(distToLast, distToNext));
  const radius = Math.max(MIN_ARC_RADIUS_IN, Math.min(arcPose.radius, maxRadius));

  return [
    arcVector.add(vecToLast.multiply(radius / distToLast)),
    arcVector.add(vecToNext.multiply(radius / distToNext)),
  ];
}

export function constrainPointNearArcs(
  path: EditorPath,
  poseId: string,
  point: Translation2d,
): Translation2d {
  let next = Vector2d.from(point);
  const draggedPose = path.poses.find((pose) => pose.id === poseId);

  for (const arcPose of path.poses) {
    if (arcPose.kind !== "arc" || arcPose.id === poseId) continue;

    const center = arcPose;
    const offset = next.subtract(center);
    const distance = offset.getMagnitude();
    if (distance < MIN_ARC_CLEARANCE_IN) {
      const direction =
        distance <= 1e-9 && draggedPose
          ? new Vector2d(draggedPose.x - center.x || 1, draggedPose.y - center.y)
          : offset;
      next = Vector2d.from(center).add(direction.normalize().multiply(MIN_ARC_CLEARANCE_IN));
    }
  }

  return {
    x: clampField(next.x),
    y: clampField(next.y),
  };
}

export function pointAtDistance(segment: PathSegment, distanceIn: number): Vector2d {
  const targetDistanceToEnd = Math.max(0, segment.getLengthIn() - distanceIn);
  const points = segment.lutPoints;

  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    if (
      current.getDistanceToEndIn() >= targetDistanceToEnd &&
      next.getDistanceToEndIn() <= targetDistanceToEnd
    ) {
      const span = current.getDistanceToEndIn() - next.getDistanceToEndIn();
      const alpha = span <= 1e-9 ? 0 : (current.getDistanceToEndIn() - targetDistanceToEnd) / span;
      return current
        .getLocation()
        .add(next.getLocation().subtract(current.getLocation()).multiply(alpha));
    }
  }

  return segment.getPosition(distanceIn <= 0 ? 0 : 0.999999);
}

export function sampleSplinePoints(spline: BSpline, sampleCount: number): Vector2d[] {
  const points: Vector2d[] = [];
  for (let i = 0; i < sampleCount; i++) {
    points.push(spline.getPosition(i / (sampleCount - 1)));
  }
  return points;
}

export function makePose(
  name: string,
  x: number,
  y: number,
  headingDeg: number | null,
): EditorPose {
  return {
    id: `pose-${crypto.randomUUID()}`,
    name,
    x: clampField(x),
    y: clampField(y),
    headingDeg,
    kind: "pose",
    radius: 10,
  };
}

export function renumberPoses(poses: EditorPose[]): EditorPose[] {
  return poses.map((pose, index) => ({
    ...pose,
    name: /^pose\d+$/i.test(pose.name) ? `pose${index + 1}` : pose.name,
  }));
}

export function sanitizePosePatch(
  path: EditorPath,
  pose: EditorPose,
  patch: Partial<EditorPose>,
): EditorPose {
  const index = path.poses.findIndex((item) => item.id === pose.id);
  const nextKind = isEndpoint(index, path.poses.length) && patch.kind === "arc" ? "pose" : patch.kind;
  const nextPose = { ...pose, ...patch, ...(nextKind ? { kind: nextKind } : {}) };
  return {
    ...nextPose,
    x: clampField(nextPose.x),
    y: clampField(nextPose.y),
  };
}

export function endpointIsSnapped(state: EditorState, pathId: string, poseId: string): boolean {
  const path = state.paths.find((item) => item.id === pathId);
  if (!path) return false;

  const poseIndex = path.poses.findIndex((pose) => pose.id === poseId);
  if (!isEndpoint(poseIndex, path.poses.length)) return false;

  const pose = path.poses[poseIndex];
  return state.paths.some((otherPath) => {
    if (otherPath.id === pathId) return false;
    const otherEndpoint =
      poseIndex === 0 ? otherPath.poses[otherPath.poses.length - 1] : otherPath.poses[0];
    return Math.hypot(pose.x - otherEndpoint.x, pose.y - otherEndpoint.y) <= 0.05;
  });
}

export function toCanvasPoint(scale: number): (point: Translation2d) => number[] {
  return (point) => {
    const canvasPoint = toCanvas(point, scale);
    return [canvasPoint.x, canvasPoint.y];
  };
}

export function toCanvas(point: Translation2d, scale: number): Translation2d {
  return {
    x: point.x * scale,
    y: (FIELD_SIZE_IN - point.y) * scale,
  };
}

export function fromCanvas(point: Translation2d, scale: number): Translation2d {
  return {
    x: point.x / scale,
    y: FIELD_SIZE_IN - point.y / scale,
  };
}

export function clampCanvasPoint(x: number, y: number, canvasSize: number): Translation2d {
  return {
    x: Math.max(0, Math.min(canvasSize, x)),
    y: Math.max(0, Math.min(canvasSize, y)),
  };
}

export function clampCanvasPosePosition(point: Translation2d, scale: number): Translation2d {
  return toCanvas(
    {
      x: clampField(point.x / scale),
      y: clampField(FIELD_SIZE_IN - point.y / scale),
    },
    scale,
  );
}

export function clampField(value: number): number {
  return Math.max(FIELD_EDGE_MARGIN_IN, Math.min(FIELD_SIZE_IN - FIELD_EDGE_MARGIN_IN, value));
}

export function isEndpoint(index: number, length: number): boolean {
  return index === 0 || index === length - 1;
}

export function snap(value: number): number {
  return Math.round(value * 10) / 10;
}
