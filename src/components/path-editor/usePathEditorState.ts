"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Translation2d } from "@/lib/geometry";
import { FIELD_SIZE_IN, MIN_ARC_RADIUS_IN } from "@/lib/editor/path-editor-constants";
import {
  clampCanvasPoint,
  constrainPointNearArcs,
  distanceToPathIn,
  endpointIsSnapped,
  fromCanvas,
  isEndpoint,
  makePose,
  renumberPoses,
  sanitizePath,
  sanitizePosePatch,
  snap,
} from "@/lib/editor/path-editor-geometry";
import { buildCachedPaths, type BuiltPathCache } from "@/lib/editor/path-editor-cache";
import { INITIAL_STATE } from "@/lib/editor/path-editor-initial-state";
import {
  clampPathDelta,
  isTypingTarget,
  makePathAfterPose,
  makePathAfterTurn,
  makeTurnAfterPose,
  normalizeHeadingDeg,
  patchTurnPoint,
  snapEndpointIfCloseInState,
  snapTurnIfCloseInState,
} from "@/lib/editor/path-editor-state-utils";
import type {
  EditorPath,
  EditorPose,
  EditorState,
  EditorSelection,
  EditorTurn,
  HistoryState,
  PathAction,
} from "@/lib/editor/path-editor-types";

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
  const builtPathCacheRef = useRef<BuiltPathCache>(new Map());
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
  const selectedTurnId = state.selection?.type === "turn" ? state.selection.turnId : "";
  const favoritePoses = useMemo(
    () =>
      state.favoritePoseIds
        .map((id) => state.paths.flatMap((path) => path.poses).find((pose) => pose.id === id))
        .filter((pose): pose is EditorPose => Boolean(pose)),
    [state.favoritePoseIds, state.paths],
  );

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
          ? sanitizePath({
              ...path,
              poses: path.poses.map((pose) =>
                pose.id === poseId ? sanitizePosePatch(path, pose, patch) : pose,
              ),
            })
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

  function selectTurn(turnId: string) {
    updateLive((current) => ({
      ...current,
      selection: { type: "turn", turnId },
    }));
  }
  function addPath() {
    const previousPath = state.paths[state.paths.length - 1];
    const previousEnd = previousPath.poses[previousPath.poses.length - 1];
    const nextPath = makePathAfterPose(state.paths.length, previousEnd);

    commit((current) => ({
      ...current,
      paths: [...current.paths, nextPath],
      activePathId: nextPath.id,
      selection: { type: "pose", pathId: nextPath.id, poseId: nextPath.poses[0].id },
    }));
  }

  function addTurn() {
    const sourcePath = activePath;
    const sourceEnd = sourcePath.poses[sourcePath.poses.length - 1];
    const nextTurn = makeTurnAfterPose(state.turns.length, sourcePath.id, sourceEnd);

    commit((current) => ({
      ...current,
      turns: [...current.turns, nextTurn],
      selection: { type: "turn", turnId: nextTurn.id },
    }));
  }
  function deletePath(pathId: string) {
    if (state.paths.length <= 1) return;

    const deletedPoseIds = new Set(
      state.paths.find((path) => path.id === pathId)?.poses.map((pose) => pose.id) ?? [],
    );
    const nextPaths = state.paths.filter((path) => path.id !== pathId);
    commit((current) => ({
      ...current,
      paths: nextPaths,
      activePathId: current.activePathId === pathId ? nextPaths[0].id : current.activePathId,
      selection:
        current.activePathId === pathId
          ? { type: "path", pathId: nextPaths[0].id }
          : current.selection,
      favoritePoseIds: current.favoritePoseIds.filter((id) => !deletedPoseIds.has(id)),
    }));
  }

  function deleteTurn(turnId: string) {
    commit((current) => ({
      ...current,
      turns: current.turns.filter((turn) => turn.id !== turnId),
      selection:
        current.selection?.type === "turn" && current.selection.turnId === turnId
          ? { type: "path", pathId: current.activePathId }
          : current.selection,
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
    const selectedTurnIdForPath = state.selection?.type === "turn" ? state.selection.turnId : null;
    const selectedTurn = state.turns.find((turn) => turn.id === selectedTurnIdForPath);
    if (selectedTurn) {
      const nextPath = makePathAfterTurn(state.paths.length, selectedTurn, point);
      commit((current) => ({
        ...current,
        paths: [...current.paths, nextPath],
        activePathId: nextPath.id,
        selection: { type: "pose", pathId: nextPath.id, poseId: nextPath.poses[1].id },
      }));
      return;
    }

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

  function addPoseToActivePath(sourcePose: EditorPose) {
    const nextPose: EditorPose = {
      ...sourcePose,
      id: `pose-${crypto.randomUUID()}`,
      name: `pose${activePath.poses.length + 1}`,
    };

    commit((current) => ({
      ...current,
      paths: current.paths.map((path) =>
        path.id === activePath.id ? sanitizePath({ ...path, poses: [...path.poses, nextPose] }) : path,
      ),
      selection: { type: "pose", pathId: activePath.id, poseId: nextPose.id },
    }));
  }

  function useFavoritePose(poseId: string) {
    const pose = state.paths.flatMap((path) => path.poses).find((item) => item.id === poseId);
    if (pose) addPoseToActivePath(pose);
  }
  function toggleFavoritePose(poseId: string) {
    updateLive((current) => ({
      ...current,
      favoritePoseIds: current.favoritePoseIds.includes(poseId)
        ? current.favoritePoseIds.filter((id) => id !== poseId)
        : [poseId, ...current.favoritePoseIds],
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
        item.id === pathId ? sanitizePath({ ...item, poses: renumberPoses(nextPoses) }) : item,
      ),
      selection: nextSelection,
      favoritePoseIds: current.favoritePoseIds.filter((id) => id !== poseId),
    }));
  }
  function addAction(pathId: string, type: PathAction["type"]) {
    const path = state.paths.find((item) => item.id === pathId);
    const built = builtPaths.find((item) => item.path.id === pathId);
    if (!path) return;

    const id = `action-${crypto.randomUUID()}`;
    const nextAction: PathAction = {
      id,
      type,
      ...(type === "distanceCallback"
        ? { distanceIn: Math.round((built?.segment?.getLengthIn() ?? 100) / 2) }
        : { angleDeg: 90 }),
      label: "callback",
    } as PathAction;

    patchPath(pathId, { actions: [...path.actions, nextAction] });
  }

  function patchTurn(turnId: string, patch: Partial<EditorTurn>) {
    const apply = Object.keys(patch).every((key) => key === "name") ? updateLive : commit;
    apply((current) => ({
      ...current,
      turns: current.turns.map((turn) => (turn.id === turnId ? { ...turn, ...patch } : turn)),
    }));
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
  function handleTurnDrag(turnId: string, event: KonvaEventObject<DragEvent>) {
    const point = fromCanvas(clampCanvasPoint(event.target.x(), event.target.y(), canvasSize), scale);
    updateLive((current) => ({ ...current, turns: patchTurnPoint(current.turns, turnId, point) }));
  }

  function handleTurnDragEnd(turnId: string, event: KonvaEventObject<DragEvent>) {
    handleTurnDrag(turnId, event);
    setHistory((current) => ({
      ...current,
      present: snapTurnIfCloseInState(current.present, turnId),
    }));
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
    } else if (selection.type === "turn") {
      deleteTurn(selection.turnId);
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
      const present = snapEndpointIfCloseInState(current.present, pathId, poseId);
      return {
        ...current,
        present,
      };
    });
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

  return {
    containerRef,
    state,
    selectedPoseId,
    selectedActionId,
    selectedTurnId,
    history,
    arcShortcutHintVisible,
    pendingHeadingPoseId,
    favoritePoses,
    builtPaths,
    canvasSize,
    scale,
    undo,
    redo,
    addPath,
    addTurn,
    useFavoritePose,
    toggleFavoritePose,
    deletePath,
    deleteTurn,
    movePath,
    selectPath,
    selectPose,
    selectTurn,
    selectAction,
    patchPath,
    patchTurn,
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
    handleTurnDrag,
    handleTurnDragEnd,
    handleHeadingDrag,
    handleHeadingDragEnd,
    showArcShortcutHint,
    deletePose,
    commit,
    beginPathDrag,
  };
}
