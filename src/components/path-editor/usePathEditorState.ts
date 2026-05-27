"use client";

import { useEffect, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { InterpolationStyle, type Translation2d } from "@/lib/geometry";
import { FIELD_SIZE_IN, MIN_ARC_RADIUS_IN } from "@/lib/editor/path-editor-constants";
import {
  buildPath,
  clampCanvasPoint,
  clampField,
  constrainPointNearArcs,
  endpointIsSnapped,
  fromCanvas,
  isEndpoint,
  makePose,
  renumberPoses,
  sanitizePosePatch,
  snap,
} from "@/lib/editor/path-editor-geometry";
import type {
  EditorPath,
  EditorPose,
  EditorState,
  HistoryState,
  PathAction,
} from "@/lib/editor/path-editor-types";

// Demo seed mirrors the eventual fluent path shape while keeping startup useful.
const INITIAL_PATHS: EditorPath[] = [
  {
    id: "path-0",
    name: "path1",
    collapsed: false,
    interpolation: InterpolationStyle.SMOOTH_START_TO_END,
    tangentOffsetDeg: 90,
    customFunctionSource: "s -> Angle.fromDeg(180 + (s * 360.0))",
    poses: [
      makePose("pose1", 12, 18, 0),
      makePose("pose2", 36, 108, null),
      { ...makePose("pose3", 74, 86, null), kind: "arc", radius: 18 },
      makePose("pose4", 120, 34, 45),
    ],
    actions: [{ id: "action-0", type: "callback", distanceIn: 60, label: "callback" }],
  },
];

const INITIAL_STATE: EditorState = {
  paths: INITIAL_PATHS,
  activePathId: INITIAL_PATHS[0].id,
  selectedPoseId: INITIAL_PATHS[0].poses[0].id,
  showPoseLabels: true,
};

export function usePathEditorState() {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartStateRef = useRef<EditorState | null>(null);
  const [canvasSize, setCanvasSize] = useState(0);
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: INITIAL_STATE,
    future: [],
  });
  const [editingPathId, setEditingPathId] = useState<string | null>(null);
  const [dragStartedSnappedEndpoint, setDragStartedSnappedEndpoint] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      setCanvasSize(Math.floor(Math.min(entry.contentRect.width, entry.contentRect.height)));
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;

      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        undo();
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const state = history.present;
  const activePath = state.paths.find((path) => path.id === state.activePathId) ?? state.paths[0];
  const builtPaths = state.paths.map(buildPath);
  const scale = canvasSize / FIELD_SIZE_IN;

  // Commit stores undo checkpoints; live updates avoid filling history during drags.
  function commit(mutator: (current: EditorState) => EditorState) {
    setHistory((current) => {
      const next = mutator(current.present);
      return { past: [...current.past, current.present].slice(-80), present: next, future: [] };
    });
  }

  function updateLive(mutator: (current: EditorState) => EditorState) {
    setHistory((current) => ({ ...current, present: mutator(current.present) }));
  }

  function undo() {
    setHistory((current) => {
      const previous = current.past[current.past.length - 1];
      return previous
        ? { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future] }
        : current;
    });
  }

  function redo() {
    setHistory((current) => {
      const next = current.future[0];
      return next
        ? { past: [...current.past, current.present], present: next, future: current.future.slice(1) }
        : current;
    });
  }

  function beginDrag(pathId?: string, poseId?: string) {
    dragStartStateRef.current = history.present;
    setDragStartedSnappedEndpoint(
      Boolean(pathId && poseId && endpointIsSnapped(history.present, pathId, poseId)),
    );
  }

  function endDrag() {
    const dragStartState = dragStartStateRef.current;
    dragStartStateRef.current = null;
    setDragStartedSnappedEndpoint(false);
    if (!dragStartState) return;

    setHistory((current) => ({
      past: [...current.past, dragStartState].slice(-80),
      present: current.present,
      future: [],
    }));
  }

  function patchPath(pathId: string, patch: Partial<EditorPath>) {
    commit((current) => ({
      ...current,
      paths: current.paths.map((path) => (path.id === pathId ? { ...path, ...patch } : path)),
    }));
  }

  function patchPose(pathId: string, poseId: string, patch: Partial<EditorPose>) {
    patchPoseWith(commit, pathId, poseId, patch);
  }

  function patchPoseLive(pathId: string, poseId: string, patch: Partial<EditorPose>) {
    patchPoseWith(updateLive, pathId, poseId, patch);
  }

  function patchPoseWith(
    apply: (mutator: (current: EditorState) => EditorState) => void,
    pathId: string,
    poseId: string,
    patch: Partial<EditorPose>,
  ) {
    apply((current) => ({
      ...current,
      paths: current.paths.map((path) =>
        path.id === pathId
          ? {
              ...path,
              poses: path.poses.map((pose) =>
                pose.id === poseId ? sanitizePosePatch(path, pose, patch) : pose,
              ),
            }
          : path,
      ),
    }));
  }

  function selectPath(pathId: string) {
    const path = state.paths.find((item) => item.id === pathId);
    if (!path) return;
    commit((current) => ({ ...current, activePathId: pathId, selectedPoseId: path.poses[0].id }));
  }

  function selectPose(pathId: string, poseId: string) {
    commit((current) => ({ ...current, activePathId: pathId, selectedPoseId: poseId }));
  }

  function addPath() {
    const previousPath = state.paths[state.paths.length - 1];
    const previousEnd = previousPath.poses[previousPath.poses.length - 1];
    const id = `path-${crypto.randomUUID()}`;
    const nextPath: EditorPath = {
      id,
      name: `path${state.paths.length + 1}`,
      collapsed: false,
      interpolation: InterpolationStyle.SMOOTH_START_TO_END,
      tangentOffsetDeg: 90,
      customFunctionSource: "s -> Angle.fromDeg(180 + (s * 360.0))",
      poses: [
        makePose("pose1", previousEnd.x, previousEnd.y, previousEnd.headingDeg ?? 0),
        makePose("pose2", clampField(previousEnd.x + 36), clampField(previousEnd.y + 18), 0),
      ],
      actions: [],
    };

    commit((current) => ({
      ...current,
      paths: [...current.paths, nextPath],
      activePathId: id,
      selectedPoseId: nextPath.poses[0].id,
    }));
  }

  function deletePath(pathId: string) {
    if (state.paths.length <= 1) return;

    const nextPaths = state.paths.filter((path) => path.id !== pathId);
    commit((current) => ({
      ...current,
      paths: nextPaths,
      activePathId: current.activePathId === pathId ? nextPaths[0].id : current.activePathId,
      selectedPoseId:
        current.activePathId === pathId ? nextPaths[0].poses[0].id : current.selectedPoseId,
    }));
  }

  function movePath(pathId: string, direction: -1 | 1) {
    const index = state.paths.findIndex((path) => path.id === pathId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= state.paths.length) return;

    commit((current) => {
      const paths = [...current.paths];
      const [path] = paths.splice(index, 1);
      paths.splice(nextIndex, 0, path);
      return { ...current, paths };
    });
  }

  function addPose(point: Translation2d) {
    const nextPose = makePose(
      `pose${activePath.poses.length + 1}`,
      snap(point.x),
      snap(point.y),
      null,
    );

    commit((current) => ({
      ...current,
      paths: current.paths.map((path) =>
        path.id === activePath.id ? { ...path, poses: [...path.poses, nextPose] } : path,
      ),
      selectedPoseId: nextPose.id,
    }));
  }

  function deletePose(pathId: string, poseId: string) {
    const path = state.paths.find((item) => item.id === pathId);
    if (!path || path.poses.length <= 2) return;

    const nextPoses = path.poses.filter((pose) => pose.id !== poseId);
    commit((current) => ({
      ...current,
      paths: current.paths.map((item) =>
        item.id === pathId ? { ...item, poses: renumberPoses(nextPoses) } : item,
      ),
      selectedPoseId: current.selectedPoseId === poseId ? nextPoses[0].id : current.selectedPoseId,
    }));
  }

  function addAction(pathId: string, type: PathAction["type"]) {
    const path = state.paths.find((item) => item.id === pathId);
    const built = builtPaths.find((item) => item.path.id === pathId);
    if (!path) return;

    const id = `action-${crypto.randomUUID()}`;
    const nextAction: PathAction =
      type === "callback"
        ? { id, type, distanceIn: Math.round((built?.segment?.getLengthIn() ?? 100) / 2), label: "callback" }
        : type === "turn"
          ? { id, type, headingDeg: 180 }
          : { id, type, durationSeconds: 1 };

    patchPath(pathId, { actions: [...path.actions, nextAction] });
  }

  function patchAction(pathId: string, actionId: string, patch: Partial<PathAction>) {
    patchActionWith(commit, pathId, actionId, patch);
  }

  function patchActionLive(pathId: string, actionId: string, patch: Partial<PathAction>) {
    patchActionWith(updateLive, pathId, actionId, patch);
  }

  function patchActionWith(
    apply: (mutator: (current: EditorState) => EditorState) => void,
    pathId: string,
    actionId: string,
    patch: Partial<PathAction>,
  ) {
    if (!state.paths.some((item) => item.id === pathId)) return;

    apply((current) => ({
      ...current,
      paths: current.paths.map((item) =>
        item.id === pathId
          ? {
              ...item,
              actions: item.actions.map((action) =>
                action.id === actionId ? ({ ...action, ...patch } as PathAction) : action,
              ),
            }
          : item,
      ),
    }));
  }

  function removeAction(pathId: string, actionId: string) {
    const path = state.paths.find((item) => item.id === pathId);
    if (!path) return;
    patchPath(pathId, { actions: path.actions.filter((action) => action.id !== actionId) });
  }

  function handleFieldDoubleClick(event: KonvaEventObject<MouseEvent>) {
    event.cancelBubble = true;
    const position = event.target.getStage()?.getPointerPosition();
    if (!position) return;
    addPose(fromCanvas(clampCanvasPoint(position.x, position.y, canvasSize), scale));
  }

  function handlePoseDrag(pathId: string, poseId: string, event: KonvaEventObject<DragEvent>) {
    const path = state.paths.find((item) => item.id === pathId);
    if (!path) return;

    const rawPoint = fromCanvas(
      clampCanvasPoint(event.target.x(), event.target.y(), canvasSize),
      scale,
    );
    const nextPoint = constrainPointNearArcs(path, poseId, rawPoint);
    patchPoseLive(pathId, poseId, { x: snap(nextPoint.x), y: snap(nextPoint.y) });
  }

  function handlePoseDragEnd(pathId: string, poseId: string, event: KonvaEventObject<DragEvent>) {
    handlePoseDrag(pathId, poseId, event);
    if (!dragStartedSnappedEndpoint) snapEndpointIfClose(pathId, poseId);
    endDrag();
  }

  function handleGhostDrag(pathId: string, arcPoseId: string, event: KonvaEventObject<DragEvent>) {
    const path = state.paths.find((item) => item.id === pathId);
    const arcPose = path?.poses.find((pose) => pose.id === arcPoseId);
    if (!path || !arcPose) return;

    const point = fromCanvas(
      clampCanvasPoint(event.target.x(), event.target.y(), canvasSize),
      scale,
    );
    const radius = Math.hypot(point.x - arcPose.x, point.y - arcPose.y);
    patchPoseLive(path.id, arcPose.id, { radius: snap(Math.max(MIN_ARC_RADIUS_IN, radius)) });
  }

  function handleGhostDragEnd(
    pathId: string,
    arcPoseId: string,
    event: KonvaEventObject<DragEvent>,
  ) {
    handleGhostDrag(pathId, arcPoseId, event);
    endDrag();
  }

  function handleCallbackDrag(pathId: string, actionId: string, event: KonvaEventObject<DragEvent>) {
    const built = builtPaths.find((item) => item.path.id === pathId);
    if (!built?.segment) return;

    const point = fromCanvas(
      clampCanvasPoint(event.target.x(), event.target.y(), canvasSize),
      scale,
    );
    const t = built.segment.getBestT(point);
    const curvePoint = built.segment.getPosition(t);
    const distanceToEnd = built.segment.getDistanceToEndIn(curvePoint, t);
    patchActionLive(pathId, actionId, {
      distanceIn: snap(Math.max(0, built.segment.getLengthIn() - distanceToEnd)),
    });
  }

  function handleCallbackDragEnd(
    pathId: string,
    actionId: string,
    event: KonvaEventObject<DragEvent>,
  ) {
    handleCallbackDrag(pathId, actionId, event);
    endDrag();
  }

  function snapEndpointIfClose(pathId: string, poseId: string) {
    setHistory((current) => {
      const path = current.present.paths.find((item) => item.id === pathId);
      if (!path) return current;

      const poseIndex = path.poses.findIndex((pose) => pose.id === poseId);
      if (!isEndpoint(poseIndex, path.poses.length)) return current;

      const pose = path.poses[poseIndex];
      let snapTarget: Translation2d | null = null;

      // Only start-to-end or end-to-start endpoint releases can snap across paths.
      for (const otherPath of current.present.paths) {
        if (otherPath.id === pathId) continue;
        const otherEndpoint =
          poseIndex === 0 ? otherPath.poses[otherPath.poses.length - 1] : otherPath.poses[0];
        if (Math.hypot(pose.x - otherEndpoint.x, pose.y - otherEndpoint.y) <= 2) {
          snapTarget = otherEndpoint;
          break;
        }
      }

      if (!snapTarget) return current;

      return {
        ...current,
        present: {
          ...current.present,
          paths: current.present.paths.map((item) =>
            item.id === pathId
              ? {
                  ...item,
                  poses: item.poses.map((candidate) =>
                    candidate.id === poseId
                      ? { ...candidate, x: clampField(snapTarget.x), y: clampField(snapTarget.y) }
                      : candidate,
                  ),
                }
              : item,
          ),
        },
      };
    });
  }

  return {
    containerRef,
    state,
    history,
    editingPathId,
    builtPaths,
    canvasSize,
    scale,
    undo,
    redo,
    addPath,
    deletePath,
    movePath,
    selectPath,
    selectPose,
    patchPath,
    patchPose,
    setEditingPathId,
    addAction,
    patchAction,
    removeAction,
    beginDrag,
    handleFieldDoubleClick,
    handlePoseDrag,
    handlePoseDragEnd,
    handleGhostDrag,
    handleGhostDragEnd,
    handleCallbackDrag,
    handleCallbackDragEnd,
    deletePose,
    commit,
  };
}
