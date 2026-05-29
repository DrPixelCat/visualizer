import { InterpolationStyle, type Translation2d } from "@/lib/geometry";
import { FIELD_EDGE_MARGIN_IN, FIELD_SIZE_IN } from "@/lib/editor/path-editor-constants";
import { clampField, isEndpoint, makePose, sanitizePath, snap } from "@/lib/editor/path-editor-geometry";
import type { EditorPath, EditorPose, EditorState, EditorTurn } from "@/lib/editor/path-editor-types";

export function snapEndpointIfCloseInState(
  state: EditorState,
  pathId: string,
  poseId: string,
): EditorState {
  const path = state.paths.find((item) => item.id === pathId);
  if (!path) return state;

  const poseIndex = path.poses.findIndex((pose) => pose.id === poseId);
  if (!isEndpoint(poseIndex, path.poses.length)) return state;

  const pose = path.poses[poseIndex];
  let snapTarget: { x: number; y: number; headingDeg: number | null } | null = null;

  // Only start-to-end or end-to-start endpoint releases can snap across paths.
  for (const otherPath of state.paths) {
    if (otherPath.id === pathId) continue;
    const otherEndpoint =
      poseIndex === 0 ? otherPath.poses[otherPath.poses.length - 1] : otherPath.poses[0];
    if (Math.hypot(pose.x - otherEndpoint.x, pose.y - otherEndpoint.y) <= 2) {
      snapTarget = otherEndpoint;
      break;
    }
  }

  const turnTarget = !snapTarget
    ? state.turns.find((turn) => Math.hypot(pose.x - turn.x, pose.y - turn.y) <= 2)
    : null;
  if (turnTarget) {
    snapTarget = {
      x: turnTarget.x,
      y: turnTarget.y,
      headingDeg: poseIndex === 0 ? turnTarget.targetHeadingDeg : pose.headingDeg,
    };
  }

  if (!snapTarget) return state;

  return {
    ...state,
    paths: state.paths.map((item) =>
      item.id === pathId
        ? sanitizePath({
            ...item,
            poses: item.poses.map((candidate) =>
              candidate.id === poseId
                ? {
                    ...candidate,
                    x: clampField(snapTarget.x),
                    y: clampField(snapTarget.y),
                    headingDeg: snapTarget.headingDeg ?? candidate.headingDeg,
                  }
                : candidate,
            ),
          })
        : item,
    ),
    turns: turnTarget && poseIndex === path.poses.length - 1
      ? state.turns.map((turn) =>
          turn.id === turnTarget.id
            ? { ...turn, sourcePathId: pathId, startHeadingDeg: pose.headingDeg ?? turn.startHeadingDeg }
            : turn,
        )
      : state.turns,
  };
}

export function snapTurnIfCloseInState(state: EditorState, turnId: string): EditorState {
  const turn = state.turns.find((item) => item.id === turnId);
  if (!turn) return state;

  let snapTarget: { pathId: string; isEnd: boolean; x: number; y: number; headingDeg: number | null } | null = null;
  for (const path of state.paths) {
    for (const [index, endpoint] of [path.poses[0], path.poses[path.poses.length - 1]].entries()) {
      if (Math.hypot(turn.x - endpoint.x, turn.y - endpoint.y) <= 2) {
        snapTarget = { ...endpoint, pathId: path.id, isEnd: index === 1 };
        break;
      }
    }
    if (snapTarget) break;
  }

  if (!snapTarget) return state;

  return {
    ...state,
    turns: state.turns.map((item) =>
      item.id === turnId
        ? {
            ...item,
            sourcePathId: snapTarget.isEnd ? snapTarget.pathId : undefined,
            x: clampField(snapTarget.x),
            y: clampField(snapTarget.y),
            startHeadingDeg: snapTarget.headingDeg ?? item.startHeadingDeg,
          }
        : item,
    ),
  };
}

export function patchTurnPoint(turns: EditorTurn[], turnId: string, point: { x: number; y: number }): EditorTurn[] {
  return turns.map((turn) =>
    turn.id === turnId ? { ...turn, sourcePathId: undefined, x: snap(point.x), y: snap(point.y) } : turn,
  );
}

export function makeTurnAfterPose(turnCount: number, pathId: string, pose: EditorPose): EditorTurn {
  const headingDeg = pose.headingDeg ?? 0;
  return {
    id: `turn-${crypto.randomUUID()}`,
    name: `turn${turnCount + 1}`,
    sourcePathId: pathId,
    x: pose.x,
    y: pose.y,
    startHeadingDeg: headingDeg,
    targetHeadingDeg: normalizeHeadingDeg(headingDeg + 90),
    collapsed: false,
  };
}

export function makePathAfterPose(pathCount: number, pose: EditorPose): EditorPath {
  return makePath(pathCount, pose, {
    x: clampField(pose.x + 36),
    y: clampField(pose.y + 18),
    headingDeg: 0,
  });
}

export function makePathAfterTurn(pathCount: number, turn: EditorTurn, point: Translation2d): EditorPath {
  return makePath(
    pathCount,
    { x: turn.x, y: turn.y, headingDeg: turn.targetHeadingDeg },
    { x: snap(point.x), y: snap(point.y), headingDeg: 0 },
  );
}

function makePath(
  pathCount: number,
  start: Translation2d & { headingDeg: number | null },
  end: Translation2d & { headingDeg: number | null },
): EditorPath {
  return {
    id: `path-${crypto.randomUUID()}`,
    name: `path${pathCount + 1}`,
    collapsed: false,
    interpolation: InterpolationStyle.SMOOTH_START_TO_END,
    tangentOffsetDeg: 90,
    customFunctionSource: "s -> Angle.fromDeg(180 + (s * 360.0))",
    poses: [
      makePose("pose1", start.x, start.y, start.headingDeg),
      makePose("pose2", end.x, end.y, end.headingDeg),
    ],
    actions: [],
  };
}

export function clampPathDelta(delta: number, values: number[]): number {
  const limit = FIELD_SIZE_IN / 2 - FIELD_EDGE_MARGIN_IN;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  return Math.max(-limit - minValue, Math.min(limit - maxValue, delta));
}

export function normalizeHeadingDeg(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
