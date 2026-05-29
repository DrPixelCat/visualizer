"use client";

import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { editorColors } from "@/lib/editor/colors";
import {
  CALLBACK_RADIUS,
  GHOST_RADIUS,
  MIN_ARC_RADIUS_IN,
  POSE_RADIUS,
} from "@/lib/editor/path-editor-constants";
import {
  clampCanvasPosePosition,
  isEndpoint,
  pointAtDistance,
  toCanvas,
  toCanvasPoint,
} from "@/lib/editor/path-editor-geometry";
import type { BuiltPath, EditorPose, EditorTurn, PathAction } from "@/lib/editor/path-editor-types";
import type { PathSegment } from "@/lib/geometry";

// Konva-only rendering stays isolated behind PathEditor's ssr:false boundary.
type CanvasDragHandler = (
  pathId: string,
  poseId: string,
  event: KonvaEventObject<DragEvent>,
) => void;

type CallbackDragHandler = (
  pathId: string,
  actionId: string,
  event: KonvaEventObject<DragEvent>,
) => void;

type TurnDragHandler = (turnId: string, event: KonvaEventObject<DragEvent>) => void;

export function PathEditorCanvas({
  builtPaths,
  turns,
  activePathId,
  selectedPoseId,
  selectedPathId,
  selectedActionId,
  selectedTurnId,
  pendingHeadingPoseId,
  showPoseLabels,
  canvasSize,
  scale,
  onFieldClick,
  onFieldDoubleClick,
  onSelectPose,
  onSelectAction,
  onSelectTurn,
  onBeginDrag,
  onBeginPathDrag,
  onPathDrag,
  onPathDragEnd,
  onPoseDrag,
  onPoseDragEnd,
  onGhostDrag,
  onGhostDragEnd,
  onCallbackDrag,
  onCallbackDragEnd,
  onCallbackDelete,
  onTurnDrag,
  onTurnDragEnd,
  onHeadingDrag,
  onHeadingDragEnd,
}: {
  builtPaths: BuiltPath[];
  turns: EditorTurn[];
  activePathId: string;
  selectedPoseId: string;
  selectedPathId: string;
  selectedActionId: string;
  selectedTurnId: string;
  pendingHeadingPoseId: string | null;
  showPoseLabels: boolean;
  canvasSize: number;
  scale: number;
  onFieldClick: (event: KonvaEventObject<MouseEvent>) => void;
  onFieldDoubleClick: (event: KonvaEventObject<MouseEvent>) => void;
  onSelectPose: (pathId: string, poseId: string) => void;
  onSelectAction: (pathId: string, actionId: string) => void;
  onSelectTurn: (turnId: string) => void;
  onBeginDrag: (pathId?: string, poseId?: string) => void;
  onBeginPathDrag: (pathId: string, event: KonvaEventObject<DragEvent>) => void;
  onPathDrag: (pathId: string, event: KonvaEventObject<DragEvent>) => void;
  onPathDragEnd: (pathId: string, event: KonvaEventObject<DragEvent>) => void;
  onPoseDrag: CanvasDragHandler;
  onPoseDragEnd: CanvasDragHandler;
  onGhostDrag: CanvasDragHandler;
  onGhostDragEnd: CanvasDragHandler;
  onCallbackDrag: CallbackDragHandler;
  onCallbackDragEnd: CallbackDragHandler;
  onCallbackDelete: (pathId: string, actionId: string) => void;
  onTurnDrag: TurnDragHandler;
  onTurnDragEnd: TurnDragHandler;
  onHeadingDrag: CanvasDragHandler;
  onHeadingDragEnd: CanvasDragHandler;
}) {
  if (canvasSize <= 0) return null;

  return (
    <Stage width={canvasSize} height={canvasSize} onClick={onFieldClick}>
      <Layer>
        <Rect
          width={canvasSize}
          height={canvasSize}
          fill={editorColors.transparent}
          onDblClick={onFieldDoubleClick}
        />
        {builtPaths.map((built) => (
          <PathCanvasLayer
            key={built.path.id}
            built={built}
            active={built.path.id === activePathId}
            selectedPath={built.path.id === selectedPathId}
            selectedPoseId={selectedPoseId}
            selectedActionId={selectedActionId}
            pendingHeadingPoseId={pendingHeadingPoseId}
            showPoseLabels={showPoseLabels}
            scale={scale}
            onSelectPose={(poseId) => onSelectPose(built.path.id, poseId)}
            onSelectAction={(actionId) => onSelectAction(built.path.id, actionId)}
            onBeginDrag={onBeginDrag}
            onBeginPathDrag={onBeginPathDrag}
            onPathDrag={onPathDrag}
            onPathDragEnd={onPathDragEnd}
            onPoseDrag={onPoseDrag}
            onPoseDragEnd={onPoseDragEnd}
            onGhostDrag={onGhostDrag}
            onGhostDragEnd={onGhostDragEnd}
            onCallbackDrag={onCallbackDrag}
            onCallbackDragEnd={onCallbackDragEnd}
            onCallbackDelete={onCallbackDelete}
            onHeadingDrag={onHeadingDrag}
            onHeadingDragEnd={onHeadingDragEnd}
          />
        ))}
        {turns.map((turn) => (
          <TurnNode
            key={turn.id}
            turn={turn}
            selected={turn.id === selectedTurnId}
            scale={scale}
            onSelect={() => onSelectTurn(turn.id)}
            onDragStart={() => onBeginDrag()}
            onDrag={(event) => onTurnDrag(turn.id, event)}
            onDragEnd={(event) => onTurnDragEnd(turn.id, event)}
          />
        ))}
      </Layer>
    </Stage>
  );
}

function PathCanvasLayer({
  built,
  active,
  selectedPath,
  selectedPoseId,
  selectedActionId,
  pendingHeadingPoseId,
  showPoseLabels,
  scale,
  onSelectPose,
  onSelectAction,
  onBeginDrag,
  onBeginPathDrag,
  onPathDrag,
  onPathDragEnd,
  onPoseDrag,
  onPoseDragEnd,
  onGhostDrag,
  onGhostDragEnd,
  onCallbackDrag,
  onCallbackDragEnd,
  onCallbackDelete,
  onHeadingDrag,
  onHeadingDragEnd,
}: {
  built: BuiltPath;
  active: boolean;
  selectedPath: boolean;
  selectedPoseId: string;
  selectedActionId: string;
  pendingHeadingPoseId: string | null;
  showPoseLabels: boolean;
  scale: number;
  onSelectPose: (poseId: string) => void;
  onSelectAction: (actionId: string) => void;
  onBeginDrag: (pathId?: string, poseId?: string) => void;
  onBeginPathDrag: (pathId: string, event: KonvaEventObject<DragEvent>) => void;
  onPathDrag: (pathId: string, event: KonvaEventObject<DragEvent>) => void;
  onPathDragEnd: (pathId: string, event: KonvaEventObject<DragEvent>) => void;
  onPoseDrag: CanvasDragHandler;
  onPoseDragEnd: CanvasDragHandler;
  onGhostDrag: CanvasDragHandler;
  onGhostDragEnd: CanvasDragHandler;
  onCallbackDrag: CallbackDragHandler;
  onCallbackDragEnd: CallbackDragHandler;
  onCallbackDelete: (pathId: string, actionId: string) => void;
  onHeadingDrag: CanvasDragHandler;
  onHeadingDragEnd: CanvasDragHandler;
}) {
  // Render inactive paths dimmed while keeping all geometry available for snapping.
  const controlPoints = built.controls.flatMap(toCanvasPoint(scale));
  const curvePoints = built.curve.flatMap(toCanvasPoint(scale));

  return (
    <Group
      opacity={active ? 1 : 0.35}
    >
      <Line
        points={controlPoints}
        stroke={editorColors.ghostFill}
        strokeWidth={1}
        dash={[5, 7]}
        opacity={0.55}
      />
      {built.spline ? (
        <>
          <Line
            points={curvePoints}
            stroke={
              selectedPath
                ? editorColors.selected
                : active
                  ? editorColors.canvasPath
                  : editorColors.canvasPathInactive
            }
            strokeWidth={selectedPath || active ? 3 : 2}
            lineCap="round"
            lineJoin="round"
            shadowColor={selectedPath ? editorColors.selected : editorColors.canvasPath}
            shadowBlur={selectedPath || active ? 8 : 0}
            shadowOpacity={0.45}
          />
          {selectedPath ? (
            <Line
              points={curvePoints}
              stroke={editorColors.transparent}
              strokeWidth={22}
              lineCap="round"
              lineJoin="round"
              draggable
              onDragStart={(event) => {
                event.cancelBubble = true;
                onBeginPathDrag(built.path.id, event);
              }}
              onDragMove={(event) => {
                event.cancelBubble = true;
                onPathDrag(built.path.id, event);
              }}
              onDragEnd={(event) => {
                event.cancelBubble = true;
                onPathDragEnd(built.path.id, event);
              }}
            />
          ) : null}
        </>
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
              onDragStart={(event) => {
                event.cancelBubble = true;
                onBeginDrag(built.path.id, point.sourcePoseId);
              }}
              onDragMove={(event) => {
                event.cancelBubble = true;
                onGhostDrag(built.path.id, point.sourcePoseId, event);
              }}
              onDragEnd={(event) => {
                event.cancelBubble = true;
                onGhostDragEnd(built.path.id, point.sourcePoseId, event);
              }}
            />
          );
        })}

      {built.path.actions.map((action) =>
        action.type === "distanceCallback" && built.segment ? (
          <CallbackMarker
            key={action.id}
            action={action}
            segment={built.segment}
            scale={scale}
            selected={action.id === selectedActionId}
            onSelect={() => onSelectAction(action.id)}
            onDelete={() => onCallbackDelete(built.path.id, action.id)}
            onDragStart={() => onBeginDrag(built.path.id)}
            onDrag={(event) => onCallbackDrag(built.path.id, action.id, event)}
            onDragEnd={(event) => onCallbackDragEnd(built.path.id, action.id, event)}
          />
        ) : null,
      )}

      {built.path.poses.map((pose, index) => (
        <PoseNode
          key={pose.id}
          pathId={built.path.id}
          pose={pose}
          active={active}
          selected={active && pose.id === selectedPoseId}
          headingEligible={isEndpoint(index, built.path.poses.length)}
          headingPending={pose.id === pendingHeadingPoseId}
          showPoseLabels={showPoseLabels}
          scale={scale}
          onSelectPose={onSelectPose}
          onBeginDrag={onBeginDrag}
          onPoseDrag={onPoseDrag}
          onPoseDragEnd={onPoseDragEnd}
          onHeadingDrag={onHeadingDrag}
          onHeadingDragEnd={onHeadingDragEnd}
        />
      ))}
    </Group>
  );
}

function PoseNode({
  pathId,
  pose,
  active,
  selected,
  headingEligible,
  headingPending,
  showPoseLabels,
  scale,
  onSelectPose,
  onBeginDrag,
  onPoseDrag,
  onPoseDragEnd,
  onHeadingDrag,
  onHeadingDragEnd,
}: {
  pathId: string;
  pose: EditorPose;
  active: boolean;
  selected: boolean;
  headingEligible: boolean;
  headingPending: boolean;
  showPoseLabels: boolean;
  scale: number;
  onSelectPose: (poseId: string) => void;
  onBeginDrag: (pathId?: string, poseId?: string) => void;
  onPoseDrag: CanvasDragHandler;
  onPoseDragEnd: CanvasDragHandler;
  onHeadingDrag: CanvasDragHandler;
  onHeadingDragEnd: CanvasDragHandler;
}) {
  const canvasPoint = toCanvas(pose, scale);
  const headingDeg = pose.headingDeg ?? 0;
  const headingLength = 24;
  const headingRadians = headingDeg * Math.PI / 180;
  const headingEnd = {
    x: Math.cos(headingRadians) * headingLength,
    y: -Math.sin(headingRadians) * headingLength,
  };

  return (
    <Group
      x={canvasPoint.x}
      y={canvasPoint.y}
      draggable={active}
      dragBoundFunc={(position) => clampCanvasPosePosition(position, scale)}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelectPose(pose.id);
      }}
      onTap={() => onSelectPose(pose.id)}
      onDragStart={(event) => {
        event.cancelBubble = true;
        onBeginDrag(pathId, pose.id);
      }}
      onDragMove={(event) => {
        event.cancelBubble = true;
        onPoseDrag(pathId, pose.id, event);
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        onPoseDragEnd(pathId, pose.id, event);
      }}
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
      {selected && headingEligible ? (
        <Group>
          <Line
            points={[0, 0, headingEnd.x, headingEnd.y]}
            stroke={headingPending ? editorColors.selected : editorColors.ghostStroke}
            strokeWidth={3}
            lineCap="round"
          />
          <Line
            points={[
              headingEnd.x,
              headingEnd.y,
              headingEnd.x - Math.cos(headingRadians - 0.45) * 8,
              headingEnd.y + Math.sin(headingRadians - 0.45) * 8,
              headingEnd.x,
              headingEnd.y,
              headingEnd.x - Math.cos(headingRadians + 0.45) * 8,
              headingEnd.y + Math.sin(headingRadians + 0.45) * 8,
            ]}
            stroke={headingPending ? editorColors.selected : editorColors.ghostStroke}
            strokeWidth={3}
            lineCap="round"
            lineJoin="round"
          />
          <Circle
            x={headingEnd.x}
            y={headingEnd.y}
            radius={6}
            fill={editorColors.transparent}
            stroke={headingPending ? editorColors.selected : editorColors.ghostStroke}
            strokeWidth={2}
            draggable
            onDragStart={(event) => {
              event.cancelBubble = true;
              onBeginDrag(pathId, pose.id);
            }}
            onDragMove={(event) => {
              event.cancelBubble = true;
              onHeadingDrag(pathId, pose.id, event);
              event.target.position(headingEnd);
            }}
            onDragEnd={(event) => {
              event.cancelBubble = true;
              onHeadingDragEnd(pathId, pose.id, event);
              event.target.position(headingEnd);
            }}
          />
        </Group>
      ) : null}
    </Group>
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
  selected,
  onSelect,
  onDelete,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  action: Extract<PathAction, { type: "distanceCallback" }>;
  segment: PathSegment;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
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
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onDblClick={(event) => {
        event.cancelBubble = true;
        onDelete();
      }}
      onDblTap={(event) => {
        event.cancelBubble = true;
        onDelete();
      }}
      onDragStart={(event) => {
        event.cancelBubble = true;
        onDragStart();
      }}
      onDragMove={(event) => {
        event.cancelBubble = true;
        onDrag(event);
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        onDragEnd(event);
      }}
    >
      <Circle
        radius={CALLBACK_RADIUS}
        fill={editorColors.callback}
        stroke={selected ? editorColors.selected : editorColors.callbackStroke}
        strokeWidth={selected ? 3 : 1.5}
      />
    </Group>
  );
}

function TurnNode({
  turn,
  selected,
  scale,
  onSelect,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  turn: EditorTurn;
  selected: boolean;
  scale: number;
  onSelect: () => void;
  onDragStart: () => void;
  onDrag: (event: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (event: KonvaEventObject<DragEvent>) => void;
}) {
  const center = toCanvas(turn, scale);
  const diffDeg = shortestTurnDeg(turn.startHeadingDeg, turn.targetHeadingDeg);
  const clockwise = diffDeg < 0;
  const radius = 15 + Math.min(34, Math.abs(diffDeg) * 0.16);
  const color = selected ? editorColors.selected : editorColors.callback;
  const arcPoints = buildTurnArcPoints(turn.startHeadingDeg, diffDeg, radius);
  const end = arcPoints.slice(-2);
  const previous = arcPoints.slice(-4, -2);
  const tangent = { x: end[0] - previous[0], y: end[1] - previous[1] };
  const tangentAngle = Math.atan2(tangent.y, tangent.x);

  return (
    <Group
      x={center.x}
      y={center.y}
      draggable
      dragBoundFunc={(position) => clampCanvasPosePosition(position, scale)}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onDragStart={(event) => {
        event.cancelBubble = true;
        onDragStart();
      }}
      onDragMove={(event) => {
        event.cancelBubble = true;
        onDrag(event);
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        onDragEnd(event);
      }}
    >
      <Circle radius={5} fill={editorColors.panel} stroke={color} strokeWidth={selected ? 3 : 2} />
      <Line
        points={arcPoints}
        stroke={color}
        strokeWidth={3}
        lineCap="round"
        lineJoin="round"
        dash={clockwise ? [7, 4] : undefined}
      />
      <Line
        points={[
          end[0],
          end[1],
          end[0] - Math.cos(tangentAngle - 0.55) * 9,
          end[1] - Math.sin(tangentAngle - 0.55) * 9,
          end[0],
          end[1],
          end[0] - Math.cos(tangentAngle + 0.55) * 9,
          end[1] - Math.sin(tangentAngle + 0.55) * 9,
        ]}
        stroke={color}
        strokeWidth={3}
        lineCap="round"
        lineJoin="round"
      />
    </Group>
  );
}

function buildTurnArcPoints(startDeg: number, diffDeg: number, radius: number): number[] {
  const steps = Math.max(6, Math.ceil(Math.abs(diffDeg) / 18));
  const points: number[] = [];
  for (let index = 0; index <= steps; index++) {
    const angleDeg = startDeg + (diffDeg * index) / steps;
    const angleRad = (angleDeg * Math.PI) / 180;
    points.push(Math.cos(angleRad) * radius, -Math.sin(angleRad) * radius);
  }
  return points;
}

function shortestTurnDeg(startDeg: number, targetDeg: number): number {
  let diff = ((targetDeg - startDeg + 180) % 360) - 180;
  if (diff < -180) diff += 360;
  return diff;
}
