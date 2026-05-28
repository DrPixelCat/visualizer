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
  const arcRadii = resolveArcRadii(poses);

  for (let i = 0; i < poses.length; i++) {
    const pose = poses[i];
    if (pose.kind === "arc" && !isEndpoint(i, poses.length)) {
      const [p1, p2] = expandArcPoseWithRadius(
        poses[i - 1],
        pose,
        poses[i + 1],
        arcRadii.get(pose.id) ?? pose.radius,
      );
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
  return expandArcPoseWithRadius(prevPose, arcPose, nextPose, arcPose.radius);
}

function expandArcPoseWithRadius(
  prevPose: EditorPose,
  arcPose: EditorPose,
  nextPose: EditorPose,
  targetRadius: number,
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

  const maxRadius = Math.min(distToLast, distToNext);
  const radius = Math.max(0, Math.min(targetRadius, maxRadius));

  return [
    arcVector.add(vecToLast.multiply(radius / distToLast)),
    arcVector.add(vecToNext.multiply(radius / distToNext)),
  ];
}

function resolveArcRadii(poses: EditorPose[]): Map<string, number> {
  const radii = new Map<string, number>();

  poses.forEach((pose, index) => {
    if (pose.kind !== "arc" || isEndpoint(index, poses.length)) return;

    let radius = Math.max(MIN_ARC_RADIUS_IN, pose.radius);
    const prevPose = poses[index - 1];
    const nextPose = poses[index + 1];
    radius = Math.min(radius, Math.hypot(pose.x - prevPose.x, pose.y - prevPose.y));
    radius = Math.min(radius, Math.hypot(pose.x - nextPose.x, pose.y - nextPose.y));

    for (const neighbor of [prevPose, nextPose]) {
      if (neighbor.kind !== "arc") continue;

      const distance = Math.hypot(pose.x - neighbor.x, pose.y - neighbor.y);
      const available = Math.max(0, distance - MIN_ARC_CLEARANCE_IN);
      const totalRequested = Math.max(MIN_ARC_RADIUS_IN, pose.radius) + Math.max(MIN_ARC_RADIUS_IN, neighbor.radius);
      radius = Math.min(radius, totalRequested <= 1e-9 ? 0 : (Math.max(MIN_ARC_RADIUS_IN, pose.radius) / totalRequested) * available);
    }

    radii.set(pose.id, radius);
  });

  return radii;
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

export function distanceToPathIn(segment: PathSegment, point: Translation2d): number {
  const t = segment.getBestT(point);
  return segment.getPosition(t).subtract(point).getMagnitude();
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
  const halfField = FIELD_SIZE_IN / 2;
  return {
    x: (point.x + halfField) * scale,
    y: (halfField - point.y) * scale,
  };
}

export function fromCanvas(point: Translation2d, scale: number): Translation2d {
  const halfField = FIELD_SIZE_IN / 2;
  return {
    x: point.x / scale - halfField,
    y: halfField - point.y / scale,
  };
}

export function clampCanvasPoint(x: number, y: number, canvasSize: number): Translation2d {
  return {
    x: Math.max(0, Math.min(canvasSize, x)),
    y: Math.max(0, Math.min(canvasSize, y)),
  };
}

export function clampCanvasPosePosition(point: Translation2d, scale: number): Translation2d {
  const halfField = FIELD_SIZE_IN / 2;
  return toCanvas(
    {
      x: clampField(point.x / scale - halfField),
      y: clampField(halfField - point.y / scale),
    },
    scale,
  );
}

export function clampField(value: number): number {
  const limit = FIELD_SIZE_IN / 2 - FIELD_EDGE_MARGIN_IN;
  return Math.max(-limit, Math.min(limit, value));
}

export function isEndpoint(index: number, length: number): boolean {
  return index === 0 || index === length - 1;
}

export function snap(value: number): number {
  return Math.round(value * 10) / 10;
}
