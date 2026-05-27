"use client";

import { useEffect, useRef, useState } from "react";
import {
  Circle,
  Group,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
} from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { editorColors } from "@/lib/editor/colors";
import {
  BSpline,
  InterpolationStyle,
  PathSegment,
  Vector2d,
  type Translation2d,
} from "@/lib/geometry";

type PoseKind = "pose" | "arc";
type GhostRole = "before" | "after";

type EditorPose = Translation2d & {
  id: string;
  name: string;
  headingDeg: number | null;
  kind: PoseKind;
  radius: number;
};

type PathAction =
  | { id: string; type: "callback"; distanceIn: number; label: string }
  | { id: string; type: "turn"; headingDeg: number }
  | { id: string; type: "hold"; durationSeconds: number };

type EditorPath = {
  id: string;
  name: string;
  poses: EditorPose[];
  interpolation: InterpolationStyle;
  tangentOffsetDeg: number;
  customFunctionSource: string;
  actions: PathAction[];
  collapsed: boolean;
};

type EditorState = {
  paths: EditorPath[];
  activePathId: string;
  selectedPoseId: string;
  showPoseLabels: boolean;
};

type HistoryState = {
  past: EditorState[];
  present: EditorState;
  future: EditorState[];
};

type ProcessedControlPoint = Translation2d & {
  id: string;
  sourcePoseId: string;
  ghost: boolean;
  ghostRole?: GhostRole;
};

type BuiltPath = {
  path: EditorPath;
  controls: ProcessedControlPoint[];
  spline: BSpline | null;
  segment: PathSegment | null;
  curve: Vector2d[];
};

const FIELD_SIZE_IN = 144;
const FIELD_EDGE_MARGIN_IN = 2;
const MIN_ARC_RADIUS_IN = 2;
const MIN_ARC_CLEARANCE_IN = 3;
const POSE_RADIUS = 5;
const GHOST_RADIUS = 4;
const CALLBACK_RADIUS = 10;

const INTERPOLATION_OPTIONS = [
  InterpolationStyle.CONSTANT_START_HEADING,
  InterpolationStyle.CONSTANT_END_HEADING,
  InterpolationStyle.TANGENT_OPTIMAL,
  InterpolationStyle.TANGENT_FORWARD,
  InterpolationStyle.TANGENT_CUSTOM,
  InterpolationStyle.SMOOTH_START_TO_END,
  InterpolationStyle.CUSTOM_DIST_FUNCTION,
] as const;

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

export default function PathEditorClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState(0);
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: INITIAL_STATE,
    future: [],
  });
  const [editingPathId, setEditingPathId] = useState<string | null>(null);
  const [dragStartedSnappedEndpoint, setDragStartedSnappedEndpoint] = useState(false);
  const dragStartStateRef = useRef<EditorState | null>(null);

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
  const activePose =
    activePath.poses.find((pose) => pose.id === state.selectedPoseId) ?? activePath.poses[0];
  const builtPaths = state.paths.map(buildPath);
  const scale = canvasSize / FIELD_SIZE_IN;

  function commit(mutator: (current: EditorState) => EditorState) {
    setHistory((current) => {
      const next = mutator(current.present);
      return {
        past: [...current.past, current.present].slice(-80),
        present: next,
        future: [],
      };
    });
  }

  function updateLive(mutator: (current: EditorState) => EditorState) {
    setHistory((current) => ({
      ...current,
      present: mutator(current.present),
    }));
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

  function undo() {
    setHistory((current) => {
      const previous = current.past[current.past.length - 1];
      if (!previous) return current;

      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      };
    });
  }

  function redo() {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) return current;

      return {
        past: [...current.past, current.present],
        present: next,
        future: current.future.slice(1),
      };
    });
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
      selectedPoseId:
        current.selectedPoseId === poseId ? nextPoses[0].id : current.selectedPoseId,
    }));
  }

  function addAction(pathId: string, type: PathAction["type"]) {
    const path = state.paths.find((item) => item.id === pathId);
    const built = builtPaths.find((item) => item.path.id === pathId);
    if (!path) return;

    const id = `action-${crypto.randomUUID()}`;
    const nextAction: PathAction =
      type === "callback"
        ? {
            id,
            type,
            distanceIn: Math.round((built?.segment?.getLengthIn() ?? 100) / 2),
            label: "callback",
          }
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
    const path = state.paths.find((item) => item.id === pathId);
    if (!path) return;

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
    if (!dragStartedSnappedEndpoint) {
      snapEndpointIfClose(pathId, poseId);
    }
    endDrag();
  }

  function handleGhostDrag(
    pathId: string,
    arcPoseId: string,
    event: KonvaEventObject<DragEvent>,
  ) {
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

      for (const otherPath of current.present.paths) {
        if (otherPath.id === pathId) continue;

        const otherEndpoint =
          poseIndex === 0
            ? otherPath.poses[otherPath.poses.length - 1]
            : otherPath.poses[0];
        const distance = Math.hypot(pose.x - otherEndpoint.x, pose.y - otherEndpoint.y);

        if (distance <= 2) {
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

  return (
    <>
      <aside className="w-64 shrink-0 overflow-hidden border-r border-[#242832] bg-[#13151a]">
        <PosePanel
          paths={state.paths}
          activePathId={state.activePathId}
          selectedPoseId={state.selectedPoseId}
          showPoseLabels={state.showPoseLabels}
          onToggleLabels={() =>
            commit((current) => ({ ...current, showPoseLabels: !current.showPoseLabels }))
          }
          onSelectPose={selectPose}
          onRename={(pathId, poseId, name) => patchPose(pathId, poseId, { name })}
          onPatchPose={(pathId, poseId, patch) => patchPose(pathId, poseId, patch)}
        />
      </aside>

      <section className="flex min-h-0 flex-1 items-center justify-start overflow-hidden bg-[#0d0f12] py-2 pl-2 pr-3">
        <div className="field-frame">
          <div
            aria-label="Robot field"
            className="field-surface h-full w-full overflow-hidden border border-[#303541] bg-[#181a20] shadow-2xl"
          >
            <div ref={containerRef} className="field-overlay">
              {canvasSize > 0 ? (
                <Stage width={canvasSize} height={canvasSize}>
                  <Layer>
                    <Rect
                      width={canvasSize}
                      height={canvasSize}
                      fill="rgba(0,0,0,0)"
                      onDblClick={handleFieldDoubleClick}
                    />
                    {builtPaths.map((built) => (
                      <PathCanvasLayer
                        key={built.path.id}
                        built={built}
                        active={built.path.id === state.activePathId}
                        selectedPoseId={state.selectedPoseId}
                        showPoseLabels={state.showPoseLabels}
                        scale={scale}
                        onSelectPath={() =>
                          commit((current) => ({
                            ...current,
                            activePathId: built.path.id,
                            selectedPoseId: built.path.poses[0].id,
                          }))
                        }
                        onSelectPose={(poseId) => selectPose(built.path.id, poseId)}
                        onBeginDrag={beginDrag}
                        onPoseDrag={handlePoseDrag}
                        onPoseDragEnd={handlePoseDragEnd}
                        onPoseDelete={deletePose}
                        onGhostDrag={handleGhostDrag}
                        onGhostDragEnd={handleGhostDragEnd}
                        onCallbackDrag={handleCallbackDrag}
                        onCallbackDragEnd={handleCallbackDragEnd}
                      />
                    ))}
                  </Layer>
                </Stage>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <aside className="w-[765px] shrink-0 overflow-hidden border-l border-[#242832] bg-[#13151a]">
        <PathPanel
          paths={state.paths}
          builtPaths={builtPaths}
          activePathId={state.activePathId}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          editingPathId={editingPathId}
          onUndo={undo}
          onRedo={redo}
          onAddPath={addPath}
          onDeletePath={deletePath}
          onMovePath={movePath}
          onActivatePath={(pathId) => {
            const path = state.paths.find((item) => item.id === pathId);
            if (!path) return;
            commit((current) => ({
              ...current,
              activePathId: pathId,
              selectedPoseId: path.poses[0].id,
            }));
          }}
          onPatchPath={patchPath}
          onStartRename={setEditingPathId}
          onStopRename={() => setEditingPathId(null)}
          onAddAction={addAction}
          onPatchAction={patchAction}
          onRemoveAction={removeAction}
        />
      </aside>
    </>
  );
}

function PathCanvasLayer({
  built,
  active,
  selectedPoseId,
  showPoseLabels,
  scale,
  onSelectPath,
  onSelectPose,
  onBeginDrag,
  onPoseDrag,
  onPoseDragEnd,
  onPoseDelete,
  onGhostDrag,
  onGhostDragEnd,
  onCallbackDrag,
  onCallbackDragEnd,
}: {
  built: BuiltPath;
  active: boolean;
  selectedPoseId: string;
  showPoseLabels: boolean;
  scale: number;
  onSelectPath: () => void;
  onSelectPose: (poseId: string) => void;
  onBeginDrag: (pathId?: string, poseId?: string) => void;
  onPoseDrag: (pathId: string, poseId: string, event: KonvaEventObject<DragEvent>) => void;
  onPoseDragEnd: (pathId: string, poseId: string, event: KonvaEventObject<DragEvent>) => void;
  onPoseDelete: (pathId: string, poseId: string) => void;
  onGhostDrag: (pathId: string, arcPoseId: string, event: KonvaEventObject<DragEvent>) => void;
  onGhostDragEnd: (pathId: string, arcPoseId: string, event: KonvaEventObject<DragEvent>) => void;
  onCallbackDrag: (pathId: string, actionId: string, event: KonvaEventObject<DragEvent>) => void;
  onCallbackDragEnd: (pathId: string, actionId: string, event: KonvaEventObject<DragEvent>) => void;
}) {
  return (
    <Group opacity={active ? 1 : 0.35} onClick={onSelectPath}>
      <Line
        points={built.controls.flatMap(toCanvasPoint(scale))}
        stroke={editorColors.ghostFill}
        strokeWidth={1}
        dash={[5, 7]}
        opacity={0.55}
      />
      {built.spline ? (
        <Line
          points={built.curve.flatMap(toCanvasPoint(scale))}
          stroke={active ? editorColors.canvasPath : editorColors.canvasPathInactive}
          strokeWidth={active ? 3 : 2}
          lineCap="round"
          lineJoin="round"
          shadowColor={editorColors.canvasPath}
          shadowBlur={active ? 8 : 0}
          shadowOpacity={0.45}
        />
      ) : null}

      {built.path.poses.map((pose, index) =>
        pose.kind === "arc" && !isEndpoint(index, built.path.poses.length) ? (
          <ArcRadiusCircle key={`${pose.id}-radius`} pose={pose} scale={scale} />
        ) : null,
      )}

      {built.controls
        .filter((point) => point.ghost)
        .map((point) => {
          const canvasPoint = toCanvas(point, scale);
          return (
            <Circle
              key={point.id}
              x={canvasPoint.x}
              y={canvasPoint.y}
              radius={GHOST_RADIUS}
              fill={editorColors.ghostFill}
              stroke={editorColors.ghostStroke}
              strokeWidth={1}
              opacity={0.45}
              draggable={active}
              onDragStart={() => onBeginDrag(built.path.id, point.sourcePoseId)}
              onDragMove={(event) => onGhostDrag(built.path.id, point.sourcePoseId, event)}
              onDragEnd={(event) => onGhostDragEnd(built.path.id, point.sourcePoseId, event)}
            />
          );
        })}

      {built.path.actions.map((action) =>
        action.type === "callback" && built.segment ? (
          <CallbackMarker
            key={action.id}
            action={action}
            segment={built.segment}
            scale={scale}
            onDragStart={() => onBeginDrag(built.path.id)}
            onDrag={(event) => onCallbackDrag(built.path.id, action.id, event)}
            onDragEnd={(event) => onCallbackDragEnd(built.path.id, action.id, event)}
          />
        ) : null,
      )}

      {built.path.poses.map((pose) => {
        const canvasPoint = toCanvas(pose, scale);
        const selected = active && pose.id === selectedPoseId;

        return (
          <Group
            key={pose.id}
            x={canvasPoint.x}
            y={canvasPoint.y}
            draggable={active}
            dragBoundFunc={(position) => clampCanvasPosePosition(position, scale)}
            onClick={(event) => {
              event.cancelBubble = true;
              onSelectPose(pose.id);
            }}
            onTap={() => onSelectPose(pose.id)}
            onDblClick={(event) => {
              event.cancelBubble = true;
              onPoseDelete(built.path.id, pose.id);
            }}
            onDblTap={(event) => {
              event.cancelBubble = true;
              onPoseDelete(built.path.id, pose.id);
            }}
            onDragStart={() => onBeginDrag(built.path.id, pose.id)}
            onDragMove={(event) => onPoseDrag(built.path.id, pose.id, event)}
            onDragEnd={(event) => onPoseDragEnd(built.path.id, pose.id, event)}
          >
            <Circle
              radius={POSE_RADIUS}
              fill={pose.kind === "arc" ? editorColors.arcPoseFill : editorColors.poseFill}
              stroke={
                selected
                  ? editorColors.selected
                  : pose.kind === "arc"
                    ? editorColors.ghostStroke
                    : editorColors.canvasPath
              }
              strokeWidth={selected ? 3 : 2}
            />
            {showPoseLabels ? (
              <Text
                x={8}
                y={-19}
                text={pose.name}
                fontSize={11}
                fontStyle="bold"
                fill={pose.kind === "arc" ? editorColors.ghostStroke : editorColors.poseFill}
              />
            ) : null}
          </Group>
        );
      })}
    </Group>
  );
}

function PosePanel({
  paths,
  activePathId,
  selectedPoseId,
  showPoseLabels,
  onToggleLabels,
  onSelectPose,
  onRename,
  onPatchPose,
}: {
  paths: EditorPath[];
  activePathId: string;
  selectedPoseId: string;
  showPoseLabels: boolean;
  onToggleLabels: () => void;
  onSelectPose: (pathId: string, poseId: string) => void;
  onRename: (pathId: string, poseId: string, name: string) => void;
  onPatchPose: (pathId: string, poseId: string, patch: Partial<EditorPose>) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[#242832] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Poses</h2>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={showPoseLabels} onChange={onToggleLabels} />
            Labels
          </label>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          {paths.map((path) => (
            <section key={path.id} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase text-slate-500">{path.name}</h3>
              {path.poses.map((pose, index) => {
                const selected = path.id === activePathId && pose.id === selectedPoseId;
                const canBeArc = !isEndpoint(index, path.poses.length);

                return (
                  <button
                    key={pose.id}
                    type="button"
                    className={`rounded border p-2 text-left ${
                      selected
                        ? "border-orange-400 bg-[#181a20]"
                        : "border-[#242832] bg-[#101217]"
                    }`}
                    onClick={() => onSelectPose(path.id, pose.id)}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <input
                        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-100 outline-none"
                        value={pose.name}
                        onChange={(event) => onRename(path.id, pose.id, event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                      />
                      <span>{pose.x.toFixed(1)}, {pose.y.toFixed(1)}</span>
                    </div>
                    {canBeArc ? (
                      <label
                        className="mt-2 flex items-center gap-2 text-xs text-slate-300"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={pose.kind === "arc"}
                          onChange={(event) =>
                            onPatchPose(path.id, pose.id, {
                              kind: event.target.checked ? "arc" : "pose",
                            })
                          }
                        />
                        Arc pose
                      </label>
                    ) : null}
                    <details
                      className="mt-2"
                      open={selected}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <summary className="cursor-pointer text-xs text-slate-500">Parameters</summary>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <NumberInput
                          label="X"
                          value={pose.x}
                          onChange={(x) => onPatchPose(path.id, pose.id, { x })}
                        />
                        <NumberInput
                          label="Y"
                          value={pose.y}
                          onChange={(y) => onPatchPose(path.id, pose.id, { y })}
                        />
                        {isEndpoint(index, path.poses.length) ? (
                          <NumberInput
                            label="Heading"
                            value={pose.headingDeg ?? 0}
                            onChange={(headingDeg) =>
                              onPatchPose(path.id, pose.id, { headingDeg })
                            }
                          />
                        ) : null}
                        <NumberInput
                          label="Radius"
                          value={pose.radius}
                          disabled={pose.kind !== "arc"}
                          onChange={(radius) =>
                            onPatchPose(path.id, pose.id, {
                              radius: Math.max(MIN_ARC_RADIUS_IN, radius),
                            })
                          }
                        />
                      </div>
                    </details>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function PathPanel({
  paths,
  builtPaths,
  activePathId,
  canUndo,
  canRedo,
  editingPathId,
  onUndo,
  onRedo,
  onAddPath,
  onDeletePath,
  onMovePath,
  onActivatePath,
  onPatchPath,
  onStartRename,
  onStopRename,
  onAddAction,
  onPatchAction,
  onRemoveAction,
}: {
  paths: EditorPath[];
  builtPaths: BuiltPath[];
  activePathId: string;
  canUndo: boolean;
  canRedo: boolean;
  editingPathId: string | null;
  onUndo: () => void;
  onRedo: () => void;
  onAddPath: () => void;
  onDeletePath: (pathId: string) => void;
  onMovePath: (pathId: string, direction: -1 | 1) => void;
  onActivatePath: (pathId: string) => void;
  onPatchPath: (pathId: string, patch: Partial<EditorPath>) => void;
  onStartRename: (pathId: string) => void;
  onStopRename: () => void;
  onAddAction: (pathId: string, type: PathAction["type"]) => void;
  onPatchAction: (pathId: string, actionId: string, patch: Partial<PathAction>) => void;
  onRemoveAction: (pathId: string, actionId: string) => void;
}) {
  const apiPreview = buildAllApiPreview(paths, builtPaths);
  const [copied, setCopied] = useState(false);

  async function copyApiPreview() {
    await navigator.clipboard.writeText(apiPreview);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-[#242832] p-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Paths</h2>
          <p className="text-xs text-slate-500">Undo, build, and export path chains</p>
        </div>
        <div className="flex items-center gap-2">
          <IconButton label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
            <path d="M9 7H4v5" />
            <path d="M4 12c2-5 11-6 15 0 1.4 2.2 1.3 4.6-.2 6.6" />
          </IconButton>
          <IconButton label="Redo (Ctrl+Y)" disabled={!canRedo} onClick={onRedo}>
            <path d="M15 7h5v5" />
            <path d="M20 12c-2-5-11-6-15 0-1.4 2.2-1.3 4.6.2 6.6" />
          </IconButton>
          <button
            type="button"
            className="rounded border border-[#303541] bg-[#181a20] px-3 py-1.5 text-xs text-slate-200"
            onClick={onAddPath}
          >
            Add path
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
        <div className="min-h-[240px] overflow-y-auto pr-1">
          <div className="flex flex-col gap-3">
            {paths.map((path, index) => {
              const built = builtPaths.find((item) => item.path.id === path.id);
              return (
                <PathCard
                  key={path.id}
                  path={path}
                  built={built}
                  active={path.id === activePathId}
                  canDelete={paths.length > 1}
                  canMoveUp={index > 0}
                  canMoveDown={index < paths.length - 1}
                  editing={editingPathId === path.id}
                  onActivate={() => onActivatePath(path.id)}
                  onPatch={(patch) => onPatchPath(path.id, patch)}
                  onDelete={() => onDeletePath(path.id)}
                  onMoveUp={() => onMovePath(path.id, -1)}
                  onMoveDown={() => onMovePath(path.id, 1)}
                  onStartRename={() => onStartRename(path.id)}
                  onStopRename={onStopRename}
                  onAddAction={(type) => onAddAction(path.id, type)}
                  onPatchAction={(actionId, patch) => onPatchAction(path.id, actionId, patch)}
                  onRemoveAction={(actionId) => onRemoveAction(path.id, actionId)}
                />
              );
            })}
          </div>
        </div>

        <section className="flex min-h-[260px] flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase text-slate-500">Generated API</h3>
            <IconButton label={copied ? "Copied" : "Copy API"} onClick={copyApiPreview}>
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </IconButton>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto rounded border border-[#242832] bg-[#0d0f12] p-3 text-xs leading-5 text-slate-300">
            <code>{apiPreview}</code>
          </pre>
        </section>
      </div>
    </div>
  );
}

function PathCard({
  path,
  built,
  active,
  canDelete,
  canMoveUp,
  canMoveDown,
  editing,
  onActivate,
  onPatch,
  onDelete,
  onMoveUp,
  onMoveDown,
  onStartRename,
  onStopRename,
  onAddAction,
  onPatchAction,
  onRemoveAction,
}: {
  path: EditorPath;
  built?: BuiltPath;
  active: boolean;
  canDelete: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  editing: boolean;
  onActivate: () => void;
  onPatch: (patch: Partial<EditorPath>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onStartRename: () => void;
  onStopRename: () => void;
  onAddAction: (type: PathAction["type"]) => void;
  onPatchAction: (actionId: string, patch: Partial<PathAction>) => void;
  onRemoveAction: (actionId: string) => void;
}) {
  return (
    <section
      className={`rounded border ${active ? "border-orange-400" : "border-[#242832]"} bg-[#101217]`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
        onClick={onActivate}
      >
        {editing ? (
          <input
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-100 outline-none"
            value={path.name}
            autoFocus
            onBlur={onStopRename}
            onChange={(event) => onPatch({ name: event.target.value })}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">
            {path.name}
          </span>
        )}
        <IconButton label="Rename" onClick={onStartRename}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </IconButton>
        <IconButton label="Move up" disabled={!canMoveUp} onClick={onMoveUp}>
          <path d="m18 15-6-6-6 6" />
        </IconButton>
        <IconButton label="Move down" disabled={!canMoveDown} onClick={onMoveDown}>
          <path d="m6 9 6 6 6-6" />
        </IconButton>
        <button
          type="button"
          className="text-xs text-slate-400"
          onClick={(event) => {
            event.stopPropagation();
            onPatch({ collapsed: !path.collapsed });
          }}
        >
          {path.collapsed ? "Expand" : "Collapse"}
        </button>
        <button
          type="button"
          className="text-xs text-red-300 disabled:opacity-30"
          disabled={!canDelete}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          Delete
        </button>
      </button>

      {!path.collapsed ? (
        <div className="flex flex-col gap-4 border-t border-[#242832] p-3">
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Interpolator
            <select
              className="rounded border border-[#303541] bg-[#13151a] px-2 py-2 text-sm text-slate-100 outline-none"
              value={path.interpolation}
              onChange={(event) =>
                onPatch({ interpolation: event.target.value as InterpolationStyle })
              }
            >
              {INTERPOLATION_OPTIONS.map((style) => (
                <option key={style} value={style}>
                  {formatStyle(style)}
                </option>
              ))}
            </select>
          </label>

          {path.interpolation === InterpolationStyle.TANGENT_CUSTOM ? (
            <NumberInput
              label="Tangent offset deg"
              value={path.tangentOffsetDeg}
              onChange={(tangentOffsetDeg) => onPatch({ tangentOffsetDeg })}
            />
          ) : null}

          {path.interpolation === InterpolationStyle.CUSTOM_DIST_FUNCTION ? (
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Distance function preview
              <textarea
                className="min-h-20 rounded border border-[#303541] bg-[#13151a] px-2 py-2 text-xs leading-5 text-slate-100 outline-none"
                value={path.customFunctionSource}
                onChange={(event) => onPatch({ customFunctionSource: event.target.value })}
              />
            </label>
          ) : null}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-slate-500">Actions</h3>
              <div className="flex gap-1">
                <ActionButton label="Callback" onClick={() => onAddAction("callback")} />
                <ActionButton label="Turn" onClick={() => onAddAction("turn")} />
                <ActionButton label="Hold" onClick={() => onAddAction("hold")} />
              </div>
            </div>
            {path.actions.map((action) => (
              <ActionEditor
                key={action.id}
                action={action}
                lengthIn={built?.segment?.getLengthIn() ?? 0}
                onChange={(patch) => onPatchAction(action.id, patch)}
                onRemove={() => onRemoveAction(action.id)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function NumberInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      <input
        className="rounded border border-[#303541] bg-[#101217] px-2 py-1.5 text-sm text-slate-100 outline-none disabled:opacity-35"
        type="number"
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded border border-[#303541] bg-[#181a20] px-2 py-1 text-[11px] text-slate-200"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function IconButton({
  label,
  disabled,
  children,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className="grid h-7 w-7 place-items-center rounded border border-[#303541] bg-[#181a20] text-slate-300 disabled:opacity-35"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        {children}
      </svg>
    </button>
  );
}

function ActionEditor({
  action,
  lengthIn,
  onChange,
  onRemove,
}: {
  action: PathAction;
  lengthIn: number;
  onChange: (patch: Partial<PathAction>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded border border-[#242832] bg-[#13151a] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-slate-500">{action.type}</span>
        <button type="button" className="text-xs text-slate-400" onClick={onRemove}>
          Remove
        </button>
      </div>
      {action.type === "callback" ? (
        <div className="grid grid-cols-[1fr_82px] gap-2">
          <input
            className="rounded border border-[#303541] bg-[#101217] px-2 py-1.5 text-sm text-slate-100 outline-none"
            value={action.label}
            onChange={(event) => onChange({ label: event.target.value })}
          />
          <input
            className="rounded border border-[#303541] bg-[#101217] px-2 py-1.5 text-sm text-slate-100 outline-none"
            type="number"
            min={0}
            max={Math.max(0, lengthIn)}
            step={1}
            value={action.distanceIn}
            onChange={(event) =>
              onChange({ distanceIn: Math.max(0, Math.min(lengthIn, Number(event.target.value))) })
            }
          />
        </div>
      ) : action.type === "turn" ? (
        <NumberInput
          label="Target heading"
          value={action.headingDeg}
          onChange={(headingDeg) => onChange({ headingDeg })}
        />
      ) : (
        <NumberInput
          label="Duration"
          value={action.durationSeconds}
          onChange={(durationSeconds) => onChange({ durationSeconds })}
        />
      )}
    </div>
  );
}

function ArcRadiusCircle({ pose, scale }: { pose: EditorPose; scale: number }) {
  const center = toCanvas(pose, scale);
  const radius = Math.max(MIN_ARC_RADIUS_IN, pose.radius) * scale;

  return (
    <Circle
      x={center.x}
      y={center.y}
      radius={radius}
      stroke={editorColors.ghostFill}
      strokeWidth={1.5}
      dash={[5, 7]}
      opacity={0.58}
    />
  );
}

function CallbackMarker({
  action,
  segment,
  scale,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  action: Extract<PathAction, { type: "callback" }>;
  segment: PathSegment;
  scale: number;
  onDragStart: () => void;
  onDrag: (event: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (event: KonvaEventObject<DragEvent>) => void;
}) {
  const point = pointAtDistance(segment, action.distanceIn);
  const canvasPoint = toCanvas(point, scale);

  return (
    <Group
      x={canvasPoint.x}
      y={canvasPoint.y}
      draggable
      onDragStart={onDragStart}
      onDragMove={onDrag}
      onDragEnd={onDragEnd}
    >
      <Circle
        radius={CALLBACK_RADIUS}
        fill={editorColors.callback}
        stroke={editorColors.callbackStroke}
        strokeWidth={1.5}
      />
    </Group>
  );
}

function buildPath(path: EditorPath): BuiltPath {
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

function buildProcessedControls(poses: EditorPose[]): ProcessedControlPoint[] {
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

function expandArcPose(
  prevPose: EditorPose,
  arcPose: EditorPose,
  nextPose: EditorPose,
): [Translation2d, Translation2d] {
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

function constrainPointNearArcs(
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

function pointAtDistance(segment: PathSegment, distanceIn: number): Vector2d {
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
      return current.getLocation().add(next.getLocation().subtract(current.getLocation()).multiply(alpha));
    }
  }

  return segment.getPosition(distanceIn <= 0 ? 0 : 0.999999);
}

function sampleSplinePoints(spline: BSpline, sampleCount: number): Vector2d[] {
  const points: Vector2d[] = [];
  for (let i = 0; i < sampleCount; i++) {
    points.push(spline.getPosition(i / (sampleCount - 1)));
  }
  return points;
}

function makePose(name: string, x: number, y: number, headingDeg: number | null): EditorPose {
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

function renumberPoses(poses: EditorPose[]): EditorPose[] {
  return poses.map((pose, index) => ({
    ...pose,
    name: /^pose\d+$/i.test(pose.name) ? `pose${index + 1}` : pose.name,
  }));
}

function sanitizePosePatch(
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

function endpointIsSnapped(state: EditorState, pathId: string, poseId: string): boolean {
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

function toCanvasPoint(scale: number): (point: Translation2d) => number[] {
  return (point) => {
    const canvasPoint = toCanvas(point, scale);
    return [canvasPoint.x, canvasPoint.y];
  };
}

function toCanvas(point: Translation2d, scale: number): Translation2d {
  return {
    x: point.x * scale,
    y: (FIELD_SIZE_IN - point.y) * scale,
  };
}

function fromCanvas(point: Translation2d, scale: number): Translation2d {
  return {
    x: point.x / scale,
    y: FIELD_SIZE_IN - point.y / scale,
  };
}

function clampCanvasPoint(x: number, y: number, canvasSize: number): Translation2d {
  return {
    x: Math.max(0, Math.min(canvasSize, x)),
    y: Math.max(0, Math.min(canvasSize, y)),
  };
}

function clampCanvasPosePosition(point: Translation2d, scale: number): Translation2d {
  return toCanvas(
    {
      x: clampField(point.x / scale),
      y: clampField(FIELD_SIZE_IN - point.y / scale),
    },
    scale,
  );
}

function clampField(value: number): number {
  return Math.max(FIELD_EDGE_MARGIN_IN, Math.min(FIELD_SIZE_IN - FIELD_EDGE_MARGIN_IN, value));
}

function isEndpoint(index: number, length: number): boolean {
  return index === 0 || index === length - 1;
}

function snap(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatStyle(style: InterpolationStyle): string {
  return style
    .split("_")
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join(" ");
}

function buildAllApiPreview(paths: EditorPath[], builtPaths: BuiltPath[]): string {
  const usedNames = new Set<string>();
  return paths
    .map((path, index) => {
      const built = builtPaths.find((item) => item.path.id === path.id);
      const variable = uniqueName(toCamelIdentifier(path.name) || `path${index + 1}`, usedNames);
      return buildApiPreview(path, built?.segment?.getLengthIn() ?? 0, variable);
    })
    .join("\n\n");
}

function buildApiPreview(path: EditorPath, lengthIn: number, variableName: string): string {
  const [startPose, ...controlPoses] = path.poses;
  const lines = [`Path ${variableName} = new PathBuilder(${formatStartPose(startPose)})`];

  lines.push("  .addControlPoints(");
  controlPoses.forEach((pose, index) => {
    const suffix = index === controlPoses.length - 1 ? "" : ",";
    const isEndPose = index === controlPoses.length - 1;
    lines.push(`    ${formatControlPose(pose, isEndPose)}${suffix}`);
  });
  lines.push("  )");

  if (
    path.interpolation === InterpolationStyle.TANGENT_OPTIMAL ||
    path.interpolation === InterpolationStyle.TANGENT_FORWARD
  ) {
    lines.push(
      `  .interpolateWith(new HeadingInterpolator(InterpolationStyle.${path.interpolation}))`,
    );
  } else if (path.interpolation === InterpolationStyle.CONSTANT_START_HEADING) {
    lines.push(
      "  .interpolateWith(new HeadingInterpolator(InterpolationStyle.CONSTANT_START_HEADING))",
    );
  } else if (path.interpolation === InterpolationStyle.CONSTANT_END_HEADING) {
    lines.push(
      "  .interpolateWith(new HeadingInterpolator(InterpolationStyle.CONSTANT_END_HEADING))",
    );
  } else if (path.interpolation === InterpolationStyle.TANGENT_CUSTOM) {
    lines.push(
      `  .interpolateWith(new HeadingInterpolator(InterpolationStyle.TANGENT_CUSTOM, Angle.fromDeg(${formatNumber(path.tangentOffsetDeg)})))`,
    );
  } else if (path.interpolation === InterpolationStyle.CUSTOM_DIST_FUNCTION) {
    lines.push(`  .interpolateWith(${path.customFunctionSource})`);
  }

  path.actions.forEach((action) => {
    if (action.type === "callback") {
      const s = lengthIn <= 1e-9 ? 0 : action.distanceIn / lengthIn;
      lines.push(`  .addCallback(${s.toFixed(3)}, this::${safeMethodName(action.label)})`);
    } else if (action.type === "turn") {
      lines.push(`  .turnTo(Angle.fromDeg(${formatNumber(action.headingDeg)}))`);
    } else {
      lines.push(`  .holdPose(${formatNumber(action.durationSeconds)})`);
    }
  });

  lines.push("  .build();");
  return lines.join("\n");
}

function formatStartPose(pose: EditorPose): string {
  const heading = pose.headingDeg ?? 0;
  return `pose.build(${formatNumber(pose.x)}, ${formatNumber(pose.y)}, ${formatNumber(heading)})`;
}

function formatControlPose(pose: EditorPose, includeHeading: boolean): string {
  if (pose.kind === "arc") {
    return `pose.arcPoseAt(${formatNumber(pose.x)}, ${formatNumber(pose.y)}, ${formatNumber(pose.radius)})`;
  }

  if (!includeHeading || pose.headingDeg === null) {
    return `pose.at(${formatNumber(pose.x)}, ${formatNumber(pose.y)})`;
  }

  return `pose.at(${formatNumber(pose.x)}, ${formatNumber(pose.y)}, ${formatNumber(pose.headingDeg)})`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function toCamelIdentifier(value: string): string {
  const words = value.match(/[a-zA-Z0-9]+/g) ?? [];
  return words
    .map((word, index) => {
      const cleaned = word.toLowerCase();
      return index === 0 ? cleaned : cleaned[0].toUpperCase() + cleaned.slice(1);
    })
    .join("")
    .replace(/^[0-9]+/, "");
}

function uniqueName(base: string, usedNames: Set<string>): string {
  let name = base;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${base}${suffix}`;
    suffix++;
  }
  usedNames.add(name);
  return name;
}

function safeMethodName(label: string): string {
  const stripped = label.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  if (!stripped) return "pathCallback";

  const [first, ...rest] = stripped.split(/\s+/);
  return [
    first[0].toLowerCase() + first.slice(1),
    ...rest.map((part) => part[0].toUpperCase() + part.slice(1)),
  ].join("");
}
