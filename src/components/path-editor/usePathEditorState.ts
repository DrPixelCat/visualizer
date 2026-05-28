"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { InterpolationStyle, type Translation2d } from "@/lib/geometry";
import {
  FIELD_EDGE_MARGIN_IN,
  FIELD_SIZE_IN,
  MIN_ARC_RADIUS_IN,
} from "@/lib/editor/path-editor-constants";
import {
  buildPath,
  clampCanvasPoint,
  clampField,
  constrainPointNearArcs,
  distanceToPathIn,
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
  EditorSelection,
  BuiltPath,
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
      makePose("pose1", -54, -36, 0),
      makePose("pose2", -20, 36, null),
      { ...makePose("pose3", 16, 22, null), kind: "arc", radius: 18 },
      makePose("pose4", 54, -38, 45),
    ],
    actions: [{ id: "action-0", type: "callback", distanceIn: 60, label: "callback" }],
  },
];

const INITIAL_STATE: EditorState = {
  paths: INITIAL_PATHS,
  activePathId: INITIAL_PATHS[0].id,
  selection: { type: "pose", pathId: INITIAL_PATHS[0].id, poseId: INITIAL_PATHS[0].poses[0].id },
  showPoseLabels: true,
};

function buildCachedPaths(
  paths: EditorPath[],
  cache: Map<string, { signature: string; built: BuiltPath }>,
): BuiltPath[] {
  const livePathIds = new Set(paths.map((path) => path.id));
  for (const pathId of cache.keys()) {
    if (!livePathIds.has(pathId)) cache.delete(pathId);
  }

  return paths.map((path) => {
    const signature = geometrySignature(path);
    const cached = cache.get(path.id);
    if (cached?.signature === signature) {
      return { ...cached.built, path };
    }

    const built = buildPath(path);
    cache.set(path.id, { signature, built });
    return built;
  });
}

function geometrySignature(path: EditorPath): string {
  return path.poses
    .map((pose) => `${pose.id}:${pose.x}:${pose.y}:${pose.headingDeg ?? ""}:${pose.kind}:${pose.radius}`)
    .join("|");
}

export function usePathEditorState() {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartStateRef = useRef<EditorState | null>(null);
  const keyboardHandlersRef = useRef({
    undo: () => {},
    redo: () => {},
    convertSelectedPoseToArc: () => {},
    deleteSelected: () => {},
  });
  const pathDragStateRef = useRef<{
    pathId: string;
    poses: EditorPose[];
    startPoint: Translation2d;
  } | null>(null);
  const builtPathCacheRef = useRef(new Map<string, { signature: string; built: BuiltPath }>());
  const [canvasSize, setCanvasSize] = useState(0);
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: INITIAL_STATE,
    future: [],
  });
  const [dragStartedSnappedEndpoint, setDragStartedSnappedEndpoint] = useState(false);
  const [arcShortcutHintVisible, setArcShortcutHintVisible] = useState(false);
  const [pendingHeadingPoseId, setPendingHeadingPoseId] = useState<string | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      setCanvasSize(Math.floor(Math.min(entry.contentRect.width, entry.contentRect.height)));
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  const state = history.present;
  const activePath = state.paths.find((path) => path.id === state.activePathId) ?? state.paths[0];
  const builtPaths = useMemo(
    () => buildCachedPaths(state.paths, builtPathCacheRef.current),
    [state.paths],
  );
  const scale = canvasSize / FIELD_SIZE_IN;
  const selectedPoseId = state.selection?.type === "pose" ? state.selection.poseId : "";
  const selectedActionId = state.selection?.type === "action" ? state.selection.actionId : "";

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

  function beginPathDrag(pathId: string, event: KonvaEventObject<DragEvent>) {
    const path = history.present.paths.find((item) => item.id === pathId);
    const position = event.target.getStage()?.getPointerPosition();
    if (!path) return;

    dragStartStateRef.current = history.present;
    pathDragStateRef.current = {
      pathId,
      poses: path.poses,
      startPoint: position
        ? fromCanvas(clampCanvasPoint(position.x, position.y, canvasSize), scale)
        : { x: 0, y: 0 },
    };
  }

  function endDrag() {
    const dragStartState = dragStartStateRef.current;
    dragStartStateRef.current = null;
    pathDragStateRef.current = null;
    setDragStartedSnappedEndpoint(false);
    if (!dragStartState) return;

    setHistory((current) => ({
      past: [...current.past, dragStartState].slice(-80),
      present: current.present,
      future: [],
    }));
  }

  function patchPath(pathId: string, patch: Partial<EditorPath>) {
    const apply = Object.keys(patch).every((key) => key === "name") ? updateLive : commit;
    apply((current) => ({
      ...current,
      paths: current.paths.map((path) => (path.id === pathId ? { ...path, ...patch } : path)),
    }));
  }

  function patchPose(pathId: string, poseId: string, patch: Partial<EditorPose>) {
    const apply = Object.keys(patch).every((key) => key === "name") ? updateLive : commit;
    patchPoseWith(apply, pathId, poseId, patch);
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
    updateLive((current) => ({
      ...current,
      activePathId: pathId,
      selection: { type: "path", pathId },
    }));
  }

  function selectPose(pathId: string, poseId: string) {
    const path = state.paths.find((item) => item.id === pathId);
    const poseIndex = path?.poses.findIndex((pose) => pose.id === poseId) ?? -1;
    setPendingHeadingPoseId(
      path && isEndpoint(poseIndex, path.poses.length) ? poseId : null,
    );
    updateLive((current) => ({
      ...current,
      activePathId: pathId,
      selection: { type: "pose", pathId, poseId },
    }));
  }

  function selectAction(pathId: string, actionId: string) {
    updateLive((current) => ({
      ...current,
      activePathId: pathId,
      selection: { type: "action", pathId, actionId },
    }));
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
      selection: { type: "pose", pathId: id, poseId: nextPath.poses[0].id },
    }));
  }

  function deletePath(pathId: string) {
    if (state.paths.length <= 1) return;

    const nextPaths = state.paths.filter((path) => path.id !== pathId);
    commit((current) => ({
      ...current,
      paths: nextPaths,
      activePathId: current.activePathId === pathId ? nextPaths[0].id : current.activePathId,
      selection:
        current.activePathId === pathId ? { type: "path", pathId: nextPaths[0].id } : current.selection,
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
      selection: { type: "pose", pathId: activePath.id, poseId: nextPose.id },
    }));
  }

  function deletePose(pathId: string, poseId: string) {
    const path = state.paths.find((item) => item.id === pathId);
    if (!path || path.poses.length <= 2) return;

    const nextPoses = path.poses.filter((pose) => pose.id !== poseId);
    const nextSelection: EditorSelection =
      state.selection?.type === "pose" && state.selection.poseId === poseId
        ? { type: "pose", pathId, poseId: nextPoses[0].id }
        : state.selection;

    commit((current) => ({
      ...current,
      paths: current.paths.map((item) =>
        item.id === pathId ? { ...item, poses: renumberPoses(nextPoses) } : item,
      ),
      selection: nextSelection,
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
    const apply = Object.keys(patch).every((key) => key === "label") ? updateLive : commit;
    patchActionWith(apply, pathId, actionId, patch);
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
    commit((current) => ({
      ...current,
      paths: current.paths.map((item) =>
        item.id === pathId
          ? { ...item, actions: item.actions.filter((action) => action.id !== actionId) }
          : item,
      ),
      selection:
        current.selection?.type === "action" && current.selection.actionId === actionId
          ? { type: "path", pathId }
          : current.selection,
    }));
  }

  function handleFieldClick(event: KonvaEventObject<MouseEvent>) {
    const position = event.target.getStage()?.getPointerPosition();
    if (!position || event.evt.detail > 1) return;

    const point = fromCanvas(clampCanvasPoint(position.x, position.y, canvasSize), scale);
    let best: { pathId: string; distanceIn: number } | null = null;

    for (const built of builtPaths) {
      if (!built.segment) continue;
      const distanceIn = distanceToPathIn(built.segment, point);
      if (distanceIn <= 2 && (!best || distanceIn < best.distanceIn)) {
        best = { pathId: built.path.id, distanceIn };
      }
    }

    if (best) selectPath(best.pathId);
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

  function handlePathDrag(pathId: string, event: KonvaEventObject<DragEvent>) {
    const dragState = pathDragStateRef.current;
    if (!dragState || dragState.pathId !== pathId) return;

    const position = event.target.getStage()?.getPointerPosition();
    if (!position) return;

    const point = fromCanvas(clampCanvasPoint(position.x, position.y, canvasSize), scale);
    const rawDx = point.x - dragState.startPoint.x;
    const rawDy = point.y - dragState.startPoint.y;
    const dx = clampPathDelta(rawDx, dragState.poses.map((pose) => pose.x));
    const dy = clampPathDelta(rawDy, dragState.poses.map((pose) => pose.y));

    event.target.position({ x: 0, y: 0 });

    updateLive((current) => ({
      ...current,
      paths: current.paths.map((path) =>
        path.id === pathId
          ? {
              ...path,
              poses: dragState.poses.map((pose) => ({
                ...pose,
                x: snap(pose.x + dx),
                y: snap(pose.y + dy),
              })),
            }
          : path,
      ),
    }));
  }

  function handlePathDragEnd(pathId: string, event: KonvaEventObject<DragEvent>) {
    handlePathDrag(pathId, event);
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

  function convertSelectedPoseToArc() {
    const selection = state.selection;
    if (selection?.type !== "pose") return;

    const path = state.paths.find((item) => item.id === selection.pathId);
    const poseIndex = path?.poses.findIndex((pose) => pose.id === selection.poseId) ?? -1;
    if (!path || isEndpoint(poseIndex, path.poses.length)) return;

    const pose = path.poses[poseIndex];
    patchPose(path.id, selection.poseId, {
      kind: pose.kind === "arc" ? "pose" : "arc",
    });
  }

  function handleHeadingDrag(pathId: string, poseId: string, event: KonvaEventObject<DragEvent>) {
    const path = state.paths.find((item) => item.id === pathId);
    const pose = path?.poses.find((item) => item.id === poseId);
    if (!pose) return;

    const position = event.target.getStage()?.getPointerPosition();
    if (!position) return;

    const point = fromCanvas(clampCanvasPoint(position.x, position.y, canvasSize), scale);
    const headingDeg = normalizeHeadingDeg(
      Math.atan2(point.y - pose.y, point.x - pose.x) * 180 / Math.PI,
    );

    patchPoseLive(pathId, poseId, { headingDeg: snap(headingDeg) });
  }

  function handleHeadingDragEnd(
    pathId: string,
    poseId: string,
    event: KonvaEventObject<DragEvent>,
  ) {
    handleHeadingDrag(pathId, poseId, event);
    setPendingHeadingPoseId(null);
    endDrag();
  }

  function deleteSelected() {
    const selection = state.selection;
    if (!selection) return;

    if (selection.type === "pose") {
      deletePose(selection.pathId, selection.poseId);
    } else if (selection.type === "path") {
      deletePath(selection.pathId);
    } else {
      removeAction(selection.pathId, selection.actionId);
    }
  }

  function showArcShortcutHint() {
    setArcShortcutHintVisible(true);
    window.setTimeout(() => setArcShortcutHintVisible(false), 1800);
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

  function clampPathDelta(delta: number, values: number[]): number {
    const limit = FIELD_SIZE_IN / 2 - FIELD_EDGE_MARGIN_IN;
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    return Math.max(-limit - minValue, Math.min(limit - maxValue, delta));
  }

  function normalizeHeadingDeg(value: number): number {
    return ((value % 360) + 360) % 360;
  }

  keyboardHandlersRef.current = {
    undo,
    redo,
    convertSelectedPoseToArc,
    deleteSelected,
  };

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || event.altKey || event.metaKey) return;

      const key = event.key.toLowerCase();
      if (event.ctrlKey && !event.shiftKey && key === "z") {
        event.preventDefault();
        keyboardHandlersRef.current.undo();
      } else if (event.ctrlKey && !event.shiftKey && key === "y") {
        event.preventDefault();
        keyboardHandlersRef.current.redo();
      } else if (!event.ctrlKey && key === "a") {
        event.preventDefault();
        keyboardHandlersRef.current.convertSelectedPoseToArc();
      } else if (!event.ctrlKey && (key === "delete" || key === "backspace")) {
        event.preventDefault();
        keyboardHandlersRef.current.deleteSelected();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function isTypingTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  }

  return {
    containerRef,
    state,
    selectedPoseId,
    selectedActionId,
    history,
    arcShortcutHintVisible,
    pendingHeadingPoseId,
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
    selectAction,
    patchPath,
    patchPose,
    addAction,
    patchAction,
    removeAction,
    beginDrag,
    handleFieldDoubleClick,
    handleFieldClick,
    handlePathDrag,
    handlePathDragEnd,
    handlePoseDrag,
    handlePoseDragEnd,
    handleGhostDrag,
    handleGhostDragEnd,
    handleCallbackDrag,
    handleCallbackDragEnd,
    handleHeadingDrag,
    handleHeadingDragEnd,
    showArcShortcutHint,
    deletePose,
    commit,
    beginPathDrag,
  };
}
